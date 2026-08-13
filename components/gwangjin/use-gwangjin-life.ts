"use client"

// 광진 생활 데이터 훅 — crowd 대시보드(city=gwangjin)에서만 마운트.
// 5분 축(/api/gwangjin: 따릉이·대기·강우·수위·주차·상권) + 의료(/care) + 하루 축(/daily).
// 지도 POI 배열과 목록 하단 생활보드 데이터를 함께 내놓는다.

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { AirNow, CmrclInfo, ParkingLot, RainInfo, RiverInfo } from "@/lib/gwangjin/env-safety"
import type { BikeStation, EvSummary, GjEvent, Library, PublicParking, SeniorCenter, Shelter, StationPoi } from "@/lib/gwangjin/life"
import type { Aed, ErRoom, Pharmacy } from "@/lib/gwangjin/emergency"
import type { BusStop } from "@/lib/gwangjin/bus"
import type { ReserveItem } from "@/lib/gwangjin/reserve"
import { gradeBySpeed, IDX_COLOR, type TrafficBundle, type TrafficLink } from "@/lib/gwangjin/traffic"
import { HOSPITAL_COORDS } from "@/lib/gwangjin/constants"

// road-links.json 형태 (scripts/clip-gwangjin-roadlinks.mjs 산출)
interface RoadGeoLink {
  i: string
  n: string
  r: string
  m: number
  p: Array<[number, number]>
}

export interface LifePoiStat {
  label: string
  value: string
  /** gj-* 상태색 클래스 접미 — 생략 시 기본 텍스트색 */
  tone?: "ok" | "warn" | "bad" | "info"
}

export interface LifePoi {
  kind: "bike" | "ev" | "shelter" | "station" | "er" | "aed" | "library" | "parking" | "pharm" | "bus" | "senior"
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
  /** kind=bus — 도착 팝업 조회 키 (5자리 ARS) */
  arsId?: string
  /** 클릭 팝업 — 주소·행정동·상태 상세·전화. 길찾기는 좌표로 항상 제공 */
  addr?: string
  dong?: string
  tel?: string
  /** 공식 홈페이지 — 있으면 팝업 액션에 링크 노출 (도서관 등) */
  url?: string
  stats?: LifePoiStat[]
}

// traffic은 마커가 아니라 폴리라인 레이어 — pois에는 안 실리고 trafficLinks로 따로 내려간다
export type LifeLayerKind = LifePoi["kind"] | "traffic"

/** 카드 → 지도 포커스 요청 — seq로 같은 대상 연속 탭도 재발동 */
export interface MapFocus {
  kind: LifePoi["kind"]
  name: string
  lat: number
  lng: number
  seq: number
}

export interface LiveBundle {
  air: AirNow | null
  rain: RainInfo | null
  river: RiverInfo | null
  parking: ParkingLot[] | null
  cmrcl: CmrclInfo[] | null
  bikes: BikeStation[] | null
  /** 12시간 내 최대 강수확률 (Open-Meteo) — 원천 실패 시 null */
  forecast: { maxRainProb: number } | null
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
  libraries: Library[] | null
  aeds: Aed[] | null
  publicParkings: PublicParking[] | null
  seniors: SeniorCenter[] | null
  busStops: BusStop[] | null
}

// 기본 켜는 레이어 — 역·응급실은 개수가 적고 상시 유용. 약국은 영업 중만 마커라 기본 켜도
// 소음이 없고(줌 게이트 14+) 생활 니즈 최상위. 따릉이 89·EV 328·쉼터 96은 옵트인
const DEFAULT_LAYERS: LifeLayerKind[] = ["station", "er", "pharm"]

const STATION_STORE = "gwangjinStation"

export function useGwangjinLife(enabled: boolean) {
  const [live, setLive] = useState<LiveBundle | null>(null)
  const [care, setCare] = useState<CareBundle | null>(null)
  const [daily, setDaily] = useState<DailyBundle | null>(null)
  const [traffic, setTraffic] = useState<TrafficBundle | null>(null)
  const [layers, setLayers] = useState<Set<LifeLayerKind>>(new Set(DEFAULT_LAYERS))

  const toggleLayer = useCallback((kind: LifeLayerKind) => {
    setLayers((prev) => {
      const next = new Set(prev)
      if (next.has(kind)) next.delete(kind)
      else next.add(kind)
      return next
    })
  }, [])

  // 내 역 — 보드 전광판과 지도 역 마커가 같은 선택을 공유한다 (SSR엔 이 값이 안 실려 초기화 안전)
  const [station, setStationState] = useState(() => {
    try {
      return localStorage.getItem(STATION_STORE) ?? "건대입구"
    } catch {
      return "건대입구"
    }
  })
  const setStation = useCallback((s: string) => {
    setStationState(s)
    try {
      localStorage.setItem(STATION_STORE, s)
    } catch {
      // 시크릿 모드 등 — 세션 내 상태만 유지
    }
  }, [])

  // 카드 → 지도: 대상 레이어를 켜고(꺼져 있으면 마커가 없다) 지도에 포커스 요청을 흘린다
  const [mapFocus, setMapFocus] = useState<MapFocus | null>(null)
  const focusSeqRef = useRef(0)
  const focusOnMap = useCallback((kind: LifePoi["kind"], name: string, lat: number, lng: number) => {
    if (lat === 0) return
    setLayers((prev) => (prev.has(kind) ? prev : new Set(prev).add(kind)))
    setMapFocus({ kind, name, lat, lng, seq: ++focusSeqRef.current })
  }, [])

  // 지도 → 카드: 역 마커 탭이 보드 전광판의 선택 역도 바꾼다 (반대 방향 연동)
  const onPoiTap = useCallback(
    (poi: LifePoi) => {
      if (poi.kind === "station" && poi.station) setStation(poi.station)
    },
    [setStation],
  )

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

  // 교통 소통 — 켠 동안만 5분 폴링 (옵트인 시점에 지연 페치). its 모드면 정적 지오메트리를
  // 코드 스플릿 청크로 1회 로드해 클라에서 조인 — 5분 폴링엔 [링크ID, 속도]만 흐른다
  const trafficOn = layers.has("traffic")
  const [roadGeo, setRoadGeo] = useState<RoadGeoLink[] | null>(null)
  useEffect(() => {
    if (!enabled || !trafficOn) return
    let alive = true
    const load = () =>
      fetch("/api/gwangjin/traffic")
        .then((r) => (r.ok ? r.json() : null))
        .then(async (d: TrafficBundle | null) => {
          if (!alive || !d) return
          setTraffic(d)
          if (d.mode === "its") {
            const mod = await import("@/lib/gwangjin/road-links.json")
            // JSON 임포트는 튜플이 number[][]로 넓혀진다 — 형태는 클립 스크립트가 보장
            if (alive) setRoadGeo((prev) => prev ?? (mod.default as unknown as { links: RoadGeoLink[] }).links)
          }
        })
        .catch(() => {})
    void load()
    const t = setInterval(() => {
      if (!document.hidden) void load()
    }, 300_000)
    return () => {
      alive = false
      clearInterval(t)
    }
  }, [enabled, trafficOn])

  // 전체도로(its) 조인 — 속도 온 링크만 그린다 (무데이터 링크까지 깔면 소음)
  const joinedTraffic = useMemo<TrafficLink[]>(() => {
    if (!traffic) return []
    if (traffic.mode === "rtd") return traffic.links
    if (!roadGeo || !traffic.speeds) return []
    const spd = new Map(traffic.speeds)
    const out: TrafficLink[] = []
    for (const l of roadGeo) {
      const s = spd.get(l.i)
      if (s == null) continue
      const idx = gradeBySpeed(s, l.m)
      out.push({ id: l.i, road: l.n, idx, spd: s, color: IDX_COLOR[idx] ?? "#94a3b8", path: l.p })
    }
    return out
  }, [traffic, roadGeo])

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
          color: h.beds != null && h.beds <= 0 ? "#7f1d1d" : "#dc2626",
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
          color: b.bikes === 0 ? "#64748b" : b.bikes <= 2 ? "#d97706" : "#65a30d",
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
    if (layers.has("pharm")) {
      // 영업 중인 약국만 — 밤에 닫힌 180개 마커는 소음이고, "지금 문 연 곳"이 이 레이어의 존재 이유
      for (const p of care?.pharmacies ?? []) {
        if (!p.openNow || p.lat === 0) continue
        out.push({
          kind: "pharm",
          name: p.name,
          lat: p.lat,
          lng: p.lng,
          sub: `영업 중 · ${p.hours}${p.lateNight ? " · 심야" : ""}`,
          color: p.lateNight ? "#065f46" : "#0ea371",
          addr: p.addr,
          tel: p.tel,
          stats: (
            [
              { label: "오늘", value: p.hours || "시간 미제공", tone: "ok" as const },
              p.lateNight ? { label: "심야", value: "22시 이후도 영업", tone: "info" as const } : null,
            ] as Array<LifePoiStat | null>
          ).filter((s): s is LifePoiStat => s != null),
        })
      }
    }
    if (layers.has("bus")) {
      for (const b of daily?.busStops ?? []) {
        out.push({
          kind: "bus",
          name: b.name,
          lat: b.lat,
          lng: b.lng,
          sub: `${b.type || "정류소"} · ${b.arsId} — 탭하면 실시간 도착`,
          color: "#0d9488",
          arsId: b.arsId,
          stats: [{ label: "정류소 번호", value: b.arsId }],
        })
      }
    }
    if (layers.has("senior")) {
      for (const s of daily?.seniors ?? []) {
        out.push({
          kind: "senior",
          name: s.name,
          lat: s.lat,
          lng: s.lng,
          sub: "경로당",
          color: "#b45309",
          addr: s.addr,
          tel: s.tel,
        })
      }
    }
    if (layers.has("aed")) {
      for (const a of daily?.aeds ?? []) {
        out.push({
          kind: "aed",
          name: a.org,
          lat: a.lat,
          lng: a.lng,
          sub: a.place ? `AED · ${a.place}` : "자동심장충격기",
          color: "#059669",
          addr: a.addr,
          tel: a.tel,
          stats: a.place ? [{ label: "설치 위치", value: a.place }] : undefined,
        })
      }
    }
    if (layers.has("library")) {
      for (const l of daily?.libraries ?? []) {
        out.push({
          kind: "library",
          name: l.name,
          lat: l.lat,
          lng: l.lng,
          sub: l.opTime ? l.opTime.replace(/평일 : /, "평일 ") : l.closeDay ? `휴관 ${l.closeDay}` : "도서관",
          color: "#7c3aed",
          addr: l.addr,
          tel: l.tel,
          url: l.url || undefined,
          stats: (
            [
              l.opTime ? { label: "운영", value: l.opTime } : null,
              l.closeDay ? { label: "휴관", value: l.closeDay } : null,
            ] as Array<LifePoiStat | null>
          ).filter((s): s is LifePoiStat => s != null),
        })
      }
    }
    if (layers.has("parking")) {
      for (const p of daily?.publicParkings ?? []) {
        out.push({
          kind: "parking",
          name: p.name,
          lat: p.lat,
          lng: p.lng,
          sub: `${p.type || "공영주차"} · ${p.fee}${p.spaces > 0 ? ` · ${p.spaces}면` : ""}`,
          color: "#2563eb",
          addr: p.addr,
          tel: p.tel,
          stats: (
            [
              { label: "요금", value: p.fee, tone: p.fee === "무료" ? ("ok" as const) : undefined },
              p.spaces > 0 ? { label: "구획", value: `${p.spaces}면` } : null,
            ] as Array<LifePoiStat | null>
          ).filter((s): s is LifePoiStat => s != null),
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
      // 약국 칩 숫자 = 지금 영업 중 수 (마커와 같은 기준 — 전체 186은 카드 목록이 담당)
      pharm: care?.pharmacies ? care.pharmacies.filter((p) => p.openNow).length : null,
      bike: live?.bikes?.length ?? null,
      ev: daily?.ev?.stations?.length ?? null,
      shelter: daily?.shelters?.length ?? null,
      aed: daily?.aeds?.length ?? null,
      library: daily?.libraries?.length ?? null,
      parking: daily?.publicParkings?.length ?? null,
      bus: daily?.busStops?.length ?? null,
      senior: daily?.seniors?.length ?? null,
      // 켜기 전엔 개수 미상(지연 페치) — null이면 칩이 숫자 없이 뜬다
      traffic: traffic === null ? null : joinedTraffic.length,
    }),
    [live, care, daily, traffic, joinedTraffic],
  )

  return {
    live,
    care,
    daily,
    layers,
    toggleLayer,
    pois,
    counts,
    trafficLinks: trafficOn ? joinedTraffic : [],
    // 폴백(rtd) 동작 중 — 보드가 ITS 활용신청 안내를 띄울 근거
    trafficNeedsKey: trafficOn && traffic?.mode === "rtd",
    station,
    setStation,
    mapFocus,
    focusOnMap,
    onPoiTap,
  }
}
