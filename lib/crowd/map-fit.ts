// 지점 집합을 다 담는 지도 뷰 근사 — 보고서 배치도·상황실 미니맵 공용. 순수 함수.

import type { CrowdSpot } from "@/lib/crowd/seoul-rtd"
import { CITIES, type CityId } from "@/lib/crowd/cities"

/** bbox 중심 + 폭에서 줌 근사 (빈 목록=도시 기본 뷰). ~700px 박스 기준: 도심 4곳(0.07도)→13, 도시 전역(0.3도)→11 */
export function fitView(spots: CrowdSpot[], city: CityId): { center: [number, number]; zoom: number } {
  if (spots.length === 0) return { center: CITIES[city].center, zoom: CITIES[city].zoom }
  const lats = spots.map((s) => s.lat)
  const lngs = spots.map((s) => s.lng)
  const center: [number, number] = [(Math.min(...lats) + Math.max(...lats)) / 2, (Math.min(...lngs) + Math.max(...lngs)) / 2]
  const span = Math.max(Math.max(...lats) - Math.min(...lats), (Math.max(...lngs) - Math.min(...lngs)) * 0.8, 0.01)
  const zoom = Math.max(9, Math.min(14, Math.floor(Math.log2(700 / span))))
  return { center, zoom }
}
