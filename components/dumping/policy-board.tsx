"use client"

import { useMemo, useState } from "react"
import type { OntoGraph } from "@/lib/dumping/types"
import { costBadge, deriveLevers, STATUS_STYLE, type LeverView } from "./lever-view"
import LeverModal from "./lever-modal"

// 정책 보드 — 지식그래프를 관리자 관점("무엇을 해야 하나")으로 재구성한 뷰.
// 별도 데이터 없이 graph.json의 Lever·KPI·Policy 노드와 관계에서 전부 파생한다.
// 카드를 누르면 제안이유 모달이 열리고, 모달에서 오른쪽 3D 그래프로 이어갈 수 있다.

function LeverCard({
  lv,
  selected,
  onOpen,
}: {
  lv: LeverView
  selected: boolean
  onOpen: (lv: LeverView) => void
}) {
  const status = STATUS_STYLE[lv.status] ?? { label: lv.status, cls: "bg-slate-400 text-white" }
  const cost = costBadge(lv.costNote, undefined)
  const proposal = lv.status === "제안"
  return (
    <button
      onClick={() => onOpen(lv)}
      className={`rounded-xl border p-3 text-left transition-all hover:shadow-md ${
        selected
          ? "border-[#0c6155] bg-[#0c6155]/5 ring-2 ring-[#0c6155]/25"
          : "border-[var(--cp-border)] bg-[var(--cp-panel)]"
      }`}
    >
      <span className="mb-1 flex flex-wrap items-center gap-1.5">
        <span className={`rounded px-1.5 py-0.5 text-[11.5px] font-bold ${status.cls}`}>{status.label}</span>
        {cost && <span className={`rounded px-1.5 py-0.5 text-[11.5px] font-semibold ${cost.cls}`}>{cost.label}</span>}
        {lv.preRegistered && (
          <span className="rounded border border-dashed border-[var(--cp-border-strong)] px-1.5 py-0.5 text-[11px] text-[var(--cp-text-dim)]">
            사전등록 후 평가
          </span>
        )}
      </span>
      <h4 className="text-[15px] font-semibold leading-snug text-[var(--cp-text-strong)]">{lv.node.label}</h4>
      {lv.targets.length > 0 && (
        <p className="mt-1 flex flex-wrap items-center gap-1 text-[12.5px] text-[var(--cp-text-dim)]">
          겨냥
          {lv.targets.map((t) => (
            <span key={t.id} className="rounded-full bg-[var(--cp-hover2)] px-2 py-0.5 text-[var(--cp-text-muted)]">
              {t.label}
            </span>
          ))}
        </p>
      )}
      {lv.verdictNote && (
        <p className="mt-1.5 text-[13.5px] leading-relaxed text-[var(--cp-text-muted)]">{lv.verdictNote}</p>
      )}
      <dl className="mt-1.5 flex flex-col gap-0.5 text-[13px] text-[var(--cp-text-dim)]">
        {lv.owner && (
          <div className="flex gap-1.5">
            <dt className="shrink-0 font-medium">담당</dt>
            <dd>{lv.owner}</dd>
          </div>
        )}
        {lv.verificationPlan && (
          <div className="flex gap-1.5">
            <dt className="shrink-0 font-medium">검증</dt>
            <dd>{lv.verificationPlan}</dd>
          </div>
        )}
      </dl>
      <span className="mt-1.5 inline-block rounded-md bg-[#0c6155]/10 px-2 py-1 text-[12.5px] font-semibold text-[#0c6155]">
        {proposal ? "왜 이 사업인가 — 제안 이유 보기 →" : "검증 결과 자세히 보기 →"}
      </span>
    </button>
  )
}

interface PolicyBoardProps {
  graph: OntoGraph
  selectedId: string | null
  onSelect: (id: string | null) => void
}

export default function PolicyBoard({ graph, selectedId, onSelect }: PolicyBoardProps) {
  const levers = useMemo(() => deriveLevers(graph), [graph])
  const [openLever, setOpenLever] = useState<LeverView | null>(null)
  const proposals = levers.filter((l) => l.status === "제안")
  const existing = levers.filter((l) => l.status !== "제안")
  const kpis = graph.nodes.filter((n) => n.type === "KPI")
  // 성과 평가에 쓰는 지표(신고편향 무관 3종)를 앞으로
  const KPI_ORDER = ["kpi-fixed-channel", "kpi-critical-cells", "kpi-collection"]
  const kpisSorted = [...kpis].sort((a, b) => {
    const ia = KPI_ORDER.indexOf(a.id)
    const ib = KPI_ORDER.indexOf(b.id)
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib)
  })

  return (
    <div className="flex flex-col gap-4">
      {/* 정책 논리 요약 — 왜 이 대책들인가 */}
      <p className="rounded-xl border border-[#0c6155]/30 bg-[#0c6155]/5 px-3 py-2.5 text-[14px] leading-relaxed text-[var(--cp-text)]">
        <b className="text-[#0a4a41]">정책 논리</b> · 최강 요인은 관리주체 없는 주거
        밀도(β +0.312)이고, 사람(청년·외국인·1인세대)을 겨냥하는 대책이 비어 있었습니다. 아래 제안{" "}
        {proposals.length}건은 이 두 공백을 메우는 개입수단이며, 전부 실행 전 조치 대장에 설계를
        등록한 뒤 평가합니다.
      </p>

      {/* 신규 제안 — 무예산 먼저 */}
      <section>
        <h3 className="mb-2 text-sm font-semibold tracking-wide text-[var(--cp-text-dim)]">
          지금 검토할 제안 {proposals.length} · 카드를 누르면 제안 이유가 열립니다
        </h3>
        <div className="flex flex-col gap-2">
          {proposals.map((lv) => (
            <LeverCard key={lv.node.id} lv={lv} selected={selectedId === lv.node.id} onOpen={setOpenLever} />
          ))}
        </div>
      </section>

      {/* 기존 수단 판정 */}
      <section>
        <h3 className="mb-2 text-sm font-semibold tracking-wide text-[var(--cp-text-dim)]">
          기존 수단의 검증 결과 {existing.length}
        </h3>
        <div className="flex flex-col gap-2">
          {existing.map((lv) => (
            <LeverCard key={lv.node.id} lv={lv} selected={selectedId === lv.node.id} onOpen={setOpenLever} />
          ))}
        </div>
      </section>

      {/* 성과지표 — 무엇으로 성과를 재는가 */}
      <section>
        <h3 className="mb-2 text-sm font-semibold tracking-wide text-[var(--cp-text-dim)]">성과는 이 지표로 잽니다</h3>
        <div className="flex flex-col gap-1">
          {kpisSorted.map((k) => {
            const main = KPI_ORDER.includes(k.id)
            const on = selectedId === k.id
            return (
              <button
                key={k.id}
                onClick={() => onSelect(on ? null : k.id)}
                className={`flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-left transition-colors ${
                  on
                    ? "border-[var(--cp-border-active)] bg-[var(--cp-hover2)]"
                    : "border-transparent hover:bg-[var(--cp-hover)]"
                }`}
              >
                <i
                  className={`h-2 w-2 shrink-0 rounded-full ${main ? "bg-[#dc2626]" : "bg-[var(--cp-text-faint)]"}`}
                />
                <span className="min-w-0 flex-1 text-[14px] text-[var(--cp-text)]">{k.label}</span>
                {main && (
                  <span className="shrink-0 rounded bg-[#dc2626]/10 px-1.5 py-0.5 text-[11px] font-semibold text-[#b91c1c]">
                    성과 평가용
                  </span>
                )}
              </button>
            )
          })}
        </div>
        <p className="mt-1.5 text-[12.5px] leading-relaxed text-[var(--cp-text-faint)]">
          민원 총건수는 앱 보급 신고편향이 섞여 성과 평가에 쓰지 않는다. 빨간 점 3종(채널고정
          민원·집중관리 상습격자·징수율)이 편향 없는 평가 지표다.
        </p>
      </section>

      {/* 원칙 — CCTV 철회의 교훈 */}
      <section className="rounded-xl border border-[var(--cp-border)] p-3">
        <h3 className="text-[14px] font-bold text-[var(--cp-text-strong)]">원칙 · 개입 사전등록(조치 대장)</h3>
        <p className="mt-1 text-[13.5px] leading-relaxed text-[var(--cp-text-muted)]">
          새 개입은 실행 전에 대상 격자·기간·대조군·판정 지표를 등록하고, 평가는 등록된 설계로만
          한다. 이동식 CCTV의 효과 주장이 비교 방법 오류(평균회귀)로 철회된 뒤 만든 재발 방지
          장치다. 진행 상황은 운영·전망 탭의 조치 대장에서 볼 수 있다.
        </p>
      </section>

      <LeverModal
        lever={openLever}
        graph={graph}
        onClose={() => setOpenLever(null)}
        onShowGraph={(id) => {
          onSelect(id)
          setOpenLever(null)
        }}
      />
    </div>
  )
}
