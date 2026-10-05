"use client"

import { useCallback, useEffect, useState } from "react"
import { CROWD_THEME_KEY, initialCrowdLight } from "@/components/crowd/hooks/theme-init"

/** 즐겨찾기·테마·지도 이름표 — localStorage 영속 (crowdFavs · crowdTheme · crowdLabels) */
export function usePersistedPrefs() {
  const [favs, setFavs] = useState<Set<string>>(new Set())
  // 테마는 첫 렌더부터 확정 — 대시보드는 ssr:false라 window가 있다. 마운트 후 effect로 바꾸면
  // 저장값 dark 사용자에게 라이트가 한 프레임 번쩍였고, 저장값 없으면 시스템 다크를 무시했다(2026-10-05 실측)
  const [light, setLight] = useState(initialCrowdLight)
  // 명소 이름표는 기본 표시 — 끈 사람만 기억한다
  const [labels, setLabels] = useState(true)

  useEffect(() => {
    if (localStorage.getItem("crowdLabels") === "off") setLabels(false)
    try {
      const stored = JSON.parse(localStorage.getItem("crowdFavs") ?? "[]") as string[]
      if (Array.isArray(stored)) setFavs(new Set(stored))
    } catch {
      // 손상된 저장값은 무시
    }
  }, [])

  // 로딩 셸(html[data-crowd-theme])과 토글 결과를 맞춘다 — 인라인 스크립트는 첫 로드 때만 돈다
  useEffect(() => {
    document.documentElement.setAttribute("data-crowd-theme", light ? "light" : "dark")
  }, [light])

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
      localStorage.setItem(CROWD_THEME_KEY, prev ? "dark" : "light")
      return !prev
    })
  }, [])

  const toggleLabels = useCallback(() => {
    setLabels((prev) => {
      localStorage.setItem("crowdLabels", prev ? "off" : "on")
      return !prev
    })
  }, [])

  return { favs, toggleFav, light, toggleTheme, labels, toggleLabels }
}
