"use client"

import { useEffect, useRef, useState } from "react"
import type { VizAction } from "@/lib/dumping/types"

// 온톨로지 기반 LLM 질의응답 — /api/dumping/ask 평문 스트리밍 소비.
// 답변은 질문별로 캐싱: 같은 질문을 다시 누르면 API 호출 없이 해당 문답으로 점프한다.
// 예시 질문에는 지도 시각화 액션이 딸려 있어 답변과 동시에 오른쪽 지도가 바뀐다.

interface Seed {
  q: string
  viz?: VizAction
  vizNote?: string
}

const SEEDS: Seed[] = [
  {
    q: "CCTV는 어디에 놓아야 하나?",
    viz: { mode: "enf", layers: ["cctvMobile"], candidates: true },
    vizNote:
      "지도에 이동식 CCTV 현 위치(보라 점)와 재배치 후보 20곳(빨간 번호)을 표시했다. 지도 오른쪽 목록에서 후보지 주소를 볼 수 있다.",
  },
  {
    q: "작년보다 나빠졌나?",
    viz: { mode: "comp" },
    vizNote: "지도를 민원 분포로 전환했다. 민원 수치는 신고 편향이 섞여 있음에 주의.",
  },
  {
    q: "빠뜨린 대책은 없나?",
    viz: { mode: "unm" },
    vizNote: "지도를 무관리주거 밀도로 전환했다. 사람 겨냥 대책의 공백이 드러난 요인 축이다.",
  },
  {
    q: "무단투기의 최강 예측변수는?",
    viz: { mode: "unm" },
    vizNote: "지도를 무관리주거 밀도(β +0.312)로 전환했다.",
  },
  {
    q: "으슥한 골목에 많이 버리지 않나?",
    viz: { mode: "overlay" },
    vizNote: "지도를 원인+결과 겹쳐보기로 전환했다. 발생이 생활동선 위에 있는지 직접 확인해보라.",
  },
  {
    q: "재활용정거장은 효과가 있었나?",
    viz: { mode: "comp", layers: ["recycling"] },
    vizNote: "지도에 재활용정거장(초록)을 민원 분포 위에 표시했다.",
  },
  {
    q: "청소차는 어디를 청소하나?",
    viz: { routes: true },
    vizNote: "지도에 청소차 관리노선을 표시했다. 주황 굵은 선=집중관리도로(천호대로·아차산로), 회색 선=일반관리도로 14개. 도로명 기준 표시.",
  },
  { q: "계절이나 날씨에 따라 달라지나?" },
  { q: "작년과 올해 연도별 추이는?" },
]

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

interface Exchange {
  q: string
  a: string
  vizNote?: string
  pending?: boolean
}

interface QaChatProps {
  onAuthExpired: () => void
  onViz: (viz: VizAction) => void
}

export default function QaChat({ onAuthExpired, onViz }: QaChatProps) {
  const [exchanges, setExchanges] = useState<Exchange[]>([])
  const [input, setInput] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const abortRef = useRef<AbortController | null>(null)
  const itemRefs = useRef<Map<number, HTMLDivElement>>(new Map())

  useEffect(() => {
    // 스트리밍 중에는 바닥 고정
    if (busy) scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
  }, [exchanges, busy])

  useEffect(() => () => abortRef.current?.abort(), [])

  const jumpTo = (idx: number) => {
    itemRefs.current.get(idx)?.scrollIntoView({ behavior: "smooth", block: "start" })
  }

  const ask = async (question: string, seed?: Seed) => {
    const q = question.trim()
    if (!q || busy) return

    // 시각화 액션은 캐시 여부와 무관하게 적용 (질문을 다시 눌러도 지도는 다시 맞춰준다)
    if (seed?.viz) onViz(seed.viz)

    // 캐시 히트 — 재요청 없이 기존 문답으로 점프
    const cachedIdx = exchanges.findIndex((e) => e.q === q && !e.pending)
    if (cachedIdx >= 0) {
      jumpTo(cachedIdx)
      return
    }

    setError(null)
    setInput("")
    setBusy(true)
    const history = exchanges.flatMap((e) => [
      { role: "user" as const, text: e.q },
      { role: "model" as const, text: e.a },
    ]).slice(-8)
    setExchanges((xs) => [...xs, { q, a: "", vizNote: seed?.vizNote, pending: true }])
    const controller = new AbortController()
    abortRef.current = controller
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
        const data = await res.json().catch(() => null)
        throw new Error(data?.error ?? "답변 생성에 실패했습니다")
      }
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        const chunk = decoder.decode(value, { stream: true })
        setExchanges((xs) => {
          const next = [...xs]
          const last = next[next.length - 1]
          next[next.length - 1] = { ...last, a: last.a + chunk }
          return next
        })
      }
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

  const askedSet = new Set(exchanges.filter((e) => !e.pending).map((e) => e.q))

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* 예시 질문 — 답변된 건 체크 표시, 다시 누르면 캐시 점프 */}
      <div className="flex shrink-0 flex-nowrap gap-1.5 overflow-x-auto border-b border-[var(--cp-border)] p-2.5 md:flex-wrap md:overflow-visible">
        {SEEDS.map((s) => {
          const asked = askedSet.has(s.q)
          return (
            <button
              key={s.q}
              onClick={() => void ask(s.q, s)}
              disabled={busy && !asked}
              className={`shrink-0 whitespace-nowrap rounded-full border px-2.5 py-1 text-[13.5px] transition-colors disabled:opacity-40 ${
                asked
                  ? "border-[#0c6155]/50 bg-[#0c6155]/10 text-[#0c6155]"
                  : "border-[var(--cp-border)] bg-[var(--cp-panel)] text-[var(--cp-text-muted)] hover:border-[var(--cp-border-active)]"
              }`}
            >
              {asked ? "✓ " : ""}
              {s.q}
            </button>
          )
        })}
      </div>

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto p-3">
        {exchanges.length === 0 && (
          <p className="rounded-xl border border-[var(--cp-border-faint)] p-3 text-[14px] leading-relaxed text-[var(--cp-text-muted)]">
            온톨로지(59노드·76관계)와 동별 수치만 근거로 답한다. 예시 질문은 답변과 함께 오른쪽
            지도가 바뀌고, 한 번 답한 질문은 다시 눌러도 재요청 없이 그 문답으로 이동한다.
          </p>
        )}
        <div className="flex flex-col gap-4">
          {exchanges.map((ex, i) => (
            <div
              key={i}
              ref={(el) => {
                if (el) itemRefs.current.set(i, el)
                else itemRefs.current.delete(i)
              }}
              className="flex flex-col gap-1.5"
            >
              <div className="self-end rounded-2xl rounded-br-sm bg-[#0c6155]/12 px-3 py-2 text-[15px] leading-relaxed text-[var(--cp-text-strong)]" style={{ maxWidth: "92%" }}>
                {ex.q}
              </div>
              {ex.vizNote && (
                <p className="self-start rounded-lg border border-dashed border-[#0c6155]/40 bg-[#0c6155]/5 px-2.5 py-1.5 text-[13.5px] text-[#0c6155]" style={{ maxWidth: "92%" }}>
                  {ex.vizNote}
                </p>
              )}
              <div
                className="self-start whitespace-pre-wrap rounded-2xl rounded-bl-sm border border-[var(--cp-border)] bg-[var(--cp-panel)] px-3 py-2 text-[15px] leading-relaxed text-[var(--cp-text)]"
                style={{ maxWidth: "92%" }}
              >
                {renderAnswer(ex.a) || (ex.pending ? "생각 중…" : "")}
              </div>
            </div>
          ))}
        </div>
        {error && (
          <p className="mt-2 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-[14px] text-red-600">
            {error}
          </p>
        )}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault()
          void ask(input)
        }}
        className="flex shrink-0 gap-2 border-t border-[var(--cp-border)] p-2.5"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="온톨로지에 질문…"
          maxLength={500}
          className="min-w-0 flex-1 rounded-lg border border-[var(--cp-border)] bg-[var(--cp-panel)] px-3 py-2 text-[15px] text-[var(--cp-text)] placeholder:text-[var(--cp-text-faint)] focus:border-[var(--cp-border-active)] focus:outline-none"
        />
        {busy ? (
          <button
            type="button"
            onClick={() => abortRef.current?.abort()}
            className="shrink-0 rounded-lg border border-[var(--cp-border)] px-3 py-2 text-[15px] text-[var(--cp-text-muted)] hover:bg-[var(--cp-hover)]"
          >
            중단
          </button>
        ) : (
          <button
            type="submit"
            disabled={!input.trim()}
            className="shrink-0 rounded-lg bg-[#0c6155] px-3.5 py-2 text-[15px] font-medium text-white disabled:opacity-40"
          >
            질문
          </button>
        )}
      </form>
    </div>
  )
}
