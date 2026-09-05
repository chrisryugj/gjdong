"use client"

import { useMemo, useState } from "react"
import type { OntoGraph } from "@/lib/dumping/types"
import { typeLabel } from "@/lib/dumping/labels"
import { runCompetencyQuestions, type CqResult } from "@/lib/dumping/queries"
import { validateGraph } from "@/lib/dumping/schema"

// 온톨로지 탭 "온톨로지에 묻기". 역량 질문 7개를 그래프 위에서 그 자리에서 계산해 보여준다.
// "표로는 못 던지는 질문"이라는 온톨로지의 존재 이유를 화면에서 증명하는 구간. 항목을 누르면 그 노드가 선택된다.

interface Props {
  graph: OntoGraph
  onSelect: (id: string | null) => void
}

function GapBadge({ r }: { r: CqResult }) {
  const ok = r.gaps === 0
  return (
    <span
      className={`shrink-0 rounded px-1.5 py-0.5 text-[11.5px] font-bold ${
        ok ? "bg-[#0c6155]/12 text-[#0a4a41]" : "bg-[#8a530e]/12 text-[#8a530e]"
      }`}
    >
      {ok ? (r.hits.length ? `${r.hits.length}건 · 공백 없음` : "공백 없음") : `공백 ${r.gaps}`}
    </span>
  )
}

export default function OntoQueries({ graph, onSelect }: Props) {
  const results = useMemo(() => runCompetencyQuestions(graph), [graph])
  const issues = useMemo(() => validateGraph(graph), [graph])
  const errors = issues.filter((i) => i.level === "error")
  const warns = issues.filter((i) => i.level === "warn")
  const [open, setOpen] = useState<string | null>(results[0]?.id ?? null)
  const labelOf = (id: string) => graph.nodes.find((n) => n.id === id)
  const gapTotal = results.reduce((a, r) => a + r.gaps, 0)

  return (
    <section className="rounded-xl border border-[var(--cp-border)] bg-[var(--cp-panel)] p-3">
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <h3 className="text-[14px] font-bold text-[var(--cp-text-strong)]">온톨로지에 묻기 · 역량 질문 {results.length}</h3>
        <span className="shrink-0 text-[12px] text-[var(--cp-text-dim)]">공백 {gapTotal}건</span>
      </div>
      <p className="mb-2 text-[12.5px] leading-relaxed text-[var(--cp-text-dim)]">
        표를 따로 보면 안 보이고 관계를 따라가야 나오는 질문들입니다. 답은 지금 그래프에서 바로 계산합니다.
      </p>
      <div className="flex flex-col gap-1">
        {results.map((r) => {
          const on = open === r.id
          return (
            <div key={r.id} className={`rounded-lg border ${on ? "border-[var(--cp-border-active)]" : "border-[var(--cp-border-faint)]"}`}>
              <button
                onClick={() => setOpen(on ? null : r.id)}
                aria-expanded={on}
                className="flex w-full items-start gap-2 px-2.5 py-2 text-left hover:bg-[var(--cp-hover)]"
              >
                <span className={`mt-0.5 shrink-0 text-[10px] text-[var(--cp-text-dim)] transition-transform ${on ? "rotate-90" : ""}`} aria-hidden>
                  ▶
                </span>
                <span className="min-w-0 flex-1 text-[13.5px] font-medium leading-snug text-[var(--cp-text)]">{r.q}</span>
                <GapBadge r={r} />
              </button>
              {on && (
                <div className="border-t border-[var(--cp-border-faint)] px-2.5 pb-2.5 pt-2">
                  <p className="mb-2 text-[12.5px] leading-relaxed text-[var(--cp-text-dim)]">{r.why}</p>
                  {r.hits.length === 0 ? (
                    <p className="text-[13px] text-[#0a4a41]">{r.empty}</p>
                  ) : (
                    <div className="flex flex-col gap-1">
                      {r.hits.map((h) => {
                        const node = labelOf(h.id)
                        return (
                          <button
                            key={h.id}
                            onClick={() => onSelect(h.id)}
                            className="rounded-md border border-[var(--cp-border-faint)] px-2 py-1.5 text-left hover:bg-[var(--cp-hover)]"
                          >
                            <span className="text-[13px] text-[var(--cp-text-strong)]">{node?.label ?? h.id}</span>
                            <span className="ml-1.5 text-[11.5px] text-[var(--cp-text-faint)]">{node ? typeLabel(node.type) : ""}</span>
                            {h.note && <span className="block text-[12px] leading-snug text-[var(--cp-text-dim)]">{h.note}</span>}
                          </button>
                        )
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
      {/* 스키마 검증. 도메인·레인지·철회 규약을 그래프가 지키는지. 오류 0이어야 정상 */}
      <p className="mt-2 text-[12px] leading-relaxed text-[var(--cp-text-faint)]">
        스키마 검증: 오류 {errors.length}건 · 주의 {warns.length}건
        {warns.length > 0 && ` (${warns.map((w) => `${w.ref}: ${w.msg}`).join(" · ")})`}
        {errors.length > 0 && ` · ${errors.map((e) => `${e.ref}: ${e.msg}`).join(" · ")}`}
      </p>
    </section>
  )
}
