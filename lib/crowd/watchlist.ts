// 상황실 감시 지점 목록 — 순수 함수 (테스트 대상). 상태·저장은 use-watchlist 훅이 담당.

import type { CityId } from "@/lib/crowd/cities"

/** 감시 상한 — 제주 원천 보호(카드당 상세 팬아웃 억제) + 카드 그리드 가독성 */
export const WATCH_MAX = 12

export function watchStorageKey(city: CityId): string {
  return `crowdWatch.${city}`
}

/** ?spots= 파싱 — 공백 정리·중복 제거·상한 컷. 실존 여부는 렌더 시점에 목록과 대조한다 */
export function parseSpotsParam(raw: string | null): string[] {
  if (!raw) return []
  const seen = new Set<string>()
  for (const part of raw.split(",")) {
    const name = part.trim()
    if (name) seen.add(name)
    if (seen.size >= WATCH_MAX) break
  }
  return Array.from(seen)
}

export function serializeSpotsParam(names: string[]): string {
  return names.join(",")
}
