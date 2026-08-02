"use client"

import { useMemo, useState } from "react"
import { Cctv, ChevronDown, MoveDown, MoveUp } from "lucide-react"
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
import { cctvPlayerUrl, cctvStreamUrl, supportsNativeHls, type CrowdDetail } from "@/lib/crowd/seoul-rtd"

function distanceM(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLng = ((lng2 - lng1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function TrendBadge({ label, rate, dir }: { label: string; rate: string; dir: string }) {
  const up = dir === "up"
  return (
    <div className="flex flex-col items-center gap-0.5 rounded-md border border-[var(--cp-border)] bg-[var(--cp-panel)] px-2 py-2">
      <span className="text-[10px] text-[var(--cp-text-dim)]">{label}</span>
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
      <div className="flex h-2 w-full overflow-hidden rounded-full bg-[var(--cp-track)]">
        <div style={{ width: `${left}%`, background: leftColor }} />
        <div style={{ width: `${right}%`, background: rightColor }} />
      </div>
      <div className="mt-1 flex justify-between text-[11px] text-[var(--cp-text-muted)]">
        <span>
          {leftLabel} <span className="font-mono tabular-nums text-[var(--cp-text)]">{left}%</span>
        </span>
        <span>
          <span className="font-mono tabular-nums text-[var(--cp-text)]">{right}%</span> {rightLabel}
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
    <div className="rounded-md border border-[var(--cp-border-strong)] bg-[var(--cp-tip-bg)] px-2.5 py-1.5 text-[11px] shadow-lg">
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
    ageMax: "#e2e8f0",
    ageBase: "#475569",
    residentL: "#64748b",
    residentR: "#e2e8f0",
  },
  light: {
    axisLine: "#0f172a1f",
    cursor: "#0f172a0d",
    refLine: "#0f172a80",
    refLabel: "#334155",
    ageMax: "#0f172a",
    ageBase: "#94a3b8",
    residentL: "#94a3b8",
    residentR: "#1e293b",
  },
}

export default function SpotDetail({
  detail,
  origin,
  light = false,
}: {
  detail: CrowdDetail
  origin?: { lat: number; lng: number }
  light?: boolean
}) {
  const C = light ? CHART_COLORS.light : CHART_COLORS.dark
  const now = detail.series[detail.nowIndex]
  const maxAge = useMemo(() => Math.max(...detail.ages.map((a) => a.value)), [detail.ages])
  const [openCctv, setOpenCctv] = useState<string | null>(null)
  const nativeHls = useMemo(() => supportsNativeHls(), [])

  const cctvList = useMemo(() => {
    const list = detail.cctv.map((c) => ({
      ...c,
      meters: origin ? Math.round(distanceM(origin.lat, origin.lng, c.lat, c.lng)) : null,
    }))
    return list.sort((a, b) => (a.meters ?? 0) - (b.meters ?? 0))
  }, [detail.cctv, origin])

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
          <h2 className="text-lg font-semibold leading-tight text-[var(--cp-text-strong)]">{detail.name}</h2>
          <span
            className="shrink-0 rounded-full px-2.5 py-1 text-[12px] font-bold"
            style={{ color: detail.color, background: `${detail.color}1f`, border: `1px solid ${detail.color}55` }}
          >
            {detail.level}
          </span>
        </div>
        {now && (
          <p className="mt-1.5 font-mono text-[13px] tabular-nums text-[var(--cp-text)]">
            지금 약 <span className="text-[17px] font-bold text-[var(--cp-text-strong)]">{now.range || `${now.people.toLocaleString()}명`}</span>
          </p>
        )}
        {detail.message.length > 0 && (
          <ul className="mt-2 space-y-0.5">
            {detail.message.map((m, i) => (
              <li key={i} className="text-[12px] leading-relaxed text-[var(--cp-text-muted)]">
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
          <h3 className="text-[11px] font-medium uppercase tracking-wider text-[var(--cp-text-dim)]">
            24시간 인파 흐름
          </h3>
          <span className="text-[10px] text-[var(--cp-text-faint)]">
            막대 = 실측·예측 <span className="mx-1 text-[var(--cp-text-faint)]">|</span> 점선 = 어제
          </span>
        </div>
        <div className="h-44 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartData} margin={{ top: 4, right: 0, bottom: 0, left: -14 }}>
              <XAxis
                dataKey="time"
                tick={{ fontSize: 9, fill: "#64748b" }}
                interval={3}
                axisLine={{ stroke: C.axisLine }}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 9, fill: "#64748b" }}
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
                  label={{ value: "현재", position: "top", fontSize: 9, fill: C.refLabel }}
                />
              )}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
        {detail.peakForecastHour && (
          <p className="mt-1.5 text-[11px] text-[var(--cp-text-dim)]">
            앞으로는 <span className="font-mono font-semibold tabular-nums text-[var(--cp-text-strong)]">{detail.peakForecastHour}시</span>에 가장 붐빌
            전망 ({detail.peakForecastLevel})
          </p>
        )}
      </div>

      {/* CCTV — 차트에서 본 붐빔을 바로 눈으로 확인하는 흐름이라 상단 배치 */}
      {cctvList.length > 0 && (
        <div>
          <h3 className="mb-2 text-[11px] font-medium uppercase tracking-wider text-[var(--cp-text-dim)]">
            주변 CCTV <span className="font-mono tabular-nums">({cctvList.length})</span>
          </h3>
          <ul className="overflow-hidden rounded-md border border-[var(--cp-border)]">
            {cctvList.map((c) => {
              const isOpen = openCctv === c.streamId
              const playable = c.src.length > 0
              return (
                <li key={c.streamId || c.name} className="border-b border-[var(--cp-border-faint)] last:border-b-0">
                  <button
                    onClick={() => playable && setOpenCctv(isOpen ? null : c.streamId)}
                    disabled={!playable}
                    className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left transition-colors enabled:hover:bg-[var(--cp-hover)] disabled:cursor-default"
                  >
                    <Cctv className="h-3.5 w-3.5 shrink-0 text-[var(--cp-text-dim)]" />
                    <span className="min-w-0 flex-1 truncate text-[13px] text-[var(--cp-text)]">{c.name}</span>
                    {c.meters != null && (
                      <span className="shrink-0 font-mono text-[11px] tabular-nums text-[var(--cp-text-dim)]">
                        {c.meters >= 1000 ? `${(c.meters / 1000).toFixed(1)}km` : `${c.meters}m`}
                      </span>
                    )}
                    {playable ? (
                      <ChevronDown
                        className={`h-3.5 w-3.5 shrink-0 text-[var(--cp-text-dim)] transition-transform ${isOpen ? "rotate-180" : ""}`}
                      />
                    ) : (
                      <span className="shrink-0 text-[10px] text-[var(--cp-text-faint)]">영상 없음</span>
                    )}
                  </button>
                  {isOpen && (
                    <div className="aspect-video w-full bg-black">
                      {nativeHls ? (
                        <video
                          src={cctvStreamUrl(c)}
                          className="h-full w-full object-contain"
                          autoPlay
                          muted
                          playsInline
                        />
                      ) : (
                        <iframe
                          src={cctvPlayerUrl(c)}
                          title={`CCTV ${c.name}`}
                          className="h-full w-full border-0"
                          allow="autoplay"
                        />
                      )}
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
          <p className="mt-1 text-[10px] text-[var(--cp-text-faint)]">탭하면 실시간 영상 (서울시 교통 CCTV) · 명소에 따라 없을 수 있어요</p>
        </div>
      )}

      {/* 연령대 */}
      <div>
        <h3 className="mb-2 text-[11px] font-medium uppercase tracking-wider text-[var(--cp-text-dim)]">연령대 구성</h3>
        <div className="space-y-1.5">
          {detail.ages.map((age) => (
            <div key={age.label} className="flex items-center gap-2">
              <span className="w-14 shrink-0 text-[11px] text-[var(--cp-text-muted)]">{age.label}</span>
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-[var(--cp-track)]">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${(age.value / Math.max(maxAge, 1)) * 100}%`,
                    background: age.value === maxAge ? C.ageMax : C.ageBase,
                  }}
                />
              </div>
              <span
                className={`w-10 shrink-0 text-right font-mono text-[11px] tabular-nums ${
                  age.value === maxAge ? "font-semibold text-[var(--cp-text-strong)]" : "text-[var(--cp-text-dim)]"
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
          leftColor={C.residentL}
          rightColor={C.residentR}
        />
      </div>

      {/* 날씨 */}
      {detail.weather.length > 0 && (
        <div>
          <h3 className="mb-2 text-[11px] font-medium uppercase tracking-wider text-[var(--cp-text-dim)]">
            시간대별 날씨
          </h3>
          <div className="scrollbar-thin flex gap-1 overflow-x-auto pb-1">
            {detail.weather.map((w) => (
              <div
                key={w.hour}
                className="flex min-w-[52px] shrink-0 flex-col items-center gap-0.5 rounded-md border border-[var(--cp-border-faint)] bg-[var(--cp-panel)] px-1.5 py-2"
              >
                <span className="text-[10px] text-[var(--cp-text-dim)]">{w.hour}</span>
                <span className="font-mono text-[13px] font-semibold tabular-nums text-[var(--cp-text-strong)]">
                  {w.temp != null ? `${w.temp}°` : "-"}
                </span>
                <span
                  className={`font-mono text-[10px] tabular-nums ${
                    (w.rainProb ?? 0) >= 60 ? "text-sky-300" : "text-[var(--cp-text-faint)]"
                  }`}
                >
                  {w.rainProb != null ? `${w.rainProb}%` : ""}
                </span>
              </div>
            ))}
          </div>
          <p className="mt-1 text-[10px] text-[var(--cp-text-faint)]">기온 · 강수확률 (기상청 단기예보)</p>
        </div>
      )}
    </div>
  )
}
