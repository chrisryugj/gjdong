"use client"

import { useEffect, useMemo, useState } from "react"
import type { DumpingMapData, OntoGraph } from "@/lib/dumping/types"
import { channelGrowth, fmtRatio, regressionBetas } from "@/lib/dumping/facts"
import {
  COST_ORDER,
  costBadge,
  costRank,
  deriveLevers,
  easyVerdict,
  expectedEffect,
  FACTOR_SHORT,
  factorStats,
  joinParen,
  shortTarget,
  splitParen,
  STATUS_FALLBACK,
  STATUS_STYLE,
  type FactorStat,
  type LeverView,
} from "./lever-view"
import LeverModal from "./lever-modal"

// 정책 제안 탭. 지식그래프를 결재권자 관점("무엇을 결정하면 되나")으로 재구성한 첫 화면.
// 별도 데이터 없이 graph.json의 Lever·KPI 노드와 관계에서 전부 파생한다.
// 12라운드: 첫 화면은 둘뿐이다. 결론 두 문장(번호로 갈라 분리감)과 수치 칸 3개, 그 아래 제안 6건 카드(기대·담당·검증).
// 예전의 제안 목차·"왜 이런 제안인가"·결재용 한 장은 같은 제안이 세 번 나오던 원인이라 카드 하나로 합쳤다.
// 기존 수단 판정·성과지표는 접어 둔다(7라운드: 여섯 섹션을 한 번에 펼치면 어느 것도 읽히지 않았다).
// 카드를 누르면 제안이유 모달이 열리고, 모달에서 오른쪽 지도로 이어진다.

interface CardProps {
  lv: LeverView
  graph: OntoGraph
  stats: FactorStat[]
  onOpen: (lv: LeverView) => void
  i?: number
  n?: number // 제안 번호. 결론·모달과 같은 번호로 잇는다
}

function LeverCard({ lv, graph, stats, onOpen, i = 0, n }: CardProps) {
  const cost = costBadge(lv.costNote)
  if (lv.status === "제안") {
    // 제안 카드: 번호·이름·예산 한 줄, 밑에 기대·담당·검증 세 줄. "신규 제안"·"사전등록 후 평가"는 섹션 머리에서 한 번만 말한다.
    // 라벨 꼬리가 예산 등급과 같은 말이면(예: "(추가 예산 없음)") 배지와 겹치므로 뗀다. 다른 꼬리(대상·근거)는 그대로
    const title = cost && lv.node.label.endsWith(`(${cost.label})`) ? shortTarget(lv.node.label) : lv.node.label
    // 기대효과는 "무엇을 기대하나. 검증 전" 두 문장. 뒤 문장(한계)은 옅게 이어 붙여 한눈에 앞 문장이 먼저 읽히게
    const [expect, caveat] = expectedEffect(lv, stats).split(/\. (?=검증|효과)/)
    const rows: [string, React.ReactNode][] = [
      [
        "기대",
        <>
          {expect}
          {caveat && <span className="text-[var(--cp-text-faint)]"> · {caveat}</span>}
        </>,
      ],
      ["담당", lv.owner ? splitParen(lv.owner).main : null],
      ["검증", lv.verificationPlan ? joinParen(lv.verificationPlan) : null],
    ]
    return (
      <button
        onClick={() => onOpen(lv)}
        style={{ "--i": 8 + i } as React.CSSProperties}
        className="dump-rise rounded-xl border border-[var(--cp-border)] bg-[var(--cp-panel)] px-4 py-3.5 text-left transition-colors hover:border-[#0c6155]/60"
      >
        <span className="flex items-start gap-2.5">
          <span className="mt-[3px] w-4 shrink-0 font-mono text-[13px] text-[var(--cp-text-faint)]">{n}</span>
          <h4 className="min-w-0 flex-1 text-[17px] font-semibold leading-snug text-[var(--cp-text-strong)]">{title}</h4>
          {cost && <span className={`shrink-0 rounded px-1.5 py-0.5 text-[12.5px] font-semibold ${cost.cls}`}>{cost.label}</span>}
        </span>
        <dl className="mt-2 flex flex-col gap-1 pl-[1.625rem] text-[14px] leading-snug text-[var(--cp-text-dim)]">
          {rows
            .filter(([, v]) => v)
            .map(([k, v]) => (
              <div key={k} className="flex gap-2">
                <dt className="w-8 shrink-0 font-medium">{k}</dt>
                <dd className="min-w-0 text-[var(--cp-text-muted)]">{v}</dd>
              </div>
            ))}
        </dl>
        <span className="mt-2.5 inline-block pl-[1.625rem] text-[14px] font-semibold text-[#0c6155]">제안 이유와 지도 보기 →</span>
      </button>
    )
  }

  // 기존 수단 카드(접힌 03). 한 줄 판정이 곧 요점이라, 쉬운 설명이 있으면 그쪽을 쓴다
  const status = STATUS_STYLE[lv.status] ?? { label: lv.status, cls: "bg-slate-400 text-white" }
  const note = easyVerdict(lv, graph) ?? lv.verdictNote ?? STATUS_FALLBACK[lv.status] ?? null
  return (
    <button
      onClick={() => onOpen(lv)}
      style={{ "--i": 8 + i } as React.CSSProperties}
      className="dump-rise rounded-xl border border-[var(--cp-border)] bg-[var(--cp-panel)] px-4 py-3.5 text-left transition-colors hover:border-[#0c6155]/60"
    >
      <span className="flex flex-wrap items-center gap-1.5">
        <span className={`rounded px-1.5 py-0.5 text-[12.5px] font-bold ${status.cls}`}>{status.label}</span>
        {cost && <span className={`rounded px-1.5 py-0.5 text-[12.5px] font-semibold ${cost.cls}`}>{cost.label}</span>}
        {lv.preRegistered && (
          <span className="rounded border border-dashed border-[var(--cp-border-strong)] px-1.5 py-0.5 text-[12px] text-[var(--cp-text-dim)]">
            사전등록 후 평가
          </span>
        )}
      </span>
      <h4 className="mt-2 text-[17px] font-semibold leading-snug text-[var(--cp-text-strong)]">{lv.node.label}</h4>
      {lv.targets.length > 0 && (
        <p className="mt-1.5 flex flex-wrap items-center gap-1 text-[13.5px] text-[var(--cp-text-dim)]">
          겨냥
          {lv.targets.map((t) => (
            <span key={t.id} className="rounded-full bg-[var(--cp-hover2)] px-2 py-0.5 text-[var(--cp-text-muted)]">
              {FACTOR_SHORT[t.id] ?? t.label}
            </span>
          ))}
        </p>
      )}
      {note && <p className="mt-2 line-clamp-3 text-[15px] leading-relaxed text-[var(--cp-text-muted)]">{note}</p>}
      {(lv.owner || lv.verificationPlan) && (
        <dl className="mt-2 flex flex-col gap-0.5 text-[14px] leading-snug text-[var(--cp-text-dim)]">
          {lv.owner && (
            <div className="flex gap-2">
              <dt className="w-8 shrink-0 font-medium">담당</dt>
              <dd className="text-[var(--cp-text-muted)]">{splitParen(lv.owner).main}</dd>
            </div>
          )}
          {lv.verificationPlan && (
            <div className="flex gap-2">
              <dt className="w-8 shrink-0 font-medium">검증</dt>
              <dd className="text-[var(--cp-text-muted)]">{joinParen(lv.verificationPlan)}</dd>
            </div>
          )}
        </dl>
      )}
      <span className="mt-2.5 inline-block text-[14px] font-semibold text-[#0c6155]">검증 결과 자세히 →</span>
    </button>
  )
}

// 첫 화면 수치 칸 3개가 띄우는 지도. β는 다가구·단독 바탕, 채널고정은 민원 바탕(격자 자료에 채널 구분이 없어 앱 포함 전체),
// 상습격자는 운영·전망 탭과 같은 강조 레이어 토글. 칸 밑 문구와 지도 툴바 "반영 중" 이름이 같은 낱말을 쓰도록 여기 한 곳에
export type HeadlineId = "beta" | "fixed" | "critical"
export const HEADLINE_MAP_LABEL: Record<HeadlineId, string> = {
  beta: "다가구·단독 밀집 바탕",
  fixed: "민원 바탕(앱 포함 전체)",
  critical: "집중관리 상습격자(앱 포함)",
}

interface Headline {
  id: HeadlineId
  k: string
  v: string
  sub: string
}

interface PolicyBoardProps {
  graph: OntoGraph | null
  data: DumpingMapData | null
  onShowMap: (lever: LeverView) => void
  activeLeverId: string | null
  onHeadline: (id: HeadlineId) => void // 수치 칸 클릭 → 지도
  activeHeadline: HeadlineId | null // 지도에 반영 중인 수치 칸(β·채널고정)
  criticalOn: boolean // 상습격자 강조 레이어 상태(운영·전망 탭과 공유)
}

// 섹션 제목. 위계는 색이 아니라 번호와 hairline으로
function SectionHead({ n, children, sub }: { n: string; children: React.ReactNode; sub?: string }) {
  return (
    <div className="mb-3 border-t border-[var(--cp-border)] pt-4">
      <h3 className="flex items-baseline gap-2 text-[16px] font-bold text-[var(--cp-text-strong)]">
        <span className="font-mono text-[12px] font-normal text-[var(--cp-text-faint)]">{n}</span>
        <span>{children}</span>
      </h3>
      {sub && <p className="mt-1 pl-6 text-[13.5px] leading-relaxed text-[var(--cp-text-dim)]">{sub}</p>}
    </div>
  )
}

// 접힌 섹션. 첫 화면 밖으로 밀어 두되 한 번의 클릭으로 열린다
function Folded({ n, title, sub, children }: { n: string; title: string; sub?: string; children: React.ReactNode }) {
  return (
    <details className="group border-t border-[var(--cp-border)] pt-4">
      <summary className="flex cursor-pointer list-none items-baseline gap-2 text-[16px] font-bold text-[var(--cp-text-strong)] [&::-webkit-details-marker]:hidden">
        <span className="font-mono text-[12px] font-normal text-[var(--cp-text-faint)]">{n}</span>
        <span className="flex-1">{title}</span>
        <span className="text-[13px] font-medium text-[#0c6155] group-open:hidden">펼치기</span>
        <span className="hidden text-[13px] font-medium text-[var(--cp-text-dim)] group-open:inline">접기</span>
      </summary>
      {sub && <p className="mt-0.5 pl-6 text-[13.5px] text-[var(--cp-text-dim)]">{sub}</p>}
      <div className="mt-3">{children}</div>
    </details>
  )
}

export default function PolicyBoard({ graph, data, onShowMap, activeLeverId, onHeadline, activeHeadline, criticalOn }: PolicyBoardProps) {
  const levers = useMemo(() => (graph ? deriveLevers(graph) : []), [graph])
  const stats = useMemo(() => (graph ? factorStats(graph) : []), [graph])
  const [openLever, setOpenLever] = useState<LeverView | null>(null)

  if (!graph) {
    return <div className="p-4 text-[16px] text-[var(--cp-text-dim)]">정책 자료를 불러오는 중입니다…</div>
  }

  // 제안은 돈이 덜 드는 순. 추가 예산 없음 → 저비용 → 예산 필요 (같은 등급 안에서는 그래프 순서 유지)
  const proposals = levers.filter((l) => l.status === "제안").sort((a, b) => costRank(a) - costRank(b))
  const existing = levers.filter((l) => l.status !== "제안")
  const costCounts = COST_ORDER.map((label) => ({
    label,
    n: proposals.filter((l) => costBadge(l.costNote)?.label === label).length,
    cls: costBadge(label === "추가 예산 없음" ? "0원" : label === "저비용" ? "저비용" : "예산")?.cls ?? "",
  })).filter((c) => c.n > 0)
  const kpis = graph.nodes.filter((n) => n.type === "KPI")
  // 성과 평가에 쓰는 지표(신고편향에 덜 민감한 3종)를 앞으로
  const KPI_ORDER = ["kpi-fixed-channel", "kpi-critical-cells", "kpi-collection"]
  const kpisSorted = [...kpis].sort((a, b) => {
    const ia = KPI_ORDER.indexOf(a.id)
    const ib = KPI_ORDER.indexOf(b.id)
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib)
  })
  const active = activeLeverId ? levers.find((l) => l.node.id === activeLeverId) : null
  // 첫 화면 결론. 수치는 전부 facts 파생(문장에 박지 않는다). 꼬리표는 통계를 모르는 독자용 풀이
  const betas = regressionBetas(graph)
  const topBeta = betas[0]
  const growth = data ? channelGrowth(data) : null
  const kpi = data?.decision.kpi
  const th = kpi?.thresholds
  // 앱 제외 상습격자의 최근 분기 추이. 헤드라인 옆에 자체 성과지표의 방향을 같이 둔다(10라운드 심사 냉독: 지표가 오르는데 결론만 고정)
  const noAppTrend = (kpi?.persistentQuarterly ?? []).slice(-3).map((r) => r.criticalNoApp).filter((v): v is number => v != null)
  // 8라운드: 관측 대상(단속 적발)과 한계(발생 증가 배제 아님)를 담는다. 검토서 A1
  // 10라운드: 앱 제외 신고·순찰 적발 배율을 결론 안에 병기해 "나빠졌다고 읽기 어렵다"가 지표와 따로 놀지 않게
  // 12라운드: 결론이 둘(어디서 생기나 · 늘었나)이라 번호로 가른다. 한 문단으로 붙여 두면 둘째가 첫째의 부연으로 읽혔다
  const conclusions = [
    "단속에 잡히는 무단투기는 사람이 많은 곳이 아니라 다가구·단독주택이 몰린 골목에 더 많습니다.",
    growth
      ? `민원 증가의 대부분은 앱 신고 창구에 몰려 있습니다(앱 제외 신고 ${fmtRatio(growth.fixed)}, 순찰 적발 ${fmtRatio(growth.finesPatrol)}). 발생이 늘었는지는 이 자료로 단정할 수 없습니다.`
      : "민원 증가의 대부분은 앱 신고 창구에 몰려 있습니다. 발생이 늘었는지는 이 자료로 단정할 수 없습니다.",
  ]
  const headline: Headline[] = [
    {
      id: "beta",
      k: "다가구·단독 밀집 β",
      v: topBeta ? `${topBeta.beta > 0 ? "+" : ""}${topBeta.beta.toFixed(3)}` : "미산출",
      sub: `격자 회귀 조건 ${betas.length}개 중 적발 기록(과태료)과 가장 강하게 같이 움직임`,
    },
    {
      id: "fixed",
      k: "채널고정 민원(앱 제외)",
      v: growth ? fmtRatio(growth.fixed) : "미산출",
      sub: growth ? `${growth.baseYear}년 대비 연환산. 앱 신고 ${fmtRatio(growth.app)}, 순찰 적발 ${fmtRatio(growth.finesPatrol)}(최근 2~3개월 과소집계)` : "",
    },
    {
      id: "critical",
      k: "집중관리 상습격자(앱 제외)",
      v: kpi ? `${kpi.criticalCellsNowNoApp}곳` : "미산출",
      sub: kpi ? `${th?.months ?? 12}개월 ${th?.critical ?? 10}건 넘는 100m 칸. 분기 추이 ${noAppTrend.length ? noAppTrend.join("→") : "미산출"}, 앱 포함 ${kpi.criticalCellsNow}곳` : "",
    },
  ]

  return (
    <div className="flex flex-col gap-5 px-4 py-4">
      {/* 결론 두 줄 + 핵심 수치 3개. 첫 화면에서 답이 먼저 보이게 */}
      <section>
        <p className="dump-rise font-mono text-[12px] tracking-[0.12em] text-[var(--cp-text-faint)]">01 결론</p>
        <ol className="mt-1.5 flex flex-col">
          {conclusions.map((c, i) => (
            <li
              key={i}
              className={`dump-rise flex gap-3 ${i ? "border-t border-[var(--cp-border)] py-3.5" : "pb-3.5 pt-1"}`}
              style={{ "--i": 1 + i } as React.CSSProperties}
            >
              <span className="mt-[3px] flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#0c6155] font-mono text-[13px] font-bold text-white">
                {i + 1}
              </span>
              <h2 className="text-[19px] font-bold leading-snug text-[var(--cp-text-strong)]">{c}</h2>
            </li>
          ))}
        </ol>
        {/* 390에서는 세로로. 세 칸에 나누면 "β"가 홀로 다음 줄로 떨어진다.
            칸은 버튼: 누르면 그 수치가 가리키는 화면을 오른쪽 지도에 띄운다(운영·전망 탭 성과지표 칸과 같은 동작) */}
        <div className="mt-1 grid grid-cols-1 gap-2.5 sm:grid-cols-3 sm:gap-3">
          {headline.map((h, i) => {
            const on = h.id === "critical" ? criticalOn : activeHeadline === h.id
            return (
              <button
                key={h.k}
                type="button"
                onClick={() => onHeadline(h.id)}
                aria-pressed={on}
                className={`dump-rise relative min-w-0 rounded-r-lg py-1 pl-3 pr-2 text-left transition-colors ${
                  on ? "bg-[#0c6155]/8 ring-1 ring-[#0c6155]/40" : "hover:bg-[var(--cp-hover)]"
                }`}
                style={{ "--i": 3 + i } as React.CSSProperties}
              >
                <span
                  className={`dump-line absolute inset-y-0 left-0 w-px ${on ? "bg-[#0c6155]" : "bg-[var(--cp-border-strong)]"}`}
                  style={{ "--i": 3 + i } as React.CSSProperties}
                  aria-hidden
                />
                <span className="block break-keep text-[13px] leading-tight text-[var(--cp-text-muted)]">{h.k}</span>
                <span className="mt-1 block font-mono text-[24px] font-semibold leading-none tabular-nums text-[var(--cp-text-strong)]">
                  <CountUp text={h.v} delayMs={250 + i * 90} />
                </span>
                <span className="mt-1.5 block text-[12.5px] leading-snug text-[var(--cp-text-dim)]">{h.sub}</span>
                <span className="mt-1.5 block text-[12.5px] font-medium text-[#0c6155]">
                  {on ? (h.id === "critical" ? "지도 표시 중 · 눌러서 끄기" : "지도 표시 중") : "지도에 표시 →"}
                </span>
              </button>
            )
          })}
        </div>
      </section>

      {/* 지도 연동 상태. 어떤 제안을 지도에 띄워 두었는지 */}
      {active && (
        <p className="rounded-lg border border-[#0c6155]/40 bg-[#0c6155]/8 px-3 py-2 text-[14px] leading-relaxed text-[#0a4a41]">
          지도에 <b>{active.node.label}</b> 관련 화면을 표시하고 있습니다.
        </p>
      )}

      {/* 제안 6건. 예산 등급 순. 결론에서 바로 이어지는 "할 일" */}
      <section>
        <SectionHead
          n="02"
          sub="적발 기록과 가장 강하게 같이 움직이는 조건(다가구·단독 밀집)을 직접 겨냥하는 수단이 기존 목록에 없어 그 공백을 메웁니다. 모두 실행 전에 조치 대장에 설계를 등록한 뒤 평가하며, 예산이 들지 않는 것부터 놓았습니다. 카드를 누르면 이유와 지도가 나옵니다."
        >
          제안 {proposals.length}건
        </SectionHead>
        <p className="mb-2.5 flex flex-wrap items-center gap-1.5 pl-6 text-[12.5px]">
          {costCounts.map((c) => (
            <span key={c.label} className={`rounded px-1.5 py-0.5 font-semibold ${c.cls}`}>
              {c.label} {c.n}건
            </span>
          ))}
        </p>
        <div className="flex flex-col gap-2.5">
          {proposals.map((lv, i) => (
            <LeverCard key={lv.node.id} lv={lv} graph={graph} stats={stats} onOpen={setOpenLever} i={i} n={i + 1} />
          ))}
        </div>
      </section>

      {/* 기존 수단 판정. 접어 둔다 */}
      <Folded n="03" title={`이미 쓰고 있는 수단 ${existing.length}건의 검증 결과`} sub="CCTV 효과 철회 등. 카드를 누르면 판정 근거가 나옵니다">
        <div className="flex flex-col gap-2.5">
          {existing.map((lv) => (
            <LeverCard key={lv.node.id} lv={lv} graph={graph} stats={stats} onOpen={setOpenLever} />
          ))}
        </div>
      </Folded>

      {/* 성과지표. 무엇으로 성과를 재는가 */}
      <Folded n="04" title="성과는 이 지표로 측정합니다" sub="민원 총건수는 앱 신고 증가가 섞여 성과 평가에 쓰지 않습니다">
        <div className="flex flex-col gap-1">
          {kpisSorted.map((k) => {
            const main = KPI_ORDER.includes(k.id)
            return (
              <div key={k.id} className="flex items-center gap-2.5 rounded-lg px-2 py-1.5">
                <i className={`h-2 w-2 shrink-0 rounded-full ${main ? "bg-[#a8322a]" : "bg-[var(--cp-text-faint)]"}`} />
                <span className="min-w-0 flex-1 text-[15px] text-[var(--cp-text)]">{k.label}</span>
                {main && (
                  <span className="shrink-0 rounded bg-[#a8322a]/10 px-1.5 py-0.5 text-[12px] font-semibold text-[#a8322a]">
                    성과 평가용
                  </span>
                )}
              </div>
            )
          })}
        </div>
        <p className="mt-2 px-2 text-[13.5px] leading-relaxed text-[var(--cp-text-dim)]">
          빨간 점 세 가지(채널고정 민원·집중관리 상습격자·징수율)가 신고 편향에 덜 민감하게 성과를 측정하는 지표입니다. 상습격자 수는
          앱 민원을 포함하므로 관리수요 지표로 함께 읽어 주세요.
        </p>
      </Folded>

      {/* 원칙. CCTV 철회의 교훈 */}
      <section className="border-t border-[var(--cp-border)] pt-4">
        <h3 className="flex items-baseline gap-2 text-[16px] font-bold text-[var(--cp-text-strong)]">
          <span className="font-mono text-[12px] font-normal text-[var(--cp-text-faint)]">05</span>원칙 · 개입 사전등록(조치 대장)
        </h3>
        <p className="mt-1.5 text-[14.5px] leading-relaxed text-[var(--cp-text-muted)]">
          새로 시작하는 개입은 실행 전에 대상 격자·기간·비교 대상·판정 지표를 등록하고 평가는 등록한 설계 그대로만 합니다. 이동식 CCTV의
          효과 주장이 비교 방법 오류(평균회귀)로 철회된 뒤에 만든 재발 방지 장치입니다. 진행 상황은 운영·전망 탭의 조치 대장에서 보실 수
          있습니다.
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

// 히어로 수치가 0에서 차오른다. 문자열 안의 첫 숫자만 애니메이션하고 부호·단위("배", "곳")는 그대로 둔다
function CountUp({ text, delayMs = 0, durationMs = 900 }: { text: string; delayMs?: number; durationMs?: number }) {
  const m = /-?\d[\d,]*\.?\d*/.exec(text)
  const target = m ? Number(m[0].replace(/,/g, "")) : NaN
  const decimals = m && m[0].includes(".") ? m[0].split(".")[1].length : 0
  const grouped = !!m && m[0].includes(",")
  const [shown, setShown] = useState(Number.isFinite(target) ? 0 : target)
  useEffect(() => {
    if (!Number.isFinite(target)) return
    if (typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setShown(target)
      return
    }
    let raf = 0
    let t0 = 0
    const tick = (now: number) => {
      if (!t0) t0 = now
      const p = Math.min(1, (now - t0) / durationMs)
      const eased = 1 - Math.pow(1 - p, 3)
      setShown(target * eased)
      if (p < 1) raf = requestAnimationFrame(tick)
    }
    const timer = window.setTimeout(() => {
      raf = requestAnimationFrame(tick)
    }, delayMs)
    return () => {
      window.clearTimeout(timer)
      cancelAnimationFrame(raf)
    }
  }, [target, delayMs, durationMs])
  if (!m || !Number.isFinite(target)) return <>{text}</>
  const num = grouped ? Math.round(shown).toLocaleString() : shown.toFixed(decimals)
  return (
    <>
      {text.slice(0, m.index)}
      {num}
      {text.slice(m.index + m[0].length)}
    </>
  )
}
