"use client"

import { useEffect, useMemo, useState } from "react"
import { Bike, CalendarDays, CarFront, Cctv, Check, ChevronDown, Instagram, MoveDown, MoveUp, PartyPopper, Share2, SquareParking, Star, TrainFront, TriangleAlert, Waves, Wind } from "lucide-react"
import { CITY_CAPS } from "@/lib/crowd/cities"
import { textColor, type CrowdDetail, type CrowdExtra } from "@/lib/crowd/seoul-rtd"
import type { AirInfo } from "@/lib/crowd/air"
import type { TourEvent } from "@/lib/crowd/events"
import { loadTourEvents, tourMatchRadius } from "@/lib/crowd/events-client"
import type { BaselineDelta } from "@/lib/crowd/heatmap-client"
import { distanceM, formatMeters } from "@/components/crowd/shared"
import { useLang } from "@/components/crowd/lang-context"
import { trAge, trAlert, trBeach, trHour, trLevelMessages, trRange, trRoad } from "@/lib/crowd/i18n"
import { romanizeAddress } from "@/lib/crowd/romanize"
import SpotChart from "@/components/crowd/spot-chart"
import SpotHeatmap from "@/components/crowd/spot-heatmap"
import SpotCctv from "@/components/crowd/spot-cctv"
import SpotExtras from "@/components/crowd/spot-extras"

/** 요약 스트립 칩 — 핵심 수치 한 줄 + 탭하면 해당 섹션으로 점프 */
function JumpChip({
  icon,
  label,
  value,
  color,
  target,
}: {
  icon: React.ReactNode
  label?: string
  value: string
  color?: string
  target: string
}) {
  return (
    <button
      onClick={() => document.getElementById(target)?.scrollIntoView({ behavior: "smooth", block: "start" })}
      className="flex items-center gap-1 rounded-full border border-[var(--cp-border)] bg-[var(--cp-panel)] px-2.5 py-1 text-[12px] text-[var(--cp-text-muted)] transition-colors hover:bg-[var(--cp-hover2)] hover:text-[var(--cp-text)]"
    >
      {icon}
      {label && <span>{label}</span>}
      <span className="font-mono font-semibold tabular-nums" style={color ? { color } : undefined}>
        {value}
      </span>
    </button>
  )
}

function TrendBadge({ label, rate, dir, light }: { label: string; rate: string; dir: string; light: boolean }) {
  const up = dir === "up"
  return (
    <div className="flex flex-col items-center gap-0.5 rounded-md border border-[var(--cp-border)] bg-[var(--cp-panel)] px-2 py-2">
      <span className="text-[11px] text-[var(--cp-text-dim)]">{label}</span>
      <span
        className={`flex items-center gap-0.5 font-mono text-[15px] font-semibold tabular-nums ${
          up ? (light ? "text-red-600" : "text-red-400") : light ? "text-emerald-700" : "text-emerald-400"
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
      <div className="mt-1 flex justify-between text-[12px] text-[var(--cp-text-muted)]">
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

// 연령·상주비 막대는 CSS 변수가 안 통하는 인라인 스타일이라 테마별 색 직접 전달
const BAR_COLORS = {
  dark: { ageMax: "#e2e8f0", ageBase: "#475569", residentL: "#64748b", residentR: "#e2e8f0" },
  light: { ageMax: "#0f172a", ageBase: "#94a3b8", residentL: "#94a3b8", residentR: "#1e293b" },
}

// 대기질 4단계 색 — 혼잡 등급 팔레트 재사용 (앱 전체가 같은 신호 체계를 쓰게)
const AIR_COLORS = ["", "#00d369", "#ffb100", "#ff8040", "#ff3939"]

export default function SpotDetail({
  detail,
  origin,
  light = false,
  isFav = false,
  onToggleFav,
  baselineNow = null,
}: {
  detail: CrowdDetail
  origin?: { lat: number; lng: number }
  light?: boolean
  isFav?: boolean
  onToggleFav?: () => void
  /** 지금 vs 평소 (누적 히트맵 대비) — 서울·제주만, 표본 부족은 null */
  baselineNow?: BaselineDelta | null
}) {
  const { lang, t, spot: trSpotName, level: trLv } = useLang()
  const trAgeLabel = (label: string) => trAge(label, lang)
  const C = light ? BAR_COLORS.light : BAR_COLORS.dark
  const now = detail.series[detail.nowIndex]
  const maxAge = useMemo(() => Math.max(...detail.ages.map((a) => a.value)), [detail.ages])
  const [copied, setCopied] = useState(false)

  const city = detail.city ?? "seoul"

  // 부가정보(사고·주차·행사·도로·따릉이)는 첫 페인트를 막지 않게 지연 로드 — 제주는 원천 없음
  const [extra, setExtra] = useState<CrowdExtra | null>(null)
  useEffect(() => {
    setExtra(null)
    if (!CITY_CAPS[city].extra) return
    const controller = new AbortController()
    fetch(`/api/crowd/extra?spot=${encodeURIComponent(detail.name)}&city=${city}`, { signal: controller.signal })
      .then((r) => (r.ok ? (r.json() as Promise<CrowdExtra>) : null))
      .then((d) => {
        if (d) setExtra(d)
      })
      .catch(() => {
        // 부가정보 실패는 조용히 무시 — 핵심 상세는 이미 떠 있음
      })
    return () => controller.abort()
  }, [detail.name, city])

  // 대기질 — 시도당 1콜 스냅샷 위 조회라 가볍다. 실패·미승인 키는 섹션 미노출
  const [air, setAir] = useState<AirInfo | null>(null)
  useEffect(() => {
    setAir(null)
    if (!CITY_CAPS[city].air) return
    const controller = new AbortController()
    fetch(`/api/crowd/air?spot=${encodeURIComponent(detail.name)}&city=${city}`, { signal: controller.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { air?: AirInfo | null } | null) => {
        if (d?.air) setAir(d.air)
      })
      .catch(() => {})
    return () => controller.abort()
  }, [detail.name, city])

  // 주변 축제·행사 (TourAPI, 인천공항 제외 전 도시) — 도시 목록에서 지점 반경으로 거른다.
  // 서울은 RTD 문화행사(공연·전시)와 별개 축 — TourAPI는 축제·야외행사 위주라 성격이 다르다
  const [cityEvents, setCityEvents] = useState<TourEvent[] | null>(null)
  useEffect(() => {
    setCityEvents(null)
    if (!CITY_CAPS[city].tourEvents) return
    let alive = true
    void loadTourEvents(city).then((events) => {
      if (alive) setCityEvents(events)
    })
    return () => {
      alive = false
    }
  }, [detail.name, city])
  const tourEvents = useMemo(() => {
    if (!cityEvents || !origin) return []
    const radius = tourMatchRadius(city)
    return cityEvents
      .filter((e) => e.lat !== 0 && e.lng !== 0)
      .map((e) => ({ ...e, meters: Math.round(distanceM(origin.lat, origin.lng, e.lat, e.lng)) }))
      .filter((e) => e.meters <= radius)
      .slice(0, 5)
  }, [cityEvents, origin, city])

  const share = async () => {
    const url = window.location.href
    const data = {
      title: `${t.title} — ${trSpotName(detail.name)}`,
      text: t.shareText(trSpotName(detail.name), trLv(detail.level)),
      url,
    }
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

  return (
    <div className="space-y-5 p-4">
      {/* 헤드라인 */}
      <div>
        <div className="flex items-start justify-between gap-2">
          <h2 className="min-w-0 flex-1 text-lg font-semibold leading-tight text-[var(--cp-text-strong)] md:text-xl">
            {trSpotName(detail.name)}
          </h2>
          {onToggleFav && (
            <button
              onClick={onToggleFav}
              className="shrink-0 rounded p-1.5 transition-colors hover:bg-[var(--cp-hover)]"
              aria-label={isFav ? t.unfavorite : t.favorite}
              title={t.favorite}
            >
              <Star className={`h-4 w-4 ${isFav ? "fill-amber-400 text-amber-400" : "text-[var(--cp-text-dim)]"}`} />
            </button>
          )}
          <a
            // 병기 명칭(·)·괄호 부기는 해시태그 불가 — 첫 토큰만, 공백 제거 (예: '협재·금능해수욕장'→'협재')
            href={`https://www.instagram.com/explore/tags/${encodeURIComponent(detail.name.split("·")[0].split("(")[0].replace(/\s+/g, ""))}/`}
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 rounded p-1.5 text-[var(--cp-text-dim)] transition-colors hover:bg-[var(--cp-hover)] hover:text-[var(--cp-text-strong)]"
            aria-label={t.instaSearch}
            title={t.instaSearch}
          >
            <Instagram className="h-4 w-4" />
          </a>
          <button
            onClick={() => void share()}
            className="shrink-0 rounded p-1.5 text-[var(--cp-text-dim)] transition-colors hover:bg-[var(--cp-hover)] hover:text-[var(--cp-text-strong)]"
            aria-label={t.share}
            title={t.share}
          >
            {copied ? <Check className="h-4 w-4 text-emerald-500" /> : <Share2 className="h-4 w-4" />}
          </button>
          <span
            className="shrink-0 rounded-full px-2.5 py-1 text-[13px] font-bold"
            style={{ color: textColor(detail.color, light), background: `${detail.color}1f`, border: `1px solid ${detail.color}55` }}
          >
            {trLv(detail.level)}
          </span>
        </div>
        {now && (
          <p className="mt-1.5 font-mono text-[14px] tabular-nums text-[var(--cp-text)]">
            {t.nowAbout}{" "}
            <span className="text-[19px] font-bold text-[var(--cp-text-strong)]">
              {now.range ? trRange(now.range, lang) : t.people(now.people)}
            </span>
          </p>
        )}
        {/* 지금 vs 평소 — "붐빔"이 이 지점 기준 이례적인지 한 줄 판정 (누적 히트맵 대비) */}
        {baselineNow && (
          <p
            title={t.baselineNote}
            className={`mt-1 text-[13px] font-medium ${
              baselineNow === "above"
                ? light
                  ? "text-orange-700"
                  : "text-orange-400"
                : baselineNow === "below"
                  ? light
                    ? "text-emerald-700"
                    : "text-emerald-400"
                  : "text-[var(--cp-text-dim)]"
            }`}
          >
            {baselineNow === "above" ? t.baselineAbove : baselineNow === "below" ? t.baselineBelow : t.baselineUsual}
            <span className="ml-1.5 font-normal text-[var(--cp-text-faint)]">· {t.baselineNote}</span>
          </p>
        )}
        {/* 요약 스트립 — 아래 섹션들의 답을 한 줄로, 칩 탭 = 해당 섹션 점프 */}
        {(extra || detail.cctv.length > 0 || air) && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {extra?.parking && (
              <JumpChip
                icon={<SquareParking className="h-3 w-3" />}
                label={t.chipParking}
                value={`${extra.parking.percent}%`}
                color={textColor(
                  extra.parking.percent >= 40 ? "#00d369" : extra.parking.percent >= 15 ? "#ffb100" : "#ff3939",
                  light,
                )}
                target="crowd-sec-parking"
              />
            )}
            {extra?.road && (
              <JumpChip
                icon={<CarFront className="h-3 w-3" />}
                value={trRoad(extra.road.idx, lang)}
                color={textColor(extra.road.color, light)}
                target="crowd-sec-road"
              />
            )}
            {extra && extra.events.length > 0 && (
              <JumpChip
                icon={<CalendarDays className="h-3 w-3" />}
                label={t.chipEvents}
                value={String(extra.events.length)}
                target="crowd-sec-events"
              />
            )}
            {extra?.bike && (
              <JumpChip
                icon={<Bike className="h-3 w-3" />}
                label={t.chipBike}
                value={t.bikeCount(extra.bike.bikes)}
                target="crowd-sec-bike"
              />
            )}
            {extra?.subway && extra.subway.length > 0 && (
              <JumpChip
                icon={<TrainFront className="h-3 w-3" />}
                label={t.chipSubway}
                value={String(extra.subway.length)}
                target="crowd-sec-subway"
              />
            )}
            {air && air.grade > 0 && (
              <JumpChip
                icon={<Wind className="h-3 w-3" />}
                label={t.chipAir}
                value={t.airGrades[air.grade] ?? ""}
                color={textColor(AIR_COLORS[air.grade], light)}
                target="crowd-sec-air"
              />
            )}
            {tourEvents.length > 0 && (
              <JumpChip
                icon={<PartyPopper className="h-3 w-3" />}
                label={t.chipEvents}
                value={String(tourEvents.length)}
                target="crowd-sec-tour"
              />
            )}
            {detail.cctv.length > 0 && (
              <JumpChip
                icon={<Cctv className="h-3 w-3" />}
                label="CCTV"
                value={String(detail.cctv.length)}
                target="crowd-sec-cctv"
              />
            )}
          </div>
        )}
        {trLevelMessages(detail.message, detail.levelNum, lang).length > 0 && (
          <ul className="mt-2 space-y-0.5">
            {trLevelMessages(detail.message, detail.levelNum, lang).map((m, i) => (
              <li key={i} className="text-[13px] leading-relaxed text-[var(--cp-text-muted)]">
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
                <p className={`flex items-center gap-1.5 text-[13px] font-semibold ${light ? "text-red-700" : "text-red-500"}`}>
                  <TriangleAlert className="h-3.5 w-3.5 shrink-0" />
                  {trAlert(a.type, lang)}
                  {a.detail && a.detail !== a.type && <span className="font-normal">· {trAlert(a.detail, lang)}</span>}
                </p>
                {/* 사고 내용은 구간·차로가 섞인 자유 텍스트라 사전화 불가 — 로마자로 읽게만 한다 */}
                {a.info && (
                  <p className="mt-0.5 text-[13px] leading-relaxed text-[var(--cp-text)]">
                    {lang === "ko" ? a.info : romanizeAddress(a.info)}
                  </p>
                )}
                {a.expectedClearAt && (
                  <p className="mt-0.5 font-mono text-[11px] tabular-nums text-[var(--cp-text-dim)]">
                    {/* 자정 넘겨 해소되는 공사는 시각만 보여주면 오해 — 오늘이 아니면 날짜까지 */}
                    {t.expectedClear}{" "}
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
      </div>

      {/* 추세 — 원천이 증감률을 주는 항목만 (제주=1h·3h, 부산=없음) */}
      {(() => {
        const badges = (
          [
            [t.trendH1, detail.trend.hour1],
            [t.trendH3, detail.trend.hour3],
            [t.trendM1, detail.trend.month1],
          ] as const
        ).filter(([, v]) => v.rate)
        if (badges.length === 0) return null
        const cols = badges.length === 1 ? "grid-cols-1" : badges.length === 2 ? "grid-cols-2" : "grid-cols-3"
        return (
          <div className={`grid ${cols} gap-2`}>
            {badges.map(([label, v]) => (
              <TrendBadge key={label} label={label} rate={v.rate} dir={v.dir} light={light} />
            ))}
          </div>
        )
      })()}

      {/* 24시간 타임라인 — 시계열 원천이 있는 도시만 (부산 제외) */}
      {detail.series.length > 0 && <SpotChart detail={detail} light={light} />}

      {/* 요일×시간 패턴 — 누적 원천이 있는 도시만 (서울: GH Actions 3h · 제주: 맥미니 15분) */}
      {CITY_CAPS[city].heatmap && (
        <SpotHeatmap name={detail.name} light={light} city={city} />
      )}

      {/* 해수욕장 컨디션 — 부산 해변 명소 전용 (KHOA 생활지수) */}
      {detail.beach && detail.beach.length > 0 && (
        <div>
          <h3 className="mb-2 flex items-center gap-1.5 text-[12px] font-medium uppercase tracking-wider text-[var(--cp-text-dim)]">
            <Waves className="h-3.5 w-3.5" /> {t.beachTitle}
          </h3>
          <div className="grid grid-cols-2 gap-2">
            {detail.beach.map((b) => (
              <div key={b.gubun} className="rounded-md border border-[var(--cp-border)] bg-[var(--cp-panel)] px-3 py-2">
                <p className="text-[11px] text-[var(--cp-text-dim)]">{trBeach(b.gubun, lang)}</p>
                <p className="mt-0.5 font-mono text-[14px] tabular-nums text-[var(--cp-text-strong)]">
                  {b.waterTemp && `${t.beachWater} ${b.waterTemp}°`}
                  {b.waveHeight && ` · ${t.beachWave} ${b.waveHeight}m`}
                </p>
                {b.index && (
                  <p className="text-[12px] text-[var(--cp-text-muted)]">
                    {t.beachIdx} · {trBeach(b.index, lang)}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* CCTV — 차트에서 본 붐빔을 바로 눈으로 확인하는 흐름이라 상단 배치 */}
      <SpotCctv cctv={detail.cctv} origin={origin} />

      {/* 부가정보: 주차·행사·도로·지하철·따릉이 */}
      {extra && <SpotExtras extra={extra} origin={origin} light={light} />}

      {/* 주변 축제·행사 (TourAPI) — "왜 붐비는지"와 "갈 이유"를 같이 답한다 */}
      {tourEvents.length > 0 && (
        <div id="crowd-sec-tour" className="scroll-mt-2">
          <h3 className="mb-2 flex items-center gap-1.5 text-[12px] font-medium uppercase tracking-wider text-[var(--cp-text-dim)]">
            <PartyPopper className="h-3.5 w-3.5" /> {t.tourTitle}{" "}
            <span className="font-mono tabular-nums">({tourEvents.length})</span>
          </h3>
          <ul className="overflow-hidden rounded-md border border-[var(--cp-border)]">
            {tourEvents.map((ev) => {
              const kstToday = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10)
              const ongoing = ev.start <= kstToday && kstToday <= ev.end
              const dday = Math.ceil((Date.parse(ev.start) - Date.parse(kstToday)) / 86400_000)
              return (
                <li key={ev.title} className="border-b border-[var(--cp-border-faint)] last:border-b-0">
                  <a
                    href={`https://map.kakao.com/link/map/${encodeURIComponent(ev.title)},${ev.lat},${ev.lng}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2.5 px-3 py-2 transition-colors hover:bg-[var(--cp-hover)]"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[14px] text-[var(--cp-text)]">
                        {lang === "ko" ? ev.title : romanizeAddress(ev.title)}
                      </p>
                      <p className="truncate text-[12px] text-[var(--cp-text-dim)]">
                        <span className="font-mono tabular-nums">
                          {ev.start.slice(5).replace("-", ".")}~{ev.end.slice(5).replace("-", ".")}
                        </span>
                        {" · "}
                        <span className="font-mono tabular-nums">{formatMeters(ev.meters)}</span>
                      </p>
                    </div>
                    <span
                      className={`shrink-0 rounded-full border px-1.5 py-0.5 font-mono text-[11px] font-medium tabular-nums ${
                        ongoing
                          ? `border-emerald-500/40 ${light ? "text-emerald-700" : "text-emerald-500"}`
                          : "border-[var(--cp-border)] text-[var(--cp-text-dim)]"
                      }`}
                    >
                      {ongoing ? t.tourOngoing : `D-${dday}`}
                    </span>
                  </a>
                </li>
              )
            })}
          </ul>
          <p className="mt-1 text-[11px] text-[var(--cp-text-faint)]">{t.tourNote}</p>
        </div>
      )}

      {/* 대기질 — 나들이 판단의 마지막 관문. 지점 인근(자치구) 측정소 실시간 값 */}
      {air && (
        <div id="crowd-sec-air" className="scroll-mt-2">
          <h3 className="mb-2 flex items-center gap-1.5 text-[12px] font-medium uppercase tracking-wider text-[var(--cp-text-dim)]">
            <Wind className="h-3.5 w-3.5" /> {t.airTitle}
          </h3>
          <div className="flex items-center gap-2.5 rounded-md border border-[var(--cp-border)] bg-[var(--cp-panel)] px-3 py-2.5">
            {air.grade > 0 && (
              <span
                className="shrink-0 rounded-full px-2 py-0.5 text-[12px] font-bold"
                style={{
                  color: textColor(AIR_COLORS[air.grade], light),
                  background: `${AIR_COLORS[air.grade]}1f`,
                  border: `1px solid ${AIR_COLORS[air.grade]}55`,
                }}
              >
                {t.airGrades[air.grade]}
              </span>
            )}
            <p className="min-w-0 flex-1 font-mono text-[13px] tabular-nums text-[var(--cp-text)]">
              {air.pm25 != null && (
                <span>
                  PM2.5 <b className="text-[var(--cp-text-strong)]">{air.pm25}</b>
                </span>
              )}
              {air.pm10 != null && (
                <span>
                  {air.pm25 != null && " · "}PM10 <b className="text-[var(--cp-text-strong)]">{air.pm10}</b>
                </span>
              )}
              {air.o3 != null && <span> · O₃ {air.o3}</span>}
            </p>
          </div>
          <p className="mt-1 text-[11px] text-[var(--cp-text-faint)]">{t.airStation(air.station)}</p>
        </div>
      )}

      {/* 날씨 */}
      {detail.weather.length > 0 && (
        <div>
          <h3 className="mb-2 text-[12px] font-medium uppercase tracking-wider text-[var(--cp-text-dim)]">
            {t.weatherTitle}
          </h3>
          <div className="scrollbar-thin flex gap-1 overflow-x-auto pb-1">
            {detail.weather.map((w) => (
              <div
                key={w.hour}
                className="flex min-w-[52px] shrink-0 flex-col items-center gap-0.5 rounded-md border border-[var(--cp-border-faint)] bg-[var(--cp-panel)] px-1.5 py-2"
              >
                <span className="text-[11px] text-[var(--cp-text-dim)]">{trHour(w.hour, lang)}</span>
                <span className="font-mono text-[14px] font-semibold tabular-nums text-[var(--cp-text-strong)]">
                  {w.temp != null ? `${w.temp}°` : "-"}
                </span>
                <span
                  className={`font-mono text-[11px] tabular-nums ${
                    (w.rainProb ?? 0) >= 60 ? (light ? "text-sky-600" : "text-sky-300") : "text-[var(--cp-text-faint)]"
                  }`}
                >
                  {w.rainProb != null ? `${w.rainProb}%` : ""}
                </span>
              </div>
            ))}
          </div>
          <p className="mt-1 text-[11px] text-[var(--cp-text-faint)]">
            {city === "seoul" ? t.weatherNote : "Open-Meteo"}
          </p>
        </div>
      )}

      {/* 방문자 구성 (연령·성비·상주비) — 의사결정 가치가 낮은 꼬리라 기본 접힘·최하단.
          원천 없는 도시(부산)는 생략 */}
      {detail.ages.length > 0 && (
      <details className="group">
        <summary className="flex cursor-pointer list-none items-center gap-1 text-[12px] font-medium uppercase tracking-wider text-[var(--cp-text-dim)] transition-colors hover:text-[var(--cp-text)] [&::-webkit-details-marker]:hidden">
          {t.visitorTitle} <span className="font-normal normal-case text-[var(--cp-text-faint)]">{t.visitorSub}</span>
          <ChevronDown className="h-3.5 w-3.5 transition-transform group-open:rotate-180" />
        </summary>
        <div className="mt-3 space-y-1.5">
          {detail.ages.map((age) => (
            <div key={age.label} className="flex items-center gap-2">
              <span className="w-16 shrink-0 text-[12px] text-[var(--cp-text-muted)]">{trAgeLabel(age.label)}</span>
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
                className={`w-11 shrink-0 text-right font-mono text-[12px] tabular-nums ${
                  age.value === maxAge ? "font-semibold text-[var(--cp-text-strong)]" : "text-[var(--cp-text-dim)]"
                }`}
              >
                {age.value}%
              </span>
            </div>
          ))}
          <div className="grid grid-cols-1 gap-3 pt-2">
            <RatioBar
              left={detail.gender.male}
              right={detail.gender.female}
              leftLabel={t.male}
              rightLabel={t.female}
            />
            <RatioBar
              left={detail.resident.resident}
              right={detail.resident.nonResident}
              leftLabel={city === "jeju" ? t.jejuLocals : t.residents}
              rightLabel={city === "jeju" ? t.jejuTourists : t.visitors}
              leftColor={C.residentL}
              rightColor={C.residentR}
            />
          </div>
        </div>
      </details>
      )}
    </div>
  )
}
