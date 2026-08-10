"use client"

// 광진 라이프 — 광진구 한정 실시간 생활상황판 (/gwangjin)
// /crowd의 .crowd-page 토큰 시스템을 그대로 입어 다크 기본 + crowd-light 테마를 공유한다.
// 폴링 축: 지하철 30초(선택 역만) · 5분 묶음(/api/gwangjin) · 의료 5분 · 하루 묶음 1회.

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { ArrowLeft, Moon, RefreshCw, Sun } from "lucide-react"
import type { CrowdSpot } from "@/lib/crowd/seoul-rtd"
import type { AirNow, CmrclInfo, ParkingLot, RainInfo, RiverInfo } from "@/lib/gwangjin/env-safety"
import type { BikeStation, EvSummary, GjEvent, Shelter } from "@/lib/gwangjin/life"
import type { ErRoom, Pharmacy } from "@/lib/gwangjin/emergency"
import type { SubwayBoard } from "@/lib/gwangjin/subway"
import { CareCard, RainCard, SpotsCard, SubwayCard } from "@/components/gwangjin/cards-live"
import { BikeCard, CmrclCard, EvCard, EventsCard, ParkingCard, PopCard, ShelterCard } from "@/components/gwangjin/cards-life"

export interface LiveBundle {
  spots: CrowdSpot[]
  air: AirNow | null
  rain: RainInfo | null
  river: RiverInfo | null
  parking: ParkingLot[] | null
  cmrcl: CmrclInfo | null
  bikes: BikeStation[] | null
}
export interface CareBundle {
  er: ErRoom[] | null
  pharmacies: Pharmacy[] | null
}
export interface DailyBundle {
  events: GjEvent[] | null
  ev: EvSummary | null
  shelters: Shelter[] | null
}

const THEME_KEY = "gwangjin-theme"

export default function GwangjinDashboard() {
  const [light, setLight] = useState(false)
  const [live, setLive] = useState<LiveBundle | null>(null)
  const [care, setCare] = useState<CareBundle | null>(null)
  const [daily, setDaily] = useState<DailyBundle | null>(null)
  const [station, setStation] = useState("건대입구")
  const [board, setBoard] = useState<SubwayBoard | null>(null)
  const [subwayNeedsKey, setSubwayNeedsKey] = useState(false)
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null)

  useEffect(() => {
    setLight(localStorage.getItem(THEME_KEY) === "light")
  }, [])
  const toggleTheme = () => {
    setLight((v) => {
      localStorage.setItem(THEME_KEY, v ? "dark" : "light")
      return !v
    })
  }

  const loadLive = useCallback(async () => {
    try {
      const r = await fetch("/api/gwangjin")
      if (r.ok) {
        setLive(await r.json())
        setUpdatedAt(new Date())
      }
    } catch {
      // 폴링 실패는 다음 주기에 재시도 — 이전 데이터 유지
    }
  }, [])
  const loadCare = useCallback(async () => {
    try {
      const r = await fetch("/api/gwangjin/care")
      if (r.ok) setCare(await r.json())
    } catch {
      // 다음 주기에 재시도
    }
  }, [])
  const loadDaily = useCallback(async () => {
    try {
      const r = await fetch("/api/gwangjin/daily")
      if (r.ok) setDaily(await r.json())
    } catch {
      // 하루 축 — 실패 시 카드가 로딩 상태로 남는다
    }
  }, [])
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
    loadLive()
    loadCare()
    loadDaily()
    const t1 = setInterval(loadLive, 300_000)
    const t2 = setInterval(loadCare, 300_000)
    return () => {
      clearInterval(t1)
      clearInterval(t2)
    }
  }, [loadLive, loadCare, loadDaily])

  useEffect(() => {
    loadBoard(station)
    const t = setInterval(() => loadBoard(station), 30_000)
    return () => clearInterval(t)
  }, [station, loadBoard])

  const refresh = () => {
    loadLive()
    loadCare()
    loadBoard(station)
  }

  return (
    <div className={`crowd-page min-h-dvh bg-[var(--cp-bg)] text-[var(--cp-text)]${light ? " crowd-light" : ""}`}>
      <div className="mx-auto max-w-3xl px-3 pb-16 pt-3 md:px-4">
        <header className="mb-3 flex items-center gap-2">
          <Link
            href="/crowd"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[var(--cp-border)] transition-colors hover:bg-[var(--cp-hover)]"
            aria-label="인파레이더로"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-[17px] font-bold text-[var(--cp-text-strong)]">광진 라이프</h1>
            <p className="truncate text-[11px] text-[var(--cp-text-dim)]">
              광진구 실시간 생활상황판
              {updatedAt && (
                <span className="ml-1.5 font-mono tabular-nums">
                  {updatedAt.toTimeString().slice(0, 5)} 갱신
                </span>
              )}
            </p>
          </div>
          <AirChip air={live?.air ?? null} rain={live?.rain ?? null} />
          <button
            type="button"
            onClick={refresh}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[var(--cp-border)] transition-colors hover:bg-[var(--cp-hover)]"
            aria-label="새로고침"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={toggleTheme}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[var(--cp-border)] transition-colors hover:bg-[var(--cp-hover)]"
            aria-label="테마 전환"
          >
            {light ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
          </button>
        </header>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <SubwayCard station={station} board={board} needsKey={subwayNeedsKey} onStation={setStation} />
          <CareCard care={care} />
          <SpotsCard spots={live?.spots ?? []} light={light} />
          <RainCard rain={live?.rain ?? null} river={live?.river ?? null} loaded={live !== null} />
          <BikeCard bikes={live?.bikes ?? null} loaded={live !== null} />
          <EvCard ev={daily?.ev ?? null} loaded={daily !== null} />
          <EventsCard events={daily?.events ?? null} loaded={daily !== null} />
          <PopCard />
          <ParkingCard parking={live?.parking ?? null} loaded={live !== null} />
          <CmrclCard cmrcl={live?.cmrcl ?? null} loaded={live !== null} />
          <ShelterCard shelters={daily?.shelters ?? null} loaded={daily !== null} />
        </div>

        <footer className="mt-6 text-center text-[10px] leading-relaxed text-[var(--cp-text-faint)]">
          출처: 서울 열린데이터광장 · 서울 실시간 도시데이터 · 국립중앙의료원 E-Gen · 환경부 · 행정안전부
          <br />
          의료·안전 정보는 참고용입니다 — 응급 시 119, 약국은 전화 확인 후 방문하세요.
        </footer>
      </div>
    </div>
  )
}

/** 헤더 상시 칩 — 대기질 등급 + 비 오면 강우량 (비 없으면 대기질만) */
function AirChip({ air, rain }: { air: AirNow | null; rain: RainInfo | null }) {
  if (!air?.grade && !rain) return null
  const raining = (rain?.mm60 ?? 0) > 0
  return (
    <div className="flex shrink-0 items-center gap-1 rounded-full border border-[var(--cp-border)] px-2.5 py-1 text-[11px]">
      {air?.grade && (
        <span>
          대기 <b className="text-[var(--cp-text-strong)]">{air.grade}</b>
        </span>
      )}
      {raining && (
        <span className="text-sky-400">
          ☔ 1h <b>{rain?.mm60.toFixed(1)}mm</b>
        </span>
      )}
    </div>
  )
}
