"use client"

import { useMemo } from "react"
import { Bike, CalendarDays, CarFront, Navigation, SquareParking, TrainFront } from "lucide-react"
import { textColor, type CrowdExtra } from "@/lib/crowd/seoul-rtd"
import { distanceM, formatMeters } from "@/components/crowd/shared"
import { useLang } from "@/components/crowd/lang-context"
import { trRoad, trRoadMsg } from "@/lib/crowd/i18n"
import { romanizeAddress } from "@/lib/crowd/romanize"

interface SpotExtrasProps {
  extra: CrowdExtra
  origin?: { lat: number; lng: number }
  light: boolean
}

/** 부가정보 섹션 묶음 — 주차 여유·문화행사·도로 소통·따릉이 (사고통제 경고는 헤드라인 아래라 spot-detail 소관) */
export default function SpotExtras({ extra, origin, light }: SpotExtrasProps) {
  const { lang, t } = useLang()
  // 주차장·따릉이 대여소는 명소 중심에서 가까운 순으로
  const parkingLots = useMemo(() => {
    const lots = extra.parking?.lots ?? []
    if (!origin) return lots.slice(0, 3)
    return [...lots]
      .sort(
        (a, b) =>
          distanceM(origin.lat, origin.lng, a.lat, a.lng) - distanceM(origin.lat, origin.lng, b.lat, b.lng),
      )
      .slice(0, 3)
  }, [extra, origin])

  const bikeStations = useMemo(() => {
    const stations = extra.bike?.stations ?? []
    if (!origin) return stations.slice(0, 4)
    return [...stations]
      .sort(
        (a, b) =>
          distanceM(origin.lat, origin.lng, a.lat, a.lng) - distanceM(origin.lat, origin.lng, b.lat, b.lng),
      )
      .slice(0, 4)
  }, [extra, origin])

  return (
    <>
      {/* 주차 여유 — 실시간 잔여를 주는 주차장만 (자차 방문 판단용) */}
      {extra.parking && (
        <div id="crowd-sec-parking" className="scroll-mt-2">
          <div className="mb-2 flex items-baseline justify-between">
            <h3 className="flex items-center gap-1.5 text-[12px] font-medium uppercase tracking-wider text-[var(--cp-text-dim)]">
              <SquareParking className="h-3.5 w-3.5" /> {t.parkingTitle}
            </h3>
            <span
              className="font-mono text-[13px] font-semibold tabular-nums"
              style={{
                color: textColor(
                  extra.parking.percent >= 40 ? "#00d369" : extra.parking.percent >= 15 ? "#ffb100" : "#ff3939",
                  light,
                ),
              }}
            >
              {t.parkingSummary(extra.parking.available.toLocaleString(), extra.parking.percent)}
            </span>
          </div>
          <ul className="overflow-hidden rounded-md border border-[var(--cp-border)]">
            {parkingLots.map((lot) => {
              // 좌표 없는(0,0) 주차장에 거리를 붙이면 (0,0)까지 1.3만km가 나온다 — 링크와 같이 좌표 유효할 때만
              const linked = lot.lat !== 0 && lot.lng !== 0
              const meters =
                origin && linked ? Math.round(distanceM(origin.lat, origin.lng, lot.lat, lot.lng)) : null
              // 여유 비율 — 총면수를 주는 원천은 잔여÷총면, 점유율만 주는 원천(인천공항)은 그 보수
              const pct =
                lot.occupancyPct != null
                  ? 100 - lot.occupancyPct
                  : lot.capacity > 0
                    ? Math.round((lot.available / lot.capacity) * 100)
                    : 0
              return (
                <li key={lot.name} className="border-b border-[var(--cp-border-faint)] last:border-b-0">
                  <a
                    href={linked ? `https://map.kakao.com/link/to/${encodeURIComponent(lot.name)},${lot.lat},${lot.lng}` : undefined}
                    target="_blank"
                    rel="noopener noreferrer"
                    title={linked ? t.kakaoNavTitle : undefined}
                    className={`flex items-center gap-2.5 px-3 py-2 ${linked ? "transition-colors hover:bg-[var(--cp-hover)]" : ""}`}
                  >
                    {/* 주차장·행사명은 원천의 자유 텍스트라 사전화가 불가능 — 로마자로 읽게만 한다 */}
                    <span className="min-w-0 flex-1 truncate text-[14px] text-[var(--cp-text)]">
                      {lang === "ko" ? lot.name : romanizeAddress(lot.name)}
                    </span>
                    {meters != null && (
                      <span className="shrink-0 font-mono text-[12px] tabular-nums text-[var(--cp-text-dim)]">
                        {formatMeters(meters)}
                      </span>
                    )}
                    <span
                      className="shrink-0 font-mono text-[13px] font-semibold tabular-nums"
                      style={{ color: textColor(pct >= 40 ? "#00d369" : pct >= 15 ? "#ffb100" : "#ff3939", light) }}
                    >
                      {lot.available}
                    </span>
                    {lot.capacity > 0 && (
                      <span className="shrink-0 font-mono text-[12px] tabular-nums text-[var(--cp-text-faint)]">
                        {t.parkingCap(lot.capacity)}
                      </span>
                    )}
                    {linked && <Navigation className="h-3 w-3 shrink-0 text-[var(--cp-text-faint)]" />}
                  </a>
                </li>
              )
            })}
          </ul>
          <p className="mt-1 text-[11px] text-[var(--cp-text-faint)]">{t.parkingNote}</p>
        </div>
      )}

      {/* 진행 중 문화행사 — 붐빔의 원인이자 갈 이유 */}
      {extra.events.length > 0 && (
        <div id="crowd-sec-events" className="scroll-mt-2">
          <h3 className="mb-2 flex items-center gap-1.5 text-[12px] font-medium uppercase tracking-wider text-[var(--cp-text-dim)]">
            <CalendarDays className="h-3.5 w-3.5" /> {t.eventsTitle}{" "}
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
                    <p className="truncate text-[14px] text-[var(--cp-text)]">
                      {lang === "ko" ? ev.title : romanizeAddress(ev.title)}
                    </p>
                    <p className="truncate text-[12px] text-[var(--cp-text-dim)]">
                      {ev.place && `${lang === "ko" ? ev.place : romanizeAddress(ev.place)} · `}
                      <span className="font-mono tabular-nums">{ev.period}</span>
                    </p>
                  </div>
                  {ev.free && (
                    <span
                      className={`shrink-0 rounded-full border border-emerald-500/40 px-1.5 py-0.5 text-[11px] font-medium ${light ? "text-emerald-700" : "text-emerald-500"}`}
                    >
                      {t.free}
                    </span>
                  )}
                </a>
              </li>
            ))}
          </ul>
          {extra.events.length > 6 && (
            <p className="mt-1 text-[11px] text-[var(--cp-text-faint)]">{t.moreEvents(extra.events.length - 6)}</p>
          )}
        </div>
      )}

      {/* 도로 소통 — "차로 가도 되나" 한 줄 답 */}
      {extra.road && (
        <div id="crowd-sec-road" className="scroll-mt-2">
          <h3 className="mb-2 flex items-center gap-1.5 text-[12px] font-medium uppercase tracking-wider text-[var(--cp-text-dim)]">
            <CarFront className="h-3.5 w-3.5" /> {t.roadTitle}
          </h3>
          <div className="flex items-center gap-2.5 rounded-md border border-[var(--cp-border)] bg-[var(--cp-panel)] px-3 py-2.5">
            <span
              className="shrink-0 rounded-full px-2 py-0.5 text-[12px] font-bold"
              style={{
                color: textColor(extra.road.color, light),
                background: `${extra.road.color}1f`,
                border: `1px solid ${extra.road.color}55`,
              }}
            >
              {trRoad(extra.road.idx, lang)}
            </span>
            <p className="min-w-0 flex-1 text-[13px] leading-relaxed text-[var(--cp-text-muted)]">
              {trRoadMsg(extra.road.idx, extra.road.msg, lang)}
            </p>
            {extra.road.speed > 0 && (
              <span className="shrink-0 font-mono text-[13px] tabular-nums text-[var(--cp-text)]">
                {extra.road.speed}
                <span className="text-[11px] text-[var(--cp-text-dim)]">km/h</span>
              </span>
            )}
          </div>
        </div>
      )}

      {/* 지하철 실시간 도착 — 명소 인근 역 (서울 RTD, "언제 출발하면 되나"의 답) */}
      {extra.subway && extra.subway.length > 0 && (
        <div id="crowd-sec-subway" className="scroll-mt-2">
          <h3 className="mb-2 flex items-center gap-1.5 text-[12px] font-medium uppercase tracking-wider text-[var(--cp-text-dim)]">
            <TrainFront className="h-3.5 w-3.5" /> {t.subwayTitle}
          </h3>
          <ul className="space-y-1.5">
            {extra.subway.map((st) => (
              <li
                key={`${st.line}:${st.station}`}
                className="rounded-md border border-[var(--cp-border)] bg-[var(--cp-panel)] px-3 py-2"
              >
                <p className="text-[13px] font-medium text-[var(--cp-text-strong)]">
                  {lang === "ko" ? st.station : romanizeAddress(st.station)}
                  <span className="ml-1.5 text-[12px] font-normal text-[var(--cp-text-dim)]">
                    {t.subwayLine(st.line)}
                  </span>
                </p>
                <ul className="mt-1 space-y-0.5">
                  {st.arrivals.slice(0, 3).map((a, i) => (
                    <li key={i} className="flex items-baseline gap-2 text-[12px]">
                      {/* 도착 안내는 원천 자유 텍스트("5분 30초 후 (을지로3가)") — 행선지만 앞에 세운다 */}
                      <span className="min-w-0 truncate text-[var(--cp-text-muted)]">
                        {lang === "ko" ? `${a.dest}행` : romanizeAddress(a.dest)}
                      </span>
                      <span className="ml-auto shrink-0 font-mono tabular-nums text-[var(--cp-text)]">
                        {lang === "ko" ? a.msg : romanizeAddress(a.msg)}
                      </span>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* 따릉이 — 대여 가능 대수 (한강공원·데이트 코스) */}
      {extra.bike && (
        <div id="crowd-sec-bike" className="scroll-mt-2">
          <div className="mb-2 flex items-baseline justify-between">
            <h3 className="flex items-center gap-1.5 text-[12px] font-medium uppercase tracking-wider text-[var(--cp-text-dim)]">
              <Bike className="h-3.5 w-3.5" /> {t.bikeTitle}
            </h3>
            <span className="font-mono text-[13px] tabular-nums text-[var(--cp-text)]">
              {t.bikeNow} <span className="font-semibold text-[var(--cp-text-strong)]">{extra.bike.bikes}</span>
              {t.bikeUnit}
            </span>
          </div>
          <ul className="overflow-hidden rounded-md border border-[var(--cp-border)]">
            {bikeStations.map((st) => {
              const linked = st.lat !== 0 && st.lng !== 0
              const meters =
                origin && linked ? Math.round(distanceM(origin.lat, origin.lng, st.lat, st.lng)) : null
              return (
                <li key={st.name} className="border-b border-[var(--cp-border-faint)] last:border-b-0">
                  <a
                    href={linked ? `https://map.kakao.com/link/to/${encodeURIComponent(st.name)},${st.lat},${st.lng}` : undefined}
                    target="_blank"
                    rel="noopener noreferrer"
                    title={linked ? t.kakaoNavTitle : undefined}
                    className={`flex items-center gap-2.5 px-3 py-2 ${linked ? "transition-colors hover:bg-[var(--cp-hover)]" : ""}`}
                  >
                    <span className="min-w-0 flex-1 truncate text-[14px] text-[var(--cp-text)]">
                      {lang === "ko" ? st.name : romanizeAddress(st.name)}
                    </span>
                    {meters != null && (
                      <span className="shrink-0 font-mono text-[12px] tabular-nums text-[var(--cp-text-dim)]">
                        {formatMeters(meters)}
                      </span>
                    )}
                    <span
                      className="shrink-0 font-mono text-[13px] font-semibold tabular-nums"
                      style={{ color: textColor(st.bikes === 0 ? "#ff3939" : st.bikes < 3 ? "#ffb100" : "#00d369", light) }}
                    >
                      {st.bikes}
                      {t.bikeUnit}
                    </span>
                    {linked && <Navigation className="h-3 w-3 shrink-0 text-[var(--cp-text-faint)]" />}
                  </a>
                </li>
              )
            })}
          </ul>
          <p className="mt-1 text-[11px] text-[var(--cp-text-faint)]">{t.tapForNav}</p>
        </div>
      )}
    </>
  )
}
