"use client"

// 광진 생활 패널 — /gwangjin의 메인 패널(검색·주소핀·상세가 없을 때).
// 2026-08-13 히어로+아코디언 개편: 풀카드 9장 나열 → 시간대가 뽑은 히어로 2~3장만 펼치고
// 나머지는 "핵심 수치 한 줄" 요약 행(탭=펼침). 접혀도 숫자는 다 보여 스캔이 끊기지 않는다.
//  · 심야(21~02시): 의료(약국 탭 기본)가 히어로 — 그 시간의 질문은 "문 연 약국"
//  · 주말 낮(토·일 9~19시): 행사가 히어로 — 나들이 모드
//  · 비·수위 경보는 시간대와 무관하게 최상단 승격(아코디언 밖, 항상 펼침)
// NowStrip 타일·섹션 네비 탭 = 해당 카드 펼침+점프, 네비는 scroll-spy로 현재 섹션 강조.
// 지하철 역 선택·지도 포커스는 useGwangjinLife가 소유 — 카드에서 역을 고르면 지도도 그 역으로 난다.

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { CrowdSpot } from "@/lib/crowd/seoul-rtd"
import type { BaselineDelta } from "@/lib/crowd/heatmap-client"
import type { SubwayBoard } from "@/lib/gwangjin/subway"
import { KEY_GUIDES } from "@/lib/gwangjin/constants"
import { CareCard, NeedKeyNote, RainCard, SubwayCard, type CareTab } from "@/components/gwangjin/cards-live"
import { CmrclCard, EventsCard, ParkingCard, PopCard, ReserveCard } from "@/components/gwangjin/cards-life"
import { NowStrip, SpotsCompactCard } from "@/components/gwangjin/cards-now"
import type { CareBundle, DailyBundle, LifePoi, LiveBundle } from "@/components/gwangjin/use-gwangjin-life"

/** 시간대 컨텍스트 — 카드 순서·히어로·기본 탭의 근거 */
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

// 시간대별 히어로(처음부터 펼치는 카드) — 그 시간의 질문에 답하는 상위 2~3장만
const HERO: Record<"base" | "night" | "weekend", SectionKey[]> = {
  base: ["subway", "spots"],
  night: ["subway", "care"],
  weekend: ["subway", "spots", "events"],
}

// 섹션 네비 칩 — id는 각 카드의 앵커와 1:1
const NAV: Array<{ key: SectionKey; id: string; label: string }> = [
  { key: "subway", id: "gj-subway", label: "지하철" },
  { key: "spots", id: "gj-spots", label: "혼잡" },
  { key: "care", id: "gj-care", label: "응급·약국" },
  { key: "cmrcl", id: "gj-cmrcl", label: "상권" },
  { key: "reserve", id: "gj-reserve", label: "예약" },
  { key: "events", id: "gj-events", label: "행사" },
  { key: "rain", id: "gj-rain", label: "환경" },
  { key: "pop", id: "gj-pop", label: "생활인구" },
  { key: "parking", id: "gj-parking", label: "주차" },
]
const NAV_BY_KEY = new Map(NAV.map((n) => [n.key, n]))

interface GwangjinLifeBoardProps {
  live: LiveBundle | null
  care: CareBundle | null
  daily: DailyBundle | null
  spots: CrowdSpot[]
  spotsLoading: boolean
  spotsError: boolean
  light: boolean
  baseline?: Record<string, BaselineDelta> | null
  /** 선택 역 — 훅 소유(localStorage). 지도 역 마커 탭과 카드 칩이 같은 상태를 본다 */
  station: string
  onStation: (s: string) => void
  /** 카드 행 → 지도 포커스 (레이어 자동 켬 + flyTo + 팝업) */
  onFocusPoi: (kind: LifePoi["kind"], name: string, lat: number, lng: number) => void
  /** 교통 레이어가 폴백(명소 반경) 동작 중 — ITS 활용신청 안내 노출 */
  trafficNeedsKey?: boolean
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
  station,
  onStation,
  onFocusPoi,
  trafficNeedsKey,
  onSelectSpot,
  onHoverSpot,
  onRetrySpots,
}: GwangjinLifeBoardProps) {
  // 역 선택 = 보드 전광판 전환 + 지도도 그 역으로 (카드 → 지도 방향 연동)
  const pickStation = useCallback(
    (s: string) => {
      onStation(s)
      const st = daily?.stations?.find((x) => x.base === s)
      if (st) onFocusPoi("station", `${s}역`, st.lat, st.lng)
    },
    [onStation, onFocusPoi, daily],
  )

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
  const ctx = night ? "night" : weekendDay ? "weekend" : "base"
  const [careTab, setCareTab] = useState<CareTab>(night ? "pharm" : "er")

  // 아코디언 — 히어로만 펼치고 시작, 이후엔 사용자 손이 우선
  const [open, setOpen] = useState<Set<SectionKey>>(() => new Set(HERO[ctx]))
  const toggleSection = useCallback((k: SectionKey) => {
    setOpen((prev) => {
      const next = new Set(prev)
      if (next.has(k)) next.delete(k)
      else next.add(k)
      return next
    })
  }, [])

  const raining = (live?.rain?.mm60 ?? 0) > 0
  const riverUp = (live?.river?.ratio ?? 0) >= 0.5
  const rainPromoted = raining || riverUp

  const jumpTo = useCallback((id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" })
  }, [])

  // 네비·NowStrip에서 부르는 점프는 접힌 카드를 먼저 펼친다 — 요약 행에 착지하면 죽은 점프.
  // 점프는 rAF로 한 프레임 미룬다: 펼침 커밋 전 높이로 scrollIntoView하면 최대 스크롤에 걸려 못 간다
  const expandAndJump = useCallback(
    (k: SectionKey) => {
      setOpen((prev) => (prev.has(k) ? prev : new Set(prev).add(k)))
      requestAnimationFrame(() => jumpTo(NAV_BY_KEY.get(k)?.id ?? ""))
    },
    [jumpTo],
  )

  const onStripJump = useCallback(
    (target: "rain" | "pharm" | "er" | "air") => {
      if (target === "pharm") setCareTab("pharm")
      if (target === "er") setCareTab("er")
      expandAndJump(target === "rain" || target === "air" ? "rain" : "care")
    },
    [expandAndJump],
  )

  const order = night ? ORDER_NIGHT : weekendDay ? ORDER_WEEKEND : ORDER_BASE

  // scroll-spy — 스크롤 상단 기준선(+100px)을 지난 마지막 섹션이 현재. 아코디언 여닫이로
  // 높이가 바뀌어도 rect 기준이라 안전. rAF 스로틀.
  const scrollRef = useRef<HTMLDivElement>(null)
  const [activeNav, setActiveNav] = useState<SectionKey>(order[0])
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    let raf = 0
    const measure = () => {
      const baseTop = el.getBoundingClientRect().top + 100
      // 기준선을 지난 섹션 중 가장 아래 것 — DOM 위치 기준이라 rain 승격(순서와 위치 불일치)에도 안전
      let active: SectionKey = order[0]
      let best = -Infinity
      for (const k of order) {
        const s = document.getElementById(NAV_BY_KEY.get(k)?.id ?? "")
        if (!s) continue
        const top = s.getBoundingClientRect().top
        if (top <= baseTop && top > best) {
          best = top
          active = k
        }
      }
      // 바닥에 닿으면 마지막 섹션 — 꼬리 섹션은 top이 기준선까지 올라오지 못한다
      if (el.scrollTop + el.clientHeight >= el.scrollHeight - 8) active = order[order.length - 1]
      setActiveNav(active)
    }
    const onScroll = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(measure)
    }
    el.addEventListener("scroll", onScroll, { passive: true })
    measure()
    return () => {
      el.removeEventListener("scroll", onScroll)
      cancelAnimationFrame(raf)
    }
  }, [order, open])

  // 섹션 렌더러 — 순서 배열이 곧 정보위계. rain은 승격 시 여기서 빠지고 최상단에 별도 렌더
  const collapse = (k: SectionKey) => ({ collapsed: !open.has(k), onToggle: () => toggleSection(k) })
  const sections: Record<SectionKey, React.ReactNode> = {
    subway: (
      <SubwayCard
        key="subway"
        station={station}
        board={board}
        fetchedAt={boardAt}
        needsKey={subwayNeedsKey}
        onStation={pickStation}
        {...collapse("subway")}
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
        {...collapse("spots")}
      />
    ),
    care: <CareCard key="care" care={care} tab={careTab} onTab={setCareTab} onLocate={onFocusPoi} {...collapse("care")} />,
    cmrcl: <CmrclCard key="cmrcl" cmrcl={live?.cmrcl ?? null} loaded={live !== null} {...collapse("cmrcl")} />,
    reserve: <ReserveCard key="reserve" items={daily?.reservations ?? null} loaded={daily !== null} {...collapse("reserve")} />,
    events: <EventsCard key="events" events={daily?.events ?? null} loaded={daily !== null} {...collapse("events")} />,
    rain: rainPromoted ? null : (
      <RainCard
        key="rain"
        rain={live?.rain ?? null}
        river={live?.river ?? null}
        air={live?.air ?? null}
        loaded={live !== null}
        {...collapse("rain")}
      />
    ),
    pop: <PopCard key="pop" {...collapse("pop")} />,
    parking: (
      <ParkingCard
        key="parking"
        parking={live?.parking ?? null}
        loaded={live !== null}
        stdCount={daily?.publicParkings?.length ?? null}
        {...collapse("parking")}
      />
    ),
  }

  return (
    <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto">
      <div className="space-y-3 px-3 pb-4 pt-3">
        <NowStrip live={live} care={care} spots={spots} onJump={onStripJump} />
        {/* 섹션 네비 — 긴 스크롤의 순간이동 + scroll-spy 현재 위치. 스티키라 어느 깊이에서도 손 닿는 곳에 */}
        <nav
          aria-label="생활보드 섹션 이동"
          className="scrollbar-thin sticky top-0 z-10 -mx-3 flex gap-1 overflow-x-auto bg-[var(--cp-bg)] px-3 py-1.5 [mask-image:linear-gradient(to_right,#000_calc(100%-16px),transparent)]"
        >
          {NAV.map((n) => (
            <button
              key={n.key}
              type="button"
              onClick={() => expandAndJump(n.key)}
              aria-current={activeNav === n.key ? "true" : undefined}
              className={`gj-press gj-focus min-h-7 shrink-0 whitespace-nowrap rounded-full border px-2.5 py-1 text-[11px] ${
                activeNav === n.key
                  ? "border-[var(--cp-border-active)] bg-[var(--cp-panel2)] font-medium text-[var(--cp-text-strong)]"
                  : "border-[var(--cp-border)] text-[var(--cp-text-muted)] hover:bg-[var(--cp-hover)] hover:text-[var(--cp-text)]"
              }`}
            >
              {n.label}
            </button>
          ))}
        </nav>
        {/* 비가 오거나 수위가 오르면 안전 카드 최상단 승격 — 아코디언 밖, 항상 펼침 */}
        {rainPromoted && (
          <RainCard rain={live?.rain ?? null} river={live?.river ?? null} air={live?.air ?? null} loaded={live !== null} />
        )}
        {order.map((k) => sections[k])}
        {/* 지도 레이어 전용 원천들 — 활용신청 전(null)일 때만 여기서 안내 (신청 즉시 레이어가 켜진다) */}
        {daily !== null && daily.aeds === null && <NeedKeyNote guide={KEY_GUIDES.aed} />}
        {daily !== null && daily.seniors === null && <NeedKeyNote guide={KEY_GUIDES.senior} />}
        {trafficNeedsKey && <NeedKeyNote guide={KEY_GUIDES.its} />}
      </div>
    </div>
  )
}
