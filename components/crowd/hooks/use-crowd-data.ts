"use client"

import { useCallback, useEffect, useState, type MutableRefObject } from "react"
import type { CrowdDisaster, CrowdSpot } from "@/lib/crowd/seoul-rtd"
import { CITY_CAPS, isCityId, type CityId } from "@/lib/crowd/cities"

/** 도시 확정(?city=) · 목록 로드 · 자동 폴링 — 도시 상태의 단일 소유자 */
export function useCrowdData(
  cityRef: MutableRefObject<CityId>,
  onSilentDetailRefresh: () => void,
) {
  // 도시는 URL(?city=)에서 복원 — SSR 표준 출력은 서울이라 마운트 후 확정 (null=미확정)
  const [city, setCity] = useState<CityId | null>(null)
  const [spots, setSpots] = useState<CrowdSpot[]>([])
  const [updatedAt, setUpdatedAt] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<boolean>(false)
  const [disaster, setDisaster] = useState<CrowdDisaster[]>([])
  const [disasterOpen, setDisasterOpen] = useState(false)

  const loadSpots = useCallback(async () => {
    try {
      setError(false)
      const res = await fetch(`/api/crowd?city=${cityRef.current}`)
      if (!res.ok) throw new Error("bad status")
      const data = (await res.json()) as { spots: CrowdSpot[]; disaster?: CrowdDisaster[]; updatedAt: string }
      setSpots(data.spots)
      setDisaster(data.disaster ?? [])
      setUpdatedAt(data.updatedAt)
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }, [cityRef])

  // URL에서 도시 확정 → 이후 목록 로드 시작 (?city 없으면 서울)
  useEffect(() => {
    const raw = new URLSearchParams(window.location.search).get("city")
    const resolved: CityId = isCityId(raw) ? raw : "seoul"
    cityRef.current = resolved
    setCity(resolved)
  }, [cityRef])

  // 갱신 주기 — 제주는 명소당 1콜(66콜/회) 구조라 원천 부담이 서울·부산의 수십 배라 길게 잡는다.
  // 숨겨진 탭에서는 아예 멈춘다: 켜둔 채 방치된 탭이 쌓이면 아무도 보지 않는 데이터를 위해
  // 상류 호출만 누적된다(2026-08 제주 원천 차단 사고의 교훈). 복귀 시 주기가 지났으면 즉시 1회.
  useEffect(() => {
    if (!city) return
    const periodMs = CITY_CAPS[city].pollMinutes * 60 * 1000
    void loadSpots()
    let lastAt = Date.now()
    const refresh = () => {
      lastAt = Date.now()
      void loadSpots()
      // 상세를 열어둔 채 방치해도 조용히 최신화
      onSilentDetailRefresh()
    }
    const timer = setInterval(() => {
      if (!document.hidden) refresh()
    }, periodMs)
    const onVisibility = () => {
      if (!document.hidden && Date.now() - lastAt >= periodMs) refresh()
    }
    document.addEventListener("visibilitychange", onVisibility)
    return () => {
      clearInterval(timer)
      document.removeEventListener("visibilitychange", onVisibility)
    }
  }, [city, loadSpots, onSilentDetailRefresh])

  /** 도시 전환의 데이터 파트 — 목록 비우고 URL 갱신 (선택·필터 리셋은 호출부가 합성) */
  const resetForCity = useCallback((next: CityId) => {
    setSpots([])
    setLoading(true)
    setDisaster([])
    setDisasterOpen(false)
    const params = new URLSearchParams(window.location.search)
    if (next === "seoul") params.delete("city")
    else params.set("city", next)
    params.delete("spot")
    const qs = params.toString()
    window.history.replaceState(null, "", qs ? `${window.location.pathname}?${qs}` : window.location.pathname)
    setCity(next)
  }, [])

  return {
    city,
    spots,
    updatedAt,
    loading,
    setLoading,
    error,
    disaster,
    disasterOpen,
    setDisasterOpen,
    loadSpots,
    resetForCity,
  }
}
