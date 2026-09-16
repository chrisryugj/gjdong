import { NextResponse, type NextRequest } from "next/server"
import { ASK_ACCEPT, ASK_ERR } from "@/lib/dumping/answer-parts"
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

  // 12라운드: 응답 머리를 모델 연결 뒤에 보내면 화면이 "보내는 중"에서 곧바로 답으로 건너뛴다(사고형 모델은 첫 글자까지 5~12초).
  // 스트림을 먼저 열어 접수 표시(ASK_ACCEPT)를 즉시 보내고 그 뒤에 모델을 부른다. 화면은 접수 표시를 받으면 "모델이 생각하는 중"으로 바꾼다.
  // 그래서 상태 코드로는 오류를 못 알리므로 모델 호출 실패는 스트림 안 ASK_ERR 표시로 보낸다
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
              // 사고형 모델은 사고 토큰이 출력 한도를 같이 쓴다 — 2048이면 프롬프트가 커진 뒤 답이 몇 문장 만에 잘렸다(2026-09-05 실측: 첫 바이트 12s 뒤 382B에서 종료)
              // 10라운드: 결재 자리에서 같은 질문에 같은 결론이 나오게 온도를 낮춘다(0.3에서 결정 질문의 첫 제안이 실행마다 바뀌었다)
              generationConfig: { temperature: 0.15, maxOutputTokens: 8192 },
            }),
            signal: upstreamAbort.signal,
          },
        )
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
