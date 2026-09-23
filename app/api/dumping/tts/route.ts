import { NextResponse, type NextRequest } from "next/server"
import { verifyRequest } from "@/lib/dumping/auth"
import { checkRateLimit, getClientIp } from "@/lib/utils/rate-limiter"
import { isVoice } from "@/lib/dumping/voices"

// 질의응답 음성 합성. 문장 하나를 받아 Gemini TTS 스트림의 PCM(16bit·24kHz·모노)을 그대로 흘려보낸다.
// 문장 단위로 부르는 이유: 세 문장 한 번에 보내면 첫 소리까지 11초, 한 문장 스트리밍은 1초 안팎(2026-09-15 실측).
// 브라우저 speechSynthesis를 안 쓰는 이유: 크롬 윈도 기본 한국어 음성이 기계음이라 시연에 못 쓴다.

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 30

const TTS_MODEL = process.env.GEMINI_TTS_MODEL || "gemini-3.1-flash-tts-preview"
const TTS_VOICE = process.env.GEMINI_TTS_VOICE || "Kore"
const MAX_TEXT = 400
const UPSTREAM_TIMEOUT_MS = 25_000
// 22라운드(2026-09-23, "읽어 주는 것도 빨랐으면"): "차분하고"가 말을 늘어지게 했다. 같은 두 문장 실측 4.3~5.0음절/초 → "조금 빠른 속도로" 5.5~6.3음절/초
// (9.6초 분량이 6.6초), 첫 소리 1.1초 → 0.8초. 생성이 재생보다 두 배 빨라 문장 안에서 끊기지 않는다. 재생 속도(playbackRate)로 올리면 음높이가 같이 올라 안 쓴다
const STYLE = "또렷한 보고 톤으로, 평소보다 조금 빠른 속도로 자연스럽게 읽어라. 숫자는 한국어로 읽는다: "

export async function POST(request: NextRequest) {
  if (!verifyRequest(request)) {
    return NextResponse.json({ error: "인증이 필요합니다" }, { status: 401 })
  }
  const { allowed } = checkRateLimit(getClientIp(request.headers), "dumpingTts")
  if (!allowed) {
    return NextResponse.json({ error: "음성 요청이 너무 잦습니다" }, { status: 429, headers: { "Retry-After": "60" } })
  }
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) return NextResponse.json({ error: "서버에 LLM 키가 설정되지 않았습니다" }, { status: 500 })

  let text = ""
  let voice = TTS_VOICE
  try {
    const body = await request.json()
    text = typeof body?.text === "string" ? body.text.trim() : ""
    if (isVoice(body?.voice)) voice = body.voice // 화면에서 고른 목소리. 목록에 없는 값은 기본으로
  } catch {
    // 아래 빈 문장 검증에 걸린다
  }
  if (!text || text.length > MAX_TEXT) {
    return NextResponse.json({ error: `문장은 1~${MAX_TEXT}자여야 합니다` }, { status: 400 })
  }

  const upstreamAbort = new AbortController()
  const timeout = setTimeout(() => upstreamAbort.abort(), UPSTREAM_TIMEOUT_MS)
  request.signal.addEventListener("abort", () => upstreamAbort.abort(), { once: true })

  let upstream: Response
  try {
    upstream = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${TTS_MODEL}:streamGenerateContent?alt=sse`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
        body: JSON.stringify({
          contents: [{ parts: [{ text: STYLE + text }] }],
          generationConfig: {
            responseModalities: ["AUDIO"],
            speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } },
          },
        }),
        signal: upstreamAbort.signal,
      },
    )
  } catch (e) {
    clearTimeout(timeout)
    console.error("[dumping/tts] fetch failed:", e instanceof Error ? e.message : e)
    return NextResponse.json({ error: "음성 합성에 실패했습니다" }, { status: 502 })
  }
  if (!upstream.ok || !upstream.body) {
    clearTimeout(timeout)
    const detail = await upstream.text().catch(() => "")
    console.error("[dumping/tts] upstream error:", upstream.status, detail.slice(0, 300))
    return NextResponse.json({ error: "음성 합성에 실패했습니다" }, { status: 502 })
  }

  // SSE 안의 base64 PCM 조각을 이진 스트림으로 푼다
  const decoder = new TextDecoder()
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
            try {
              const json = JSON.parse(line.slice(6))
              const parts = json?.candidates?.[0]?.content?.parts ?? []
              for (const p of parts) {
                const b64 = p?.inlineData?.data
                if (b64) controller.enqueue(new Uint8Array(Buffer.from(b64, "base64")))
              }
            } catch {
              // 불완전 청크
            }
          }
        }
      } catch (e) {
        if (!upstreamAbort.signal.aborted) console.error("[dumping/tts] stream failed:", e instanceof Error ? e.message : e)
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

  return new Response(stream, {
    headers: {
      "Content-Type": "audio/L16; rate=24000; channels=1",
      "Cache-Control": "no-store",
      "X-Accel-Buffering": "no",
    },
  })
}
