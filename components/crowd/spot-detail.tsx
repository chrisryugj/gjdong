"use client"

import { useEffect, useMemo, useState } from "react"
import {
  Bike,
  CalendarDays,
  CarFront,
  Cctv,
  Check,
  ChevronDown,
  MoveDown,
  MoveUp,
  Navigation,
  Share2,
  SquareParking,
  Star,
  TriangleAlert,
} from "lucide-react"
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
import {
  cctvPlayerUrl,
  cctvStreamUrl,
  CONGEST_LEVELS,
  LEVEL_COLORS,
  levelNum,
  supportsNativeHls,
  type CrowdDetail,
  type CrowdExtra,
} from "@/lib/crowd/seoul-rtd"

// ── 요일×시간 히트맵 (GitHub Actions가 매시 수집해 data 브랜치에 누적)
const HEATMAP_URL = "https://raw.githubusercontent.com/chrisryugj/gjdong/data/heatmap.json"
const DOW_ORDER = [1, 2, 3, 4, 5, 6, 0] as const
const DOW_LABELS = ["월", "화", "수", "목", "금", "토", "일"]

interface HeatEntry {
  sum: number[][]
  cnt: number[][]
}

let heatmapCache: Promise<Record<string, HeatEntry> | null> | null = null
function loadHeatmap(): Promise<Record<string, HeatEntry> | null> {
  heatmapCache ??= fetch(HEATMAP_URL)
    .then((r) => (r.ok ? r.json() : null))
    .then((d: { spots?: Record<string, HeatEntry> } | null) => d?.spots ?? null)
    .catch(() => null)
  return heatmapCache
}

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
  isFav = false,
  onToggleFav,
}: {
  detail: CrowdDetail
  origin?: { lat: number; lng: number }
  light?: boolean
  isFav?: boolean
  onToggleFav?: () => void
}) {
  const C = light ? CHART_COLORS.light : CHART_COLORS.dark
  const now = detail.series[detail.nowIndex]
  const maxAge = useMemo(() => Math.max(...detail.ages.map((a) => a.value)), [detail.ages])
  const [openCctv, setOpenCctv] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const nativeHls = useMemo(() => supportsNativeHls(), [])

  const [heat, setHeat] = useState<HeatEntry | null>(null)
  useEffect(() => {
    let alive = true
    void loadHeatmap().then((spots) => {
      if (alive) setHeat(spots?.[detail.name] ?? null)
    })
    return () => {
      alive = false
    }
  }, [detail.name])

  // 부가정보(사고·주차·행사·도로·따릉이)는 첫 페인트를 막지 않게 지연 로드
  const [extra, setExtra] = useState<CrowdExtra | null>(null)
  useEffect(() => {
    setExtra(null)
    const controller = new AbortController()
    fetch(`/api/crowd/extra?spot=${encodeURIComponent(detail.name)}`, { signal: controller.signal })
      .then((r) => (r.ok ? (r.json() as Promise<CrowdExtra>) : null))
      .then((d) => {
        if (d) setExtra(d)
      })
      .catch(() => {
        // 부가정보 실패는 조용히 무시 — 핵심 상세는 이미 떠 있음
      })
    return () => controller.abort()
  }, [detail.name])

  // 주차장·따릉이 대여소는 명소 중심에서 가까운 순으로
  const parkingLots = useMemo(() => {
    const lots = extra?.parking?.lots ?? []
    if (!origin) return lots.slice(0, 3)
    return [...lots]
      .sort(
        (a, b) =>
          distanceM(origin.lat, origin.lng, a.lat, a.lng) - distanceM(origin.lat, origin.lng, b.lat, b.lng),
      )
      .slice(0, 3)
  }, [extra, origin])

  const bikeStations = useMemo(() => {
    const stations = extra?.bike?.stations ?? []
    if (!origin) return stations.slice(0, 4)
    return [...stations]
      .sort(
        (a, b) =>
          distanceM(origin.lat, origin.lng, a.lat, a.lng) - distanceM(origin.lat, origin.lng, b.lat, b.lng),
      )
      .slice(0, 4)
  }, [extra, origin])

  const heatTotal = useMemo(() => {
    if (!heat?.cnt) return 0
    let total = 0
    for (const row of heat.cnt) for (const c of row ?? []) total += c
    return total
  }, [heat])

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

  const share = async () => {
    const url = window.location.href
    const data = { title: `서울 인파레이더 — ${detail.name}`, text: `${detail.name} 지금 ${detail.level}`, url }
    if (navigator.share) {
      try {
        await navigator.share(data)
      } catch {
        // 사용자가 공유 시트를 닫은 경우
      }
      return
    }
    await navigator.clipboard.writeText(url)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

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
        <div className="flex items-start justify-between gap-2">
          <h2 className="min-w-0 flex-1 text-lg font-semibold leading-tight text-[var(--cp-text-strong)]">
            {detail.name}
          </h2>
          {onToggleFav && (
            <button
              onClick={onToggleFav}
              className="shrink-0 rounded p-1.5 transition-colors hover:bg-[var(--cp-hover)]"
              aria-label={isFav ? "즐겨찾기 해제" : "즐겨찾기"}
              title="즐겨찾기"
            >
              <Star className={`h-4 w-4 ${isFav ? "fill-amber-400 text-amber-400" : "text-[var(--cp-text-dim)]"}`} />
            </button>
          )}
          <button
            onClick={() => void share()}
            className="shrink-0 rounded p-1.5 text-[var(--cp-text-dim)] transition-colors hover:bg-[var(--cp-hover)] hover:text-[var(--cp-text-strong)]"
            aria-label="공유"
            title="링크 공유"
          >
            {copied ? <Check className="h-4 w-4 text-emerald-500" /> : <Share2 className="h-4 w-4" />}
          </button>
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
        {/* 사고·공사·집회 통제 — 있을 때만 경고 (평시엔 빈 배열) */}
        {extra && extra.alerts.length > 0 && (
          <div className="mt-2.5 space-y-1.5">
            {extra.alerts.map((a, i) => (
              <div key={i} className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2">
                <p className="flex items-center gap-1.5 text-[12px] font-semibold text-red-500">
                  <TriangleAlert className="h-3.5 w-3.5 shrink-0" />
                  {a.type}
                  {a.detail && a.detail !== a.type && <span className="font-normal">· {a.detail}</span>}
                </p>
                {a.info && <p className="mt-0.5 text-[12px] leading-relaxed text-[var(--cp-text)]">{a.info}</p>}
                {a.expectedClearAt && (
                  <p className="mt-0.5 font-mono text-[10px] tabular-nums text-[var(--cp-text-dim)]">
                    {/* 자정 넘겨 해소되는 공사는 시각만 보여주면 오해 — 오늘이 아니면 날짜까지 */}
                    해소 예상{" "}
                    {a.expectedClearAt.slice(0, 10) ===
                    new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10)
                      ? a.expectedClearAt.slice(11, 16)
                      : a.expectedClearAt.slice(5, 16)}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
        {origin && (
          <div className="mt-2.5 flex gap-1.5">
            <a
              href={`https://map.kakao.com/link/to/${encodeURIComponent(detail.name)},${origin.lat},${origin.lng}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 rounded-md border border-[var(--cp-border-strong)] bg-[var(--cp-panel)] px-2.5 py-1.5 text-[12px] text-[var(--cp-text)] transition-colors hover:bg-[var(--cp-hover2)]"
            >
              <Navigation className="h-3.5 w-3.5 text-[#ffb100]" /> 카카오맵 길찾기
            </a>
            <a
              href={`https://map.naver.com/p/directions/-/${origin.lng},${origin.lat},${encodeURIComponent(detail.name)}/-/transit`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 rounded-md border border-[var(--cp-border-strong)] bg-[var(--cp-panel)] px-2.5 py-1.5 text-[12px] text-[var(--cp-text)] transition-colors hover:bg-[var(--cp-hover2)]"
            >
              <Navigation className="h-3.5 w-3.5 text-[#03c75a]" /> 네이버 길찾기
            </a>
          </div>
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
        {calmest &&
          (levelNum(calmest.level) <= 2 ? (
            <p className="mt-0.5 text-[11px] text-[var(--cp-text-dim)]">
              한산하게 가려면 <span className="font-mono font-semibold tabular-nums" style={{ color: calmest.color }}>{calmest.time}</span>가 좋아요 ({calmest.level} 예상)
            </p>
          ) : (
            <p className="mt-0.5 text-[11px] text-[var(--cp-text-dim)]">오늘은 남은 시간 내내 붐빌 전망이에요</p>
          ))}
      </div>

      {/* 요일×시간 패턴 — "주말 오후엔 원래 붐비나?" (매시 수집 누적) */}
      {heat && heatTotal > 0 && (
        <div>
          <div className="mb-1.5 flex items-baseline justify-between">
            <h3 className="text-[11px] font-medium uppercase tracking-wider text-[var(--cp-text-dim)]">
              요일·시간대 패턴
            </h3>
            <span className="font-mono text-[10px] tabular-nums text-[var(--cp-text-faint)]">
              표본 {heatTotal.toLocaleString()}시간
            </span>
          </div>
          <div className="space-y-[2px]">
            {DOW_ORDER.map((d, ri) => (
              <div key={d} className="flex items-center gap-[2px]">
                <span className="w-4 shrink-0 text-[9px] text-[var(--cp-text-dim)]">{DOW_LABELS[ri]}</span>
                {Array.from({ length: 24 }, (_, h) => {
                  const cnt = heat.cnt[d]?.[h] ?? 0
                  const avg = cnt > 0 ? (heat.sum[d]?.[h] ?? 0) / cnt : 0
                  const lv = cnt > 0 ? Math.min(Math.max(Math.round(avg), 1), 4) : 0
                  const kstNow = new Date(Date.now() + 9 * 3600 * 1000)
                  const isNow = d === kstNow.getUTCDay() && h === kstNow.getUTCHours()
                  const label = lv > 0 ? CONGEST_LEVELS[lv - 1] : "데이터 없음"
                  return (
                    <span
                      key={h}
                      title={`${DOW_LABELS[ri]} ${h}시 · 평균 ${label}${cnt > 0 ? ` (${cnt}회)` : ""}`}
                      className="h-3 min-w-0 flex-1 rounded-[2px]"
                      style={{
                        background: lv > 0 ? LEVEL_COLORS[CONGEST_LEVELS[lv - 1]] : "var(--cp-track)",
                        boxShadow: isNow ? "0 0 0 1.5px var(--cp-text-strong)" : undefined,
                      }}
                    />
                  )
                })}
              </div>
            ))}
            <div className="flex gap-[2px] pl-[18px] pt-0.5">
              {[0, 6, 12, 18].map((h) => (
                <span key={h} className="flex-1 text-[9px] text-[var(--cp-text-faint)]">
                  {h}시
                </span>
              ))}
            </div>
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1">
            {CONGEST_LEVELS.map((lv) => (
              <span key={lv} className="flex items-center gap-1 text-[10px] text-[var(--cp-text-faint)]">
                <span className="h-2 w-2 rounded-[2px]" style={{ background: LEVEL_COLORS[lv] }} />
                {lv}
              </span>
            ))}
            <span className="text-[10px] text-[var(--cp-text-faint)]">· 테두리 = 지금 시간대</span>
          </div>
        </div>
      )}

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

      {/* 주차 여유 — 실시간 잔여를 주는 주차장만 (자차 방문 판단용) */}
      {extra?.parking && (
        <div>
          <div className="mb-2 flex items-baseline justify-between">
            <h3 className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-[var(--cp-text-dim)]">
              <SquareParking className="h-3.5 w-3.5" /> 주차 여유
            </h3>
            <span
              className="font-mono text-[12px] font-semibold tabular-nums"
              style={{
                color:
                  extra.parking.percent >= 40 ? "#00d369" : extra.parking.percent >= 15 ? "#ffb100" : "#ff3939",
              }}
            >
              {extra.parking.available.toLocaleString()}면 ({extra.parking.percent}%)
            </span>
          </div>
          <ul className="overflow-hidden rounded-md border border-[var(--cp-border)]">
            {parkingLots.map((lot) => {
              const meters = origin ? Math.round(distanceM(origin.lat, origin.lng, lot.lat, lot.lng)) : null
              const pct = Math.round((lot.available / lot.capacity) * 100)
              return (
                <li
                  key={lot.name}
                  className="flex items-center gap-2.5 border-b border-[var(--cp-border-faint)] px-3 py-2 last:border-b-0"
                >
                  <span className="min-w-0 flex-1 truncate text-[13px] text-[var(--cp-text)]">{lot.name}</span>
                  {meters != null && (
                    <span className="shrink-0 font-mono text-[11px] tabular-nums text-[var(--cp-text-dim)]">
                      {meters >= 1000 ? `${(meters / 1000).toFixed(1)}km` : `${meters}m`}
                    </span>
                  )}
                  <span
                    className="shrink-0 font-mono text-[12px] font-semibold tabular-nums"
                    style={{ color: pct >= 40 ? "#00d369" : pct >= 15 ? "#ffb100" : "#ff3939" }}
                  >
                    {lot.available}
                  </span>
                  <span className="shrink-0 font-mono text-[11px] tabular-nums text-[var(--cp-text-faint)]">
                    /{lot.capacity}면
                  </span>
                </li>
              )
            })}
          </ul>
          <p className="mt-1 text-[10px] text-[var(--cp-text-faint)]">실시간 잔여를 제공하는 주차장 기준</p>
        </div>
      )}

      {/* 진행 중 문화행사 — 붐빔의 원인이자 갈 이유 */}
      {extra && extra.events.length > 0 && (
        <div>
          <h3 className="mb-2 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-[var(--cp-text-dim)]">
            <CalendarDays className="h-3.5 w-3.5" /> 진행 중 문화행사{" "}
            <span className="font-mono tabular-nums">({extra.events.length})</span>
          </h3>
          <ul className="overflow-hidden rounded-md border border-[var(--cp-border)]">
            {extra.events.slice(0, 6).map((ev, i) => (
              <li key={i} className="border-b border-[var(--cp-border-faint)] last:border-b-0">
                <a
                  href={ev.url || undefined}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2.5 px-3 py-2 transition-colors hover:bg-[var(--cp-hover)]"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] text-[var(--cp-text)]">{ev.title}</p>
                    <p className="truncate text-[11px] text-[var(--cp-text-dim)]">
                      {ev.place && `${ev.place} · `}
                      <span className="font-mono tabular-nums">{ev.period}</span>
                    </p>
                  </div>
                  {ev.free && (
                    <span className="shrink-0 rounded-full border border-emerald-500/40 px-1.5 py-0.5 text-[10px] font-medium text-emerald-500">
                      무료
                    </span>
                  )}
                </a>
              </li>
            ))}
          </ul>
          {extra.events.length > 6 && (
            <p className="mt-1 text-[10px] text-[var(--cp-text-faint)]">외 {extra.events.length - 6}건 진행 중</p>
          )}
        </div>
      )}

      {/* 도로 소통 — "차로 가도 되나" 한 줄 답 */}
      {extra?.road && (
        <div>
          <h3 className="mb-2 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-[var(--cp-text-dim)]">
            <CarFront className="h-3.5 w-3.5" /> 도로 소통
          </h3>
          <div className="flex items-center gap-2.5 rounded-md border border-[var(--cp-border)] bg-[var(--cp-panel)] px-3 py-2.5">
            <span
              className="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold"
              style={{
                color: extra.road.color,
                background: `${extra.road.color}1f`,
                border: `1px solid ${extra.road.color}55`,
              }}
            >
              {extra.road.idx}
            </span>
            <p className="min-w-0 flex-1 text-[12px] leading-relaxed text-[var(--cp-text-muted)]">{extra.road.msg}</p>
            {extra.road.speed > 0 && (
              <span className="shrink-0 font-mono text-[12px] tabular-nums text-[var(--cp-text)]">
                {extra.road.speed}
                <span className="text-[10px] text-[var(--cp-text-dim)]">km/h</span>
              </span>
            )}
          </div>
        </div>
      )}

      {/* 따릉이 — 대여 가능 대수 (한강공원·데이트 코스) */}
      {extra?.bike && (
        <div>
          <div className="mb-2 flex items-baseline justify-between">
            <h3 className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-[var(--cp-text-dim)]">
              <Bike className="h-3.5 w-3.5" /> 따릉이
            </h3>
            <span className="font-mono text-[12px] tabular-nums text-[var(--cp-text)]">
              지금 <span className="font-semibold text-[var(--cp-text-strong)]">{extra.bike.bikes}</span>대
            </span>
          </div>
          <ul className="overflow-hidden rounded-md border border-[var(--cp-border)]">
            {bikeStations.map((st) => {
              const meters = origin ? Math.round(distanceM(origin.lat, origin.lng, st.lat, st.lng)) : null
              return (
                <li
                  key={st.name}
                  className="flex items-center gap-2.5 border-b border-[var(--cp-border-faint)] px-3 py-2 last:border-b-0"
                >
                  <span className="min-w-0 flex-1 truncate text-[13px] text-[var(--cp-text)]">{st.name}</span>
                  {meters != null && (
                    <span className="shrink-0 font-mono text-[11px] tabular-nums text-[var(--cp-text-dim)]">
                      {meters >= 1000 ? `${(meters / 1000).toFixed(1)}km` : `${meters}m`}
                    </span>
                  )}
                  <span
                    className="shrink-0 font-mono text-[12px] font-semibold tabular-nums"
                    style={{ color: st.bikes === 0 ? "#ff3939" : st.bikes < 3 ? "#ffb100" : "#00d369" }}
                  >
                    {st.bikes}대
                  </span>
                </li>
              )
            })}
          </ul>
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
