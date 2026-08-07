"use client"

import { useEffect, useState } from "react"
import type { CrowdDetail } from "@/lib/crowd/seoul-rtd"
import { CITY_CAPS, type CityId } from "@/lib/crowd/cities"

/**
 * 상황실 카드용 상세 팬아웃 — opsDetail이 "full"인 도시(서울)만, 동시성 3.
 * 갱신은 목록 폴링과 같은 틱에 편승한다(updatedAt 변경 시 재조회) — 별도 타이머 없음.
 */
export function useOpsDetails(city: CityId | null, names: string[], updatedAt: string | null) {
  const [details, setDetails] = useState<Map<string, CrowdDetail>>(new Map())
  const namesKey = names.join("|")

  useEffect(() => {
    if (!city || CITY_CAPS[city].opsDetail !== "full" || names.length === 0) {
      setDetails(new Map())
      return
    }
    let cancelled = false
    const queue = [...names]
    const out = new Map<string, CrowdDetail>()
    const worker = async () => {
      while (queue.length > 0 && !cancelled) {
        const name = queue.shift()
        if (!name) return
        try {
          const res = await fetch(`/api/crowd?spot=${encodeURIComponent(name)}&city=${city}`)
          if (res.ok) out.set(name, (await res.json()) as CrowdDetail)
        } catch {
          // 카드 한 장 실패 = 그 카드만 등급 표시로 강등
        }
      }
    }
    void Promise.all([worker(), worker(), worker()]).then(() => {
      if (!cancelled) setDetails(new Map(out))
    })
    return () => {
      cancelled = true
    }
    // namesKey가 names 배열의 내용 동등성을 대신한다 (배열 참조는 렌더마다 달라질 수 있음)
  }, [city, namesKey, updatedAt])

  return details
}
