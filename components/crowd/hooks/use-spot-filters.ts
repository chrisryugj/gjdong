"use client"

import { useCallback, useMemo, useState } from "react"
import type { CrowdSpot } from "@/lib/crowd/seoul-rtd"
import type { Lang } from "@/lib/crowd/i18n"
import { PRESETS, type PresetKey, type SortMode } from "@/components/crowd/shared"

/** 목록·지도 공용 필터(등급·카테고리·프리셋·즐겨찾기만)·정렬·검색 매칭 */
export function useSpotFilters({
  spots,
  favs,
  query,
  trSpotName,
  lang,
}: {
  spots: CrowdSpot[]
  favs: Set<string>
  query: string
  trSpotName: (name: string) => string
  lang: Lang
}) {
  const [categoryFilter, setCategoryFilter] = useState<Set<string>>(new Set())
  const [levelFilter, setLevelFilter] = useState<Set<string>>(new Set())
  const [sort, setSort] = useState<SortMode>("busy")
  const [preset, setPreset] = useState<PresetKey | null>(null)
  const [favOnly, setFavOnly] = useState(false)

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
    const q = query.trim().toLowerCase()
    let list = mapSpots
    // 한국어 원문·현지어 표기 양쪽 매칭 (예: "hongdae" → 홍대)
    if (q) list = list.filter((s) => s.name.toLowerCase().includes(q) || trSpotName(s.name).toLowerCase().includes(q))
    const byName = (a: CrowdSpot, b: CrowdSpot) => trSpotName(a.name).localeCompare(trSpotName(b.name), lang)
    const byFav = (a: CrowdSpot, b: CrowdSpot) => (favs.has(b.name) ? 1 : 0) - (favs.has(a.name) ? 1 : 0)
    if (sort === "busy") list = [...list].sort((a, b) => byFav(a, b) || b.levelNum - a.levelNum || byName(a, b))
    else if (sort === "calm") list = [...list].sort((a, b) => byFav(a, b) || a.levelNum - b.levelNum || byName(a, b))
    else list = [...list].sort((a, b) => byFav(a, b) || byName(a, b))
    return list
  }, [mapSpots, query, sort, favs, trSpotName, lang])

  return {
    categoryFilter,
    levelFilter,
    sort,
    setSort,
    preset,
    favOnly,
    setFavOnly,
    categories,
    levelCounts,
    toggleLevel,
    toggleCategory,
    clearFilters,
    applyPreset,
    mapSpots,
    filtered,
  }
}
