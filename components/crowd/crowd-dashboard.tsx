"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { ArrowLeft, LoaderCircle, MapPin, Moon, RefreshCw, Search, Sun, X } from "lucide-react"
import type { CrowdDetail, CrowdSpot } from "@/lib/crowd/seoul-rtd"
import CrowdMap from "@/components/crowd/crowd-map"
import SpotDetail from "@/components/crowd/spot-detail"

const LEVEL_ORDER = ["붐빔", "약간 붐빔", "보통", "여유"] as const
const LEVEL_COLORS: Record<string, string> = {
  여유: "#00d369",
  보통: "#ffb100",
  "약간 붐빔": "#ff8040",
  붐빔: "#ff3939",
}

type SortMode = "busy" | "calm" | "name"

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
  const [category, setCategory] = useState<string>("전체")
  const [levelFilter, setLevelFilter] = useState<Set<string>>(new Set())
  const [sort, setSort] = useState<SortMode>("busy")

  const [addressPin, setAddressPin] = useState<AddressPin | null>(null)
  const [addressLoading, setAddressLoading] = useState(false)
  const [addressError, setAddressError] = useState<string | null>(null)

  const [light, setLight] = useState(false)

  const detailAbortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    if (localStorage.getItem("crowdTheme") === "light") setLight(true)
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

  useEffect(() => {
    void loadSpots()
    const timer = setInterval(() => void loadSpots(), 5 * 60 * 1000)
    return () => clearInterval(timer)
  }, [loadSpots])

  const selectSpot = useCallback((name: string | null) => {
    setSelectedName(name)
    setDetail(null)
    detailAbortRef.current?.abort()
    if (!name) return

    const controller = new AbortController()
    detailAbortRef.current = controller
    setDetailLoading(true)
    fetch(`/api/crowd?spot=${encodeURIComponent(name)}`, { signal: controller.signal })
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error("bad status"))))
      .then((data: CrowdDetail) => setDetail(data))
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === "AbortError") return
        setDetail(null)
      })
      .finally(() => setDetailLoading(false))
  }, [])

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
    setLevelFilter((prev) => {
      const next = new Set(prev)
      if (next.has(level)) next.delete(level)
      else next.add(level)
      return next
    })
  }, [])

  // 레벨 필터는 지도에도 반영 — "지금 여유로운 곳만" 탐색용
  const mapSpots = useMemo(
    () => (levelFilter.size > 0 ? spots.filter((s) => levelFilter.has(s.level)) : spots),
    [spots, levelFilter],
  )

  const filtered = useMemo(() => {
    const q = query.trim()
    let list = spots
    if (levelFilter.size > 0) list = list.filter((s) => levelFilter.has(s.level))
    if (category !== "전체") list = list.filter((s) => s.category === category)
    if (q) list = list.filter((s) => s.name.includes(q))
    const byName = (a: CrowdSpot, b: CrowdSpot) => a.name.localeCompare(b.name, "ko")
    if (sort === "busy") list = [...list].sort((a, b) => b.levelNum - a.levelNum || byName(a, b))
    else if (sort === "calm") list = [...list].sort((a, b) => a.levelNum - b.levelNum || byName(a, b))
    else list = [...list].sort(byName)
    return list
  }, [spots, query, category, levelFilter, sort])

  const nearest = useMemo(() => {
    if (!addressPin) return []
    return spots
      .map((s) => ({ spot: s, km: haversineKm(addressPin.lat, addressPin.lng, s.lat, s.lng) }))
      .sort((a, b) => a.km - b.km)
      .slice(0, 6)
  }, [spots, addressPin])

  const noSpotMatch = query.trim().length > 1 && filtered.length === 0

  return (
    <div className={`crowd-page ${light ? "crowd-light" : ""} flex h-dvh flex-col bg-[var(--cp-bg)] text-[var(--cp-text)]`}>
      {/* ── 헤더 */}
      <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-[var(--cp-border)] px-4 md:px-5">
        <div className="flex min-w-0 items-baseline gap-3">
          <h1 className="shrink-0 text-xl text-[var(--cp-text-strong)] [font-family:Joseon100Years,serif] md:text-2xl">
            서울 인파실록
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
        {/* 모바일: 상세/근처 목록이 열리면 지도를 줄여 내용 공간 확보 */}
        <div
          className={`relative shrink-0 transition-[height] duration-300 md:h-auto md:flex-1 ${
            selectedName || addressPin ? "h-[26dvh]" : "h-[42dvh]"
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

        <aside className="flex min-h-0 flex-1 flex-col border-t border-[var(--cp-border)] md:w-[420px] md:flex-none md:border-l md:border-t-0">
          {/* 검색 */}
          <div className="shrink-0 border-b border-[var(--cp-border)] p-3">
            <div className="flex items-center gap-2 rounded-md border border-[var(--cp-border-strong)] bg-[var(--cp-panel)] px-3 focus-within:border-[var(--cp-border-active)]">
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
                placeholder="명소 이름 또는 주소 (예: 성수, 광진구 아차산로 400)"
                className="h-10 w-full bg-transparent text-[16px] text-[var(--cp-text)] placeholder:text-[var(--cp-text-faint)] focus:outline-none md:h-9 md:text-[13px]"
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

            {noSpotMatch && !addressPin && (
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
                주소로 검색해서 근처 명소 인파 보기
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
                  <SpotDetail
                    detail={detail}
                    light={light}
                    origin={(() => {
                      const s = spots.find((sp) => sp.name === selectedName)
                      return s ? { lat: s.lat, lng: s.lng } : undefined
                    })()}
                  />
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
                  <p className="text-[10px] uppercase tracking-wider text-[var(--cp-text-dim)]">검색한 주소</p>
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
              {/* 혼잡도 필터 — 지금 가볼 만한 곳 고르기 (지도에도 반영) */}
              <div className="flex shrink-0 flex-wrap items-center gap-1.5 border-b border-[var(--cp-border-faint)] px-3 py-2">
                <span className="mr-0.5 text-[10px] uppercase tracking-wider text-[var(--cp-text-faint)]">
                  혼잡도
                </span>
                {LEVEL_ORDER.slice().reverse().map((level) => {
                  const active = levelFilter.has(level)
                  return (
                    <button
                      key={level}
                      onClick={() => toggleLevel(level)}
                      className="rounded-full border px-2.5 py-1 text-[11px] transition-colors"
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
                {levelFilter.size > 0 && (
                  <button
                    onClick={() => setLevelFilter(new Set())}
                    className="px-1.5 py-1 text-[11px] text-[var(--cp-text-dim)] underline underline-offset-2 hover:text-[var(--cp-text-strong)]"
                  >
                    해제
                  </button>
                )}
              </div>
              {/* 필터 */}
              <div className="flex shrink-0 flex-wrap items-center gap-1.5 border-b border-[var(--cp-border)] px-3 py-2.5">
                {categories.map((c) => (
                  <button
                    key={c}
                    onClick={() => setCategory(c)}
                    className={`rounded-full border px-2.5 py-1 text-[11px] transition-colors ${
                      category === c
                        ? "border-[var(--cp-border-active)] bg-[var(--cp-panel2)] text-[var(--cp-text-strong)]"
                        : "border-[var(--cp-border)] text-[var(--cp-text-dim)] hover:border-[var(--cp-border-strong)] hover:text-[var(--cp-text)]"
                    }`}
                  >
                    {c}
                  </button>
                ))}
                <div className="ml-auto flex items-center gap-1">
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
                      className={`px-1.5 py-1 text-[11px] transition-colors ${
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
                {error && <p className="p-6 text-center text-[12px] text-red-400">{error}</p>}
                <ul>
                  {filtered.map((spot, i) => (
                    <li key={spot.name}>
                      <button
                        onClick={() => selectSpot(spot.name)}
                        className="group flex w-full items-center gap-3 border-b border-[var(--cp-border-faint)] px-4 py-2.5 text-left transition-colors hover:bg-[var(--cp-hover)]"
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

          <footer className="shrink-0 border-t border-[var(--cp-border)] px-4 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
            <p className="text-[10px] leading-relaxed text-[var(--cp-text-faint)]">
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
