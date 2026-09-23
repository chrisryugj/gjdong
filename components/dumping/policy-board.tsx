"use client"

import { useMemo, useState } from "react"
import type { DumpingMapData, OntoGraph } from "@/lib/dumping/types"
import { channelGrowth, fmtRatio } from "@/lib/dumping/facts"
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
import { Folded, SectionHead } from "./section-head"
import { nb, nbParen } from "@/lib/dumping/nobreak"

// 정책 제안 탭. 지식그래프를 결재권자 관점("무엇을 결정하면 되나")으로 재구성한 첫 화면.
// 별도 데이터 없이 graph.json의 Lever·KPI 노드와 관계에서 전부 파생한다.
// 2026-09-18 지도 전면 디자인(보고서 지면 문법): 결론 첫 문장이 세리프 머리기사(두 줄), 둘째 문장은 부제(두 줄). 수치 칸은 발견·운영 탭과 겹쳐 두지 않는다.
// 제안 6건은 번호·이름·기대 한 줄·예산 등급의 목록. 가정·조치·검증은 모달(카드를 누르면)에 있다.
// 기존 수단 판정·성과지표는 접어 둔다(7라운드: 여섯 섹션을 한 번에 펼치면 어느 것도 읽히지 않았다).

// 제목 끝 괄호는 한 덩어리(inline-block). 줄에 들어가면 "(" 앞에서 통째로 다음 줄로 가고, 줄보다 길 때만 괄호 안 띄어쓰기에서 꺾인다.
// NBSP로 묶으면 좁은 폭·큰 글자에서 글자 중간이 쪼개졌고, 안 묶으면 "(화양동 외국인 / 19.4%)"처럼 끝 조각만 떨어졌다(22라운드)
function ParenTitle({ text }: { text: string }) {
  const m = /^(.*?)(\([^()]*\))$/.exec(text)
  if (!m) return <>{nbParen(text)}</>
  return (
    <>
      {m[1]}
      <span className="inline-block">{nb(m[2])}</span>
    </>
  )
}

interface RowProps {
  lv: LeverView
  graph: OntoGraph
  stats: FactorStat[]
  onOpen: (lv: LeverView) => void
  i?: number
  n?: number // 제안 번호. 결론·모달과 같은 번호로 잇는다
}

// 제안 한 줄. 번호 · 이름 · 예산 등급, 밑에 기대(가정한 작동 원리) 한 문장과 담당(두 줄 안). 겨냥 조건은 모달에
function ProposalRow({ lv, stats, onOpen, i = 0, n }: RowProps) {
  const cost = costBadge(lv.costNote)
  // 라벨 꼬리가 예산 등급과 같은 말이면(예: "(추가 예산 없음)") 배지와 겹치므로 뗀다. 다른 꼬리(대상·근거)는 그대로
  const title = cost && lv.node.label.endsWith(`(${cost.label})`) ? shortTarget(lv.node.label) : lv.node.label
  // 기대 = 가정한 작동 원리(정본 슬롯). 없으면 판정 방향 문장. 효과 크기 단정 없음
  const expect = lv.mechanismSlots?.expect ?? expectedEffect(lv, stats).split(/\. (?=검증|효과)/)[0]
  const owner = lv.owner ? splitParen(lv.owner).main : null
  return (
    <button
      onClick={() => onOpen(lv)}
      style={{ "--i": 6 + i } as React.CSSProperties}
      className="dump-rise group flex w-full items-start gap-3 border-t border-[var(--cp-border)] py-3 text-left first:border-t-0"
    >
      <span className="dump-idx mt-[2px] w-5 shrink-0 text-[15px] text-(--dump-accent)">{n}</span>
      <span className="min-w-0 flex-1">
        {/* 제안 이름은 항목 제목("제안 6건")과 같은 크기·굵기(20px bold). 사용자 지시 2026-09-22 */}
        <span className="block text-[20px] font-bold leading-tight text-[var(--cp-text-strong)] group-hover:text-(--dump-accent)">
          <ParenTitle text={title} />
        </span>
        {/* 담당 조각은 한 줄에(nowrap). "청소과·동주민센터"가 낱말 사이에서 꺾여 한 글자가 홀로 떨어지지 않게(/snow 6라운드 Meta 규약) */}
        <span className="mt-1 line-clamp-2 text-[13px] leading-snug text-[var(--cp-text-dim)]">
          {nb(expect)}
          {owner && (
            <span className="text-[var(--cp-text-faint)]">
              {" · "}
              <span className="whitespace-nowrap">{owner}</span>
            </span>
          )}
        </span>
      </span>
      {cost && <span className={`mt-[2px] shrink-0 rounded px-1.5 py-0.5 text-[12px] font-semibold ${cost.cls}`}>{cost.label}</span>}
    </button>
  )
}

// 기존 수단 한 줄(접힌 항목). 판정 배지 · 이름 · 쉬운 판정 한 줄
function ExistingRow({ lv, graph, onOpen, i = 0 }: RowProps) {
  const status = STATUS_STYLE[lv.status] ?? { label: lv.status, cls: "bg-slate-400 text-white" }
  const cost = costBadge(lv.costNote)
  const note = easyVerdict(lv, graph) ?? lv.verdictNote ?? STATUS_FALLBACK[lv.status] ?? null
  return (
    <button
      onClick={() => onOpen(lv)}
      style={{ "--i": 6 + i } as React.CSSProperties}
      className="dump-rise group flex w-full flex-col gap-1 border-t border-[var(--cp-border)] py-3 text-left first:border-t-0"
    >
      <span className="flex flex-wrap items-center gap-1.5">
        <span className={`rounded px-1.5 py-0.5 text-[12px] font-bold ${status.cls}`}>{status.label}</span>
        {cost && <span className={`rounded px-1.5 py-0.5 text-[12px] font-semibold ${cost.cls}`}>{cost.label}</span>}
        {lv.preRegistered && (
          <span className="rounded border border-dashed border-[var(--cp-border-strong)] px-1.5 py-0.5 text-[12px] text-[var(--cp-text-dim)]">사전등록 후 평가</span>
        )}
      </span>
      <span className="text-[15px] font-semibold leading-snug text-[var(--cp-text-strong)] group-hover:text-(--dump-accent)">
        <ParenTitle text={lv.node.label} />
      </span>
      {lv.targets.length > 0 && (
        <span className="flex flex-wrap items-center gap-1 text-[12.5px] text-[var(--cp-text-dim)]">
          겨냥
          {lv.targets.map((t) => (
            <span key={t.id} className="rounded-full bg-[var(--cp-hover2)] px-2 py-0.5 text-[var(--cp-text-muted)]">
              {FACTOR_SHORT[t.id] ?? t.label}
            </span>
          ))}
        </span>
      )}
      {note && <span className="line-clamp-2 text-[13.5px] leading-relaxed text-[var(--cp-text-muted)]">{nb(note)}</span>}
      {lv.verificationPlan && <span className="text-[12.5px] text-[var(--cp-text-dim)]">검증 · {joinParen(lv.verificationPlan)}</span>}
    </button>
  )
}

interface PolicyBoardProps {
  graph: OntoGraph | null
  data: DumpingMapData | null
  onShowMap: (lever: LeverView) => void
  activeLeverId: string | null
  criticalOn: boolean // 집중관리 상습격자 강조 레이어(운영·전망 탭과 공유)
  onToggleCritical: () => void
}

export default function PolicyBoard({ graph, data, onShowMap, activeLeverId, criticalOn, onToggleCritical }: PolicyBoardProps) {
  const levers = useMemo(() => (graph ? deriveLevers(graph) : []), [graph])
  const stats = useMemo(() => (graph ? factorStats(graph) : []), [graph])
  const [openLever, setOpenLever] = useState<LeverView | null>(null)

  if (!graph) {
    return <div className="p-4 text-[15px] text-[var(--cp-text-dim)]">정책 자료를 불러오는 중입니다</div>
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
  // 성과지표 현재값. 12라운드: 이름만 나열하면 결재선이 "그래서 몇 곳인데"를 못 본다. 상습격자는 지도 토글까지
  const kpiValue = (id: string): { v: string; sub: string } | null => {
    if (!data) return null
    const k = data.decision.kpi
    // 14라운드: 성과 판단 기준은 앱 제외 수. 큰 숫자가 그것이어야 한다(냉독: "32만 남는다"). 지도 강조는 앱 포함 목록
    if (id === "kpi-critical-cells")
      return { v: `${k.criticalCellsNowNoApp}곳`, sub: `앱 제외 기준 · 앱 포함 ${k.criticalCellsNow}곳(지도) · ${k.thresholds?.months ?? 12}개월 ${k.thresholds?.critical ?? 10}건 이상 100m 칸` }
    if (id === "kpi-fixed-channel") {
      const y = data.decision.channels.yearly
      const years = Object.keys(y.c120 ?? {}).sort()
      const last = years[years.length - 1]
      if (!last) return null
      const n = (y.c120?.[last] ?? 0) + (y.direct?.[last] ?? 0)
      const partial = last === data.decision.asof.slice(0, 4) ? " · 부분 집계" : ""
      return { v: `${n.toLocaleString()}건`, sub: `${last}년 120·직접 신고${partial}` }
    }
    if (id === "kpi-collection") return { v: `${data.decision.fines.collectionRatePct}%`, sub: "감면·진행 중 제외" }
    return null
  }
  const growth = data ? channelGrowth(data) : null
  // 8라운드: 관측 대상(단속 적발)과 한계(발생 증가 배제 아님)를 담는다. 검토서 A1
  // 10라운드: 앱 제외 신고·순찰 적발 배율을 결론 안에 병기해 "나빠졌다고 읽기 어렵다"가 지표와 따로 놀지 않게
  // 12라운드: 결론이 둘(어디서 생기나 · 늘었나)이라 갈라 둔다. 첫째는 머리기사, 둘째는 부제. 카드 폭 440에서 각각 두 줄 안에 들어오는 길이
  // 겨냥 지역만 형광펜. 결론에서 눈이 먼저 가야 할 낱말
  const headline = (
    <>
      단속에 잡히는 무단투기는 사람이 많은 곳보다 <mark className="dump-hl">다가구·단독주택 골목</mark>에 더 많습니다.
    </>
  )
  const deck = growth
    ? `민원 증가는 대부분 앱 신고 창구에 몰려 있습니다(앱 제외 신고 ${fmtRatio(growth.fixed)}, 순찰 적발 ${fmtRatio(growth.finesPatrol)}). 발생이 늘었는지는 단정하지 않습니다.`
    : "민원 증가는 대부분 앱 신고 창구에 몰려 있습니다. 발생이 늘었는지는 단정하지 않습니다."

  return (
    <div className="flex flex-col gap-5 px-4 py-4 md:px-5">
      {/* 결론. 첫 화면에서 답이 먼저 보이게. 머리기사 두 줄 + 부제 두 줄 */}
      <section>
        <p className="dump-kicker text-[10.5px] text-(--dump-accent)">결론{data ? ` · ${data.decision.asof} 기준` : ""}</p>
        <h2 className="dump-headline dump-rise mt-2 text-[20px] leading-[1.45] text-[var(--cp-text-strong)]" style={{ "--i": 1 } as React.CSSProperties}>
          {headline}
        </h2>
        <p className="dump-rise mt-2.5 text-[13.5px] leading-relaxed text-[var(--cp-text-muted)]" style={{ "--i": 2 } as React.CSSProperties}>
          {deck}
        </p>
        {/* 현장 피드백(2026-09-22): 신고 민원 1위 지역은 한 사람의 같은 내용 반복 신고가 급증해 실제 관리 지역과 어긋난다. 살짝만 */}
        <p className="dump-rise mt-2 text-[13px] leading-relaxed text-[var(--cp-text-dim)]" style={{ "--i": 3 } as React.CSSProperties}>
          신고 민원 1위 지역은 한 사람의 같은 내용 반복 신고가 급증한 영향이 커, 실제 관리가 필요한 지역과 다를 수 있다는 현장 의견이 있습니다. 순위는 참고로 읽어 주세요.
        </p>
      </section>

      {/* 지도 연동 상태. 어떤 제안을 지도에 띄워 두었는지 */}
      {active && (
        <p className="rounded-lg border border-(--dump-accent)/40 bg-(--dump-accent)/8 px-3 py-2 text-[13.5px] leading-relaxed text-(--dump-accent-ink)">
          지도에 <b>{active.node.label}</b> 관련 화면을 표시하고 있습니다.
        </p>
      )}

      {/* 제안 6건. 예산 등급 순. 결론에서 바로 이어지는 "할 일" */}
      <section>
        <SectionHead
          n="01"
          sub="다가구·단독 밀집을 겨냥하는 수단이 기존 목록에 없어 채웠습니다. 예산이 안 드는 것부터, 실행 전 조치 대장에 등록합니다."
        >
          제안 {proposals.length}건
        </SectionHead>
        <p className="mb-1 flex flex-wrap items-center gap-1.5 pl-8 text-[12px]">
          {costCounts.map((c) => (
            <span key={c.label} className={`rounded px-1.5 py-0.5 font-semibold ${c.cls}`}>
              {c.label} {c.n}건
            </span>
          ))}
        </p>
        <div className="flex flex-col">
          {proposals.map((lv, i) => (
            <ProposalRow key={lv.node.id} lv={lv} graph={graph} stats={stats} onOpen={setOpenLever} i={i} n={i + 1} />
          ))}
        </div>
      </section>

      {/* 기존 수단 판정. 접어 둔다 */}
      <Folded n="02" title={`이미 쓰고 있는 수단 ${existing.length}건의 검증 결과`} sub="CCTV 효과 철회 등. 누르면 판정 근거가 나옵니다">
        <div className="flex flex-col">
          {existing.map((lv, i) => (
            <ExistingRow key={lv.node.id} lv={lv} graph={graph} stats={stats} onOpen={setOpenLever} i={i} />
          ))}
        </div>
      </Folded>

      {/* 성과지표. 무엇으로 성과를 재는가 */}
      <Folded n="03" title="성과는 이 지표로 측정합니다" sub="민원 총건수는 앱 신고 증가가 섞여 성과 평가에 쓰지 않습니다">
        <div className="flex flex-col gap-1">
          {kpisSorted.map((k) => {
            const main = KPI_ORDER.includes(k.id)
            const val = kpiValue(k.id)
            const critical = k.id === "kpi-critical-cells"
            return (
              <div key={k.id} className="flex flex-wrap items-center gap-x-2.5 gap-y-1 rounded-lg px-2 py-1.5">
                <i className={`h-2 w-2 shrink-0 rounded-full ${main ? "bg-[#a8322a]" : "bg-[var(--cp-text-faint)]"}`} />
                {/* 라벨 꼬리 "(12개월 10건 이상)"은 부제에 있어 뗀다 */}
                <span className="min-w-0 flex-1 text-[14px] text-[var(--cp-text)]">{val ? k.label.replace(/\s*\(.*\)$/, "") : k.label}</span>
                {val && (
                  <span className="flex items-baseline gap-1.5">
                    <span className="font-mono text-[16px] font-bold tabular-nums text-[var(--cp-text-strong)]">{val.v}</span>
                    <span className="text-[12px] text-[var(--cp-text-dim)]">{val.sub}</span>
                  </span>
                )}
                {critical && data && (
                  <button
                    type="button"
                    onClick={onToggleCritical}
                    aria-pressed={criticalOn}
                    className={`shrink-0 rounded-full border px-2.5 py-0.5 text-[12px] font-semibold ${
                      criticalOn ? "border-[#a8322a] bg-[#a8322a]/10 text-[#a8322a]" : "border-[var(--cp-border)] text-(--dump-accent) hover:bg-[var(--cp-hover)]"
                    }`}
                  >
                    {criticalOn ? "지도 표시 중 · 끄기" : "지도에 기둥으로 표시"}
                  </button>
                )}
                {main && !val && (
                  <span className="shrink-0 rounded bg-[#a8322a]/10 px-1.5 py-0.5 text-[12px] font-semibold text-[#a8322a]">성과 평가용</span>
                )}
              </div>
            )
          })}
        </div>
        <p className="mt-2 px-2 text-[13px] leading-relaxed text-[var(--cp-text-dim)]">
          빨간 점 세 가지(채널고정 민원·집중관리 상습격자·징수율)가 신고 편향에 덜 민감하게 성과를 측정하는 지표입니다. 상습격자 수는
          앱 민원을 포함하므로 관리수요 지표로 함께 읽어 주세요.
        </p>
      </Folded>

      {/* 원칙. CCTV 철회의 교훈 */}
      <section className="border-t border-[var(--cp-border)] pt-4">
        <h3 className="flex items-baseline gap-2.5 text-[17px] font-bold text-[var(--cp-text-strong)]">
          <span className="dump-idx text-[14px] text-[var(--cp-text-faint)]">04</span>원칙 · 개입 사전등록(조치 대장)
        </h3>
        <p className="mt-1.5 text-[13.5px] leading-relaxed text-[var(--cp-text-muted)]">
          실행 전에 대상·기간·비교 대상·판정 지표를 등록하고, 등록한 설계대로만 평가합니다. 이동식 CCTV 효과 철회 뒤 만든 장치입니다.
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
