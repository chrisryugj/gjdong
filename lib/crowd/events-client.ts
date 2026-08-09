// TourAPI 행사 클라이언트 로더 — 상세 패널·상황실 공용 (도시당 1 fetch 세션 캐시)

import type { TourEvent } from "@/lib/crowd/events"

const cache = new Map<string, Promise<TourEvent[]>>()

export function loadTourEvents(city: string): Promise<TourEvent[]> {
  let cached = cache.get(city)
  if (!cached) {
    cached = fetch(`/api/crowd/events?city=${city}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { events?: TourEvent[] } | null) => d?.events ?? [])
      .catch(() => [])
    cache.set(city, cached)
  }
  return cached
}

/** 행사-지점 매칭 반경(m) — 제주 지점은 조회 반경이 넓다(오름·해변) */
export function tourMatchRadius(city: string): number {
  return city === "jeju" ? 2000 : 1200
}
