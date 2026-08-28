"use client"

import { useEffect, useRef, useState } from "react"
import type { LayerGroup, Map as LeafletMap, Renderer } from "leaflet"
import type { DumpingMapData, GridCell, MapMode } from "@/lib/dumping/types"

// 100m 격자 choropleth — 960셀이라 canvas 렌더러 필수 (SVG 노드 폭발 회피, crowd-map gjTraffic 규약)
// 타일은 Esri 다크 캔버스 — CARTO basemaps는 2026-08 현재 무키 호출에 "API KEY REQUIRED" 워터마크
const TILE_URL =
  "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}"
const TILE_ATTR = "Esri, HERE, Garmin &copy; OpenStreetMap contributors"

// report.html 다크 팔레트 계승
const PAL = ["#1b2422", "#1f3b35", "#265448", "#2f7566", "#39a189", "#57ceb0"]
const DOT = "#e0776c"
const UNM_STOPS = [0, 20, 60, 150, 300, 600]
const CNT_STOPS = [0, 1, 2, 4, 8, 20]

const MODE_DEF: Record<MapMode, { idx: 4 | 5 | 6; stops: number[]; unit: string }> = {
  overlay: { idx: 6, stops: UNM_STOPS, unit: "세대" },
  unm: { idx: 6, stops: UNM_STOPS, unit: "세대" },
  comp: { idx: 4, stops: CNT_STOPS, unit: "건" },
  enf: { idx: 5, stops: CNT_STOPS, unit: "건" },
}

function colorOf(v: number, stops: number[]): string {
  for (let i = stops.length - 1; i >= 0; i--) {
    if (v > stops[i]) return PAL[Math.min(i + 1, 5)]
  }
  return PAL[0]
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
}

function cellTooltip(cell: GridCell, mode: MapMode): string {
  const dong = escapeHtml(cell[7] || "광진구")
  if (mode === "overlay")
    return `<b>${dong}</b><br/>민원 ${cell[4]}건 · 과태료 ${cell[5]}건<br/>무관리주거 ${cell[6]}세대`
  const label = mode === "unm" ? "무관리주거" : mode === "comp" ? "민원" : "과태료"
  return `<b>${dong}</b><br/>${label} ${cell[MODE_DEF[mode].idx]}${MODE_DEF[mode].unit}`
}

interface DumpingMapProps {
  data: DumpingMapData | null
  mode: MapMode
  selectedDong: string | null
}

export default function DumpingMap({ data, mode, selectedDong }: DumpingMapProps) {
  const boxRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<LeafletMap | null>(null)
  const rendererRef = useRef<Renderer | null>(null)
  const gridLayerRef = useRef<LayerGroup | null>(null)
  const boundaryDrawn = useRef(false)
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
        wheelPxPerZoomLevel: 120,
        wheelDebounceTime: 20,
      })
      L.tileLayer(TILE_URL, { maxZoom: 16, maxNativeZoom: 16, attribution: TILE_ATTR }).addTo(map)
      L.control.zoom({ position: "bottomright" }).addTo(map)
      map.createPane("dumpGrid").style.zIndex = "340"
      rendererRef.current = L.canvas({ pane: "dumpGrid" })
      const boundaryPane = map.createPane("dumpBoundary")
      boundaryPane.style.zIndex = "330"
      boundaryPane.style.pointerEvents = "none"
      mapRef.current = map
      setReady(true)
    }
    void init()
    return () => {
      cancelled = true
      mapRef.current?.remove()
      mapRef.current = null
      rendererRef.current = null
      gridLayerRef.current = null
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
        fillColor: "#05070a",
        fillOpacity: 0.55,
        interactive: false,
      }).addTo(map)
      L.polyline([...data.ring, data.ring[0]], {
        pane: "dumpBoundary",
        color: "#94a3b8",
        weight: 1.8,
        opacity: 0.7,
        dashArray: "2 6",
        interactive: false,
      }).addTo(map)
      map.fitBounds(L.latLngBounds(data.ring), { padding: [12, 12] })
    }
    void draw()
  }, [data, ready])

  // 격자 레이어 — 모드·선택동 변경마다 재구축 (960셀 canvas, 재구축 비용 낮음)
  useEffect(() => {
    const draw = async () => {
      const map = mapRef.current
      const renderer = rendererRef.current ?? undefined
      if (!map || !data) return
      const L = await import("leaflet")
      gridLayerRef.current?.remove()
      const group = L.layerGroup()
      const def = MODE_DEF[mode]

      for (const cell of data.grid) {
        const v = cell[def.idx]
        const dimmed = selectedDong !== null && cell[7] !== selectedDong
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
              fillColor: colorOf(v, def.stops),
              fillOpacity: dimmed ? 0.15 : 0.75,
            },
          )
            .bindTooltip(cellTooltip(cell, mode), { sticky: true, direction: "top", opacity: 1 })
            .addTo(group)
        }
      }

      if (mode === "overlay") {
        // 결과(민원)를 원으로 얹음 — 원인 바탕 위 결과, report.html 겹쳐보기 계승
        const busy = data.grid.filter((c) => c[4] > 0).sort((a, b) => b[4] - a[4])
        for (const cell of busy) {
          const dimmed = selectedDong !== null && cell[7] !== selectedDong
          L.circleMarker([(cell[0] + cell[2]) / 2, (cell[1] + cell[3]) / 2], {
            pane: "dumpGrid",
            renderer,
            radius: 2 + Math.pow(cell[4], 0.6) * 1.4,
            color: DOT,
            weight: 1.1,
            opacity: dimmed ? 0.25 : 0.8,
            fillColor: DOT,
            fillOpacity: dimmed ? 0.06 : 0.22,
          })
            .bindTooltip(cellTooltip(cell, mode), { sticky: true, direction: "top", opacity: 1 })
            .addTo(group)
        }
      }

      group.addTo(map)
      gridLayerRef.current = group

      if (selectedDong) {
        const cells = data.grid.filter((c) => c[7] === selectedDong)
        if (cells.length) {
          const bounds = L.latLngBounds(cells.map((c) => [c[0], c[1]] as [number, number]))
          for (const c of cells) bounds.extend([c[2], c[3]])
          map.flyToBounds(bounds, { padding: [30, 30], duration: 0.5 })
        }
      }
    }
    void draw()
  }, [data, mode, selectedDong, ready])

  return <div ref={boxRef} className="h-full w-full" />
}
