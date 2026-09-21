import { NextResponse, type NextRequest } from "next/server"
import { ASK_ACCEPT, ASK_DONE, ASK_ERR } from "@/lib/dumping/answer-parts"
import { createHash } from "crypto"
import { verifyRequest } from "@/lib/dumping/auth"
import { buildSystemPrompt } from "@/lib/dumping/context"
import { checkRateLimit, getClientIp } from "@/lib/utils/rate-limiter"
import { normalizeHistory, type Turn } from "@/lib/dumping/history"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60

const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-3.6-flash"
const MAX_QUESTION = 500
const MAX_HISTORY = 8 // user+model 합산 턴 수 상한
const UPSTREAM_TIMEOUT_MS = 55_000
// 13라운드 속도. thinking 수준은 env로(비우면 모델 기본). 실측(2026-09-16, 프롬프트 3.3만 토큰): 기본 첫 토큰 10.5s(사고 1,652토큰) ·
// low 6.2s(813) · minimal 2.4s(0). 평가셋 11문항 게이트로 품질을 확인한 값만 기본으로 둔다
const THINKING_LEVEL = process.env.GEMINI_THINKING_LEVEL ?? ""
// 시스템 프롬프트(고정, 3.3만 토큰)는 Gemini 컨텍스트 캐시에 올려 두고 이름만 보낸다. 입력 토큰 과금과 프리필이 준다.
// 인스턴스마다 만들지 않도록 displayName(프롬프트 해시)으로 기존 캐시를 찾아 재사용. 실패하면 인라인으로 보낸다(기능 손실 없음)
const CACHE_TTL_S = 3600
const FORMAT_REMINDER =
  "(답 형식을 다시 확인: 1부는 존댓말 평문 3~4문장, 각 문장 55자 이하, 전체 100~140자, 첫 문장이 결론. 그다음 줄에 [부연]. 2부는 \"- 수치: \", \"- 근거: \", \"- 한계: \"(정책 질문이면 \"- 다음 행동: \") 불릿, 각 45자 이하.)"
let cacheState: { name: string; expiresAt: number; hash: string } | null = null

async function cachedPromptName(apiKey: string, sys: string): Promise<string | null> {
  if (process.env.GEMINI_PROMPT_CACHE === "off") return null
  const hash = createHash("sha1").update(`${GEMINI_MODEL}\n${sys}`).digest("hex").slice(0, 12)
  const displayName = `dumping-ask-${hash}`
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
      console.error("[dumping/ask] prompt cache create failed:", cr.status, (await cr.text()).slice(0, 200))
      return null
    }
    const cj = (await cr.json()) as { name: string; expireTime?: string }
    cacheState = { name: cj.name, expiresAt: cj.expireTime ? Date.parse(cj.expireTime) : Date.now() + CACHE_TTL_S * 1000, hash }
    return cj.name
  } catch (e) {
    console.error("[dumping/ask] prompt cache error:", e instanceof Error ? e.message : e)
    return null
  }
}
export async function POST(request: NextRequest) {
  if (!verifyRequest(request)) {
    return NextResponse.json({ error: "인증이 필요합니다" }, { status: 401 })
  }
  const { allowed } = checkRateLimit(getClientIp(request.headers), "dumpingAsk")
  if (!allowed) {
    return NextResponse.json(
      { error: "질문이 너무 잦습니다. 1분 뒤 다시 시도해주세요." },
      { status: 429, headers: { "Retry-After": "60" } },
    )
  }

  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: "서버에 LLM 키가 설정되지 않았습니다" }, { status: 500 })
  }

  let question = ""
  let history: Turn[] = []
  try {
    const body = await request.json()
    question = typeof body?.question === "string" ? body.question.trim() : ""
    if (Array.isArray(body?.history)) {
      history = normalizeHistory(
        body.history
          .filter(
            (t: Turn) =>
              (t?.role === "user" || t?.role === "model") && typeof t?.text === "string",
          )
          .slice(-MAX_HISTORY)
          .map((t: Turn) => ({ role: t.role, text: t.text.slice(0, 4000) })),
      )
    }
  } catch {
    // fallthrough — 아래 빈 질문 검증에 걸린다
  }
  if (!question || question.length > MAX_QUESTION) {
    return NextResponse.json({ error: `질문은 1~${MAX_QUESTION}자여야 합니다` }, { status: 400 })
  }

  // 13라운드: 사고 수준을 낮추면(low·minimal) 1부가 규격(3~4문장·140자)을 넘기는 답이 늘었다(평가셋 실측: 형식 이상 2→9건).
  // 규칙은 시스템 프롬프트 앞쪽에 있어 긴 프롬프트 끝에서 잊힌다. 질문 뒤에 짧은 형식 리마인더를 붙여 마지막에 다시 읽게 한다(화면엔 안 보임)
  const contents = [
    ...history.map((t) => ({ role: t.role, parts: [{ text: t.text }] })),
    { role: "user", parts: [{ text: `${question}\n\n${FORMAT_REMINDER}` }] },
  ]

  // 클라이언트가 중단하면 Gemini 호출도 같이 끊는다 — 화면에서 중단해도 토큰 과금이 이어지지 않게
  const upstreamAbort = new AbortController()
  let timedOut = false
  const timeout = setTimeout(() => {
    timedOut = true
    upstreamAbort.abort()
  }, UPSTREAM_TIMEOUT_MS)
  request.signal.addEventListener("abort", () => upstreamAbort.abort(), { once: true })

  // 12라운드: 응답 머리를 모델 연결 뒤에 보내면 화면이 "보내는 중"에서 곧바로 답으로 건너뛴다(사고형 모델은 첫 글자까지 5~12초).
  // 스트림을 먼저 열어 접수 표시(ASK_ACCEPT)를 즉시 보내고 그 뒤에 모델을 부른다. 화면은 접수 표시를 받으면 "모델이 생각하는 중"으로 바꾼다.
  // 그래서 상태 코드로는 오류를 못 알리므로 모델 호출 실패는 스트림 안 ASK_ERR 표시로 보낸다.
  // 독립 리뷰 F1: 본문을 보내다 끊기면(상류 단절·55초 타임아웃·finishReason≠STOP) 그것도 ASK_ERR로, 끝까지 왔을 때만 ASK_DONE으로 닫는다.
  // 표식 없이 닫힌 스트림은 화면이 끊긴 답으로 표시한다. 클라이언트가 중단한 경우엔 아무것도 안 보낸다(이미 닫혀 있다)
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
      // 사고형 모델은 사고 토큰이 출력 한도를 같이 쓴다 — 2048이면 프롬프트가 커진 뒤 답이 몇 문장 만에 잘렸다(2026-09-05 실측: 첫 바이트 12s 뒤 382B에서 종료)
      // 10라운드: 결재 자리에서 같은 질문에 같은 결론이 나오게 온도를 낮춘다(0.3에서 결정 질문의 첫 제안이 실행마다 바뀌었다)
      const generationConfig = {
        temperature: 0.15,
        maxOutputTokens: 8192,
        ...(THINKING_LEVEL ? { thinkingConfig: { thinkingLevel: THINKING_LEVEL } } : {}),
      }
      const call = (useCache: boolean) =>
        fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:streamGenerateContent?alt=sse`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
          body: JSON.stringify({
            ...(useCache && cacheName ? { cachedContent: cacheName } : { systemInstruction: { parts: [{ text: sys }] } }),
            contents,
            generationConfig,
          }),
          signal: upstreamAbort.signal,
        })
      let upstream: Response
      try {
        upstream = await call(true)
        // 캐시가 방금 만료됐거나 지워졌으면(4xx) 인라인으로 한 번 더
        if (cacheName && !upstream.ok && upstream.status >= 400 && upstream.status < 500) {
          console.error("[dumping/ask] cached call failed, retry inline:", upstream.status)
          cacheState = null
          upstream = await call(false)
        }
      } catch (e) {
        if (!upstreamAbort.signal.aborted) console.error("[dumping/ask] Gemini fetch failed:", e instanceof Error ? e.message : e)
        fail(controller, "답변 생성에 실패했습니다. 잠시 뒤 다시 시도해주세요.")
        return
      }
      if (!upstream.ok || !upstream.body) {
        const detail = await upstream.text().catch(() => "")
        console.error("[dumping/ask] Gemini error:", upstream.status, detail.slice(0, 300))
        fail(controller, "답변 생성에 실패했습니다. 잠시 뒤 다시 시도해주세요.")
        return
      }
      reader = upstream.body.getReader()
      let completed = false // 상류가 끝까지 왔는지
      let finish = "" // 모델이 준 종료 사유. STOP이 아니면(MAX_TOKENS·SAFETY) 답이 잘린 것
      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) {
            completed = true
            break
          }
          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split("\n")
          buffer = lines.pop() ?? ""
          for (const line of lines) {
            if (!line.startsWith("data: ")) continue
            const payload = line.slice(6).trim()
            if (!payload || payload === "[DONE]") continue
            try {
              const json = JSON.parse(payload)
              const text = json?.candidates?.[0]?.content?.parts
                ?.map((p: { text?: string }) => p.text ?? "")
                .join("")
              if (text) controller.enqueue(encoder.encode(text))
              if (typeof json?.candidates?.[0]?.finishReason === "string") finish = json.candidates[0].finishReason
            } catch {
              // 불완전 청크 — 무시
            }
          }
        }
      } catch (e) {
        // 중단·타임아웃은 정상 종료 경로 — 그 외만 기록
        if (!upstreamAbort.signal.aborted) console.error("[dumping/ask] stream failed:", e instanceof Error ? e.message : e)
      }
      clearTimeout(timeout)
      try {
        if (completed && (!finish || finish === "STOP")) controller.enqueue(encoder.encode(ASK_DONE))
        else if (!request.signal.aborted) {
          const why = timedOut ? "답변 시간이 초과됐습니다" : completed ? "답이 끝까지 오지 않았습니다" : "답변이 중간에 끊겼습니다"
          if (completed) console.error("[dumping/ask] finishReason:", finish)
          controller.enqueue(encoder.encode(`${ASK_ERR}${why}. 다시 시도해 주세요.`))
        }
        controller.close()
      } catch {
        // 이미 닫힘·오류 상태
      }
    },
    cancel() {
      // reader가 잠근 body를 직접 cancel하면 던진다 — reader 쪽으로 취소하고 fetch도 끊는다
      upstreamAbort.abort()
      reader?.cancel().catch(() => {})
    },
  })

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Accel-Buffering": "no",
    },
  })
}
