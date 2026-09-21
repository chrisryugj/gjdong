"use client"

import type { SnowMapData } from "@/lib/snow/types"
import { buildChecklist, fmt, gapSummary, priorityText, segName, segPriority, segOwner } from "@/lib/snow/facts"
import ModalShell from "@/components/dumping/modal-shell"
import { linkSnowLawRefs } from "./law-ref"

// 동별 브리핑 한 장(6라운드, dumping briefing-modal 이식). 동주민센터 회의·현장 배포용: 이 동의 자원 4종·열선 없는 취약구간·초등학교·해당 점검 후보·조례 시한.
// 인쇄는 globals.css #snow-dong-brief 규칙(모달만 출력). 담당 구간표가 없어 행정동 경계로 자른 값이라 그 한계를 맨 아래에 적는다

export default function DongBrief({ dong, data, onClose }: { dong: string | null; data: SnowMapData | null; onClose: () => void }) {
  if (!dong || !data) return null
  const row = data.dongs.find((d) => d.d === dong)
  if (!row) return null
  const g = gapSummary(data)
  const noHeat = g.noHeatList.filter((s) => s.d === dong)
  const schools = data.schools.filter((s) => s.d === dong)
  const weakIds = new Set(data.weak.filter((w) => w.d === dong).map((w) => w.i))
  // 이 동에 걸린 점검 후보: 동을 지목했거나 지도 번호가 이 동의 취약구간인 것
  const checks = buildChecklist(data).filter((c) => c.focus?.dong === dong || c.mapIds.some((i) => weakIds.has(i)))
  const asof = `${data.asof.sand.slice(0, 7)}부터 ${data.asof.cacl.slice(0, 7)}까지`
  const rank = [...data.dongs].sort((a, b) => b.weakNoHeat - a.weakNoHeat).findIndex((d) => d.d === dong) + 1
  const noHeatDong = row.heatSeg === 0
  const tiles: { k: string; v: string; u: string; accent?: boolean }[] = [
    { k: "도로열선", v: String(row.heatSeg), u: row.heatSeg ? `구간 · ${fmt(row.heatM)}m` : "구간 · 열선 없는 동", accent: noHeatDong },
    { k: "제설함", v: String(row.salt), u: "개소 · 도로과" },
    { k: "염화칼슘보관함", v: String(row.cacl), u: "개소 · 동주민센터" },
    { k: "모래주머니", v: String(row.sand), u: `지점 · ${fmt(row.sandBags)}포` },
    { k: "적설취약구간", v: String(row.weak), u: `곳 · 열선 없음 ${row.weakNoHeat}`, accent: row.weakNoHeat > 0 },
    { k: "초등학교", v: String(row.schools), u: `교 · 열선 없음 ${schools.filter((s) => !s.heatNear.length).length}` },
  ]
  return (
    <ModalShell id="snow-dong-brief" onClose={onClose} title={`${dong} 제설 브리핑`} sub={`광진 제설 상황실 · 자원 기준일 ${asof} · 열선 없는 취약구간 ${data.dongs.length}개 동 중 ${rank}위`} size="lg" zIndex={2400}>
      <dl className="grid grid-cols-3 gap-x-2 gap-y-2 text-center">
        {tiles.map((f) => (
          <div key={f.k} className="rounded-lg bg-[var(--cp-hover)] py-1.5">
            <dt className="text-[12.5px] text-[var(--cp-text-dim)]">{f.k}</dt>
            <dd className={`font-mono text-[19px] font-semibold ${f.accent ? "text-(--dump-accent)" : "text-[var(--cp-text-strong)]"}`}>{f.v}</dd>
            <dd className="text-[12px] text-[var(--cp-text-faint)]">{f.u}</dd>
          </div>
        ))}
      </dl>

      <section className="mt-4">
        <h3 className="text-[14.5px] font-semibold text-[var(--cp-text-dim)]">열선 없는 구간 {noHeat.length}곳 · 우선순위 순</h3>
        {noHeat.length ? (
          <ul className="mt-1 flex flex-col gap-1">
            {noHeat.map((s) => (
              <li key={`${s.src}-${"i" in s ? s.i : s.id}`} className="rounded-lg border border-[var(--cp-border-faint)] px-2.5 py-1.5 text-[14px]">
                <span className="font-mono text-[12.5px] text-(--dump-accent)">{s.src === "weak" ? `지도 ${s.i}` : `결빙 ${s.n}`}</span>
                <span className="ml-1.5 font-medium text-[var(--cp-text-strong)]">{segName(s)}</span>
                <span className="ml-1.5 text-[var(--cp-text-dim)]">
                  가장 가까운 열선 {s.near.heat == null ? "없음" : `${fmt(s.near.heat)}m`} · {data.gaps.materialNearM}m 안 자재 {s.materialsNear ? `${s.materialsNear}개소` : "없음"} · {segOwner(s)} 소관
                </span>
                <span className="block text-[12.5px] text-[var(--cp-text-faint)]">{priorityText(segPriority(s, data))}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-1 text-[14px] text-[var(--cp-text-dim)]">이 동의 적설취약구간은 전부 {data.gaps.heatNearM}m 안에 열선이 있습니다.</p>
        )}
      </section>

      {schools.length > 0 && (
        <section className="mt-4">
          <h3 className="text-[14.5px] font-semibold text-[var(--cp-text-dim)]">초등학교 {schools.length}교 · {data.gaps.schoolNearM}m 안 열선</h3>
          <ul className="mt-1 flex flex-wrap gap-1.5 text-[13.5px]">
            {schools.map((s) => (
              <li key={s.name} className={`rounded px-2 py-0.5 ${s.heatNear.length ? "bg-[var(--cp-track)] text-[var(--cp-text)]" : "bg-(--dump-accent)/12 font-semibold text-(--dump-accent)"}`}>
                {s.name} · 열선 {s.heatNear.length ? "있음" : "없음"}
              </li>
            ))}
          </ul>
        </section>
      )}

      {checks.length > 0 && (
        <section className="mt-4">
          <h3 className="text-[14.5px] font-semibold text-[var(--cp-text-dim)]">이 동에 걸린 점검 후보 {checks.length}건</h3>
          <ul className="mt-1 flex flex-col gap-1">
            {checks.map((c) => (
              <li key={c.id} className="rounded-lg bg-(--dump-accent)/8 px-2.5 py-1.5 text-[14px] leading-snug">
                <span className="font-medium text-(--dump-accent-ink)">{c.title}</span>
                <span className="ml-1 text-[13px] text-[var(--cp-text-dim)]">{c.dept} · {c.due} · {c.scale}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mt-4">
        <h3 className="text-[14.5px] font-semibold text-[var(--cp-text-dim)]">건축물관리자 제설 시한</h3>
        <p className="mt-1 text-[14px] leading-relaxed text-[var(--cp-text)]">{linkSnowLawRefs("눈이 그친 때로부터 주간은 4시간 이내, 야간은 다음 날 오전 11시까지. 1일 적설 10cm 이상이면 24시간 이내(조례 제5조). 범위는 보도 전부와 이면도로 대지경계 1m(조례 제4조).")}</p>
      </section>

      <p className="mt-3 text-[12.5px] leading-relaxed text-[var(--cp-text-faint)]">
        동 값은 동주민센터 담당 구간표가 없어 행정동 경계로 자른 것입니다(구 경계선 위 제설함은 동별 합에서 뺌). 거리 기준({data.gaps.heatNearM}m 열선 · {data.gaps.materialNearM}m 자재 · {data.gaps.schoolNearM}m 학교)은 이 화면의 가정이며, 자원은 공개 자료 기준이라 현장 수량과 다를 여지가 있습니다.
      </p>
      <div className="mt-3 flex justify-end gap-2 print:hidden">
        <button onClick={() => window.print()} className="rounded-full border border-[var(--cp-border)] px-3.5 py-1.5 text-[13px] font-semibold text-(--dump-accent) hover:bg-[var(--cp-hover)]">
          인쇄
        </button>
      </div>
    </ModalShell>
  )
}
