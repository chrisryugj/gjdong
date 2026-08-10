"use client"

// 광진 생활보드 — crowd 목록 패널 하단 extra 슬롯 (인천공항 보드와 같은 자리).
// 지도에 못 얹는 정보(지하철 전광판·응급/약국·생활인구·상권·비/수위·행사·주차)를 카드로.
// 데이터는 대시보드의 useGwangjinLife가 내려준다 — 보드 자체 fetch는 지하철(30초, 선택 역)뿐.

import { useCallback, useEffect, useState } from "react"
import type { SubwayBoard } from "@/lib/gwangjin/subway"
import { CareCard, RainCard, SubwayCard } from "@/components/gwangjin/cards-live"
import { CmrclCard, EventsCard, ParkingCard, PopCard } from "@/components/gwangjin/cards-life"
import type { CareBundle, LiveBundle } from "@/components/gwangjin/use-gwangjin-life"
import type { GjEvent } from "@/lib/gwangjin/life"

interface GwangjinLifeBoardProps {
  live: LiveBundle | null
  care: CareBundle | null
  events: GjEvent[] | null
  dailyLoaded: boolean
}

export default function GwangjinLifeBoard({ live, care, events, dailyLoaded }: GwangjinLifeBoardProps) {
  const [station, setStation] = useState("건대입구")
  const [board, setBoard] = useState<SubwayBoard | null>(null)
  const [subwayNeedsKey, setSubwayNeedsKey] = useState(false)

  const loadBoard = useCallback(async (st: string) => {
    try {
      const r = await fetch(`/api/gwangjin/subway?st=${encodeURIComponent(st)}`)
      if (!r.ok) return
      const json = await r.json()
      if (json.needKey) {
        setSubwayNeedsKey(true)
        setBoard(null)
      } else {
        setSubwayNeedsKey(false)
        setBoard(json)
      }
    } catch {
      // 30초 폴링 — 이전 전광판 유지
    }
  }, [])

  useEffect(() => {
    void loadBoard(station)
    const t = setInterval(() => {
      if (!document.hidden) void loadBoard(station)
    }, 30_000)
    return () => clearInterval(t)
  }, [station, loadBoard])

  const raining = (live?.rain?.mm60 ?? 0) > 0

  return (
    <div className="border-t border-[var(--cp-border)] px-3 pb-4 pt-3">
      <h3 className="mb-2 flex items-baseline gap-2 text-[12px] font-medium uppercase tracking-wider text-[var(--cp-text-dim)]">
        광진 생활
        {live?.air?.grade && (
          <span className="normal-case tracking-normal">
            대기 <b className="text-[var(--cp-text)]">{live.air.grade}</b>
          </span>
        )}
        {raining && (
          <span className="normal-case tracking-normal text-sky-400">
            ☔ 1시간 {live?.rain?.mm60.toFixed(1)}mm
          </span>
        )}
      </h3>
      <div className="space-y-3">
        <SubwayCard station={station} board={board} needsKey={subwayNeedsKey} onStation={setStation} />
        <CareCard care={care} />
        {/* 비가 오거나 수위가 오르면 안전 카드 승격 — 평시엔 접힌 정보라 아래쪽 */}
        {(raining || (live?.river?.ratio ?? 0) >= 0.5) && (
          <RainCard rain={live?.rain ?? null} river={live?.river ?? null} loaded={live !== null} />
        )}
        <PopCard />
        <CmrclCard cmrcl={live?.cmrcl ?? null} loaded={live !== null} />
        <EventsCard events={events} loaded={dailyLoaded} />
        {!raining && (live?.river?.ratio ?? 0) < 0.5 && (
          <RainCard rain={live?.rain ?? null} river={live?.river ?? null} loaded={live !== null} />
        )}
        <ParkingCard parking={live?.parking ?? null} loaded={live !== null} />
      </div>
    </div>
  )
}
