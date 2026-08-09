"use client"

import { useEffect, useMemo, useState } from "react"
import type { CrowdSpot } from "@/lib/crowd/seoul-rtd"
import { CITY_CAPS, type CityId } from "@/lib/crowd/cities"
import { baselineDelta, loadHeatmap, type BaselineDelta, type HeatEntry } from "@/lib/crowd/heatmap-client"

/**
 * 지금 vs 평소 — 누적 히트맵(요일×시간 평균) 대비 현재 등급의 상대 배지.
 * 히트맵을 가진 도시(서울·제주)만, 파일 1회 fetch(세션 캐시) 외 추가 API 0.
 * 표본 부족 지점은 null로 빠져 배지가 붙지 않는다 — "평소" 근거 없이 단정하지 않는다.
 */
export function useBaseline(city: CityId | null, spots: CrowdSpot[]) {
  const available = city ? CITY_CAPS[city].heatmap : false
  const [heat, setHeat] = useState<Record<string, HeatEntry> | null>(null)

  useEffect(() => {
    setHeat(null)
    if (!city || !available) return
    let alive = true
    void loadHeatmap(city).then((h) => {
      if (alive) setHeat(h)
    })
    return () => {
      alive = false
    }
  }, [city, available])

  const deltas = useMemo(() => {
    if (!heat) return null
    const kst = new Date(Date.now() + 9 * 3600 * 1000)
    const dow = kst.getUTCDay()
    const hour = kst.getUTCHours()
    const out: Record<string, BaselineDelta> = {}
    for (const s of spots) {
      const d = baselineDelta(heat[s.name], s.levelNum, dow, hour)
      if (d) out[s.name] = d
    }
    return out
  }, [heat, spots])

  return deltas
}
