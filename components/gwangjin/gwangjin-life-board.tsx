"use client"

// 광진 생활 패널 — /gwangjin의 메인 패널(검색·주소핀·상세가 없을 때).
// 2026-08-13 오케스트레이션 개편: 고정 순서 → 시간대 인지형 위계.
//  · 심야(21~02시): 의료(약국 탭 기본)가 명소보다 위 — 그 시간의 질문은 "문 연 약국"
//  · 주말 낮(토·일 9~19시): 행사·예약이 상권보다 위 — 나들이 모드
//  · 비·수위 경보는 시간대와 무관하게 최상단 승격(기존 규칙 유지)
// NowStrip 타일 탭 = 해당 카드 점프, 스티키 섹션 네비로 긴 스크롤 순간이동.
// 데이터는 대시보드의 useGwangjinLife가 내려준다 — 패널 자체 fetch는 지하철(30초, 선택 역)뿐.

import { useCallback, useEffect, useMemo, useState } from "react"
import type { CrowdSpot } from "@/lib/crowd/seoul-rtd"
import type { BaselineDelta } from "@/lib/crowd/heatmap-client"
import type { SubwayBoard } from "@/lib/gwangjin/subway"
import { KEY_GUIDES } from "@/lib/gwangjin/constants"
import { CareCard, NeedKeyNote, RainCard, SubwayCard, type CareTab } from "@/components/gwangjin/cards-live"
import { CmrclCard, EventsCard, ParkingCard, PopCard, ReserveCard } from "@/components/gwangjin/cards-life"
import { NowStrip, SpotsCompactCard } from "@/components/gwangjin/cards-now"
import type { CareBundle, DailyBundle, LiveBundle } from "@/components/gwangjin/use-gwangjin-life"

const STATION_STORE = "gwangjinStation"

/** 시간대 컨텍스트 — 카드 순서·기본 탭의 근거 */
function timeContext(d = new Date()) {
  const h = d.getHours()
  const day = d.getDay()
  const night = h >= 21 || h < 2
  const weekendDay = (day === 0 || day === 6) && h >= 9 && h < 19
  return { night, weekendDay }
}

type SectionKey = "subway" | "spots" | "care" | "cmrcl" | "reserve" | "events" | "rain" | "pop" | "parking"

// 기본(평일 낮) 위계 — 이동 > 혼잡 > 의료 > 소비 > 여가 > 환경 > 통계
const ORDER_BASE: SectionKey[] = ["subway", "spots", "care", "cmrcl", "reserve", "events", "rain", "pop", "parking"]
// 심야 — 의료 승격 (막차 정보 때문에 지하철은 그대로 1순위)
const ORDER_NIGHT: SectionKey[] = ["subway", "care", "spots", "rain", "cmrcl", "reserve", "events", "pop", "parking"]
// 주말 낮 — 나들이 모드: 행사·예약 승격
const ORDER_WEEKEND: SectionKey[] = ["subway", "spots", "events", "reserve", "care", "cmrcl", "rain", "pop", "parking"]

// 섹션 네비 칩 — id는 각 카드의 앵커와 1:1
const NAV: Array<{ key: SectionKey; id: string; label: string }> = [
  { key: "subway", id: "gj-subway", label: "지하철" },
  { key: "spots", id: "gj-spots", label: "혼잡" },
  { key: "care", id: "gj-care", label: "응급·약국" },
  { key: "cmrcl", id: "gj-cmrcl", label: "상권" },
  { key: "reserve", id: "gj-reserve", label: "예약" },
  { key: "events", id: "gj-events", label: "행사" },
  { key: "rain", id: "gj-rain", label: "비·하천" },
  { key: "pop", id: "gj-pop", label: "생활인구" },
  { key: "parking", id: "gj-parking", label: "주차" },
]

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
  // 수신 시각 — SubwayCard가 폴링 사이를 1초 카운트다운으로 메우는 기준점
  const [boardAt, setBoardAt] = useState<number | null>(null)
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
        setBoardAt(Date.now())
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

  // 시간대 컨텍스트는 마운트 시 1회 계산 — 보는 중에 자정을 넘겨도 화면이 스스로 재배열되진 않게
  const { night, weekendDay } = useMemo(() => timeContext(), [])
  const [careTab, setCareTab] = useState<CareTab>(night ? "pharm" : "er")

  const raining = (live?.rain?.mm60 ?? 0) > 0
  const riverUp = (live?.river?.ratio ?? 0) >= 0.5
  const rainPromoted = raining || riverUp

  const jumpTo = useCallback((id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" })
  }, [])

  const onStripJump = useCallback(
    (target: "rain" | "pharm" | "er") => {
      if (target === "pharm") setCareTab("pharm")
      if (target === "er") setCareTab("er")
      jumpTo(target === "rain" ? "gj-rain" : "gj-care")
    },
    [jumpTo],
  )

  const order = night ? ORDER_NIGHT : weekendDay ? ORDER_WEEKEND : ORDER_BASE

  // 섹션 렌더러 — 순서 배열이 곧 정보위계. rain은 승격 시 여기서 빠지고 최상단에 별도 렌더
  const sections: Record<SectionKey, React.ReactNode> = {
    subway: (
      <SubwayCard
        key="subway"
        station={station}
        board={board}
        fetchedAt={boardAt}
        needsKey={subwayNeedsKey}
        onStation={pickStation}
      />
    ),
    spots: (
      <SpotsCompactCard
        key="spots"
        spots={spots}
        loading={spotsLoading}
        error={spotsError}
        light={light}
        baseline={baseline}
        onSelect={onSelectSpot}
        onHover={onHoverSpot}
        onRetry={onRetrySpots}
      />
    ),
    care: <CareCard key="care" care={care} tab={careTab} onTab={setCareTab} />,
    cmrcl: <CmrclCard key="cmrcl" cmrcl={live?.cmrcl ?? null} loaded={live !== null} />,
    reserve: <ReserveCard key="reserve" items={daily?.reservations ?? null} loaded={daily !== null} />,
    events: <EventsCard key="events" events={daily?.events ?? null} loaded={daily !== null} />,
    rain: rainPromoted ? null : (
      <RainCard key="rain" rain={live?.rain ?? null} river={live?.river ?? null} loaded={live !== null} />
    ),
    pop: <PopCard key="pop" />,
    parking: (
      <ParkingCard
        key="parking"
        parking={live?.parking ?? null}
        loaded={live !== null}
        stdCount={daily?.publicParkings?.length ?? null}
      />
    ),
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="space-y-3 px-3 pb-4 pt-3">
        <NowStrip live={live} care={care} spots={spots} onJump={onStripJump} />
        {/* 섹션 네비 — 긴 스크롤의 순간이동. 스티키라 어느 깊이에서도 손 닿는 곳에 */}
        <nav
          aria-label="생활보드 섹션 이동"
          className="scrollbar-thin sticky top-0 z-10 -mx-3 flex gap-1 overflow-x-auto bg-[var(--cp-bg)] px-3 py-1.5 [mask-image:linear-gradient(to_right,#000_calc(100%-16px),transparent)]"
        >
          {NAV.map((n) => (
            <button
              key={n.key}
              type="button"
              onClick={() => jumpTo(n.id)}
              className="gj-press gj-focus min-h-7 shrink-0 whitespace-nowrap rounded-full border border-[var(--cp-border)] px-2.5 py-1 text-[11px] text-[var(--cp-text-muted)] hover:bg-[var(--cp-hover)] hover:text-[var(--cp-text)]"
            >
              {n.label}
            </button>
          ))}
        </nav>
        {/* 비가 오거나 수위가 오르면 안전 카드 최상단 승격 — 평시엔 order 배열 위치 */}
        {rainPromoted && (
          <RainCard rain={live?.rain ?? null} river={live?.river ?? null} loaded={live !== null} />
        )}
        {order.map((k) => sections[k])}
        {/* 지도 레이어 전용 원천들 — 활용신청 전(null)일 때만 여기서 안내 (신청 즉시 레이어가 켜진다) */}
        {daily !== null && daily.aeds === null && <NeedKeyNote guide={KEY_GUIDES.aed} />}
        {daily !== null && daily.seniors === null && <NeedKeyNote guide={KEY_GUIDES.senior} />}
      </div>
    </div>
  )
}
