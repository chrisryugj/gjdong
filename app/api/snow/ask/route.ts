import { NextResponse, type NextRequest } from "next/server"
import { createHash } from "crypto"
import { ASK_ACCEPT, ASK_ERR } from "@/lib/dumping/answer-parts"
import { normalizeHistory, type Turn } from "@/lib/dumping/history"
import { buildSystemPrompt } from "@/lib/snow/context"
import { checkRateLimit, getClientIp } from "@/lib/utils/rate-limiter"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60

// /snow 물어보기(6라운드). /dumping ask 라우트 규약 그대로(스트림 먼저 열고 접수 표시 › 모델 호출, 프롬프트 캐시, 클라이언트 중단 시 상류도 중단).
// 차이: 인증 없음(공개 페이지) → IP당 분당 5회(rate-limiter snowAsk) + 인스턴스당 하루 상한(DAILY_CAP. 서버리스라 인스턴스마다 따로 세는 상한선이다). SNOW_ASK=off면 모델을 부르지 않는다(준비된 답만)
// 2026-09-23(dumping 22라운드와 같이): 3.6-flash 기본 사고는 답이 15초씩 걸렸다. 3.8-flash 사고 low로 첫 글자 중앙 1.7초.
// 규칙 겨냥 15문항(결정 질문 첫 문장·비용 개략·시 관리 구간·효과 계산·위험 단정·급경사 추정) 실측으로 형식 리마인더만으로 규칙이 지켜졌다.
// dumping식 내용 리마인더를 붙이면 "시 관리 구간은 구가 뭘 하나"의 첫 문장까지 결정 문장으로 끌려가 붙이지 않는다
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-3.8-flash"
const MAX_QUESTION = 500
const MAX_HISTORY = 8
const UPSTREAM_TIMEOUT_MS = 55_000
const THINKING_LEVEL = process.env.GEMINI_THINKING_LEVEL ?? "low"
const CACHE_TTL_S = 3600
const DAILY_CAP = Number(process.env.SNOW_ASK_DAILY_CAP ?? 200)
const FORMAT_REMINDER =
  "(답 형식을 다시 확인: 1부는 합니다체 평문 3~4문장, 각 문장 55자 이하, 전체 100~140자, 첫 문장이 결론. 그다음 줄에 [부연]. 2부는 \"- 수치: \", \"- 근거: \", \"- 한계: \"(결정·조치 질문이면 \"- 다음 행동: \") 불릿, 각 45자 이하. \"수 있습니다\"·화살표·줄표 금지.)"
let cacheState: { name: string; expiresAt: number; hash: string } | null = null
let daily = { day: "", n: 0 }

function underDailyCap(): boolean {
  const day = new Date().toISOString().slice(0, 10)
  if (daily.day !== day) daily = { day, n: 0 }
  if (daily.n >= DAILY_CAP) return false
  daily.n += 1
  return true
}

async function cachedPromptName(apiKey: string, sys: string): Promise<string | null> {
  if (process.env.GEMINI_PROMPT_CACHE === "off") return null
  const hash = createHash("sha1").update(`${GEMINI_MODEL}\n${sys}`).digest("hex").slice(0, 12)
  const displayName = `snow-ask-${hash}`
  if (cacheState?.hash === hash && Date.now() < cacheState.expiresAt - 60_000) return cacheState.name
  const H = { "Content-Type": "application/json", "x-goog-api-key": apiKey }
  try {
    const ls = await fetch("https://generativelanguage.googleapis.com/v1beta/cachedContents?pageSize=50", { headers: H, signal: AbortSignal.timeout(4_000) })
    if (ls.ok) {
      const j = (await ls.json()) as { cachedContents?: { name: string; displayName?: string; expireTime?: string }[] }
      const hit = (j.cachedContents ?? []).find((c) => c.displayName === displayName && c.expireTime && Date.parse(c.expireTime) > Date.now() + 60_000)
      if (hit) {
        cacheState = { name: hit.name, expiresAt: Date.parse(hit.expireTime!), hash }
        return hit.name
      }
    }
    const cr = await fetch("https://generativelanguage.googleapis.com/v1beta/cachedContents", {
      method: "POST",
      headers: H,
      body: JSON.stringify({ model: `models/${GEMINI_MODEL}`, displayName, systemInstruction: { parts: [{ text: sys }] }, ttl: `${CACHE_TTL_S}s` }),
      signal: AbortSignal.timeout(8_000),
    })
    if (!cr.ok) {
      console.error("[snow/ask] prompt cache create failed:", cr.status, (await cr.text()).slice(0, 200))
      return null
    }
    const cj = (await cr.json()) as { name: string; expireTime?: string }
    cacheState = { name: cj.name, expiresAt: cj.expireTime ? Date.parse(cj.expireTime) : Date.now() + CACHE_TTL_S * 1000, hash }
    return cj.name
  } catch (e) {
    console.error("[snow/ask] prompt cache error:", e instanceof Error ? e.message : e)
    return null
  }
}

export async function POST(request: NextRequest) {
  if (process.env.SNOW_ASK === "off") return NextResponse.json({ error: "지금은 준비된 답만 제공합니다" }, { status: 503 })
  const { allowed } = checkRateLimit(getClientIp(request.headers), "snowAsk")
  if (!allowed) return NextResponse.json({ error: "질문이 너무 잦습니다. 1분 뒤 다시 시도해 주세요." }, { status: 429, headers: { "Retry-After": "60" } })
  if (!underDailyCap()) return NextResponse.json({ error: "오늘 질문 한도에 닿았습니다. 준비된 답을 참고해 주세요." }, { status: 429 })
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) return NextResponse.json({ error: "서버에 LLM 키가 설정되지 않았습니다" }, { status: 500 })

  let question = ""
  let history: Turn[] = []
  try {
    const body = await request.json()
    question = typeof body?.question === "string" ? body.question.trim() : ""
    if (Array.isArray(body?.history)) {
      history = normalizeHistory(
        body.history
          .filter((t: Turn) => (t?.role === "user" || t?.role === "model") && typeof t?.text === "string")
          .slice(-MAX_HISTORY)
          .map((t: Turn) => ({ role: t.role, text: t.text.slice(0, 4000) })),
      )
    }
  } catch {
    // 아래 빈 질문 검증에 걸린다
  }
  if (!question || question.length > MAX_QUESTION) return NextResponse.json({ error: `질문은 1~${MAX_QUESTION}자여야 합니다` }, { status: 400 })

  const contents = [...history.map((t) => ({ role: t.role, parts: [{ text: t.text }] })), { role: "user", parts: [{ text: `${question}\n\n${FORMAT_REMINDER}` }] }]
  const upstreamAbort = new AbortController()
  const timeout = setTimeout(() => upstreamAbort.abort(), UPSTREAM_TIMEOUT_MS)
  request.signal.addEventListener("abort", () => upstreamAbort.abort(), { once: true })

  const decoder = new TextDecoder()
  const encoder = new TextEncoder()
  let buffer = ""
  let reader: ReadableStreamDefaultReader<Uint8Array> | null = null
  const fail = (controller: ReadableStreamDefaultController<Uint8Array>, msg: string) => {
    clearTimeout(timeout)
    controller.enqueue(encoder.encode(ASK_ERR + msg))
    controller.close()
  }
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      controller.enqueue(encoder.encode(ASK_ACCEPT))
      const sys = buildSystemPrompt()
      const cacheName = await cachedPromptName(apiKey, sys)
      const generationConfig = { temperature: 0.15, maxOutputTokens: 8192, ...(THINKING_LEVEL ? { thinkingConfig: { thinkingLevel: THINKING_LEVEL } } : {}) }
      const call = (useCache: boolean) =>
        fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:streamGenerateContent?alt=sse`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
          body: JSON.stringify({ ...(useCache && cacheName ? { cachedContent: cacheName } : { systemInstruction: { parts: [{ text: sys }] } }), contents, generationConfig }),
          signal: upstreamAbort.signal,
        })
      let upstream: Response
      try {
        upstream = await call(true)
        if (cacheName && !upstream.ok && upstream.status >= 400 && upstream.status < 500) {
          console.error("[snow/ask] cached call failed, retry inline:", upstream.status)
          cacheState = null
          upstream = await call(false)
        }
      } catch (e) {
        if (!upstreamAbort.signal.aborted) console.error("[snow/ask] Gemini fetch failed:", e instanceof Error ? e.message : e)
        fail(controller, "답변 생성에 실패했습니다. 잠시 뒤 다시 시도해 주세요.")
        return
      }
      if (!upstream.ok || !upstream.body) {
        const detail = await upstream.text().catch(() => "")
        console.error("[snow/ask] Gemini error:", upstream.status, detail.slice(0, 300))
        fail(controller, "답변 생성에 실패했습니다. 잠시 뒤 다시 시도해 주세요.")
        return
      }
      reader = upstream.body.getReader()
      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split("\n")
          buffer = lines.pop() ?? ""
          for (const line of lines) {
            if (!line.startsWith("data: ")) continue
            const payload = line.slice(6).trim()
            if (!payload || payload === "[DONE]") continue
            try {
              const json = JSON.parse(payload)
              const text = json?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? "").join("")
              if (text) controller.enqueue(encoder.encode(text))
            } catch {
              // 불완전 청크
            }
          }
        }
      } catch (e) {
        if (!upstreamAbort.signal.aborted) console.error("[snow/ask] stream failed:", e instanceof Error ? e.message : e)
      } finally {
        clearTimeout(timeout)
        try {
          controller.close()
        } catch {
          // 이미 닫힘
        }
      }
    },
    cancel() {
      upstreamAbort.abort()
      reader?.cancel().catch(() => {})
    },
  })
  return new Response(stream, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store", "X-Accel-Buffering": "no" } })
}
