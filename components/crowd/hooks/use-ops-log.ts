"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import type { CrowdSpot } from "@/lib/crowd/seoul-rtd"
import type { CityId } from "@/lib/crowd/cities"
import { appendTick, buildLogCsv, logFilename, logStorageKey, type OpsLogTick } from "@/lib/crowd/oplog"

/**
 * 상황실 행사 로그 — 상황실이 켜져 있는 동안 폴링 스냅샷(감시 지점만)을 도시별 localStorage에 누적.
 * 추가 API 콜 0 (이미 받은 목록에서 발췌) — 제주 원천 보호 제약과 충돌하지 않는다.
 * 도시 전환 시엔 그 도시의 로그를 이어서 쓴다(행사장 복귀 시 기록 보존).
 */
export function useOpsLog(city: CityId | null, opsMode: boolean, watch: string[], spots: CrowdSpot[], updatedAt: string | null) {
  const [ticks, setTicks] = useState<OpsLogTick[]>([])
  const cityRef = useRef<CityId | null>(null)

  // 도시 확정·전환 시 해당 도시 로그 복원
  useEffect(() => {
    if (!city) return
    cityRef.current = city
    try {
      const raw = localStorage.getItem(logStorageKey(city))
      setTicks(raw ? (JSON.parse(raw) as OpsLogTick[]) : [])
    } catch {
      setTicks([])
    }
  }, [city])

  // 상황실 on + 갱신 틱마다 감시 지점 스냅샷 적재 (updatedAt 동일하면 appendTick이 걸러낸다)
  useEffect(() => {
    if (!opsMode || !city || !updatedAt || watch.length === 0 || spots.length === 0) return
    const watchSet = new Set(watch)
    const sample: OpsLogTick = { at: updatedAt, spots: {} }
    for (const s of spots) {
      if (watchSet.has(s.name)) sample.spots[s.name] = { lv: s.levelNum, level: s.level }
    }
    setTicks((prev) => {
      const next = appendTick(prev, sample)
      if (next !== prev) {
        try {
          localStorage.setItem(logStorageKey(city), JSON.stringify(next))
        } catch {
          // 저장 실패(용량 등) — 메모리 로그는 유지, 다음 틱에 재시도
        }
      }
      return next
    })
  }, [opsMode, city, updatedAt, watch, spots])

  const exportCsv = useCallback(() => {
    if (!cityRef.current || ticks.length === 0) return
    const blob = new Blob([buildLogCsv(ticks)], { type: "text/csv;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = logFilename(cityRef.current, new Date())
    a.click()
    URL.revokeObjectURL(url)
  }, [ticks])

  const clear = useCallback(() => {
    setTicks([])
    if (cityRef.current) localStorage.removeItem(logStorageKey(cityRef.current))
  }, [])

  return { ticks, count: ticks.length, exportCsv, clear }
}
