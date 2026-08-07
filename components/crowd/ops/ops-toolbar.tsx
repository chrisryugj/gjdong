"use client"

import { useCallback, useMemo, useRef, useState } from "react"
import { Bell, BellOff, Check, ClipboardList, Download, History, Link2, Maximize, Minimize, Plus, Printer, X } from "lucide-react"
import type { CrowdSpot } from "@/lib/crowd/seoul-rtd"
import { CITY_CAPS, type CityId } from "@/lib/crowd/cities"
import { districtOf, listDistricts } from "@/lib/crowd/districts"
import { serializeSpotsParam, WATCH_MAX } from "@/lib/crowd/watchlist"
import { useLang } from "@/components/crowd/lang-context"
import { trDistrict } from "@/lib/crowd/i18n"

/** 상황실 툴바 — 지점 추가(typeahead)·자치구 일괄 추가·링크 공유·전체화면 */
export default function OpsToolbar({
  city,
  spots,
  watch,
  onToggle,
  onAddMany,
  onClear,
  onExportCsv,
  onCopyReport,
  alertsEnabled,
  alertsPermission,
  onToggleAlerts,
  logCount,
  onExportLog,
  onClearLog,
}: {
  city: CityId
  spots: CrowdSpot[]
  watch: string[]
  onToggle: (name: string) => void
  onAddMany: (names: string[]) => void
  onClear: () => void
  onExportCsv: () => void
  /** 감시 지점이 없으면 undefined — 버튼 비노출 */
  onCopyReport?: () => Promise<void>
  alertsEnabled: boolean
  alertsPermission: "default" | "granted" | "denied" | "unsupported"
  onToggleAlerts: () => Promise<void>
  /** 행사 로그 누적 틱 수 — 0이면 내보내기 버튼 비노출 */
  logCount: number
  onExportLog: () => void
  onClearLog: () => void
}) {
  const { lang, t, spot: trSpotName } = useLang()
  const [query, setQuery] = useState("")
  const [district, setDistrict] = useState("")
  const [copied, setCopied] = useState(false)
  const [reportCopied, setReportCopied] = useState(false)
  const [isFull, setIsFull] = useState(false)
  const [maxHit, setMaxHit] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const districts = useMemo(
    () => (CITY_CAPS[city].districts ? listDistricts(city, spots.map((s) => s.name)) : []),
    [city, spots],
  )

  // typeahead 후보 — 구 필터 반영, 이미 감시 중인 지점 제외, 최대 8곳
  const suggestions = useMemo(() => {
    const q = query.trim().toLowerCase()
    return spots
      .filter((s) => !watch.includes(s.name))
      .filter((s) => !district || districtOf(city, s.name) === district)
      .filter((s) => !q || s.name.toLowerCase().includes(q) || trSpotName(s.name).toLowerCase().includes(q))
      .slice(0, 8)
  }, [spots, watch, district, query, city, trSpotName])

  const guard = useCallback(
    (count: number) => {
      if (watch.length + count > WATCH_MAX) {
        setMaxHit(true)
        setTimeout(() => setMaxHit(false), 2500)
        return false
      }
      return true
    },
    [watch.length],
  )

  const addOne = (name: string) => {
    if (!guard(1)) return
    onToggle(name)
    setQuery("")
    inputRef.current?.focus()
  }

  const addDistrict = () => {
    if (!district) return
    const targets = spots.map((s) => s.name).filter((n) => districtOf(city, n) === district && !watch.includes(n))
    if (targets.length === 0) return
    if (!guard(Math.min(targets.length, WATCH_MAX - watch.length))) {
      // 상한 초과분은 잘라서라도 담는다 — 관할 구성이 목적이므로
      onAddMany(targets)
      return
    }
    onAddMany(targets)
  }

  const copyLink = () => {
    const params = new URLSearchParams(window.location.search)
    params.set("mode", "ops")
    if (watch.length > 0) params.set("spots", serializeSpotsParam(watch))
    else params.delete("spots")
    const url = `${window.location.origin}${window.location.pathname}?${params.toString()}`
    void navigator.clipboard?.writeText(url).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  const toggleFullscreen = () => {
    if (document.fullscreenElement) {
      void document.exitFullscreen()
      setIsFull(false)
    } else {
      void document.documentElement.requestFullscreen?.()
      setIsFull(true)
    }
  }

  return (
    <div className="shrink-0 border-b border-[var(--cp-border)] px-3 py-2">
      <div className="flex flex-wrap items-center gap-2">
        {/* 지점 추가 typeahead */}
        <div className="relative min-w-0 flex-1 basis-52">
          <div className="flex items-center gap-1.5 rounded-md border border-[var(--cp-border-strong)] bg-[var(--cp-panel)] px-2.5 focus-within:border-[var(--cp-border-active)]">
            <Plus className="h-3.5 w-3.5 shrink-0 text-[var(--cp-text-dim)]" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t.opsAddPlaceholder}
              className="h-8 w-full bg-transparent text-[13px] text-[var(--cp-text)] placeholder:text-[var(--cp-text-faint)] focus:outline-none"
            />
            {query && (
              <button onClick={() => setQuery("")} aria-label={t.clearInput} className="text-[var(--cp-text-dim)]">
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
          {query.trim() && suggestions.length > 0 && (
            /* 배경은 불투명 --cp-tip-bg — --cp-panel(3% 틴트)을 쓰면 뒤 버튼이 비쳐 보인다 (모바일 실측) */
            <ul className="absolute left-0 right-0 top-9 z-[1200] overflow-hidden rounded-md border border-[var(--cp-border-strong)] bg-[var(--cp-tip-bg)] shadow-lg">
              {suggestions.map((s) => (
                <li key={s.name}>
                  <button
                    onClick={() => addOne(s.name)}
                    className="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-[13px] text-[var(--cp-text)] hover:bg-[var(--cp-hover2)]"
                  >
                    <span className="truncate">{trSpotName(s.name)}</span>
                    <span className="shrink-0 text-[11px]" style={{ color: s.color }}>
                      ●
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* 자치구 필터 + 일괄 추가 */}
        {districts.length > 1 && (
          <>
            <select
              value={district}
              onChange={(e) => setDistrict(e.target.value)}
              aria-label={t.districtAll}
              className="h-8 rounded-md border border-[var(--cp-border-strong)] bg-[var(--cp-panel)] px-2 text-[13px] text-[var(--cp-text)]"
            >
              <option value="">{t.districtAll}</option>
              {districts.map((d) => (
                <option key={d} value={d}>
                  {trDistrict(d, lang)}
                </option>
              ))}
            </select>
            {district && (
              <button
                onClick={addDistrict}
                className="h-8 whitespace-nowrap rounded-md border border-[var(--cp-border-strong)] bg-[var(--cp-panel)] px-2.5 text-[13px] text-[var(--cp-text)] hover:bg-[var(--cp-hover2)]"
              >
                {t.districtAddAll(trDistrict(district, lang))}
              </button>
            )}
          </>
        )}

        <span className="font-mono text-[12px] tabular-nums text-[var(--cp-text-dim)]">
          {t.opsWatchCount(watch.length, WATCH_MAX)}
        </span>
        {watch.length > 0 && (
          <button onClick={onClear} className="text-[12px] text-[var(--cp-text-dim)] underline underline-offset-2 hover:text-[var(--cp-text-strong)]">
            {t.opsClear}
          </button>
        )}

        <span className="flex-1" />

        {/* 붐빔 전환 알림 — 권한 요청은 이 클릭에서만. 폴링 편승이라 "약 5분 주기 감시" 명시 */}
        <button
          onClick={() => void onToggleAlerts()}
          disabled={alertsPermission === "denied"}
          title={
            alertsPermission === "denied"
              ? t.alertDenied
              : alertsPermission === "unsupported"
                ? t.alertUnsupported
                : t.alertNote
          }
          aria-pressed={alertsEnabled}
          className={`flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-[13px] transition-colors disabled:opacity-40 ${
            alertsEnabled
              ? "border-[#ff3939]/60 bg-[#ff3939]/10 font-medium text-[var(--cp-text-strong)]"
              : "border-[var(--cp-border-strong)] bg-[var(--cp-panel)] text-[var(--cp-text)] hover:bg-[var(--cp-hover2)]"
          }`}
        >
          {alertsEnabled ? <Bell className="h-3.5 w-3.5 text-[#ff3939]" /> : <BellOff className="h-3.5 w-3.5" />}
          {alertsEnabled ? t.alertsOn : t.alertsOff}
        </button>

        {/* 기록·증빙 — CSV(전 지점)·상황보고 문안(감시 지점, 한국어 고정) */}
        <button
          onClick={onExportCsv}
          className="flex h-8 items-center gap-1.5 rounded-md border border-[var(--cp-border-strong)] bg-[var(--cp-panel)] px-2.5 text-[13px] text-[var(--cp-text)] hover:bg-[var(--cp-hover2)]"
        >
          <Download className="h-3.5 w-3.5" /> {t.opsExportCsv}
        </button>
        {onCopyReport && (
          <button
            onClick={() => {
              void onCopyReport().then(() => {
                setReportCopied(true)
                setTimeout(() => setReportCopied(false), 2000)
              })
            }}
            className="flex h-8 items-center gap-1.5 rounded-md border border-[var(--cp-border-strong)] bg-[var(--cp-panel)] px-2.5 text-[13px] text-[var(--cp-text)] hover:bg-[var(--cp-hover2)]"
          >
            {reportCopied ? <Check className="h-3.5 w-3.5 text-[#00d369]" /> : <ClipboardList className="h-3.5 w-3.5" />}
            {reportCopied ? t.opsShareCopied : t.opsCopyReport}
          </button>
        )}
        {/* 행사 로그 — 상황실 켜진 동안 쌓인 시간축 기록. 지우기는 title 길게 노출 대신 우클릭 아닌 별도 x */}
        {logCount > 0 && (
          <span className="flex h-8 items-center overflow-hidden rounded-md border border-[var(--cp-border-strong)] bg-[var(--cp-panel)]">
            <button
              onClick={onExportLog}
              title={t.opsLogNote}
              className="flex h-full items-center gap-1.5 px-2.5 text-[13px] text-[var(--cp-text)] hover:bg-[var(--cp-hover2)]"
            >
              <History className="h-3.5 w-3.5" /> {t.opsLogExport(logCount)}
            </button>
            <button
              onClick={onClearLog}
              title={t.opsLogClear}
              aria-label={t.opsLogClear}
              className="flex h-full items-center border-l border-[var(--cp-border)] px-1.5 text-[var(--cp-text-dim)] hover:bg-[var(--cp-hover2)] hover:text-[var(--cp-text-strong)]"
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        )}
        {/* 인쇄용 상황보고서 — 새 탭에서 A4 문서로 (감시 지점 있으면 그 지점만, 없으면 전 지점) */}
        <a
          href={`/crowd/report?city=${city}${watch.length > 0 ? `&spots=${serializeSpotsParam(watch)}` : ""}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex h-8 items-center gap-1.5 rounded-md border border-[var(--cp-border-strong)] bg-[var(--cp-panel)] px-2.5 text-[13px] text-[var(--cp-text)] hover:bg-[var(--cp-hover2)]"
        >
          <Printer className="h-3.5 w-3.5" /> {t.opsPrintReport}
        </a>
        <button
          onClick={copyLink}
          className="flex h-8 items-center gap-1.5 rounded-md border border-[var(--cp-border-strong)] bg-[var(--cp-panel)] px-2.5 text-[13px] text-[var(--cp-text)] hover:bg-[var(--cp-hover2)]"
        >
          {copied ? <Check className="h-3.5 w-3.5 text-[#00d369]" /> : <Link2 className="h-3.5 w-3.5" />}
          {copied ? t.opsShareCopied : t.opsShareLink}
        </button>
        <button
          onClick={toggleFullscreen}
          title={isFull ? t.opsFullscreenExit : t.opsFullscreen}
          aria-label={isFull ? t.opsFullscreenExit : t.opsFullscreen}
          className="flex h-8 items-center rounded-md border border-[var(--cp-border-strong)] bg-[var(--cp-panel)] px-2 text-[var(--cp-text)] hover:bg-[var(--cp-hover2)]"
        >
          {isFull ? <Minimize className="h-3.5 w-3.5" /> : <Maximize className="h-3.5 w-3.5" />}
        </button>
      </div>
      {maxHit && <p className="mt-1.5 text-[12px] text-amber-500">{t.opsMaxSpots(WATCH_MAX)}</p>}
    </div>
  )
}
