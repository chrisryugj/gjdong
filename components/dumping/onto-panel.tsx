"use client"

import { useMemo, useState } from "react"
import type { OntoGraph, OntoNode } from "@/lib/dumping/types"
import { helpForKeys, propLabel, relLabel, typeLabel } from "@/lib/dumping/labels"
import { SPACE_COLOR, SPACE_KO } from "./ontology-graph"

// 온톨로지 탭 좌측 — 지식그래프 전체 탐색.
// 검색·영역 필터·노드 목록과, 고른 노드의 속성·관계를 따라가는 상세 카드로 이루어진다.
// 정책 관점으로 정리한 화면은 정책 제안 탭(policy-board.tsx)이 맡는다.

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
    return <div className="p-4 text-base text-[var(--cp-text-dim)]">지식그래프를 불러오는 중입니다…</div>
  }

  const detailCard = selected ? (
    <div className="rounded-xl border border-[var(--cp-border)] bg-[var(--cp-panel)] p-3">
      <div className="mb-1.5 flex items-start justify-between gap-2">
        <span
          className="mt-1 inline-flex shrink-0 items-center gap-1.5 rounded px-1.5 py-0.5 text-[12px] font-medium"
          style={{ background: `${SPACE_COLOR[selected.space]}22`, color: SPACE_COLOR[selected.space] }}
        >
          <i className="h-1.5 w-1.5 rounded-full" style={{ background: SPACE_COLOR[selected.space] }} />
          {SPACE_KO[selected.space] ?? selected.space} · {typeLabel(selected.type)}
        </span>
        <button
          onClick={() => onSelect(null)}
          className="text-[13px] text-[var(--cp-text-dim)] hover:text-[var(--cp-text)]"
        >
          닫기
        </button>
      </div>
      <h4 className="text-[16px] font-semibold leading-snug text-[var(--cp-text-strong)]">
        {selected.label}
      </h4>
      {(() => {
        // p값이 있으면 유의/비유의 판정 배지 — 숫자만 판정 (">0.5" 같은 문자열은 비유의로)
        if (selected.props.retracted !== undefined) return null
        const raw = selected.props.p_value ?? selected.props.p
        if (raw === undefined) return null
        const num = typeof raw === "number" ? raw : parseFloat(String(raw).replace(/[^0-9.]/g, ""))
        if (Number.isNaN(num)) return null
        const sig = num < 0.05
        return (
          <span
            className={`mt-1.5 inline-block rounded px-2 py-0.5 text-[12px] font-semibold ${
              sig ? "bg-[#0c6155]/12 text-[#0a4a41]" : "bg-[var(--cp-hover2)] text-[var(--cp-text-dim)]"
            }`}
          >
            {sig ? "✓ 통계적으로 유의 (우연 아님)" : "유의하지 않음 (우연 가능성)"}
          </span>
        )
      })()}
      {selected.props["쉬운 설명"] !== undefined && (
        <p className="mt-1.5 rounded-lg bg-[var(--cp-hover)] px-2.5 py-2 text-[14px] leading-relaxed text-[var(--cp-text)]">
          {String(selected.props["쉬운 설명"])}
        </p>
      )}
      {selected.props.retracted !== undefined && (
        <p className="mt-1.5 rounded-lg border border-red-500/40 bg-red-500/5 px-2 py-1.5 text-[13px] leading-relaxed text-red-700">
          <b>철회됨</b> · {String(selected.props.retracted)}
        </p>
      )}
      <dl className="mt-2 flex flex-col gap-1">
        {Object.entries(selected.props)
          .filter(
            ([k, v]) =>
              !["name", "statement", "summary", "retracted", "쉬운 설명"].includes(k) &&
              v !== "" &&
              v !== 0,
          )
          .map(([k, v]) => (
            <div key={k} className="flex gap-2 text-[14px]">
              <dt className="w-24 shrink-0 text-[var(--cp-text-dim)]">{propLabel(k)}</dt>
              <dd className="font-mono text-[var(--cp-text)]">{String(v)}</dd>
            </div>
          ))}
      </dl>
      {(() => {
        const keys = [
          ...Object.keys(selected.props),
          ...related.out.flatMap((e) => Object.keys(e.props ?? {})),
          ...related.into.flatMap((e) => Object.keys(e.props ?? {})),
        ]
        const helps = helpForKeys(keys)
        if (!helps.length) return null
        return (
          <div className="mt-2 rounded-lg border border-dashed border-[var(--cp-border)] px-2.5 py-2">
            <p className="mb-1 text-[12px] font-semibold text-[var(--cp-text-dim)]">쉬운 풀이</p>
            {helps.map((h) => (
              <p key={h} className="text-[13px] leading-relaxed text-[var(--cp-text-muted)]">
                {h}
              </p>
            ))}
          </div>
        )
      })()}
      {(["out", "into"] as const).map((dir) => {
        const edges = related[dir]
        if (!edges.length) return null
        return (
          <div key={dir} className="mt-3">
            <h5 className="mb-1 text-[13px] font-medium text-[var(--cp-text-dim)]">
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
                    <span className="rounded bg-[#0c6155]/10 px-1.5 py-0.5 text-[12px] font-medium text-[#0c6155]">
                      {dir === "out" ? `${relLabel(e.rel)} →` : `← ${relLabel(e.rel)}`}
                    </span>{" "}
                    <span className="text-[14px] text-[var(--cp-text)]">{other?.label ?? otherId}</span>
                    {e.props && (
                      <span className="mt-0.5 block font-mono text-[12px] text-[var(--cp-text-faint)]">
                        {Object.entries(e.props)
                          .map(([k, v]) => `${propLabel(k)} ${v}`)
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
  ) : null

  return (
    <div className="flex flex-col gap-3 p-3">
      <p className="rounded-lg border border-[var(--cp-border)] bg-[var(--cp-panel)] px-3 py-2 text-[13px] leading-relaxed text-[var(--cp-text-muted)]">
        이 상황판이 근거로 삼은 자료·주장·수단을 한 장의 지식그래프로 엮어 둔 곳입니다. 오른쪽 그래프나
        아래 목록에서 항목을 고르시면 내용과 연결 관계가 여기에 나타납니다.
      </p>

      {detailCard ?? (
        <p className="rounded-lg border border-[var(--cp-border-faint)] px-3 py-2 text-[14px] leading-relaxed text-[var(--cp-text-dim)]">
          아직 고른 항목이 없습니다. β·p값 같은 검증 수치에는 쉬운 풀이가 함께 붙습니다.
        </p>
      )}

      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="이름이나 아이디로 검색해 보세요"
        className="rounded-lg border border-[var(--cp-border)] bg-[var(--cp-panel)] px-3 py-1.5 text-[15px] text-[var(--cp-text)] placeholder:text-[var(--cp-text-faint)] focus:border-[var(--cp-border-active)] focus:outline-none"
      />
      <div className="flex flex-wrap gap-1">
        {Object.entries(SPACE_KO).map(([space, ko]) => {
          const on = spaceFilter === space
          return (
            <button
              key={space}
              onClick={() => setSpaceFilter(on ? null : space)}
              className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[13px] transition-colors ${
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
            <span className="min-w-0 flex-1 truncate text-[14px] text-[var(--cp-text)]">{n.label}</span>
            <span className="shrink-0 text-[12px] text-[var(--cp-text-faint)]">{typeLabel(n.type)}</span>
          </button>
        ))}
        {!filtered.length && (
          <p className="px-2 py-3 text-center text-[14px] text-[var(--cp-text-dim)]">
            검색 결과가 없습니다
          </p>
        )}
      </div>
    </div>
  )
}
