"use client"

import { useMemo } from "react"
import {
  Bar,
  Cell,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import { levelNum, textColor, type CrowdDetail } from "@/lib/crowd/seoul-rtd"
import { useLang } from "@/components/crowd/lang-context"
import { trHour, trRange, type Lang, type UIStrings } from "@/lib/crowd/i18n"

interface ChartDatum {
  time: string
  people: number
  yesterday: number | null
  color: string
  kind: "past" | "now" | "forecast"
  range: string
  level: string
}

function ChartTooltip({
  active,
  payload,
  t,
  lang,
  trLv,
}: {
  active?: boolean
  payload?: Array<{ payload: ChartDatum }>
  t: UIStrings
  lang: Lang
  trLv: (lv: string) => string
}) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  const kindLabel = d.kind === "now" ? t.kindNow : d.kind === "past" ? t.kindPast : t.kindForecast
  return (
    <div className="rounded-md border border-[var(--cp-border-strong)] bg-[var(--cp-tip-bg)] px-2.5 py-1.5 text-[12px] shadow-lg">
      <p className="font-medium text-[var(--cp-text-strong)]">
        {trHour(d.time, lang)} <span className="text-[var(--cp-text-dim)]">({kindLabel})</span>
      </p>
      <p className="mt-0.5 font-mono tabular-nums" style={{ color: d.color }}>
        {trLv(d.level)} · {d.range ? trRange(d.range, lang) : t.approxPeople(d.people)}
      </p>
      {d.yesterday != null && (
        <p className="text-[var(--cp-text-dim)]">
          {t.yesterday} <span className="font-mono tabular-nums">{t.people(d.yesterday)}</span>
        </p>
      )}
    </div>
  )
}

// recharts는 SVG 속성이라 CSS 변수가 안 통해 테마별 팔레트를 직접 전달
const CHART_COLORS = {
  dark: {
    axisLine: "#ffffff1a",
    cursor: "#ffffff0d",
    refLine: "#ffffff66",
    refLabel: "#e2e8f0",
  },
  light: {
    axisLine: "#0f172a1f",
    cursor: "#0f172a0d",
    refLine: "#0f172a80",
    refLabel: "#334155",
  },
}

/** 24시간 인파 흐름 차트 + 피크·한산 시간 안내 */
export default function SpotChart({ detail, light }: { detail: CrowdDetail; light: boolean }) {
  const { lang, t, level: trLv } = useLang()
  const C = light ? CHART_COLORS.light : CHART_COLORS.dark
  const now = detail.series[detail.nowIndex]

  // 남은 예측 중 가장 한산한 시간대 — "언제 가면 좋을까"에 대한 답
  const calmest = useMemo(() => {
    const fc = detail.series.filter((p) => p.kind === "forecast")
    if (fc.length === 0) return null
    return fc.reduce((best, p) => {
      const a = levelNum(p.level)
      const b = levelNum(best.level)
      return a < b || (a === b && p.people < best.people) ? p : best
    })
  }, [detail.series])

  const chartData: ChartDatum[] = detail.series.map((p) => ({
    time: trHour(p.time, lang),
    people: p.people,
    yesterday: p.yesterday,
    color: p.color,
    kind: p.kind,
    range: p.range,
    level: p.level,
  }))

  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between">
        <h3 className="text-[12px] font-medium uppercase tracking-wider text-[var(--cp-text-dim)]">
          {t.chartTitle}
        </h3>
        <span className="text-[11px] text-[var(--cp-text-faint)]">
          {t.chartLegendBar} <span className="mx-1 text-[var(--cp-text-faint)]">|</span> {t.chartLegendLine}
        </span>
      </div>
      <div className="h-44 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={chartData} margin={{ top: 4, right: 0, bottom: 0, left: -14 }}>
            <XAxis
              dataKey="time"
              tick={{ fontSize: 10, fill: "#64748b" }}
              interval={3}
              axisLine={{ stroke: C.axisLine }}
              tickLine={false}
            />
            <YAxis
              tick={{ fontSize: 10, fill: "#64748b" }}
              tickFormatter={(v: number) => t.yAxisTen(v)}
              axisLine={false}
              tickLine={false}
              width={46}
            />
            <Tooltip content={<ChartTooltip t={t} lang={lang} trLv={trLv} />} cursor={{ fill: C.cursor }} />
            <Bar dataKey="people" radius={[2, 2, 0, 0]} isAnimationActive={false}>
              {chartData.map((d, i) => (
                <Cell
                  key={i}
                  fill={d.color}
                  fillOpacity={d.kind === "now" ? 1 : d.kind === "past" ? 0.4 : 0.75}
                />
              ))}
            </Bar>
            <Line
              dataKey="yesterday"
              stroke="#94a3b8"
              strokeWidth={1.2}
              strokeDasharray="4 3"
              dot={false}
              isAnimationActive={false}
            />
            {now && (
              <ReferenceLine
                x={now.time}
                stroke={C.refLine}
                strokeDasharray="2 2"
                label={{ value: t.kindNow, position: "top", fontSize: 10, fill: C.refLabel }}
              />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      {detail.peakForecastHour &&
        (() => {
          const pf = t.peakForecast(detail.peakForecastHour, trLv(detail.peakForecastLevel))
          return (
            <p className="mt-1.5 text-[12px] text-[var(--cp-text-dim)]">
              {pf.pre}
              <span className="font-mono font-semibold tabular-nums text-[var(--cp-text-strong)]">{pf.hour}</span>
              {pf.post}
            </p>
          )
        })()}
      {calmest &&
        (levelNum(calmest.level) <= 2 ? (
          (() => {
            const cb = t.calmBest(trHour(calmest.time, lang), trLv(calmest.level))
            return (
              <p className="mt-0.5 text-[12px] text-[var(--cp-text-dim)]">
                {cb.pre}
                <span className="font-mono font-semibold tabular-nums" style={{ color: textColor(calmest.color, light) }}>
                  {cb.time}
                </span>
                {cb.post}
              </p>
            )
          })()
        ) : (
          <p className="mt-0.5 text-[12px] text-[var(--cp-text-dim)]">{t.allBusy}</p>
        ))}
    </div>
  )
}
