"use client"

import { useMemo } from "react"
import type { DumpingMapData, OntoGraph } from "@/lib/dumping/types"
import { slaShift } from "@/lib/dumping/facts"
import ModalShell from "./modal-shell"
import { COST_ORDER, costBadge, factorStats, joinParen, reasonSentences, splitParen, type ProposalRow } from "./lever-view"

// 결재용 한 장. 정책 제안 탭의 "결재용 한 장 인쇄"가 여는 모달(#dump-policy, globals.css print 규칙).
// 결재란은 두지 않는다(기안 부서 서식이 따로 있다). 대신 제안마다 "왜 하자는 것인지"를 한두 문장으로 붙여
// 표만 보고도 납득이 되게 한다. 내용은 전부 graph.json 레버 노드와 통계 엣지에서 파생(lever-view). 새 판단은 쓰지 않는다.
// 10라운드(결재선 냉독): 배경(안 하면 어떻게 되나)·전제(조치 대장 담당)·항목별 담당/추가 지출/개시/판정 칸을 고정한다.
// 시행일·시범 동은 자료에 없으므로 "등록 후"·"시범 동 선정 후"로 적고 지어내지 않는다.

export interface Headline {
  k: string
  v: string
  sub: string
}

// 예산 등급별 건수 문장. "추가 예산 없는 3건은 조정으로 시범, 저비용 2건·예산 필요 1건은 시범 동을 정한 뒤 시행"
export function requestSentence(rows: ProposalRow[]): string {
  const count = (label: (typeof COST_ORDER)[number]) => rows.filter((r) => r.cost === label).length
  const free = count("추가 예산 없음")
  const low = count("저비용")
  const budget = count("예산 필요")
  const later = [low ? `저비용 ${low}건` : "", budget ? `예산 필요 ${budget}건` : ""].filter(Boolean).join("과 ")
  return `아래 ${rows.length}건의 검토를 요청합니다. 추가 예산 없는 ${free}건은 기존 인력과 장비 조정으로 시범할 수 있고(직원 시간·이전 비용은 별도) ${later}은 시범 동을 정해 조치 대장에 등록한 뒤 시행합니다. 모두 등록한 설계로만 평가합니다.`
}

// 판정 시점·개시 조건은 조치 대장 원칙에서 온다. 항목마다 같은 문장
const START_NOTE = "조치 대장 등록 후"
const VERDICT_NOTE = "시행 다음 분기 말(전년 같은 분기 대비)"

interface PrintProps {
  open: boolean
  graph: OntoGraph
  data: DumpingMapData | null
  rows: ProposalRow[]
  conclusion: string
  headline: Headline[]
  periodLabel: string // 민원 기간
  finesPeriodLabel: string // 과태료 위반분 기간. 둘이 달라 같이 적는다(냉독 지적)
  asof: string
  onClose: () => void
}

export function PolicyPrintModal({ open, graph, data, rows, conclusion, headline, periodLabel, finesPeriodLabel, asof, onClose }: PrintProps) {
  const stats = useMemo(() => factorStats(graph), [graph])
  if (!open) return null
  const team = graph.nodes.find((n) => n.type === "Team")?.label ?? graph.nodes.find((n) => n.type === "Org")?.label ?? ""
  // 배경: 안 하면 어떻게 되나. 자료가 직접 보여 주는 운영 문제(처리 지연)와 주거 스톡 흐름(신축)만 적는다
  const sla = data ? slaShift(data) : null
  const pm = data?.decision.permits
  return (
    <ModalShell
      id="dump-policy"
      size="xl"
      onClose={onClose}
      header={
        <>
          <p className="text-[13px] font-medium tracking-wide text-[var(--cp-text-dim)]">
            무단투기 대책 검토 요청 · 민원 {periodLabel} · 과태료 {finesPeriodLabel} · 자료 기준 {asof}
          </p>
          <h2 className="mt-1 text-[22px] font-bold text-[var(--cp-text-strong)]">제안 {rows.length}건과 그 이유</h2>
        </>
      }
      footer={
        <div className="flex gap-2">
          <button
            onClick={() => window.print()}
            className="flex-1 rounded-lg bg-[#0c6155] py-2.5 text-[15px] font-semibold text-white hover:bg-[#0a5449]"
          >
            인쇄 / PDF 저장
          </button>
          <button
            onClick={onClose}
            className="rounded-lg border border-[var(--cp-border)] px-5 py-2.5 text-[15px] text-[var(--cp-text)] hover:bg-[var(--cp-hover)]"
          >
            닫기
          </button>
        </div>
      }
    >
      <p className="text-[17px] font-bold leading-snug text-[var(--cp-text-strong)] print:text-[14px]">{conclusion}</p>
      <p className="mt-3 border-l-2 border-[#0c6155] pl-3 text-[15px] leading-relaxed text-[var(--cp-text)] print:text-[12px]">
        {requestSentence(rows)}
      </p>
      {(sla || pm) && (
        <p className="mt-2 text-[14px] leading-relaxed text-[var(--cp-text-muted)] print:text-[11.5px]">
          <b className="text-[var(--cp-text-strong)]">배경</b>{" "}
          {sla && `3일 안에 처리된 민원 비율이 ${sla.prevYear}년 ${sla.prev.within3dPct}%에서 ${sla.lastYear}년 ${sla.last.within3dPct}%로 ${sla.last.within3dPct < sla.prev.within3dPct ? "떨어졌고" : "올랐고"}, `}
          {pm && `최근 12개월 소형 공동주택 ${pm.guTotal.smallAptUnits12m.toLocaleString()}세대·단독·다가구 ${pm.guTotal.detachedPermits12m}건이 신축 허가 중입니다. `}
          발생 감소 효과는 시범 뒤 실측으로만 판정합니다.
        </p>
      )}
      <p className="mt-1.5 text-[14px] leading-relaxed text-[var(--cp-text-muted)] print:text-[11.5px]">
        <b className="text-[var(--cp-text-strong)]">전제</b> 조치 대장(개입 사전등록부)의 등록 담당과 시점을 먼저 정합니다. 각 항목의 개시는 등록 뒤, 판정은 {VERDICT_NOTE}입니다.
      </p>

      {/* 제안 목록. 이름·예산 → 이유 → 담당·추가 지출·개시·판정. 표 대신 블록: 네 칸 표는 담당·검증 문구가 "(" 앞에서 꺾였다 */}
      <ol className="mt-4 flex flex-col divide-y divide-[var(--cp-border)] border-y border-[var(--cp-border-strong)]">
        {rows.map((r, i) => {
          const badge = costBadge(r.lever.costNote)
          const reasons = reasonSentences(r.lever, stats)
          // 노드 note는 내부 정정 이력("(철회 후 정정)")이 붙어 있다. 결재 문서에는 근거 성격만
          const caveat = r.lever.node.props.note != null ? String(r.lever.node.props.note).replace(/\s*\(철회 후 정정\)\s*$/, "") : null
          // "0원(노선 조정)" 원문에서 괄호 안(무엇을 조정하는지)만 살린다. "0원"은 J2가 지적한 총비용 혼동
          const costHow = r.costNote !== "미기재" ? splitParen(r.costNote).note : null
          const spend =
            badge?.label === "추가 예산 없음"
              ? `추가 예산 없음 · 직원 시간·이전 비용 별도${costHow ? ` · ${costHow}` : ""}`
              : badge?.label === "저비용"
                ? `저비용 · ${r.costNote !== "미기재" ? joinParen(r.costNote) : "산정 전"}`
                : badge
                  ? `예산 필요 · ${r.costNote !== "미기재" ? joinParen(r.costNote) : "산정 전"}`
                  : "산정 전"
          return (
            <li key={r.lever.node.id} className="py-3 print:py-2">
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                <span className="font-mono text-[13px] text-[var(--cp-text-faint)]">{String(i + 1).padStart(2, "0")}</span>
                <span className="text-[16px] font-bold text-[var(--cp-text-strong)] print:text-[13px]">{r.name}</span>
                {badge ? (
                  <span className={`rounded px-1.5 py-0.5 text-[12.5px] font-semibold ${badge.cls}`}>{badge.label}</span>
                ) : (
                  <span className="text-[13px] text-[var(--cp-text-dim)]">예산 산정 전</span>
                )}
              </div>
              <p className="mt-1.5 text-[14.5px] leading-relaxed text-[var(--cp-text)] print:text-[11.5px] print:leading-snug">
                <b className="text-[#0a4a41]">이유</b> {reasons.join(" ")}
              </p>
              {caveat && (
                <p className="mt-1 text-[13.5px] leading-relaxed text-[#7c2620] print:text-[11px]">
                  <b>근거 성격</b> {caveat}
                </p>
              )}
              <dl className="mt-1.5 grid grid-cols-2 gap-x-3 gap-y-0.5 text-[13.5px] leading-snug text-[var(--cp-text-muted)] print:text-[11px] sm:grid-cols-4">
                {[
                  ["담당", joinParen(r.owner)],
                  ["추가 지출", spend],
                  ["개시", START_NOTE],
                  ["판정", `${VERDICT_NOTE} · ${joinParen(r.verify)}`],
                ].map(([k, v]) => (
                  <div key={k} className="min-w-0">
                    <dt className="text-[12px] text-[var(--cp-text-faint)]">{k}</dt>
                    <dd className="text-[var(--cp-text)]">{v}</dd>
                  </div>
                ))}
              </dl>
            </li>
          )
        })}
      </ol>

      <dl className="mt-4 grid grid-cols-3 gap-3">
        {headline.map((h) => (
          <div key={h.k} className="min-w-0 border-l border-[var(--cp-border-strong)] pl-3">
            <dt className="text-[13px] leading-tight text-[var(--cp-text-muted)] print:text-[11px]">{h.k}</dt>
            <dd className="mt-1 font-mono text-[20px] font-semibold leading-none text-[var(--cp-text-strong)] print:text-[15px]">{h.v}</dd>
            <dd className="mt-1 text-[12.5px] leading-snug text-[var(--cp-text-dim)] print:text-[10.5px]">{h.sub}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-4 text-[13.5px] leading-relaxed text-[var(--cp-text-muted)] print:text-[11px]">
        원칙. 새 개입은 실행 전에 대상 격자, 기간, 비교 대상, 판정 지표를 조치 대장에 등록합니다. 이동식 CCTV의 효과 주장이
        비교 방법 오류로 철회된 뒤 만든 장치입니다. 판정 시점은 시행 다음 분기 말(집중관리 상습격자 지표 분기 갱신)이며 계절 효과를 빼기 위해 전년 같은 분기와
        비교합니다. 위 수치는 민원·과태료 기록의 집계이며 실제 발생량이 아닙니다. 근거 자료와 방법은 상황실 화면의 데이터·방법에 있습니다.
      </p>
      {team && <p className="mt-2 text-[13px] text-[var(--cp-text-dim)] print:text-[10.5px]">작성 {team} · 클린광진 상황실</p>}
    </ModalShell>
  )
}
