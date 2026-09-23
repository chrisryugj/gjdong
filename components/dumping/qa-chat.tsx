"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { Ico } from "./icons"
import type { DumpingMapData, OntoGraph, VizAction } from "@/lib/dumping/types"
import { ASK_FEED0, completeSentences, DETAIL_MARK, detailLines, endAsk, feedAsk, sentencesOf, splitAnswer, ttsClean } from "@/lib/dumping/answer-parts"
import { matchSeed } from "@/lib/dumping/seed-match"
import { DEFAULT_VOICE, VOICES } from "@/lib/dumping/voices"
import { vizDescription } from "./map-controls"
import ModalShell from "./modal-shell"
import QaChart, { chartTitle, type ChartKind } from "./qa-chart"
import { buildSeeds, type Seed } from "./qa-seeds"
import { useMicLevel, useSpeaker, useSpeechInput, useWakeWord, WAKE_CALL, WAKE_WORD } from "./use-voice"
import { SectionHead } from "./section-head"
import { nb } from "@/lib/dumping/nobreak"

// 물어보기 탭. 지도 앱처럼 검색이 기본. 상단 검색바에 뭐든 물어보면
// /api/dumping/ask 평문 스트리밍으로 답이 검색바 바로 아래 내려온다(최신순).
// 그 아래 "핵심 질의응답" 아코디언: 첫 항목만 펼쳐진 채 시작(답 형식 예시), 나머지는 한 줄 결론(hint)만 보이고 눌러서 확장.
// 답이 미리 준비된 항목(qa-seeds.ts)은 API 호출 없이 즉시 열리고, 지도 반영은 명시적 버튼으로만 한다.
// 음성(2026-09-15, 구청장 시연용): 마이크로 물으면 답을 소리로 읽는다. 답은 프롬프트가 "말로 하는 답" + [부연]으로
// 나누어 주고(answer-parts.ts), 앞부분만 문장이 완성되는 즉시 읽고 부연은 화면 아래에 옅게 붙는다.
// 10라운드: 준비된 답과 생성 답을 같은 카드 규격(1부 문장별 줄·2부 슬롯 칩)으로 그린다. 시드는 결재용 6개만 먼저.

const DEFAULT_OPEN = 1 // 앞 N개는 펼쳐진 채 시작. 3개였을 때 패널이 길어져 훑어보기가 안 됐다(5라운드 냉독)
const BOLD_MAX = 45 // 첫 문장이 이보다 길면 굵게 하지 않는다. 두 줄 반이 통째로 굵으면 강조가 죽는다(10라운드 냉독)

// 1부. 문장마다 한 줄, 첫 문장(결론)만 굵게
function renderAnswer(text: string) {
  const ss = sentencesOf(text)
  if (!ss.length) return null
  return (
    <>
      {ss.map((s, i) => (
        <span
          key={i}
          className={`block ${i === 0 ? (s.length <= BOLD_MAX ? "font-bold text-[var(--cp-text-strong)]" : "font-semibold text-[var(--cp-text-strong)]") : "mt-1"}`}
        >
          {nb(s)}
        </span>
      ))}
    </>
  )
}

// 2부. "수치·근거·한계·다음 행동" 슬롯 칩 + 한 줄
const SLOT_CLS: Record<string, string> = {
  수치: "bg-[#1c4f96]/10 text-[#1c4f96]",
  근거: "bg-[var(--cp-hover2)] text-[var(--cp-text-muted)]",
  한계: "bg-[#8a530e]/12 text-[#8a530e]",
  "다음 행동": "bg-(--dump-accent)/12 text-(--dump-accent-ink)",
}
function renderDetail(detail: string, asof?: string) {
  const ls = detailLines(detail)
  if (!ls.length) return null
  return (
    <div className="mt-2.5 border-t border-[var(--cp-border)] pt-2">
      <p className="mb-1 flex items-baseline gap-2 text-[12.5px] font-semibold tracking-wide text-[var(--cp-text-faint)]">
        근거 수치와 한계
        {asof && <span className="font-normal">· 자료 기준 {asof}</span>}
      </p>
      <ul className="flex flex-col gap-1">
        {ls.map((l, i) => (
          <li key={i} className="flex items-start gap-1.5 text-[14.5px] leading-relaxed text-[var(--cp-text-dim)]">
            {l.slot && <span className={`mt-[3px] shrink-0 rounded px-1 text-[12px] font-semibold ${SLOT_CLS[l.slot]}`}>{l.slot}</span>}
            <span className="min-w-0">{nb(l.text)}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

// 스트리밍 중 구분줄이 반쯤 온 상태("[부", "[부연")가 본답 끝에 깜빡이지 않게
const PARTIAL_MARK = /\n?\s*\[부연?\]?\s*$/

interface Exchange {
  q: string
  a: string
  pending?: boolean
  aborted?: "user" | "cut" // 완성 답이 아닌 것. user=사용자가 중단, cut=완료 표식 없이 끊김(단절·타임아웃·빈 답). 재사용하지 않는다
  seedQ?: string // 13라운드: 준비된 답으로 즉답한 경우 그 시드 질문. 화면에 밝히고 "모델에게 새로 묻기"를 둔다
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
  // 호출어로 끼어들거나 "지니야 그만"이면 지금 받는 답의 남은 문장을 읽기 큐에 다시 넣지 않는다(끊었는데 다음 문장이 이어 읽히던 것, 22라운드 코드리뷰)
  const silencedRef = useRef(false)

  const speaker = useSpeaker()
  const mic = useSpeechInput((text) => {
    setInput(text)
    void askFree(text, true)
  })
  // 호출어 상시 대기("지니야, 민원이 왜 늘었어?"). 답을 읽는 동안은 마이크 결과를 버리되, 호출어가 들리면 읽기를 멈추고 듣는다(끼어들기)
  const wake = useWakeWord(
    (text) => {
      setInput(text)
      if (busy) {
        // 답을 만드는 중이면 askFree가 조용히 버린다. 입력창에 남기고 이유를 말해 준다
        setError("앞 질문의 답을 만드는 중입니다. 끝나면 다시 불러 주세요. 질문은 입력창에 남겨 두었습니다.")
        return
      }
      void askFree(text, true)
    },
    speaker.speaking,
    () => {
      silencedRef.current = true
      speaker.stop()
    },
  )
  const wakeOn = wake.state !== "off"
  const listening = mic.listening || wake.state === "awake"
  const level = useMicLevel(listening) // 청취 중 소리 크기 막대
  const [phase, setPhase] = useState<ThinkPhase>("sending") // 답을 기다리는 동안의 실제 단계
  const [voicePick, setVoicePick] = useState(false) // 목소리 고르기 줄
  const currentVoice = VOICES.find((v) => v.id === (speaker.voice ?? DEFAULT_VOICE)) ?? VOICES[0]
  // 목소리를 고르면 곧바로 그 목소리로 한 문장 읽어 준다(미리 듣기). 답 읽기도 켠다
  const pickVoice = (id: string) => {
    speaker.stop()
    speaker.unlock()
    speaker.setVoice(id === DEFAULT_VOICE ? null : id)
    setVoiceOn(true)
    speaker.speak("안녕하세요, 클린광진 상황실입니다. 이 목소리로 답을 읽어 드립니다.")
  }

  // Esc: 듣는 중이면 제출 없이 취소, 호출어에 깨어 있으면 접기, 답을 만드는 중이면 중단, 읽는 중이면 멈춤.
  // 모달이 열려 있으면 모달이 document에서 Esc를 먹고 전파를 끊으므로 여기(window)까지 오지 않는다
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return
      if (mic.listening) mic.cancel()
      else if (wake.state === "awake") wake.dismiss()
      else if (abortRef.current) abortRef.current.abort()
      else if (speaker.speaking) speaker.stop()
      else return
      e.preventDefault()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [mic, wake, speaker])
  const heardText = mic.listening ? mic.interim : wake.heard

  const allSeeds = useMemo(() => (data && graph ? buildSeeds(data, graph) : []), [data, graph])
  const [moreSeeds, setMoreSeeds] = useState(false) // 결재용 6개 뒤의 나머지
  const seeds = useMemo(() => (moreSeeds ? allSeeds : allSeeds.filter((s) => s.core)), [allSeeds, moreSeeds])
  const asof = data?.decision.asof

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
  // 준비된 답의 1부만 읽는다(2부 수치는 화면용). hint는 1부 첫 문장과 같아 따로 붙이지 않는다
  const seedSpoken = (s: Seed) => s.answer

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

  const askFree = async (question: string, byVoice = false, opts: { force?: boolean } = {}) => {
    const q = question.trim()
    if (!q || busy) return

    // 같은 질문을 다시 물으면 API 호출 없이 기존 답을 맨 위로 끌어올린다. 중단된 답은 완성 답이 아니라 다시 묻는다.
    // "모델에게 새로 묻기"(force)는 준비된 답을 캐시로 잡지 않고 모델을 부른다
    const cachedIdx = opts.force ? -1 : exchanges.findIndex((e) => e.q === q && !e.pending && !e.aborted)
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

    // 13라운드: 준비된 답(시드)과 같은 뜻이면 모델을 부르지 않고 그 답을 바로 낸다(첫 글자까지 10초 → 0초).
    // 어느 시드로 판단했는지 화면에 밝히고, 아니면 "모델에게 새로 묻기"로 강제할 수 있다
    if (!opts.force) {
      const hit = matchSeed(q, allSeeds)
      if (hit) {
        const a = `${hit.seed.answer}\n\n${DETAIL_MARK}\n${hit.seed.detail}`
        setError(null)
        setInput("")
        speaker.stop()
        setExchanges((xs) => [...xs.filter((e) => e.q !== q), { q, a, pending: false, seedQ: hit.seed.q }])
        scrollRef.current?.scrollTo({ top: 0, behavior: "smooth" })
        if (byVoice || voiceOnRef.current) readAloud(q, a)
        return
      }
    }

    setError(null)
    setInput("")
    setBusy(true)
    setPhase("sending")
    speaker.stop()
    const speakThis = byVoice || voiceOnRef.current
    if (speakThis) setReadingKey(q)
    const history = exchanges
      .flatMap((e) => [
        { role: "user" as const, text: e.q },
        { role: "model" as const, text: e.a },
      ])
      .slice(-8)
    // 중단된 답과, 새로 묻기로 대체하는 준비된 답은 목록에서 뺀다(같은 질문 카드가 둘 남지 않게)
    setExchanges((xs) => [...xs.filter((e) => !(e.q === q && (e.aborted || opts.force))), { q, a: "", pending: true }])
    scrollRef.current?.scrollTo({ top: 0 })
    const controller = new AbortController()
    abortRef.current = controller
    // 문장이 완성되는 즉시 읽기 큐에 넣는다. [부연]이 나오면 그 앞까지만
    let acc = ""
    let spokenIdx = 0
    let spokenDone = !speakThis
    silencedRef.current = false
    const speakProgress = (final: boolean) => {
      if (spokenDone || silencedRef.current) return
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
      // 표식(접수·오류·완료)은 청크 경계에서 잘려 올 수 있어 feedAsk가 NUL 이후를 모아 두고 endAsk에서 확정한다(독립 리뷰 F1)
      let feed = ASK_FEED0
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        const r = feedAsk(feed, decoder.decode(value, { stream: true }))
        // 접수 표시: 요청이 서버에 닿아 모델을 부르는 중. 여기서부터 "생각하는 중"
        if (!feed.accepted && r.s.accepted) setPhase("writing")
        feed = r.s
        if (!r.text) continue
        acc += r.text
        speakProgress(false)
        setExchanges((xs) => {
          const next = [...xs]
          const last = next[next.length - 1]
          next[next.length - 1] = { ...last, a: last.a + r.text }
          return next
        })
      }
      feed = endAsk(feed)
      if (feed.err && !acc) throw new Error(feed.err)
      // 완료 표식이 왔고 본문이 있어야 완성 답. 그 밖(본문 뒤 오류 표식·표식 없이 닫힘·빈 답)은 받은 데까지 보여 주되 재사용하지 않는다
      const complete = feed.done && !!acc
      speakProgress(complete)
      if (!complete) setError(feed.err ?? (feed.done ? "빈 답이 왔습니다. 다시 시도해 주세요" : "답변이 중간에 끊겼습니다. 다시 시도해 주세요"))
      setExchanges((xs) => {
        const next = [...xs]
        const last = next[next.length - 1]
        next[next.length - 1] = { ...last, a: last.a || "(빈 응답)", pending: false, aborted: complete ? undefined : "cut" }
        return next
      })
    } catch (e) {
      if (!(e instanceof DOMException && e.name === "AbortError")) {
        // fetch의 TypeError는 연결 단절. 영어 원문("Failed to fetch")을 화면에 내지 않는다
        setError(e instanceof TypeError ? "네트워크 연결이 끊겼습니다. 다시 시도해 주세요" : e instanceof Error ? e.message : "오류가 발생했습니다")
        setExchanges((xs) => (xs[xs.length - 1]?.pending ? xs.slice(0, -1) : xs))
        speaker.stop()
      } else {
        // 중단: 받은 데까지 보여 주되 완성 답으로 취급하지 않는다. 읽기 큐에 넣어 둔 문장도 멈춘다
        speaker.stop()
        setExchanges((xs) => {
          const next = [...xs]
          const last = next[next.length - 1]
          if (last?.pending) next[next.length - 1] = { ...last, a: last.a || "(중단됨)", pending: false, aborted: "user" }
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
            ? "border-(--dump-accent) bg-(--dump-accent) text-white"
            : "border-[var(--cp-border)] text-[var(--cp-text-dim)] hover:border-(--dump-accent) hover:text-(--dump-accent)"
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
          className={`flex items-center gap-1.5 rounded-full border bg-[var(--cp-panel)] py-1 pl-4 pr-1 shadow-sm transition-colors focus-within:border-(--dump-accent) ${
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
                  ? "네, 말씀해 주세요"
                  : wakeOn
                    ? `"${WAKE_CALL}" 하고 부른 뒤 물어보세요`
                    : "이번 분석의 결과와 대책을 물어보세요"
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
              title={wakeOn ? `호출어 대기 중에는 "${WAKE_CALL}" 하고 부르세요` : mic.listening ? "듣기 멈춤" : "말로 묻기"}
              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors disabled:opacity-35 ${
                mic.listening
                  ? "animate-pulse bg-[#b42318] text-white"
                  : "border border-[var(--cp-border)] text-[var(--cp-text-dim)] hover:border-(--dump-accent) hover:text-(--dump-accent)"
              }`}
            >
              <MicIcon />
            </button>
          )}
          {busy ? (
            <button
              type="button"
              onClick={() => abortRef.current?.abort()}
              title="Esc로도 중단됩니다"
              className="shrink-0 rounded-full border border-[var(--cp-border)] px-3 py-1.5 text-[15px] text-[var(--cp-text-muted)] hover:bg-[var(--cp-hover)]"
            >
              중단
            </button>
          ) : (
            <button
              type="submit"
              disabled={!input.trim() || mic.listening}
              aria-label="질문하기"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-(--dump-accent) text-white disabled:opacity-35"
            >
              <Ico name="search" size={17} strokeWidth="2" />
            </button>
          )}
        </div>
        {/* 모드 토글은 둘째 줄. 입력 알약 안에 다 넣으면 카드 폭 440px에서 안내 문구가 잘린다(2026-09-18) */}
        <div className="mt-2 flex items-start gap-1.5 px-1">
          <div className="flex shrink-0 items-center gap-1.5">
          {wake.supported && (
              <button
                type="button"
                onClick={toggleWake}
                aria-label={wakeOn ? "호출어 대기 끄기" : "호출어 대기 켜기"}
                aria-pressed={wakeOn}
                title={wakeOn ? `"${WAKE_CALL}" 호출어 대기 중. 누르면 끕니다` : `"${WAKE_CALL}" 하고 부르면 응답하도록 켭니다`}
                className={`flex h-8 shrink-0 items-center gap-1 rounded-full px-2.5 text-[13px] font-semibold transition-colors ${
                  wake.state === "awake"
                    ? "bg-[#b42318] text-white"
                    : wakeOn
                      ? "bg-(--dump-accent)/12 text-(--dump-accent)"
                      : "border border-[var(--cp-border)] text-[var(--cp-text-dim)] hover:border-(--dump-accent) hover:text-(--dump-accent)"
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
                  ? "bg-(--dump-accent)/12 text-(--dump-accent)"
                  : "border border-[var(--cp-border)] text-[var(--cp-text-dim)] hover:border-(--dump-accent) hover:text-(--dump-accent)"
              }`}
            >
              <SpeakerIcon muted={!voiceOn} />
            </button>
            <button
              type="button"
              onClick={() => setVoicePick((v) => !v)}
              aria-expanded={voicePick}
              title={`읽어 주는 목소리: ${currentVoice.label}. 누르면 다른 목소리를 골라 미리 듣습니다`}
              className={`flex h-8 shrink-0 items-center gap-1 rounded-full px-2.5 text-[13px] font-semibold transition-colors ${
                voicePick ? "bg-(--dump-accent)/12 text-(--dump-accent)" : "border border-[var(--cp-border)] text-[var(--cp-text-dim)] hover:border-(--dump-accent) hover:text-(--dump-accent)"
              }`}
            >
              목소리
            </button>
          </div>
        <p className="min-w-0 flex-1 pl-1 pt-1 text-[12.5px] leading-snug text-[var(--cp-text-faint)]">
          {wakeOn && wake.state !== "awake" && (
            <span className="dump-breathe mt-[5px] h-2 w-2 shrink-0 rounded-full bg-(--dump-accent)" aria-hidden />
          )}
          {wake.state === "awake"
            ? "듣고 있습니다. 질문을 말씀하시면 바로 답합니다."
            : wakeOn
              ? `"${WAKE_CALL}" 하고 부르면 알림음 뒤에 질문을 받습니다. 부르면서 바로 이어 물어도 됩니다.`
              : mic.supported
                ? "마이크를 누르고 말하면 답을 소리로 읽어 드립니다. 답은 이번 분석의 근거 그래프와 수치만 바탕으로 만들어집니다."
                : "답은 이번 분석의 근거 그래프와 수치만 바탕으로 만들어집니다. 아래 핵심 질문은 검증된 수치로 미리 준비된 답입니다."}
        </p>
        </div>
      </form>
      {/* 목소리 고르기. 누르면 그 목소리로 한 문장을 바로 읽어 준다. 선택은 이 브라우저에 저장 */}
      {voicePick && (
        <div className="dump-rise shrink-0 border-b border-[var(--cp-border)] bg-[var(--cp-panel)] px-3 py-2.5">
          <p className="mb-1.5 text-[13px] text-[var(--cp-text-dim)]">답을 읽어 주는 목소리. 누르면 한 문장을 바로 들려 드립니다</p>
          <div className="flex flex-wrap gap-1.5">
            {VOICES.map((v) => {
              const on = v.id === currentVoice.id
              return (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => pickVoice(v.id)}
                  aria-pressed={on}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[13.5px] transition-colors ${
                    on ? "border-(--dump-accent) bg-(--dump-accent)/10 font-semibold text-(--dump-accent)" : "border-[var(--cp-border)] bg-[var(--cp-panel)] text-[var(--cp-text-muted)] hover:border-(--dump-accent)"
                  }`}
                >
                  {v.label}
                  <span className="text-[12px] font-normal text-[var(--cp-text-faint)]">{v.desc}</span>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* 청취 패널. 마이크가 열려 있는 동안만. 받아적는 글자를 크게, 소리 크기를 막대로 보여 "듣고 있다"를 확실히 */}
      {listening && (
        <div className="dump-rise shrink-0 border-b border-[#b42318]/30 bg-[#b42318]/[0.04] px-4 py-3" aria-live="polite">
          <div className="flex items-center gap-3">
            <span className="dump-ring relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#b42318] text-white">
              <MicIcon />
            </span>
            <div className="dump-bars shrink-0" aria-hidden>
              {[0.35, 0.7, 1, 0.7, 0.35].map((w, i) => (
                <i key={i} style={{ height: `${Math.max(4, Math.round(30 * Math.min(1, level * (0.6 + w * 0.8))))}px` }} />
              ))}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[12.5px] font-semibold tracking-wide text-[#b42318]">{heardText ? "받아적는 중" : "듣고 있습니다"}</p>
              <p className="min-h-[1.4em] break-keep text-[21px] font-semibold leading-snug text-[var(--cp-text-strong)]">
                {heardText || <span className="font-normal text-[var(--cp-text-faint)]">말씀하시면 여기에 바로 적힙니다</span>}
              </p>
            </div>
          </div>
          <p className="mt-1.5 pl-14 text-[13px] text-[var(--cp-text-dim)]">말이 끝나면 자동으로 질문합니다 · Esc를 누르면 취소</p>
        </div>
      )}

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
            <SectionHead n="01" first>
              내가 물어본 것
            </SectionHead>
            {results.map((ex) => {
              const parts = splitAnswer(ex.a)
              const spoken = ex.pending ? parts.spoken.replace(PARTIAL_MARK, "") : parts.spoken
              const reading = readingKey === ex.q && speaker.speaking
              return (
                <div
                  key={ex.q}
                  className={`dump-rise rounded-lg border bg-[var(--cp-panel)] p-3 transition-colors ${
                    reading ? "border-(--dump-accent) shadow-[0_0_0_3px_rgba(194,65,12,0.12)]" : ex.pending ? "border-(--dump-accent)/50" : "border-[var(--cp-border)]"
                  }`}
                >
                  <div className="mb-1.5 flex items-start gap-1.5">
                    <p className="flex min-w-0 flex-1 items-start gap-1.5 text-[16px] font-semibold leading-snug text-[var(--cp-text-strong)]">
                      <span className="mt-0.5 shrink-0 rounded bg-(--dump-accent)/10 px-1.5 py-0.5 text-[12.5px] font-bold text-(--dump-accent)">
                        Q
                      </span>
                      {nb(ex.q)}
                    </p>
                    {ex.seedQ && !ex.pending && (
                      <span className="flex shrink-0 flex-wrap items-center justify-end gap-1">
                        <span
                          title={`준비된 답 「${ex.seedQ}」와 같은 뜻의 질문으로 판단해 바로 답했습니다`}
                          className="rounded-full bg-(--dump-accent)/10 px-2 py-0.5 text-[12.5px] font-semibold text-(--dump-accent)"
                        >
                          준비된 답
                        </span>
                        <button
                          type="button"
                          onClick={() => void askFree(ex.q, false, { force: true })}
                          className="rounded-full border border-[var(--cp-border)] px-2 py-0.5 text-[12.5px] text-[var(--cp-text-muted)] hover:border-(--dump-accent) hover:text-(--dump-accent)"
                        >
                          모델에게 새로 묻기
                        </button>
                      </span>
                    )}
                    {ex.aborted && (
                      <button
                        type="button"
                        onClick={() => void askFree(ex.q)}
                        title={ex.aborted === "cut" ? "답이 끝까지 오지 않아 완성 답으로 두지 않았습니다" : undefined}
                        className="shrink-0 rounded-full border border-[#8a530e]/50 px-2 py-0.5 text-[13px] text-[#8a530e]"
                      >
                        {ex.aborted === "cut" ? "끊김 · 다시 묻기" : "중단됨 · 다시 묻기"}
                      </button>
                    )}
                    {reading && (
                      <span className="flex shrink-0 items-center gap-1.5 text-[13px] font-semibold text-(--dump-accent)" aria-live="off">
                        <span className="dump-eq" aria-hidden>
                          <i />
                          <i />
                          <i />
                          <i />
                        </span>
                        읽는 중
                      </span>
                    )}
                    {!ex.pending && spoken && readButton(ex.q, ex.a)}
                  </div>
                  {ex.pending && !spoken ? (
                    <ThinkingIndicator phase={phase} />
                  ) : (
                    <div className={`text-[17px] leading-relaxed text-[var(--cp-text)] ${ex.pending ? "dump-caret" : ""}`}>
                      {renderAnswer(spoken)}
                    </div>
                  )}
                  {parts.detail && renderDetail(parts.detail, ex.pending ? undefined : asof)}
                </div>
              )
            })}
          </section>
        )}

        {/* 핵심 질의응답 아코디언. 첫 항목 펼침, 나머지 접힘 */}
        <section>
          <SectionHead n={results.length > 0 ? "02" : "01"} first={results.length === 0} sub="누르면 펼쳐집니다. 검증된 수치로 미리 준비된 답입니다">
            핵심 질의응답 {seeds.length > 0 ? `${seeds.length}` : ""}
            {allSeeds.length > seeds.length ? ` / ${allSeeds.length}` : ""}
          </SectionHead>
          {seeds.length === 0 && <p className="text-[15.5px] text-[var(--cp-text-dim)]">데이터를 불러오는 중</p>}
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
                      {!open && <span className="block truncate text-[14.5px] text-[var(--cp-text-dim)]">{nb(s.hint)}</span>}
                    </span>
                    {onMap && (
                      <span className="shrink-0 rounded bg-(--dump-accent) px-1.5 py-0.5 text-[12.5px] font-semibold text-white">
                        지도 반영 중
                      </span>
                    )}
                  </button>
                  {open && (
                    <div className="flex flex-col gap-2 border-t border-[var(--cp-border-faint)] px-3 pb-3 pt-2.5">
                      <div className="flex justify-end">
                        {readButton(s.q, seedSpoken(s))}
                      </div>
                      <div className="text-[16px] leading-relaxed text-[var(--cp-text)]">{renderAnswer(s.answer)}</div>
                      {s.detail && renderDetail(s.detail, asof)}
                      {s.chart && data && (
                        <button
                          onClick={() => setBigChart(s.chart!)}
                          title="누르면 크게 보입니다"
                          className="rounded-lg border border-[var(--cp-border)] bg-[var(--cp-panel)] p-2.5 text-left transition-shadow hover:border-(--dump-accent)/60"
                        >
                          <span className="mb-1 flex items-baseline justify-between">
                            <b className="text-[14.5px] text-[var(--cp-text-strong)]">{chartTitle(s.chart, data)}</b>
                            <span className="text-[13.5px] text-(--dump-accent)">크게 보기 +</span>
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
                              onMap ? "border border-(--dump-accent)/30 bg-(--dump-accent)/8 text-(--dump-accent)" : "border border-(--dump-accent) text-(--dump-accent) hover:bg-(--dump-accent)/8"
                            }`}
                          >
                            <span className="text-[15.5px] font-semibold">{onMap ? "✓ 지도에 반영됨" : "지도에서 확인"}</span>
                            {!onMap && vizDesc && (
                              <span className="text-[13.5px] font-normal leading-snug opacity-85">{vizDesc}</span>
                            )}
                          </button>
                          {onMap && s.vizNote && (
                            <p className="rounded-lg border border-dashed border-(--dump-accent)/40 bg-(--dump-accent)/5 px-2.5 py-1.5 text-[14.5px] leading-snug text-(--dump-accent)">
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
          {allSeeds.length > seeds.length && (
            <button
              type="button"
              onClick={() => setMoreSeeds(true)}
              className="mt-2 w-full rounded-lg border border-dashed border-[var(--cp-border-strong)] py-2 text-[14.5px] font-medium text-(--dump-accent) hover:bg-[var(--cp-hover)]"
            >
              질문 {allSeeds.length - seeds.length}개 더 보기 (검증·자료 질문)
            </button>
          )}
          <p className="mt-2 text-[14px] leading-relaxed text-[var(--cp-text-faint)]">
            준비된 답은 발견 탭과 같은 수치를 씁니다{asof ? `(자료 기준 ${asof})` : ""}. 더 깊은 근거는 발견·데이터 탭에 있습니다.
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

// LLM이 첫 글자를 내기까지(사고형 모델은 5~12초) 멈춘 듯 보이지 않게. 실제 단계가 아닌 연출 문구("노드를 찾는 중")는
// 심사에서 "정말 그래프를 탐색하나"를 부른다(10라운드). 사실인 것만 보인다: 응답 머리가 오기 전(질문 전송·모델 연결)과
// 온 뒤(첫 문장 대기)의 두 단계 + 경과 시간(12라운드). 서버는 모델 연결이 열린 뒤에야 응답 머리를 보낸다
type ThinkPhase = "sending" | "writing"
const PHASE_LABEL: Record<ThinkPhase, string> = {
  sending: "질문을 서버로 보내는 중",
  writing: "모델이 생각하고 첫 문장을 쓰는 중",
}

function ThinkingIndicator({ phase }: { phase: ThinkPhase }) {
  const [t, setT] = useState(0)
  useEffect(() => {
    const t0 = Date.now()
    const id = window.setInterval(() => setT(Date.now() - t0), 500)
    return () => window.clearInterval(id)
  }, [])
  return (
    <div className="flex flex-col gap-2.5 py-1" role="status" aria-label="답변 생성 중">
      <div className="flex items-center gap-2.5 text-[15px] font-semibold text-(--dump-accent)">
        <span className="dump-dots" aria-hidden>
          <i />
          <i />
          <i />
        </span>
        <span>{PHASE_LABEL[phase]} · {Math.floor(t / 1000)}초</span>
      </div>
      {/* 두 단계 진행 표시. 채워진 칸이 지금 단계 */}
      <div className="flex items-center gap-1.5 text-[12.5px] text-[var(--cp-text-dim)]" aria-hidden>
        {(["sending", "writing"] as ThinkPhase[]).map((p, i) => (
          <span key={p} className="flex items-center gap-1.5">
            <i className={`h-1.5 w-8 rounded-full ${phase === p ? "dump-breathe bg-(--dump-accent)" : i < ["sending", "writing"].indexOf(phase) ? "bg-(--dump-accent)/50" : "bg-[var(--cp-hover2)]"}`} />
            {i === 0 ? "전송" : "생각·작성"}
          </span>
        ))}
        <span className="ml-1">· Esc 중단</span>
      </div>
      <div className="flex flex-col gap-2" aria-hidden>
        <div className="dump-skel w-[92%]" />
        <div className="dump-skel w-[78%]" style={{ animationDelay: "0.15s" }} />
        <div className="dump-skel w-[60%]" style={{ animationDelay: "0.3s" }} />
      </div>
    </div>
  )
}

const EarIcon = () => <Ico name="ear" size={15} />
const MicIcon = () => <Ico name="mic" size={17} />
const SpeakerIcon = ({ muted = false }: { muted?: boolean }) => <Ico name={muted ? "speakerOff" : "speaker"} size={16} />
