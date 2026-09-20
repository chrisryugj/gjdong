"use client"

import { useMemo, useState } from "react"
import type { OntoGraph, OntoNode } from "@/lib/snow/types"
import { propLabel, relLabel, typeLabel } from "@/lib/snow/labels"
import { CLASSES, RELATIONS, validateGraph } from "@/lib/snow/schema"
import { lineageOf, runCompetencyQuestions } from "@/lib/snow/queries"
import { SectionHead } from "@/components/dumping/section-head"
import { SPACE_COLOR } from "./onto-graph"

// 근거 그래프 탭. 헤드라인은 그래프가 증명한 판단 1개. 01 판단 카드 02 데이터로 답하는 질문(기본 6 + 더 보기) 03 고른 항목 상세(속성·관계·근거 계보 세로 3단)
// 스키마 설명 문단은 데이터·방법 모달로 옮겼다. 영문 관계 id는 화면에 안 보인다

interface Props {
  graph: OntoGraph | null
  selectedId: string | null
  onSelect: (id: string | null) => void
  onOpenMethods: () => void
}

const HIDDEN_PROPS = new Set(["name", "label_initial"])

export default function OntoPanel({ graph, selectedId, onSelect, onOpenMethods }: Props) {
  const [openCq, setOpenCq] = useState<string | null>("cq-seg-gap")
  const [moreCq, setMoreCq] = useState(false)
  const cq = useMemo(() => (graph ? runCompetencyQuestions(graph) : []), [graph])
  const issues = useMemo(() => (graph ? validateGraph(graph) : []), [graph])
  if (!graph) return <div className="p-4"><div className="dump-skel h-24 rounded-xl" /></div>
  const node = selectedId ? graph.nodes.find((n) => n.id === selectedId) : null
  const byId = new Map(graph.nodes.map((n) => [n.id, n]))
  const claims = graph.nodes.filter((n) => n.type === "Claim")
  const lead = byId.get("claim-weak-gap") ?? claims[0]
  const shown = moreCq ? cq : cq.filter((c) => c.core)

  return (
    <div className="px-4 pb-4 pt-3">
      <p className="dump-headline text-[21px] leading-[1.42] text-[var(--cp-text-strong)]">{String(lead?.props.gist ?? lead?.label ?? "").split(". ")[0].replace(/\.?$/, ".")}</p>
      <p className="mt-1.5 text-[13.5px] leading-snug text-[var(--cp-text-muted)]">
        정의된 종류 {CLASSES.length} · 관계 {RELATIONS.length} · 규칙 위반 {issues.filter((i) => i.level === "error").length}건(자동 검사) · 질문 {cq.length}개가 코드로 고정돼 데이터가 바뀌면 답이 바뀝니다.
      </p>

      {node && <NodeCard node={node} graph={graph} byId={byId} onSelect={onSelect} />}

      <SectionHead n="01" sub="관측이 뒷받침하는 판단. 누르면 그래프가 그 판단을 가운데 둡니다">
        판단 {claims.length}
      </SectionHead>
      <ul className="space-y-1.5">
        {claims.map((c) => {
          const sup = graph.edges.filter((e) => e.rel === "supports" && e.t === c.id).length
          const on = selectedId === c.id
          return (
            <li key={c.id}>
              <button onClick={() => onSelect(on ? null : c.id)} aria-pressed={on} className={`w-full rounded-xl border px-3 py-2 text-left ${on ? "border-[var(--cp-border-active)] bg-[var(--cp-hover)]" : "border-[var(--cp-border)] hover:bg-[var(--cp-hover)]"}`}>
                <span className="block text-[14.5px] font-semibold leading-snug text-[var(--cp-text-strong)]">{c.label}</span>
                <span className="mt-0.5 block text-[13px] leading-snug text-[var(--cp-text-muted)]">{String(c.props.gist ?? "")}</span>
                <span className="mt-1 block text-[12px] text-[var(--cp-text-dim)]">뒷받침 관측 {sup}건</span>
              </button>
            </li>
          )
        })}
      </ul>

      <SectionHead n="02" sub="표로는 계산할 수 없는 질문입니다. 그래프에서 그 자리에서 계산하고 데이터가 바뀌면 답도 바뀝니다">
        데이터로 답하는 질문 {cq.length}
      </SectionHead>
      <ul className="space-y-1">
        {shown.map((q) => {
          const open = openCq === q.id
          const badge = q.badge ?? String(q.items.length)
          const hot = q.items.length > 0 && !/^(0|누락 0)/.test(badge)
          return (
            <li key={q.id} className="border-t border-[var(--cp-border-faint)] first:border-t-0">
              <button onClick={() => setOpenCq(open ? null : q.id)} aria-expanded={open} className="flex w-full items-start gap-2 py-2 text-left">
                <span className={`mt-0.5 shrink-0 rounded-full px-1.5 py-px font-mono text-[12px] font-semibold ${hot ? "bg-(--dump-accent)/12 text-(--dump-accent)" : "bg-[var(--cp-track)] text-[var(--cp-text-dim)]"}`}>{badge}</span>
                <span className="flex-1 text-[14.5px] font-semibold leading-snug text-[var(--cp-text-strong)]">{q.q}</span>
                <span className="text-[12px] text-[var(--cp-text-faint)]">{open ? "접기" : "펼치기"}</span>
              </button>
              {open && (
                <div className="pb-2.5 pl-8">
                  <p className="mb-1.5 text-[13px] leading-snug text-[var(--cp-text-dim)]">{q.why}</p>
                  {q.items.length ? (
                    <ul className="space-y-1">
                      {q.items.slice(0, 8).map((it) => (
                        <li key={it.id}>
                          <button onClick={() => onSelect(it.id)} className="text-left text-[13.5px] leading-snug text-[var(--cp-text)] hover:text-(--dump-accent)">
                            <span className="font-semibold">{it.label}</span>
                            {it.note && <span className="ml-1.5 text-[12.5px] text-[var(--cp-text-dim)]">{it.note}</span>}
                          </button>
                        </li>
                      ))}
                      {q.items.length > 8 && <li className="text-[12.5px] text-[var(--cp-text-faint)]">외 {q.items.length - 8}건</li>}
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
      {cq.length > shown.length || moreCq ? (
        <button onClick={() => setMoreCq((v) => !v)} className="mt-1 text-[13px] font-semibold text-(--dump-accent)">
          {moreCq ? "기본 질문만" : `더 보기 ${cq.length - shown.length}개`}
        </button>
      ) : null}

      <p className="mt-4 text-[13px] leading-snug text-[var(--cp-text-dim)]">
        종류·관계 정의와 검증 규칙은{" "}
        <button onClick={onOpenMethods} className="font-semibold text-(--dump-accent) underline-offset-2 hover:underline">
          데이터·방법
        </button>
        에 있습니다.
      </p>
    </div>
  )
}

function NodeCard({ node, graph, byId, onSelect }: { node: OntoNode; graph: OntoGraph; byId: Map<string, OntoNode>; onSelect: (id: string | null) => void }) {
  const out = graph.edges.filter((e) => e.f === node.id)
  const inn = graph.edges.filter((e) => e.t === node.id)
  const lineage = lineageOf(graph, node.id)
  const color = SPACE_COLOR[node.space] ?? "#64748b"
  const props = Object.entries(node.props).filter(([k]) => !HIDDEN_PROPS.has(k))
  const byType = (t: string) => lineage.filter((l) => l.node.type === t)
  const tiers: [string, OntoNode[]][] = [
    ["관측", byType("Evidence").map((l) => l.node)],
    ["데이터", byType("Dataset").map((l) => l.node)],
    ["주체", [...byType("Org"), ...byType("Team")].map((l) => l.node)],
  ]
  const many = (arr: typeof out) => arr.length > 8
  return (
    <div className="mt-3 rounded-xl border border-[var(--cp-border-strong)] p-3">
      <div className="flex items-start gap-2">
        <span className="mt-1 rounded px-1.5 py-0.5 text-[12px] font-bold" style={{ background: `${color}22`, color }}>
          {typeLabel(node.type)}
        </span>
        <h4 className="flex-1 text-[16px] font-bold leading-snug text-[var(--cp-text-strong)]">{String(node.props.name ?? node.label)}</h4>
        <button onClick={() => onSelect(null)} aria-label="닫기" className="text-[14px] text-[var(--cp-text-dim)]">✕</button>
      </div>
      {typeof node.props.gist === "string" && <p className="mt-1.5 text-[13.5px] leading-snug text-[var(--cp-text)]">{node.props.gist}</p>}
      {props.length > 0 && (
        <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-[13px]">
          {props
            .filter(([k]) => k !== "gist")
            .map(([k, v]) => (
              <div key={k} className="contents">
                <dt className="text-[var(--cp-text-dim)]">{propLabel(k)}</dt>
                <dd className="break-words text-[var(--cp-text)]">{String(v)}</dd>
              </div>
            ))}
        </dl>
      )}
      {(out.length > 0 || inn.length > 0) && (
        <details className="mt-2 border-t border-[var(--cp-border-faint)] pt-2 text-[13px]" open={!many(out) && !many(inn)}>
          <summary className="cursor-pointer text-[var(--cp-text-dim)]">관계 {out.length + inn.length}</summary>
          <ul className="mt-1 space-y-0.5">
            {out.map((e, i) => (
              <li key={`o${i}`}>
                <span className="text-[var(--cp-text-dim)]">{relLabel(e.rel)} › </span>
                <button onClick={() => onSelect(e.t)} className="text-[var(--cp-text)] hover:text-(--dump-accent)">{byId.get(e.t)?.label ?? e.t}</button>
                {e.props && <span className="ml-1 text-[12px] text-[var(--cp-text-faint)]">{Object.entries(e.props).map(([k, v]) => `${propLabel(k)} ${v}`).join(" · ")}</span>}
              </li>
            ))}
            {inn.map((e, i) => (
              <li key={`i${i}`}>
                <button onClick={() => onSelect(e.f)} className="text-[var(--cp-text)] hover:text-(--dump-accent)">{byId.get(e.f)?.label ?? e.f}</button>
                <span className="text-[var(--cp-text-dim)]"> › {relLabel(e.rel)}</span>
                {e.props && <span className="ml-1 text-[12px] text-[var(--cp-text-faint)]">{Object.entries(e.props).map(([k, v]) => `${propLabel(k)} ${v}`).join(" · ")}</span>}
              </li>
            ))}
          </ul>
        </details>
      )}
      {lineage.length > 0 && (
        <div className="mt-2 border-t border-[var(--cp-border-faint)] pt-2 text-[13px]">
          <span className="dump-kicker text-[9.5px] text-[var(--cp-text-dim)]">근거 계보</span>
          {tiers
            .filter(([, arr]) => arr.length)
            .map(([name, arr]) => (
              <div key={name} className="mt-1 flex gap-2">
                <span className="w-9 shrink-0 text-[var(--cp-text-dim)]">{name}</span>
                <span className="min-w-0 flex-1">
                  {arr.map((n, i) => (
                    <span key={n.id}>
                      {i > 0 && " · "}
                      <button onClick={() => onSelect(n.id)} className="text-[var(--cp-text)] hover:text-(--dump-accent)">{n.label}</button>
                    </span>
                  ))}
                </span>
              </div>
            ))}
        </div>
      )}
    </div>
  )
}
