"use client"

import { useMemo, useState } from "react"
import type { OntoGraph, OntoNode } from "@/lib/dumping/types"
import { SPACE_COLOR, SPACE_KO } from "./ontology-graph"

// 온톨로지 탭 좌측: 검색·space 필터·노드 리스트 + 선택 노드 상세(속성·관계 따라가기)

const PROP_KO: Record<string, string> = {
  statement: "주장",
  summary: "요약",
  confidence: "신뢰도",
  coefficient: "표준화 β",
  p_value: "p값",
  variable: "변수명",
  definition: "정의",
  unit: "단위",
  rows: "행 수",
  industry: "구분",
  domain: "출처",
  category: "분류",
  severity: "심각도",
  probability: "확률",
  beta: "β",
  note: "노트",
}

function propLabel(k: string): string {
  return PROP_KO[k] ?? k
}

interface OntoPanelProps {
  graph: OntoGraph | null
  selectedId: string | null
  onSelect: (id: string | null) => void
}

export default function OntoPanel({ graph, selectedId, onSelect }: OntoPanelProps) {
  const [query, setQuery] = useState("")
  const [spaceFilter, setSpaceFilter] = useState<string | null>(null)

  const nodeById = useMemo(() => {
    const m = new Map<string, OntoNode>()
    for (const n of graph?.nodes ?? []) m.set(n.id, n)
    return m
  }, [graph])

  const selected = selectedId ? (nodeById.get(selectedId) ?? null) : null

  const filtered = useMemo(() => {
    if (!graph) return []
    const q = query.trim().toLowerCase()
    return graph.nodes.filter(
      (n) =>
        (!spaceFilter || n.space === spaceFilter) &&
        (!q || n.label.toLowerCase().includes(q) || n.id.includes(q)),
    )
  }, [graph, query, spaceFilter])

  const related = useMemo(() => {
    if (!graph || !selectedId) return { out: [], into: [] }
    return {
      out: graph.edges.filter((e) => e.f === selectedId),
      into: graph.edges.filter((e) => e.t === selectedId),
    }
  }, [graph, selectedId])

  if (!graph) {
    return <div className="p-4 text-sm text-[var(--cp-text-dim)]">온톨로지 로딩 중…</div>
  }

  return (
    <div className="flex flex-col gap-3 p-3">
      {selected ? (
        <div className="rounded-xl border border-[var(--cp-border)] bg-[var(--cp-panel)] p-3">
          <div className="mb-1.5 flex items-start justify-between gap-2">
            <span
              className="mt-1 inline-flex shrink-0 items-center gap-1.5 rounded px-1.5 py-0.5 text-[10px] font-medium"
              style={{ background: `${SPACE_COLOR[selected.space]}22`, color: SPACE_COLOR[selected.space] }}
            >
              <i className="h-1.5 w-1.5 rounded-full" style={{ background: SPACE_COLOR[selected.space] }} />
              {SPACE_KO[selected.space] ?? selected.space} · {selected.type}
            </span>
            <button
              onClick={() => onSelect(null)}
              className="text-[11px] text-[var(--cp-text-dim)] hover:text-[var(--cp-text)]"
            >
              닫기
            </button>
          </div>
          <h4 className="text-[14px] font-semibold leading-snug text-[var(--cp-text-strong)]">
            {selected.label}
          </h4>
          <dl className="mt-2 flex flex-col gap-1">
            {Object.entries(selected.props)
              .filter(([k, v]) => !["name", "statement", "summary"].includes(k) && v !== "" && v !== 0)
              .map(([k, v]) => (
                <div key={k} className="flex gap-2 text-[12px]">
                  <dt className="w-20 shrink-0 text-[var(--cp-text-dim)]">{propLabel(k)}</dt>
                  <dd className="font-mono text-[var(--cp-text)]">{String(v)}</dd>
                </div>
              ))}
          </dl>
          {(["out", "into"] as const).map((dir) => {
            const edges = related[dir]
            if (!edges.length) return null
            return (
              <div key={dir} className="mt-3">
                <h5 className="mb-1 text-[11px] font-medium text-[var(--cp-text-dim)]">
                  {dir === "out" ? "나가는 관계" : "들어오는 관계"} {edges.length}
                </h5>
                <div className="flex flex-col gap-1">
                  {edges.map((e, i) => {
                    const otherId = dir === "out" ? e.t : e.f
                    const other = nodeById.get(otherId)
                    return (
                      <button
                        key={i}
                        onClick={() => onSelect(otherId)}
                        className="rounded-lg border border-[var(--cp-border-faint)] px-2 py-1.5 text-left hover:bg-[var(--cp-hover)]"
                      >
                        <span className="font-mono text-[10px] text-[#39a189]">
                          {dir === "out" ? `--${e.rel}-->` : `<--${e.rel}--`}
                        </span>{" "}
                        <span className="text-[12px] text-[var(--cp-text)]">{other?.label ?? otherId}</span>
                        {e.props && (
                          <span className="mt-0.5 block font-mono text-[10px] text-[var(--cp-text-faint)]">
                            {Object.entries(e.props)
                              .map(([k, v]) => `${k}=${v}`)
                              .join(" · ")}
                          </span>
                        )}
                      </button>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <p className="rounded-lg border border-[var(--cp-border-faint)] px-3 py-2 text-[12px] leading-relaxed text-[var(--cp-text-dim)]">
          오른쪽 그래프나 아래 목록에서 노드를 고르면 속성과 관계가 여기 나온다. β·p값 같은 검증
          결과는 관계에 저장되어 있다.
        </p>
      )}

      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="노드 검색 (라벨·id)"
        className="rounded-lg border border-[var(--cp-border)] bg-[var(--cp-panel)] px-3 py-1.5 text-[13px] text-[var(--cp-text)] placeholder:text-[var(--cp-text-faint)] focus:border-[var(--cp-border-active)] focus:outline-none"
      />
      <div className="flex flex-wrap gap-1">
        {Object.entries(SPACE_KO).map(([space, ko]) => {
          const on = spaceFilter === space
          return (
            <button
              key={space}
              onClick={() => setSpaceFilter(on ? null : space)}
              className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] transition-colors ${
                on
                  ? "border-[var(--cp-border-active)] bg-[var(--cp-hover2)] text-[var(--cp-text-strong)]"
                  : "border-[var(--cp-border)] text-[var(--cp-text-muted)] hover:bg-[var(--cp-hover)]"
              }`}
            >
              <i className="h-1.5 w-1.5 rounded-full" style={{ background: SPACE_COLOR[space] }} />
              {ko}
            </button>
          )
        })}
      </div>

      <div className="flex flex-col gap-0.5">
        {filtered.map((n) => (
          <button
            key={n.id}
            onClick={() => onSelect(n.id === selectedId ? null : n.id)}
            className={`flex items-center gap-2 rounded-lg px-2 py-1.5 text-left ${
              n.id === selectedId ? "bg-[var(--cp-hover2)]" : "hover:bg-[var(--cp-hover)]"
            }`}
          >
            <i className="h-2 w-2 shrink-0 rounded-full" style={{ background: SPACE_COLOR[n.space] }} />
            <span className="min-w-0 flex-1 truncate text-[12px] text-[var(--cp-text)]">{n.label}</span>
            <span className="shrink-0 font-mono text-[10px] text-[var(--cp-text-faint)]">{n.type}</span>
          </button>
        ))}
        {!filtered.length && (
          <p className="px-2 py-3 text-center text-[12px] text-[var(--cp-text-dim)]">검색 결과 없음</p>
        )}
      </div>
    </div>
  )
}
