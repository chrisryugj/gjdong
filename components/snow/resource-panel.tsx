"use client"

import type { ResourceId, SnowMapData } from "@/lib/snow/types"
import { RESOURCES } from "@/lib/snow/labels"
import { dongsSorted, dongValue, fmt, heatByYear, seoulRank, totals } from "@/lib/snow/facts"
import { SectionHead } from "@/components/dumping/section-head"

// 자원 현황 탭. 자원 4종 합계 → 동별 표(지표를 고르면 지도 기둥이 바뀐다) → 서울 25개 구 열선 비교 → 설치 연도 → 데이터 출처

interface Props {
  data: SnowMapData | null
  colMetric: ResourceId | "all" | null
  onColMetric: (m: ResourceId | "all") => void
  selectedDong: string | null
  onSelectDong: (d: string | null) => void
}

export default function ResourcePanel({ data, colMetric, onColMetric, selectedDong, onSelectDong }: Props) {
  if (!data) return <div className="p-4 text-[14px] text-[var(--cp-text-dim)]">데이터 로딩 중…</div>
  const t = totals(data)
  const metric = colMetric ?? "all"
  const rows = dongsSorted(data, metric)
  const max = Math.max(1, ...rows.map((d) => dongValue(d, metric)))
  const seoul = seoulRank(data)
  const years = heatByYear(data)
  const unit = metric === "heat" ? "m" : metric === "all" ? "" : (RESOURCES.find((r) => r.id === metric)?.unit ?? "")

  return (
    <div className="px-4 pb-4 pt-3">
      <p className="dump-headline text-[21px] leading-[1.42] text-[var(--cp-text-strong)]">
        광진구 제설 자원 {fmt(t.sites)}지점. <span className="text-[var(--cp-text-muted)]">열선은 {t.heatDongs}개 동에만 있고, 이면도로는 염화칼슘함 {fmt(t.cacl)}개소가 받친다.</span>
      </p>

      <SectionHead n="01" sub="공공데이터포털 광진구 4종. 표 머리를 누르면 지도 기둥이 그 자원으로 바뀐다">
        자원 4종
      </SectionHead>
      <div className="grid grid-cols-2 gap-2">
        {RESOURCES.map((r) => {
          const v = r.id === "heat" ? `${t.heatSeg}구간` : r.id === "salt" ? `${t.salt}개소` : r.id === "cacl" ? `${t.cacl}개소` : `${t.sand}지점`
          const s = r.id === "heat" ? `${fmt(t.heatM)}m · 1차로 기준` : r.id === "salt" ? "도로과 · 간선도로변" : r.id === "cacl" ? "동주민센터 · 이면도로" : `${fmt(t.sandBags)}포 · 취약지역 ${t.sandSites}`
          const on = metric === r.id
          return (
            <button key={r.id} onClick={() => onColMetric(r.id)} aria-pressed={on} className={`rounded-xl border px-3 py-2.5 text-left transition-colors ${on ? "border-[var(--cp-border-active)] bg-[var(--cp-hover)]" : "border-[var(--cp-border)] hover:bg-[var(--cp-hover)]"}`}>
              <div className="flex items-center gap-1.5 text-[12px] font-semibold text-[var(--cp-text-dim)]">
                <i className="h-2.5 w-2.5 rounded-sm" style={{ background: r.color }} />
                {r.label}
              </div>
              <div className="mt-0.5 font-mono text-[21px] font-semibold leading-none text-[var(--cp-text-strong)]">{v}</div>
              <div className="mt-1 text-[11.5px] text-[var(--cp-text-dim)]">{s}</div>
            </button>
          )
        })}
      </div>

      <SectionHead n="02" sub="동 이름을 누르면 지도가 그 동으로 간다. 막대는 고른 지표의 구 최댓값 대비">
        동별 배치
      </SectionHead>
      <div className="mb-2 flex flex-wrap gap-1">
        {(["all", ...RESOURCES.map((r) => r.id)] as const).map((m) => (
          <button key={m} onClick={() => onColMetric(m)} aria-pressed={metric === m} className={`rounded-full border px-2.5 py-0.5 text-[12.5px] ${metric === m ? "border-(--dump-accent) bg-(--dump-accent)/10 font-semibold text-(--dump-accent)" : "border-[var(--cp-border)] text-[var(--cp-text-muted)]"}`}>
            {m === "all" ? "합계" : RESOURCES.find((r) => r.id === m)?.label}
          </button>
        ))}
      </div>
      <ol className="space-y-1">
        {rows.map((d, i) => {
          const v = dongValue(d, metric)
          const sel = selectedDong === d.d
          return (
            <li key={d.d}>
              <button onClick={() => onSelectDong(sel ? null : d.d)} aria-pressed={sel} className={`flex w-full items-center gap-2 rounded-lg px-1.5 py-1 text-left hover:bg-[var(--cp-hover)] ${sel ? "bg-[var(--cp-hover2)]" : ""}`}>
                <span className="dump-idx w-5 text-[12px] text-[var(--cp-text-faint)]">{String(i + 1).padStart(2, "0")}</span>
                <span className={`w-16 shrink-0 text-[14px] ${sel ? "font-bold text-(--dump-accent)" : "font-semibold text-[var(--cp-text-strong)]"}`}>{d.d}</span>
                <span className="dump-bars relative h-2 flex-1 overflow-hidden rounded-full bg-[var(--cp-track)]">
                  <i className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${(v / max) * 100}%`, background: metric === "all" ? "var(--dump-accent)" : RESOURCES.find((r) => r.id === metric)?.color }} />
                </span>
                <span className="w-16 shrink-0 text-right font-mono text-[13.5px] text-[var(--cp-text)]">
                  {v ? `${fmt(v)}${unit}` : <span className="text-[var(--cp-text-faint)]">없음</span>}
                </span>
              </button>
            </li>
          )
        })}
      </ol>

      <SectionHead n="03" sub={`서울 열린데이터광장 ${data.asof.seoul} 기준 ${seoul.of}개 구 ${fmt(seoul.totalN)}개소 ${fmt(seoul.totalM)}m. 광진구는 연장 ${seoul.rank}위`}>
        서울 25개 구 열선 비교
      </SectionHead>
      <ol className="space-y-[3px]">
        {data.seoul.map((g, i) => {
          const me = g.gu === "광진구"
          return (
            <li key={g.gu} className="flex items-center gap-2 text-[12.5px]">
              <span className="dump-idx w-5 text-[11px] text-[var(--cp-text-faint)]">{String(i + 1).padStart(2, "0")}</span>
              <span className={`w-14 shrink-0 ${me ? "font-bold text-(--dump-accent)" : "text-[var(--cp-text-muted)]"}`}>{g.gu}</span>
              <span className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--cp-track)]">
                <i className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${(g.m / seoul.max) * 100}%`, background: me ? "var(--dump-accent)" : "var(--cp-text-faint)" }} />
              </span>
              <span className={`w-20 shrink-0 text-right font-mono ${me ? "font-semibold text-[var(--cp-text-strong)]" : "text-[var(--cp-text-dim)]"}`}>
                {fmt(Math.round(g.m))}m · {g.n}
              </span>
            </li>
          )
        })}
      </ol>
      <p className="mt-2 text-[12px] leading-relaxed text-[var(--cp-text-faint)]">
        서울시 집계는 광진구 {seoul.gu?.n}개소 {fmt(seoul.gu?.m ?? 0)}m인데 구 공개 데이터({data.asof.heat})는 {t.heatSeg}구간 {fmt(t.heatM)}m다. 2025년 설치분이 구 데이터에 아직 없다. 지도의 열선은 구 데이터 기준.
      </p>

      <SectionHead n="04" sub="구 공개 데이터의 설치년도. 예정 표기는 2025년 상반기 설치 예정으로 적힌 구간">
        열선 설치 연도
      </SectionHead>
      <div className="flex items-end gap-1.5" style={{ height: 92 }}>
        {years.map((y) => {
          const maxM = Math.max(...years.map((x) => x.m))
          return (
            <div key={y.year} className="flex flex-1 flex-col items-center justify-end gap-1">
              <span className="font-mono text-[11.5px] text-[var(--cp-text-muted)]">{fmt(y.m)}m</span>
              <i className="w-full rounded-t-sm" style={{ height: `${Math.max(6, (y.m / maxM) * 60)}px`, background: y.year === "예정" ? "var(--cp-text-faint)" : "var(--dump-accent)" }} />
              <span className="text-[11.5px] text-[var(--cp-text-dim)]">
                {y.year} · {y.n}
              </span>
            </div>
          )
        })}
      </div>

      <SectionHead n="05" sub="전부 공공데이터포털·서울 열린데이터광장 파일 데이터. 이용허락 제한 없음">
        데이터
      </SectionHead>
      <ul className="space-y-1.5 text-[12.5px] leading-snug text-[var(--cp-text-muted)]">
        {(Object.keys(data.source) as (keyof typeof data.source)[]).map((k) => (
          <li key={k} className="flex gap-2">
            <span className="w-[76px] shrink-0 font-mono text-[var(--cp-text-dim)]">{data.asof[k]}</span>
            <span>{data.source[k]}</span>
          </li>
        ))}
        <li className="flex gap-2">
          <span className="w-[76px] shrink-0 font-mono text-[var(--cp-text-dim)]">지오코딩</span>
          <span>
            {data.meta.geocode.rule}. 근사 처리 열선 {data.meta.geocode.heatApprox}구간 · 모래주머니 {data.meta.geocode.sandApprox}지점. 제설함 {data.meta.saltNoDong}개소는 구 경계선 위라 동 미판정
          </span>
        </li>
      </ul>
    </div>
  )
}
