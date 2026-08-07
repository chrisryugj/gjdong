"use client"

import { useCallback, useEffect, useState } from "react"

/**
 * 상황실 모드 진입/이탈 — ?mode=ops(또는 ?spots=) 딥링크와 뒤로가기를 지원한다.
 * history.state는 선택(useSpotSelection)의 {crowdSpot, pushed}와 한 객체를 공유하되
 * 서로 다른 키(crowdMode)만 읽는다 — popstate 리스너 둘이 각자 자기 조각을 복원.
 */
export function useOpsMode() {
  const [opsMode, setOpsMode] = useState(false)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get("mode") === "ops" || params.get("spots")) {
      window.history.replaceState({ ...(window.history.state ?? {}), crowdMode: "ops" }, "", window.location.href)
      setOpsMode(true)
    }
    const onPop = (e: PopStateEvent) => {
      const state = e.state as { crowdMode?: string } | null
      setOpsMode(state?.crowdMode === "ops")
    }
    window.addEventListener("popstate", onPop)
    return () => window.removeEventListener("popstate", onPop)
  }, [])

  const enterOps = useCallback(() => {
    const params = new URLSearchParams(window.location.search)
    params.set("mode", "ops")
    params.delete("spot") // 상세를 보던 중이었어도 상황실은 전체 보드에서 시작
    const url = `${window.location.pathname}?${params.toString()}`
    window.history.pushState({ ...(window.history.state ?? {}), crowdMode: "ops", pushed: true }, "", url)
    setOpsMode(true)
  }, [])

  const exitOps = useCallback(() => {
    const cur = window.history.state as { crowdMode?: string; pushed?: boolean } | null
    if (cur?.crowdMode === "ops" && cur.pushed) {
      // 우리가 쌓은 항목이면 back으로 정리 (모바일 뒤로가기와 동일 경로)
      window.history.back()
      return
    }
    const params = new URLSearchParams(window.location.search)
    params.delete("mode")
    params.delete("spots")
    const qs = params.toString()
    window.history.replaceState(null, "", qs ? `${window.location.pathname}?${qs}` : window.location.pathname)
    setOpsMode(false)
  }, [])

  return { opsMode, enterOps, exitOps }
}
