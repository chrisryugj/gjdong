"use client"

// 인천공항 실황 보드 — 주차·도착(마중)·택시·공항버스. 인천 목록 하단 전용(시민 모드).
// 데이터: /api/crowd/airport (도착·택시 2분 캐시, 주차 동봉) · ?busArea=/?routeId=(6h 캐시)

import { useCallback, useEffect, useMemo, useState } from "react"
import { Bus, CarTaxiFront, LoaderCircle, PlaneLanding, SquareParking, TramFront } from "lucide-react"
import { trArrStat } from "@/lib/crowd/i18n"
import type {
  AirportArrival,
  AirportTaxi,
  ArexStation,
  BusDetail,
  BusRoute,
  InoutForecast,
} from "@/lib/crowd/incheon-airport"
import type { CrowdParkingLot } from "@/lib/crowd/seoul-rtd"
import { useLang } from "@/components/crowd/lang-context"

interface BoardData {
  arrivals: AirportArrival[]
  taxi: AirportTaxi | null
  parking: CrowdParkingLot[]
  inout: { t1: InoutForecast | null; t2: InoutForecast | null } | null
}

interface ArexData {
  t1: ArexStation | null
  t2: ArexStation | null
}

// 지역 탭 — id는 원천 코드(1서울 2경기 3인천 4강원 5충청 7전라 6경상), 라벨은 cityNames와 무관한 짧은 지명
const BUS_AREA_LABELS: Array<{ id: string; ko: string; en: string }> = [
  { id: "1", ko: "서울", en: "Seoul" },
  { id: "2", ko: "경기", en: "Gyeonggi" },
  { id: "3", ko: "인천", en: "Incheon" },
  { id: "4", ko: "강원", en: "Gangwon" },
  { id: "5", ko: "충청", en: "Chungcheong" },
  { id: "7", ko: "전라", en: "Jeolla" },
  { id: "6", ko: "경상", en: "Gyeongsang" },
]

function SectionHead({ icon, title, sub }: { icon: React.ReactNode; title: string; sub?: string }) {
  return (
    <div className="mb-1.5 flex items-baseline justify-between">
      <h3 className="flex items-center gap-1.5 text-[12px] font-medium uppercase tracking-wider text-[var(--cp-text-dim)]">
        {icon}
        {title}
      </h3>
      {sub && <span className="font-mono text-[11px] tabular-nums text-[var(--cp-text-faint)]">{sub}</span>}
    </div>
  )
}

export default function AirportBoard({ light, updatedAt }: { light: boolean; updatedAt: string | null }) {
  const { lang, t } = useLang()
  const [board, setBoard] = useState<BoardData | null>(null)
  const [busArea, setBusArea] = useState<string | null>(null)
  const [routes, setRoutes] = useState<BusRoute[]>([])
  const [routeId, setRouteId] = useState<string | null>(null)
  const [busDetail, setBusDetail] = useState<BusDetail | null>(null)
  const [busLoading, setBusLoading] = useState(false)
  const [arex, setArex] = useState<ArexData | null>(null)

  // 공항철도 시각표 — 하루 단위 데이터라 마운트 시 1회
  useEffect(() => {
    let alive = true
    void fetch("/api/crowd/airport?arex=1")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (alive && d) setArex(d as ArexData)
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [])

  // 본판은 목록 갱신 주기에 맞춰 재조회 (숨김탭 일시정지 등 폴링 정책은 상위가 이미 처리)
  useEffect(() => {
    let alive = true
    void fetch("/api/crowd/airport")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (alive && d) setBoard(d as BoardData)
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [updatedAt])

  const pickArea = useCallback((id: string) => {
    setBusArea(id)
    setRouteId(null)
    setBusDetail(null)
    setBusLoading(true)
    void fetch(`/api/crowd/airport?busArea=${id}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { routes?: BusRoute[] } | null) => setRoutes(d?.routes ?? []))
      .catch(() => setRoutes([]))
      .finally(() => setBusLoading(false))
  }, [])

  const pickRoute = useCallback((id: string) => {
    setRouteId(id)
    setBusDetail(null)
    setBusLoading(true)
    void fetch(`/api/crowd/airport?routeId=${id}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setBusDetail((d as BusDetail) ?? null))
      .catch(() => setBusDetail(null))
      .finally(() => setBusLoading(false))
  }, [])

  // 주차: T1/T2 그룹 (구역명 "T1 단기 지하 1층" → 접두 터미널 분리)
  const parkingByTerminal = useMemo(() => {
    const g: Record<"1" | "2", CrowdParkingLot[]> = { "1": [], "2": [] }
    for (const l of board?.parking ?? []) {
      if (l.name.startsWith("T1 ")) g["1"].push(l)
      else if (l.name.startsWith("T2 ")) g["2"].push(l)
    }
    return g
  }, [board])

  // 다음 출발: KST 현재 이후 시각만 (시간표는 KST 고정)
  const nowKst = useMemo(() => {
    const d = new Date(Date.now() + 9 * 3600 * 1000)
    return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`
    // updatedAt이 바뀔 때마다 재계산되면 충분 (분 단위 정밀도)
  }, [])

  const arrivals = board?.arrivals ?? []
  const shownArrivals = arrivals.slice(0, 10)
  const taxi = board?.taxi ?? null
  const delayColor = light ? "text-red-600" : "text-red-400"

  if (!board)
    return (
      <div className="flex h-24 items-center justify-center border-t border-[var(--cp-border)]">
        <LoaderCircle className="h-4 w-4 animate-spin text-[var(--cp-text-dim)]" />
      </div>
    )

  return (
    <div className="space-y-4 border-t border-[var(--cp-border)] px-4 pb-4 pt-3">
      {/* ── 주차 */}
      {(parkingByTerminal["1"].length > 0 || parkingByTerminal["2"].length > 0) && (
        <section>
          <SectionHead icon={<SquareParking className="h-3.5 w-3.5" />} title={t.parkingTitle} />
          <div className="grid grid-cols-1 gap-x-4 gap-y-1 sm:grid-cols-2">
            {(["1", "2"] as const).map((term) => (
              <div key={term}>
                <p className="mb-0.5 mt-1 text-[12px] font-semibold text-[var(--cp-text)]">
                  T{term}{" "}
                  <span className="font-normal text-[var(--cp-text-dim)]">
                    {t.apSpots(parkingByTerminal[term].reduce((s, l) => s + l.available, 0))}
                  </span>
                </p>
                <ul>
                  {parkingByTerminal[term].map((l) => (
                    <li key={l.name} className="flex items-center gap-2 py-0.5">
                      <span className="min-w-0 flex-1 truncate text-[12px] text-[var(--cp-text-muted)]">
                        {l.name.slice(3)}
                      </span>
                      {l.occupancyPct != null && (
                        <span className="h-1 w-14 shrink-0 overflow-hidden rounded-full bg-[var(--cp-track)]">
                          <span
                            className="block h-full rounded-full"
                            style={{
                              width: `${l.occupancyPct}%`,
                              background: l.occupancyPct >= 95 ? "#ff3939" : l.occupancyPct >= 80 ? "#ffb100" : "#00d369",
                            }}
                          />
                        </span>
                      )}
                      <span className="w-14 shrink-0 text-right font-mono text-[11px] tabular-nums text-[var(--cp-text)]">
                        {t.apSpots(l.available)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── 도착 · 마중 */}
      {arrivals.length > 0 && (
        <section>
          <SectionHead
            icon={<PlaneLanding className="h-3.5 w-3.5" />}
            title={t.apArrivalsTitle}
            sub={t.apWithin2h(arrivals.length)}
          />
          <ul>
            {shownArrivals.map((a) => {
              const delayed = a.status === "지연"
              return (
                <li key={a.flight + a.sched} className="flex items-center gap-2 border-b border-[var(--cp-border-faint)] py-1.5 last:border-b-0">
                  <span className="w-11 shrink-0 font-mono text-[12px] font-semibold tabular-nums text-[var(--cp-text-strong)]">
                    {a.est}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] text-[var(--cp-text)]">
                      <span className="font-mono">{a.flight}</span> · {a.from[lang] || a.from.ko}
                    </p>
                    <p className="text-[11px] text-[var(--cp-text-dim)]">
                      T{a.terminal === "C" ? "1" : a.terminal}
                      {a.exit && <> · {t.apExitDoor(a.exit)}</>}
                      {a.belt && <> · {t.apBelt(a.belt)}</>}
                      {delayed && a.sched !== a.est && (
                        <span className="text-[var(--cp-text-faint)]"> · {t.apSched} {a.sched}</span>
                      )}
                    </p>
                  </div>
                  {a.status && (
                    <span className={`shrink-0 text-[12px] ${delayed ? delayColor : "text-[var(--cp-text-muted)]"}`}>
                      {trArrStat(a.status, lang)}
                    </span>
                  )}
                </li>
              )
            })}
          </ul>
          {arrivals.length > shownArrivals.length && (
            <p className="mt-1 text-[11px] text-[var(--cp-text-faint)]">{t.apMore(arrivals.length - shownArrivals.length)}</p>
          )}
          {/* 입국장별 예상 인원 — 지금·다음 시간대 (마중객이 어느 문 앞이 붐빌지) */}
          {board.inout && (board.inout.t1 || board.inout.t2) && (
            <div className="mt-2 border-t border-[var(--cp-border-faint)] pt-2">
              <p className="mb-1 text-[11px] font-medium uppercase tracking-wider text-[var(--cp-text-dim)]">
                {t.apInoutTitle}
              </p>
              {(["t1", "t2"] as const).map((term) => {
                const fc = board.inout?.[term]
                if (!fc) return null
                const hourNow = new Date(Date.now() + 9 * 3600 * 1000).getUTCHours()
                const slots = [hourNow, (hourNow + 1) % 24].map((h) =>
                  fc.rows.find((r) => r.hour.startsWith(String(h).padStart(2, "0"))),
                )
                return (
                  <div key={term} className="py-0.5">
                    {slots.map(
                      (row) =>
                        row && (
                          <p key={row.hour} className="text-[12px] text-[var(--cp-text-muted)]">
                            <span className="font-semibold text-[var(--cp-text)]">{term.toUpperCase()}</span>{" "}
                            <span className="font-mono tabular-nums">{row.hour}</span>
                            {" · "}
                            {fc.labels.map((lb, i) => `${lb} ${row.counts[i]?.toLocaleString() ?? 0}`).join(" · ")}
                          </p>
                        ),
                    )}
                  </div>
                )
              })}
              <p className="mt-0.5 text-[10px] text-[var(--cp-text-faint)]">{t.apInoutNote}</p>
            </div>
          )}
        </section>
      )}

      {/* ── 택시 대기 */}
      {taxi && (
        <section>
          <SectionHead
            icon={<CarTaxiFront className="h-3.5 w-3.5" />}
            title={t.apTaxiTitle}
            sub={taxi.at ? t.updatedAt(taxi.at.slice(-8, -3)) : undefined}
          />
          <div className="grid grid-cols-1 gap-x-4 gap-y-1 sm:grid-cols-2">
            {(
              [
                ["T1", [
                  [t.taxiNormal, taxi.t1.normal],
                  [t.taxiDeluxe, taxi.t1.deluxe],
                  [t.taxiJumbo, taxi.t1.jumbo],
                ]],
                ["T2", [
                  [t.boundSeoul, taxi.t2.seoul],
                  [t.boundIncheon, taxi.t2.incheon],
                  [t.boundGyeonggi, taxi.t2.gyeonggi],
                  [t.boundOuter, taxi.t2.outer],
                  [t.taxiDeluxe, taxi.t2.deluxe],
                  [t.taxiJumbo, taxi.t2.jumbo],
                ]],
              ] as Array<[string, Array<[string, number]>]>
            ).map(([term, rows]) => (
              <div key={term}>
                <p className="mb-0.5 mt-1 text-[12px] font-semibold text-[var(--cp-text)]">{term}</p>
                <ul>
                  {rows.map(([label, n]) => (
                    <li key={label} className="flex items-center justify-between py-0.5">
                      <span className="text-[12px] text-[var(--cp-text-muted)]">{label}</span>
                      <span className="font-mono text-[12px] tabular-nums text-[var(--cp-text)]">{t.bikeCount(n)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── 공항철도 — 다음 열차(서울역 방면) · 공식 시각표 SSR 파싱, 토·일=휴일 다이어 */}
      {arex && (arex.t1 || arex.t2) && (
        <section>
          <SectionHead icon={<TramFront className="h-3.5 w-3.5" />} title={t.apTrainTitle} />
          {(() => {
            const kst = new Date(Date.now() + 9 * 3600 * 1000)
            const isHoliday = kst.getUTCDay() === 0 || kst.getUTCDay() === 6
            const rows: Array<{ term: string; label: string; times: string[] }> = []
            for (const [term, stn] of [
              ["T1", arex.t1],
              ["T2", arex.t2],
            ] as const) {
              if (!stn) continue
              const day = isHoliday ? stn.holiday : stn.weekday
              rows.push({ term, label: t.trainAll, times: day.all })
              rows.push({ term, label: t.trainExpress, times: day.express })
            }
            return (
              <ul>
                {rows.map(({ term, label, times }) => {
                  const next = times.filter((x) => x >= nowKst).slice(0, 3)
                  return (
                    <li key={term + label} className="flex items-baseline gap-2 py-0.5">
                      <span className="w-7 shrink-0 text-[12px] font-semibold text-[var(--cp-text)]">{term}</span>
                      <span className="min-w-0 flex-1 truncate text-[12px] text-[var(--cp-text-muted)]">{label}</span>
                      <span className="shrink-0 font-mono text-[12px] tabular-nums text-[var(--cp-text)]">
                        {next.length > 0 ? next.join(" · ") : `${t.busFirst} ${times[0] ?? "—"}`}
                      </span>
                      <span className="hidden shrink-0 font-mono text-[11px] tabular-nums text-[var(--cp-text-faint)] sm:inline">
                        {t.busLast} {times[times.length - 1] ?? "—"}
                      </span>
                    </li>
                  )
                })}
              </ul>
            )
          })()}
          <p className="mt-1 text-[10px] text-[var(--cp-text-faint)]">{t.apTrainNote}</p>
        </section>
      )}

      {/* ── 공항버스 · 리무진 */}
      <section>
        <SectionHead icon={<Bus className="h-3.5 w-3.5" />} title={t.apBusTitle} />
        <div className="flex flex-wrap gap-1.5">
          {BUS_AREA_LABELS.map((a) => (
            <button
              key={a.id}
              onClick={() => pickArea(a.id)}
              aria-pressed={busArea === a.id}
              className={`rounded-full border px-2.5 py-1 text-[12px] transition-colors ${
                busArea === a.id
                  ? "border-[var(--cp-border-active)] bg-[var(--cp-panel2)] font-medium text-[var(--cp-text-strong)]"
                  : "border-[var(--cp-border)] text-[var(--cp-text-muted)] hover:border-[var(--cp-border-strong)]"
              }`}
            >
              {lang === "ko" ? a.ko : a.en}
            </button>
          ))}
        </div>
        {busArea == null && <p className="mt-1.5 text-[12px] text-[var(--cp-text-dim)]">{t.busPick}</p>}
        {busArea != null && (
          <div className="mt-2 flex max-h-28 flex-wrap gap-1.5 overflow-y-auto">
            {routes.map((r) => (
              <button
                key={r.id}
                onClick={() => pickRoute(r.id)}
                aria-pressed={routeId === r.id}
                className={`rounded border px-2 py-0.5 font-mono text-[11px] tabular-nums transition-colors ${
                  routeId === r.id
                    ? "border-[var(--cp-border-active)] bg-[var(--cp-panel2)] text-[var(--cp-text-strong)]"
                    : "border-[var(--cp-border)] text-[var(--cp-text-muted)] hover:border-[var(--cp-border-strong)]"
                }`}
              >
                {r.name}
              </button>
            ))}
          </div>
        )}
        {busLoading && <LoaderCircle className="mt-2 h-4 w-4 animate-spin text-[var(--cp-text-dim)]" />}
        {busDetail && !busLoading && (
          <div className="mt-2 rounded-md border border-[var(--cp-border)] bg-[var(--cp-panel)] p-2.5">
            <p className="text-[13px] font-semibold text-[var(--cp-text-strong)]">
              {routes.find((r) => r.id === routeId)?.name}
            </p>
            <p className="mt-0.5 text-[12px] text-[var(--cp-text-muted)]">
              {t.busFirst} {busDetail.first} · {t.busLast} {busDetail.last}
              {busDetail.fare && <> · {t.busFare} {busDetail.fare}</>}
            </p>
            {busDetail.company && <p className="text-[11px] text-[var(--cp-text-dim)]">{busDetail.company}</p>}
            {busDetail.tables.map((tb) => {
              const next = tb.times.filter((x) => x >= nowKst).slice(0, 3)
              return (
                <div key={tb.label} className="mt-1.5">
                  <p className="text-[11px] text-[var(--cp-text-dim)]">
                    {tb.label} · {t.busNextDep}{" "}
                    <span className="font-mono tabular-nums text-[var(--cp-text)]">
                      {next.length > 0 ? next.join(" · ") : "—"}
                    </span>
                  </p>
                  <details className="mt-0.5">
                    <summary className="cursor-pointer text-[11px] text-[var(--cp-text-faint)] hover:text-[var(--cp-text-muted)]">
                      {t.busTimetable} ({tb.times.length})
                    </summary>
                    <p className="mt-1 font-mono text-[11px] leading-relaxed tabular-nums text-[var(--cp-text-muted)]">
                      {tb.times.join(" ")}
                    </p>
                  </details>
                </div>
              )
            })}
          </div>
        )}
      </section>
    </div>
  )
}
