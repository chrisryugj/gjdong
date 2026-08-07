"use client"

import { useCallback, useEffect, useState } from "react"

/** 즐겨찾기·테마·지도 이름표 — localStorage 영속 (crowdFavs · crowdTheme · crowdLabels) */
export function usePersistedPrefs() {
  const [favs, setFavs] = useState<Set<string>>(new Set())
  const [light, setLight] = useState(true)
  // 명소 이름표는 기본 표시 — 끈 사람만 기억한다
  const [labels, setLabels] = useState(true)

  useEffect(() => {
    if (localStorage.getItem("crowdTheme") === "dark") setLight(false)
    if (localStorage.getItem("crowdLabels") === "off") setLabels(false)
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

  const toggleLabels = useCallback(() => {
    setLabels((prev) => {
      localStorage.setItem("crowdLabels", prev ? "off" : "on")
      return !prev
    })
  }, [])

  return { favs, toggleFav, light, toggleTheme, labels, toggleLabels }
}
