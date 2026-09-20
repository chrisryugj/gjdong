"use client"

import { useMemo, useState } from "react"
import type { OntoGraph, OntoNode } from "@/lib/snow/types"
import { propLabel, relLabel, typeLabel } from "@/lib/snow/labels"
import { CLASSES, RELATIONS, SPACE_KO, validateGraph, type Space } from "@/lib/snow/schema"
import { lineageOf, runCompetencyQuestions } from "@/lib/snow/queries"
import { SectionHead } from "@/components/dumping/section-head"
import { SPACE_COLOR } from "./onto-graph"

// 온톨로지 탭. 고른 노드의 상세(속성·관계·근거 계보) → 온톨로지에 묻기(역량 질문 9개, 그 자리에서 계산) → 스키마 요약

interface Props {
  graph: OntoGraph | null
  selectedId: string | null
  onSelect: (id: string | null) => void
}

export default function OntoPanel({ graph, selectedId, onSelect }: Props) {
  const [openCq, setOpenCq] = useState<string | null>("cq-heat-gap")
  const cq = useMemo(() => (graph ? runCompetencyQuestions(graph) : []), [graph])
  const issues = useMemo(() => (graph ? validateGraph(graph) : []), [graph])
  if (!graph) return <div className="p-4 text-[14px] text-[var(--cp-text-dim)]">온톨로지 로딩 중…</div>
  const node = selectedId ? graph.nodes.find((n) => n.id === selectedId) : null
  const byId = new Map(graph.nodes.map((n) => [n.id, n]))
  const spaces = Object.keys(SPACE_KO) as Space[]

  return (
    <div className="px-4 pb-4 pt-3">
      <p className="dump-headline text-[21px] leading-[1.42] text-[var(--cp-text-strong)]">
        자원 {graph.nodes.filter((n) => n.type === "Lever").length}종이 취약요인 {graph.nodes.filter((n) => n.type === "Concept").length}개를 겨냥하고, 대응 단계 4개가 자원을 동원한다.{" "}
        <span className="text-[var(--cp-text-muted)]">근거는 데이터셋 {graph.nodes.filter((n) => n.type === "Dataset").length}벌에서 계산한 관측 {graph.nodes.filter((n) => n.type === "Evidence").length}건.</span>
      </p>

      {node ? (
        <NodeCard node={node} graph={graph} byId={byId} onSelect={onSelect} />
      ) : (
        <p className="mt-3 rounded-xl border border-dashed border-[var(--cp-border-strong)] px-3 py-2.5 text-[13.5px] text-[var(--cp-text-dim)]">그래프의 동그라미를 누르면 여기에 속성·관계·근거 계보가 뜬다.</p>
      )}

      <SectionHead n="01" sub="표로는 못 던지는 질문. 그래프에서 그 자리에서 계산하고, 답이 바뀌면 테스트가 먼저 깨진다">
        온톨로지에 묻기
      </SectionHead>
      <ul className="space-y-1">
        {cq.map((q) => {
          const open = openCq === q.id
          return (
            <li key={q.id} className="border-t border-[var(--cp-border-faint)] first:border-t-0">
              <button onClick={() => setOpenCq(open ? null : q.id)} aria-expanded={open} className="flex w-full items-start gap-2 py-2 text-left">
                <span className={`mt-0.5 shrink-0 rounded-full px-1.5 py-px font-mono text-[11px] font-semibold ${q.items.length ? "bg-(--dump-accent)/12 text-(--dump-accent)" : "bg-[var(--cp-track)] text-[var(--cp-text-dim)]"}`}>{q.items.length}</span>
                <span className="flex-1 text-[14px] font-semibold leading-snug text-[var(--cp-text-strong)]">{q.q}</span>
                <span className="text-[12px] text-[var(--cp-text-faint)]">{open ? "접기" : "펼치기"}</span>
              </button>
              {open && (
                <div className="pb-2.5 pl-8">
                  <p className="mb-1.5 text-[12.5px] leading-snug text-[var(--cp-text-dim)]">{q.why}</p>
                  {q.items.length ? (
                    <ul className="space-y-1">
                      {q.items.map((it) => (
                        <li key={it.id}>
                          <button onClick={() => onSelect(it.id)} className="text-left text-[13.5px] leading-snug text-[var(--cp-text)] hover:text-(--dump-accent)">
                            <span className="font-semibold">{it.label}</span>
                            {it.note && <span className="ml-1.5 text-[12.5px] text-[var(--cp-text-dim)]">{it.note}</span>}
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-[13.5px] text-[var(--cp-text-muted)]">{q.empty}</p>
                  )}
                </div>
              )}
            </li>
          )
        })}
      </ul>

      <SectionHead n="02" sub={`클래스 ${CLASSES.length}종 · 관계 ${RELATIONS.length}종 · 검증 오류 ${issues.filter((i) => i.level === "error").length} · 주의 ${issues.filter((i) => i.level === "warn").length}`}>
        스키마
      </SectionHead>
      <p className="mb-2 text-[12.5px] leading-relaxed text-[var(--cp-text-dim)]">
        타입이 붙은 프로퍼티 그래프다. OWL 공리도 추론기도 없다. 온톨로지라 부르는 근거는 셋: 클래스·관계에 정의와 도메인·레인지가 있고 그래프가 그 규약을 자동 검증한다, 역량 질문이 코드로 고정돼 답을 낸다, 자원의 효과를 단언하지 않고 겨냥(targets)과 동원(mobilizes)만 적는다.
      </p>
      <ul className="space-y-1.5">
        {spaces.map((s) => {
          const cls = CLASSES.filter((c) => c.space === s)
          const n = graph.nodes.filter((x) => x.space === s).length
          return (
            <li key={s} className="flex gap-2 text-[12.5px] leading-snug">
              <i className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: SPACE_COLOR[s] }} />
              <span>
                <b className="text-[var(--cp-text-strong)]">{SPACE_KO[s]}</b> <span className="text-[var(--cp-text-faint)]">{n}</span>
                <span className="text-[var(--cp-text-dim)]"> · {cls.map((c) => `${typeLabel(c.type)}: ${c.def}`).join(" / ")}</span>
              </span>
            </li>
          )
        })}
      </ul>
      <details className="mt-3 text-[12.5px]">
        <summary className="cursor-pointer text-[var(--cp-text-muted)]">관계 {RELATIONS.length}종 정의</summary>
        <ul className="mt-1.5 space-y-1">
          {RELATIONS.map((r) => (
            <li key={r.rel} className="text-[var(--cp-text-dim)]">
              <b className="text-[var(--cp-text)]">{relLabel(r.rel)}</b> <span className="font-mono text-[11px]">{r.rel}</span> · {r.domain.map(typeLabel).join("·")} → {r.range.map(typeLabel).join("·")} · {r.def}
            </li>
          ))}
        </ul>
      </details>
    </div>
  )
}

function NodeCard({ node, graph, byId, onSelect }: { node: OntoNode; graph: OntoGraph; byId: Map<string, OntoNode>; onSelect: (id: string | null) => void }) {
  const out = graph.edges.filter((e) => e.f === node.id)
  const inn = graph.edges.filter((e) => e.t === node.id)
  const lineage = lineageOf(graph, node.id)
  const color = SPACE_COLOR[node.space] ?? "#64748b"
  const props = Object.entries(node.props).filter(([k]) => k !== "name")
  return (
    <div className="mt-3 rounded-xl border border-[var(--cp-border-strong)] p-3">
      <div className="flex items-start gap-2">
        <span className="mt-1 rounded px-1.5 py-0.5 text-[11px] font-bold" style={{ background: `${color}22`, color }}>
          {typeLabel(node.type)}
        </span>
        <h4 className="flex-1 text-[16px] font-bold leading-snug text-[var(--cp-text-strong)]">{node.label}</h4>
        <button onClick={() => onSelect(null)} aria-label="닫기" className="text-[14px] text-[var(--cp-text-dim)]">✕</button>
      </div>
      {props.length > 0 && (
        <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-[12.5px]">
          {props.map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="text-[var(--cp-text-dim)]">{propLabel(k)}</dt>
              <dd className="break-words text-[var(--cp-text)]">{String(v)}</dd>
            </div>
          ))}
        </dl>
      )}
      {(out.length > 0 || inn.length > 0) && (
        <ul className="mt-2 space-y-0.5 border-t border-[var(--cp-border-faint)] pt-2 text-[12.5px]">
          {out.map((e, i) => (
            <li key={`o${i}`}>
              <span className="text-[var(--cp-text-dim)]">{relLabel(e.rel)} → </span>
              <button onClick={() => onSelect(e.t)} className="text-[var(--cp-text)] hover:text-(--dump-accent)">{byId.get(e.t)?.label ?? e.t}</button>
              {e.props && <span className="ml-1 text-[11.5px] text-[var(--cp-text-faint)]">{Object.entries(e.props).map(([k, v]) => `${propLabel(k)} ${v}`).join(" · ")}</span>}
            </li>
          ))}
          {inn.map((e, i) => (
            <li key={`i${i}`}>
              <button onClick={() => onSelect(e.f)} className="text-[var(--cp-text)] hover:text-(--dump-accent)">{byId.get(e.f)?.label ?? e.f}</button>
              <span className="text-[var(--cp-text-dim)]"> → {relLabel(e.rel)}</span>
              {e.props && <span className="ml-1 text-[11.5px] text-[var(--cp-text-faint)]">{Object.entries(e.props).map(([k, v]) => `${propLabel(k)} ${v}`).join(" · ")}</span>}
            </li>
          ))}
        </ul>
      )}
      {lineage.length > 0 && (
        <p className="mt-2 border-t border-[var(--cp-border-faint)] pt-2 text-[12px] leading-snug text-[var(--cp-text-dim)]">
          <span className="dump-kicker mr-1 text-[9.5px]">근거 계보</span>
          {lineage.map((l, i) => (
            <span key={l.node.id}>
              {i > 0 && " ← "}
              <button onClick={() => onSelect(l.node.id)} className="hover:text-(--dump-accent)">{l.node.label.length > 26 ? `${l.node.label.slice(0, 25)}…` : l.node.label}</button>
            </span>
          ))}
        </p>
      )}
    </div>
  )
}
