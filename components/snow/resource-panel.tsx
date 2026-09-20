"use client"

import type { SnowMapData } from "@/lib/snow/types"
import { RESOURCES } from "@/lib/snow/labels"
import { fmt, heatByYear, seoulRank, totals } from "@/lib/snow/facts"
import { COL_METRICS, type ColMetric, colValue } from "./map-geo"
import { SectionHead } from "@/components/dumping/section-head"

// 자원 현황 탭. 01 자원 4종(열선은 구간, 자재는 개소. 단위가 달라 합계를 내지 않는다) 02 동별 배치(지표를 고르면 지도 기둥이 바뀝니다. 기둥은 동주민센터 위치) 03 서울 25개 구 열선 비교
// 문장 규칙: 합니다체, 한 문장 사실 하나

interface Props {
  data: SnowMapData | null
  dark: boolean
  colMetric: ColMetric | null
  onColMetric: (m: ColMetric | null) => void
  selectedDong: string | null
  onSelectDong: (d: string | null) => void
}

export default function ResourcePanel({ data, dark, colMetric, onColMetric, selectedDong, onSelectDong }: Props) {
  if (!data) return <div className="p-4"><div className="dump-skel h-24 rounded-xl" /></div>
  const t = totals(data)
  const metric: ColMetric = colMetric ?? "materials"
  const def = COL_METRICS.find((m) => m.id === metric)!
  const rows = [...data.dongs].sort((a, b) => colValue(b, metric) - colValue(a, metric))
  const max = Math.max(1, ...rows.map((d) => colValue(d, metric)))
  const seoul = seoulRank(data)
  const years = heatByYear(data)
  const color = (id: string) => {
    const r = RESOURCES.find((x) => x.id === id)
    return r ? (dark ? r.color : r.colorLight) : "var(--dump-accent)"
  }
  const barColor = metric === "materials" ? "var(--dump-accent)" : metric === "weak" ? (dark ? "#e0705a" : "#a8322a") : color(metric)

  return (
    <div className="px-4 pb-4 pt-3">
      <p className="dump-headline text-[21px] leading-[1.42] text-[var(--cp-text-strong)]">
        열선 {t.heatSeg}구간은 {t.heatDongs}개 동에 있고 비치 자재 {fmt(t.materials)}개소는 15개 동 전부에 있습니다.
      </p>

      <SectionHead n="01" sub={`공공데이터포털 광진구 3종과 서울시 열선 집계. 기준일 ${data.asof.sand.slice(0, 7)}부터 ${data.asof.cacl.slice(0, 7)}까지`}>
        자원 4종
      </SectionHead>
      <div className="grid grid-cols-2 gap-2">
        {RESOURCES.map((r) => {
          const v = r.id === "heat" ? `${t.heatSeg}구간` : r.id === "salt" ? `${t.salt}개소` : r.id === "cacl" ? `${t.cacl}개소` : `${t.sand}지점`
          const s = r.id === "heat" ? `${fmt(t.heatM)}m(1차로 기준) · 서울시 집계 ${data.asof.heat.slice(0, 7)}` : r.id === "salt" ? "도로과 · 간선도로변" : r.id === "cacl" ? "동주민센터 · 이면도로" : `${fmt(t.sandBags)}포 · ${data.asof.sand.slice(0, 4)}년 기준`
          const on = metric === r.id
          return (
            <button key={r.id} onClick={() => onColMetric(on ? null : r.id)} aria-pressed={on} className={`rounded-xl border px-3 py-2.5 text-left transition-colors ${on ? "border-[var(--cp-border-active)] bg-[var(--cp-hover)]" : "border-[var(--cp-border)] hover:bg-[var(--cp-hover)]"}`}>
              <div className="flex items-center gap-1.5 text-[12.5px] font-semibold text-[var(--cp-text-dim)]">
                <i className={`h-2.5 w-2.5 ${r.id === "heat" ? "h-1 w-4 rounded-full" : "rounded-full"}`} style={r.id === "sand" ? { border: `2px solid ${color(r.id)}` } : { background: color(r.id) }} />
                {r.label}
              </div>
              <div className="mt-0.5 font-mono text-[22px] font-semibold leading-none text-[var(--cp-text-strong)]">{v}</div>
              <div className="mt-1 text-[12px] leading-snug text-[var(--cp-text-dim)]">{s}</div>
            </button>
          )
        })}
      </div>

      <SectionHead n="02" sub="지표를 고르면 지도 기둥이 바뀝니다. 기둥은 동주민센터 위치에 섭니다. 동 이름을 누르면 지도가 그 동을 보여 줍니다">
        동별 배치
      </SectionHead>
      <div className="mb-2 flex flex-wrap gap-1">
        {COL_METRICS.map((m) => (
          <button key={m.id} onClick={() => onColMetric(m.id)} aria-pressed={metric === m.id} className={`rounded-full border px-2.5 py-0.5 text-[12.5px] ${metric === m.id ? "border-(--dump-accent) bg-(--dump-accent)/10 font-semibold text-(--dump-accent)" : "border-[var(--cp-border)] text-[var(--cp-text-muted)]"}`}>
            {m.label}
          </button>
        ))}
        <button onClick={() => onColMetric(null)} aria-pressed={colMetric === null} className={`rounded-full border px-2.5 py-0.5 text-[12.5px] ${colMetric === null ? "border-(--dump-accent) bg-(--dump-accent)/10 font-semibold text-(--dump-accent)" : "border-[var(--cp-border)] text-[var(--cp-text-muted)]"}`}>
          기둥 끄기
        </button>
      </div>
      <ol className="space-y-1">
        {rows.map((d, i) => {
          const v = colValue(d, metric)
          const sel = selectedDong === d.d
          return (
            <li key={d.d}>
              <button onClick={() => onSelectDong(sel ? null : d.d)} aria-pressed={sel} className={`flex w-full items-center gap-2 rounded-lg px-1.5 py-1 text-left hover:bg-[var(--cp-hover)] ${sel ? "bg-[var(--cp-hover2)]" : ""}`}>
                <span className="dump-idx w-5 text-[12px] text-[var(--cp-text-faint)]">{String(i + 1).padStart(2, "0")}</span>
                <span className={`w-16 shrink-0 text-[14px] ${sel ? "font-bold text-(--dump-accent)" : "font-semibold text-[var(--cp-text-strong)]"}`}>{d.d}</span>
                <span className="dump-bars relative h-2 flex-1 overflow-hidden rounded-full bg-[var(--cp-track)]">
                  <i className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${(v / max) * 100}%`, background: barColor }} />
                </span>
                <span className="w-[72px] shrink-0 text-right font-mono text-[13.5px] text-[var(--cp-text)]">{v ? `${fmt(v)}${def.unit}` : <span className="text-[var(--cp-text-faint)]">없음</span>}</span>
              </button>
            </li>
          )
        })}
      </ol>

      <SectionHead n="03" sub={`서울 열린데이터광장 ${data.asof.seoul} 기준 ${seoul.of}개 구 ${fmt(seoul.totalN)}개소 ${fmt(seoul.totalM)}m`}>
        서울 25개 구 열선 · 광진구 연장 {seoul.rank}위
      </SectionHead>
      <details open>
        <summary className="cursor-pointer text-[13px] text-[var(--cp-text-muted)]">상위 5개 구와 광진구</summary>
        <ol className="mt-1.5 space-y-[3px]">
          {data.seoul
            .map((g, i) => ({ ...g, i }))
            .filter((g) => g.i < 5 || g.gu === "광진구")
            .map((g) => {
              const me = g.gu === "광진구"
              return (
                <li key={g.gu} className="flex items-center gap-2 text-[13px]">
                  <span className="dump-idx w-5 text-[12px] text-[var(--cp-text-faint)]">{String(g.i + 1).padStart(2, "0")}</span>
                  <span className={`w-14 shrink-0 ${me ? "font-bold text-(--dump-accent)" : "text-[var(--cp-text-muted)]"}`}>{g.gu}</span>
                  <span className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--cp-track)]">
                    <i className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${(g.m / seoul.max) * 100}%`, background: me ? "var(--dump-accent)" : "var(--cp-text-faint)" }} />
                  </span>
                  <span className={`w-24 shrink-0 text-right font-mono ${me ? "font-semibold text-[var(--cp-text-strong)]" : "text-[var(--cp-text-dim)]"}`}>
                    {fmt(Math.round(g.m))}m · {g.n}
                  </span>
                </li>
              )
            })}
        </ol>
      </details>
      <details className="mt-2">
        <summary className="cursor-pointer text-[13px] text-[var(--cp-text-muted)]">설치 연도별 {years.length}행</summary>
        <ul className="mt-1.5 space-y-[3px]">
          {years.map((y) => (
            <li key={y.year} className="flex items-center gap-2 text-[13px]">
              <span className="w-14 shrink-0 font-mono text-[var(--cp-text-muted)]">{y.year}</span>
              <span className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--cp-track)]">
                <i className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${(y.m / Math.max(...years.map((x) => x.m))) * 100}%`, background: color("heat") }} />
              </span>
              <span className="w-24 shrink-0 text-right font-mono text-[var(--cp-text-dim)]">
                {fmt(y.m)}m · {y.n}
              </span>
            </li>
          ))}
        </ul>
      </details>
    </div>
  )
}
