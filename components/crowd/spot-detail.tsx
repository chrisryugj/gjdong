"use client"

import { useMemo } from "react"
import { MoveDown, MoveUp } from "lucide-react"
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
import type { CrowdDetail } from "@/lib/crowd/seoul-rtd"

function TrendBadge({ label, rate, dir }: { label: string; rate: string; dir: string }) {
  const up = dir === "up"
  return (
    <div className="flex flex-col items-center gap-0.5 rounded-md border border-white/10 bg-white/[0.03] px-2 py-2">
      <span className="text-[10px] text-slate-500">{label}</span>
      <span
        className={`flex items-center gap-0.5 font-mono text-[13px] font-semibold tabular-nums ${
          up ? "text-red-400" : "text-emerald-400"
        }`}
      >
        {up ? <MoveUp className="h-3 w-3" /> : <MoveDown className="h-3 w-3" />}
        {rate || "-"}
      </span>
    </div>
  )
}

function RatioBar({
  left,
  right,
  leftLabel,
  rightLabel,
  leftColor = "#7dd3fc",
  rightColor = "#f9a8d4",
}: {
  left: number
  right: number
  leftLabel: string
  rightLabel: string
  leftColor?: string
  rightColor?: string
}) {
  return (
    <div>
      <div className="flex h-2 w-full overflow-hidden rounded-full bg-white/5">
        <div style={{ width: `${left}%`, background: leftColor }} />
        <div style={{ width: `${right}%`, background: rightColor }} />
      </div>
      <div className="mt-1 flex justify-between text-[11px] text-slate-400">
        <span>
          {leftLabel} <span className="font-mono tabular-nums text-slate-200">{left}%</span>
        </span>
        <span>
          <span className="font-mono tabular-nums text-slate-200">{right}%</span> {rightLabel}
        </span>
      </div>
    </div>
  )
}

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
    <div className="rounded-md border border-white/15 bg-[#101720] px-2.5 py-1.5 text-[11px] shadow-lg">
      <p className="font-medium text-white">
        {d.time} <span className="text-slate-500">({kindLabel})</span>
      </p>
      <p className="mt-0.5 font-mono tabular-nums" style={{ color: d.color }}>
        {d.level} · {d.range || `약 ${d.people.toLocaleString()}명`}
      </p>
      {d.yesterday != null && (
        <p className="text-slate-500">
          어제 <span className="font-mono tabular-nums">{d.yesterday.toLocaleString()}명</span>
        </p>
      )}
    </div>
  )
}

export default function SpotDetail({ detail }: { detail: CrowdDetail }) {
  const now = detail.series[detail.nowIndex]
  const maxAge = useMemo(() => Math.max(...detail.ages.map((a) => a.value)), [detail.ages])

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
    <div className="space-y-5 p-4">
      {/* 헤드라인 */}
      <div>
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-lg font-semibold leading-tight text-white">{detail.name}</h2>
          <span
            className="shrink-0 rounded-full px-2.5 py-1 text-[12px] font-bold"
            style={{ color: detail.color, background: `${detail.color}1f`, border: `1px solid ${detail.color}55` }}
          >
            {detail.level}
          </span>
        </div>
        {now && (
          <p className="mt-1.5 font-mono text-[13px] tabular-nums text-slate-300">
            지금 약 <span className="text-[17px] font-bold text-white">{now.range || `${now.people.toLocaleString()}명`}</span>
          </p>
        )}
        {detail.message.length > 0 && (
          <ul className="mt-2 space-y-0.5">
            {detail.message.map((m, i) => (
              <li key={i} className="text-[12px] leading-relaxed text-slate-400">
                {m}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* 추세 */}
      <div className="grid grid-cols-3 gap-2">
        <TrendBadge label="1시간 전 대비" rate={detail.trend.hour1.rate} dir={detail.trend.hour1.dir} />
        <TrendBadge label="3시간 전 대비" rate={detail.trend.hour3.rate} dir={detail.trend.hour3.dir} />
        <TrendBadge label="한 달 전 대비" rate={detail.trend.month1.rate} dir={detail.trend.month1.dir} />
      </div>

      {/* 24시간 타임라인 */}
      <div>
        <div className="mb-1 flex items-baseline justify-between">
          <h3 className="text-[11px] font-medium uppercase tracking-wider text-slate-500">
            24시간 인파 흐름
          </h3>
          <span className="text-[10px] text-slate-600">
            막대 = 실측·예측 <span className="mx-1 text-slate-700">|</span> 점선 = 어제
          </span>
        </div>
        <div className="h-44 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartData} margin={{ top: 4, right: 0, bottom: 0, left: -14 }}>
              <XAxis
                dataKey="time"
                tick={{ fontSize: 9, fill: "#64748b" }}
                interval={3}
                axisLine={{ stroke: "#ffffff1a" }}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 9, fill: "#64748b" }}
                tickFormatter={(v: number) => (v >= 10000 ? `${v / 10000}만` : String(v))}
                axisLine={false}
                tickLine={false}
                width={46}
              />
              <Tooltip content={<ChartTooltip />} cursor={{ fill: "#ffffff0d" }} />
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
                  stroke="#ffffff66"
                  strokeDasharray="2 2"
                  label={{ value: "현재", position: "top", fontSize: 9, fill: "#e2e8f0" }}
                />
              )}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
        {detail.peakForecastHour && (
          <p className="mt-1.5 text-[11px] text-slate-500">
            앞으로는 <span className="font-mono font-semibold tabular-nums text-white">{detail.peakForecastHour}시</span>에 가장 붐빌
            전망 ({detail.peakForecastLevel})
          </p>
        )}
      </div>

      {/* 연령대 */}
      <div>
        <h3 className="mb-2 text-[11px] font-medium uppercase tracking-wider text-slate-500">연령대 구성</h3>
        <div className="space-y-1.5">
          {detail.ages.map((age) => (
            <div key={age.label} className="flex items-center gap-2">
              <span className="w-14 shrink-0 text-[11px] text-slate-400">{age.label}</span>
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/5">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${(age.value / Math.max(maxAge, 1)) * 100}%`,
                    background: age.value === maxAge ? "#e2e8f0" : "#475569",
                  }}
                />
              </div>
              <span
                className={`w-10 shrink-0 text-right font-mono text-[11px] tabular-nums ${
                  age.value === maxAge ? "font-semibold text-white" : "text-slate-500"
                }`}
              >
                {age.value}%
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* 성비 / 상주비 */}
      <div className="grid grid-cols-1 gap-3">
        <RatioBar
          left={detail.gender.male}
          right={detail.gender.female}
          leftLabel="남성"
          rightLabel="여성"
        />
        <RatioBar
          left={detail.resident.resident}
          right={detail.resident.nonResident}
          leftLabel="상주 인구"
          rightLabel="방문 인구"
          leftColor="#64748b"
          rightColor="#e2e8f0"
        />
      </div>

      {/* 날씨 */}
      {detail.weather.length > 0 && (
        <div>
          <h3 className="mb-2 text-[11px] font-medium uppercase tracking-wider text-slate-500">
            시간대별 날씨
          </h3>
          <div className="scrollbar-thin flex gap-1 overflow-x-auto pb-1">
            {detail.weather.map((w) => (
              <div
                key={w.hour}
                className="flex min-w-[52px] shrink-0 flex-col items-center gap-0.5 rounded-md border border-white/5 bg-white/[0.02] px-1.5 py-2"
              >
                <span className="text-[10px] text-slate-500">{w.hour}</span>
                <span className="font-mono text-[13px] font-semibold tabular-nums text-white">
                  {w.temp != null ? `${w.temp}°` : "-"}
                </span>
                <span
                  className={`font-mono text-[10px] tabular-nums ${
                    (w.rainProb ?? 0) >= 60 ? "text-sky-300" : "text-slate-600"
                  }`}
                >
                  {w.rainProb != null ? `${w.rainProb}%` : ""}
                </span>
              </div>
            ))}
          </div>
          <p className="mt-1 text-[10px] text-slate-600">기온 · 강수확률 (기상청 단기예보)</p>
        </div>
      )}
    </div>
  )
}
