"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import type { SnowMapData } from "@/lib/snow/types"
import type { Finding } from "@/lib/snow/facts"
import { ASK_ACCEPT, ASK_ERR, detailLines, sentencesOf, splitAnswer, ttsClean } from "@/lib/dumping/answer-parts"
import { matchSeed } from "@/lib/dumping/seed-match"
import { useSpeechInput } from "@/components/dumping/use-voice"
import { SectionHead } from "@/components/dumping/section-head"
import { Ico } from "@/components/dumping/icons"
import { buildSeeds, type Seed } from "./ask-seeds"

// /snow 물어보기 탭(6라운드, dumping qa-chat 규약의 작은 판). 검색바에 물으면 /api/snow/ask 평문 스트리밍으로 답이 검색바 아래 내려온다(최신순).
// 답은 1부(말로 하는 답, 문장별 줄·첫 문장 굵게)와 [부연] 뒤 2부(수치·근거·한계·다음 행동 슬롯 칩). 준비된 답(ask-seeds)과 같은 뜻이면 모델을 부르지 않고 즉답(seed-match).
// 음성: 입력은 브라우저 Web Speech(ko-KR, 크롬·엣지), 읽기는 브라우저 speechSynthesis(공개 페이지라 서버 TTS는 안 쓴다). "지도에서 보기"는 발견 카드와 같은 배선(onFocus)

const DEFAULT_OPEN = 1
const BOLD_MAX = 45

interface Answer {
  id: number
  q: string
  text: string
  status: "sending" | "thinking" | "streaming" | "done" | "error"
  startedAt: number
  seed?: Seed // 준비된 답으로 즉답했을 때
  error?: string
}

function renderAnswer(text: string) {
  const ss = sentencesOf(text)
  if (!ss.length) return null
  return (
    <>
      {ss.map((s, i) => (
        <span key={i} className={`block ${i === 0 ? (s.length <= BOLD_MAX ? "font-bold text-[var(--cp-text-strong)]" : "font-semibold text-[var(--cp-text-strong)]") : "mt-1"}`}>
          {s}
        </span>
      ))}
    </>
  )
}
const SLOT_CLS: Record<string, string> = {
  수치: "bg-(--dump-accent)/12 text-(--dump-accent-ink)",
  근거: "bg-[var(--cp-hover2)] text-[var(--cp-text-muted)]",
  한계: "bg-[#8a530e]/12 text-[#b8792a]",
  "다음 행동": "bg-(--dump-accent)/12 text-(--dump-accent-ink)",
}
function renderDetail(detail: string) {
  const ls = detailLines(detail)
  if (!ls.length) return null
  return (
    <div className="mt-2.5 border-t border-[var(--cp-border)] pt-2">
      <p className="mb-1 text-[12.5px] font-semibold tracking-wide text-[var(--cp-text-faint)]">근거 수치와 한계</p>
      <ul className="flex flex-col gap-1">
        {ls.map((l, i) => (
          <li key={i} className="flex items-start gap-2 text-[13px] leading-snug text-[var(--cp-text-muted)]">
            {l.slot && <span className={`mt-[3px] shrink-0 rounded px-1.5 py-0.5 text-[12px] font-semibold ${SLOT_CLS[l.slot] ?? ""}`}>{l.slot}</span>}
            <span className="min-w-0 flex-1">{l.text}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

// 브라우저 목소리로 1부를 읽는다(문장 단위 큐). 다시 부르면 이전 것을 끊는다
function speak(text: string, onEnd?: () => void) {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return false
  const synth = window.speechSynthesis
  synth.cancel()
  const ko = synth.getVoices().find((v) => v.lang.replace("_", "-").toLowerCase().startsWith("ko"))
  const parts = sentencesOf(ttsClean(text))
  parts.forEach((s, i) => {
    const u = new SpeechSynthesisUtterance(s)
    u.lang = "ko-KR"
    u.rate = 1.05
    if (ko) u.voice = ko
    if (i === parts.length - 1 && onEnd) u.onend = onEnd
    synth.speak(u)
  })
  return parts.length > 0
}

export default function AskPanel({ data, onFocus }: { data: SnowMapData | null; onFocus: (f: Finding["focus"] | null, label?: string) => void }) {
  const [q, setQ] = useState("")
  const [answers, setAnswers] = useState<Answer[]>([])
  const [open, setOpen] = useState<Set<number>>(() => new Set(Array.from({ length: DEFAULT_OPEN }, (_, i) => i)))
  const [showAll, setShowAll] = useState(false)
  const [speakingId, setSpeakingId] = useState<number | null>(null)
  const [now, setNow] = useState(0)
  const abortRef = useRef<AbortController | null>(null)
  const seq = useRef(0)
  const seeds = useMemo(() => (data ? buildSeeds(data) : []), [data])
  const core = seeds.filter((s) => s.core)
  const more = seeds.filter((s) => !s.core)
  const busy = answers.some((a) => a.status === "sending" || a.status === "thinking" || a.status === "streaming")
  // 생각 중 경과 초
  useEffect(() => {
    if (!busy) return
    const id = window.setInterval(() => setNow(Date.now()), 500)
    return () => window.clearInterval(id)
  }, [busy])
  const stopSpeaking = () => {
    if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel()
    setSpeakingId(null)
  }
  useEffect(() => () => stopSpeaking(), [])

  const ask = async (question: string, force = false) => {
    const text = question.trim()
    if (!text || busy) return
    setQ("")
    stopSpeaking()
    const id = ++seq.current
    // 준비된 답과 같은 뜻이면 즉답(모델 호출 0). "모델에게 새로 묻기"면 건너뛴다
    const hit = force ? null : matchSeed(text, seeds)
    if (hit) {
      setAnswers((as) => [{ id, q: text, text: `${hit.seed.answer}\n[부연]\n${hit.seed.detail}`, status: "done", startedAt: Date.now(), seed: hit.seed }, ...as])
      return
    }
    const startedAt = Date.now()
    setAnswers((as) => [{ id, q: text, text: "", status: "sending", startedAt }, ...as])
    const history = answers
      .filter((a) => a.status === "done")
      .slice(0, 4)
      .reverse()
      .flatMap((a) => [
        { role: "user" as const, text: a.q },
        { role: "model" as const, text: a.text },
      ])
    const ac = new AbortController()
    abortRef.current = ac
    const patch = (p: Partial<Answer>) => setAnswers((as) => as.map((a) => (a.id === id ? { ...a, ...p } : a)))
    try {
      const r = await fetch("/api/snow/ask", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question: text, history }), signal: ac.signal })
      if (!r.ok || !r.body) {
        const j = await r.json().catch(() => null)
        patch({ status: "error", error: j?.error ?? `요청 실패(${r.status})` })
        return
      }
      const reader = r.body.getReader()
      const dec = new TextDecoder()
      let acc = ""
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        let chunk = dec.decode(value, { stream: true })
        if (chunk.startsWith(ASK_ACCEPT)) {
          chunk = chunk.slice(ASK_ACCEPT.length)
          patch({ status: "thinking" })
        }
        if (chunk.startsWith(ASK_ERR)) {
          patch({ status: "error", error: chunk.slice(ASK_ERR.length) })
          return
        }
        if (!chunk) continue
        acc += chunk
        patch({ text: acc, status: "streaming" })
      }
      patch({ status: acc.trim() ? "done" : "error", error: acc.trim() ? undefined : "빈 답이 왔습니다. 다시 물어봐 주세요." })
    } catch (e) {
      if ((e as Error).name === "AbortError") patch({ status: "error", error: "중단했습니다." })
      else patch({ status: "error", error: "네트워크 오류입니다." })
    } finally {
      abortRef.current = null
    }
  }
  const speech = useSpeechInput((t) => {
    setQ(t)
    void ask(t)
  })
  // Esc: 듣기 취소·생성 중단·읽기 멈춤
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return
      if (speech.listening) speech.cancel()
      abortRef.current?.abort()
      stopSpeaking()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [speech])

  const toggleSpeak = (a: Answer) => {
    if (speakingId === a.id) {
      stopSpeaking()
      return
    }
    const { spoken } = splitAnswer(a.text)
    if (speak(spoken, () => setSpeakingId(null))) setSpeakingId(a.id)
  }

  return (
    <div className="px-4 pb-4 pt-3">
      <p className="dump-headline text-[21px] leading-[1.42] text-[var(--cp-text-strong)]">이 화면의 자료로만 답합니다.</p>
      <p className="mt-1.5 text-[14px] leading-snug text-[var(--cp-text-muted)]">취약구간·자원·단계·조례·비용을 물어보시면 됩니다. 자료에 없는 것은 없다고 답합니다.</p>

      <form
        onSubmit={(e) => {
          e.preventDefault()
          void ask(q)
        }}
        className="mt-3 flex items-center gap-2 rounded-full border border-[var(--cp-border-strong)] bg-[var(--cp-panel)] py-1 pl-4 pr-1"
      >
        <input
          value={speech.listening ? speech.interim || q : q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={speech.listening ? "듣는 중" : "예: 열선을 다 놓으면 얼마나 드나"}
          aria-label="질문"
          className="min-w-0 flex-1 bg-transparent text-[14.5px] text-[var(--cp-text-strong)] placeholder:text-[var(--cp-text-faint)] focus:outline-none"
        />
        {speech.supported && (
          <button type="button" onClick={() => (speech.listening ? speech.stop() : speech.start())} aria-pressed={speech.listening} title={speech.listening ? "듣기 끝(Esc 취소)" : "마이크로 묻기"} className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${speech.listening ? "bg-(--dump-accent) text-white" : "text-[var(--cp-text-dim)] hover:bg-[var(--cp-hover)]"}`}>
            <Ico name="mic" size={15} />
          </button>
        )}
        <button type="submit" disabled={busy || !q.trim()} aria-label="질문 보내기" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--dump-ink)] text-[var(--dump-paper)] disabled:opacity-35">
          <Ico name="arrow" size={15} />
        </button>
      </form>
      {speech.error && <p className="mt-1 text-[12.5px] text-[#b8792a]">{speech.error}</p>}

      {answers.length > 0 && (
        <div className="mt-3 flex flex-col gap-2">
          {answers.map((a) => {
            const parts = splitAnswer(a.text)
            const thinking = a.status === "sending" || a.status === "thinking"
            return (
              <div key={a.id} className="rounded-xl border border-[var(--cp-border)] bg-[var(--cp-panel)] px-3.5 py-3">
                <div className="flex items-start gap-2">
                  <p className="min-w-0 flex-1 text-[13px] font-semibold text-[var(--cp-text-dim)]">{a.q}</p>
                  {a.seed && <span className="shrink-0 rounded bg-[var(--cp-track)] px-1.5 py-0.5 text-[12px] text-[var(--cp-text-dim)]">준비된 답</span>}
                </div>
                {thinking && (
                  <p className="mt-2 text-[14px] text-[var(--cp-text-muted)]">
                    {a.status === "sending" ? "보내는 중" : "답을 만드는 중"} · {Math.max(0, Math.round((now - a.startedAt) / 1000))}초
                    <button type="button" onClick={() => abortRef.current?.abort()} className="ml-2 text-[12.5px] text-(--dump-accent) underline-offset-2 hover:underline">
                      중단(Esc)
                    </button>
                  </p>
                )}
                {a.status === "error" && <p className="mt-2 text-[14px] text-[#b8792a]">{a.error}</p>}
                {parts.spoken && <p className="mt-2 text-[15px] leading-[1.5] text-[var(--cp-text)]">{renderAnswer(parts.spoken)}</p>}
                {a.status === "streaming" && <span className="dump-caret" aria-hidden />}
                {a.status === "done" && parts.detail && renderDetail(parts.detail)}
                {a.status === "done" && (
                  <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                    <button type="button" onClick={() => toggleSpeak(a)} aria-pressed={speakingId === a.id} className={`flex h-7 items-center gap-1 rounded-full border px-2.5 text-[12.5px] font-semibold ${speakingId === a.id ? "border-(--dump-accent) text-(--dump-accent)" : "border-[var(--cp-border)] text-[var(--cp-text-muted)] hover:bg-[var(--cp-hover)]"}`}>
                      <Ico name="speaker" size={12} />
                      {speakingId === a.id ? "읽는 중, 멈춤" : "듣기"}
                    </button>
                    {a.seed?.focus && (
                      <button type="button" onClick={() => onFocus(a.seed!.focus ?? null, a.seed!.q)} className="flex h-7 items-center gap-1 rounded-full border border-[var(--cp-border)] px-2.5 text-[12.5px] font-semibold text-[var(--cp-text-muted)] hover:bg-[var(--cp-hover)]">
                        <Ico name="pin" size={12} />
                        지도에서 보기
                      </button>
                    )}
                    {a.seed && (
                      <button type="button" onClick={() => void ask(a.q, true)} disabled={busy} className="h-7 rounded-full border border-[var(--cp-border)] px-2.5 text-[12.5px] font-semibold text-[var(--cp-text-muted)] hover:bg-[var(--cp-hover)] disabled:opacity-35">
                        모델에게 새로 묻기
                      </button>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      <SectionHead n="01" sub="자주 묻는 것부터. 누르면 펼쳐지고 지도로 갑니다. 수치는 화면 자료에서 계산">
        준비된 질의응답 {core.length}
      </SectionHead>
      <div>
        {[...core, ...(showAll ? more : [])].map((s, i) => {
          const isOpen = open.has(i)
          return (
            <div key={s.q} className="border-t border-[var(--cp-border-faint)] first:border-t-0">
              <button
                type="button"
                onClick={() =>
                  setOpen((o) => {
                    const n = new Set(o)
                    if (n.has(i)) n.delete(i)
                    else n.add(i)
                    return n
                  })
                }
                aria-expanded={isOpen}
                className="flex w-full items-start gap-3 py-2.5 text-left hover:bg-[var(--cp-hover)]"
              >
                <span className="dump-idx mt-[2px] w-5 shrink-0 text-[15px] text-(--dump-accent)">{i + 1}</span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] font-semibold leading-snug text-[var(--cp-text-strong)]">{s.q}</span>
                  {!isOpen && <span className="mt-0.5 block truncate text-[13px] text-[var(--cp-text-dim)]">{s.hint}</span>}
                </span>
              </button>
              {isOpen && (
                <div className="pb-3 pl-8 pr-1">
                  <p className="text-[15px] leading-[1.5] text-[var(--cp-text)]">{renderAnswer(s.answer)}</p>
                  {renderDetail(s.detail)}
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <button type="button" onClick={() => (speak(s.answer) ? setSpeakingId(-1 - i) : null)} className="flex h-7 items-center gap-1 rounded-full border border-[var(--cp-border)] px-2.5 text-[12.5px] font-semibold text-[var(--cp-text-muted)] hover:bg-[var(--cp-hover)]">
                      <Ico name="speaker" size={12} />
                      듣기
                    </button>
                    {s.focus && (
                      <button type="button" onClick={() => onFocus(s.focus ?? null, s.q)} className="flex h-7 items-center gap-1 rounded-full border border-[var(--cp-border)] px-2.5 text-[12.5px] font-semibold text-[var(--cp-text-muted)] hover:bg-[var(--cp-hover)]">
                        <Ico name="pin" size={12} />
                        지도에서 보기
                      </button>
                    )}
                    <button type="button" onClick={() => void ask(s.q, true)} disabled={busy} className="h-7 rounded-full border border-[var(--cp-border)] px-2.5 text-[12.5px] font-semibold text-[var(--cp-text-muted)] hover:bg-[var(--cp-hover)] disabled:opacity-35">
                      모델에게 묻기
                    </button>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
      {more.length > 0 && (
        <button type="button" onClick={() => setShowAll((v) => !v)} className="mt-2 text-[13px] font-semibold text-(--dump-accent) underline-offset-2 hover:underline">
          {showAll ? "접기" : `더 보기 ${more.length}`}
        </button>
      )}
      <p className="mt-4 text-[12.5px] leading-snug text-[var(--cp-text-dim)]">모델 답은 화면 자료(근거 그래프·구간·동별 수치)만 보고 만듭니다. 분당 5회, 하루 한도가 있습니다. 준비된 답은 모델 없이 즉답합니다.</p>
    </div>
  )
}
