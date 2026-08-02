"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import dynamic from "next/dynamic"
import { ArrowLeft, LoaderCircle, LocateFixed, MapPin, Navigation, Search, X } from "lucide-react"
import { LEVEL_COLORS, type CrowdDetail, type CrowdDisaster, type CrowdSpot } from "@/lib/crowd/seoul-rtd"
import CrowdMap from "@/components/crowd/crowd-map"
import CrowdHeader from "@/components/crowd/crowd-header"
import NearestPanel from "@/components/crowd/nearest-panel"
import SpotListPanel from "@/components/crowd/spot-list-panel"
import {
  formatKm,
  haversineKm,
  LevelBadge,
  LEVEL_ORDER,
  PRESETS,
  type AddressPin,
  type PresetKey,
  type SortMode,
} from "@/components/crowd/shared"

// recharts가 무거워서 상세 패널은 선택 시점에 로드
const SpotDetail = dynamic(() => import("@/components/crowd/spot-detail"), {
  ssr: false,
  loading: () => (
    <div className="flex h-40 items-center justify-center">
      <LoaderCircle className="h-5 w-5 animate-spin text-[var(--cp-text-dim)]" />
    </div>
  ),
})

export default function CrowdDashboard() {
  const [spots, setSpots] = useState<CrowdSpot[]>([])
  const [updatedAt, setUpdatedAt] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [disaster, setDisaster] = useState<CrowdDisaster[]>([])
  const [disasterOpen, setDisasterOpen] = useState(false)

  const [selectedName, setSelectedName] = useState<string | null>(null)
  const [detail, setDetail] = useState<CrowdDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)

  const [query, setQuery] = useState("")
  const [categoryFilter, setCategoryFilter] = useState<Set<string>>(new Set())
  const [levelFilter, setLevelFilter] = useState<Set<string>>(new Set())
  const [sort, setSort] = useState<SortMode>("busy")
  const [preset, setPreset] = useState<PresetKey | null>(null)
  const [favs, setFavs] = useState<Set<string>>(new Set())
  const [favOnly, setFavOnly] = useState(false)

  const [addressPin, setAddressPin] = useState<AddressPin | null>(null)
  const [addressLoading, setAddressLoading] = useState(false)
  const [addressError, setAddressError] = useState<string | null>(null)
  const [geoLoading, setGeoLoading] = useState(false)

  const [light, setLight] = useState(true)

  const [installPrompt, setInstallPrompt] = useState<(Event & { prompt: () => Promise<void> }) | null>(null)
  const [showInstall, setShowInstall] = useState<false | "android" | "ios">(false)

  const detailAbortRef = useRef<AbortController | null>(null)
  const selectedNameRef = useRef<string | null>(null)

  // PWA: 서비스워커 등록 + 홈 화면 설치 배너 (모바일, 미설치, 미해제 시)
  useEffect(() => {
    if ("serviceWorker" in navigator) void navigator.serviceWorker.register("/crowd-sw.js").catch(() => {})
    const nav = navigator as Navigator & { standalone?: boolean }
    const standalone = window.matchMedia("(display-mode: standalone)").matches || nav.standalone
    if (standalone || localStorage.getItem("crowdPwaDismissed")) return
    const onPrompt = (e: Event) => {
      e.preventDefault()
      setInstallPrompt(e as Event & { prompt: () => Promise<void> })
      setShowInstall("android")
    }
    window.addEventListener("beforeinstallprompt", onPrompt)
    if (/iphone|ipad|ipod/i.test(navigator.userAgent)) setShowInstall("ios")
    return () => window.removeEventListener("beforeinstallprompt", onPrompt)
  }, [])

  const dismissInstall = useCallback(() => {
    setShowInstall(false)
    localStorage.setItem("crowdPwaDismissed", "1")
  }, [])

  useEffect(() => {
    if (localStorage.getItem("crowdTheme") === "dark") setLight(false)
    try {
      const stored = JSON.parse(localStorage.getItem("crowdFavs") ?? "[]") as string[]
      if (Array.isArray(stored)) setFavs(new Set(stored))
    } catch {
      // 손상된 저장값은 무시
    }
  }, [])

  const toggleFav = useCallback((name: string) => {
    setFavs((prev) => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      localStorage.setItem("crowdFavs", JSON.stringify(Array.from(next)))
      return next
    })
  }, [])

  const toggleTheme = useCallback(() => {
    setLight((prev) => {
      localStorage.setItem("crowdTheme", prev ? "dark" : "light")
      return !prev
    })
  }, [])

  const loadSpots = useCallback(async () => {
    try {
      setError(null)
      const res = await fetch("/api/crowd")
      if (!res.ok) throw new Error("bad status")
      const data = (await res.json()) as { spots: CrowdSpot[]; disaster?: CrowdDisaster[]; updatedAt: string }
      setSpots(data.spots)
      setDisaster(data.disaster ?? [])
      setUpdatedAt(data.updatedAt)
    } catch {
      setError("서울시 실시간 데이터를 불러오지 못했습니다. 잠시 후 다시 시도해주세요.")
    } finally {
      setLoading(false)
    }
  }, [])

  const fetchDetail = useCallback((name: string, silent = false) => {
    detailAbortRef.current?.abort()
    const controller = new AbortController()
    detailAbortRef.current = controller
    if (!silent) setDetailLoading(true)
    fetch(`/api/crowd?spot=${encodeURIComponent(name)}`, { signal: controller.signal })
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error("bad status"))))
      .then((data: CrowdDetail) => setDetail(data))
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === "AbortError") return
        if (!silent) setDetail(null)
      })
      .finally(() => {
        // 이미 다음 요청이 시작됐으면 그쪽 로딩 표시를 건드리지 않는다 (탭 연타 시 에러 플래시 방지)
        if (detailAbortRef.current === controller && !silent) setDetailLoading(false)
      })
  }, [])

  useEffect(() => {
    void loadSpots()
    const timer = setInterval(() => {
      void loadSpots()
      // 상세를 열어둔 채 방치해도 5분마다 조용히 최신화
      if (selectedNameRef.current) fetchDetail(selectedNameRef.current, true)
    }, 5 * 60 * 1000)
    return () => clearInterval(timer)
  }, [loadSpots, fetchDetail])

  // 히스토리를 건드리지 않는 순수 선택 반영 (popstate·딥링크에서 재사용)
  const applySpot = useCallback(
    (name: string | null) => {
      setSelectedName(name)
      selectedNameRef.current = name
      setDetail(null)
      detailAbortRef.current?.abort()
      if (name) fetchDetail(name)
    },
    [fetchDetail],
  )

  const selectSpot = useCallback(
    (name: string | null) => {
      const url = name ? `${window.location.pathname}?spot=${encodeURIComponent(name)}` : window.location.pathname
      const cur = window.history.state as { crowdSpot?: string; pushed?: boolean } | null
      if (name) {
        // 상세→상세 이동은 replace — 뒤로가기 한 번이면 항상 목록으로
        if (cur?.crowdSpot) window.history.replaceState({ crowdSpot: name, pushed: cur.pushed ?? false }, "", url)
        else window.history.pushState({ crowdSpot: name, pushed: true }, "", url)
      } else if (cur?.pushed) {
        // 우리가 쌓은 항목이면 back으로 정리 (모바일 뒤로가기와 동일 경로)
        window.history.back()
        return
      } else {
        window.history.replaceState(null, "", url)
      }
      applySpot(name)
    },
    [applySpot],
  )

  // ?spot= 딥링크 진입 + 뒤로가기로 상세 닫기
  useEffect(() => {
    const spot = new URLSearchParams(window.location.search).get("spot")
    if (spot) {
      window.history.replaceState({ crowdSpot: spot, pushed: false }, "", window.location.href)
      applySpot(spot)
    }
    const onPop = (e: PopStateEvent) => {
      const state = e.state as { crowdSpot?: string } | null
      applySpot(state?.crowdSpot ?? null)
    }
    window.addEventListener("popstate", onPop)
    return () => window.removeEventListener("popstate", onPop)
  }, [applySpot])

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
      setSelectedName(null)
      setDetail(null)
      setAddressPin({ label: data.display ?? address, lat: data.meta.lat, lng: data.meta.lon })
    } catch {
      setAddressError("주소를 찾지 못했습니다. 도로명·지번·건물명으로 다시 시도해보세요.")
    } finally {
      setAddressLoading(false)
    }
  }, [query])

  // 내 위치 기반 근처 명소 추천 — 주소 검색과 같은 nearest 흐름 재사용
  const locateMe = useCallback(() => {
    if (!navigator.geolocation) {
      setAddressError("이 브라우저는 위치 정보를 지원하지 않습니다.")
      return
    }
    setGeoLoading(true)
    setAddressError(null)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGeoLoading(false)
        setQuery("")
        selectSpot(null)
        setAddressPin({ label: "내 위치", lat: pos.coords.latitude, lng: pos.coords.longitude })
      },
      () => {
        setGeoLoading(false)
        setAddressError("위치 권한을 허용하면 내 주변 명소를 추천해드려요.")
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
    )
  }, [selectSpot])

  const categories = useMemo(() => {
    const set = new Set(spots.map((s) => s.category))
    return ["전체", ...Array.from(set)]
  }, [spots])

  const levelCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const s of spots) counts[s.level] = (counts[s.level] ?? 0) + 1
    return counts
  }, [spots])

  const toggleLevel = useCallback((level: string) => {
    setPreset(null)
    setLevelFilter((prev) => {
      const next = new Set(prev)
      if (next.has(level)) next.delete(level)
      else next.add(level)
      return next
    })
  }, [])

  const toggleCategory = useCallback((c: string) => {
    setPreset(null)
    if (c === "전체") {
      setCategoryFilter(new Set())
      return
    }
    setCategoryFilter((prev) => {
      const next = new Set(prev)
      if (next.has(c)) next.delete(c)
      else next.add(c)
      return next
    })
  }, [])

  const clearFilters = useCallback(() => {
    setPreset(null)
    setLevelFilter(new Set())
    setCategoryFilter(new Set())
    setFavOnly(false)
  }, [])

  const applyPreset = useCallback(
    (key: PresetKey) => {
      if (preset === key) {
        clearFilters()
        return
      }
      const p = PRESETS.find((x) => x.key === key)
      if (!p) return
      setPreset(key)
      setCategoryFilter(new Set(p.categories))
      setLevelFilter(new Set(p.levels))
    },
    [preset, clearFilters],
  )

  // 필터는 지도에도 반영 — "지금 여유로운 공원만"·"내 단골만" 탐색용
  const mapSpots = useMemo(() => {
    let list = spots
    if (favOnly) list = list.filter((s) => favs.has(s.name))
    if (levelFilter.size > 0) list = list.filter((s) => levelFilter.has(s.level))
    if (categoryFilter.size > 0) list = list.filter((s) => categoryFilter.has(s.category))
    return list
  }, [spots, levelFilter, categoryFilter, favOnly, favs])

  const filtered = useMemo(() => {
    const q = query.trim()
    let list = mapSpots
    if (q) list = list.filter((s) => s.name.includes(q))
    const byName = (a: CrowdSpot, b: CrowdSpot) => a.name.localeCompare(b.name, "ko")
    const byFav = (a: CrowdSpot, b: CrowdSpot) => (favs.has(b.name) ? 1 : 0) - (favs.has(a.name) ? 1 : 0)
    if (sort === "busy") list = [...list].sort((a, b) => byFav(a, b) || b.levelNum - a.levelNum || byName(a, b))
    else if (sort === "calm") list = [...list].sort((a, b) => byFav(a, b) || a.levelNum - b.levelNum || byName(a, b))
    else list = [...list].sort((a, b) => byFav(a, b) || byName(a, b))
    return list
  }, [mapSpots, query, sort, favs])

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
        spotCount={spots.length}
        levelCounts={levelCounts}
        updatedAt={updatedAt}
        light={light}
        disaster={disaster}
        disasterOpen={disasterOpen}
        onRefresh={() => void loadSpots()}
        onToggleTheme={toggleTheme}
        onToggleDisaster={() => setDisasterOpen((v) => !v)}
      />

      {/* ── 본문: 지도 + 패널 */}
      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        {/* 모바일: 지도는 컴팩트하게, 목록에 공간을 양보 (상세/근처 목록이 열리면 더 축소) */}
        <div
          className={`relative shrink-0 transition-[height] duration-300 md:h-auto md:flex-1 ${
            selectedName || addressPin ? "h-[24dvh]" : "h-[32dvh]"
          }`}
        >
          <CrowdMap
            spots={mapSpots}
            selectedName={selectedName}
            addressPin={addressPin}
            nearestNames={nearest.map((n) => n.spot.name)}
            cctvItems={selectedName ? (detail?.cctv ?? []) : []}
            onSelect={selectSpot}
          />
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
                  placeholder="명소·주소 검색 (예: 성수, 세종대로 110)"
                  className="h-9 w-full bg-transparent text-[16px] text-[var(--cp-text)] placeholder:text-[13px] placeholder:text-[var(--cp-text-faint)] focus:outline-none md:text-[14px]"
                />
                {query && (
                  <button
                    onClick={() => {
                      setQuery("")
                      setAddressError(null)
                    }}
                    className="text-[var(--cp-text-dim)] hover:text-[var(--cp-text-strong)]"
                    aria-label="지우기"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
              <button
                onClick={locateMe}
                disabled={geoLoading}
                className="flex h-9 shrink-0 items-center gap-1.5 rounded-md border border-[var(--cp-border-strong)] bg-[var(--cp-panel)] px-2.5 text-[13px] text-[var(--cp-text)] transition-colors hover:bg-[var(--cp-hover2)] disabled:opacity-50"
                title="내 위치 기준 근처 명소 추천"
              >
                {geoLoading ? (
                  <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <LocateFixed className="h-3.5 w-3.5" />
                )}
                내 주변
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
                {noSpotMatch ? "주소로 검색해서 근처 명소 인파 보기" : `'${query.trim()}' 주소 기준 근처 명소 보기`}
              </button>
            )}
            {addressError && (
              <p className={`mt-2 text-[12px] ${light ? "text-red-600" : "text-red-400"}`}>{addressError}</p>
            )}
          </div>

          {/* 패널 내용 */}
          {selectedName ? (
            <div className="flex min-h-0 flex-1 flex-col">
              <button
                onClick={() => selectSpot(null)}
                className="flex shrink-0 items-center gap-1.5 border-b border-[var(--cp-border)] px-4 py-2.5 text-[13px] text-[var(--cp-text-muted)] transition-colors hover:text-[var(--cp-text-strong)]"
              >
                <ArrowLeft className="h-3.5 w-3.5" /> 목록으로
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
                    />
                    {nearbyOfSelected.length > 0 && (
                      <div className="border-t border-[var(--cp-border)] px-4 pb-4 pt-3">
                        <h3 className="mb-1 text-[12px] font-medium uppercase tracking-wider text-[var(--cp-text-dim)]">
                          이 근처 다른 명소
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
                                    {spot.name}
                                  </p>
                                  <p className="text-[12px] text-[var(--cp-text-dim)]">
                                    {spot.category} · <span className="font-mono tabular-nums">{formatKm(km)}</span>
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
                    <p className="text-[13px] text-[var(--cp-text-dim)]">상세 데이터를 불러오지 못했습니다.</p>
                    <button
                      onClick={() => selectedName && fetchDetail(selectedName)}
                      className="mt-2 rounded-md border border-[var(--cp-border-strong)] px-3 py-1.5 text-[13px] text-[var(--cp-text)] transition-colors hover:bg-[var(--cp-hover2)]"
                    >
                      다시 시도
                    </button>
                  </div>
                )}
              </div>
              {/* 길찾기 고정 액션바 — "가기로 결정"은 어느 스크롤 위치에서든 나오므로 항상 손에 */}
              {selectedSpot && (
                <div className="flex shrink-0 gap-1.5 border-t border-[var(--cp-border)] bg-[var(--cp-bg)] px-3 py-2">
                  <a
                    href={`https://map.kakao.com/link/to/${encodeURIComponent(selectedSpot.name)},${selectedSpot.lat},${selectedSpot.lng}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex flex-1 items-center justify-center gap-1.5 rounded-md border border-[var(--cp-border-strong)] bg-[var(--cp-panel)] py-2 text-[13px] font-medium text-[var(--cp-text)] transition-colors hover:bg-[var(--cp-hover2)]"
                  >
                    <Navigation className="h-3.5 w-3.5 text-[#ffb100]" /> 카카오맵 길찾기
                  </a>
                  <a
                    href={`https://map.naver.com/p/directions/-/${selectedSpot.lng},${selectedSpot.lat},${encodeURIComponent(selectedSpot.name)}/-/transit`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex flex-1 items-center justify-center gap-1.5 rounded-md border border-[var(--cp-border-strong)] bg-[var(--cp-panel)] py-2 text-[13px] font-medium text-[var(--cp-text)] transition-colors hover:bg-[var(--cp-hover2)]"
                  >
                    <Navigation className="h-3.5 w-3.5 text-[#03c75a]" /> 네이버 길찾기
                  </a>
                </div>
              )}
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
              categories={categories}
              categoryFilter={categoryFilter}
              levelFilter={levelFilter}
              levelCounts={levelCounts}
              sort={sort}
              preset={preset}
              favs={favs}
              favOnly={favOnly}
              light={light}
              loading={loading}
              error={error}
              noSpotMatch={noSpotMatch}
              onApplyPreset={applyPreset}
              onToggleFavOnly={() => setFavOnly((v) => !v)}
              onToggleLevel={toggleLevel}
              onToggleCategory={toggleCategory}
              onClearFilters={clearFilters}
              onSort={setSort}
              onSelect={selectSpot}
              onToggleFav={toggleFav}
              onRetry={() => {
                setLoading(true)
                void loadSpots()
              }}
            />
          )}

          {showInstall && (
            <div className="flex shrink-0 items-center gap-2 border-t border-[var(--cp-border)] bg-[var(--cp-panel)] px-3 py-2 md:hidden">
              <p className="min-w-0 flex-1 text-[12px] leading-snug text-[var(--cp-text-muted)]">
                {showInstall === "ios"
                  ? "공유 버튼 → '홈 화면에 추가'로 앱처럼 쓸 수 있어요"
                  : "홈 화면에 추가하면 앱처럼 바로 열려요"}
              </p>
              {showInstall === "android" && (
                <button
                  onClick={() => {
                    void installPrompt?.prompt()
                    dismissInstall()
                  }}
                  className="shrink-0 rounded-md border border-[var(--cp-border-strong)] px-2.5 py-1 text-[12px] font-medium text-[var(--cp-text-strong)] transition-colors hover:bg-[var(--cp-hover2)]"
                >
                  설치
                </button>
              )}
              <button onClick={dismissInstall} aria-label="설치 안내 닫기" className="shrink-0 p-1 text-[var(--cp-text-dim)] hover:text-[var(--cp-text-strong)]">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
          <footer className="flex shrink-0 items-center gap-2 border-t border-[var(--cp-border)] px-4 py-1.5 pb-[max(0.375rem,env(safe-area-inset-bottom))] md:py-2 md:pb-[max(0.5rem,env(safe-area-inset-bottom))]">
            <p className="min-w-0 flex-1 truncate text-[11px] leading-relaxed text-[var(--cp-text-faint)]">
              서울시 실시간 도시데이터(5분 주기, KT 통신 기반 추정) · 표준주소실록 ×{" "}
              <a
                href="https://data.seoul.go.kr/SeoulRtd/"
                target="_blank"
                rel="noopener noreferrer"
                className="underline hover:text-[var(--cp-text-muted)]"
              >
                서울 열린데이터광장
              </a>
            </p>
            {/* 인파레이더 전용 카운터 — 루트(/)와 별도 키로 집계 */}
            <a
              href="https://hitscounter.dev/history?url=https://gjdong.vercel.app/crowd"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="인파레이더 방문 통계 보기"
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
    </div>
  )
}
