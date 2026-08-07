"use client"

import { useCallback, useEffect, useState } from "react"
import type { CityId } from "@/lib/crowd/cities"
import { parseSpotsParam, WATCH_MAX, watchStorageKey } from "@/lib/crowd/watchlist"

/**
 * 상황실 감시 지점 — 도시별 localStorage 영속.
 * ?spots= 딥링크로 들어오면 세션 오버라이드(공유받은 구성을 내 저장본에 덮어쓰지 않는다).
 */
export function useWatchlist(city: CityId | null) {
  const [names, setNames] = useState<string[]>([])
  const [sessionOverride, setSessionOverride] = useState(false)

  useEffect(() => {
    if (!city) return
    const raw = new URLSearchParams(window.location.search).get("spots")
    if (raw) {
      setNames(parseSpotsParam(raw))
      setSessionOverride(true)
      return
    }
    setSessionOverride(false)
    try {
      const stored = JSON.parse(localStorage.getItem(watchStorageKey(city)) ?? "[]") as string[]
      setNames(Array.isArray(stored) ? stored.slice(0, WATCH_MAX) : [])
    } catch {
      setNames([])
    }
  }, [city])

  const apply = useCallback(
    (updater: (prev: string[]) => string[]) => {
      setNames((prev) => {
        const next = updater(prev).slice(0, WATCH_MAX)
        if (!sessionOverride && city) localStorage.setItem(watchStorageKey(city), JSON.stringify(next))
        return next
      })
    },
    [city, sessionOverride],
  )

  const toggle = useCallback(
    (name: string) => apply((prev) => (prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name])),
    [apply],
  )

  const addMany = useCallback(
    (add: string[]) => apply((prev) => [...prev, ...add.filter((n) => !prev.includes(n))]),
    [apply],
  )

  const clear = useCallback(() => apply(() => []), [apply])

  return { names, toggle, addMany, clear, sessionOverride }
}
