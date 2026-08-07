"use client"

import { useEffect, useMemo, useState } from "react"
import { CONGEST_LEVELS, LEVEL_COLORS, type CrowdSpot } from "@/lib/crowd/seoul-rtd"
import { CITY_CAPS, type CityId } from "@/lib/crowd/cities"
import { loadHeatmap, patternLevel, type HeatEntry } from "@/lib/crowd/heatmap-client"

export interface LensState {
  /** 요일 0=일 (heatmap 배열 인덱스와 동일) */
  dow: number
  hour: number
}

/** 지금 KST 요일·시각 — 렌즈 진입 기본값 */
export function lensNowKst(): LensState {
  const kst = new Date(Date.now() + 9 * 3600 * 1000)
  return { dow: kst.getUTCDay(), hour: kst.getUTCHours() }
}

/**
 * 시간대 패턴 렌즈 — 지도 마커를 선택한 요일·시각의 평균 등급(누적 히트맵)으로 갈아입힌다.
 * 히트맵을 가진 도시(서울·제주)만, 파일 1회 fetch 외 추가 API 0. 목록·헤더는 실시간 유지.
 */
export function useTimeLens(city: CityId | null, mapSpots: CrowdSpot[]) {
  const [lens, setLens] = useState<LensState | null>(null)
  const [heat, setHeat] = useState<Record<string, HeatEntry> | null>(null)
  const available = city ? CITY_CAPS[city].heatmap : false

  // 도시가 바뀌면 렌즈는 실시간으로 복귀 (히트맵 파일도 도시별이라 함께 버린다)
  useEffect(() => {
    setLens(null)
    setHeat(null)
  }, [city])

  // 렌즈를 처음 켠 시점에 도시 히트맵 로드 (loadHeatmap이 세션 캐시라 재진입은 즉시)
  useEffect(() => {
    if (!lens || heat || !city || !available) return
    let alive = true
    void loadHeatmap(city).then((spots) => {
      if (alive) setHeat(spots ?? {})
    })
    return () => {
      alive = false
    }
  }, [lens, heat, city, available])

  // 패턴 등급으로 치환한 지도용 목록 — 표본 없는 지점은 "정보 없음" 회색 규약을 따른다
  const lensSpots = useMemo(() => {
    if (!lens || !heat) return null
    return mapSpots.map((s) => {
      const lv = patternLevel(heat[s.name], lens.dow, lens.hour)
      const level = lv > 0 ? CONGEST_LEVELS[lv - 1] : "정보 없음"
      return { ...s, level, levelNum: lv, color: LEVEL_COLORS[level] ?? "#999" }
    })
  }, [lens, heat, mapSpots])

  return { lens, setLens, available, lensSpots, loading: lens != null && heat == null }
}
