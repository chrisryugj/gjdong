"use client"

import { useMemo, useState } from "react"
import type { SnowForecast } from "@/lib/snow/types"
import { weatherLabel } from "@/lib/snow/weather"

// 지도 아래 예보 띠(6라운드, dumping 월별 띠 규약 이식). 기상청 단기예보 48시간(광진구 격자)을 시간 막대로: 기온과 적설을 탭으로 오가고,
// 막대에 마우스를 올리면(누르면 고정) 그 시각의 기온·적설·날씨가 뜬다. 영하 시각은 액센트(청빙), 적설 시각은 열선색. 대응 단계 판정과 같은 원천(/api/snow/forecast)

type Series = "temp" | "snow"
const SERIES: { id: Series; label: string; basis: string }[] = [
  { id: "temp", label: "기온", basis: "영하 시각은 청빙" },
  { id: "snow", label: "적설", basis: "시간당 cm" },
]
const HEAT = { dark: "#ffb703", light: "#c98a00" } // lib/snow/labels RESOURCES[0]와 같은 값(열선색). 적설 막대
const fmtH = (t: string) => `${Number(t.slice(5, 7))}/${Number(t.slice(8, 10))} ${t.slice(11, 13)}시`
const fmtT = (v: number) => `${v < 0 ? "−" : ""}${Math.abs(Math.round(v))}°`

export default function ForecastStrip({ forecast, dark }: { forecast: SnowForecast | null | "error"; dark: boolean }) {
  const [series, setSeries] = useState<Series>("temp")
  const [hover, setHover] = useState<number | null>(null)
  const [pinned, setPinned] = useState<number | null>(null)
  const fc = forecast && forecast !== "error" ? forecast : null
  const hours = useMemo(() => fc?.hours ?? [], [fc])
  const stats = useMemo(() => {
    const temps = hours.map((h) => h.temp)
    const lo = Math.min(0, ...temps)
    const hi = Math.max(1, ...temps)
    const snowMax = Math.max(0.5, ...hours.map((h) => h.snow))
    const freezing = hours.filter((h) => h.temp <= 0).length
    return { lo, hi, snowMax, freezing }
  }, [hours])
  if (!fc || hours.length < 2)
    return (
      <div className="px-4 py-3 text-[12.5px] text-[var(--cp-text-dim)]">{forecast === "error" ? "예보를 받지 못했습니다" : "예보를 불러오는 중"}</div>
    )
  const sel = pinned ?? hover
  const h = sel != null ? hours[sel] : null
  // 축 라벨: 날짜가 바뀌는 00시와 첫·마지막 시각만
  const axis = hours.map((x, i) => ({ i, t: x.t })).filter(({ t, i }) => t.slice(11, 13) === "00" || i === 0 || i === hours.length - 1)
  const switchSeries = (s: Series) => {
    setSeries(s)
    setPinned(null)
    setHover(null)
  }
  return (
    <div className="relative px-4 pb-2 pt-2" onMouseLeave={() => setHover(null)}>
      <div className="flex items-center justify-between gap-3">
        <div role="tablist" aria-label="예보 지표" className="flex rounded-full border border-[var(--cp-border)] p-0.5">
          {SERIES.map((s) => (
            <button key={s.id} role="tab" aria-selected={series === s.id} onClick={() => switchSeries(s.id)} className={`rounded-full px-2.5 py-0.5 text-[12px] font-semibold transition-colors ${series === s.id ? "bg-[var(--dump-ink)] text-[var(--dump-paper)]" : "text-[var(--cp-text-dim)] hover:text-[var(--cp-text-strong)]"}`}>
              {s.label}
            </button>
          ))}
        </div>
        <span className="min-w-0 truncate text-[12px] font-semibold text-[var(--cp-text-dim)]">
          앞으로 24시간 적설 <b className="font-mono text-[var(--cp-text-strong)]">{fc.snow24}cm</b> · 최저 <b className="font-mono text-[var(--cp-text-strong)]">{fmtT(fc.minTemp24)}</b> · 영하 {stats.freezing}시간 · {fc.model}
        </span>
      </div>
      <div className="mt-1.5 flex h-10 items-end gap-[2px]" role="img" aria-label={`48시간 ${series === "temp" ? "기온" : "적설"} 예보 ${fmtH(hours[0].t)}부터 ${fmtH(hours[hours.length - 1].t)}까지`}>
        {hours.map((x, i) => {
          const on = i === sel
          const v = series === "temp" ? x.temp : x.snow
          // 기온: 축 최저(영하 포함)에서 최고까지 비례. 적설: 최대 대비. 값 0도 바닥 4%는 그린다(막대 자리 유지)
          const pct = series === "temp" ? ((v - stats.lo) / (stats.hi - stats.lo)) * 100 : (v / stats.snowMax) * 100
          const cold = series === "temp" && x.temp <= 0
          const snowy = series === "snow" && x.snow > 0
          const color = on ? "var(--dump-ink)" : cold ? "var(--dump-accent)" : snowy ? (dark ? HEAT.dark : HEAT.light) : "var(--cp-border-strong)"
          return (
            <button key={x.t} type="button" aria-label={`${fmtH(x.t)} ${fmtT(x.temp)} 적설 ${x.snow}cm`} aria-pressed={pinned === i} onMouseEnter={() => setHover(i)} onFocus={() => setHover(i)} onClick={() => setPinned((p) => (p === i ? null : i))} className="group flex h-full min-w-0 flex-1 items-end">
              <i className="block w-full rounded-t-[2px] transition-colors" style={{ height: `${Math.max(4, pct)}%`, background: color }} />
            </button>
          )
        })}
      </div>
      <div className="mt-1 flex justify-between font-mono text-[12px] text-[var(--cp-text-faint)]">
        {axis.map(({ i, t }) => (
          <span key={i}>{t.slice(11, 13) === "00" ? `${Number(t.slice(5, 7))}/${Number(t.slice(8, 10))}` : `${t.slice(11, 13)}시`}</span>
        ))}
      </div>
      {h && sel != null && (
        <div className="dump-fl pointer-events-none absolute bottom-[calc(100%-6px)] z-10 rounded-xl px-3 py-2.5" style={{ left: `calc(16px + (100% - 32px) * ${((sel + 0.5) / hours.length).toFixed(4)})`, transform: sel < 6 ? "translateX(-10%)" : sel > hours.length - 7 ? "translateX(-90%)" : "translateX(-50%)" }}>
          <div className="w-44 text-[12.5px] leading-snug text-[var(--cp-text)]">
            <p className="flex items-baseline justify-between gap-2">
              <span className="font-mono text-[13px] font-bold text-[var(--cp-text-strong)]">{fmtH(h.t)}</span>
              <span className="font-mono text-[15px] font-bold text-[var(--cp-text-strong)]">{fmtT(h.temp)}</span>
            </p>
            <p className="mt-1 text-[var(--cp-text-muted)]">
              {weatherLabel(h.code)} · 적설 {h.snow}cm{h.temp <= 0 ? " · 영하, 결빙 조건" : ""}
            </p>
            {pinned === sel && <p className="mt-1 text-right text-[12px] text-[var(--cp-text-faint)]">고정됨 · 다시 누르면 해제</p>}
          </div>
        </div>
      )}
    </div>
  )
}
