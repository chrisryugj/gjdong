"use client"

import { useCallback, useEffect, useRef, useState, type MutableRefObject } from "react"
import type { CrowdDetail } from "@/lib/crowd/seoul-rtd"
import type { CityId } from "@/lib/crowd/cities"

/** 명소 선택·상세 로드·히스토리(?spot= 딥링크·뒤로가기) — 히스토리 정책의 단일 소유자 */
export function useSpotSelection(cityRef: MutableRefObject<CityId>) {
  const [selectedName, setSelectedName] = useState<string | null>(null)
  const [detail, setDetail] = useState<CrowdDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)

  const detailAbortRef = useRef<AbortController | null>(null)
  const selectedNameRef = useRef<string | null>(null)

  const fetchDetail = useCallback(
    (name: string, silent = false) => {
      detailAbortRef.current?.abort()
      const controller = new AbortController()
      detailAbortRef.current = controller
      if (!silent) setDetailLoading(true)
      fetch(`/api/crowd?spot=${encodeURIComponent(name)}&city=${cityRef.current}`, { signal: controller.signal })
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
    },
    [cityRef],
  )

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
      // ?lang= 등 다른 파라미터는 보존하고 spot만 갱신
      const params = new URLSearchParams(window.location.search)
      if (name) params.set("spot", name)
      else params.delete("spot")
      const qs = params.toString()
      const url = qs ? `${window.location.pathname}?${qs}` : window.location.pathname
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

  /** 폴링 편승용 — 상세를 열어둔 채 방치해도 조용히 최신화 */
  const silentRefresh = useCallback(() => {
    if (selectedNameRef.current) fetchDetail(selectedNameRef.current, true)
  }, [fetchDetail])

  /** 도시 전환용 — 진행 중 요청 중단 + 선택 해제 (히스토리는 호출부가 URL 교체로 정리) */
  const reset = useCallback(() => {
    detailAbortRef.current?.abort()
    setSelectedName(null)
    selectedNameRef.current = null
    setDetail(null)
  }, [])

  return {
    selectedName,
    setSelectedName,
    detail,
    setDetail,
    detailLoading,
    fetchDetail,
    selectSpot,
    silentRefresh,
    reset,
  }
}
