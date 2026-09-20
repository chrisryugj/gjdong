"use client"

import { useEffect, useRef, useState } from "react"
import maplibregl, { type LngLatBoundsLike, type Map as MlMap, type PaddingOptions, type Popup as MlPopup } from "maplibre-gl"
import { Protocol } from "pmtiles"
import "maplibre-gl/dist/maplibre-gl.css"
import type { ResourceId, SnowMapData } from "@/lib/snow/types"
import { BASEMAP_BOUNDS, BASEMAP_SOURCE, buildBasemapStyle, type BasemapTheme } from "@/lib/dumping/basemap-style"
import { caclFC, dongBounds, dongColsFC, dongFC, heatFC, RES_COLOR, ringFC, saltFC, sandFC } from "./map-geo"

// /snow 지도. /dumping 지도의 바탕(정적 pmtiles·도면지 스타일)과 "한 번 선언, 이후 setData" 규약을 그대로 따른다.
// 레이어: 구 밖 마스크 · 구 경계 · 동 외곽선·이름 · 열선(선) · 제설함·염화칼슘함·모래주머니(원) · 동별 기둥(fill-extrusion) · OSM 건물(기울일 때만)
// 지형(DEM)은 켜지 않는다. 지형을 켜면 선·원 레이어가 텍스처로 구워져 기울기에서 뭉개진다(/dumping 18라운드 실측)

const S = {
  mask: "snow-mask",
  ring: "snow-ring",
  dongLine: "snow-dong-line",
  dongLabel: "snow-dong-label",
  heatGlow: "snow-heat-glow",
  heat: "snow-heat",
  salt: "snow-salt",
  cacl: "snow-cacl",
  sand: "snow-sand",
  cols: "snow-cols",
  colLabel: "snow-col-label",
  buildings: "snow-buildings",
} as const
const HOVER = [S.cols, S.sand, S.salt, S.cacl, S.heat]
const TILT_PITCH = 58
const TILT_BEARING = -18
const ACCENT = { light: "#2a6f97", dark: "#7cc0e8" } as const

let protocolReady = false
function ensureProtocol() {
  if (protocolReady) return
  maplibregl.addProtocol("pmtiles", new Protocol().tile)
  protocolReady = true
}
const empty = (): GeoJSON.FeatureCollection => ({ type: "FeatureCollection", features: [] })
function setFC(map: MlMap, id: string, fc: GeoJSON.FeatureCollection) {
  const src = map.getSource(id) as maplibregl.GeoJSONSource | undefined
  src?.setData(fc)
}

export interface CameraCue {
  seq: number
  bounds?: LngLatBoundsLike
  pitch?: number
  bearing?: number
  maxZoom?: number
}

interface SnowMapProps {
  data: SnowMapData | null
  layers: ResourceId[] // 보이는 자원 레이어
  emphasis: ResourceId[] | null // 대응 단계가 동원하는 자원. null이면 전부 보통, 있으면 나머지는 흐리게
  colMetric: ResourceId | "all" | null // 동별 기둥 지표. null이면 기둥 없음
  selectedDong: string | null
  tilt: boolean
  theme: BasemapTheme
  resetSeq: number
  cameraCue?: CameraCue | null
  fitPadding?: { tl: [number, number]; br: [number, number] }
  onSelectDong?: (d: string | null) => void
}

export default function SnowMap({ data, layers, emphasis, colMetric, selectedDong, tilt, theme, resetSeq, cameraCue, fitPadding, onSelectDong }: SnowMapProps) {
  const boxRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MlMap | null>(null)
  const popupRef = useRef<MlPopup | null>(null)
  const [ready, setReady] = useState(false)
  // 스타일 세대. 테마 전환의 setReady(false)→(true)가 한 렌더에 묶이면 ready 의존 effect가 안 돌아 데이터가 빈 채 남는다(실측) → 선언할 때마다 올린다
  const [styleSeq, setStyleSeq] = useState(0)
  const fitPadRef = useRef(fitPadding)
  fitPadRef.current = fitPadding
  const tiltRef = useRef(tilt)
  tiltRef.current = tilt
  const themeRef = useRef(theme)
  themeRef.current = theme
  const dataRef = useRef(data)
  dataRef.current = data
  const onSelectRef = useRef(onSelectDong)
  onSelectRef.current = onSelectDong
  const ringBoundsRef = useRef<LngLatBoundsLike | null>(null)
  const pendingFitRef = useRef<(() => void) | null>(null)

  const padding = (): PaddingOptions => {
    const p = fitPadRef.current
    return p ? { top: p.tl[1], left: p.tl[0], bottom: p.br[1], right: p.br[0] } : { top: 12, left: 12, bottom: 12, right: 12 }
  }
  // 기울인 지도의 경계 맞춤: 옵션 padding이 아니라 지도 padding(setPadding)으로, maxZoom은 있을 때만 넣는다(undefined를 넘기면 NaN 카메라)
  const fitTo = (bounds: LngLatBoundsLike, opts: { duration: number; maxZoom?: number; pitch?: number; bearing?: number }) => {
    const map = mapRef.current
    if (!map) return
    const t = tiltRef.current
    const bearing = opts.bearing ?? (t ? TILT_BEARING : 0)
    map.setPadding(padding())
    const cam = map.cameraForBounds(bounds, { bearing, ...(opts.maxZoom != null ? { maxZoom: opts.maxZoom } : {}) })
    if (!cam) return
    const zoom = Math.min(opts.maxZoom ?? 99, (cam.zoom ?? map.getZoom()) - (t ? 0.25 : 0))
    map.easeTo({ center: cam.center, zoom, bearing, pitch: opts.pitch ?? (t ? TILT_PITCH : 0), duration: opts.duration })
  }
  const fitRing = (duration: number) => {
    const b = ringBoundsRef.current
    if (!b) return
    const box = boxRef.current
    if (!box || box.clientHeight === 0) {
      pendingFitRef.current = () => fitRing(0)
      return
    }
    fitTo(b, { duration })
  }

  // 지도 1회 초기화(데이터가 와야 경계로 스타일을 만든다)
  useEffect(() => {
    if (!boxRef.current || mapRef.current || !data) return
    ensureProtocol()
    const suit = getComputedStyle(document.documentElement).getPropertyValue("--font-suit").trim()
    const map = new maplibregl.Map({
      container: boxRef.current,
      style: buildBasemapStyle(data.ring, themeRef.current),
      center: [127.085, 37.546],
      zoom: 13.2,
      pitch: tiltRef.current ? TILT_PITCH : 0,
      bearing: tiltRef.current ? TILT_BEARING : 0,
      maxPitch: 68,
      minZoom: 11,
      maxBounds: BASEMAP_BOUNDS,
      attributionControl: { compact: true },
      localIdeographFontFamily: `${suit ? `${suit}, ` : ""}"Apple SD Gothic Neo", "Noto Sans KR", sans-serif`,
      canvasContextAttributes: { antialias: true },
    })
    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "bottom-right")
    mapRef.current = map
    if (process.env.NODE_ENV !== "production") (window as unknown as { __snowMap?: MlMap }).__snowMap = map
    const popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false, className: "dump-pop", maxWidth: "320px", offset: 14 })
    popupRef.current = popup

    const onStyleReady = () => {
      if (mapRef.current !== map) return
      declareLayers(map)
      applyTheme(map, themeRef.current)
      setReady(true)
      setStyleSeq((v) => v + 1)
    }
    map.on("load", onStyleReady)
    map.on("mousemove", (e) => {
      const m = mapRef.current
      if (!m) return
      const feats = m.queryRenderedFeatures(e.point, { layers: HOVER.filter((id) => m.getLayer(id)) })
      const hit = feats.find((f) => typeof f.properties?.tip === "string")
      if (!hit) {
        popup.remove()
        m.getCanvas().style.cursor = ""
        return
      }
      m.getCanvas().style.cursor = "default"
      popup.setLngLat(e.lngLat).setHTML(String(hit.properties.tip)).addTo(m)
    })
    map.on("mouseout", () => popup.remove())
    map.on("dragstart", () => popup.remove())
    map.on("click", (e) => {
      const m = mapRef.current
      if (!m) return
      const hit = m.queryRenderedFeatures(e.point, { layers: [S.cols].filter((id) => m.getLayer(id)) })[0]
      onSelectRef.current?.(hit?.properties?.name ? String(hit.properties.name) : null)
    })
    const observer = new ResizeObserver(() => {
      const m = mapRef.current
      if (!m || !boxRef.current?.isConnected) return
      m.resize()
      if (pendingFitRef.current && boxRef.current.clientHeight > 0) {
        pendingFitRef.current()
        pendingFitRef.current = null
      }
    })
    observer.observe(boxRef.current)
    return () => {
      observer.disconnect()
      popup.remove()
      map.remove()
      mapRef.current = null
      popupRef.current = null
      setReady(false)
    }
  }, [!!data])

  // 테마: 바탕 스타일을 통째로 갈고, style.load 뒤 레이어를 다시 선언한다
  useEffect(() => {
    const map = mapRef.current
    const d = dataRef.current
    if (!map || !ready || !d) return
    setReady(false)
    map.once("style.load", () => {
      if (mapRef.current !== map) return
      declareLayers(map)
      applyTheme(map, theme)
      setReady(true)
      setStyleSeq((v) => v + 1)
    })
    map.setStyle(buildBasemapStyle(d.ring, theme))
  }, [theme])

  // 불변 데이터(경계·동·시설). ready마다(테마 재선언 포함) 다시 넣고 첫 회는 구 전체 맞춤
  const firstFitRef = useRef(false)
  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready || !data) return
    const ring = ringFC(data.ring)
    ringBoundsRef.current = ring.bounds
    setFC(map, S.mask, ring.mask)
    setFC(map, S.ring, ring.line)
    const dong = dongFC(data)
    setFC(map, S.dongLine, dong.lines)
    setFC(map, S.dongLabel, dong.labels)
    setFC(map, S.heat, heatFC(data))
    setFC(map, S.salt, saltFC(data))
    setFC(map, S.cacl, caclFC(data))
    setFC(map, S.sand, sandFC(data))
    if (!firstFitRef.current) {
      firstFitRef.current = true
      fitRing(0)
    }
  }, [ready, styleSeq, data])

  // 레이어 표시·강조
  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return
    const vis = (id: string, on: boolean) => map.getLayer(id) && map.setLayoutProperty(id, "visibility", on ? "visible" : "none")
    const dim = (r: ResourceId) => (emphasis ? (emphasis.includes(r) ? 1 : 0.22) : 1)
    vis(S.heat, layers.includes("heat"))
    vis(S.heatGlow, layers.includes("heat"))
    vis(S.salt, layers.includes("salt"))
    vis(S.cacl, layers.includes("cacl"))
    vis(S.sand, layers.includes("sand"))
    map.setPaintProperty(S.heat, "line-opacity", dim("heat"))
    map.setPaintProperty(S.heatGlow, "line-opacity", 0.35 * dim("heat"))
    map.setPaintProperty(S.salt, "circle-opacity", 0.92 * dim("salt"))
    map.setPaintProperty(S.cacl, "circle-opacity", 0.9 * dim("cacl"))
    map.setPaintProperty(S.sand, "circle-opacity", 0.92 * dim("sand"))
    map.setPaintProperty(S.sand, "circle-stroke-opacity", dim("sand")) // 모래주머니는 테두리 원이라 stroke도 같이 흐리게
  }, [ready, styleSeq, layers, emphasis])

  // 동별 기둥
  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready || !data) return
    const accent = theme === "dark" ? ACCENT.dark : ACCENT.light
    setFC(map, S.cols, colMetric ? dongColsFC(data, colMetric, accent) : empty())
    map.setLayoutProperty(S.colLabel, "visibility", colMetric ? "visible" : "none")
  }, [ready, styleSeq, data, colMetric])

  // 기울기·건물
  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return
    map.setLayoutProperty(S.buildings, "visibility", tilt ? "visible" : "none")
  }, [ready, styleSeq, tilt])
  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return
    map.easeTo({ pitch: tilt ? TILT_PITCH : 0, bearing: tilt ? TILT_BEARING : 0, duration: 700 })
  }, [ready, tilt])

  // 동 선택: 외곽선 강조 + 카메라. 해제하면 구 전체
  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready || !data) return
    map.setPaintProperty(S.dongLine, "line-width", ["case", ["==", ["get", "name"], selectedDong ?? ""], 3, 1])
    map.setPaintProperty(S.dongLine, "line-opacity", ["case", ["==", ["get", "name"], selectedDong ?? ""], 1, 0.55])
  }, [ready, styleSeq, selectedDong])
  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready || !data) return
    if (selectedDong) {
      const b = dongBounds(data, selectedDong)
      if (b) fitTo(b, { duration: 900, maxZoom: 15.4 })
    } else fitRing(900)
  }, [ready, selectedDong])

  useEffect(() => {
    if (!ready || resetSeq === 0) return
    fitRing(900)
  }, [resetSeq])

  useEffect(() => {
    if (!ready || !cameraCue) return
    const b = cameraCue.bounds ?? ringBoundsRef.current
    if (!b) return
    fitTo(b, { duration: 1800, maxZoom: cameraCue.maxZoom, pitch: cameraCue.pitch, bearing: cameraCue.bearing })
  }, [cameraCue?.seq])

  return <div ref={boxRef} className="h-full w-full" style={{ background: "var(--dump-ground)" }} />
}

function declareLayers(map: MlMap) {
  for (const id of Object.values(S)) if (id !== S.buildings && !map.getSource(id)) map.addSource(id, { type: "geojson", data: empty() })
  // 바탕 라벨(places) 아래에 면·선을 넣는다
  const firstSymbol = map.getStyle().layers.find((l) => l.type === "symbol")?.id
  const under = (spec: maplibregl.LayerSpecification) => map.addLayer(spec, firstSymbol)
  under({ id: S.mask, type: "fill", source: S.mask, paint: { "fill-color": "#ffffff", "fill-opacity": 0.55 } })
  under({
    id: S.buildings,
    type: "fill-extrusion",
    source: BASEMAP_SOURCE,
    "source-layer": "buildings",
    minzoom: 12,
    layout: { visibility: "none" },
    paint: { "fill-extrusion-color": "#d9d2c1", "fill-extrusion-height": ["coalesce", ["get", "height"], 9], "fill-extrusion-opacity": 0.85 },
  })
  under({ id: S.ring, type: "line", source: S.ring, paint: { "line-color": "#64748b", "line-width": 1.8, "line-opacity": 0.8, "line-dasharray": [2, 4] } })
  under({ id: S.dongLine, type: "line", source: S.dongLine, paint: { "line-color": "#64748b", "line-width": 1, "line-opacity": 0.55 } })
  const halo = { "text-halo-color": "rgba(251,249,243,0.94)", "text-halo-width": 1.6 }
  map.addLayer({ id: S.heatGlow, type: "line", source: S.heat, layout: { "line-cap": "round" }, paint: { "line-color": RES_COLOR.heat, "line-width": ["*", ["get", "w"], 3.2], "line-opacity": 0.35, "line-blur": 3 } })
  map.addLayer({ id: S.heat, type: "line", source: S.heat, layout: { "line-cap": "round" }, paint: { "line-color": RES_COLOR.heat, "line-width": ["get", "w"], "line-opacity": 1 } })
  map.addLayer({ id: S.cacl, type: "circle", source: S.cacl, paint: { "circle-color": RES_COLOR.cacl, "circle-radius": ["interpolate", ["linear"], ["zoom"], 12, 2.2, 15, 5.5], "circle-opacity": 0.9, "circle-stroke-color": "#fbf9f3", "circle-stroke-width": 0.8 } })
  map.addLayer({ id: S.salt, type: "circle", source: S.salt, paint: { "circle-color": RES_COLOR.salt, "circle-radius": ["interpolate", ["linear"], ["zoom"], 12, 2.6, 15, 6.5], "circle-opacity": 0.92, "circle-stroke-color": "#fbf9f3", "circle-stroke-width": 1 } })
  map.addLayer({
    id: S.sand,
    type: "circle",
    source: S.sand,
    paint: {
      "circle-color": "#fbf9f3",
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 12, 3, 15, ["case", ["==", ["get", "center"], 1], 8.5, 6.5]],
      "circle-opacity": 0.92,
      "circle-stroke-color": RES_COLOR.sand,
      "circle-stroke-width": ["case", ["==", ["get", "center"], 1], 3, 2],
    },
  })
  map.addLayer({
    id: S.cols,
    type: "fill-extrusion",
    source: S.cols,
    paint: { "fill-extrusion-color": ["get", "color"], "fill-extrusion-height": ["get", "h"], "fill-extrusion-base": 0, "fill-extrusion-opacity": 0.92, "fill-extrusion-vertical-gradient": true },
  })
  map.addLayer({
    id: S.dongLabel,
    type: "symbol",
    source: S.dongLabel,
    layout: { "text-field": ["get", "name"], "text-size": 12.5, "text-font": ["Noto Sans Medium"], "text-pitch-alignment": "viewport", "text-offset": [0, 1.2] },
    paint: { "text-color": "#14201c", ...halo },
  })
  map.addLayer({
    id: S.colLabel,
    type: "symbol",
    source: S.cols,
    layout: { "text-field": ["to-string", ["get", "v"]], "text-size": 12, "text-font": ["Noto Sans Medium"], "text-pitch-alignment": "viewport", "text-offset": [0, -1.4], "text-allow-overlap": true, visibility: "none" },
    paint: { "text-color": ["get", "color"], ...halo },
  })
}

function applyTheme(map: MlMap, theme: BasemapTheme) {
  const dark = theme === "dark"
  const ink = dark ? "#ece7dc" : "#14201c"
  const halo = dark ? "rgba(16,22,26,0.9)" : "rgba(251,249,243,0.94)"
  map.setPaintProperty(S.mask, "fill-color", dark ? "#0c1114" : "#ffffff")
  map.setPaintProperty(S.buildings, "fill-extrusion-color", dark ? "#1e2830" : "#d9d2c1")
  map.setPaintProperty(S.dongLabel, "text-color", ink)
  map.setPaintProperty(S.dongLabel, "text-halo-color", halo)
  map.setPaintProperty(S.colLabel, "text-halo-color", halo)
  const stroke = dark ? "#10161a" : "#fbf9f3"
  map.setPaintProperty(S.salt, "circle-stroke-color", stroke)
  map.setPaintProperty(S.cacl, "circle-stroke-color", stroke)
  map.setPaintProperty(S.sand, "circle-color", stroke)
}
