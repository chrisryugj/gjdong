"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import type { DumpingMapData, OntoGraph, VizAction } from "@/lib/dumping/types"
import { vizDescription } from "./map-controls"
import ModalShell from "./modal-shell"
import QaChart, { chartTitle, type ChartKind } from "./qa-chart"
import { buildSeeds, type Seed } from "./qa-seeds"

// 물어보기 탭. 지도 앱처럼 검색이 기본. 상단 검색바에 뭐든 물어보면
// /api/dumping/ask 평문 스트리밍으로 답이 검색바 바로 아래 내려온다(최신순).
// 그 아래 "핵심 질의응답" 아코디언: 첫 항목만 펼쳐진 채 시작(답 형식 예시), 나머지는 한 줄 결론(hint)만 보이고 눌러서 확장.
// 답이 미리 준비된 항목(qa-seeds.ts)은 API 호출 없이 즉시 열리고, 지도 반영은 명시적 버튼으로만 한다.

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
  const scrollRef = useRef<HTMLDivElement>(null)
  const abortRef = useRef<AbortController | null>(null)

  const seeds = useMemo(() => (data && graph ? buildSeeds(data, graph) : []), [data, graph])

  // 탭을 떠나면 진행 중인 스트림을 끊는다. 사라진 컴포넌트에 setState가 계속 날아오지 않게
  useEffect(() => () => abortRef.current?.abort(), [])

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

  const askFree = async (question: string) => {
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
      return
    }

    setError(null)
    setInput("")
    setBusy(true)
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

  const results = [...exchanges].reverse() // 검색 결과처럼 최신 답이 맨 위

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* 검색바. 지도 앱처럼 이곳이 시작점 */}
      <form
        onSubmit={(e) => {
          e.preventDefault()
          void askFree(input)
        }}
        className="shrink-0 border-b border-[var(--cp-border)] p-2.5"
      >
        <div className="flex items-center gap-1.5 rounded-full border border-[var(--cp-border)] bg-[var(--cp-panel)] py-1 pl-4 pr-1 shadow-sm transition-colors focus-within:border-[#0c6155]">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="무단투기에 대해 무엇이든 물어보세요"
            aria-label="질문"
            maxLength={500}
            className="min-w-0 flex-1 bg-transparent py-1.5 text-[15.5px] text-[var(--cp-text)] placeholder:text-[var(--cp-text-faint)] focus:outline-none"
          />
          {busy ? (
            <button
              type="button"
              onClick={() => abortRef.current?.abort()}
              className="shrink-0 rounded-full border border-[var(--cp-border)] px-3 py-1.5 text-[13.5px] text-[var(--cp-text-muted)] hover:bg-[var(--cp-hover)]"
            >
              중단
            </button>
          ) : (
            <button
              type="submit"
              disabled={!input.trim()}
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
        <p className="mt-1.5 px-2 text-[12.5px] leading-snug text-[var(--cp-text-faint)]">
          답은 이 분석의 근거 그래프와 수치만 바탕으로 만들어집니다. 아래 핵심 질문은 검증된 수치로 미리 준비된 답입니다.
        </p>
      </form>

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto p-3">
        {error && (
          <p
            role="alert"
            className="mb-2 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-[14px] text-red-600"
          >
            {error}
          </p>
        )}

        {/* 직접 질문 결과. 검색바 바로 아래, 최신순 */}
        {results.length > 0 && (
          <section className="mb-4 flex flex-col gap-2" aria-live="polite">
            <h3 className="text-sm font-semibold tracking-wide text-[var(--cp-text-dim)]">내가 물어본 것</h3>
            {results.map((ex) => (
              <div key={ex.q} className="rounded-lg border border-[var(--cp-border)] bg-[var(--cp-panel)] p-3">
                <p className="mb-1.5 flex items-start gap-1.5 text-[15px] font-semibold leading-snug text-[var(--cp-text-strong)]">
                  <span className="mt-0.5 shrink-0 rounded bg-[#0c6155]/10 px-1.5 py-0.5 text-[11px] font-bold text-[#0c6155]">
                    Q
                  </span>
                  {ex.q}
                </p>
                <div className="whitespace-pre-wrap text-[15px] leading-relaxed text-[var(--cp-text)]">
                  {renderAnswer(ex.a) || (ex.pending ? "생각 중…" : "")}
                </div>
              </div>
            ))}
          </section>
        )}

        {/* 핵심 질의응답 아코디언. 첫 항목 펼침, 나머지 접힘 */}
        <section>
          <h3 className="mb-2 text-sm font-semibold tracking-wide text-[var(--cp-text-dim)]">
            핵심 질의응답 {seeds.length > 0 ? seeds.length : ""} · 누르면 펼쳐집니다
          </h3>
          {seeds.length === 0 && <p className="text-[14px] text-[var(--cp-text-dim)]">데이터를 불러오는 중…</p>}
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
                      className={`shrink-0 text-[11px] text-[var(--cp-text-dim)] transition-transform ${open ? "rotate-90" : ""}`}
                      aria-hidden
                    >
                      ▶
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[15px] font-semibold leading-snug text-[var(--cp-text-strong)]">
                        {s.q}
                      </span>
                      {!open && <span className="block truncate text-[13px] text-[var(--cp-text-dim)]">{s.hint}</span>}
                    </span>
                    {onMap && (
                      <span className="shrink-0 rounded bg-[#0c6155] px-1.5 py-0.5 text-[11px] font-semibold text-white">
                        지도 반영 중
                      </span>
                    )}
                  </button>
                  {open && (
                    <div className="flex flex-col gap-2 border-t border-[var(--cp-border-faint)] px-3 pb-3 pt-2.5">
                      <div className="whitespace-pre-wrap text-[14.5px] leading-relaxed text-[var(--cp-text)]">
                        {renderAnswer(s.answer)}
                      </div>
                      {s.chart && data && (
                        <button
                          onClick={() => setBigChart(s.chart!)}
                          title="누르면 크게 볼 수 있습니다"
                          className="rounded-lg border border-[var(--cp-border)] bg-white p-2.5 text-left transition-shadow hover:border-[#0c6155]/60"
                        >
                          <span className="mb-1 flex items-baseline justify-between">
                            <b className="text-[13px] text-[var(--cp-text-strong)]">{chartTitle(s.chart, data)}</b>
                            <span className="text-[12px] text-[#0c6155]">크게 보기 +</span>
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
                            <span className="text-[14px] font-semibold">{onMap ? "✓ 지도에 반영됨" : "지도에서 확인"}</span>
                            {!onMap && vizDesc && (
                              <span className="text-[12px] font-normal leading-snug opacity-85">{vizDesc}</span>
                            )}
                          </button>
                          {onMap && s.vizNote && (
                            <p className="rounded-lg border border-dashed border-[#0c6155]/40 bg-[#0c6155]/5 px-2.5 py-1.5 text-[13px] leading-snug text-[#0c6155]">
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
          <p className="mt-2 text-[12.5px] leading-relaxed text-[var(--cp-text-faint)]">
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
