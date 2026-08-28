"use client"

import { useEffect, useRef, useState } from "react"
import type { LayerGroup, Map as LeafletMap, Renderer } from "leaflet"
import type {
  BaseMode,
  CctvCandidate,
  CircleId,
  DumpingMapData,
  GridCell,
  InfraLayerId,
} from "@/lib/dumping/types"

// 100m 격자 choropleth — 960셀 + 인프라 최대 1,400점이라 canvas 렌더러 필수
// 타일: OSM 표준 + CSS grayscale 뮤트(globals.css .dumping-map) — CARTO는 무키 워터마크,
// Esri Light Gray는 한국 z14+ 미제공("Map data not yet available") 실측
const TILE_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png"
const TILE_ATTR = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'

// 모드별 팔레트를 분리해 "지금 뭘 보고 있는지"가 색으로 구분되게 한다
// 원인(무관리주거)=초록 · 민원=파랑 · 과태료=주황
export const PAL_GREEN = ["#e7edea", "#cfe2db", "#a8cfc2", "#7ab8a4", "#3f8f79", "#0c6155"]
export const PAL_BLUE = ["#e9eef7", "#cfddf0", "#a6c3e3", "#78a3d2", "#4377b8", "#1c4f96"]
export const PAL_AMBER = ["#f6efe3", "#eedcc0", "#e3c28c", "#d19e56", "#b07327", "#8a530e"]
const UNM_STOPS = [0, 20, 60, 150, 300, 600]
const CNT_STOPS = [0, 1, 2, 4, 8, 20]

export const INFRA_STYLE: Record<InfraLayerId, { color: string; label: string }> = {
  cctvFixed: { color: "#b45309", label: "고정 CCTV" },
  cctvMobile: { color: "#7c3aed", label: "이동식 CCTV" },
  recycling: { color: "#059669", label: "재활용정거장" },
  bins: { color: "#475569", label: "가로쓰레기통" },
}

// 바탕(면)은 하나만 — 두 히트맵을 겹치면 색이 섞여 판독 불가라 중첩 금지
export const BASE_DEF: Record<
  BaseMode,
  { idx: 4 | 5 | 6; stops: number[]; unit: string; pal: string[]; legend: string }
> = {
  unm: { idx: 6, stops: UNM_STOPS, unit: "세대", pal: PAL_GREEN, legend: "무관리주거" },
  comp: { idx: 4, stops: CNT_STOPS, unit: "건", pal: PAL_BLUE, legend: "민원" },
  enf: { idx: 5, stops: CNT_STOPS, unit: "건", pal: PAL_AMBER, legend: "과태료" },
}

// 원(점) 오버레이는 바탕 위에 자유 중첩
export const CIRCLE_DEF: Record<CircleId, { idx: 4 | 5; color: string; label: string }> = {
  comp: { idx: 4, color: "#a8322a", label: "민원" },
  enf: { idx: 5, color: "#5b21b6", label: "과태료" },
}

function colorOf(v: number, stops: number[], pal: string[]): string {
  for (let i = stops.length - 1; i >= 0; i--) {
    if (v > stops[i]) return pal[Math.min(i + 1, 5)]
  }
  return pal[0]
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
}

function cellTooltip(cell: GridCell): string {
  const dong = escapeHtml(cell[7] || "광진구")
  return `<b>${dong}</b><br/>민원 ${cell[4]}건 · 과태료 ${cell[5]}건<br/>무관리주거 ${cell[6]}세대`
}

function candidateTooltip(rank: number, c: CctvCandidate): string {
  return (
    `<b>재배치 후보 ${rank}위</b> · ${escapeHtml(c[4])}<br/>` +
    `<b>${escapeHtml(c[5] || "주소 미상 (격자 중심)")}</b> 인근<br/>` +
    `민원 ${c[2]}건 · 과태료 ${c[3]}건<br/>` +
    `<span style="color:#a8322a">발생이력 기준 자원배분 논리. 통계 효과 근거 아님</span>`
  )
}

export interface CandidateFocus {
  seq: number // 같은 후보를 연속 클릭해도 flyTo가 다시 일어나게 하는 시퀀스
  latlng: [number, number]
}

interface DumpingMapProps {
  data: DumpingMapData | null
  base: BaseMode
  circles: CircleId[]
  selectedDong: string | null
  layers: InfraLayerId[]
  showCandidates: boolean
  focusCandidate: CandidateFocus | null
  showRoutes: boolean // 청소차 관리노선 (도로청소 종합계획의 도로명 × 표준노드링크 지오메트리)
  resetSeq: number // 증가 시 구 전체 뷰로 복귀 (헤더 배너 리셋)
}

// 「2026년 도로청소 종합계획」 관리도로 — 도로명 기준(광진 구간 전체를 그림, 문서상 세부 구간과 근사)
const ROUTE_FOCUS = new Set(["천호대로", "아차산로"])
const ROUTE_GENERAL = new Set([
  "능동로", "자양로", "동일로", "뚝섬로", "구의로", "용마산로", "광나루로", "긴고랑로",
  "영화사로", "구의강변로", "워커힐로", "아차산로70길", "광나루로56길", "아차산로58길",
])

export default function DumpingMap({
  data,
  base,
  circles,
  selectedDong,
  layers,
  showCandidates,
  focusCandidate,
  showRoutes,
  resetSeq,
}: DumpingMapProps) {
  const boxRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<LeafletMap | null>(null)
  const rendererRef = useRef<Renderer | null>(null)
  const infraRendererRef = useRef<Renderer | null>(null)
  const gridLayerRef = useRef<LayerGroup | null>(null)
  const dongLayerRef = useRef<LayerGroup | null>(null)
  const infraLayerRef = useRef<LayerGroup | null>(null)
  const boundaryDrawn = useRef(false)
  const prevDongRef = useRef<string | null>(null)
  const resizeObsRef = useRef<ResizeObserver | null>(null)
  const routesLayerRef = useRef<LayerGroup | null>(null)
  // Leaflet 동적 import가 data fetch보다 늦으면 data 의존 effect가 헛돌고 끝난다 — ready로 재트리거
  const [ready, setReady] = useState(false)

  // 지도 1회 초기화
  useEffect(() => {
    let cancelled = false
    const init = async () => {
      if (!boxRef.current || mapRef.current) return
      const L = await import("leaflet")
      if (cancelled || !boxRef.current || mapRef.current) return
      const map = L.map(boxRef.current, {
        zoomControl: false,
        center: [37.546, 127.085],
        zoom: 14,
        zoomSnap: 0.25,
        wheelPxPerZoomLevel: 45,
        wheelDebounceTime: 20,
      })
      L.tileLayer(TILE_URL, { maxZoom: 18, attribution: TILE_ATTR }).addTo(map)
      L.control.zoom({ position: "bottomright" }).addTo(map)
      const gridPane = map.createPane("dumpGrid")
      gridPane.style.zIndex = "340"
      gridPane.style.transition = "opacity .35s ease" // 모드 전환 크로스페이드
      rendererRef.current = L.canvas({ pane: "dumpGrid" })
      const infraPane = map.createPane("dumpInfra")
      infraPane.style.zIndex = "360"
      infraRendererRef.current = L.canvas({ pane: "dumpInfra" })
      const boundaryPane = map.createPane("dumpBoundary")
      boundaryPane.style.zIndex = "330"
      boundaryPane.style.pointerEvents = "none"
      const dongPane = map.createPane("dumpDong")
      dongPane.style.zIndex = "350"
      dongPane.style.pointerEvents = "none"
      // 모바일 분할 핸들 등으로 컨테이너 높이가 바뀌면 Leaflet에 알림
      const observer = new ResizeObserver(() => mapRef.current?.invalidateSize())
      observer.observe(boxRef.current)
      resizeObsRef.current = observer
      mapRef.current = map
      setReady(true)
    }
    void init()
    return () => {
      cancelled = true
      resizeObsRef.current?.disconnect()
      resizeObsRef.current = null
      mapRef.current?.remove()
      mapRef.current = null
      rendererRef.current = null
      infraRendererRef.current = null
      gridLayerRef.current = null
      dongLayerRef.current = null
      infraLayerRef.current = null
      boundaryDrawn.current = false
      setReady(false)
    }
  }, [])

  // 경계(바깥 딤 + 점선 링) — 데이터 도착 후 1회
  useEffect(() => {
    const draw = async () => {
      const map = mapRef.current
      if (!map || !data || boundaryDrawn.current) return
      boundaryDrawn.current = true
      const L = await import("leaflet")
      const world: [number, number][] = [
        [85, -180],
        [85, 180],
        [-85, 180],
        [-85, -180],
      ]
      L.polygon([world, data.ring], {
        pane: "dumpBoundary",
        stroke: false,
        fillColor: "#ffffff",
        fillOpacity: 0.6,
        interactive: false,
      }).addTo(map)
      L.polyline([...data.ring, data.ring[0]], {
        pane: "dumpBoundary",
        color: "#64748b",
        weight: 1.8,
        opacity: 0.8,
        dashArray: "2 6",
        interactive: false,
      }).addTo(map)
      map.fitBounds(L.latLngBounds(data.ring), { padding: [12, 12] })
    }
    void draw()
  }, [data, ready])

  // 격자 레이어 — 바탕·원·선택동 변경마다 재구축 (canvas라 재구축 비용 낮음)
  useEffect(() => {
    const draw = async () => {
      const map = mapRef.current
      const renderer = rendererRef.current ?? undefined
      if (!map || !data) return
      const L = await import("leaflet")
      gridLayerRef.current?.remove()
      const group = L.layerGroup()
      const def = BASE_DEF[base]
      // 인프라·후보 레이어가 켜지면 격자를 자동으로 흐려 점이 확실히 보이게
      const muted = layers.length > 0 || showCandidates

      for (const cell of data.grid) {
        const v = cell[def.idx]
        const dimmed = (selectedDong !== null && cell[7] !== selectedDong) || muted
        if (v > 0) {
          L.rectangle(
            [
              [cell[0], cell[1]],
              [cell[2], cell[3]],
            ],
            {
              pane: "dumpGrid",
              renderer,
              stroke: false,
              fillColor: colorOf(v, def.stops, def.pal),
              fillOpacity: dimmed ? (muted ? 0.25 : 0.18) : 0.8,
            },
          )
            .bindTooltip(cellTooltip(cell), { sticky: true, direction: "top", opacity: 1 })
            .addTo(group)
        }
      }

      // 원 오버레이 — 선택된 지표들을 바탕 위에 중첩
      for (const cid of circles) {
        const cdef = CIRCLE_DEF[cid]
        const busy = data.grid.filter((c) => c[cdef.idx] > 0).sort((a, b) => b[cdef.idx] - a[cdef.idx])
        for (const cell of busy) {
          const v = cell[cdef.idx]
          const dimmed = (selectedDong !== null && cell[7] !== selectedDong) || muted
          L.circleMarker([(cell[0] + cell[2]) / 2, (cell[1] + cell[3]) / 2], {
            pane: "dumpGrid",
            renderer,
            radius: 2 + Math.pow(v, 0.6) * 1.4,
            color: cdef.color,
            weight: 1.1,
            opacity: dimmed ? 0.15 : 0.75,
            fillColor: cdef.color,
            fillOpacity: dimmed ? 0.04 : 0.2,
          })
            .bindTooltip(cellTooltip(cell), { sticky: true, direction: "top", opacity: 1 })
            .addTo(group)
        }
      }

      group.addTo(map)
      gridLayerRef.current = group
      // 재구축 직후 페이드인으로 전환감을 준다
      const pane = map.getPane("dumpGrid")
      if (pane) {
        pane.style.opacity = "0"
        requestAnimationFrame(() => {
          pane.style.opacity = "1"
        })
      }
    }
    void draw()
  }, [data, base, circles, selectedDong, ready, layers, showCandidates])

  // 동 경계 레이어 — 전체 동은 상시 얇게, 선택 동은 굵게 + 동 전체가 화면에 들어오게 fit
  useEffect(() => {
    const draw = async () => {
      const map = mapRef.current
      if (!map || !data) return
      const L = await import("leaflet")
      dongLayerRef.current?.remove()
      const group = L.layerGroup()
      for (const [dong, rings] of Object.entries(data.dongOutlines)) {
        if (!rings.length) continue
        const on = dong === selectedDong
        // 실제 행정동 폴리곤 링 — 선택 동은 은은한 채움까지
        L.polyline(rings as [number, number][][], {
          pane: "dumpDong",
          color: on ? "#0c6155" : "#64748b",
          weight: on ? 3.2 : 1,
          opacity: on ? 0.95 : 0.4,
          interactive: false,
        }).addTo(group)
        if (on) {
          L.polygon(rings as [number, number][][], {
            pane: "dumpDong",
            stroke: false,
            fillColor: "#0c6155",
            fillOpacity: 0.06,
            interactive: false,
          }).addTo(group)
        }
      }
      group.addTo(map)
      dongLayerRef.current = group

      if (selectedDong) {
        const rings = data.dongOutlines[selectedDong]
        if (rings?.length) {
          const pts = rings.flat() as [number, number][]
          // 과잉 줌 방지: maxZoom 캡 + 넉넉한 패딩으로 동 전체가 화면에 들어오게
          map.flyToBounds(L.latLngBounds(pts), {
            padding: [48, 48],
            maxZoom: 14.75,
            duration: 0.5,
          })
        }
      } else if (prevDongRef.current) {
        // 선택 해제 → 구 전체 뷰로 복귀 (viz 적용·해제 버튼 모두)
        map.flyToBounds(L.latLngBounds(data.ring), { padding: [12, 12], duration: 0.5 })
      }
      prevDongRef.current = selectedDong
    }
    void draw()
  }, [data, selectedDong, ready])

  // 인프라 + 재배치 후보 레이어
  useEffect(() => {
    const draw = async () => {
      const map = mapRef.current
      const renderer = infraRendererRef.current ?? undefined
      if (!map || !data) return
      const L = await import("leaflet")
      infraLayerRef.current?.remove()
      const group = L.layerGroup()

      for (const id of layers) {
        const { color } = INFRA_STYLE[id]
        for (const p of data.infra[id]) {
          L.circleMarker([p[0], p[1]], {
            pane: "dumpInfra",
            renderer,
            radius: 5,
            color: "#ffffff",
            weight: 2,
            fillColor: color,
            fillOpacity: 1,
          })
            .bindTooltip(
              `<b>${INFRA_STYLE[id].label}</b><br/>${escapeHtml(p[2])}${p[3] ? ` · ${escapeHtml(p[3])}` : ""}`,
              { sticky: true, direction: "top", opacity: 1 },
            )
            .addTo(group)
        }
      }

      if (showCandidates) {
        data.cctvCandidates.forEach((c, i) => {
          // 순위 숫자 배지 (DOM 마커 20개뿐이라 canvas 불필요)
          L.marker([c[0], c[1]], {
            pane: "dumpInfra",
            icon: L.divIcon({
              className: "",
              html: `<div class="dump-cand">${i + 1}</div>`,
              iconSize: [26, 26],
              iconAnchor: [13, 13],
            }),
          })
            .bindTooltip(candidateTooltip(i + 1, c), { sticky: true, direction: "top", opacity: 1 })
            .addTo(group)
        })
      }

      group.addTo(map)
      infraLayerRef.current = group
    }
    void draw()
  }, [data, layers, showCandidates, ready])

  // 청소차 관리노선 레이어 — road-links.json 동적 임포트(번들 제외), 도로명으로 필터
  useEffect(() => {
    const draw = async () => {
      const map = mapRef.current
      if (!map) return
      routesLayerRef.current?.remove()
      routesLayerRef.current = null
      if (!showRoutes) return
      const [L, roads] = await Promise.all([import("leaflet"), import("@/lib/gwangjin/road-links.json")])
      if (!mapRef.current) return
      const group = L.layerGroup()
      const renderer = infraRendererRef.current ?? undefined
      const linkList = (roads.default as unknown as { links: { n?: string; p: number[][] }[] }).links
      for (const link of linkList) {
        const name = link.n ?? ""
        const focus = ROUTE_FOCUS.has(name)
        if (!focus && !ROUTE_GENERAL.has(name)) continue
        L.polyline(link.p as [number, number][], {
          pane: "dumpInfra",
          renderer,
          color: focus ? "#d97706" : "#64748b",
          weight: focus ? 5 : 3,
          opacity: focus ? 0.85 : 0.6,
        })
          .bindTooltip(
            `<b>${focus ? "집중관리도로" : "일반관리도로"}</b> · ${name}<br/>` +
              (focus ? "겨울 4회/일 · 평상시 1회/일" : "평상시 1회/2일 이상") +
              `<br/><span style="color:#64748b">도로명 기준 표시(광진 구간 전체)</span>`,
            { sticky: true, direction: "top", opacity: 1 },
          )
          .addTo(group)
      }
      group.addTo(map)
      routesLayerRef.current = group
    }
    void draw()
  }, [showRoutes, ready])

  // 후보 목록 클릭 → 해당 지점으로 당겨가기
  useEffect(() => {
    if (!focusCandidate || !mapRef.current) return
    mapRef.current.flyTo(focusCandidate.latlng, 16, { duration: 0.6 })
  }, [focusCandidate])

  // 헤더 배너 리셋 → 구 전체 뷰
  useEffect(() => {
    const map = mapRef.current
    if (!resetSeq || !map || !data) return
    const run = async () => {
      const L = await import("leaflet")
      map.flyToBounds(L.latLngBounds(data.ring), { padding: [12, 12], duration: 0.5 })
    }
    void run()
  }, [resetSeq])

  return <div ref={boxRef} className="dumping-map h-full w-full bg-white" />
}
