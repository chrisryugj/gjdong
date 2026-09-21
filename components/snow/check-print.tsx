"use client"

import type { SnowMapData } from "@/lib/snow/types"
import { buildChecklist } from "@/lib/snow/facts"
import { COST } from "@/lib/snow/costs"
import ModalShell from "@/components/dumping/modal-shell"
import { linkSnowLawRefs } from "./law-ref"

// 보고 요약 한 장(승인 문서가 아니다. 사용자: "그냥 보고용 서머리"). 점검 후보 5를 번호(우선순위)·행동·부서·기한·규모·개략 비용·완료 기준·필요한 결정 표로. 인쇄는 globals.css #snow-check 규칙(모달만 출력)
// 서명란·부서 확인란은 두지 않는다. 조치 여부와 순서는 담당 부서가 정한다

export default function CheckPrint({ data, onClose }: { data: SnowMapData; onClose: () => void }) {
  const checks = buildChecklist(data)
  const asof = `${data.asof.sand.slice(0, 7)}부터 ${data.asof.cacl.slice(0, 7)}까지`
  return (
    <ModalShell id="snow-check" onClose={onClose} title="눈 오기 전 점검 후보 · 보고 요약 한 장" sub={`광진 제설 상황실 · 자원 기준일 ${asof} · 빌드 ${data.meta.built}`} size="xl" zIndex={2400}>
      {/* 결정이 필요한 것(냉독 4차: "무엇을 정해 달라"는 한 줄이 없었다). 돈이 걸린 항목만 결정, 나머지는 부서 지시 */}
      <div className="mb-3 rounded-lg bg-[var(--cp-panel2)] px-3 py-2 text-[13.5px] leading-snug text-[var(--cp-text)]">
        <span className="dump-kicker mr-2 text-[10px] text-[var(--cp-text-dim)]">결정이 필요한 것</span>
        {checks.filter((c) => c.needsDecision).map((c) => `${c.title}: ${c.request}`).join(" / ")}. 나머지 {checks.filter((c) => !c.needsDecision).length}건은 부서 지시로 진행합니다.
      </div>
      <table className="w-full text-[13px]">
        <thead>
          <tr className="text-left text-[12px] text-[var(--cp-text-dim)]">
            <th className="py-1 pr-2 font-medium">우선</th>
            <th className="py-1 pr-2 font-medium">행동과 근거</th>
            <th className="py-1 pr-2 font-medium">부서 · 기한</th>
            <th className="py-1 pr-2 font-medium">규모 · 개략 비용</th>
            <th className="py-1 font-medium">완료 기준 · 필요한 결정</th>
          </tr>
        </thead>
        <tbody>
          {checks.map((c, i) => (
            <tr key={c.id} className="border-t border-[var(--cp-border-faint)] align-top">
              <td className="py-2 pr-2 font-mono text-[13px] text-(--dump-accent)">{i + 1}</td>
              <td className="py-2 pr-3">
                <div className="font-semibold text-[var(--cp-text-strong)]">{c.title}</div>
                <div className="mt-0.5 text-[12.5px] leading-snug text-[var(--cp-text-muted)]">{c.body}</div>
              </td>
              <td className="py-2 pr-3 text-[var(--cp-text)]">
                <div>{c.dept}</div>
                <div className="text-[12.5px] text-[var(--cp-text-dim)]">{c.due}</div>
              </td>
              <td className="py-2 pr-3 text-[var(--cp-text)]">
                <div>{c.scale}</div>
                <div className="text-[12.5px] text-[var(--cp-text-dim)]">{c.cost}</div>
              </td>
              <td className="py-2 text-[var(--cp-text)]">
                <div>{c.done}</div>
                <div className={`text-[12.5px] ${c.needsDecision ? "font-semibold text-(--dump-accent)" : "text-[var(--cp-text-dim)]"}`}>{c.request}</div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-3 text-[12.5px] leading-snug text-[var(--cp-text-dim)]">
        단가: 도로열선 1차로 100m당 1억원·관리 연 360만원({COST.heatSource.split("(")[0].trim()}), 제설함 {COST.saltBoxWon.toLocaleString("ko-KR")}원(소매가). 조달 단가가 아닙니다. 다음 해 본예산 반영은 의회 제출({linkSnowLawRefs("지방자치법 제142조")}, 회계연도 시작 40일 전) 전에 정하고, 지나면 추경입니다. 거리 기준({data.gaps.heatNearM}m 열선·{data.gaps.materialNearM}m 자재·{data.gaps.schoolNearM}m 학교)과 우선순위 가중치는 이 화면의 가정입니다.
      </p>
      <div className="mt-3 flex justify-end gap-2 print:hidden">
        <button onClick={() => window.print()} className="rounded-full border border-[var(--cp-border)] px-3.5 py-1.5 text-[13px] font-semibold text-(--dump-accent) hover:bg-[var(--cp-hover)]">
          인쇄
        </button>
      </div>
    </ModalShell>
  )
}
