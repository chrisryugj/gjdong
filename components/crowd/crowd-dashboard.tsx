"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import dynamic from "next/dynamic"
import { ArrowLeft, LoaderCircle, LocateFixed, MapPin, Search, Tags, X } from "lucide-react"
import { LEVEL_COLORS } from "@/lib/crowd/seoul-rtd"
import { META, UI } from "@/lib/crowd/i18n"
import { CITIES, CITY_CAPS, type CityId } from "@/lib/crowd/cities"
import CrowdMap from "@/components/crowd/crowd-map"
import CrowdHeader from "@/components/crowd/crowd-header"
import DirectionsBar from "@/components/crowd/directions-bar"
import NearestPanel from "@/components/crowd/nearest-panel"
import SpotListPanel from "@/components/crowd/spot-list-panel"
import { LangProvider, useLang } from "@/components/crowd/lang-context"
import { AutoMarquee, formatKm, haversineKm, LevelBadge, LEVEL_ORDER, type AddressPin } from "@/components/crowd/shared"
import TimeLens from "@/components/crowd/time-lens"
import { useBaseline } from "@/components/crowd/hooks/use-baseline"
import { useCrowdData } from "@/components/crowd/hooks/use-crowd-data"
import { useInstallPrompt } from "@/components/crowd/hooks/use-install-prompt"
import { useTimeLens } from "@/components/crowd/hooks/use-time-lens"
import { useOpsMode } from "@/components/crowd/hooks/use-ops-mode"
import { usePersistedPrefs } from "@/components/crowd/hooks/use-persisted-prefs"
import { useSplitPane } from "@/components/crowd/hooks/use-split-pane"
import { useSpotFilters } from "@/components/crowd/hooks/use-spot-filters"
import { useCrowdAlerts } from "@/components/crowd/hooks/use-crowd-alerts"
import { useOpsLog } from "@/components/crowd/hooks/use-ops-log"
import { useSpotSelection } from "@/components/crowd/hooks/use-spot-selection"
import { useWatchlist } from "@/components/crowd/hooks/use-watchlist"
import { useGwangjinLife } from "@/components/gwangjin/use-gwangjin-life"

// recharts가 무거워서 상세 패널은 선택 시점에 로드
const SpotDetail = dynamic(() => import("@/components/crowd/spot-detail"), {
  ssr: false,
  loading: () => (
    <div className="flex h-40 items-center justify-center">
      <LoaderCircle className="h-5 w-5 animate-spin text-[var(--cp-text-dim)]" />
    </div>
  ),
})

// 인천공항 실황 보드 — 인천에서만 쓰므로 타 도시 번들에 0바이트
const AirportBoard = dynamic(() => import("@/components/crowd/airport-board"), { ssr: false })

// 상황실 보드도 진입 시점에 로드 — 시민 모드 첫 페인트에 0바이트
const OpsBoard = dynamic(() => import("@/components/crowd/ops/ops-board"), {
  ssr: false,
  loading: () => (
    <div className="flex flex-1 items-center justify-center">
      <LoaderCircle className="h-5 w-5 animate-spin text-[var(--cp-text-dim)]" />
    </div>
  ),
})

// 광진 생활보드·레이어 토글 — /gwangjin에서만 쓰므로 타 도시 번들에 0바이트
const GwangjinLifeBoard = dynamic(() => import("@/components/gwangjin/gwangjin-life-board"), { ssr: false })
const LifeLayerChips = dynamic(() => import("@/components/gwangjin/life-layer-chips"), { ssr: false })

export default function CrowdDashboard({ fixedCity }: { fixedCity?: CityId } = {}) {
  return (
    <LangProvider>
      <CrowdDashboardInner fixedCity={fixedCity} />
    </LangProvider>
  )
}

// 주소 검색 오류는 사전 키로 저장 — 언어 전환 시에도 올바른 언어로 렌더
type AddressErrorKey = "errAddress" | "errGeoUnsupported" | "errGeoDenied"

function CrowdDashboardInner({ fixedCity }: { fixedCity?: CityId }) {
  const { lang, t, spot: trSpotName, cat } = useLang()
  // 푸터 출처 — 도시마다 원천과 갱신 주기가 달라 문구를 통째로 갈아끼운다 [본문, 링크문구]
  const FOOTER_T: Record<string, [string, string]> = {
    seoul: [t.footerData, t.footerSource],
    jeju: [t.footerDataJeju, t.footerSourceJeju],
    busan: [t.footerDataBusan, t.footerSourceBusan],
    gangwon: [t.footerDataGangwon, t.footerSourceGangwon],
    incheon: [t.footerDataIncheon, t.footerSourceIncheon],
    gwangjin: [t.footerData, t.footerSource], // 원천이 서울 RTD 동일
  }

  // 도시 참조는 여기서 만들어 데이터·선택 훅 양쪽에 주입 (훅 간 순환 의존 방지)
  const cityRef = useRef<CityId>(fixedCity ?? "seoul")
  // 알림 무장 여부도 ref 주입 — 데이터 훅(폴링)과 알림 훅(spots 소비) 사이 순환을 끊는다
  const alertsArmedRef = useRef(false)
  const selection = useSpotSelection(cityRef)
  const data = useCrowdData(cityRef, selection.silentRefresh, alertsArmedRef, fixedCity)
  const { city, spots, updatedAt, loading, error, disaster, disasterOpen } = data
  const { selectedName, detail, detailLoading, fetchDetail, selectSpot } = selection

  const prefs = usePersistedPrefs()
  const { favs, toggleFav, light, toggleTheme, labels, toggleLabels } = prefs
  const split = useSplitPane()
  const { mapH, splitDragging, mapBoxRef } = split
  const install = useInstallPrompt()
  const { opsMode, enterOps, exitOps } = useOpsMode()
  const watchlist = useWatchlist(city)
  // 행사 로그 — 상황실 켜진 동안 폴링 스냅샷 누적 (추가 API 콜 0)
  const opsLog = useOpsLog(city, opsMode, watchlist.names, spots, updatedAt)
  const alerts = useCrowdAlerts({ spots, watch: watchlist.names, onOpen: selection.selectSpot })
  alertsArmedRef.current = alerts.enabled && watchlist.names.length > 0

  const [query, setQuery] = useState("")
  const [addressPin, setAddressPin] = useState<AddressPin | null>(null)
  const [addressLoading, setAddressLoading] = useState(false)
  const [addressError, setAddressError] = useState<AddressErrorKey | null>(null)
  const [geoLoading, setGeoLoading] = useState(false)

  const filters = useSpotFilters({ spots, favs, query, trSpotName, lang })
  const { mapSpots, filtered, levelCounts } = filters

  // 시간대 패턴 렌즈 — 켜진 동안 지도 마커만 평균 패턴 색으로, 목록·헤더는 실시간 유지
  const timeLens = useTimeLens(city, mapSpots)
  // 광진 생활 데이터(따릉이·EV·쉼터·역·응급실 POI + 생활보드) — 광진에서만 페치
  const life = useGwangjinLife(city === "gwangjin")
  // 지금 vs 평소 — 누적 히트맵 대비 상대 배지 (서울·제주, 파일 1회 로드)
  const baseline = useBaseline(city, spots)
  // 목록 hover ↔ 지도 마커 연동 (PC) — 상세로 들어가면 잔상이 남지 않게 해제
  const [hoverName, setHoverName] = useState<string | null>(null)
  useEffect(() => setHoverName(null), [selectedName])

  // PC 키보드 — Esc로 상세·주소핀 닫기 (입력창 포커스 중엔 브라우저 기본 동작 유지)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return
      const tag = (e.target as HTMLElement | null)?.tagName
      if (tag === "INPUT" || tag === "TEXTAREA") return
      if (selectedName) selectSpot(null)
      else if (addressPin) setAddressPin(null)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [selectedName, addressPin, selectSpot])

  // 도시·언어 전환 시 브라우저 탭 제목 동기화 (클라이언트 전환은 generateMetadata가 다시 안 돌므로)
  useEffect(() => {
    if (!city) return
    const base = META[lang].title
    document.title =
      city === "seoul" ? base : base.replaceAll(UI[lang].cityNames.seoul, UI[lang].cityNames[city])
  }, [city, lang])

  // 도시 전환 — 목록·선택·검색·필터 전부 초기화 후 새 도시 로드 (URL은 ?city=로 공유 가능)
  const changeCity = useCallback(
    (next: CityId) => {
      if (next === cityRef.current) return
      cityRef.current = next
      selection.reset()
      setAddressPin(null)
      setQuery("")
      setAddressError(null)
      filters.clearFilters()
      data.resetForCity(next)
    },
    [selection, filters, data],
  )

  const searchAddress = useCallback(async () => {
    const address = query.trim()
    if (!address) return
    setAddressLoading(true)
    setAddressError(null)
    try {
      const res = await fetch("/api/resolve-address", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address }),
      })
      if (!res.ok) throw new Error("bad status")
      const data = await res.json()
      if (data?.fallback || !data?.meta?.lat) throw new Error("not found")
      selection.setSelectedName(null)
      selection.setDetail(null)
      setAddressPin({ label: data.display ?? address, lat: data.meta.lat, lng: data.meta.lon })
    } catch {
      setAddressError("errAddress")
    } finally {
      setAddressLoading(false)
    }
  }, [query, selection])

  // 내 위치 기반 근처 명소 추천 — 주소 검색과 같은 nearest 흐름 재사용
  const locateMe = useCallback(() => {
    if (!navigator.geolocation) {
      setAddressError("errGeoUnsupported")
      return
    }
    setGeoLoading(true)
    setAddressError(null)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGeoLoading(false)
        setQuery("")
        selectSpot(null)
        setAddressPin({ label: t.myLocation, lat: pos.coords.latitude, lng: pos.coords.longitude })
      },
      () => {
        setGeoLoading(false)
        setAddressError("errGeoDenied")
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
    )
  }, [selectSpot, t])

  const nearest = useMemo(() => {
    if (!addressPin) return []
    return spots
      .map((s) => ({ spot: s, km: haversineKm(addressPin.lat, addressPin.lng, s.lat, s.lng) }))
      .sort((a, b) => a.km - b.km)
      .slice(0, 8)
  }, [spots, addressPin])

  // 가까우면서 여유·보통인 첫 곳 = 지금 갈 만한 추천
  const recommendedName = useMemo(
    () => nearest.find((n) => n.spot.levelNum > 0 && n.spot.levelNum <= 2)?.spot.name ?? null,
    [nearest],
  )

  // 선택한 명소 주변의 다른 명소 — "이 근처는 어때?" 탐색용
  const nearbyOfSelected = useMemo(() => {
    if (!selectedName) return []
    const cur = spots.find((s) => s.name === selectedName)
    if (!cur) return []
    return spots
      .filter((s) => s.name !== selectedName)
      .map((s) => ({ spot: s, km: haversineKm(cur.lat, cur.lng, s.lat, s.lng) }))
      .sort((a, b) => a.km - b.km)
      .slice(0, 5)
  }, [spots, selectedName])

  const noSpotMatch = query.trim().length > 1 && filtered.length === 0

  const selectedSpot = useMemo(
    () => (selectedName ? (spots.find((s) => s.name === selectedName) ?? null) : null),
    [spots, selectedName],
  )

  return (
    <div className={`crowd-page ${light ? "crowd-light" : ""} flex h-dvh flex-col bg-[var(--cp-bg)] text-[var(--cp-text)]`}>
      <CrowdHeader
        city={city ?? "seoul"}
        spotCount={spots.length}
        levelCounts={levelCounts}
        updatedAt={updatedAt}
        light={light}
        disaster={disaster}
        disasterOpen={disasterOpen}
        onCityChange={changeCity}
        onRefresh={() => void data.loadSpots()}
        onToggleTheme={toggleTheme}
        onToggleDisaster={() => data.setDisasterOpen((v) => !v)}
        onEnterOps={() => {
          selection.reset()
          enterOps()
        }}
        lockCity={fixedCity != null}
      />

      {/* ── 상황실 모드: 본문(지도+패널)을 통째로 카드 보드로 교체. 카드 클릭은 기존 상세로 */}
      {opsMode && !selectedName ? (
        <OpsBoard
          city={city ?? "seoul"}
          spots={spots}
          updatedAt={updatedAt}
          watch={watchlist.names}
          favs={favs}
          light={light}
          disaster={disaster}
          alertsEnabled={alerts.enabled}
          alertsPermission={alerts.permission}
          onToggleAlerts={alerts.toggle}
          onToggleWatch={watchlist.toggle}
          onAddMany={watchlist.addMany}
          onClearWatch={watchlist.clear}
          onOpenSpot={selectSpot}
          onExit={exitOps}
          logTicks={opsLog.ticks}
          onExportLog={opsLog.exportCsv}
          onClearLog={opsLog.clear}
        />
      ) : (
      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        {/* 모바일: 지도는 컴팩트하게, 목록에 공간을 양보 (상세/근처 목록이 열리면 더 축소).
            핸들로 조절했으면(--crowd-map-h) 그 높이가 자동 전환보다 우선 */}
        <div
          ref={mapBoxRef}
          style={mapH != null ? ({ "--crowd-map-h": `${mapH}px` } as React.CSSProperties) : undefined}
          className={`relative shrink-0 md:h-auto md:flex-1 ${splitDragging ? "" : "transition-[height] duration-300"} ${
            selectedName || addressPin ? "h-[var(--crowd-map-h,24dvh)]" : "h-[var(--crowd-map-h,32dvh)]"
          }`}
        >
          <CrowdMap
            spots={timeLens.lensSpots ?? mapSpots}
            lang={lang}
            selectedName={selectedName}
            addressPin={addressPin}
            nearestNames={nearest.map((n) => n.spot.name)}
            cctvItems={selectedName ? (detail?.cctv ?? []) : []}
            onSelect={selectSpot}
            center={CITIES[city ?? "seoul"].center}
            zoom={CITIES[city ?? "seoul"].zoom}
            fitCity={city}
            hoveredName={hoverName}
            showLabels={labels}
            declutterLabels
            lifePois={city === "gwangjin" ? life.pois : undefined}
          />
          {/* 지도 우상단 컨트롤 스택 — 이름표 토글(전 도시) + 시간대 렌즈(서울·제주, 상세 중 숨김) */}
          <div className="absolute right-2 top-2 z-[1000] flex flex-col items-end gap-1.5">
            <button
              onClick={toggleLabels}
              aria-pressed={labels}
              title={t.labelsToggle}
              className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12px] backdrop-blur-sm transition-colors ${
                labels
                  ? "border-[var(--cp-border-active)] bg-[var(--cp-overlay)] font-medium text-[var(--cp-text-strong)]"
                  : "border-[var(--cp-border)] bg-[var(--cp-overlay)] text-[var(--cp-text-muted)] hover:border-[var(--cp-border-strong)] hover:text-[var(--cp-text)]"
              }`}
            >
              <Tags className="h-3.5 w-3.5" />
              {t.labelsToggle}
            </button>
            {timeLens.available && !selectedName && (
              <TimeLens lens={timeLens.lens} loading={timeLens.loading} onChange={timeLens.setLens} />
            )}
          </div>
          {/* 광진 생활 레이어 칩 — 좌상단 가로 스크롤 바 (우측 세로 스택과 분리, 모바일 지도 시야 확보) */}
          {city === "gwangjin" && !selectedName && (
            <div className="absolute left-2 right-24 top-2 z-[1000]">
              <LifeLayerChips layers={life.layers} counts={life.counts} onToggle={life.toggleLayer} />
            </div>
          )}
          {/* 모바일 전용 범례 (헤더 통계는 md 이상에서만 보이므로) */}
          <div className="absolute bottom-2 left-2 z-[1000] flex items-center gap-2 rounded-full border border-[var(--cp-border)] bg-[var(--cp-overlay)] px-2.5 py-1 backdrop-blur-sm md:hidden">
            {LEVEL_ORDER.map((level) => (
              <span key={level} className="flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: LEVEL_COLORS[level] }} />
                <span className="font-mono text-[11px] tabular-nums text-[var(--cp-text)]">
                  {levelCounts[level] ?? 0}
                </span>
              </span>
            ))}
          </div>
          {loading && (
            <div className="absolute inset-0 z-[1050] flex items-center justify-center bg-[var(--cp-overlay)]">
              <LoaderCircle className="h-6 w-6 animate-spin text-[var(--cp-text-muted)]" />
            </div>
          )}
        </div>

        {/* PC는 패널을 좌측에 (모바일은 지도 위, 패널 아래 유지) */}
        <aside className="flex min-h-0 flex-1 flex-col border-t border-[var(--cp-border)] md:order-first md:w-[440px] md:flex-none md:border-r md:border-t-0 xl:w-[500px]">
          {/* 모바일 분할 핸들 — 드래그로 지도/목록 비율 조절 */}
          <div
            role="separator"
            aria-orientation="horizontal"
            aria-label={t.resizePanel}
            title={t.resizePanel}
            onPointerDown={split.onSplitDown}
            onPointerMove={split.onSplitMove}
            onPointerUp={split.onSplitUp}
            onPointerCancel={split.onSplitUp}
            onDoubleClick={split.resetSplit}
            className="flex h-5 shrink-0 cursor-row-resize touch-none items-center justify-center md:hidden"
          >
            <span className="h-1 w-9 rounded-full bg-[var(--cp-border-strong)]" />
          </div>
          {/* 검색 + 내 위치 */}
          <div className="shrink-0 border-b border-[var(--cp-border)] p-2.5 md:p-3">
            <div className="flex items-center gap-2">
              <div className="flex min-w-0 flex-1 items-center gap-2 rounded-md border border-[var(--cp-border-strong)] bg-[var(--cp-panel)] px-3 focus-within:border-[var(--cp-border-active)]">
                <Search className="h-3.5 w-3.5 shrink-0 text-[var(--cp-text-dim)]" />
                <input
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value)
                    setAddressError(null)
                    // 상세/주소 결과를 보는 중에도 새로 검색하면 목록으로 복귀
                    if (selectedName) selectSpot(null)
                    if (addressPin) setAddressPin(null)
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && noSpotMatch) void searchAddress()
                  }}
                  placeholder={t.searchPlaceholder}
                  className="h-9 w-full bg-transparent text-[16px] text-[var(--cp-text)] placeholder:text-[13px] placeholder:text-[var(--cp-text-faint)] focus:outline-none md:text-[14px]"
                />
                {query && (
                  <button
                    onClick={() => {
                      setQuery("")
                      setAddressError(null)
                    }}
                    className="text-[var(--cp-text-dim)] hover:text-[var(--cp-text-strong)]"
                    aria-label={t.clearInput}
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
              <button
                onClick={locateMe}
                disabled={geoLoading}
                className="flex h-9 shrink-0 items-center gap-1.5 rounded-md border border-[var(--cp-border-strong)] bg-[var(--cp-panel)] px-2.5 text-[13px] text-[var(--cp-text)] transition-colors hover:bg-[var(--cp-hover2)] disabled:opacity-50"
                title={t.myNearbyTitle}
              >
                {geoLoading ? (
                  <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <LocateFixed className="h-3.5 w-3.5" />
                )}
                {t.myNearby}
              </button>
            </div>

            {query.trim().length > 1 && !addressPin && (
              <button
                onClick={() => void searchAddress()}
                disabled={addressLoading}
                className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-md border border-[var(--cp-border-strong)] bg-[var(--cp-panel2)] py-2 text-[13px] text-[var(--cp-text)] transition-colors hover:bg-[var(--cp-hover2)] disabled:opacity-50"
              >
                {addressLoading ? (
                  <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <MapPin className="h-3.5 w-3.5" />
                )}
                {noSpotMatch ? t.searchAsAddress : t.searchNearQuery(query.trim())}
              </button>
            )}
            {addressError && (
              <p className={`mt-2 text-[12px] ${light ? "text-red-600" : "text-red-400"}`}>{t[addressError]}</p>
            )}
          </div>

          {/* 패널 내용 */}
          {selectedName ? (
            <div className="flex min-h-0 flex-1 flex-col">
              <button
                onClick={() => selectSpot(null)}
                className="flex shrink-0 items-center gap-1.5 border-b border-[var(--cp-border)] px-4 py-2.5 text-[13px] text-[var(--cp-text-muted)] transition-colors hover:text-[var(--cp-text-strong)]"
              >
                <ArrowLeft className="h-3.5 w-3.5" /> {t.backToList}
              </button>
              <div className="min-h-0 flex-1 overflow-y-auto">
                {detailLoading ? (
                  <div className="flex h-40 items-center justify-center">
                    <LoaderCircle className="h-5 w-5 animate-spin text-[var(--cp-text-dim)]" />
                  </div>
                ) : detail ? (
                  <>
                    <SpotDetail
                      detail={detail}
                      light={light}
                      origin={selectedSpot ? { lat: selectedSpot.lat, lng: selectedSpot.lng } : undefined}
                      isFav={favs.has(detail.name)}
                      onToggleFav={() => toggleFav(detail.name)}
                      baselineNow={baseline?.[detail.name] ?? null}
                    />
                    {nearbyOfSelected.length > 0 && (
                      <div className="border-t border-[var(--cp-border)] px-4 pb-4 pt-3">
                        <h3 className="mb-1 text-[12px] font-medium uppercase tracking-wider text-[var(--cp-text-dim)]">
                          {t.nearbyOther}
                        </h3>
                        <ul>
                          {nearbyOfSelected.map(({ spot, km }) => (
                            <li key={spot.name}>
                              <button
                                onClick={() => selectSpot(spot.name)}
                                className="group flex w-full items-center gap-2.5 border-b border-[var(--cp-border-faint)] py-2 text-left transition-colors last:border-b-0 hover:bg-[var(--cp-hover)]"
                              >
                                <div className="min-w-0 flex-1">
                                  <p className="truncate text-[14px] text-[var(--cp-text)] group-hover:text-[var(--cp-text-strong)]">
                                    {trSpotName(spot.name)}
                                  </p>
                                  <p className="text-[12px] text-[var(--cp-text-dim)]">
                                    {cat(spot.category)} · <span className="font-mono tabular-nums">{formatKm(km)}</span>
                                  </p>
                                </div>
                                <LevelBadge level={spot.level} color={spot.color} light={light} />
                              </button>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="p-6 text-center">
                    <p className="text-[13px] text-[var(--cp-text-dim)]">{t.detailFail}</p>
                    <button
                      onClick={() => selectedName && fetchDetail(selectedName)}
                      className="mt-2 rounded-md border border-[var(--cp-border-strong)] px-3 py-1.5 text-[13px] text-[var(--cp-text)] transition-colors hover:bg-[var(--cp-hover2)]"
                    >
                      {t.retry}
                    </button>
                  </div>
                )}
              </div>
              {selectedSpot && <DirectionsBar spot={selectedSpot} />}
            </div>
          ) : addressPin ? (
            <NearestPanel
              addressPin={addressPin}
              nearest={nearest}
              recommendedName={recommendedName}
              light={light}
              onClear={() => setAddressPin(null)}
              onSelect={selectSpot}
            />
          ) : (
            <SpotListPanel
              filtered={filtered}
              allSpots={spots}
              showPresets={CITY_CAPS[city ?? "seoul"].presets}
              categories={filters.categories}
              categoryFilter={filters.categoryFilter}
              levelFilter={filters.levelFilter}
              levelCounts={levelCounts}
              sort={filters.sort}
              preset={filters.preset}
              favs={favs}
              favOnly={filters.favOnly}
              light={light}
              loading={loading}
              error={error}
              baseline={baseline}
              originDown={error && city === "jeju"}
              noSpotMatch={noSpotMatch}
              onApplyPreset={filters.applyPreset}
              onToggleFavOnly={() => filters.setFavOnly((v) => !v)}
              onToggleLevel={filters.toggleLevel}
              onToggleCategory={filters.toggleCategory}
              onClearFilters={filters.clearFilters}
              onSort={filters.setSort}
              onSelect={selectSpot}
              onHover={setHoverName}
              onToggleFav={toggleFav}
              onRetry={() => {
                data.setLoading(true)
                void data.loadSpots()
              }}
              extra={
                city === "incheon" ? (
                  <AirportBoard light={light} updatedAt={updatedAt} />
                ) : city === "gwangjin" ? (
                  <GwangjinLifeBoard
                    live={life.live}
                    care={life.care}
                    events={life.daily?.events ?? null}
                    dailyLoaded={life.daily !== null}
                  />
                ) : undefined
              }
            />
          )}

          {install.showInstall && (
            <div className="flex shrink-0 items-center gap-2 border-t border-[var(--cp-border)] bg-[var(--cp-panel)] px-3 py-2 md:hidden">
              <p className="min-w-0 flex-1 text-[12px] leading-snug text-[var(--cp-text-muted)]">
                {install.showInstall === "ios" ? t.installIos : t.installAndroid}
              </p>
              {install.showInstall === "android" && (
                <button
                  onClick={() => {
                    void install.installPrompt?.prompt()
                    install.dismissInstall()
                  }}
                  className="shrink-0 rounded-md border border-[var(--cp-border-strong)] px-2.5 py-1 text-[12px] font-medium text-[var(--cp-text-strong)] transition-colors hover:bg-[var(--cp-hover2)]"
                >
                  {t.install}
                </button>
              )}
              <button
                onClick={install.dismissInstall}
                aria-label={t.installDismiss}
                className="shrink-0 p-1 text-[var(--cp-text-dim)] hover:text-[var(--cp-text-strong)]"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
          <footer className="flex shrink-0 items-center gap-2 border-t border-[var(--cp-border)] px-4 py-1.5 pb-[max(0.375rem,env(safe-area-inset-bottom))] md:py-2 md:pb-[max(0.5rem,env(safe-area-inset-bottom))]">
            {/* 출처가 길어 잘리면 자동으로 좌우 왕복 스크롤 (폭이 충분하면 정지) */}
            <AutoMarquee className="flex-1 text-[11px] leading-relaxed text-[var(--cp-text-faint)]">
              {FOOTER_T[city ?? "seoul"]?.[0] ?? t.footerData}
              <a
                href={CITIES[city ?? "seoul"].sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="underline hover:text-[var(--cp-text-muted)]"
              >
                {FOOTER_T[city ?? "seoul"]?.[1] ?? t.footerSource}
              </a>
              {/* 등급 산출식 공개 문서 — "이 붐빔이 어떻게 계산됐나"의 답 */}
              {" · "}
              <a
                href="https://github.com/chrisryugj/gjdong/blob/main/docs/crowd-methodology.md"
                target="_blank"
                rel="noopener noreferrer"
                className="underline hover:text-[var(--cp-text-muted)]"
              >
                {t.methodologyLink}
              </a>
            </AutoMarquee>
            {/* 인파레이더 전용 카운터 — 루트(/)와 별도 키로 집계 */}
            <a
              href="https://hitscounter.dev/history?url=https://gjdong.vercel.app/crowd"
              target="_blank"
              rel="noopener noreferrer"
              aria-label={t.visitStats}
              className="inline-flex shrink-0 items-center hover:opacity-80"
            >
              <img
                src="https://hitscounter.dev/api/hit?url=https%3A%2F%2Fgjdong.vercel.app%2Fcrowd&label=visits&icon=people-fill&color=%23adb5bd&message=&style=flat&tz=Asia%2FSeoul"
                alt="visits"
                className="h-4"
              />
            </a>
          </footer>
        </aside>
      </div>
      )}

      {/* 붐빔 전환 인앱 토스트 — OS 알림 미지원(iOS Safari)·백그라운드 복귀 시 안전망 */}
      {alerts.toast && (
        <div className="pointer-events-none fixed bottom-4 left-1/2 z-[2000] -translate-x-1/2">
          <div className="rounded-md border border-[#ff3939]/50 bg-[var(--cp-tip-bg)] px-4 py-2 text-[13px] font-medium text-[var(--cp-text-strong)] shadow-lg">
            {alerts.toast}
          </div>
        </div>
      )}
    </div>
  )
}
