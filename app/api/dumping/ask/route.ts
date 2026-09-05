import { NextResponse, type NextRequest } from "next/server"
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

  // 클라이언트가 중단하면 Gemini 호출도 같이 끊는다 — 화면에서 중단해도 토큰 과금이 이어지지 않게
  const upstreamAbort = new AbortController()
  const timeout = setTimeout(() => upstreamAbort.abort(), UPSTREAM_TIMEOUT_MS)
  request.signal.addEventListener("abort", () => upstreamAbort.abort(), { once: true })

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
        signal: upstreamAbort.signal,
      },
    )
  } catch (e) {
    clearTimeout(timeout)
    console.error("[dumping/ask] Gemini fetch failed:", e instanceof Error ? e.message : e)
    return NextResponse.json({ error: "답변 생성에 실패했습니다. 잠시 뒤 다시 시도해주세요." }, { status: 502 })
  }

  if (!upstream.ok || !upstream.body) {
    clearTimeout(timeout)
    const detail = await upstream.text().catch(() => "")
    console.error("[dumping/ask] Gemini error:", upstream.status, detail.slice(0, 300))
    return NextResponse.json({ error: "답변 생성에 실패했습니다. 잠시 뒤 다시 시도해주세요." }, { status: 502 })
  }

  // Gemini SSE → 평문 텍스트 청크 스트림으로 변환
  const decoder = new TextDecoder()
  const encoder = new TextEncoder()
  let buffer = ""
  let reader: ReadableStreamDefaultReader<Uint8Array> | null = null
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      reader = upstream.body!.getReader()
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
      } catch (e) {
        // 중단·타임아웃은 정상 종료 경로 — 그 외만 기록
        if (!upstreamAbort.signal.aborted) console.error("[dumping/ask] stream failed:", e instanceof Error ? e.message : e)
      } finally {
        clearTimeout(timeout)
        try {
          controller.close()
        } catch {
          // 이미 닫힘·오류 상태
        }
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
