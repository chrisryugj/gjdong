"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { fixTranscript } from "@/lib/dumping/stt"
import { MIN_QUESTION, wakeStep, type WakeState } from "@/lib/dumping/wake"

// 음성 입출력. 질의응답 탭이 쓰지만 대시보드 어디서든 재사용할 수 있게 화면 의존 없이 둔다.
// 입력: 브라우저 Web Speech(ko-KR). 크롬·엣지에서만 되고 HTTPS 또는 localhost가 필요하다.
// 출력: /api/dumping/tts(Gemini TTS, 16bit 24kHz PCM 스트림)를 문장 단위로 받아 Web Audio로 이어 붙인다.
//       서버가 실패하면 그 문장만 브라우저 speechSynthesis로 대신 읽는다(개발 환경 무키 대비).

const SAMPLE_RATE = 24_000

interface Item {
  text: string
  chunks: Float32Array<ArrayBuffer>[]
  done: boolean
  failed: boolean
  scheduled: number // 스케줄한 청크 수
  abort: AbortController
}

class TtsPlayer {
  private ctx: AudioContext | null = null
  private items: Item[] = []
  private nextTime = 0
  private live = 0 // 아직 끝나지 않은 소스 노드 수
  private sources = new Set<AudioBufferSourceNode>()
  private tick: number | null = null
  onChange: (speaking: boolean) => void = () => {}

  // 사용자 제스처 안에서 불러야 오디오가 열린다(자동재생 정책)
  unlock() {
    if (!this.ctx) this.ctx = new AudioContext({ sampleRate: SAMPLE_RATE })
    if (this.ctx.state === "suspended") void this.ctx.resume()
  }

  get speaking() {
    return this.items.length > 0 || this.live > 0
  }

  enqueue(text: string) {
    const t = text.trim()
    if (!t) return
    this.unlock()
    const item: Item = { text: t, chunks: [], done: false, failed: false, scheduled: 0, abort: new AbortController() }
    this.items.push(item)
    this.onChange(true)
    void this.fetchItem(item)
    this.startTick()
  }

  stop() {
    for (const it of this.items) it.abort.abort()
    this.items = []
    this.live = 0
    this.nextTime = 0
    if (this.tick != null) {
      window.clearInterval(this.tick)
      this.tick = null
    }
    // 컨텍스트는 닫지 않는다. 사용자 제스처 밖에서 새로 만들면 자동재생 정책에 걸릴 수 있어 하나를 계속 쓴다
    for (const s of this.sources) {
      s.onended = null // stop() 뒤에 onended가 와서 live를 음수로 만들면 speaking이 영원히 true가 된다(호출어가 두 번째부터 무시되던 원인 하나)
      try {
        s.stop()
      } catch {
        // 아직 시작 전이거나 이미 끝난 노드
      }
    }
    this.sources.clear()
    this.utts.clear()
    if (typeof speechSynthesis !== "undefined") speechSynthesis.cancel()
    this.onChange(false)
  }

  private async fetchItem(item: Item) {
    try {
      const res = await fetch("/api/dumping/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: item.text }),
        signal: item.abort.signal,
      })
      if (!res.ok || !res.body) throw new Error(String(res.status))
      const reader = res.body.getReader()
      let carry: Uint8Array = new Uint8Array(0)
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        if (!value?.length) continue
        // 16비트 샘플이 청크 경계에서 반으로 갈릴 수 있어 홀수 바이트를 다음 청크로 넘긴다
        const merged = new Uint8Array(carry.length + value.length)
        merged.set(carry)
        merged.set(value, carry.length)
        const even = merged.length - (merged.length % 2)
        carry = merged.slice(even)
        const pcm = new Int16Array(merged.buffer.slice(0, even))
        const f32 = new Float32Array(pcm.length)
        for (let i = 0; i < pcm.length; i++) f32[i] = pcm[i] / 32768
        if (f32.length) item.chunks.push(f32)
      }
    } catch {
      if (!item.abort.signal.aborted) item.failed = true
    } finally {
      item.done = true
    }
  }

  private startTick() {
    if (this.tick != null) return
    this.tick = window.setInterval(() => this.schedule(), 40)
  }

  // 큐 맨 앞 항목의 도착한 청크를 시간축에 이어 붙인다. 앞 항목이 끝나야 다음 항목으로 넘어간다
  private schedule() {
    const ctx = this.ctx
    if (!ctx) return
    if (typeof speechSynthesis !== "undefined" && speechSynthesis.speaking) return // 대체 음성이 말하는 동안은 기다린다
    const head = this.items[0]
    if (!head) {
      if (this.live === 0) {
        if (this.tick != null) window.clearInterval(this.tick)
        this.tick = null
        this.onChange(false)
      }
      return
    }
    if (head.failed) {
      this.items.shift()
      this.fallback(head.text)
      return
    }
    const now = ctx.currentTime
    if (this.nextTime < now + 0.03) this.nextTime = now + 0.06 // 처음이거나 끊겼으면 살짝 뒤부터
    while (head.scheduled < head.chunks.length) {
      const data = head.chunks[head.scheduled++]
      const buf = ctx.createBuffer(1, data.length, SAMPLE_RATE)
      buf.copyToChannel(data, 0)
      const src = ctx.createBufferSource()
      src.buffer = buf
      src.connect(ctx.destination)
      this.live++
      this.sources.add(src)
      src.onended = () => {
        this.live--
        this.sources.delete(src)
      }
      src.start(this.nextTime)
      this.nextTime += buf.duration
    }
    if (head.done && head.scheduled >= head.chunks.length) {
      this.items.shift()
      this.nextTime += 0.12 // 문장 사이 숨
    }
  }

  private utts = new Set<SpeechSynthesisUtterance>() // 크롬은 참조가 끊긴 utterance의 onend를 안 주기도 한다. 끝날 때까지 붙잡아 둔다

  private fallback(text: string) {
    if (typeof speechSynthesis === "undefined") return
    const u = new SpeechSynthesisUtterance(text)
    u.lang = "ko-KR"
    const v = speechSynthesis.getVoices().find((x) => x.lang.startsWith("ko"))
    if (v) u.voice = v
    this.live++
    this.utts.add(u)
    const finish = () => {
      if (!this.utts.delete(u)) return // stop()이 이미 정리했으면 live를 다시 깎지 않는다
      this.live--
      window.clearTimeout(guard)
    }
    u.onend = u.onerror = finish
    // onend가 영영 안 오면 speaking이 굳는다. 읽는 데 걸릴 시간의 상한 뒤엔 끝난 것으로 본다
    const guard = window.setTimeout(finish, 2_000 + text.length * 180)
    speechSynthesis.speak(u)
  }
}

export function useSpeaker() {
  const playerRef = useRef<TtsPlayer | null>(null)
  const [speaking, setSpeaking] = useState(false)
  if (!playerRef.current && typeof window !== "undefined") {
    playerRef.current = new TtsPlayer()
    playerRef.current.onChange = setSpeaking
  }
  useEffect(() => () => playerRef.current?.stop(), [])
  const speak = useCallback((sentence: string) => playerRef.current?.enqueue(sentence), [])
  const stop = useCallback(() => playerRef.current?.stop(), [])
  const unlock = useCallback(() => playerRef.current?.unlock(), [])
  return { speaking, speak, stop, unlock }
}

type SRResults = ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }>
type SR = {
  lang: string
  interimResults: boolean
  continuous: boolean
  maxAlternatives: number
  start(): void
  stop(): void
  abort(): void
  onresult: ((e: { results: SRResults; resultIndex: number }) => void) | null
  onerror: ((e: { error: string }) => void) | null
  onend: (() => void) | null
}

function getRecognizer(): (new () => SR) | null {
  if (typeof window === "undefined") return null
  const w = window as unknown as { SpeechRecognition?: new () => SR; webkitSpeechRecognition?: new () => SR }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

const SR_ERRORS: Record<string, string> = {
  "not-allowed": "마이크 사용이 허용되지 않았습니다. 브라우저 주소창의 마이크 권한을 확인해 주세요.",
  "service-not-allowed": "이 브라우저에서는 음성 인식을 쓸 수 없습니다.",
  "no-speech": "말소리를 듣지 못했습니다. 다시 눌러 말씀해 주세요.",
  "audio-capture": "마이크를 찾지 못했습니다.",
  network: "음성 인식 서버에 연결하지 못했습니다.",
}

export function useSpeechInput(onFinal: (text: string) => void) {
  const [supported, setSupported] = useState(false)
  const [listening, setListening] = useState(false)
  const [interim, setInterim] = useState("")
  const [error, setError] = useState<string | null>(null)
  const recRef = useRef<SR | null>(null)
  const onFinalRef = useRef(onFinal)
  onFinalRef.current = onFinal
  const cancelledRef = useRef(false) // Esc 취소. abort 뒤에도 onend는 오므로 거기서 제출을 막는다

  useEffect(() => {
    setSupported(getRecognizer() != null)
    return () => recRef.current?.abort()
  }, [])

  const stop = useCallback(() => recRef.current?.stop(), [])
  const cancel = useCallback(() => {
    if (!recRef.current) return
    cancelledRef.current = true
    recRef.current.abort()
  }, [])

  const start = useCallback(() => {
    const Ctor = getRecognizer()
    if (!Ctor || recRef.current) return
    const rec = new Ctor()
    rec.lang = "ko-KR"
    rec.interimResults = true
    rec.continuous = false
    rec.maxAlternatives = 1
    let finalText = ""
    rec.onresult = (e) => {
      let text = ""
      for (let i = 0; i < e.results.length; i++) {
        const r = e.results[i]
        text += r[0].transcript
        if (r.isFinal) finalText = text
      }
      setInterim(text)
    }
    rec.onerror = (e) => {
      if (e.error === "aborted") return
      setError(SR_ERRORS[e.error] ?? `음성 인식 오류(${e.error})`)
    }
    rec.onend = () => {
      recRef.current = null
      setListening(false)
      setInterim("")
      const t = fixTranscript(finalText)
      if (t && !cancelledRef.current) onFinalRef.current(t)
    }
    recRef.current = rec
    cancelledRef.current = false
    setError(null)
    setInterim("")
    setListening(true)
    try {
      rec.start()
    } catch {
      recRef.current = null
      setListening(false)
      setError("음성 인식을 시작하지 못했습니다.")
    }
  }, [])

  return { supported, listening, interim, error, start, stop, cancel }
}

// ── 호출어 상시 대기 ("광진아, 민원이 왜 늘었어?")
// 브라우저 인식기 하나를 continuous로 계속 켜 두고, 새로 들어온 결과에서 호출어를 찾는다.
// 호출어 뒤에 말이 붙어 있으면 그 자리에서 질문으로, 호출어만 불렀으면 알림음 뒤 다음 발화(8초 안)를 질문으로.
// 크롬은 무음 1분·네트워크 흔들림에 인식을 끊으므로 onend에서 다시 켠다. 답을 읽는 동안(muted)은 결과를 버린다(되받기 방지).
// 인식기는 한 페이지에 하나만 돌릴 수 있어, 켜 둔 동안 누르고 말하기(useSpeechInput)는 쓰지 않는다.

export { WAKE_WORD } from "@/lib/dumping/wake"
const AWAKE_MS = 8_000

function chime(ctx: AudioContext) {
  const t = ctx.currentTime
  for (const [f, at] of [
    [880, 0],
    [1320, 0.09],
  ] as const) {
    const o = ctx.createOscillator()
    const g = ctx.createGain()
    o.type = "sine"
    o.frequency.value = f
    g.gain.setValueAtTime(0.0001, t + at)
    g.gain.exponentialRampToValueAtTime(0.18, t + at + 0.01)
    g.gain.exponentialRampToValueAtTime(0.0001, t + at + 0.12)
    o.connect(g).connect(ctx.destination)
    o.start(t + at)
    o.stop(t + at + 0.14)
  }
}

export function useWakeWord(onQuestion: (text: string) => void, muted: boolean) {
  const [supported, setSupported] = useState(false)
  const [state, setState] = useState<WakeState>("off")
  const [heard, setHeard] = useState("") // 호출 뒤 받아쓰는 중인 말
  const [error, setError] = useState<string | null>(null)
  const recRef = useRef<SR | null>(null)
  const enabledRef = useRef(false)
  const stateRef = useRef<WakeState>("off")
  const mutedRef = useRef(muted)
  mutedRef.current = muted
  const onQuestionRef = useRef(onQuestion)
  onQuestionRef.current = onQuestion
  const awakeTimer = useRef<number | null>(null)
  const ctxRef = useRef<AudioContext | null>(null)

  const setSt = (s: WakeState) => {
    stateRef.current = s
    setState(s)
  }

  useEffect(() => {
    setSupported(getRecognizer() != null)
    return () => {
      enabledRef.current = false
      recRef.current?.abort()
      if (awakeTimer.current != null) window.clearTimeout(awakeTimer.current)
    }
  }, [])

  const armAwake = () => {
    if (awakeTimer.current != null) window.clearTimeout(awakeTimer.current)
    awakeTimer.current = window.setTimeout(() => {
      if (stateRef.current === "awake") {
        setSt("idle")
        setHeard("")
      }
    }, AWAKE_MS)
  }

  const submit = (text: string) => {
    const q = fixTranscript(text)
    if (awakeTimer.current != null) window.clearTimeout(awakeTimer.current)
    setSt("idle")
    setHeard("")
    if (q.length >= MIN_QUESTION) onQuestionRef.current(q)
  }

  const startRec = () => {
    const Ctor = getRecognizer()
    if (!Ctor || !enabledRef.current || recRef.current) return
    const rec = new Ctor()
    rec.lang = "ko-KR"
    rec.interimResults = true
    rec.continuous = true
    rec.maxAlternatives = 1
    rec.onresult = (e) => {
      if (mutedRef.current) return
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i]
        // 판단은 순수 함수(lib/dumping/wake.ts)가 한다. 여기서는 알림음·상태·타이머만
        const step = wakeStep(stateRef.current, r[0].transcript, r.isFinal)
        if (step.kind === "ignore") continue
        if (step.kind === "wake") {
          if (ctxRef.current) chime(ctxRef.current)
          setSt("awake")
          setHeard(step.heard)
          armAwake()
        } else if (step.kind === "hear") {
          setHeard(step.heard)
          armAwake()
        } else if (step.kind === "hold") {
          armAwake()
        } else submit(step.text)
      }
    }
    rec.onerror = (ev) => {
      if (ev.error === "aborted" || ev.error === "no-speech") return
      if (ev.error === "not-allowed" || ev.error === "service-not-allowed" || ev.error === "audio-capture") {
        enabledRef.current = false
        setSt("off")
        setError(SR_ERRORS[ev.error] ?? `음성 인식 오류(${ev.error})`)
      }
    }
    rec.onend = () => {
      recRef.current = null
      // 크롬이 스스로 끊은 경우 다시 켠다. 사용자가 껐으면 enabledRef가 false
      if (enabledRef.current) window.setTimeout(startRec, 300)
    }
    recRef.current = rec
    try {
      rec.start()
    } catch {
      recRef.current = null
    }
  }

  // 사용자 제스처 안에서 부른다(알림음용 오디오·마이크 권한)
  const enable = useCallback(() => {
    if (!getRecognizer()) return
    if (!ctxRef.current) ctxRef.current = new AudioContext()
    if (ctxRef.current.state === "suspended") void ctxRef.current.resume()
    enabledRef.current = true
    setError(null)
    setSt("idle")
    startRec()
  }, [])

  // 깨어 있는 상태만 접는다(Esc). 대기(idle)는 유지되어 다시 부를 수 있다
  const dismiss = useCallback(() => {
    if (stateRef.current !== "awake") return
    if (awakeTimer.current != null) window.clearTimeout(awakeTimer.current)
    setSt("idle")
    setHeard("")
  }, [])

  const disable = useCallback(() => {
    enabledRef.current = false
    if (awakeTimer.current != null) window.clearTimeout(awakeTimer.current)
    recRef.current?.abort()
    recRef.current = null
    setSt("off")
    setHeard("")
  }, [])

  return { supported, state, heard, error, enable, disable, dismiss }
}

// ── 마이크 소리 크기(0~1). 청취 중 "받아적고 있다"는 느낌을 주는 막대용.
// Web Speech는 음량을 주지 않아 getUserMedia 스트림을 따로 열어 재는데, 인식기와 같이 써도 충돌하지 않는다.
export function useMicLevel(active: boolean) {
  const [level, setLevel] = useState(0)
  useEffect(() => {
    if (!active || typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setLevel(0)
      return
    }
    let stream: MediaStream | null = null
    let ctx: AudioContext | null = null
    let raf = 0
    let stopped = false
    const run = async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      } catch {
        return
      }
      if (stopped) {
        stream.getTracks().forEach((t) => t.stop())
        return
      }
      ctx = new AudioContext()
      const src = ctx.createMediaStreamSource(stream)
      const an = ctx.createAnalyser()
      an.fftSize = 512
      src.connect(an)
      const buf = new Uint8Array(an.fftSize)
      let smooth = 0
      const tick = () => {
        an.getByteTimeDomainData(buf)
        let sum = 0
        for (let i = 0; i < buf.length; i++) {
          const v = (buf[i] - 128) / 128
          sum += v * v
        }
        const rms = Math.sqrt(sum / buf.length)
        smooth = Math.max(rms * 4, smooth * 0.85) // 올라갈 땐 바로, 내려갈 땐 천천히
        setLevel(Math.min(1, smooth))
        raf = requestAnimationFrame(tick)
      }
      tick()
    }
    void run()
    return () => {
      stopped = true
      cancelAnimationFrame(raf)
      stream?.getTracks().forEach((t) => t.stop())
      void ctx?.close()
      setLevel(0)
    }
  }, [active])
  return level
}
