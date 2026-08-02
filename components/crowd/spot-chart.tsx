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
}: {
  active?: boolean
  payload?: Array<{ payload: ChartDatum }>
}) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  const kindLabel = d.kind === "now" ? "현재" : d.kind === "past" ? "실측" : "예측"
  return (
    <div className="rounded-md border border-[var(--cp-border-strong)] bg-[var(--cp-tip-bg)] px-2.5 py-1.5 text-[12px] shadow-lg">
      <p className="font-medium text-[var(--cp-text-strong)]">
        {d.time} <span className="text-[var(--cp-text-dim)]">({kindLabel})</span>
      </p>
      <p className="mt-0.5 font-mono tabular-nums" style={{ color: d.color }}>
        {d.level} · {d.range || `약 ${d.people.toLocaleString()}명`}
      </p>
      {d.yesterday != null && (
        <p className="text-[var(--cp-text-dim)]">
          어제 <span className="font-mono tabular-nums">{d.yesterday.toLocaleString()}명</span>
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
    time: p.time,
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
          24시간 인파 흐름
        </h3>
        <span className="text-[11px] text-[var(--cp-text-faint)]">
          막대 = 실측·예측 <span className="mx-1 text-[var(--cp-text-faint)]">|</span> 점선 = 어제
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
              tickFormatter={(v: number) => (v >= 10000 ? `${v / 10000}만` : String(v))}
              axisLine={false}
              tickLine={false}
              width={46}
            />
            <Tooltip content={<ChartTooltip />} cursor={{ fill: C.cursor }} />
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
                label={{ value: "현재", position: "top", fontSize: 10, fill: C.refLabel }}
              />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      {detail.peakForecastHour && (
        <p className="mt-1.5 text-[12px] text-[var(--cp-text-dim)]">
          앞으로는 <span className="font-mono font-semibold tabular-nums text-[var(--cp-text-strong)]">{detail.peakForecastHour}시</span>에 가장 붐빌
          전망 ({detail.peakForecastLevel})
        </p>
      )}
      {calmest &&
        (levelNum(calmest.level) <= 2 ? (
          <p className="mt-0.5 text-[12px] text-[var(--cp-text-dim)]">
            한산하게 가려면 <span className="font-mono font-semibold tabular-nums" style={{ color: textColor(calmest.color, light) }}>{calmest.time}</span>가 좋아요 ({calmest.level} 예상)
          </p>
        ) : (
          <p className="mt-0.5 text-[12px] text-[var(--cp-text-dim)]">오늘은 남은 시간 내내 붐빌 전망이에요</p>
        ))}
    </div>
  )
}
