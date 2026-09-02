import { NextResponse, type NextRequest } from "next/server"
import { verifyRequest } from "@/lib/dumping/auth"
import { buildSystemPrompt } from "@/lib/dumping/context"
import { checkRateLimit, getClientIp } from "@/lib/utils/rate-limiter"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60

const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-3.6-flash"
const MAX_QUESTION = 500
const MAX_HISTORY = 8 // user+model 합산 턴 수 상한
const MAX_HISTORY_CHARS = 8_000 // 이력 전체 글자 상한 — 시스템 프롬프트가 이미 길어 입력 토큰을 묶는다
const UPSTREAM_TIMEOUT_MS = 55_000

type Turn = { role: "user" | "model"; text: string }

// Gemini는 user/model이 번갈아야 하고 첫 턴이 user여야 한다 — 클라이언트가 보낸 이력을 그 형태로 정리
function normalizeHistory(raw: Turn[]): Turn[] {
  const out: Turn[] = []
  for (const t of raw) {
    if (out.length === 0 && t.role !== "user") continue
    if (out.length > 0 && out[out.length - 1].role === t.role) {
      out[out.length - 1] = t // 같은 역할 연속이면 뒤엣것만
      continue
    }
    out.push(t)
  }
  // 마지막이 user면 이번 질문과 겹친다 — 떨어뜨림
  if (out.length && out[out.length - 1].role === "user") out.pop()
  let total = 0
  let cut = out.length
  for (let i = out.length - 1; i >= 0; i--) {
    total += out[i].text.length
    if (total > MAX_HISTORY_CHARS) {
      cut = i + 1
      break
    }
  }
  const trimmed = out.slice(cut)
  return trimmed[0]?.role === "model" ? trimmed.slice(1) : trimmed
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

  const contents = [
    ...history.map((t) => ({ role: t.role, parts: [{ text: t.text }] })),
    { role: "user", parts: [{ text: question }] },
  ]

  let upstream: Response
  try {
    upstream = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:streamGenerateContent?alt=sse`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: buildSystemPrompt() }] },
          contents,
          generationConfig: { temperature: 0.3, maxOutputTokens: 2048 },
        }),
        signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
      },
    )
  } catch (e) {
    console.error("[dumping/ask] Gemini fetch failed:", e instanceof Error ? e.message : e)
    return NextResponse.json({ error: "답변 생성에 실패했습니다. 잠시 뒤 다시 시도해주세요." }, { status: 502 })
  }

  if (!upstream.ok || !upstream.body) {
    const detail = await upstream.text().catch(() => "")
    console.error("[dumping/ask] Gemini error:", upstream.status, detail.slice(0, 300))
    return NextResponse.json({ error: "답변 생성에 실패했습니다. 잠시 뒤 다시 시도해주세요." }, { status: 502 })
  }

  // Gemini SSE → 평문 텍스트 청크 스트림으로 변환
  const decoder = new TextDecoder()
  const encoder = new TextEncoder()
  let buffer = ""
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const reader = upstream.body!.getReader()
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
              const text = json?.candidates?.[0]?.content?.parts
                ?.map((p: { text?: string }) => p.text ?? "")
                .join("")
              if (text) controller.enqueue(encoder.encode(text))
            } catch {
              // 불완전 청크 — 무시
            }
          }
        }
      } finally {
        controller.close()
        reader.releaseLock()
      }
    },
    cancel() {
      upstream.body?.cancel().catch(() => {})
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
