"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import type { DumpingMapData, OntoGraph, VizAction } from "@/lib/dumping/types"
import { completeSentences, splitAnswer, ttsClean } from "@/lib/dumping/answer-parts"
import { vizDescription } from "./map-controls"
import ModalShell from "./modal-shell"
import QaChart, { chartTitle, type ChartKind } from "./qa-chart"
import { buildSeeds, type Seed } from "./qa-seeds"
import { useSpeaker, useSpeechInput, useWakeWord, WAKE_WORD } from "./use-voice"

// 물어보기 탭. 지도 앱처럼 검색이 기본. 상단 검색바에 뭐든 물어보면
// /api/dumping/ask 평문 스트리밍으로 답이 검색바 바로 아래 내려온다(최신순).
// 그 아래 "핵심 질의응답" 아코디언: 첫 항목만 펼쳐진 채 시작(답 형식 예시), 나머지는 한 줄 결론(hint)만 보이고 눌러서 확장.
// 답이 미리 준비된 항목(qa-seeds.ts)은 API 호출 없이 즉시 열리고, 지도 반영은 명시적 버튼으로만 한다.
// 음성(2026-09-15, 구청장 시연용): 마이크로 물으면 답을 소리로 읽는다. 답은 프롬프트가 "말로 하는 답" + [부연]으로
// 나누어 주고(answer-parts.ts), 앞부분만 문장이 완성되는 즉시 읽고 부연은 화면 아래에 옅게 붙는다.

const DEFAULT_OPEN = 1 // 앞 N개는 펼쳐진 채 시작. 3개였을 때 패널이 길어져 훑어보기가 안 됐다(5라운드 냉독)

// 답변은 두괄식(첫 문장 = 결론)이라 첫 문장만 굵게 강조한다
function renderAnswer(text: string) {
  if (!text) return null
  const m = text.match(/^[^.\n]{5,120}[.]\s*/)
  if (!m) return text
  return (
    <>
      <b className="text-[var(--cp-text-strong)]">{m[0]}</b>
      {text.slice(m[0].length)}
    </>
  )
}

// 스트리밍 중 구분줄이 반쯤 온 상태("[부", "[부연")가 본답 끝에 깜빡이지 않게
const PARTIAL_MARK = /\n?\s*\[부연?\]?\s*$/

interface Exchange {
  q: string
  a: string
  pending?: boolean
}

interface QaChatProps {
  onAuthExpired: () => void
  onViz: (viz: VizAction) => void
  data: DumpingMapData | null
  graph: OntoGraph | null
}

export default function QaChat({ onAuthExpired, onViz, data, graph }: QaChatProps) {
  const [exchanges, setExchanges] = useState<Exchange[]>([]) // 직접 입력 질문만 (시간순 보관, 표시는 최신순)
  const [input, setInput] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // 사용자가 만지기 전에는 앞 N개만 펼침. 데이터가 늦게 와도 초기 상태가 어긋나지 않는다
  const [openSeeds, setOpenSeeds] = useState<Set<string> | null>(null)
  const [appliedSeed, setAppliedSeed] = useState<string | null>(null) // 지도에 반영 중인 항목
  const [bigChart, setBigChart] = useState<ChartKind | null>(null)
  const [voiceOn, setVoiceOn] = useState(false) // 답을 소리로 읽을지. 마이크를 쓰면 켜진다
  const [readingKey, setReadingKey] = useState<string | null>(null) // 지금 읽고 있는 질문(강조·멈춤 버튼)
  const scrollRef = useRef<HTMLDivElement>(null)
  const abortRef = useRef<AbortController | null>(null)
  const voiceOnRef = useRef(voiceOn)
  voiceOnRef.current = voiceOn

  const speaker = useSpeaker()
  const mic = useSpeechInput((text) => {
    setInput(text)
    void askFree(text, true)
  })
  // 호출어 상시 대기("김주임, 민원이 왜 늘었어?"). 답을 읽는 동안은 마이크 결과를 버린다
  const wake = useWakeWord((text) => {
    setInput(text)
    void askFree(text, true)
  }, speaker.speaking)
  const wakeOn = wake.state !== "off"

  const seeds = useMemo(() => (data && graph ? buildSeeds(data, graph) : []), [data, graph])

  // 탭을 떠나면 진행 중인 스트림을 끊는다. 사라진 컴포넌트에 setState가 계속 날아오지 않게
  useEffect(() => () => abortRef.current?.abort(), [])
  useEffect(() => {
    if (!speaker.speaking) setReadingKey(null)
  }, [speaker.speaking])

  const isOpen = (q: string, i: number) => (openSeeds ? openSeeds.has(q) : i < DEFAULT_OPEN)
  const toggleSeed = (q: string, i: number) => {
    setOpenSeeds((prev) => {
      const next = new Set(prev ?? seeds.slice(0, DEFAULT_OPEN).map((s) => s.q))
      if (isOpen(q, i)) next.delete(q)
      else next.add(q)
      return next
    })
  }

  const applySeedViz = (seed: Seed) => {
    if (!seed.viz) return
    onViz(seed.viz)
    setAppliedSeed(seed.q)
  }

  // 완성된 답(시드·이전 질문)을 처음부터 읽는다. 본답만, 부연은 읽지 않는다
  const readAloud = (key: string, text: string) => {
    speaker.stop()
    const spoken = ttsClean(splitAnswer(text).spoken)
    const [sentences, consumed] = completeSentences(spoken + " ")
    const rest = spoken.slice(consumed).trim()
    const all = rest ? [...sentences, rest] : sentences
    if (!all.length) return
    setReadingKey(key)
    for (const s of all) speaker.speak(s)
  }

  const startMic = () => {
    if (mic.listening) {
      mic.stop()
      return
    }
    speaker.stop() // 읽는 소리를 마이크가 되받지 않게
    speaker.unlock() // 사용자 제스처 안에서 오디오를 열어 둔다. 답이 올 때 자동재생이 막히지 않게
    setVoiceOn(true)
    setError(null)
    mic.start()
  }

  // 호출어 대기 켜고 끄기. 인식기는 하나뿐이라 켜 두는 동안 누르고 말하기는 잠근다
  const toggleWake = () => {
    if (wakeOn) {
      wake.disable()
      return
    }
    if (mic.listening) mic.stop()
    speaker.unlock()
    setVoiceOn(true)
    setError(null)
    wake.enable()
  }

  const askFree = async (question: string, byVoice = false) => {
    const q = question.trim()
    if (!q || busy) return

    // 같은 질문을 다시 물으면 API 호출 없이 기존 답을 맨 위로 끌어올린다
    const cachedIdx = exchanges.findIndex((e) => e.q === q && !e.pending)
    if (cachedIdx >= 0) {
      setExchanges((xs) => {
        const next = xs.filter((_, i) => i !== cachedIdx)
        next.push(xs[cachedIdx])
        return next
      })
      setInput("")
      scrollRef.current?.scrollTo({ top: 0, behavior: "smooth" })
      if (byVoice || voiceOnRef.current) readAloud(q, exchanges[cachedIdx].a)
      return
    }

    setError(null)
    setInput("")
    setBusy(true)
    speaker.stop()
    const speakThis = byVoice || voiceOnRef.current
    if (speakThis) setReadingKey(q)
    const history = exchanges
      .flatMap((e) => [
        { role: "user" as const, text: e.q },
        { role: "model" as const, text: e.a },
      ])
      .slice(-8)
    setExchanges((xs) => [...xs, { q, a: "", pending: true }])
    scrollRef.current?.scrollTo({ top: 0 })
    const controller = new AbortController()
    abortRef.current = controller
    // 문장이 완성되는 즉시 읽기 큐에 넣는다. [부연]이 나오면 그 앞까지만
    let acc = ""
    let spokenIdx = 0
    let spokenDone = !speakThis
    const speakProgress = (final: boolean) => {
      if (spokenDone) return
      const parts = splitAnswer(acc)
      const base = parts.split ? parts.spoken : acc.trimStart()
      const [sentences, consumed] = completeSentences(base.slice(spokenIdx) + (parts.split || final ? " " : ""))
      for (const s of sentences) speaker.speak(ttsClean(s))
      spokenIdx += consumed
      if (parts.split || final) spokenDone = true
    }
    try {
      const res = await fetch("/api/dumping/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q, history }),
        signal: controller.signal,
      })
      if (res.status === 401) {
        onAuthExpired()
        return
      }
      if (!res.ok || !res.body) {
        const err = await res.json().catch(() => null)
        throw new Error(err?.error ?? "답변 생성에 실패했습니다")
      }
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        const chunk = decoder.decode(value, { stream: true })
        acc += chunk
        speakProgress(false)
        setExchanges((xs) => {
          const next = [...xs]
          const last = next[next.length - 1]
          next[next.length - 1] = { ...last, a: last.a + chunk }
          return next
        })
      }
      speakProgress(true)
      setExchanges((xs) => {
        const next = [...xs]
        const last = next[next.length - 1]
        next[next.length - 1] = { ...last, a: last.a || "(빈 응답)", pending: false }
        return next
      })
    } catch (e) {
      if (!(e instanceof DOMException && e.name === "AbortError")) {
        setError(e instanceof Error ? e.message : "오류가 발생했습니다")
        setExchanges((xs) => (xs[xs.length - 1]?.pending ? xs.slice(0, -1) : xs))
        speaker.stop()
      } else {
        // 중단: 받은 데까지 확정
        setExchanges((xs) => {
          const next = [...xs]
          const last = next[next.length - 1]
          if (last?.pending) next[next.length - 1] = { ...last, a: last.a || "(중단됨)", pending: false }
          return next
        })
      }
    } finally {
      setBusy(false)
      abortRef.current = null
    }
  }

  const results = [...exchanges].reverse() // 검색 결과처럼 최신 답이 맨 위

  // 읽기 버튼. 읽는 중이면 멈춤으로 바뀐다 (컴포넌트가 아니라 함수: 렌더마다 타입이 바뀌어 리마운트되는 일을 막는다)
  const readButton = (id: string, text: string) => {
    const active = readingKey === id && speaker.speaking
    return (
      <button
        type="button"
        onClick={() => (active ? speaker.stop() : readAloud(id, text))}
        aria-label={active ? "읽기 멈춤" : "소리로 듣기"}
        title={active ? "읽기 멈춤" : "소리로 듣기"}
        className={`flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[13px] transition-colors ${
          active
            ? "border-[#0c6155] bg-[#0c6155] text-white"
            : "border-[var(--cp-border)] text-[var(--cp-text-dim)] hover:border-[#0c6155] hover:text-[#0c6155]"
        }`}
      >
        <SpeakerIcon />
        {active ? "멈춤" : "듣기"}
      </button>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* 검색바. 지도 앱처럼 이곳이 시작점 */}
      <form
        onSubmit={(e) => {
          e.preventDefault()
          speaker.unlock()
          void askFree(input)
        }}
        className="shrink-0 border-b border-[var(--cp-border)] p-2.5"
      >
        <div
          className={`flex items-center gap-1.5 rounded-full border bg-[var(--cp-panel)] py-1 pl-4 pr-1 shadow-sm transition-colors focus-within:border-[#0c6155] ${
            mic.listening || wake.state === "awake" ? "border-[#b42318]" : "border-[var(--cp-border)]"
          }`}
        >
          <input
            value={mic.listening ? mic.interim : wake.state === "awake" ? wake.heard : input}
            onChange={(e) => setInput(e.target.value)}
            readOnly={mic.listening || wake.state === "awake"}
            placeholder={
              mic.listening
                ? "듣고 있습니다. 말씀해 주세요"
                : wake.state === "awake"
                  ? "네, 말씀하세요"
                  : wakeOn
                    ? `"${WAKE_WORD}" 하고 부른 뒤 물어보세요`
                    : "무단투기에 대해 무엇이든 물어보세요"
            }
            aria-label="질문"
            maxLength={500}
            className="min-w-0 flex-1 bg-transparent py-1.5 text-[16.5px] text-[var(--cp-text)] placeholder:text-[var(--cp-text-faint)] focus:outline-none"
          />
          {mic.supported && (
            <button
              type="button"
              onClick={startMic}
              disabled={busy || wakeOn}
              aria-label={mic.listening ? "듣기 멈춤" : "말로 묻기"}
              aria-pressed={mic.listening}
              title={wakeOn ? `호출어 대기 중에는 "${WAKE_WORD}" 하고 부르세요` : mic.listening ? "듣기 멈춤" : "말로 묻기"}
              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors disabled:opacity-35 ${
                mic.listening
                  ? "animate-pulse bg-[#b42318] text-white"
                  : "border border-[var(--cp-border)] text-[var(--cp-text-dim)] hover:border-[#0c6155] hover:text-[#0c6155]"
              }`}
            >
              <MicIcon />
            </button>
          )}
          {wake.supported && (
            <button
              type="button"
              onClick={toggleWake}
              aria-label={wakeOn ? "호출어 대기 끄기" : "호출어 대기 켜기"}
              aria-pressed={wakeOn}
              title={wakeOn ? `"${WAKE_WORD}" 호출어 대기 중. 누르면 끕니다` : `"${WAKE_WORD}" 하고 부르면 응답하도록 켭니다`}
              className={`flex h-8 shrink-0 items-center gap-1 rounded-full px-2.5 text-[13px] font-semibold transition-colors ${
                wake.state === "awake"
                  ? "bg-[#b42318] text-white"
                  : wakeOn
                    ? "bg-[#0c6155]/12 text-[#0c6155]"
                    : "border border-[var(--cp-border)] text-[var(--cp-text-dim)] hover:border-[#0c6155] hover:text-[#0c6155]"
              }`}
            >
              <EarIcon />
              {WAKE_WORD}
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              if (speaker.speaking) speaker.stop()
              speaker.unlock()
              setVoiceOn((v) => !v)
            }}
            aria-label={voiceOn ? "소리 답변 끄기" : "소리 답변 켜기"}
            aria-pressed={voiceOn}
            title={voiceOn ? "답을 소리로 읽는 중. 누르면 끕니다" : "답을 소리로 읽기"}
            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors ${
              voiceOn
                ? "bg-[#0c6155]/12 text-[#0c6155]"
                : "border border-[var(--cp-border)] text-[var(--cp-text-dim)] hover:border-[#0c6155] hover:text-[#0c6155]"
            }`}
          >
            <SpeakerIcon muted={!voiceOn} />
          </button>
          {busy ? (
            <button
              type="button"
              onClick={() => abortRef.current?.abort()}
              className="shrink-0 rounded-full border border-[var(--cp-border)] px-3 py-1.5 text-[15px] text-[var(--cp-text-muted)] hover:bg-[var(--cp-hover)]"
            >
              중단
            </button>
          ) : (
            <button
              type="submit"
              disabled={!input.trim() || mic.listening}
              aria-label="질문하기"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#0c6155] text-white disabled:opacity-35"
            >
              <svg viewBox="0 0 20 20" className="h-[17px] w-[17px]" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="8.5" cy="8.5" r="5.5" />
                <path d="m13 13 4 4" strokeLinecap="round" />
              </svg>
            </button>
          )}
        </div>
        <p className="mt-1.5 px-2 text-[14px] leading-snug text-[var(--cp-text-faint)]">
          {wake.state === "awake"
            ? "듣고 있습니다. 질문을 말씀하시면 바로 답합니다."
            : wakeOn
              ? `"${WAKE_WORD}" 하고 부르면 알림음 뒤에 질문을 받습니다. 부르면서 바로 이어 물어도 됩니다.`
              : mic.supported
                ? "마이크를 누르고 말하면 답을 소리로 읽어 드립니다. 답은 이 분석의 근거 그래프와 수치만 바탕으로 만들어집니다."
                : "답은 이 분석의 근거 그래프와 수치만 바탕으로 만들어집니다. 아래 핵심 질문은 검증된 수치로 미리 준비된 답입니다."}
        </p>
      </form>

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto p-3">
        {(error || mic.error || wake.error) && (
          <p
            role="alert"
            className="mb-2 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-[15.5px] text-red-600"
          >
            {error ?? mic.error ?? wake.error}
          </p>
        )}

        {/* 직접 질문 결과. 검색바 바로 아래, 최신순 */}
        {results.length > 0 && (
          <section className="mb-4 flex flex-col gap-2" aria-live="polite">
            <h3 className="text-[15px] font-semibold tracking-wide text-[var(--cp-text-dim)]">내가 물어본 것</h3>
            {results.map((ex) => {
              const parts = splitAnswer(ex.a)
              const spoken = ex.pending ? parts.spoken.replace(PARTIAL_MARK, "") : parts.spoken
              const reading = readingKey === ex.q && speaker.speaking
              return (
                <div
                  key={ex.q}
                  className={`rounded-lg border bg-[var(--cp-panel)] p-3 transition-colors ${
                    reading ? "border-[#0c6155]" : "border-[var(--cp-border)]"
                  }`}
                >
                  <div className="mb-1.5 flex items-start gap-1.5">
                    <p className="flex min-w-0 flex-1 items-start gap-1.5 text-[16px] font-semibold leading-snug text-[var(--cp-text-strong)]">
                      <span className="mt-0.5 shrink-0 rounded bg-[#0c6155]/10 px-1.5 py-0.5 text-[12.5px] font-bold text-[#0c6155]">
                        Q
                      </span>
                      {ex.q}
                    </p>
                    {!ex.pending && spoken && readButton(ex.q, ex.a)}
                  </div>
                  <div className="whitespace-pre-wrap text-[17px] leading-relaxed text-[var(--cp-text)]">
                    {renderAnswer(spoken) || (ex.pending ? "생각 중…" : "")}
                  </div>
                  {parts.detail && (
                    <div className="mt-2.5 border-l-2 border-[var(--cp-border)] pl-3">
                      <p className="mb-1 text-[12.5px] font-semibold tracking-wide text-[var(--cp-text-faint)]">근거 수치와 한계</p>
                      <div className="whitespace-pre-wrap text-[14.5px] leading-relaxed text-[var(--cp-text-dim)]">{parts.detail}</div>
                    </div>
                  )}
                </div>
              )
            })}
          </section>
        )}

        {/* 핵심 질의응답 아코디언. 첫 항목 펼침, 나머지 접힘 */}
        <section>
          <h3 className="mb-2 text-[15px] font-semibold tracking-wide text-[var(--cp-text-dim)]">
            핵심 질의응답 {seeds.length > 0 ? seeds.length : ""} · 누르면 펼쳐집니다
          </h3>
          {seeds.length === 0 && <p className="text-[15.5px] text-[var(--cp-text-dim)]">데이터를 불러오는 중…</p>}
          <div className="flex flex-col gap-1.5">
            {seeds.map((s, i) => {
              const open = isOpen(s.q, i)
              const onMap = appliedSeed === s.q
              const vizDesc = s.viz ? vizDescription(s.viz) : ""
              return (
                <div
                  key={s.q}
                  className={`overflow-hidden rounded-lg border bg-[var(--cp-panel)] transition-colors ${
                    open ? "border-[var(--cp-border-active)]" : "border-[var(--cp-border)]"
                  }`}
                >
                  <button
                    onClick={() => toggleSeed(s.q, i)}
                    aria-expanded={open}
                    className="flex w-full items-center gap-2 px-3 py-2.5 text-left hover:bg-[var(--cp-hover)]"
                  >
                    <span
                      className={`shrink-0 text-[12.5px] text-[var(--cp-text-dim)] transition-transform ${open ? "rotate-90" : ""}`}
                      aria-hidden
                    >
                      ▶
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[16px] font-semibold leading-snug text-[var(--cp-text-strong)]">
                        {s.q}
                      </span>
                      {!open && <span className="block truncate text-[14.5px] text-[var(--cp-text-dim)]">{s.hint}</span>}
                    </span>
                    {onMap && (
                      <span className="shrink-0 rounded bg-[#0c6155] px-1.5 py-0.5 text-[12.5px] font-semibold text-white">
                        지도 반영 중
                      </span>
                    )}
                  </button>
                  {open && (
                    <div className="flex flex-col gap-2 border-t border-[var(--cp-border-faint)] px-3 pb-3 pt-2.5">
                      <div className="flex justify-end">
                        {readButton(s.q, s.answer)}
                      </div>
                      <div className="whitespace-pre-wrap text-[16px] leading-relaxed text-[var(--cp-text)]">
                        {renderAnswer(s.answer)}
                      </div>
                      {s.chart && data && (
                        <button
                          onClick={() => setBigChart(s.chart!)}
                          title="누르면 크게 볼 수 있습니다"
                          className="rounded-lg border border-[var(--cp-border)] bg-white p-2.5 text-left transition-shadow hover:border-[#0c6155]/60"
                        >
                          <span className="mb-1 flex items-baseline justify-between">
                            <b className="text-[14.5px] text-[var(--cp-text-strong)]">{chartTitle(s.chart, data)}</b>
                            <span className="text-[13.5px] text-[#0c6155]">크게 보기 +</span>
                          </span>
                          <QaChart kind={s.chart} data={data} graph={graph} />
                        </button>
                      )}
                      {s.viz && (
                        <>
                          {/* 누르기 전에 지도가 어떻게 바뀌는지 보여 준다. 버튼 하나에 결론과 예고를 같이 */}
                          <button
                            onClick={() => applySeedViz(s)}
                            disabled={onMap}
                            title={vizDesc}
                            className={`flex flex-col items-center rounded-lg px-3 py-2 transition-colors ${
                              onMap ? "border border-[#0c6155]/30 bg-[#0c6155]/8 text-[#0c6155]" : "border border-[#0c6155] text-[#0c6155] hover:bg-[#0c6155]/8"
                            }`}
                          >
                            <span className="text-[15.5px] font-semibold">{onMap ? "✓ 지도에 반영됨" : "지도에서 확인"}</span>
                            {!onMap && vizDesc && (
                              <span className="text-[13.5px] font-normal leading-snug opacity-85">{vizDesc}</span>
                            )}
                          </button>
                          {onMap && s.vizNote && (
                            <p className="rounded-lg border border-dashed border-[#0c6155]/40 bg-[#0c6155]/5 px-2.5 py-1.5 text-[14.5px] leading-snug text-[#0c6155]">
                              {s.vizNote}
                            </p>
                          )}
                        </>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
          <p className="mt-2 text-[14px] leading-relaxed text-[var(--cp-text-faint)]">
            준비된 답의 수치는 독립 검토를 거친 확정치입니다. 더 깊은 근거는 발견·데이터 탭에서 볼 수 있습니다.
          </p>
        </section>
      </div>

      {bigChart && data && (
        <ModalShell size="xl" zIndex={2100} title={chartTitle(bigChart, data)} onClose={() => setBigChart(null)}>
          <QaChart kind={bigChart} data={data} graph={graph} />
        </ModalShell>
      )}
    </div>
  )
}

function EarIcon() {
  return (
    <svg viewBox="0 0 20 20" className="h-[15px] w-[15px]" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <path d="M5.5 8a4.5 4.5 0 0 1 9 0c0 2.2-1.6 3-2.3 4.2-.6 1-.5 2.8-2.4 3.3-1.6.4-2.6-.7-2.8-1.7" strokeLinecap="round" />
      <path d="M8.5 8a1.5 1.5 0 0 1 3 0c0 1-1 1.2-1 2.2" strokeLinecap="round" />
    </svg>
  )
}

function MicIcon() {
  return (
    <svg viewBox="0 0 20 20" className="h-[17px] w-[17px]" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <rect x="7" y="2.5" width="6" height="9" rx="3" />
      <path d="M4.5 9.5a5.5 5.5 0 0 0 11 0M10 15v2.5M7.5 17.5h5" strokeLinecap="round" />
    </svg>
  )
}

function SpeakerIcon({ muted = false }: { muted?: boolean }) {
  return (
    <svg viewBox="0 0 20 20" className="h-[16px] w-[16px]" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <path d="M3.5 7.5h3l4-3.5v12l-4-3.5h-3z" strokeLinejoin="round" />
      {muted ? <path d="m13.5 7.5 4 5m0-5-4 5" strokeLinecap="round" /> : <path d="M13 7a4 4 0 0 1 0 6M15.5 4.5a7.5 7.5 0 0 1 0 11" strokeLinecap="round" />}
    </svg>
  )
}
