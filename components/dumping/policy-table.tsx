"use client"

import type { OntoGraph } from "@/lib/dumping/types"
import ModalShell from "./modal-shell"
import { COST_ORDER, costBadge, type LeverView, type ProposalRow } from "./lever-view"

// 결재선용 제안 표와 결재용 인쇄 모달. 정책 제안 탭 안에서 표가 카드보다 먼저 오고,
// 같은 표가 인쇄 모달(#dump-policy, globals.css print 규칙)에 결론 한 줄과 함께 A4 한 장으로 들어간다.
// 내용은 전부 lever-view.proposalRows(graph.json 레버 노드 속성)에서 온다. 새 판단은 쓰지 않는다.

export interface Headline {
  k: string
  v: string
  sub: string
}

const TH = "px-2 py-1.5 text-left text-[11.5px] font-semibold tracking-wide text-[var(--cp-text-dim)]"
const TD = "px-2 py-1.5 align-top text-[12.5px] leading-snug text-[var(--cp-text)]"

export function ProposalTable({ rows, onOpen }: { rows: ProposalRow[]; onOpen?: (lv: LeverView) => void }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[380px] border-collapse">
        <caption className="sr-only">제안 {rows.length}건의 예산 등급, 담당, 검증 방법</caption>
        <thead>
          <tr className="border-b border-[var(--cp-border-strong)]">
            <th scope="col" className={TH}>제안</th>
            <th scope="col" className={`${TH} whitespace-nowrap`}>예산</th>
            <th scope="col" className={TH}>담당</th>
            <th scope="col" className={TH}>검증(사전등록 후)</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const badge = costBadge(r.lever.costNote)
            return (
              <tr key={r.lever.node.id} className="border-b border-[var(--cp-border)]">
                <td className={`${TD} font-medium text-[var(--cp-text-strong)]`}>
                  {r.name}
                  {onOpen && (
                    <button
                      onClick={() => onOpen(r.lever)}
                      className="mt-0.5 block text-[11.5px] font-semibold text-[#0c6155] hover:underline print:hidden"
                    >
                      근거 보기 →
                    </button>
                  )}
                </td>
                <td className={`${TD} whitespace-nowrap`}>
                  {badge ? (
                    <span className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ${badge.cls}`}>{badge.label}</span>
                  ) : (
                    <span className="text-[var(--cp-text-dim)]">미기재</span>
                  )}
                  <span className="mt-0.5 block text-[11px] text-[var(--cp-text-dim)]">{r.costNote}</span>
                </td>
                <td className={TD}>{r.owner}</td>
                <td className={TD}>{r.verify}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
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

// 결재란. 칸은 비워 둔다(성명·직위·기안일·문서번호는 기안 부서가 채운다)
const SIGN_COLS = ["담당", "과장", "국장", "부구청장", "구청장"]

export function PolicyPrintModal({ open, graph, rows, conclusion, headline, periodLabel, finesPeriodLabel, asof, onClose }: PrintProps) {
  if (!open) return null
  const team = graph.nodes.find((n) => n.type === "Team")?.label ?? graph.nodes.find((n) => n.type === "Org")?.label ?? ""
  return (
    <ModalShell
      id="dump-policy"
      size="xl"
      onClose={onClose}
      header={
        <>
          <p className="text-[12px] font-medium tracking-wide text-[var(--cp-text-dim)]">
            무단투기 대책 검토 요청 · 민원 {periodLabel} · 과태료 {finesPeriodLabel} · 자료 기준 {asof}
          </p>
          <h2 className="mt-0.5 text-xl font-bold text-[var(--cp-text-strong)]">클린광진 상황실 제안 {rows.length}건</h2>
        </>
      }
      footer={
        <div className="flex gap-2">
          <button
            onClick={() => window.print()}
            className="flex-1 rounded-lg bg-[#0c6155] py-2 text-[14px] font-semibold text-white hover:bg-[#0a5449]"
          >
            인쇄 / PDF 저장
          </button>
          <button
            onClick={onClose}
            className="rounded-lg border border-[var(--cp-border)] px-4 py-2 text-[14px] text-[var(--cp-text)] hover:bg-[var(--cp-hover)]"
          >
            닫기
          </button>
        </div>
      }
    >
      {/* 결재란은 맨 위, 결정 정보(요청 문장·표)가 분석 수치보다 먼저 */}
      <table className="mb-3 w-full border-collapse text-[11.5px]">
        <tbody>
          <tr>
            {SIGN_COLS.map((c) => (
              <td key={c} className="border border-[var(--cp-border-strong)] px-1 py-0.5 text-center text-[var(--cp-text-dim)]">
                {c}
              </td>
            ))}
          </tr>
          <tr>
            {SIGN_COLS.map((c) => (
              <td key={c} className="h-9 border border-[var(--cp-border-strong)]" />
            ))}
          </tr>
        </tbody>
      </table>
      <p className="text-[15px] font-bold leading-snug text-[var(--cp-text-strong)]">{conclusion}</p>
      <p className="mt-3 border-l-2 border-[#0c6155] pl-2.5 text-[13.5px] leading-relaxed text-[var(--cp-text)]">
        {requestSentence(rows)}
      </p>
      <div className="mt-3">
        <ProposalTable rows={rows} />
      </div>
      <dl className="mt-3 grid grid-cols-3 gap-2">
        {headline.map((h) => (
          <div key={h.k} className="min-w-0 border-l border-[var(--cp-border-strong)] pl-2.5">
            <dt className="text-[11.5px] leading-tight text-[var(--cp-text-muted)]">{h.k}</dt>
            <dd className="mt-0.5 font-mono text-[18px] font-semibold leading-none text-[var(--cp-text-strong)]">{h.v}</dd>
            <dd className="mt-1 text-[11px] leading-snug text-[var(--cp-text-dim)]">{h.sub}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-3 text-[12px] leading-relaxed text-[var(--cp-text-muted)]">
        원칙. 새 개입은 실행 전에 대상 격자, 기간, 비교 대상, 판정 지표를 조치 대장에 등록합니다. 이동식 CCTV의 효과 주장이
        비교 방법 오류로 철회된 뒤 만든 장치입니다. 근거 자료와 방법은 상황실 화면의 데이터·방법에 있습니다.
      </p>
      {team && <p className="mt-2 text-[12px] text-[var(--cp-text-dim)]">기안 {team} · 기안자 · 기안일 · 문서번호</p>}
    </ModalShell>
  )
}
