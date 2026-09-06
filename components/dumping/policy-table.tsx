"use client"

import { useMemo } from "react"
import type { OntoGraph } from "@/lib/dumping/types"
import ModalShell from "./modal-shell"
import { COST_ORDER, costBadge, factorStats, joinParen, reasonSentences, type ProposalRow } from "./lever-view"

// 결재용 한 장. 정책 제안 탭의 "결재용 한 장 인쇄"가 여는 모달(#dump-policy, globals.css print 규칙).
// 결재란은 두지 않는다(기안 부서 서식이 따로 있다). 대신 제안마다 "왜 하자는 것인지"를 한두 문장으로 붙여
// 표만 보고도 납득이 되게 한다. 내용은 전부 graph.json 레버 노드와 통계 엣지에서 파생(lever-view). 새 판단은 쓰지 않는다.

export interface Headline {
  k: string
  v: string
  sub: string
}

// 예산 등급별 건수 문장. "무예산 3건은 바로 조정, 저비용 2건·예산 필요 1건은 시범 동을 정한 뒤 시행"
export function requestSentence(rows: ProposalRow[]): string {
  const count = (label: (typeof COST_ORDER)[number]) => rows.filter((r) => r.cost === label).length
  const free = count("무예산")
  const low = count("저비용")
  const budget = count("예산 필요")
  const later = [low ? `저비용 ${low}건` : "", budget ? `예산 필요 ${budget}건` : ""].filter(Boolean).join("과 ")
  return `아래 ${rows.length}건의 검토와 시행을 요청합니다. 무예산 ${free}건은 기존 인력과 장비 조정으로 바로 시작할 수 있고 ${later}은 시범 동을 정해 조치 대장에 등록한 뒤 시행합니다. 모두 등록한 설계로만 평가합니다.`
}

interface PrintProps {
  open: boolean
  graph: OntoGraph
  rows: ProposalRow[]
  conclusion: string
  headline: Headline[]
  periodLabel: string // 민원 기간
  finesPeriodLabel: string // 과태료 위반분 기간. 둘이 달라 같이 적는다(냉독 지적)
  asof: string
  onClose: () => void
}

export function PolicyPrintModal({ open, graph, rows, conclusion, headline, periodLabel, finesPeriodLabel, asof, onClose }: PrintProps) {
  const stats = useMemo(() => factorStats(graph), [graph])
  if (!open) return null
  const team = graph.nodes.find((n) => n.type === "Team")?.label ?? graph.nodes.find((n) => n.type === "Org")?.label ?? ""
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

      {/* 제안 목록. 이름·예산 → 이유 → 담당·검증. 표 대신 블록: 네 칸 표는 담당·검증 문구가 "(" 앞에서 꺾였다 */}
      <ol className="mt-4 flex flex-col divide-y divide-[var(--cp-border)] border-y border-[var(--cp-border-strong)]">
        {rows.map((r, i) => {
          const badge = costBadge(r.lever.costNote)
          const reasons = reasonSentences(r.lever, stats)
          const caveat = r.lever.node.props.note != null ? String(r.lever.node.props.note) : null
          return (
            <li key={r.lever.node.id} className="py-3 print:py-2">
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                <span className="font-mono text-[13px] text-[var(--cp-text-faint)]">{String(i + 1).padStart(2, "0")}</span>
                <span className="text-[16px] font-bold text-[var(--cp-text-strong)] print:text-[13px]">{r.name}</span>
                {badge ? (
                  <span className={`rounded px-1.5 py-0.5 text-[12.5px] font-semibold ${badge.cls}`}>{badge.label}</span>
                ) : (
                  <span className="text-[13px] text-[var(--cp-text-dim)]">예산 미기재</span>
                )}
                {r.costNote !== "미기재" && <span className="text-[13px] text-[var(--cp-text-dim)]">{joinParen(r.costNote)}</span>}
              </div>
              <p className="mt-1.5 text-[14.5px] leading-relaxed text-[var(--cp-text)] print:text-[11.5px] print:leading-snug">
                <b className="text-[#0a4a41]">이유</b> {reasons.join(" ")}
              </p>
              {caveat && (
                <p className="mt-1 text-[13.5px] leading-relaxed text-[#7c2620] print:text-[11px]">
                  <b>주의</b> {caveat}
                </p>
              )}
              <p className="mt-1.5 text-[13.5px] leading-snug text-[var(--cp-text-muted)] print:text-[11px]">
                담당 <span className="text-[var(--cp-text)]">{joinParen(r.owner)}</span>
                <span className="mx-1.5 text-[var(--cp-text-faint)]">|</span>
                검증(사전등록 후) <span className="text-[var(--cp-text)]">{joinParen(r.verify)}</span>
              </p>
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
        비교 방법 오류로 철회된 뒤 만든 장치입니다. 근거 자료와 방법은 상황실 화면의 데이터·방법에 있습니다.
      </p>
      {team && <p className="mt-2 text-[13px] text-[var(--cp-text-dim)] print:text-[10.5px]">작성 {team} · 클린광진 상황실</p>}
    </ModalShell>
  )
}
