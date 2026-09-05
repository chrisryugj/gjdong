"use client"

import type { OntoGraph } from "@/lib/dumping/types"
import { relLabel, typeLabel } from "@/lib/dumping/labels"
import { CLASSES, RELATIONS } from "@/lib/dumping/schema"
import { SPACE_COLOR, SPACE_KO } from "./ontology-graph"
import ModalShell from "./modal-shell"

// 온톨로지 스키마. 클래스 14·관계 22의 정의와 도메인→레인지. 그래프가 무엇을 뜻하는지 한 장으로.
// 정의는 lib/dumping/schema.ts, 표시명은 labels.ts가 정본이라 여기서는 그리기만 한다.

const KIND_KO: Record<string, string> = {
  structure: "구조·소유",
  evidence: "증거·계보",
  association: "요인·연관",
  intervention: "개입",
  governance: "법령·절차",
}

export default function OntoSchemaModal({ graph, onClose }: { graph: OntoGraph; onClose: () => void }) {
  const countByType = new Map<string, number>()
  for (const n of graph.nodes) countByType.set(n.type, (countByType.get(n.type) ?? 0) + 1)
  const countByRel = new Map<string, number>()
  for (const e of graph.edges) countByRel.set(e.rel, (countByRel.get(e.rel) ?? 0) + 1)

  return (
    <ModalShell
      size="xl"
      title="온톨로지 스키마"
      sub={`클래스 ${CLASSES.length} · 관계 ${RELATIONS.length} · 지금 그래프는 지식 ${graph.nodes.length}개 연결 ${graph.edges.length}개`}
      onClose={onClose}
    >
      <h3 className="mb-1.5 text-[13px] font-semibold tracking-wide text-[var(--cp-text-dim)]">클래스 (노드 종류)</h3>
      <div className="mb-4 flex flex-col gap-1">
        {CLASSES.map((c) => (
          <div key={c.type} className="flex items-start gap-2 rounded-lg border border-[var(--cp-border-faint)] px-2.5 py-1.5">
            <i className="mt-1.5 h-2 w-2 shrink-0 rounded-full" style={{ background: SPACE_COLOR[c.space] }} />
            <div className="min-w-0 flex-1">
              <p className="text-[13.5px]">
                <b className="text-[var(--cp-text-strong)]">{typeLabel(c.type)}</b>
                <span className="ml-1.5 font-mono text-[12px] text-[var(--cp-text-faint)]">{c.type}</span>
                <span className="ml-1.5 text-[12px] text-[var(--cp-text-dim)]">{SPACE_KO[c.space]}</span>
                <span className="ml-1.5 font-mono text-[12px] text-[var(--cp-text-dim)]">×{countByType.get(c.type) ?? 0}</span>
              </p>
              <p className="text-[12.5px] leading-relaxed text-[var(--cp-text-muted)]">{c.def}</p>
            </div>
          </div>
        ))}
      </div>

      <h3 className="mb-1.5 text-[13px] font-semibold tracking-wide text-[var(--cp-text-dim)]">관계 (엣지 종류) · 출발 → 도착</h3>
      <div className="flex flex-col gap-1">
        {RELATIONS.map((r) => (
          <div key={r.rel} className="rounded-lg border border-[var(--cp-border-faint)] px-2.5 py-1.5">
            <p className="flex flex-wrap items-baseline gap-x-1.5 text-[13.5px]">
              <b className="text-[var(--cp-text-strong)]">{relLabel(r.rel)}</b>
              <span className="font-mono text-[12px] text-[var(--cp-text-faint)]">{r.rel}</span>
              <span className="rounded bg-[var(--cp-hover2)] px-1.5 py-0.5 text-[11px] text-[var(--cp-text-dim)]">{KIND_KO[r.kind]}</span>
              <span className="font-mono text-[12px] text-[var(--cp-text-dim)]">×{countByRel.get(r.rel) ?? 0}</span>
            </p>
            <p className="font-mono text-[11.5px] text-[var(--cp-text-dim)]">
              {r.domain.map(typeLabel).join("|")} → {r.range.map(typeLabel).join("|")}
            </p>
            <p className="text-[12.5px] leading-relaxed text-[var(--cp-text-muted)]">{r.def}</p>
          </div>
        ))}
      </div>
      <p className="mt-3 text-[12px] leading-relaxed text-[var(--cp-text-faint)]">
        개입의 효과는 노드가 아니라 판정 엣지(lowers·stabilizes)의 status에 두고, 철회된 항목은 지우지 않고 retracted
        사유와 신뢰도 0으로 남깁니다. 그래프가 &quot;효과 있다&quot;를 단언하지 않게 만든 규약입니다.
      </p>
    </ModalShell>
  )
}
