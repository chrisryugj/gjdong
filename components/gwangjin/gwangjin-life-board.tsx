"use client"

// 광진 생활 패널 — /gwangjin의 메인 패널(검색·주소핀·상세가 없을 때).
// 2026-08-11 개편: 목록 하단 extra 슬롯 → 생활 우선 풀패널. 121곳용 필터·프리셋 대신
// "3초 요약 스트립 → 지하철 → 명소 혼잡 컴팩트 → 의료 → 상권 → 예약 → 행사 …" 순서.
// 데이터는 대시보드의 useGwangjinLife가 내려준다 — 패널 자체 fetch는 지하철(30초, 선택 역)뿐.

import { useCallback, useEffect, useState } from "react"
import type { CrowdSpot } from "@/lib/crowd/seoul-rtd"
import type { BaselineDelta } from "@/lib/crowd/heatmap-client"
import type { SubwayBoard } from "@/lib/gwangjin/subway"
import { KEY_GUIDES } from "@/lib/gwangjin/constants"
import { CareCard, NeedKeyNote, RainCard, SubwayCard } from "@/components/gwangjin/cards-live"
import { CmrclCard, EventsCard, ParkingCard, PopCard, ReserveCard } from "@/components/gwangjin/cards-life"
import { NowStrip, SpotsCompactCard } from "@/components/gwangjin/cards-now"
import type { CareBundle, DailyBundle, LiveBundle } from "@/components/gwangjin/use-gwangjin-life"

const STATION_STORE = "gwangjinStation"

interface GwangjinLifeBoardProps {
  live: LiveBundle | null
  care: CareBundle | null
  daily: DailyBundle | null
  spots: CrowdSpot[]
  spotsLoading: boolean
  spotsError: boolean
  light: boolean
  baseline?: Record<string, BaselineDelta> | null
  onSelectSpot: (name: string) => void
  onHoverSpot?: (name: string | null) => void
  onRetrySpots: () => void
}

export default function GwangjinLifeBoard({
  live,
  care,
  daily,
  spots,
  spotsLoading,
  spotsError,
  light,
  baseline,
  onSelectSpot,
  onHoverSpot,
  onRetrySpots,
}: GwangjinLifeBoardProps) {
  // 내 역 기억 — 매 방문 건대입구로 리셋되면 "내 앱" 감각이 안 생긴다 (ssr:false라 초기화에서 바로 읽기 안전)
  const [station, setStation] = useState(() => {
    try {
      return localStorage.getItem(STATION_STORE) ?? "건대입구"
    } catch {
      return "건대입구"
    }
  })
  const pickStation = useCallback((s: string) => {
    setStation(s)
    try {
      localStorage.setItem(STATION_STORE, s)
    } catch {
      // 시크릿 모드 등 — 세션 내 상태만 유지
    }
  }, [])

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
  const riverUp = (live?.river?.ratio ?? 0) >= 0.5

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="space-y-3 px-3 pb-4 pt-3">
        <NowStrip live={live} care={care} />
        {/* 비가 오거나 수위가 오르면 안전 카드 승격 — 평시엔 접힌 정보라 아래쪽 */}
        {(raining || riverUp) && (
          <RainCard rain={live?.rain ?? null} river={live?.river ?? null} loaded={live !== null} />
        )}
        <SubwayCard station={station} board={board} needsKey={subwayNeedsKey} onStation={pickStation} />
        <SpotsCompactCard
          spots={spots}
          loading={spotsLoading}
          error={spotsError}
          light={light}
          baseline={baseline}
          onSelect={onSelectSpot}
          onHover={onHoverSpot}
          onRetry={onRetrySpots}
        />
        <CareCard care={care} />
        {/* 지도 레이어 전용 원천들 — 활용신청 전(null)일 때만 여기서 안내 (신청 즉시 레이어가 켜진다) */}
        {daily !== null && daily.aeds === null && <NeedKeyNote guide={KEY_GUIDES.aed} />}
        {daily !== null && daily.seniors === null && <NeedKeyNote guide={KEY_GUIDES.senior} />}
        <CmrclCard cmrcl={live?.cmrcl ?? null} loaded={live !== null} />
        <ReserveCard items={daily?.reservations ?? null} loaded={daily !== null} />
        <EventsCard events={daily?.events ?? null} loaded={daily !== null} />
        {!raining && !riverUp && (
          <RainCard rain={live?.rain ?? null} river={live?.river ?? null} loaded={live !== null} />
        )}
        <PopCard />
        <ParkingCard
          parking={live?.parking ?? null}
          loaded={live !== null}
          stdCount={daily?.publicParkings?.length ?? null}
        />
      </div>
    </div>
  )
}
