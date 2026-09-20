"use client"

import { useEffect, useRef, useState } from "react"
import maplibregl, { type LngLatBoundsLike, type Map as MlMap, type PaddingOptions, type Popup as MlPopup } from "maplibre-gl"
import { Protocol } from "pmtiles"
import "maplibre-gl/dist/maplibre-gl.css"
import type { LayerId, SnowMapData } from "@/lib/snow/types"
import type { StageId } from "@/lib/snow/stage"
import { BASEMAP_BOUNDS, BASEMAP_SOURCE, buildBasemapStyle, HAS_NSDI_BUILDINGS, NSDI_SOURCE, type BasemapTheme } from "@/lib/dumping/basemap-style"
import {
  badgeColor,
  caclFC,
  casingColor,
  type ColMetric,
  dongBounds,
  dongColsFC,
  dongFC,
  dongRanks,
  focusRingFC,
  heatEndsFC,
  heatFC,
  heatFlow,
  heatGlow,
  iceEndsFC,
  iceFC,
  iceLabelFC,
  postsFC,
  resColor,
  ringFC,
  riskColor,
  saltFC,
  sandFC,
  schoolFC,
  segMid,
  slopeColor,
  slopeFC,
  weakFC,
  weakLabelFC,
} from "./map-geo"
import type { IconPoint, SnowIcons3DLayer } from "./icons3d"

// /snow 지도. /dumping 지도의 바탕(정적 pmtiles)과 "한 번 선언, 이후 setData·setPaintProperty" 규약을 따른다.
// 주인공은 열선: 밤 지도 위 유일한 난색(노랑빛 호박), 글로우 + 천천히 흐르는 점선(발열이 흐른다는 데이터 뜻). 줌아웃에서도 최소 3px.
// 그리는 순서: 마스크 › 건물(NSDI, 입체에서만) › 구·동 경계 › 급경사 추정(보라 점선) › 취약구간·결빙구간(진홍, 어두운 케이싱 위) › 열선 글로우·본선·흐름 › 자재 원 3종(평면) › 학교(평면) › 초점 고리 › 동별 기둥 › 투명 말뚝(입체 툴팁) › 3D 아이콘 › 라벨
// 지형(DEM)은 켜지 않는다(선·원이 텍스처로 구워져 뭉개진다. /dumping 18라운드 실측). 경사는 빌드 스크립트가 계산해 slopes로 준다.
// 3라운드(2026-09-20): 입체 보기에서 정보 핀은 전부 3D(icons3d.ts). 평면 원·열선 위치 점·번호 배지는 FLAT_ONLY, 투명 말뚝·3D 아이콘은 TILT_ONLY(dumping 18라운드 규약).

const S = {
  mask: "snow-mask",
  buildings: "snow-buildings",
  osmBuildings: "snow-osm-buildings",
  ring: "snow-ring",
  dongFill: "snow-dong-fill",
  dongLine: "snow-dong-line",
  dongLabel: "snow-dong-label",
  slopeCase: "snow-slope-case",
  slope: "snow-slope",
  weakCase: "snow-weak-case",
  weak: "snow-weak",
  weakLabel: "snow-weak-label",
  iceCase: "snow-ice-case",
  ice: "snow-ice",
  iceEnds: "snow-ice-ends",
  iceLabel: "snow-ice-label",
  heatGlow: "snow-heat-glow",
  heat: "snow-heat",
  heatFlow: "snow-heat-flow",
  heatEnds: "snow-heat-ends",
  salt: "snow-salt",
  cacl: "snow-cacl",
  sand: "snow-sand",
  school: "snow-school",
  schoolLabel: "snow-school-label",
  focusRing: "snow-focus-ring",
  cols: "snow-cols",
  colLabel: "snow-col-label",
  posts: "snow-posts",
} as const
const HOVER = [S.posts, S.cols, S.school, S.sand, S.salt, S.cacl, S.heat, S.weak, S.ice, S.iceEnds, S.slope]
// 평면 전용(원·점·번호 배지: 레이어 표시 effect에서 `&& !tilt`) / 입체 전용(투명 말뚝. 3D 아이콘은 커스텀 레이어 visible로)
const TILT_ONLY = [S.posts]
const TILT_PITCH = 55
const TILT_BEARING = -18
const ORBIT_DEG_PER_MS = 0.004 // 자동 회전 4도/초(한 바퀴 90초)
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
// 기둥이 땅에서 솟아오른다(dumping 18라운드). 데이터 기반 높이는 maplibre 전환(transition)이 보간하지 않아 프레임마다 배율을 올린다. 한 레이어에 하나만 돈다
const rising = new Map<string, number>()
function riseColumns(map: MlMap, id: string, ms = 900) {
  const prev = rising.get(id)
  if (prev) cancelAnimationFrame(prev)
  const t0 = performance.now()
  const step = (now: number) => {
    if (!map.getLayer(id)) return
    const f = Math.min(1, (now - t0) / ms)
    const k = 1 - Math.pow(1 - f, 3)
    map.setPaintProperty(id, "fill-extrusion-height", k >= 1 ? ["get", "h"] : ["*", ["get", "h"], k])
    if (f < 1) rising.set(id, requestAnimationFrame(step))
    else rising.delete(id)
  }
  rising.set(id, requestAnimationFrame(step))
}

export interface CameraCue {
  seq: number
  bounds?: LngLatBoundsLike
  pitch?: number
  bearing?: number
  maxZoom?: number
  duration?: number
}

// 단계별 지도 상태(대응 단계 탭·시연). 평시=열선만 살아 있음, 보강·1단계=자재 점등, 2단계=제설함 확대, 3단계=열선 없는 동 외곽 강조
export type StageView = StageId | null

interface SnowMapProps {
  data: SnowMapData | null
  layers: LayerId[]
  stageView: StageView
  colMetric: ColMetric | null
  selectedDong: string | null
  focusHeat: number[] | null // 강조할 열선 id(카드에서 취약구간·학교를 고르면)
  focusPoint: [number, number] | null // 땅 위 맥동 고리를 세울 곳([lat,lng]. 구간·발견 카드 클릭)
  tilt: boolean
  orbit: boolean // 자동 회전(시연). 사용자가 지도를 만지면 onOrbitStop
  theme: BasemapTheme
  resetSeq: number
  cameraCue?: CameraCue | null
  fitPadding?: { tl: [number, number]; br: [number, number] }
  onSelectDong?: (d: string | null) => void
  onOrbitStop?: () => void
}

export default function SnowMap({ data, layers, stageView, colMetric, selectedDong, focusHeat, focusPoint, tilt, orbit, theme, resetSeq, cameraCue, fitPadding, onSelectDong, onOrbitStop }: SnowMapProps) {
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
  const onOrbitStopRef = useRef(onOrbitStop)
  onOrbitStopRef.current = onOrbitStop
  const ringBoundsRef = useRef<LngLatBoundsLike | null>(null)
  const pendingFitRef = useRef<(() => void) | null>(null)
  // 입체 정보 핀(Three.js 커스텀 레이어, icons3d.ts). three는 무거워 지도가 뜬 뒤 동적으로 싣는다
  const iconsRef = useRef<SnowIcons3DLayer | null>(null)
  const [iconsReady, setIconsReady] = useState(false)

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
    map.easeTo({ center: cam.center, zoom, bearing, pitch: opts.pitch ?? (t ? TILT_PITCH : 0), duration: opts.duration, easing: (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2), essential: true })
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
    map.on("load", () => {
      onStyleReady()
      void import("./icons3d").then(({ SnowIcons3DLayer }) => {
        if (mapRef.current !== map) return
        const icons = new SnowIcons3DLayer()
        icons.visible = tiltRef.current
        icons.setTheme(themeRef.current === "dark")
        map.addLayer(icons, S.posts) // 투명 말뚝(툴팁 조회용) 바로 아래. 라벨은 그 위
        iconsRef.current = icons
        setIconsReady(true)
      })
    })
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
    // 사용자가 만지면 자동 회전을 멈춘다
    const stopOrbit = () => onOrbitStopRef.current?.()
    map.on("dragstart", stopOrbit)
    map.on("wheel", stopOrbit)
    map.on("touchstart", stopOrbit)
    map.on("click", (e) => {
      const m = mapRef.current
      if (!m) return
      const hit = m.queryRenderedFeatures(e.point, { layers: [S.cols, S.dongFill].filter((id) => m.getLayer(id)) })[0]
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
    // 열선 흐름: 점선 오프셋을 천천히 민다(초당 1.2 대시). 탭이 숨으면 RAF가 멈추므로 별도 처리 없음.
    // ★위상은 FLOW_STEPS개로 양자화한다(3라운드 실사고): maplibre는 dasharray마다 LineAtlas 행 하나를 쓰고 같은 값은 키로 재사용한다. 연속 실수 오프셋을 넘기면 1분쯤 뒤 아틀라스가 차서(warnOnce "LineAtlas out of space")
    // addDash가 null을 돌려주고 렌더가 예외로 끊겨 그 위 레이어(라벨·기둥·3D 핀)가 전부 사라졌다. 패턴 수를 고정하면 아틀라스에 FLOW_STEPS행만 쓴다
    let raf = 0
    let last = 0
    let lastStep = -1
    const DASH = [1.6, 2.4]
    const period = DASH[0] + DASH[1]
    const FLOW_STEPS = 24
    const r3 = (v: number) => Math.round(v * 1000) / 1000
    const step = (t: number) => {
      raf = requestAnimationFrame(step)
      if (t - last < 66 || !map.getLayer(S.heatFlow)) return
      last = t
      const k = Math.floor((((t / 1000) * 1.2) % period) / (period / FLOW_STEPS))
      if (k === lastStep) return
      lastStep = k
      const off = (k * period) / FLOW_STEPS
      // 오프셋 만큼 앞을 잘라 낸 점선 패턴(maplibre에 line-dashoffset이 없어 패턴을 회전한다)
      const a = Math.max(0.01, DASH[0] - off)
      const pattern = (off < DASH[0] ? [a, DASH[1], off, 0] : [0.01, DASH[1] - (off - DASH[0]), DASH[0], off - DASH[0]]).map(r3)
      map.setPaintProperty(S.heatFlow, "line-dasharray", pattern)
    }
    raf = requestAnimationFrame(step)
    return () => {
      cancelAnimationFrame(raf)
      observer.disconnect()
      popup.remove()
      map.remove()
      mapRef.current = null
      popupRef.current = null
      iconsRef.current = null
      setIconsReady(false)
      setReady(false)
    }
  }, [!!data])

  // 테마: 바탕 스타일을 통째로 갈고, style.load 뒤 레이어를 다시 선언한다. 커스텀 레이어(3D 아이콘)는 스타일 교체로 떨어지니 다시 붙인다
  useEffect(() => {
    const map = mapRef.current
    const d = dataRef.current
    if (!map || !ready || !d) return
    setReady(false)
    map.once("style.load", () => {
      if (mapRef.current !== map) return
      declareLayers(map)
      applyTheme(map, theme)
      const icons = iconsRef.current
      if (icons && !map.getLayer(icons.id)) {
        map.addLayer(icons, S.posts)
        icons.setTheme(theme === "dark")
      }
      setReady(true)
      setStyleSeq((v) => v + 1)
    })
    map.setStyle(buildBasemapStyle(d.ring, theme))
  }, [theme])

  // 불변 데이터(경계·동·시설·취약구간). ready마다(테마 재선언 포함) 다시 넣고 첫 회는 구 전체 맞춤
  const firstFitRef = useRef(false)
  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready || !data) return
    const ring = ringFC(data.ring)
    ringBoundsRef.current = ring.bounds
    setFC(map, S.mask, ring.mask)
    setFC(map, S.ring, ring.line)
    // NSDI 건물이 구 안을 덮으니 OSM 건물은 구 밖만(within 필터는 선언 시점엔 경계가 없어 여기서 건다)
    if (HAS_NSDI_BUILDINGS && map.getLayer(S.osmBuildings)) {
      const hole = ring.mask.features[0].geometry as GeoJSON.Polygon
      map.setFilter(S.osmBuildings, ["!", ["within", { type: "Polygon", coordinates: [hole.coordinates[1]] }]])
    }
    const dong = dongFC(data)
    setFC(map, S.dongFill, dong.lines)
    setFC(map, S.dongLine, dong.lines)
    setFC(map, S.dongLabel, dong.labels)
    setFC(map, S.heat, heatFC(data))
    setFC(map, S.heatEnds, heatEndsFC(data))
    const salt = saltFC(data)
    const cacl = caclFC(data)
    const sand = sandFC(data)
    const school = schoolFC(data)
    setFC(map, S.salt, salt)
    setFC(map, S.cacl, cacl)
    setFC(map, S.sand, sand)
    setFC(map, S.school, school)
    setFC(map, S.weak, weakFC(data))
    setFC(map, S.weakLabel, weakLabelFC(data))
    setFC(map, S.ice, iceFC(data))
    setFC(map, S.iceEnds, iceEndsFC(data))
    setFC(map, S.iceLabel, iceLabelFC(data))
    setFC(map, S.slope, slopeFC(data))
    // 입체 툴팁 자리(kind 속성으로 레이어 토글 필터)
    setFC(map, S.posts, postsFC({ type: "FeatureCollection", features: [...salt.features, ...cacl.features, ...sand.features, ...school.features] }))
    if (!firstFitRef.current) {
      firstFitRef.current = true
      fitRing(0)
    }
  }, [ready, styleSeq, data])

  // 레이어 표시 + 단계별 상태
  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return
    const dark = theme === "dark"
    const vis = (id: string, on: boolean) => map.getLayer(id) && map.setLayoutProperty(id, "visibility", on ? "visible" : "none")
    const on = (l: LayerId) => layers.includes(l)
    const st = stageView
    // 평시(calm)·보강: 자재는 대기(흐림). 1단계부터 점등. 2단계: 제설함(간선) 확대. 3단계: 열선 없는 동 외곽 진홍
    const materialsLit = st == null || st === "stage-1" || st === "stage-2" || st === "stage-3"
    const dimMat = materialsLit ? 1 : 0.28
    for (const id of [S.heat, S.heatGlow, S.heatFlow]) vis(id, on("heat"))
    vis(S.heatEnds, on("heat") && !tilt)
    vis(S.salt, on("salt") && !tilt)
    vis(S.cacl, on("cacl") && !tilt)
    vis(S.sand, on("sand") && !tilt)
    for (const id of [S.weak, S.weakCase]) vis(id, on("weak"))
    vis(S.weakLabel, on("weak") && !tilt)
    for (const id of [S.ice, S.iceCase, S.iceLabel]) vis(id, on("ice"))
    vis(S.iceEnds, on("ice") && !tilt)
    // 입체에서는 선이 있는 결빙구간 번호가 3D 숫자라 "결빙 n" 글 라벨은 선형 미확인 묶음만 남긴다
    map.setFilter(S.iceLabel, tilt ? ["==", ["get", "points"], 1] : null)
    for (const id of [S.slope, S.slopeCase]) vis(id, on("slope"))
    vis(S.school, on("school") && !tilt)
    vis(S.schoolLabel, on("school"))
    vis(S.posts, tilt)
    // 입체 툴팁 말뚝은 켜진 종류만
    const kinds = (["salt", "cacl", "sand", "school"] as LayerId[]).filter(on)
    map.setFilter(S.posts, ["in", ["get", "kind"], ["literal", kinds]])
    map.setPaintProperty(S.salt, "circle-opacity", 0.95 * dimMat)
    map.setPaintProperty(S.salt, "circle-stroke-opacity", dimMat)
    map.setPaintProperty(S.cacl, "circle-opacity", 0.92 * dimMat)
    map.setPaintProperty(S.cacl, "circle-stroke-opacity", dimMat)
    map.setPaintProperty(S.sand, "circle-opacity", 0.92 * dimMat)
    map.setPaintProperty(S.sand, "circle-stroke-opacity", dimMat)
    const saltBoost = st === "stage-2" || st === "stage-3" ? 1.6 : 1
    map.setPaintProperty(S.salt, "circle-radius", ["interpolate", ["linear"], ["zoom"], 12, 2 * saltBoost, 13.5, 3.2 * saltBoost, 15, 7 * saltBoost])
    const noHeatStroke = st === "stage-3" ? riskColor(dark) : dark ? "#6b7f8e" : "#64748b"
    map.setPaintProperty(S.dongLine, "line-color", ["case", ["==", ["get", "noHeat"], 1], noHeatStroke, dark ? "#6b7f8e" : "#64748b"])
    map.setPaintProperty(S.dongLine, "line-width", ["case", ["==", ["get", "name"], selectedDong ?? ""], 3, ["all", ["==", ["get", "noHeat"], 1], ["==", st === "stage-3" ? 1 : 0, 1]], 3, 1])
    map.setPaintProperty(S.dongLine, "line-opacity", ["case", ["==", ["get", "name"], selectedDong ?? ""], 1, ["all", ["==", ["get", "noHeat"], 1], ["==", st === "stage-3" ? 1 : 0, 1]], 0.95, 0.55])
    // 3D 아이콘도 같은 단계 문법: 흐림·제설함 확대
    const icons = iconsRef.current
    if (icons) {
      icons.setDim(["salt", "cacl", "sand", "sandCenter"], dimMat)
      icons.setBoost("salt", saltBoost)
    }
  }, [ready, styleSeq, layers, stageView, selectedDong, theme, tilt, iconsReady])

  // 3D 아이콘 점(입체 보기). 켜진 레이어의 자재·학교·열선 위치, 열선 없는 취약구간·결빙구간 번호. 새로 켜지면 솟아오른다
  useEffect(() => {
    const icons = iconsRef.current
    if (!icons || !ready || !data) return
    const on = (l: LayerId) => layers.includes(l)
    const P = (lat: number, lng: number, extra: Partial<IconPoint> = {}): IconPoint => ({ lng, lat, ...extra })
    icons.setPoints("salt", on("salt") ? data.salt.map((s) => P(s.lat, s.lng)) : [])
    icons.setPoints("cacl", on("cacl") ? data.cacl.map((c) => P(c.lat, c.lng)) : [])
    icons.setPoints("sand", on("sand") ? data.sand.filter((s) => s.kind !== "center").map((s) => P(s.lat, s.lng)) : [])
    icons.setPoints("sandCenter", on("sand") ? data.sand.filter((s) => s.kind === "center").map((s) => P(s.lat, s.lng)) : [])
    icons.setPoints("school", on("school") ? data.schools.filter((s) => s.heatNear.length).map((s) => P(s.lat, s.lng)) : [])
    icons.setPoints("schoolGap", on("school") ? data.schools.filter((s) => !s.heatNear.length).map((s) => P(s.lat, s.lng)) : [])
    icons.setPoints("heat", on("heat") ? data.heat.map((h) => P(...segMid(h.path))) : [])
    icons.setPoints("iceEnd", on("ice") ? iceEndsFC(data).features.map((f) => P((f.geometry as GeoJSON.Point).coordinates[1], (f.geometry as GeoJSON.Point).coordinates[0])) : [])
    icons.setPoints("weakBadge", on("weak") ? data.weak.filter((w) => !w.heatCovered).map((w) => P(...segMid(w.path), { rank: w.i })) : [])
    // 결빙: 선이 있는 행은 가운데, 선형 미확인 행은 제 끝점(앞 행과 공유하지 않는 쪽)
    icons.setPoints(
      "iceBadge",
      on("ice")
        ? data.ice.map((s, i) => {
            if (s.method !== "points") return P(...segMid(s.path), { rank: i + 1 })
            const prev = data.ice[i - 1]
            const sharesA = prev && prev.method === "points" && Math.abs(prev.b[0] - s.a[0]) < 1e-5 && Math.abs(prev.b[1] - s.a[1]) < 1e-5
            return P(...(sharesA ? s.b : s.a), { rank: i + 1 })
          })
        : [],
    )
  }, [ready, styleSeq, data, layers, iconsReady])

  // 열선 강조(취약구간·학교에서 고른 열선만 진하게, 나머지 흐리게)
  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return
    const f = focusHeat && focusHeat.length ? (["case", ["in", ["get", "id"], ["literal", focusHeat]], 1, 0.18] as unknown as number) : 1
    map.setPaintProperty(S.heat, "line-opacity", f)
    map.setPaintProperty(S.heatFlow, "line-opacity", focusHeat && focusHeat.length ? (["case", ["in", ["get", "id"], ["literal", focusHeat]], 0.95, 0.1] as unknown as number) : 0.95)
    map.setPaintProperty(S.heatGlow, "line-opacity", focusHeat && focusHeat.length ? (["case", ["in", ["get", "id"], ["literal", focusHeat]], 0.55, 0.08] as unknown as number) : 0.45)
  }, [ready, styleSeq, focusHeat])

  // 동별 기둥(첫 화면은 끔. 자원 현황 탭에서만). 켜지면 땅에서 솟고, 1~3위 입체 숫자는 도착 즈음
  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready || !data) return
    const accent = theme === "dark" ? ACCENT.dark : ACCENT.light
    const dark = theme === "dark"
    setFC(map, S.cols, colMetric ? dongColsFC(data, colMetric, dark, accent) : empty())
    map.setLayoutProperty(S.colLabel, "visibility", colMetric ? "visible" : "none")
    map.setLayoutProperty(S.dongLabel, "visibility", colMetric ? "none" : "visible")
    const icons = iconsRef.current
    if (!colMetric) {
      icons?.setPoints("dongRank", [])
      return
    }
    riseColumns(map, S.cols)
    const t = window.setTimeout(() => iconsRef.current?.setPoints("dongRank", dongRanks(data, colMetric, dark, accent)), 700)
    return () => window.clearTimeout(t)
  }, [ready, styleSeq, data, colMetric, theme, iconsReady])

  // 기울기·건물·평면/입체 전환
  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return
    if (map.getLayer(S.buildings)) map.setLayoutProperty(S.buildings, "visibility", tilt ? "visible" : "none")
    if (map.getLayer(S.osmBuildings)) map.setLayoutProperty(S.osmBuildings, "visibility", tilt ? "visible" : "none")
    for (const id of TILT_ONLY) if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", tilt ? "visible" : "none")
    iconsRef.current?.setVisible(tilt)
  }, [ready, styleSeq, tilt, iconsReady])
  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return
    map.easeTo({ pitch: tilt ? TILT_PITCH : 0, bearing: tilt ? TILT_BEARING : 0, duration: 700 })
  }, [ready, tilt])

  // 자동 회전(시연). 프레임마다 방위를 조금씩. 카메라 큐(easeTo)가 움직이는 동안은 기다린다(setBearing은 jumpTo라 이동을 끊는다)
  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready || !orbit) return
    let raf = 0
    let last = performance.now()
    const step = (t: number) => {
      const m = mapRef.current
      if (!m) return
      if (!m.isEasing()) m.setBearing(m.getBearing() + (t - last) * ORBIT_DEG_PER_MS)
      last = t
      raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [ready, orbit])

  // 초점 고리(구간·발견 카드 클릭): 땅 위 고리가 숨 쉬듯 맥동. 고리가 있을 때만 프레임을 돈다
  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return
    setFC(map, S.focusRing, focusRingFC(focusPoint))
    if (!focusPoint) return
    let raf = 0
    const t0 = performance.now()
    const step = (t: number) => {
      const m = mapRef.current
      if (!m || !m.getLayer(S.focusRing)) return
      const k = (Math.sin(((t - t0) / 1400) * Math.PI * 2) + 1) / 2
      m.setPaintProperty(S.focusRing, "fill-extrusion-height", 8 + k * 12)
      m.setPaintProperty(S.focusRing, "fill-extrusion-opacity", 0.5 + k * 0.45)
      raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [ready, styleSeq, focusPoint])

  // 동 선택 카메라. 해제하면 구 전체
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
    fitTo(b, { duration: cameraCue.duration ?? 1800, maxZoom: cameraCue.maxZoom, pitch: cameraCue.pitch, bearing: cameraCue.bearing })
  }, [cameraCue?.seq])

  return <div ref={boxRef} className="h-full w-full" style={{ background: "var(--dump-ground)" }} />
}

function declareLayers(map: MlMap) {
  const geojsonIds = Object.values(S).filter((id) => id !== S.buildings && id !== S.osmBuildings)
  for (const id of geojsonIds) if (!map.getSource(id)) map.addSource(id, { type: "geojson", data: empty() })
  // 바탕 라벨(places) 아래에 면·선을 넣는다
  const firstSymbol = map.getStyle().layers.find((l) => l.type === "symbol")?.id
  const under = (spec: maplibregl.LayerSpecification) => map.addLayer(spec, firstSymbol)
  const dark = true // 선언은 다크 값으로, applyTheme이 곧바로 덮는다
  const risk = riskColor(dark)
  const casing = casingColor(dark)
  const slope = slopeColor(dark)
  const heat = resColor("heat", dark)
  // 마스크는 바탕 라벨(places·roads_labels)보다 위에 둬 구 밖 지명도 같이 가라앉힌다
  map.addLayer({ id: S.mask, type: "fill", source: S.mask, paint: { "fill-color": "#0b1216", "fill-opacity": 0.7 } })
  // 건물: 구 안은 NSDI 전수(높이 없으면 층수×3.2m), 구 밖은 OSM. 중립 단색, 데이터로 칠하지 않는다
  if (HAS_NSDI_BUILDINGS) {
    under({
      id: S.buildings,
      type: "fill-extrusion",
      source: NSDI_SOURCE,
      "source-layer": "buildings",
      minzoom: 12.5,
      layout: { visibility: "none" },
      // NSDI 필드: h(높이 m)·flr(지상층수). h가 0이면 층수×3.2m, 층수도 없으면 6.4m
      paint: { "fill-extrusion-color": "#1e2830", "fill-extrusion-height": ["case", [">", ["coalesce", ["get", "h"], 0], 0], ["get", "h"], ["*", ["max", 2, ["coalesce", ["get", "flr"], 2]], 3.2]], "fill-extrusion-opacity": 1 },
    })
  }
  under({
    id: S.osmBuildings,
    type: "fill-extrusion",
    source: BASEMAP_SOURCE,
    "source-layer": "buildings",
    minzoom: 12.5,
    layout: { visibility: "none" },
    paint: { "fill-extrusion-color": "#1e2830", "fill-extrusion-height": ["coalesce", ["get", "height"], 9], "fill-extrusion-opacity": 0.5 },
  })
  under({ id: S.dongFill, type: "fill", source: S.dongFill, paint: { "fill-color": "#000000", "fill-opacity": 0 } })
  under({ id: S.ring, type: "line", source: S.ring, paint: { "line-color": "#6b7f8e", "line-width": 1.8, "line-opacity": 0.8, "line-dasharray": [2, 4] } })
  under({ id: S.dongLine, type: "line", source: S.dongLine, paint: { "line-color": "#6b7f8e", "line-width": 1, "line-opacity": 0.55 } })
  const halo = { "text-halo-color": "rgba(11,18,22,0.9)", "text-halo-width": 1.6 }
  const round = { "line-cap": "round" as const, "line-join": "round" as const }
  // 급경사 추정(보라 점선, 어두운 케이싱 위). 열선 있는 구간은 흐리게(0.35), 없는 것만 진하게. 취약 층(진홍)과 색을 나눈다
  map.addLayer({ id: S.slopeCase, type: "line", source: S.slope, layout: round, paint: { "line-color": casing, "line-width": ["interpolate", ["linear"], ["zoom"], 12, 5, 15, 7.5], "line-opacity": ["case", ["==", ["get", "heat"], 1], 0.25, 0.7] } })
  map.addLayer({ id: S.slope, type: "line", source: S.slope, layout: { "line-cap": "round" }, paint: { "line-color": slope, "line-width": ["interpolate", ["linear"], ["zoom"], 12, 2.5, 15, 4], "line-opacity": ["case", ["==", ["get", "heat"], 1], 0.35, 0.95], "line-dasharray": [1, 1.6] } })
  // 취약 층(진홍). 취약구간은 굵은 실선, 결빙구간은 더 굵은 점선. 아래에 어두운 케이싱(폭+2.5)을 깔아 도로 위에서 뜨게
  map.addLayer({ id: S.weakCase, type: "line", source: S.weak, layout: round, paint: { "line-color": casing, "line-width": ["interpolate", ["linear"], ["zoom"], 12, 5.5, 15, 7.5], "line-opacity": ["case", ["==", ["get", "status"], "heat"], 0.3, 0.8] } })
  map.addLayer({ id: S.weak, type: "line", source: S.weak, layout: round, paint: { "line-color": risk, "line-width": ["interpolate", ["linear"], ["zoom"], 12, 3, 15, 5], "line-opacity": ["case", ["==", ["get", "status"], "heat"], 0.38, 0.95] } })
  map.addLayer({ id: S.iceCase, type: "line", source: S.ice, layout: round, paint: { "line-color": casing, "line-width": ["interpolate", ["linear"], ["zoom"], 12, 6.5, 15, 9.5], "line-opacity": ["case", ["==", ["get", "status"], "heat"], 0.3, 0.8] } })
  map.addLayer({ id: S.ice, type: "line", source: S.ice, layout: round, paint: { "line-color": risk, "line-width": ["interpolate", ["linear"], ["zoom"], 12, 4, 15, 7], "line-opacity": ["case", ["==", ["get", "status"], "heat"], 0.45, 0.9], "line-dasharray": [3, 1.2] } })
  // 선형 미확인 결빙구간 끝점(선 없음): 진홍 테두리 빈 원
  map.addLayer({ id: S.iceEnds, type: "circle", source: S.iceEnds, paint: { "circle-color": "#0b1216", "circle-radius": ["interpolate", ["linear"], ["zoom"], 12, 4, 15, 7], "circle-stroke-color": risk, "circle-stroke-width": 2.2, "circle-opacity": 0.9 } })
  // 열선: 글로우 › 본선 › 흐르는 점선(밝은 심). 최소 폭 3px
  map.addLayer({ id: S.heatGlow, type: "line", source: S.heat, layout: round, paint: { "line-color": heatGlow(dark), "line-width": ["interpolate", ["linear"], ["zoom"], 12, 9, 15, ["*", ["get", "w"], 14]], "line-opacity": 0.45, "line-blur": 6 } })
  map.addLayer({ id: S.heat, type: "line", source: S.heat, layout: round, paint: { "line-color": heat, "line-width": ["interpolate", ["linear"], ["zoom"], 12, 3, 15, ["+", 4, ["*", ["get", "w"], 1.5]]], "line-opacity": 1 } })
  map.addLayer({ id: S.heatFlow, type: "line", source: S.heat, layout: { "line-cap": "butt", "line-join": "round" }, paint: { "line-color": heatFlow(dark), "line-width": ["interpolate", ["linear"], ["zoom"], 12, 1.2, 15, 2.4], "line-opacity": 0.95, "line-dasharray": [1.6, 2.4] } })
  // 자재 원 3종(평면 전용): 차가운 색 2단 + 모래색 테두리
  map.addLayer({ id: S.cacl, type: "circle", source: S.cacl, paint: { "circle-color": resColor("cacl", dark), "circle-radius": ["interpolate", ["linear"], ["zoom"], 12, 1.6, 13.5, 2.6, 15, 5.5], "circle-opacity": 0.92, "circle-stroke-color": "#0b1216", "circle-stroke-width": 0.8 } })
  map.addLayer({ id: S.salt, type: "circle", source: S.salt, paint: { "circle-color": resColor("salt", dark), "circle-radius": ["interpolate", ["linear"], ["zoom"], 12, 2, 13.5, 3.2, 15, 7], "circle-opacity": 0.95, "circle-stroke-color": "#0b1216", "circle-stroke-width": 1.2 } })
  map.addLayer({
    id: S.sand,
    type: "circle",
    source: S.sand,
    paint: {
      "circle-color": "#0b1216",
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 12, 2.2, 13.5, 3.4, 15, ["case", ["==", ["get", "center"], 1], 8.5, 6.5]],
      "circle-opacity": 0.92,
      "circle-stroke-color": resColor("sand", dark),
      "circle-stroke-width": ["case", ["==", ["get", "center"], 1], 3, 2],
    },
  })
  // 열선 위치 점(평면 전용. 자재 원 위에 그린다). 줌아웃(구 전체)에서는 100m 선이 화면 몇 px라 뭉개진다 → 구간 중점에 빛나는 점을 따로 그려 55개 위치가 보이게. 줌 14부터 선이 대신한다. 입체에서는 3D 구슬
  map.addLayer({ id: S.heatEnds, type: "circle", source: S.heatEnds, maxzoom: 14.2, paint: { "circle-color": heat, "circle-radius": ["interpolate", ["linear"], ["zoom"], 12, 4.5, 14, 6.5], "circle-opacity": ["interpolate", ["linear"], ["zoom"], 13.4, 0.95, 14.2, 0], "circle-blur": 0.45, "circle-stroke-color": heatFlow(dark), "circle-stroke-width": 1, "circle-stroke-opacity": ["interpolate", ["linear"], ["zoom"], 13.4, 0.9, 14.2, 0] } })
  // 학교(평면 전용): 작은 흰 원 + 이름(줌 14.5+)
  map.addLayer({ id: S.school, type: "circle", source: S.school, paint: { "circle-color": "#ece7dc", "circle-radius": ["interpolate", ["linear"], ["zoom"], 12, 3, 15, 5.5], "circle-stroke-color": ["case", ["==", ["get", "heat"], 1], heat, risk], "circle-stroke-width": 2 } })
  // 초점 고리(구간·발견 카드 클릭). 높이·투명도는 맥동 effect가 프레임마다 바꾼다
  map.addLayer({ id: S.focusRing, type: "fill-extrusion", source: S.focusRing, paint: { "fill-extrusion-color": ACCENT.dark, "fill-extrusion-height": 14, "fill-extrusion-opacity": 0.9, "fill-extrusion-vertical-gradient": false } })
  map.addLayer({
    id: S.cols,
    type: "fill-extrusion",
    source: S.cols,
    paint: { "fill-extrusion-color": ["get", "color"], "fill-extrusion-height": ["get", "h"], "fill-extrusion-base": 0, "fill-extrusion-opacity": 1, "fill-extrusion-vertical-gradient": true },
  })
  // 입체 툴팁 말뚝(보이지 않는 조회용, opacity 0). 모양은 3D 아이콘(icons3d)이 같은 자리에 그린다. queryRenderedFeatures는 그려진 픽셀이 아니라 도형으로 찾는다
  map.addLayer({ id: S.posts, type: "fill-extrusion", source: S.posts, layout: { visibility: "none" }, paint: { "fill-extrusion-color": "#000000", "fill-extrusion-height": ["get", "h"], "fill-extrusion-opacity": 0 } })
  map.addLayer({ id: S.schoolLabel, type: "symbol", source: S.school, minzoom: 14.3, layout: { "text-field": ["get", "name"], "text-size": 12.5, "text-font": ["Noto Sans Medium"], "text-offset": [0, 1.1], "text-anchor": "top" }, paint: { "text-color": "#ece7dc", ...halo } })
  // 취약구간 번호 배지(평면 전용. 입체는 3D 숫자). 열선 있는 구간은 흐리게
  map.addLayer({ id: S.weakLabel, type: "symbol", source: S.weakLabel, minzoom: 13.8, layout: { "text-field": ["get", "n"], "text-size": 11.5, "text-font": ["Noto Sans Medium"], "text-allow-overlap": true }, paint: { "text-color": "#ffffff", "text-halo-color": badgeColor(dark), "text-halo-width": 2.4, "text-opacity": ["case", ["==", ["get", "heat"], 1], 0.55, 1] } })
  // 결빙 라벨. 선형 미확인은 "결빙 1·2 / 선형 미확인" 두 줄을 기점 하나에만
  map.addLayer({ id: S.iceLabel, type: "symbol", source: S.iceLabel, minzoom: 12, layout: { "text-field": ["get", "text"], "text-size": 12, "text-font": ["Noto Sans Medium"], "text-allow-overlap": true, "text-anchor": ["case", ["==", ["get", "points"], 1], "top", "center"], "text-offset": ["case", ["==", ["get", "points"], 1], ["literal", [0, 0.8]], ["literal", [0, 0]]], "text-justify": "center", "text-line-height": 1.15 }, paint: { "text-color": "#ffffff", "text-halo-color": badgeColor(dark), "text-halo-width": 2.4 } })
  map.addLayer({
    id: S.dongLabel,
    type: "symbol",
    source: S.dongLabel,
    layout: { "text-field": ["get", "name"], "text-size": 13.5, "text-font": ["Noto Sans Medium"], "text-pitch-alignment": "viewport", "text-allow-overlap": true, "text-offset": [0, 0.2] },
    paint: { "text-color": "#ece7dc", "text-halo-color": "rgba(11,18,22,0.96)", "text-halo-width": 2.2 },
  })
  map.addLayer({
    id: S.colLabel,
    type: "symbol",
    source: S.cols,
    layout: { "text-field": ["get", "label"], "text-size": 12.5, "text-font": ["Noto Sans Medium"], "text-pitch-alignment": "viewport", "text-variable-anchor": ["top", "left", "right", "bottom"], "text-radial-offset": 1.2, "text-justify": "auto", "text-allow-overlap": true, visibility: "none" },
    paint: { "text-color": "#ece7dc", ...halo },
  })
}

// 테마별 색은 전부 lib/snow/labels(RESOURCES·HEAT_STYLE·RISK·RISK_STYLE)에서 읽는다. 범례·레이어 패널·시연 캡션 스와치도 같은 값
function applyTheme(map: MlMap, theme: BasemapTheme) {
  const dark = theme === "dark"
  const ink = dark ? "#ece7dc" : "#14201c"
  const halo = dark ? "rgba(11,18,22,0.9)" : "rgba(251,249,243,0.94)"
  const ground = dark ? "#0b1216" : "#fbf9f3"
  map.setPaintProperty(S.mask, "fill-color", dark ? "#0b1216" : "#ffffff")
  map.setPaintProperty(S.mask, "fill-opacity", dark ? 0.7 : 0.6)
  if (map.getLayer(S.buildings)) map.setPaintProperty(S.buildings, "fill-extrusion-color", dark ? "#1e2830" : "#d9d2c1")
  map.setPaintProperty(S.osmBuildings, "fill-extrusion-color", dark ? "#1e2830" : "#d9d2c1")
  for (const id of [S.dongLabel, S.colLabel, S.schoolLabel]) {
    map.setPaintProperty(id, "text-color", ink)
    map.setPaintProperty(id, "text-halo-color", halo)
  }
  map.setPaintProperty(S.ring, "line-color", dark ? "#6b7f8e" : "#64748b")
  const risk = riskColor(dark)
  const casing = casingColor(dark)
  for (const id of [S.weak, S.ice]) map.setPaintProperty(id, "line-color", risk)
  for (const id of [S.weakCase, S.iceCase, S.slopeCase]) map.setPaintProperty(id, "line-color", casing)
  map.setPaintProperty(S.slope, "line-color", slopeColor(dark))
  map.setPaintProperty(S.iceEnds, "circle-stroke-color", risk)
  map.setPaintProperty(S.iceEnds, "circle-color", ground)
  map.setPaintProperty(S.weakLabel, "text-halo-color", badgeColor(dark))
  map.setPaintProperty(S.iceLabel, "text-halo-color", badgeColor(dark))
  const heat = resColor("heat", dark)
  map.setPaintProperty(S.heat, "line-color", heat)
  map.setPaintProperty(S.heatGlow, "line-color", heatGlow(dark))
  map.setPaintProperty(S.heatEnds, "circle-color", heat)
  map.setPaintProperty(S.heatEnds, "circle-stroke-color", heatFlow(dark))
  map.setPaintProperty(S.heatFlow, "line-color", heatFlow(dark))
  map.setPaintProperty(S.salt, "circle-color", resColor("salt", dark))
  map.setPaintProperty(S.salt, "circle-stroke-color", ground)
  map.setPaintProperty(S.cacl, "circle-color", resColor("cacl", dark))
  map.setPaintProperty(S.cacl, "circle-stroke-color", ground)
  map.setPaintProperty(S.sand, "circle-color", ground)
  map.setPaintProperty(S.sand, "circle-stroke-color", resColor("sand", dark))
  map.setPaintProperty(S.school, "circle-color", dark ? "#ece7dc" : "#14201c")
  map.setPaintProperty(S.school, "circle-stroke-color", ["case", ["==", ["get", "heat"], 1], heat, risk])
  map.setPaintProperty(S.focusRing, "fill-extrusion-color", dark ? ACCENT.dark : ACCENT.light)
}
