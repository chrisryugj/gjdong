"use client"

import { useMemo, useState } from "react"
import type { OntoGraph } from "@/lib/dumping/types"
import {
  costBadge,
  deriveLevers,
  easyVerdict,
  FACTOR_SHORT,
  STATUS_FALLBACK,
  STATUS_STYLE,
  type LeverView,
} from "./lever-view"
import LeverModal from "./lever-modal"

// 정책 제안 탭 — 지식그래프를 관리자 관점("무엇을 해야 하나")으로 재구성한 화면.
// 별도 데이터 없이 graph.json의 Lever·KPI 노드와 관계에서 전부 파생한다.
// 카드를 누르면 제안이유 모달이 열리고, 모달에서 오른쪽 지도로 이어진다.

function LeverCard({
  lv,
  graph,
  onOpen,
}: {
  lv: LeverView
  graph: OntoGraph
  onOpen: (lv: LeverView) => void
}) {
  const status = STATUS_STYLE[lv.status] ?? { label: lv.status, cls: "bg-slate-400 text-white" }
  const cost = costBadge(lv.costNote, undefined)
  const proposal = lv.status === "제안"
  // 제안은 까닭을 모달에서 풀어 주므로 카드에는 판정 문장을 두지 않는다.
  // 기존 수단은 한 줄 판정이 곧 요점이라, 쉬운 설명이 있으면 그쪽을 쓴다.
  const note = proposal ? null : (easyVerdict(lv, graph) ?? lv.verdictNote ?? STATUS_FALLBACK[lv.status] ?? null)
  return (
    <button
      onClick={() => onOpen(lv)}
      className="rounded-xl border border-[var(--cp-border)] bg-[var(--cp-panel)] p-3 text-left transition-all hover:border-[#0c6155]/50 hover:shadow-md"
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
              {FACTOR_SHORT[t.id] ?? t.label}
            </span>
          ))}
        </p>
      )}
      {note && <p className="mt-1.5 line-clamp-3 text-[13.5px] leading-relaxed text-[var(--cp-text-muted)]">{note}</p>}
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
        {proposal ? "왜 이 사업인지 보기 →" : "검증 결과 자세히 보기 →"}
      </span>
    </button>
  )
}

interface PolicyBoardProps {
  graph: OntoGraph | null
  onShowMap: (lever: LeverView) => void
  activeLeverId: string | null
}

export default function PolicyBoard({ graph, onShowMap, activeLeverId }: PolicyBoardProps) {
  const levers = useMemo(() => (graph ? deriveLevers(graph) : []), [graph])
  const [openLever, setOpenLever] = useState<LeverView | null>(null)

  if (!graph) {
    return <div className="p-4 text-base text-[var(--cp-text-dim)]">정책 자료를 불러오는 중입니다…</div>
  }

  const proposals = levers.filter((l) => l.status === "제안")
  const existing = levers.filter((l) => l.status !== "제안")
  const kpis = graph.nodes.filter((n) => n.type === "KPI")
  // 성과 평가에 쓰는 지표(신고편향과 무관한 3종)를 앞으로
  const KPI_ORDER = ["kpi-fixed-channel", "kpi-critical-cells", "kpi-collection"]
  const kpisSorted = [...kpis].sort((a, b) => {
    const ia = KPI_ORDER.indexOf(a.id)
    const ib = KPI_ORDER.indexOf(b.id)
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib)
  })
  const active = activeLeverId ? levers.find((l) => l.node.id === activeLeverId) : null

  return (
    <div className="flex flex-col gap-4 p-3">
      {/* 정책 논리 요약 — 왜 이 대책들인가 */}
      <p className="rounded-xl border border-[#0c6155]/30 bg-[#0c6155]/5 px-3 py-2.5 text-[14px] leading-relaxed text-[var(--cp-text)]">
        <b className="text-[#0a4a41]">정책 논리</b> · 무단투기를 가장 강하게 끌어올리는 조건은 관리주체
        없는 주거의 밀도였습니다. 그런데 사람(청년·외국인·1인세대)을 겨냥하는 대책은 비어 있었습니다.
        아래 제안 {proposals.length}건은 이 두 공백을 메우는 수단이며, 모두 실행 전에 조치 대장에
        설계를 등록한 뒤 평가합니다.
      </p>

      {/* 지도 연동 상태 — 어떤 사업을 지도에 띄워 두었는지 */}
      {active && (
        <p className="rounded-lg border border-[#0c6155]/40 bg-[#0c6155]/8 px-3 py-2 text-[13px] leading-relaxed text-[#0a4a41]">
          지금 지도에는 <b>{active.node.label}</b> 관련 화면이 떠 있습니다.
        </p>
      )}

      {/* 신규 제안 — 무예산 먼저 */}
      <section>
        <h3 className="mb-2 text-sm font-semibold tracking-wide text-[var(--cp-text-dim)]">
          지금 검토할 제안 {proposals.length}건 · 카드를 누르면 제안하는 까닭이 열립니다
        </h3>
        <div className="flex flex-col gap-2">
          {proposals.map((lv) => (
            <LeverCard key={lv.node.id} lv={lv} graph={graph} onOpen={setOpenLever} />
          ))}
        </div>
      </section>

      {/* 기존 수단 판정 */}
      <section>
        <h3 className="mb-2 text-sm font-semibold tracking-wide text-[var(--cp-text-dim)]">
          이미 쓰고 있는 수단의 검증 결과 {existing.length}건
        </h3>
        <div className="flex flex-col gap-2">
          {existing.map((lv) => (
            <LeverCard key={lv.node.id} lv={lv} graph={graph} onOpen={setOpenLever} />
          ))}
        </div>
      </section>

      {/* 성과지표 — 무엇으로 성과를 재는가 */}
      <section>
        <h3 className="mb-2 text-sm font-semibold tracking-wide text-[var(--cp-text-dim)]">
          성과는 이 지표로 잽니다
        </h3>
        <div className="flex flex-col gap-1">
          {kpisSorted.map((k) => {
            const main = KPI_ORDER.includes(k.id)
            return (
              <div
                key={k.id}
                className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-left"
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
              </div>
            )
          })}
        </div>
        <p className="mt-1.5 px-1 text-[12.5px] leading-relaxed text-[var(--cp-text-faint)]">
          민원 총건수에는 앱 보급에 따른 신고 편향이 섞여 있어 성과 평가에는 쓰지 않습니다. 빨간
          점으로 표시한 세 가지(채널고정 민원·집중관리 상습격자·징수율)가 편향 없이 성과를 재는
          지표입니다.
        </p>
      </section>

      {/* 원칙 — CCTV 철회의 교훈 */}
      <section className="rounded-xl border border-[var(--cp-border)] p-3">
        <h3 className="text-[14px] font-bold text-[var(--cp-text-strong)]">원칙 · 개입 사전등록(조치 대장)</h3>
        <p className="mt-1 text-[13.5px] leading-relaxed text-[var(--cp-text-muted)]">
          새로 시작하는 개입은 실행 전에 대상 격자·기간·비교 대상·판정 지표를 등록하고, 평가는 등록한
          설계 그대로만 합니다. 이동식 CCTV의 효과 주장이 비교 방법 오류(평균회귀)로 철회된 뒤에 만든
          재발 방지 장치입니다. 진행 상황은 운영·전망 탭의 조치 대장에서 보실 수 있습니다.
        </p>
      </section>

      <LeverModal
        lever={openLever}
        graph={graph}
        onClose={() => setOpenLever(null)}
        onShowMap={(lv) => {
          onShowMap(lv)
          setOpenLever(null)
        }}
      />
    </div>
  )
}
