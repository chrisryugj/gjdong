"use client"

import { useEffect, useMemo, useState } from "react"
import type { DumpingMapData, OntoGraph } from "@/lib/dumping/types"
import { channelGrowth, fmtRatio, regressionBetas, summarize } from "@/lib/dumping/facts"
import {
  costBadge,
  costRank,
  deriveLevers,
  easyVerdict,
  FACTOR_SHORT,
  joinParen,
  proposalRows,
  STATUS_FALLBACK,
  STATUS_STYLE,
  type LeverView,
} from "./lever-view"
import LeverModal from "./lever-modal"
import { PolicyPrintModal, type Headline } from "./policy-table"
import type { MethodsSection } from "./methods-modal"

// 정책 제안 탭. 지식그래프를 관리자 관점("무엇을 해야 하나")으로 재구성한 첫 화면.
// 별도 데이터 없이 graph.json의 Lever·KPI 노드와 관계에서 전부 파생한다.
// 첫 화면에 보이는 것은 넷뿐이다. 결론 한 줄, 쉬운 수치 3, 결재용 인쇄와 평가자 근거 경로, 제안 카드.
// 기존 수단 판정·성과지표는 접어 둔다(7라운드: 여섯 섹션을 한 번에 펼치면 어느 것도 읽히지 않았다).
// 카드를 누르면 제안이유 모달이 열리고, 모달에서 오른쪽 지도로 이어진다.

// 해설서 원문(공개 레포). 방법 모달이 다루지 않는 한계·검정 세부는 여기로 보낸다
const EXPLAINER_URL = "https://github.com/chrisryugj/gjdong/blob/main/docs/dumping-stats-explainer.md"

function LeverCard({ lv, graph, onOpen, i = 0 }: { lv: LeverView; graph: OntoGraph; onOpen: (lv: LeverView) => void; i?: number }) {
  const status = STATUS_STYLE[lv.status] ?? { label: lv.status, cls: "bg-slate-400 text-white" }
  const cost = costBadge(lv.costNote)
  const proposal = lv.status === "제안"
  // 제안은 까닭을 모달에서 풀어 주므로 카드에는 판정 문장을 두지 않는다.
  // 기존 수단은 한 줄 판정이 곧 요점이라, 쉬운 설명이 있으면 그쪽을 쓴다.
  const note = proposal ? null : (easyVerdict(lv, graph) ?? lv.verdictNote ?? STATUS_FALLBACK[lv.status] ?? null)
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
              <dd className="text-[var(--cp-text-muted)]">{joinParen(lv.owner)}</dd>
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
      <span className="mt-2.5 inline-block text-[14px] font-semibold text-[#0c6155]">
        {proposal ? "제안 이유와 지도 보기 →" : "검증 결과 자세히 →"}
      </span>
    </button>
  )
}

interface PolicyBoardProps {
  graph: OntoGraph | null
  data: DumpingMapData | null
  onShowMap: (lever: LeverView) => void
  activeLeverId: string | null
  onOpenMethods: (section: MethodsSection) => void // 평가자 링크 줄: 데이터·방법 모달
  onGoFindings: () => void // 평가자 링크 줄: 발견 탭
}

// 섹션 제목. 위계는 색이 아니라 번호와 hairline으로
function SectionHead({ n, children, sub }: { n: string; children: React.ReactNode; sub?: string }) {
  return (
    <div className="mb-3 border-t border-[var(--cp-border)] pt-4">
      <h3 className="flex items-baseline gap-2 text-[16px] font-bold text-[var(--cp-text-strong)]">
        <span className="font-mono text-[12px] font-normal text-[var(--cp-text-faint)]">{n}</span>
        <span>{children}</span>
      </h3>
      {sub && <p className="mt-0.5 pl-6 text-[13.5px] text-[var(--cp-text-dim)]">{sub}</p>}
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

export default function PolicyBoard({ graph, data, onShowMap, activeLeverId, onOpenMethods, onGoFindings }: PolicyBoardProps) {
  const levers = useMemo(() => (graph ? deriveLevers(graph) : []), [graph])
  const rows = useMemo(() => (graph ? proposalRows(graph) : []), [graph])
  const [openLever, setOpenLever] = useState<LeverView | null>(null)
  const [showPrint, setShowPrint] = useState(false)

  if (!graph) {
    return <div className="p-4 text-[16px] text-[var(--cp-text-dim)]">정책 자료를 불러오는 중입니다…</div>
  }

  // 제안은 돈이 덜 드는 순. 무예산 → 저비용 → 예산 필요 (같은 등급 안에서는 그래프 순서 유지)
  const proposals = levers.filter((l) => l.status === "제안").sort((a, b) => costRank(a) - costRank(b))
  const existing = levers.filter((l) => l.status !== "제안")
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
  const period = data ? summarize(data).period : null
  // 8라운드: 관측 대상(단속 적발)과 한계(발생 증가 배제 아님)를 첫 문장에 담는다. 검토서 A1
  const conclusion =
    "단속에 잡히는 무단투기는 사람이 많은 곳이 아니라 다가구·단독주택이 몰린 골목에 더 많습니다. 민원 증가는 앱 신고 창구에 몰려 있어 발생이 늘었다고 읽기 어렵습니다."
  const headline: Headline[] = [
    {
      k: "다가구·단독 밀집 β",
      v: topBeta ? `${topBeta.beta > 0 ? "+" : ""}${topBeta.beta.toFixed(3)}` : "미산출",
      sub: `조건 ${betas.length}개 중 발생과 가장 강하게 같이 움직임`,
    },
    {
      k: "순찰 적발",
      v: growth ? fmtRatio(growth.finesPatrol) : "미산출",
      sub: growth ? `신고 없이 순찰로 잡은 건수, ${growth.baseYear}년 대비 연환산. 최근 2~3개월은 부과 지연으로 과소집계` : "",
    },
    {
      k: "상습격자 앱 제외",
      v: kpi ? `${kpi.criticalCellsNowNoApp}곳` : "미산출",
      sub: kpi ? `${th?.months ?? 12}개월 ${th?.critical ?? 10}건 넘는 100m 칸, 앱 신고를 빼고 센 수(넣으면 ${kpi.criticalCellsNow}곳)` : "",
    },
  ]
  // 평가자 진입 줄. 데이터 → 방법 → 결론 → 한계 → 재현
  const path: { k: string; go: () => void; ext?: string }[] = [
    { k: "데이터", go: () => onOpenMethods("data") },
    { k: "방법", go: () => onOpenMethods("methods") },
    { k: "결론", go: onGoFindings },
    { k: "한계", go: () => {}, ext: EXPLAINER_URL },
    { k: "재현", go: () => onOpenMethods("reproduce") },
  ]

  return (
    <div className="flex flex-col gap-5 px-4 py-4">
      {/* 결론 한 줄 + 핵심 수치 3개. 첫 화면에서 답이 먼저 보이게 */}
      <section>
        <p className="dump-rise font-mono text-[12px] tracking-[0.12em] text-[var(--cp-text-faint)]">01 결론</p>
        <h2 className="dump-rise mt-1.5 text-[20px] font-bold leading-snug text-[var(--cp-text-strong)]" style={{ "--i": 1 } as React.CSSProperties}>
          {conclusion}
        </h2>
        {/* 390에서는 세로로. 세 칸에 나누면 "β"가 홀로 다음 줄로 떨어진다 */}
        <dl className="mt-4 grid grid-cols-1 gap-2.5 sm:grid-cols-3 sm:gap-3">
          {headline.map((h, i) => (
            <div key={h.k} className="dump-rise relative min-w-0 pl-3" style={{ "--i": 3 + i } as React.CSSProperties}>
              <span className="dump-line absolute inset-y-0 left-0 w-px bg-[var(--cp-border-strong)]" style={{ "--i": 3 + i } as React.CSSProperties} aria-hidden />
              <dt className="text-[13px] leading-tight text-[var(--cp-text-muted)] break-keep">{h.k}</dt>
              <dd className="mt-1 font-mono text-[24px] font-semibold leading-none tabular-nums text-[var(--cp-text-strong)]">
                <CountUp text={h.v} delayMs={250 + i * 90} />
              </dd>
              <dd className="mt-1.5 text-[12.5px] leading-snug text-[var(--cp-text-dim)]">{h.sub}</dd>
            </div>
          ))}
        </dl>
        {/* 두 독자의 진입점. 결재선은 인쇄, 평가자는 근거 경로 */}
        <div className="dump-rise mt-4 flex flex-wrap items-center gap-x-4 gap-y-2" style={{ "--i": 7 } as React.CSSProperties}>
          <button
            onClick={() => setShowPrint(true)}
            className="rounded-lg border border-[var(--cp-border-strong)] bg-white px-3.5 py-2 text-[14px] font-semibold text-[var(--cp-text-strong)] hover:bg-[var(--cp-hover)]"
          >
            결재용 한 장 인쇄
          </button>
          <span className="flex flex-wrap items-center gap-x-1.5 text-[13.5px]">
            <span className="text-[var(--cp-text-dim)]">근거 경로</span>
            {path.map((p, i) => (
              <span key={p.k} className="inline-flex items-center gap-1.5">
                {p.ext ? (
                  <a href={p.ext} target="_blank" rel="noreferrer" className="font-semibold text-[#0c6155] hover:underline">
                    {p.k}
                  </a>
                ) : (
                  <button onClick={p.go} className="font-semibold text-[#0c6155] hover:underline">
                    {p.k}
                  </button>
                )}
                {i < path.length - 1 && <span className="text-[var(--cp-text-faint)]">→</span>}
              </span>
            ))}
          </span>
        </div>
      </section>

      {/* 정책 논리. 확인·공백·제안 세 단계. 한 문단으로 이으면 좁은 패널에서 읽히지 않는다 */}
      <section>
        <SectionHead n="02">왜 이런 제안인가</SectionHead>
        <dl className="flex flex-col gap-2.5">
          {[
            {
              k: "확인",
              v: (
                <>
                  단속 적발과 가장 강하게 연관된 조건은{" "}
                  <b className="text-[var(--cp-text-strong)]">다가구·단독주택의 밀집</b>이었습니다. 관리사무소가 없는 다세대·연립은 이 자료에서 연관을 확인하지
                  못했고, 차량 담배꽁초를 뺀 생활쓰레기만 봐도 같습니다.
                </>
              ),
            },
            {
              k: "공백",
              v: (
                <>
                  그 골목에는 청년·외국인·1인세대가 함께 몰려 있는데, 이번에 모은 정책 목록에는 이{" "}
                  <b className="text-[var(--cp-text-strong)]">사람</b>에게 배출 안내를 전하는 대책이 연결돼 있지 않았습니다. 네 조건은 같은 동네에 겹쳐
                  있어 어느 쪽을 겨냥해도 같은 골목에 닿습니다.
                </>
              ),
            },
            {
              k: "제안",
              v: <>아래 {proposals.length}건이 이 두 공백을 메웁니다. 모두 실행 전에 조치 대장에 설계를 등록한 뒤 평가합니다.</>,
            },
          ].map((row) => (
            <div key={row.k} className="flex gap-2.5">
              <dt className="mt-0.5 h-fit shrink-0 rounded bg-[#0c6155]/15 px-1.5 py-0.5 text-[12.5px] font-bold text-[#0a4a41]">
                {row.k}
              </dt>
              <dd className="min-w-0 flex-1 text-[15px] leading-relaxed text-[var(--cp-text)]">{row.v}</dd>
            </div>
          ))}
        </dl>
      </section>

      {/* 지도 연동 상태. 어떤 사업을 지도에 띄워 두었는지 */}
      {active && (
        <p className="rounded-lg border border-[#0c6155]/40 bg-[#0c6155]/8 px-3 py-2 text-[14px] leading-relaxed text-[#0a4a41]">
          지도에 <b>{active.node.label}</b> 관련 화면을 표시하고 있습니다.
        </p>
      )}

      {/* 신규 제안 카드. 예산 등급 순 */}
      <section>
        <SectionHead n="03" sub="돈이 안 드는 것부터. 카드를 누르면 이유와 지도가 나옵니다">
          제안 {proposals.length}건
        </SectionHead>
        <div className="flex flex-col gap-2.5">
          {proposals.map((lv, i) => (
            <LeverCard key={lv.node.id} lv={lv} graph={graph} onOpen={setOpenLever} i={i} />
          ))}
        </div>
      </section>

      {/* 기존 수단 판정. 접어 둔다 */}
      <Folded n="04" title={`이미 쓰고 있는 수단 ${existing.length}건의 검증 결과`} sub="CCTV 효과 철회 등. 카드를 누르면 판정 근거가 나옵니다">
        <div className="flex flex-col gap-2.5">
          {existing.map((lv) => (
            <LeverCard key={lv.node.id} lv={lv} graph={graph} onOpen={setOpenLever} />
          ))}
        </div>
      </Folded>

      {/* 성과지표. 무엇으로 성과를 재는가 */}
      <Folded n="05" title="성과는 이 지표로 잽니다" sub="민원 총건수는 앱 보급 편향이 섞여 성과 평가에 쓰지 않습니다">
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
          빨간 점 세 가지(채널고정 민원·집중관리 상습격자·징수율)가 신고 편향에 덜 민감하게 성과를 재는 지표입니다. 상습격자 수는
          앱 민원을 포함하므로 관리수요 지표로 함께 읽어 주세요.
        </p>
      </Folded>

      {/* 원칙. CCTV 철회의 교훈 */}
      <section className="border-t border-[var(--cp-border)] pt-4">
        <h3 className="flex items-baseline gap-2 text-[16px] font-bold text-[var(--cp-text-strong)]">
          <span className="font-mono text-[12px] font-normal text-[var(--cp-text-faint)]">06</span>원칙 · 개입 사전등록(조치 대장)
        </h3>
        <p className="mt-1.5 text-[14.5px] leading-relaxed text-[var(--cp-text-muted)]">
          새로 시작하는 개입은 실행 전에 대상 격자·기간·비교 대상·판정 지표를 등록하고 평가는 등록한 설계 그대로만 합니다. 이동식 CCTV의
          효과 주장이 비교 방법 오류(평균회귀)로 철회된 뒤에 만든 재발 방지 장치입니다. 진행 상황은 운영·전망 탭의 조치 대장에서 보실 수
          있습니다.
        </p>
      </section>

      <PolicyPrintModal
        open={showPrint}
        graph={graph}
        rows={rows}
        conclusion={conclusion}
        headline={headline}
        periodLabel={period?.label ?? ""}
        finesPeriodLabel={data ? summarize(data).finesPeriod.label : ""}
        asof={data?.decision.asof ?? ""}
        onClose={() => setShowPrint(false)}
      />
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
