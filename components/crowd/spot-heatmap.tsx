"use client"

import { useEffect, useMemo, useState } from "react"
import { CONGEST_LEVELS, LEVEL_COLORS, textColor } from "@/lib/crowd/seoul-rtd"
import { loadHeatmap, patternLevel, type HeatEntry } from "@/lib/crowd/heatmap-client"
import { useLang } from "@/components/crowd/lang-context"

// ── 요일×시간 히트맵 — 데이터 로더는 heatmap-client(시간대 렌즈와 공용)
const DOW_ORDER = [1, 2, 3, 4, 5, 6, 0] as const

/** 요일×시간 혼잡 패턴 — 셀 탭(모바일)·호버(PC)로 개별 확인 */
export default function SpotHeatmap({ name, light, city }: { name: string; light: boolean; city: string }) {
  const { t, level: trLv } = useLang()
  const DOW_LABELS = t.dowLabels
  const [heat, setHeat] = useState<HeatEntry | null>(null)
  const [picked, setPicked] = useState<{ dow: number; hour: number } | null>(null)

  useEffect(() => {
    let alive = true
    setPicked(null)
    void loadHeatmap(city).then((spots) => {
      if (alive) setHeat(spots?.[name] ?? null)
    })
    return () => {
      alive = false
    }
  }, [name, city])

  const heatTotal = useMemo(() => {
    if (!heat?.cnt) return 0
    let total = 0
    for (const row of heat.cnt) for (const c of row ?? []) total += c
    return total
  }, [heat])

  if (!heat || heatTotal === 0) return null

  const cellInfo = (d: number, h: number) => {
    const cnt = heat.cnt[d]?.[h] ?? 0
    const lv = patternLevel(heat, d, h)
    return { cnt, lv, label: lv > 0 ? trLv(CONGEST_LEVELS[lv - 1]) : t.noData }
  }

  const kstNow = new Date(Date.now() + 9 * 3600 * 1000)
  const pickedInfo = picked ? cellInfo(picked.dow, picked.hour) : null

  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between">
        <h3 className="text-[12px] font-medium uppercase tracking-wider text-[var(--cp-text-dim)]">
          {t.heatmapTitle}
        </h3>
        <span className="font-mono text-[11px] tabular-nums text-[var(--cp-text-faint)]">
          {t.heatmapSample(heatTotal.toLocaleString())}
        </span>
      </div>
      <div className="space-y-[2px]">
        {DOW_ORDER.map((d, ri) => (
          <div key={d} className="flex items-center gap-[2px]">
            <span className="w-4 shrink-0 text-[10px] text-[var(--cp-text-dim)]">{DOW_LABELS[ri]}</span>
            {Array.from({ length: 24 }, (_, h) => {
              const { cnt, lv, label } = cellInfo(d, h)
              const isNow = d === kstNow.getUTCDay() && h === kstNow.getUTCHours()
              const isPicked = picked?.dow === d && picked?.hour === h
              return (
                <button
                  key={h}
                  type="button"
                  onClick={() => setPicked(isPicked ? null : { dow: d, hour: h })}
                  title={t.cellTitle(DOW_LABELS[ri], h, label, cnt)}
                  aria-label={t.cellTitle(DOW_LABELS[ri], h, label, cnt)}
                  className="h-3 min-w-0 flex-1 cursor-pointer rounded-[2px] p-0"
                  style={{
                    background: lv > 0 ? LEVEL_COLORS[CONGEST_LEVELS[lv - 1]] : "var(--cp-track)",
                    boxShadow: isPicked
                      ? "0 0 0 1.5px #0ea5e9"
                      : isNow
                        ? "0 0 0 1.5px var(--cp-text-strong)"
                        : undefined,
                  }}
                />
              )
            })}
          </div>
        ))}
        <div className="flex gap-[2px] pl-[18px] pt-0.5">
          {[0, 6, 12, 18].map((h) => (
            <span key={h} className="flex-1 text-[10px] text-[var(--cp-text-faint)]">
              {t.hourShort(h)}
            </span>
          ))}
        </div>
      </div>
      {/* 탭한 셀 정보 — title 툴팁이 안 뜨는 터치 기기용 */}
      {picked && pickedInfo && (
        <p className="mt-1.5 text-[12px] text-[var(--cp-text)]">
          <span className="font-mono font-semibold tabular-nums">
            {DOW_LABELS[DOW_ORDER.indexOf(picked.dow as (typeof DOW_ORDER)[number])]} {t.hourShort(picked.hour)}
          </span>{" "}
          · {t.avg}{" "}
          <span
            className="font-semibold"
            style={pickedInfo.lv > 0 ? { color: textColor(LEVEL_COLORS[CONGEST_LEVELS[pickedInfo.lv - 1]], light) } : undefined}
          >
            {pickedInfo.label}
          </span>
          {pickedInfo.cnt > 0 && <span className="text-[var(--cp-text-dim)]"> {t.sampleCount(pickedInfo.cnt)}</span>}
        </p>
      )}
      <div className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1">
        {CONGEST_LEVELS.map((lv) => (
          <span key={lv} className="flex items-center gap-1 text-[11px] text-[var(--cp-text-faint)]">
            <span className="h-2 w-2 rounded-[2px]" style={{ background: LEVEL_COLORS[lv] }} />
            {trLv(lv)}
          </span>
        ))}
        <span className="text-[11px] text-[var(--cp-text-faint)]">{t.heatmapLegendNote}</span>
      </div>
    </div>
  )
}
