"use client"

import type { SnowMapData } from "@/lib/snow/types"
import { buildChecklist } from "@/lib/snow/facts"
import { COST } from "@/lib/snow/costs"
import ModalShell from "@/components/dumping/modal-shell"

// 결재용 한 장(4라운드 냉독: "그래서 뭘 승인하라는 건가"). 점검 후보 5를 번호(우선순위)·행동·부서·기한·규모·완료 기준·근거 표로. 인쇄는 globals.css #snow-check 규칙(모달만 출력)
// 비용은 단가 자료가 없어 칸을 두지 않는다. 조치 여부와 순서는 담당 부서가 정한다

export default function CheckPrint({ data, onClose }: { data: SnowMapData; onClose: () => void }) {
  const checks = buildChecklist(data)
  const asof = `${data.asof.sand.slice(0, 7)}부터 ${data.asof.cacl.slice(0, 7)}까지`
  return (
    <ModalShell id="snow-check" onClose={onClose} title="눈 오기 전 점검 후보 · 결재용 한 장" sub={`광진 제설 상황판 · 자원 기준일 ${asof} · 빌드 ${data.meta.built}`} size="xl" zIndex={2400}>
      {/* 결재란(냉독 5차: 기안·검토·결재 칸이 없어 결재판이 아니었다). 이름은 이 화면이 모른다 → 빈 칸 */}
      <div className="mb-3 flex justify-end">
        <table className="text-[12px]">
          <tbody>
            <tr>
              {["담당", "팀장", "과장", "구청장"].map((r) => (
                <td key={r} className="border border-[var(--cp-border)] px-3 py-1 text-center text-[var(--cp-text-dim)]">
                  {r}
                </td>
              ))}
            </tr>
            <tr>
              {["담당", "팀장", "과장", "구청장"].map((r) => (
                <td key={r} className="h-12 w-20 border border-[var(--cp-border)]" />
              ))}
            </tr>
          </tbody>
        </table>
      </div>
      {/* 결정 요청(냉독 4차: "무엇을 승인해 달라"는 한 줄이 없었다). 돈이 걸린 항목만 결정, 나머지는 지시 */}
      <div className="mb-3 rounded-lg bg-[var(--cp-panel2)] px-3 py-2 text-[13.5px] leading-snug text-[var(--cp-text)]">
        <span className="dump-kicker mr-2 text-[10px] text-[var(--cp-text-dim)]">결정 요청</span>
        {checks.filter((c) => /결정/.test(c.request)).map((c) => `${c.title}: ${c.request}`).join(" / ")}. 나머지 {checks.filter((c) => !/결정/.test(c.request)).length}건은 부서 지시로 진행합니다.
      </div>
      <table className="w-full text-[13px]">
        <thead>
          <tr className="text-left text-[12px] text-[var(--cp-text-dim)]">
            <th className="py-1 pr-2 font-medium">우선</th>
            <th className="py-1 pr-2 font-medium">행동</th>
            <th className="py-1 pr-2 font-medium">부서</th>
            <th className="py-1 pr-2 font-medium">기한</th>
            <th className="py-1 pr-2 font-medium">규모</th>
            <th className="py-1 pr-2 font-medium">개략 비용</th>
            <th className="py-1 pr-2 font-medium">완료 기준</th>
            <th className="py-1 pr-2 font-medium">결정·지시</th>
            <th className="py-1 font-medium">부서 확인(기재)</th>
          </tr>
        </thead>
        <tbody>
          {checks.map((c, i) => (
            <tr key={c.id} className="border-t border-[var(--cp-border-faint)] align-top">
              <td className="py-1.5 pr-2 font-mono text-[12.5px] text-[var(--cp-text-dim)]">{i + 1}</td>
              <td className="py-1.5 pr-2">
                <div className="font-semibold text-[var(--cp-text-strong)]">{c.title}</div>
                <div className="mt-0.5 text-[12.5px] text-[var(--cp-text-muted)]">{c.body}</div>
              </td>
              <td className="whitespace-nowrap py-1.5 pr-2 text-[var(--cp-text)]">{c.dept}</td>
              <td className="py-1.5 pr-2 text-[var(--cp-text)]">{c.due}</td>
              <td className="py-1.5 pr-2 text-[var(--cp-text)]">{c.scale}</td>
              <td className="py-1.5 pr-2 text-[var(--cp-text)]">{c.cost}</td>
              <td className="py-1.5 pr-2 text-[var(--cp-text)]">{c.done}</td>
              <td className="py-1.5 pr-2 text-[var(--cp-text)]">{c.request}</td>
              <td className="py-1.5"><span className="block h-10 w-20 rounded border border-dashed border-[var(--cp-border)]" aria-label="부서 확인 기재란" /></td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-3 text-[12.5px] leading-snug text-[var(--cp-text-dim)]">
        번호가 우선순위입니다(구 소관 행동 가능 › 시 요청 › 동 단위 › 학교). 부서·규모는 공개 데이터에 있는 것만 적었고 학교 소관은 데이터가 없어 내부 확인입니다. 개략 비용의 단가: 도로열선 1차로 100m당 1억원·관리 연 360만원({COST.heatSource.split("(")[0].trim()}), 제설함 {COST.saltBoxWon.toLocaleString("ko-KR")}원(소매가, 2026-09 조회). 조달 단가·실시설계가 아닙니다(관리비는 같은 출처의 100m당 연 360만원, 전기·통신비 포함 여부는 보도에 없음). 예산 절차: 다음 해 본예산은 지방자치법 제142조에 따라 회계연도 시작 40일 전(11월 21일)까지 의회에 제출하므로 그 전에 반영 여부를 정하고, 지나면 추경입니다. 거리 기준({data.gaps.heatNearM}m 열선·{data.gaps.materialNearM}m 자재·{data.gaps.schoolNearM}m 학교)과 우선순위 가중치는 이 화면의 가정입니다. 조치 여부와 순서는 담당 부서가 정합니다.
      </p>
      <div className="mt-3 flex justify-end gap-2 print:hidden">
        <button onClick={() => window.print()} className="rounded-full border border-[var(--cp-border)] px-3.5 py-1.5 text-[13px] font-semibold text-(--dump-accent) hover:bg-[var(--cp-hover)]">
          인쇄
        </button>
      </div>
    </ModalShell>
  )
}
