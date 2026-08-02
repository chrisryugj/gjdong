"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import dynamic from "next/dynamic"
import { ArrowLeft, LoaderCircle, LocateFixed, MapPin, Moon, RefreshCw, Search, Star, Sun, X } from "lucide-react"
import type { CrowdDetail, CrowdSpot } from "@/lib/crowd/seoul-rtd"
import CrowdMap from "@/components/crowd/crowd-map"

// recharts가 무거워서 상세 패널은 선택 시점에 로드
const SpotDetail = dynamic(() => import("@/components/crowd/spot-detail"), {
  ssr: false,
  loading: () => (
    <div className="flex h-40 items-center justify-center">
      <LoaderCircle className="h-5 w-5 animate-spin text-[var(--cp-text-dim)]" />
    </div>
  ),
})

const LEVEL_ORDER = ["붐빔", "약간 붐빔", "보통", "여유"] as const
const LEVEL_COLORS: Record<string, string> = {
  여유: "#00d369",
  보통: "#ffb100",
  "약간 붐빔": "#ff8040",
  붐빔: "#ff3939",
}

type SortMode = "busy" | "calm" | "name"

// 목적 프리셋 — 혼잡도·카테고리 필터 조합 (부모/커플 대표 시나리오)
const PRESETS = [
  { key: "kids", label: "🧒 아이와 나들이", categories: ["공원", "고궁·문화유산"], levels: ["여유", "보통"] },
  { key: "date", label: "💐 데이트", categories: ["발달상권", "관광특구", "고궁·문화유산"], levels: ["여유", "보통"] },
  { key: "hot", label: "🔥 지금 핫플", categories: [], levels: ["붐빔", "약간 붐빔"] },
] as const
type PresetKey = (typeof PRESETS)[number]["key"]

interface AddressPin {
  label: string
  lat: number
  lng: number
}

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLng = ((lng2 - lng1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function formatKm(km: number): string {
  return km < 1 ? `${Math.round(km * 1000)}m` : `${km.toFixed(1)}km`
}

function formatClock(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", hour12: false })
}

export default function CrowdDashboard() {
  const [spots, setSpots] = useState<CrowdSpot[]>([])
  const [updatedAt, setUpdatedAt] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [selectedName, setSelectedName] = useState<string | null>(null)
  const [detail, setDetail] = useState<CrowdDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)

  const [query, setQuery] = useState("")
  const [categoryFilter, setCategoryFilter] = useState<Set<string>>(new Set())
  const [levelFilter, setLevelFilter] = useState<Set<string>>(new Set())
  const [sort, setSort] = useState<SortMode>("busy")
  const [preset, setPreset] = useState<PresetKey | null>(null)
  const [favs, setFavs] = useState<Set<string>>(new Set())

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
      const data = (await res.json()) as { spots: CrowdSpot[]; updatedAt: string }
      setSpots(data.spots)
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

  const selectSpot = useCallback(
    (name: string | null) => {
      setSelectedName(name)
      selectedNameRef.current = name
      setDetail(null)
      detailAbortRef.current?.abort()
      window.history.replaceState(
        null,
        "",
        name ? `${window.location.pathname}?spot=${encodeURIComponent(name)}` : window.location.pathname,
      )
      if (name) fetchDetail(name)
    },
    [fetchDetail],
  )

  // ?spot= 딥링크 — 공유받은 링크로 바로 상세 진입
  useEffect(() => {
    const spot = new URLSearchParams(window.location.search).get("spot")
    if (spot) selectSpot(spot)
  }, [selectSpot])

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

  const applyPreset = useCallback(
    (key: PresetKey) => {
      if (preset === key) {
        setPreset(null)
        setCategoryFilter(new Set())
        setLevelFilter(new Set())
        return
      }
      const p = PRESETS.find((x) => x.key === key)
      if (!p) return
      setPreset(key)
      setCategoryFilter(new Set(p.categories))
      setLevelFilter(new Set(p.levels))
    },
    [preset],
  )

  // 필터는 지도에도 반영 — "지금 여유로운 공원만" 탐색용
  const mapSpots = useMemo(() => {
    let list = spots
    if (levelFilter.size > 0) list = list.filter((s) => levelFilter.has(s.level))
    if (categoryFilter.size > 0) list = list.filter((s) => categoryFilter.has(s.category))
    return list
  }, [spots, levelFilter, categoryFilter])

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

  return (
    <div className={`crowd-page ${light ? "crowd-light" : ""} flex h-dvh flex-col bg-[var(--cp-bg)] text-[var(--cp-text)]`}>
      {/* ── 헤더 */}
      <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-[var(--cp-border)] px-4 md:px-5">
        <div className="flex min-w-0 items-baseline gap-3">
          <h1 className="shrink-0 text-xl text-[var(--cp-text-strong)] [font-family:Joseon100Years,serif] md:text-2xl">
            서울 인파레이더
          </h1>
          <p className="hidden truncate text-[11px] text-[var(--cp-text-dim)] sm:block">
            실시간 인구밀집 상황판 · 서울 주요 명소 {spots.length > 0 ? spots.length : 121}곳
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-3 md:gap-4">
          <div className="hidden items-center gap-3 md:flex">
            {LEVEL_ORDER.map((level) => (
              <div key={level} className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full" style={{ background: LEVEL_COLORS[level] }} />
                <span className="text-[11px] text-[var(--cp-text-muted)]">{level}</span>
                <span className="font-mono text-[12px] tabular-nums text-[var(--cp-text)]">
                  {levelCounts[level] ?? 0}
                </span>
              </div>
            ))}
          </div>

          <div className="flex items-center gap-1.5 border-l border-[var(--cp-border)] pl-3 md:pl-4">
            {updatedAt && (
              <span className="font-mono text-[11px] tabular-nums text-[var(--cp-text-dim)]">
                {formatClock(updatedAt)} 기준
              </span>
            )}
            <button
              onClick={() => void loadSpots()}
              className="rounded p-1.5 text-[var(--cp-text-muted)] transition-colors hover:bg-[var(--cp-hover)] hover:text-[var(--cp-text-strong)]"
              title="새로고침"
              aria-label="새로고침"
            >
              <RefreshCw className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={toggleTheme}
              className="rounded p-1.5 text-[var(--cp-text-muted)] transition-colors hover:bg-[var(--cp-hover)] hover:text-[var(--cp-text-strong)]"
              title={light ? "다크 모드" : "라이트 모드"}
              aria-label={light ? "다크 모드로 전환" : "라이트 모드로 전환"}
            >
              {light ? <Moon className="h-3.5 w-3.5" /> : <Sun className="h-3.5 w-3.5" />}
            </button>
          </div>

          <Link
            href="/"
            className="hidden border-l border-[var(--cp-border)] pl-3 text-[11px] text-[var(--cp-text-dim)] transition-colors hover:text-[var(--cp-text-strong)] sm:block md:pl-4"
          >
            표준주소실록 ↗
          </Link>
        </div>
      </header>

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
                <span className="font-mono text-[10px] tabular-nums text-[var(--cp-text)]">
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
        <aside className="flex min-h-0 flex-1 flex-col border-t border-[var(--cp-border)] md:order-first md:w-[420px] md:flex-none md:border-r md:border-t-0">
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
                  className="h-9 w-full bg-transparent text-[16px] text-[var(--cp-text)] placeholder:text-[12px] placeholder:text-[var(--cp-text-faint)] focus:outline-none md:text-[13px]"
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
                className="flex h-9 shrink-0 items-center gap-1.5 rounded-md border border-[var(--cp-border-strong)] bg-[var(--cp-panel)] px-2.5 text-[12px] text-[var(--cp-text)] transition-colors hover:bg-[var(--cp-hover2)] disabled:opacity-50"
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
                className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-md border border-[var(--cp-border-strong)] bg-[var(--cp-panel2)] py-2 text-[12px] text-[var(--cp-text)] transition-colors hover:bg-[var(--cp-hover2)] disabled:opacity-50"
              >
                {addressLoading ? (
                  <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <MapPin className="h-3.5 w-3.5" />
                )}
                {noSpotMatch ? "주소로 검색해서 근처 명소 인파 보기" : `'${query.trim()}' 주소 기준 근처 명소 보기`}
              </button>
            )}
            {addressError && <p className="mt-2 text-[11px] text-red-400">{addressError}</p>}
          </div>

          {/* 패널 내용 */}
          {selectedName ? (
            <div className="flex min-h-0 flex-1 flex-col">
              <button
                onClick={() => selectSpot(null)}
                className="flex shrink-0 items-center gap-1.5 border-b border-[var(--cp-border)] px-4 py-2.5 text-[12px] text-[var(--cp-text-muted)] transition-colors hover:text-[var(--cp-text-strong)]"
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
                      origin={(() => {
                        const s = spots.find((sp) => sp.name === selectedName)
                        return s ? { lat: s.lat, lng: s.lng } : undefined
                      })()}
                      isFav={favs.has(detail.name)}
                      onToggleFav={() => toggleFav(detail.name)}
                    />
                    {nearbyOfSelected.length > 0 && (
                      <div className="border-t border-[var(--cp-border)] px-4 pb-4 pt-3">
                        <h3 className="mb-1 text-[11px] font-medium uppercase tracking-wider text-[var(--cp-text-dim)]">
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
                                  <p className="truncate text-[13px] text-[var(--cp-text)] group-hover:text-[var(--cp-text-strong)]">
                                    {spot.name}
                                  </p>
                                  <p className="text-[11px] text-[var(--cp-text-dim)]">
                                    {spot.category} · <span className="font-mono tabular-nums">{formatKm(km)}</span>
                                  </p>
                                </div>
                                <span
                                  className="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold"
                                  style={{ color: spot.color, background: `${spot.color}1a` }}
                                >
                                  {spot.level}
                                </span>
                              </button>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </>
                ) : (
                  <p className="p-6 text-center text-[12px] text-[var(--cp-text-dim)]">
                    상세 데이터를 불러오지 못했습니다.
                  </p>
                )}
              </div>
            </div>
          ) : addressPin ? (
            <div className="flex min-h-0 flex-1 flex-col">
              <div className="flex shrink-0 items-start justify-between gap-2 border-b border-[var(--cp-border)] px-4 py-3">
                <div className="min-w-0">
                  <p className="text-[10px] uppercase tracking-wider text-[var(--cp-text-dim)]">기준 위치</p>
                  <p className="mt-0.5 truncate text-[13px] font-medium text-[var(--cp-text-strong)]">{addressPin.label}</p>
                </div>
                <button
                  onClick={() => setAddressPin(null)}
                  className="shrink-0 rounded p-1 text-[var(--cp-text-dim)] hover:bg-[var(--cp-hover)] hover:text-[var(--cp-text-strong)]"
                  aria-label="주소 검색 해제"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto">
                <p className="px-4 pb-1 pt-3 text-[10px] uppercase tracking-wider text-[var(--cp-text-dim)]">
                  근처 명소 인파 상황
                </p>
                <ul>
                  {nearest.map(({ spot, km }, i) => (
                    <li key={spot.name}>
                      <button
                        onClick={() => selectSpot(spot.name)}
                        className="group flex w-full items-center gap-3 border-b border-[var(--cp-border-faint)] px-4 py-3 text-left transition-colors hover:bg-[var(--cp-hover)]"
                      >
                        <span className="w-4 shrink-0 font-mono text-[11px] tabular-nums text-[var(--cp-text-faint)]">
                          {i + 1}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[13px] text-[var(--cp-text)] group-hover:text-[var(--cp-text-strong)]">
                            {spot.name}
                          </p>
                          <p className="text-[11px] text-[var(--cp-text-dim)]">
                            {spot.category} · <span className="font-mono tabular-nums">{formatKm(km)}</span>
                          </p>
                        </div>
                        {spot.name === recommendedName && (
                          <span className="shrink-0 rounded-full border border-emerald-500/40 px-1.5 py-0.5 text-[10px] font-medium text-emerald-500">
                            추천
                          </span>
                        )}
                        <span
                          className="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold"
                          style={{ color: spot.color, background: `${spot.color}1a` }}
                        >
                          {spot.level}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ) : (
            <div className="flex min-h-0 flex-1 flex-col">
              {/* 프리셋 + 혼잡도 필터 한 줄 — 지금 가볼 만한 곳 고르기 (지도에도 반영) */}
              <div className="scrollbar-thin flex shrink-0 items-center gap-1.5 overflow-x-auto border-b border-[var(--cp-border-faint)] px-3 py-1.5 md:py-2">
                {PRESETS.map((p) => (
                  <button
                    key={p.key}
                    onClick={() => applyPreset(p.key)}
                    className={`shrink-0 whitespace-nowrap rounded-full border px-2.5 py-1 text-[11px] transition-colors ${
                      preset === p.key
                        ? "border-[var(--cp-border-active)] bg-[var(--cp-panel2)] font-medium text-[var(--cp-text-strong)]"
                        : "border-[var(--cp-border)] text-[var(--cp-text-muted)] hover:border-[var(--cp-border-strong)] hover:text-[var(--cp-text)]"
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
                <span className="mx-0.5 h-4 w-px shrink-0 bg-[var(--cp-border)]" />
                {LEVEL_ORDER.slice().reverse().map((level) => {
                  const active = levelFilter.has(level)
                  return (
                    <button
                      key={level}
                      onClick={() => toggleLevel(level)}
                      className="shrink-0 whitespace-nowrap rounded-full border px-2.5 py-1 text-[11px] transition-colors"
                      style={
                        active
                          ? { borderColor: LEVEL_COLORS[level], color: LEVEL_COLORS[level], background: `${LEVEL_COLORS[level]}1a` }
                          : { borderColor: "var(--cp-border)", color: "var(--cp-text-dim)" }
                      }
                    >
                      <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full align-middle" style={{ background: LEVEL_COLORS[level] }} />
                      {level}
                      <span className="ml-1 font-mono tabular-nums opacity-70">{levelCounts[level] ?? 0}</span>
                    </button>
                  )
                })}
                {(levelFilter.size > 0 || categoryFilter.size > 0) && (
                  <button
                    onClick={() => {
                      setPreset(null)
                      setLevelFilter(new Set())
                      setCategoryFilter(new Set())
                    }}
                    className="shrink-0 px-1.5 py-1 text-[11px] text-[var(--cp-text-dim)] underline underline-offset-2 hover:text-[var(--cp-text-strong)]"
                  >
                    해제
                  </button>
                )}
              </div>
              {/* 카테고리 필터 (다중선택, 한 줄 가로 스크롤) + 정렬 고정 */}
              <div className="flex shrink-0 items-center gap-1.5 border-b border-[var(--cp-border)] px-3 py-1.5 md:py-2.5">
                <div className="scrollbar-thin flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto">
                  {categories.map((c) => {
                    const active = c === "전체" ? categoryFilter.size === 0 : categoryFilter.has(c)
                    return (
                      <button
                        key={c}
                        onClick={() => toggleCategory(c)}
                        className={`shrink-0 whitespace-nowrap rounded-full border px-2.5 py-1 text-[11px] transition-colors ${
                          active
                            ? "border-[var(--cp-border-active)] bg-[var(--cp-panel2)] text-[var(--cp-text-strong)]"
                            : "border-[var(--cp-border)] text-[var(--cp-text-dim)] hover:border-[var(--cp-border-strong)] hover:text-[var(--cp-text)]"
                        }`}
                      >
                        {c}
                      </button>
                    )
                  })}
                </div>
                <div className="flex shrink-0 items-center gap-1 border-l border-[var(--cp-border-faint)] pl-1.5">
                  {(
                    [
                      ["busy", "붐빔순"],
                      ["calm", "여유순"],
                      ["name", "가나다"],
                    ] as Array<[SortMode, string]>
                  ).map(([mode, label]) => (
                    <button
                      key={mode}
                      onClick={() => setSort(mode)}
                      className={`whitespace-nowrap px-1 py-1 text-[11px] transition-colors ${
                        sort === mode ? "text-[var(--cp-text-strong)] underline underline-offset-4" : "text-[var(--cp-text-faint)] hover:text-[var(--cp-text-muted)]"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* 목록 */}
              <div className="min-h-0 flex-1 overflow-y-auto">
                {error && (
                  <div className="p-6 text-center">
                    <p className="text-[12px] text-red-400">{error}</p>
                    <button
                      onClick={() => {
                        setLoading(true)
                        void loadSpots()
                      }}
                      className="mt-2 rounded-md border border-[var(--cp-border-strong)] px-3 py-1.5 text-[12px] text-[var(--cp-text)] transition-colors hover:bg-[var(--cp-hover2)]"
                    >
                      다시 시도
                    </button>
                  </div>
                )}
                <ul>
                  {filtered.map((spot, i) => (
                    <li key={spot.name} className="relative">
                      <button
                        onClick={() => selectSpot(spot.name)}
                        className="group flex w-full items-center gap-3 border-b border-[var(--cp-border-faint)] py-2.5 pl-4 pr-11 text-left transition-colors hover:bg-[var(--cp-hover)]"
                      >
                        <span className="w-6 shrink-0 font-mono text-[11px] tabular-nums text-[var(--cp-text-faint)]">
                          {String(i + 1).padStart(2, "0")}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[13px] text-[var(--cp-text)] group-hover:text-[var(--cp-text-strong)]">
                            {spot.name}
                          </p>
                          <p className="text-[11px] text-[var(--cp-text-dim)]">{spot.category}</p>
                        </div>
                        <span
                          className="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold"
                          style={{ color: spot.color, background: `${spot.color}1a` }}
                        >
                          {spot.level}
                        </span>
                      </button>
                      <button
                        onClick={() => toggleFav(spot.name)}
                        className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-1.5 transition-colors hover:bg-[var(--cp-hover)]"
                        aria-label={favs.has(spot.name) ? `${spot.name} 즐겨찾기 해제` : `${spot.name} 즐겨찾기`}
                        title="즐겨찾기 (목록 상단 고정)"
                      >
                        <Star
                          className={`h-3.5 w-3.5 ${
                            favs.has(spot.name)
                              ? "fill-amber-400 text-amber-400"
                              : "text-[var(--cp-text-faint)] hover:text-[var(--cp-text-muted)]"
                          }`}
                        />
                      </button>
                    </li>
                  ))}
                </ul>
                {!loading && !error && filtered.length === 0 && !noSpotMatch && (
                  <p className="p-6 text-center text-[12px] text-[var(--cp-text-dim)]">조건에 맞는 명소가 없습니다.</p>
                )}
                {noSpotMatch && (
                  <p className="p-6 text-center text-[12px] text-[var(--cp-text-dim)]">
                    명소 중에는 없습니다. 위 버튼으로 주소 검색을 해보세요.
                  </p>
                )}
              </div>
            </div>
          )}

          {showInstall && (
            <div className="flex shrink-0 items-center gap-2 border-t border-[var(--cp-border)] bg-[var(--cp-panel)] px-3 py-2 md:hidden">
              <p className="min-w-0 flex-1 text-[11px] leading-snug text-[var(--cp-text-muted)]">
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
                  className="shrink-0 rounded-md border border-[var(--cp-border-strong)] px-2.5 py-1 text-[11px] font-medium text-[var(--cp-text-strong)] transition-colors hover:bg-[var(--cp-hover2)]"
                >
                  설치
                </button>
              )}
              <button onClick={dismissInstall} aria-label="설치 안내 닫기" className="shrink-0 p-1 text-[var(--cp-text-dim)] hover:text-[var(--cp-text-strong)]">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
          <footer className="shrink-0 border-t border-[var(--cp-border)] px-4 py-1.5 pb-[max(0.375rem,env(safe-area-inset-bottom))] md:py-2 md:pb-[max(0.5rem,env(safe-area-inset-bottom))]">
            <p className="truncate text-[10px] leading-relaxed text-[var(--cp-text-faint)]">
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
          </footer>
        </aside>
      </div>
    </div>
  )
}
