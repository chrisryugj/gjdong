"use client"

// 광진 생활 데이터 훅 — crowd 대시보드(city=gwangjin)에서만 마운트.
// 5분 축(/api/gwangjin: 따릉이·대기·강우·수위·주차·상권) + 의료(/care) + 하루 축(/daily).
// 지도 POI 배열과 목록 하단 생활보드 데이터를 함께 내놓는다.

import { useCallback, useEffect, useMemo, useState } from "react"
import type { AirNow, CmrclInfo, ParkingLot, RainInfo, RiverInfo } from "@/lib/gwangjin/env-safety"
import type { BikeStation, EvSummary, GjEvent, Shelter, StationPoi } from "@/lib/gwangjin/life"
import type { ErRoom, Pharmacy } from "@/lib/gwangjin/emergency"
import type { ReserveItem } from "@/lib/gwangjin/reserve"
import { HOSPITAL_COORDS } from "@/lib/gwangjin/constants"

export interface LifePoiStat {
  label: string
  value: string
  /** gj-* 상태색 클래스 접미 — 생략 시 기본 텍스트색 */
  tone?: "ok" | "warn" | "bad" | "info"
}

export interface LifePoi {
  kind: "bike" | "ev" | "shelter" | "station" | "er"
  name: string
  lat: number
  lng: number
  /** 툴팁 부제 (hover 한 줄) */
  sub: string
  /** 마커 원 배경색 — station은 무시(노선색 동그라미가 대신한다) */
  color: string
  /** 우상단 꼬마 숫자 배지 (따릉이 대수·EV 가능대수·응급병상) — 없으면 생략 */
  count?: number
  /** kind=station — 노선 번호들("2","7"), 정식 노선색 동그라미로 렌더 */
  lines?: string[]
  /** kind=station — 도착 팝업 조회 키 */
  station?: string
  /** 클릭 팝업 — 주소·행정동·상태 상세·전화. 길찾기는 좌표로 항상 제공 */
  addr?: string
  dong?: string
  tel?: string
  stats?: LifePoiStat[]
}

export type LifeLayerKind = LifePoi["kind"]

export interface LiveBundle {
  air: AirNow | null
  rain: RainInfo | null
  river: RiverInfo | null
  parking: ParkingLot[] | null
  cmrcl: CmrclInfo[] | null
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
  stations: StationPoi[] | null
  reservations: ReserveItem[] | null
}

// 기본 켜는 레이어 — 역·응급실은 개수가 적고 상시 유용. 따릉이 89·EV 328·쉼터 96은 옵트인
const DEFAULT_LAYERS: LifeLayerKind[] = ["station", "er"]

export function useGwangjinLife(enabled: boolean) {
  const [live, setLive] = useState<LiveBundle | null>(null)
  const [care, setCare] = useState<CareBundle | null>(null)
  const [daily, setDaily] = useState<DailyBundle | null>(null)
  const [layers, setLayers] = useState<Set<LifeLayerKind>>(new Set(DEFAULT_LAYERS))

  const toggleLayer = useCallback((kind: LifeLayerKind) => {
    setLayers((prev) => {
      const next = new Set(prev)
      if (next.has(kind)) next.delete(kind)
      else next.add(kind)
      return next
    })
  }, [])

  useEffect(() => {
    if (!enabled) return
    let alive = true
    const loadLive = () =>
      fetch("/api/gwangjin")
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => alive && d && setLive(d))
        .catch(() => {})
    const loadCare = () =>
      fetch("/api/gwangjin/care")
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => alive && d && setCare(d))
        .catch(() => {})
    void loadLive()
    void loadCare()
    fetch("/api/gwangjin/daily")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => alive && d && setDaily(d))
      .catch(() => {})
    const t = setInterval(() => {
      if (document.hidden) return
      void loadLive()
      void loadCare()
    }, 300_000)
    return () => {
      alive = false
      clearInterval(t)
    }
  }, [enabled])

  // 켜진 레이어의 POI만 지도로 — Leaflet 마커 재생성 비용이 있어 켠 것만 넘긴다
  const pois = useMemo<LifePoi[]>(() => {
    if (!enabled) return []
    const out: LifePoi[] = []
    if (layers.has("station")) {
      for (const s of daily?.stations ?? []) {
        out.push({
          kind: "station",
          name: `${s.base}역`,
          lat: s.lat,
          lng: s.lng,
          sub: `${s.lines.map((l) => `${l}호선`).join("·")} — 탭하면 실시간 도착`,
          color: "",
          lines: s.lines,
          station: s.base,
        })
      }
    }
    if (layers.has("er")) {
      for (const h of care?.er ?? []) {
        const [lat, lng] = HOSPITAL_COORDS[h.name] ?? [0, 0]
        if (lat === 0) continue
        const bed = (label: string, v: number | null): LifePoiStat | null =>
          v == null ? null : { label, value: v <= 0 ? "포화" : String(v), tone: v <= 0 ? "bad" : v <= 3 ? "warn" : "ok" }
        out.push({
          kind: "er",
          name: h.name,
          lat,
          lng,
          sub: `응급병상 ${h.beds == null ? "?" : h.beds <= 0 ? "포화" : h.beds}${h.pediatric ? " · 소아 가능" : ""}`,
          color: h.beds != null && h.beds <= 0 ? "#991b1b" : "#e11d48",
          count: h.beds != null && h.beds > 0 ? h.beds : undefined,
          tel: h.tel,
          stats: [
            bed("응급", h.beds),
            bed("수술", h.surgery),
            bed("중환자", h.icu),
            bed("입원", h.ward),
            h.pediatric ? { label: "소아", value: "가능", tone: "ok" as const } : null,
          ].filter((s): s is LifePoiStat => s != null),
        })
      }
    }
    if (layers.has("bike")) {
      for (const b of live?.bikes ?? []) {
        out.push({
          kind: "bike",
          name: b.name,
          lat: b.lat,
          lng: b.lng,
          sub: `따릉이 ${b.bikes}대 / 거치대 ${b.racks}`,
          color: b.bikes === 0 ? "#64748b" : b.bikes <= 2 ? "#d97706" : "#00a84d",
          count: b.bikes,
          addr: b.addr,
          stats: [
            { label: "지금 대여 가능", value: `${b.bikes}대`, tone: b.bikes === 0 ? "bad" : b.bikes <= 2 ? "warn" : "ok" },
            { label: "거치대", value: String(b.racks) },
          ],
        })
      }
    }
    if (layers.has("ev")) {
      for (const s of daily?.ev?.stations ?? []) {
        if (s.lat === 0) continue
        out.push({
          kind: "ev",
          name: s.name,
          lat: s.lat,
          lng: s.lng,
          sub: `충전 가능 ${s.available} / ${s.total}`,
          color: s.available === 0 ? "#64748b" : "#0284c7",
          count: s.available,
          addr: s.addr,
          stats: [
            { label: "충전 가능", value: `${s.available}기`, tone: s.available === 0 ? "bad" : "ok" },
            { label: "전체", value: `${s.total}기` },
          ],
        })
      }
    }
    if (layers.has("shelter")) {
      for (const s of daily?.shelters ?? []) {
        if (s.lat === 0) continue
        out.push({
          kind: "shelter",
          name: s.name,
          lat: s.lat,
          lng: s.lng,
          sub: `무더위쉼터 · 수용 ${s.capacity}명`,
          color: "#0e7490",
          addr: s.addr,
          dong: s.dong,
          stats: [{ label: "수용 인원", value: `${s.capacity}명` }],
        })
      }
    }
    return out
  }, [enabled, layers, live, care, daily])

  // 칩에 병기할 개수 — 꺼진 레이어도 "무엇이 몇 개 있는지"는 보여야 켤 이유가 생긴다
  const counts = useMemo<Record<LifeLayerKind, number | null>>(
    () => ({
      station: daily?.stations?.length ?? null,
      er: care?.er?.length ?? null,
      bike: live?.bikes?.length ?? null,
      ev: daily?.ev?.stations?.length ?? null,
      shelter: daily?.shelters?.length ?? null,
    }),
    [live, care, daily],
  )

  return { live, care, daily, layers, toggleLayer, pois, counts }
}
