"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { ArrowLeft, Map as MapIcon, Star } from "lucide-react"
import type { CrowdDisaster, CrowdExtra, CrowdSpot } from "@/lib/crowd/seoul-rtd"
import { CITIES, CITY_CAPS, type CityId } from "@/lib/crowd/cities"
import CrowdMap from "@/components/crowd/crowd-map"
import { UI } from "@/lib/crowd/i18n"
import { buildCsv, buildReport, buildSnapshotRows, csvFilename } from "@/lib/crowd/export"
import { buildLogRows, logSpotNames, type OpsLogTick } from "@/lib/crowd/oplog"
import { useLang } from "@/components/crowd/lang-context"
import { useOpsDetails } from "@/components/crowd/hooks/use-ops-details"
import OpsCard from "@/components/crowd/ops/ops-card"
import OpsToolbar from "@/components/crowd/ops/ops-toolbar"

/** 상황실 보드 — 감시 지점 카드 그리드 (붐빔 우선 정렬, 폴링 편승 갱신) */
export default function OpsBoard({
  city,
  spots,
  updatedAt,
  watch,
  favs,
  light,
  disaster,
  alertsEnabled,
  alertsPermission,
  onToggleAlerts,
  onToggleWatch,
  onAddMany,
  onClearWatch,
  onOpenSpot,
  onExit,
  logTicks,
  onExportLog,
  onClearLog,
}: {
  city: CityId
  spots: CrowdSpot[]
  updatedAt: string | null
  watch: string[]
  favs: Set<string>
  light: boolean
  disaster: CrowdDisaster[]
  alertsEnabled: boolean
  alertsPermission: "default" | "granted" | "denied" | "unsupported"
  onToggleAlerts: () => Promise<void>
  onToggleWatch: (name: string) => void
  onAddMany: (names: string[]) => void
  onClearWatch: () => void
  onOpenSpot: (name: string) => void
  onExit: () => void
  /** 행사 로그 — XLSX 시트에 함께 실린다. 비어 있으면 내보내기 버튼 비노출 */
  logTicks: OpsLogTick[]
  onExportLog: () => void
  onClearLog: () => void
}) {
  const { t, lang } = useLang()
  const details = useOpsDetails(city, watch, updatedAt)

  // 접이식 미니맵 — 기본 열림(공간 파악이 상황실의 기본 니즈), 접은 사람만 기기별로 기억
  const [mapOpen, setMapOpen] = useState(true)
  useEffect(() => {
    setMapOpen(localStorage.getItem("crowdOpsMap") !== "0")
  }, [])
  const toggleMap = useCallback(() => {
    setMapOpen((v) => {
      localStorage.setItem("crowdOpsMap", v ? "0" : "1")
      return !v
    })
  }, [])

  // 감시 지점 중 현재 목록에 실존하는 것만 (원천 개편·오타 딥링크는 조용히 제외)
  const watchSpots = useMemo(() => {
    const byName = new Map(spots.map((s) => [s.name, s]))
    return watch.map((n) => byName.get(n)).filter((s): s is CrowdSpot => s != null)
  }, [spots, watch])

  // 붐빔 우선 정렬 — 상황실의 존재 이유는 "지금 위험한 곳부터"
  const sorted = useMemo(() => [...watchSpots].sort((a, b) => b.levelNum - a.levelNum), [watchSpots])

  // 폴링 스냅샷 간 등급 변화 → 추세 화살표 (추가 API 콜 0)
  const [trends, setTrends] = useState<Map<string, -1 | 0 | 1>>(new Map())
  const lastRef = useRef<{ at: string; levels: Map<string, number> } | null>(null)
  useEffect(() => {
    if (!updatedAt) return
    const cur = new Map(spots.map((s) => [s.name, s.levelNum]))
    const last = lastRef.current
    if (last && last.at !== updatedAt) {
      const next = new Map<string, -1 | 0 | 1>()
      for (const [name, lv] of cur) {
        const prev = last.levels.get(name)
        if (prev != null && prev !== lv) next.set(name, lv > prev ? 1 : -1)
      }
      setTrends(next)
    }
    lastRef.current = { at: updatedAt, levels: cur }
  }, [updatedAt, spots])

  const seedable = useMemo(() => Array.from(favs).filter((n) => spots.some((s) => s.name === n)), [favs, spots])

  // CSV = 전 지점 스냅샷 (기록·증빙용, extra 미호출) — 파일로 다운로드
  const exportCsv = useCallback(() => {
    const blob = new Blob([buildCsv({ city, spots, updatedAt })], { type: "text/csv;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = csvFilename(city, new Date())
    a.click()
    URL.revokeObjectURL(url)
  }, [city, spots, updatedAt])

  // XLSX = 현황 시트 + (있으면) 행사로그 시트 — 열너비·자동필터.
  // xlsx는 무거워서 클릭 시점 dynamic import (ops 청크에도 싣지 않는다).
  // 셀 배경색·머리행 고정은 SheetJS CE가 출력하지 않음(ZIP 실측) — 등급 텍스트·자동필터로 판독 보장.
  const exportXlsx = useCallback(async () => {
    const XLSX = await import("xlsx")
    const wb = XLSX.utils.book_new()
    const rows = buildSnapshotRows({ city, spots, updatedAt })
    const ws = XLSX.utils.aoa_to_sheet(rows)
    ws["!cols"] = [{ wch: 6 }, { wch: 26 }, { wch: 10 }, { wch: 12 }, { wch: 10 }, { wch: 8 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 22 }]
    ws["!autofilter"] = { ref: `A1:J${rows.length}` }
    XLSX.utils.book_append_sheet(wb, ws, "현황")
    if (logTicks.length > 0) {
      const lws = XLSX.utils.aoa_to_sheet(buildLogRows(logTicks))
      lws["!cols"] = [{ wch: 18 }, ...logSpotNames(logTicks).map(() => ({ wch: 16 }))]
      XLSX.utils.book_append_sheet(wb, lws, "행사로그")
    }
    XLSX.writeFile(wb, csvFilename(city, new Date()).replace(/\.csv$/, ".xlsx"))
  }, [city, spots, updatedAt, logTicks])

  // 상황보고 = 감시 지점만 — 복사 시점에 사고·통제(extra)를 감시 지점 수만큼만 팬아웃
  const copyReport = useCallback(async () => {
    const targets = CITY_CAPS[city].extra ? watchSpots : []
    const settled = await Promise.allSettled(
      targets.map(async (s) => {
        const res = await fetch(`/api/crowd/extra?spot=${encodeURIComponent(s.name)}&city=${city}`)
        if (!res.ok) throw new Error("bad status")
        return [s.name, (await res.json()) as CrowdExtra] as const
      }),
    )
    const extras = new Map(settled.filter((r) => r.status === "fulfilled").map((r) => r.value))
    // 보고 문안은 한국 행정 문서 성격이라 UI 언어와 무관하게 한국어 고정
    const text = buildReport({
      cityName: UI.ko.cityNames[city],
      watchSpots,
      details,
      extras,
      disaster,
      at: new Date(),
    })
    await navigator.clipboard.writeText(text)
  }, [city, watchSpots, details, disaster])

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b border-[var(--cp-border)] px-3 py-2">
        <button
          onClick={onExit}
          className="flex items-center gap-1.5 text-[13px] text-[var(--cp-text-muted)] transition-colors hover:text-[var(--cp-text-strong)]"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> {t.opsExit}
        </button>
        <span className="h-4 w-px bg-[var(--cp-border)]" />
        <span className="text-[13px] font-medium text-[var(--cp-text-strong)]">{t.opsMode}</span>
        <span className="text-[12px] text-[var(--cp-text-faint)]">{t.opsPollNote(CITY_CAPS[city].pollMinutes)}</span>
        <span className="ml-auto flex items-center gap-1.5">
          {updatedAt && (
            <span className="font-mono text-[12px] tabular-nums text-[var(--cp-text-dim)]">
              {t.updatedAt(new Date(updatedAt).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", hour12: false }))}
            </span>
          )}
          {/* 미니맵 토글 — 감시 지점의 공간 배치 파악용 */}
          <button
            onClick={toggleMap}
            aria-pressed={mapOpen}
            title={mapOpen ? t.opsMapHide : t.opsMapShow}
            aria-label={mapOpen ? t.opsMapHide : t.opsMapShow}
            className={`rounded p-1.5 transition-colors hover:bg-[var(--cp-hover)] ${
              mapOpen ? "text-[var(--cp-text-strong)]" : "text-[var(--cp-text-muted)] hover:text-[var(--cp-text-strong)]"
            }`}
          >
            <MapIcon className="h-3.5 w-3.5" />
          </button>
        </span>
      </div>

      {/* 접이식 미니맵 — 감시 지점만 마커로, 클릭 시 상세 (기존 CrowdMap 재사용, 신규 서버 0).
          감시 지점이 없으면 빈 지도 대신 비노출 — 지점을 추가하면 나타난다 */}
      {mapOpen && watchSpots.length > 0 && (
        <div className="relative h-[26dvh] min-h-[160px] shrink-0 border-b border-[var(--cp-border)]">
          <CrowdMap
            spots={watchSpots}
            lang={lang}
            selectedName={null}
            addressPin={null}
            nearestNames={[]}
            cctvItems={[]}
            onSelect={onOpenSpot}
            center={CITIES[city].center}
            zoom={CITIES[city].zoom}
          />
        </div>
      )}

      <OpsToolbar
        city={city}
        spots={spots}
        watch={watch}
        onToggle={onToggleWatch}
        onAddMany={onAddMany}
        onClear={onClearWatch}
        onExportCsv={exportCsv}
        onExportXlsx={() => void exportXlsx()}
        onCopyReport={watch.length > 0 ? copyReport : undefined}
        alertsEnabled={alertsEnabled}
        alertsPermission={alertsPermission}
        onToggleAlerts={onToggleAlerts}
        logCount={logTicks.length}
        onExportLog={onExportLog}
        onClearLog={onClearLog}
      />

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {sorted.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
            <p className="text-[14px] text-[var(--cp-text-muted)]">{t.opsEmpty}</p>
            {seedable.length > 0 && (
              <button
                onClick={() => onAddMany(seedable)}
                className="flex items-center gap-1.5 rounded-md border border-[var(--cp-border-strong)] bg-[var(--cp-panel)] px-3 py-2 text-[13px] text-[var(--cp-text)] hover:bg-[var(--cp-hover2)]"
              >
                <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                {t.opsSeedFavs(seedable.length)}
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-6">
            {sorted.map((spot) => (
              <OpsCard
                key={spot.name}
                spot={spot}
                detail={details.get(spot.name)}
                trend={trends.get(spot.name) ?? 0}
                light={light}
                onOpen={() => onOpenSpot(spot.name)}
                onRemove={() => onToggleWatch(spot.name)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
