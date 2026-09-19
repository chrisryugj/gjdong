"use client"

import { useEffect, useRef, useState } from "react"
import maplibregl, {
  type ExpressionSpecification,
  type FilterSpecification,
  type GeoJSONSource,
  type LayerSpecification,
  type LngLatBoundsLike,
  type Map as MlMap,
  type Marker as MlMarker,
  type PaddingOptions,
  type Popup as MlPopup,
} from "maplibre-gl"
import { Protocol } from "pmtiles"
import "maplibre-gl/dist/maplibre-gl.css"
import type { BaseMode, CircleId, DumpingMapData, InfraLayerId, WeatherKey } from "@/lib/dumping/types"
import type { DongMode } from "@/lib/dumping/labels"
import { BASEMAP_BOUNDS, BASEMAP_SOURCE, DEM_SOURCE, HAS_NSDI_BUILDINGS, HILLSHADE_LAYER, NSDI_SOURCE, buildBasemapStyle, type BasemapTheme } from "@/lib/dumping/basemap-style"
import {
  BASE_DEF,
  BIN_RECO_COLOR,
  CAND_COLOR,
  CAND_LABEL_COLOR,
  CAND_POST_H_M,
  CAND_POST_R_M,
  CRIT_COLOR,
  FOCUS_RING_R_M,
  NEUTRAL_BUILDING,
  POST_H_M,
  POST_R_M,
  RECO_RING_H_M,
  RECO_RING_R_M,
  ZERO_CELL,
  binRecosFC,
  candidatesFC,
  cellLookup,
  circleColumnsFC,
  circlesFC,
  criticalFC,
  dongColumnsFC,
  dongFC,
  emptyFC,
  fc,
  flyCameraAt,
  flyRouteFC,
  flySegmentMs,
  flyWaypoints,
  FLY_BEARING_DEG_PER_S,
  gridColumnsFC,
  gridFC,
  hotspotsFC,
  infraFC,
  mixHex,
  postsFC,
  radiusMetersExpr,
  ringFC,
  ringPolygon,
  ringsFC,
  routesFC,
  stepExpr,
  weatherColumnsFC,
  weatherFC,
  type CandidateFocus,
  type FC,
} from "./map-geo"

// 18라운드(2026-09-19): 입체 보기를 3D 문법으로 다시 그렸다. maplibre는 지형이 켜지면 fill·line·circle을 지형 텍스처로 굽고(건물 아래 깔림)
// fill-extrusion·symbol만 3D로 그린다. 그래서 입체에서는 ① 건물을 격자 칸 값으로 칠하고(feature-state 조인, 바탕 히트맵이 건물에 실린다)
// ② 원을 원기둥으로 ③ 시설·후보 점을 말뚝으로, 배치추천을 빈 고리로 ④ 초점·드론 목표를 땅 위 고리로 세운다. 기둥은 전부 불투명(반투명끼리 교차하면 건물이 기둥 속에 비쳤다)
// 16라운드(2026-09-19): Leaflet → MapLibre GL. 서울 3D Atlas를 보고 "지도가 분석 결론을 그림으로 말하게" 바꿨다.
// 바탕은 자체 호스팅 벡터 타일(lib/dumping/basemap-style.ts) + 건물 3D + 아차산 지형, 기둥은 진짜 입체(fill-extrusion).
// 레이어는 처음 한 번 전부 선언하고(빈 데이터) 이후에는 setData·setPaintProperty·visibility만 바꾼다(엔진 관용구, 재생성 비용 0)
// 상수·툴팁·GeoJSON 조립은 map-geo.ts(엔진 없이 테스트 가능. 이 파일은 CSS를 임포트해 tsx 테스트가 못 읽는다)
export type { CandidateFocus } from "./map-geo"
export interface CameraCue {
  seq: number
  bounds?: [[number, number], [number, number]] // [lng,lat] 최소·최대. 없으면 구 전체
  maxZoom?: number
  pitch?: number
  bearingDelta?: number // 현재 방위에서 이만큼 돌며 간다(도)
  duration?: number // ms
}

// 입체 보기 카메라. 기울기 55도·살짝 돌린 방위(구가 화면 대각선에 눕는다)
export const TILT_PITCH = 55
export const TILT_BEARING = -18
// fitBounds는 기울기를 모른다(수평 시점 기준 계산). 기울이면 화면 아래쪽 땅이 덜 보여 남쪽이 잘리니 줌을 이만큼 뺀다(1440·1024·390 실측)
const TILT_ZOOM_BACK = 0.3
const ORBIT_DEG_PER_MS = 0.004 // 자동 회전 속도(4도/초, 한 바퀴 90초)

// 파일별 소스·레이어 id
const S = {
  mask: "dump-mask",
  ring: "dump-ring",
  grid: "dump-grid",
  cols: "dump-cols",
  circles: "dump-circles",
  weather: "dump-weather",
  dongLine: "dump-dong-line",
  dongFill: "dump-dong-fill",
  dongLabel: "dump-dong-label",
  infra: "dump-infra",
  cand: "dump-cand",
  binReco: "dump-binreco",
  routes: "dump-routes",
  critCells: "dump-crit-cells",
  critCols: "dump-crit-cols",
  critLabels: "dump-crit-labels",
  hotCols: "dump-hot-cols",
  hotLabels: "dump-hot-labels",
  dongCols: "dump-dong-cols",
  dongColLabels: "dump-dong-col-labels",
  // 입체 전용(18라운드)
  circleCols: "dump-circle-cols",
  weatherCols: "dump-weather-cols",
  infraPosts: "dump-infra-posts",
  candPosts: "dump-cand-posts",
  recoRings: "dump-reco-rings",
  focusRing: "dump-focus-ring",
  flyPath: "dump-fly-path",
  flyPts: "dump-fly-pts",
} as const
// 평면(원·점)과 입체(원기둥·말뚝·고리)는 같은 데이터의 두 그림. 기울기에 따라 한쪽만 보인다
const FLAT_ONLY = [S.circles, S.weather, S.infra, S.cand, S.binReco] as string[]
const TILT_ONLY = [S.circleCols, S.weatherCols, S.infraPosts, S.candPosts, S.recoRings] as string[]
const ACCENT = { light: "#c0741a", dark: "#e39a3f" } as const
const L_BUILDINGS = "dump-buildings"
const L_BUILDINGS_NSDI = "dump-buildings-nsdi"
const L_GRID_LINE = "dump-grid-line"
const L_COL_LABEL = "dump-col-label"
const L_ROUTES_GENERAL = "dump-routes-general"
const L_ROUTES_FOCUS = "dump-routes-focus"
const L_CRIT_FILL = "dump-crit-fill"
const L_CRIT_LINE = "dump-crit-line"
const L_CAND_LABEL = "dump-cand-label"
// 호버 툴팁을 읽는 레이어. 위에 그린 것부터(queryRenderedFeatures가 위→아래 순으로 준다)
const HOVER_LAYERS = [
  L_CAND_LABEL, S.cand, S.candPosts, S.binReco, S.recoRings, S.infra, S.infraPosts, S.flyPts, S.hotLabels, S.hotCols, S.critCols, S.dongCols, L_CRIT_FILL, S.cols,
  L_ROUTES_FOCUS, L_ROUTES_GENERAL, S.weather, S.weatherCols, S.circles, S.circleCols, S.grid,
]
const BIN_RECO_ICON = "dump-binreco-icon"

let protocolReady = false
function ensureProtocol() {
  if (protocolReady) return
  const protocol = new Protocol()
  maplibregl.addProtocol("pmtiles", protocol.tile)
  protocolReady = true
}

// 점선 원 아이콘(배치추천). 스프라이트 대신 캔버스로 그려 등록
function dashedCircleIcon(size = 28): { data: ImageData; pixelRatio: number } {
  const ratio = 2
  const px = size * ratio
  const canvas = document.createElement("canvas")
  canvas.width = px
  canvas.height = px
  const ctx = canvas.getContext("2d")!
  const r = px / 2 - 3 * ratio
  ctx.beginPath()
  ctx.arc(px / 2, px / 2, r, 0, Math.PI * 2)
  ctx.fillStyle = `${BIN_RECO_COLOR}40`
  ctx.fill()
  ctx.setLineDash([3 * ratio, 3 * ratio])
  ctx.lineWidth = 2 * ratio
  ctx.strokeStyle = BIN_RECO_COLOR
  ctx.stroke()
  return { data: ctx.getImageData(0, 0, px, px), pixelRatio: ratio }
}

interface DumpingMapProps {
  data: DumpingMapData | null
  base: BaseMode
  circles: CircleId[]
  selectedDong: string | null
  layers: InfraLayerId[]
  showCandidates: boolean
  showBinRecos: boolean // 가로쓰레기통 배치추천(데이터팀) 50지점
  showHotspots: boolean // 운영·전망 탭의 예측 핫스팟 20 순위 배지
  showCritical: boolean // 집중관리 상습격자(12개월 10건+) 외곽선 강조
  focusCandidate: CandidateFocus | null
  showRoutes: boolean // 청소차 관리노선 (도로청소 종합계획의 도로명 × 표준노드링크 지오메트리)
  showDongBars: boolean // 동별 민원·과태료 3D 막대(시연용 비교 뷰)
  dongMode: DongMode // 12라운드: 동별 막대 합계·채널 스택·연도별
  dongYear: string | null
  grid3d: boolean // 격자 기둥(원 지표 건수, 5건 이상 칸)
  weather: WeatherKey | null // 날씨별 원. 켜면 보통 원 대신
  tilt: boolean // 입체 보기(기울기·건물·지형). 평면이면 위에서 내려다본 격자
  theme: BasemapTheme // 17라운드: 라이트(도면지)·다크(밤 지도). 바탕 스타일을 통째로 바꾼다
  orbit: boolean // 자동 회전(시연용). 사용자가 지도를 만지면 onOrbitStop
  fly: boolean // 드론 비행(시연용). 구 전체 → 핫스팟 상위 5곳을 천천히 돌고 돌아온다. 만지면 onOrbitStop
  onOrbitStop?: () => void
  resetSeq: number // 증가 시 구 전체 뷰로 복귀 (헤더 배너 리셋)
  // 카메라 큐(18라운드 시연): seq가 바뀌면 그 구도로 천천히 간다. bounds 없으면 구 전체. 도착 뒤 orbit이 켜져 있으면 회전이 이어진다
  cameraCue?: CameraCue | null
  fitPadding?: { tl: [number, number]; br: [number, number] } // 지도 위에 뜬 카드·열이 가리는 영역(px). 구 전체 맞춤이 보이는 부분에만 맞춘다(2026-09-18 지도 전면)
}

export default function DumpingMap({
  data,
  base,
  circles,
  selectedDong,
  layers,
  showCandidates,
  showBinRecos,
  showHotspots,
  showCritical,
  focusCandidate,
  showRoutes,
  showDongBars,
  dongMode,
  dongYear,
  grid3d,
  weather,
  tilt,
  theme,
  orbit,
  fly,
  onOrbitStop,
  resetSeq,
  fitPadding,
  cameraCue,
}: DumpingMapProps) {
  const boxRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MlMap | null>(null)
  const popupRef = useRef<MlPopup | null>(null)
  const fitPadRef = useRef(fitPadding)
  fitPadRef.current = fitPadding
  const tiltRef = useRef(tilt)
  tiltRef.current = tilt
  const onOrbitStopRef = useRef(onOrbitStop)
  onOrbitStopRef.current = onOrbitStop
  const dataRef = useRef(data)
  dataRef.current = data
  const prevDongRef = useRef<string | null>(null)
  const themeRef = useRef(theme)
  themeRef.current = theme
  const ringBoundsRef = useRef<LngLatBoundsLike | null>(null)
  // 컨테이너 높이가 0일 때(모바일 지도 접힘) 미뤄 둔 구 전체 맞춤. 높이가 생기면 ResizeObserver가 실행한다
  const pendingFitRef = useRef<(() => void) | null>(null)
  // 스타일·레이어가 다 선언된 뒤에야 데이터 effect가 돈다. 데이터가 먼저 와도 ready로 재트리거
  const [ready, setReady] = useState(false)
  // 드론 비행 안내(지도 위 띠): 몇 번째 구간, 어디로 가는지
  const [flyInfo, setFlyInfo] = useState<{ i: number; total: number; label: string } | null>(null)
  // 건물 조인(18라운드): 격자 칸 값을 건물 feature-state로. 처리한 건물 id는 기억해 두고, 스타일을 갈면(테마) 상태가 사라지니 비운다
  const joinedRef = useRef<Set<string>>(new Set())
  const lookupRef = useRef<((lat: number, lng: number) => number) | null>(null)
  const joinRef = useRef<(() => void) | null>(null)
  const focusMarkerRef = useRef<MlMarker | null>(null) // 초점 라벨(글자는 DOM). 고리는 지도 레이어(S.focusRing)

  const padding = (): PaddingOptions => {
    const p = fitPadRef.current
    return p ? { top: p.tl[1], left: p.tl[0], bottom: p.br[1], right: p.br[0] } : { top: 12, left: 12, bottom: 12, right: 12 }
  }
  // 경계 상자에 맞춤. fitBounds가 기울기를 모르니 카메라를 직접 계산해 기울기·방위를 얹는다.
  // 가린 영역은 옵션 padding이 아니라 지도의 padding(setPadding)으로 준다: 옵션 padding은 수평 시점 기준 픽셀만큼 중심을 옮기는 방식이라
  // 기울이면 어긋나고(모바일 시트 뒤로 구가 숨던 실측), 지도 padding은 화면의 중심점 자체를 옮겨 기울기와 무관하게 보이는 영역 가운데에 놓는다.
  // 덕분에 flyTo(후보 초점)도 카드 뒤가 아니라 보이는 영역 가운데로 온다
  const fitTo = (bounds: LngLatBoundsLike, opts: { pad?: PaddingOptions; maxZoom?: number; duration: number; keepBearing?: boolean }) => {
    const map = mapRef.current
    if (!map) return
    const t = tiltRef.current
    const bearing = opts.keepBearing ? map.getBearing() : t ? TILT_BEARING : 0
    map.setPadding(opts.pad ?? padding())
    // maxZoom 키를 undefined로 넘기면 maplibre extend가 기본값을 덮어 NaN 카메라가 된다(실측). 있을 때만 넣는다
    const cam = map.cameraForBounds(bounds, { bearing, ...(opts.maxZoom != null ? { maxZoom: opts.maxZoom } : {}) })
    if (!cam) return
    const zoom = Math.min(opts.maxZoom ?? 99, (cam.zoom ?? map.getZoom()) - (t ? TILT_ZOOM_BACK : 0))
    map.easeTo({ center: cam.center, zoom, bearing, pitch: t ? TILT_PITCH : 0, duration: opts.duration })
  }

  // 지도 1회 초기화. 스타일은 구 경계가 필요해(구 안 OSM 동 라벨 숨김) 데이터가 온 뒤에 만든다
  useEffect(() => {
    if (!boxRef.current || mapRef.current || !data) return
    ensureProtocol()
    // 한글 글리프는 브라우저 서체로. next/font가 만든 SUIT 패밀리 이름을 CSS 변수에서 읽는다
    const suit = getComputedStyle(document.documentElement).getPropertyValue("--font-suit").trim()
    const map = new maplibregl.Map({
      container: boxRef.current,
      style: buildBasemapStyle(data.ring, themeRef.current),
      center: [127.085, 37.546],
      zoom: 13.4,
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
    // 개발 진단용 손잡이(프로덕션 번들에는 안 실린다). Playwright에서 레이어·feature-state를 들여다볼 때
    if (process.env.NODE_ENV !== "production") (window as unknown as { __dumpMap?: MlMap }).__dumpMap = map
    const popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false, className: "dump-pop", maxWidth: "340px", offset: 14 })
    popupRef.current = popup

    map.on("load", () => {
      if (mapRef.current !== map) return
      declareLayers(map, { type: "Polygon", coordinates: [data.ring.map((p) => [p[1], p[0]])] })
      applyThemePaint(map, themeRef.current)
      setReady(true)
    })
    // 스타일을 바꾸면(테마) 등록한 이미지가 사라진다. 없다고 할 때 다시 그린다
    map.on("styleimagemissing", (e) => {
      if (e.id === BIN_RECO_ICON && !map.hasImage(BIN_RECO_ICON)) map.addImage(BIN_RECO_ICON, dashedCircleIcon().data, { pixelRatio: 2 })
    })
    // 건물 조인: 타일이 오면 보이는 건물마다 중심점이 든 칸의 값을 feature-state로 붙인다(한 번 붙인 id는 건너뜀)
    const joinBuildings = () => {
      const m = mapRef.current
      const lookup = lookupRef.current
      const grid = dataRef.current?.grid
      if (!m || !lookup || !grid || !HAS_NSDI_BUILDINGS || !m.getSource(NSDI_SOURCE)) return
      const done = joinedRef.current
      for (const f of m.querySourceFeatures(NSDI_SOURCE, { sourceLayer: "buildings" })) {
        const id = f.id
        if (id == null || done.has(String(id))) continue
        done.add(String(id))
        const g = f.geometry
        const ring = g.type === "Polygon" ? g.coordinates[0] : g.type === "MultiPolygon" ? g.coordinates[0]?.[0] : null
        if (!ring?.length) continue
        let lng = 0
        let lat = 0
        for (const p of ring) {
          lng += p[0]
          lat += p[1]
        }
        const i = lookup(lat / ring.length, lng / ring.length)
        if (i < 0) continue
        const c = grid[i]
        m.setFeatureState({ source: NSDI_SOURCE, sourceLayer: "buildings", id }, { comp: c[4], enf: c[5], unm: c[6], lp: c[8], dong: c[7] || "" })
      }
    }
    joinRef.current = joinBuildings
    map.on("sourcedata", (e) => {
      if (e.sourceId === NSDI_SOURCE && e.isSourceLoaded) joinBuildings()
    })
    map.on("idle", joinBuildings)
    // 호버 툴팁: 맨 위 레이어의 피처 하나. 격자→원→시설 순으로 위가 이긴다
    map.on("mousemove", (e) => {
      const m = mapRef.current
      if (!m) return
      const feats = m.queryRenderedFeatures(e.point, { layers: HOVER_LAYERS.filter((id) => m.getLayer(id)) })
      const hit = feats.find((f) => typeof f.properties?.tip === "string")
      if (!hit) {
        popup.remove()
        m.getCanvas().style.cursor = ""
        return
      }
      m.getCanvas().style.cursor = "default"
      // 동별 기둥은 카드형 툴팁(.dump-bartip). 다른 것은 보통 한 장
      if (hit.properties.card) popup.addClassName("dump-bartip-wrap")
      else popup.removeClassName("dump-bartip-wrap")
      popup.setLngLat(e.lngLat).setHTML(String(hit.properties.tip)).addTo(m)
    })
    map.on("mouseout", () => popup.remove())
    map.on("dragstart", () => popup.remove())
    // 사용자가 만지면 자동 회전을 멈춘다
    const stopOrbit = () => onOrbitStopRef.current?.()
    map.on("dragstart", stopOrbit)
    map.on("wheel", stopOrbit)
    map.on("touchstart", stopOrbit)
    // 컨테이너 크기가 바뀌면(패널 드래그·모바일 시트) 캔버스를 다시 잰다
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
      focusMarkerRef.current?.remove()
      focusMarkerRef.current = null
      setReady(false)
    }
    // data는 첫 도착 때만 스타일에 쓴다(경계는 불변). 이후 갱신은 아래 effect들이 setData로
  }, [!!data])

  // 경계·마스크·격자·동 외곽선(불변 데이터). 준비되면 1회 + 구 전체 맞춤
  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready || !data) return
    const ring = ringFC(data.ring)
    ringBoundsRef.current = ring.bounds
    lookupRef.current = cellLookup(data.grid)
    joinedRef.current = new Set()
    joinRef.current?.()
    setFC(map, S.mask, ring.mask)
    setFC(map, S.ring, ring.line)
    setFC(map, S.grid, gridFC(data))
    const dong = dongFC(data)
    setFC(map, S.dongLine, dong.lines)
    setFC(map, S.dongFill, dong.fills)
    setFC(map, S.dongLabel, dong.labels)
    // 높이 0인 컨테이너에 맞추면 줌이 엉뚱하게 잡힌다(2026-09-16 폰 실측). 높이가 생길 때로 미룬다
    const fit = () => fitTo(ring.bounds, { duration: 0 })
    if ((boxRef.current?.clientHeight ?? 0) > 0) fit()
    else pendingFitRef.current = fit
  }, [data, ready])

  // 바탕(면)·원·날씨별 원·흐림. 레이어를 새로 만들지 않고 색·투명도 식만 바꾼다
  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready || !data) return
    const def = BASE_DEF[base]
    const prop = { 4: "comp", 5: "enf", 6: "unm", 8: "lp" }[def.idx]
    // 인프라·후보·핫스팟·상습격자 레이어가 켜지면 격자를 자동으로 흐려 점이 확실히 보이게
    const muted = layers.length > 0 || showCandidates || showBinRecos || showHotspots || showCritical
    // 동을 골랐으면 그 동 안은 항상 또렷하게. 레이어 때문에 흐려지는 건 선택 없는 전체보기일 때만
    const dimmed: unknown[] = selectedDong ? ["!=", ["get", "dong"], selectedDong] : ["literal", muted]
    const positive: unknown[] = [">", ["get", prop], 0]
    // 값 0인 칸도 옅은 테두리로 그린다. 안 그리면 "격자가 없는 곳은 뭐냐"는 물음에 답이 없다(흐림 상태에선 숨김)
    map.setPaintProperty(S.grid, "fill-color", ["case", positive, stepExpr(prop, def.stops, def.pal), ZERO_CELL])
    map.setPaintProperty(S.grid, "fill-opacity", ["case", positive, ["case", dimmed, muted ? 0.25 : 0.18, 0.8], ["case", dimmed, 0, 0.12]])
    map.setPaintProperty(L_GRID_LINE, "line-color", ["case", positive, "#ffffff", ZERO_CELL])
    map.setPaintProperty(L_GRID_LINE, "line-opacity", ["case", positive, ["case", dimmed, 0.25, 0.7], ["case", dimmed, 0, 0.55]])
    const dimPt: unknown[] = selectedDong ? ["!=", ["get", "dong"], selectedDong] : ["literal", muted && !selectedDong]
    // 날씨별 원이 켜져 있으면 보통 원 대신 그쪽만
    setFC(map, S.circles, weather ? emptyFC() : circlesFC(data, circles))
    map.setPaintProperty(S.circles, "circle-opacity", ["case", dimPt, 0.04, ["get", "fill"]])
    map.setPaintProperty(S.circles, "circle-stroke-opacity", ["case", dimPt, 0.15, 0.75])
    setFC(map, S.weather, weather ? weatherFC(data, weather) : emptyFC())
    map.setPaintProperty(S.weather, "circle-opacity", ["case", dimPt, 0.04, 0.22])
    map.setPaintProperty(S.weather, "circle-stroke-opacity", ["case", dimPt, 0.15, 0.8])
    // 입체: 원 → 원기둥. 격자 기둥이 켜져 있으면 같은 자리에 두 기둥이 겹치니 원기둥은 쉰다. 흐림(다른 레이어 켜짐)은 평면의 0.04처럼 숨김, 동 선택은 그 동만
    setFC(map, S.circleCols, weather || grid3d ? emptyFC() : circleColumnsFC(data, circles))
    setFC(map, S.weatherCols, weather ? weatherColumnsFC(data, weather) : emptyFC())
    if (tiltRef.current) riseColumns(map, weather ? S.weatherCols : S.circleCols)
    const colFilter: FilterSpecification | null = selectedDong ? ["==", ["get", "dong"], selectedDong] : muted ? ["==", ["get", "dong"], "\u0000"] : null
    map.setFilter(S.circleCols, colFilter)
    map.setFilter(S.weatherCols, colFilter)
    // 건물 색 = 그 건물이 선 칸의 바탕 값(feature-state). 값 0·칸 밖·다른 동은 중립색. 평면 격자와 같은 램프라 범례가 그대로 통한다.
    // 시설·후보·배치추천 말뚝이 서면 히트맵을 중립색 쪽으로 55% 눌러 말뚝이 앞에 선다(빨간 후보가 주황 건물에 묻혔던 실측). 동별 기둥은 기둥이 주인공이라 건물은 중립
    const neutral = NEUTRAL_BUILDING[themeRef.current]
    const val: unknown[] = ["coalesce", ["feature-state", prop], 0]
    const pointsOn = layers.length > 0 || showCandidates || showBinRecos
    const pal = pointsOn ? def.pal.map((c) => mixHex(c, neutral, 0.55)) : def.pal
    const dimB: unknown[] = selectedDong ? ["!=", ["feature-state", "dong"], selectedDong] : ["literal", showDongBars]
    if (map.getLayer(L_BUILDINGS_NSDI))
      map.setPaintProperty(L_BUILDINGS_NSDI, "fill-extrusion-color", ["case", dimB, neutral, [">", val, 0], stepExpr(prop, def.stops, pal, val), neutral])
  }, [data, ready, base, circles, selectedDong, layers, showCandidates, showBinRecos, showHotspots, showCritical, weather, grid3d, theme, showDongBars])

  // 동 선택. 전체 동은 상시 얇게, 선택 동은 굵게 + 은은한 채움 + 동 전체가 화면에 들어오게
  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready || !data) return
    const sel = selectedDong ?? ""
    map.setPaintProperty(S.dongLine, "line-color", ["case", ["==", ["get", "name"], sel], "#c0741a", "#64748b"])
    map.setPaintProperty(S.dongLine, "line-width", ["case", ["==", ["get", "name"], sel], 3.2, 1])
    map.setPaintProperty(S.dongLine, "line-opacity", ["case", ["==", ["get", "name"], sel], 0.95, 0.4])
    map.setFilter(S.dongFill, ["==", ["get", "name"], sel])
    if (selectedDong) {
      const rings = data.dongOutlines[selectedDong]
      if (rings?.length) {
        const pts = rings.flat()
        const lngs = pts.map((p) => p[1])
        const lats = pts.map((p) => p[0])
        // 과잉 줌 방지: maxZoom 캡 + 넉넉한 패딩으로 동 전체가 화면에 들어오게
        fitTo(
          [
            [Math.min(...lngs), Math.min(...lats)],
            [Math.max(...lngs), Math.max(...lats)],
          ],
          { pad: padWith(padding(), 48), maxZoom: 14.75, duration: 500, keepBearing: true },
        )
      }
    } else if (prevDongRef.current && ringBoundsRef.current) {
      // 선택 해제 → 구 전체 뷰로 복귀 (viz 적용·해제 버튼 모두)
      fitTo(ringBoundsRef.current, { duration: 500, keepBearing: true })
    }
    prevDongRef.current = selectedDong
  }, [data, ready, selectedDong])

  // 시설 + 재배치 후보 + 배치추천
  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready || !data) return
    const infra = infraFC(data, layers)
    const cand = showCandidates ? candidatesFC(data) : emptyFC()
    const reco = showBinRecos ? binRecosFC(data) : emptyFC()
    setFC(map, S.infra, infra)
    setFC(map, S.cand, cand)
    setFC(map, S.binReco, reco)
    // 입체: 점 → 말뚝, 배치추천 → 빈 고리(아직 없는 자리)
    setFC(map, S.infraPosts, postsFC(infra, POST_R_M, POST_H_M))
    setFC(map, S.candPosts, postsFC(cand, CAND_POST_R_M, CAND_POST_H_M))
    setFC(map, S.recoRings, ringsFC(reco, RECO_RING_R_M, 5, RECO_RING_H_M))
  }, [data, ready, layers, showCandidates, showBinRecos])

  // 청소차 관리노선. road-links.json 동적 임포트(번들 제외), 도로명으로 필터
  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return
    if (!showRoutes) {
      setFC(map, S.routes, emptyFC())
      return
    }
    let alive = true
    void import("@/lib/gwangjin/road-links.json").then((roads) => {
      const m = mapRef.current
      if (!alive || !m) return
      const links = (roads.default as unknown as { links: { n?: string; p: number[][] }[] }).links
      setFC(m, S.routes, routesFC(links))
    })
    return () => {
      alive = false
    }
  }, [ready, showRoutes])

  // 예측 핫스팟 20 기둥+순위(운영·전망 탭)
  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready || !data) return
    const hot = showHotspots ? hotspotsFC(data) : { cols: emptyFC(), labels: emptyFC() }
    setFC(map, S.hotCols, hot.cols)
    setFC(map, S.hotLabels, hot.labels)
    if (showHotspots) riseColumns(map, S.hotCols)
  }, [data, ready, showHotspots])

  // 집중관리 상습격자 (12개월 10건 이상). 칸 외곽선 + 기둥(높이=12개월 건수)
  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready || !data) return
    const crit = showCritical ? criticalFC(data) : { cells: emptyFC(), cols: emptyFC(), labels: emptyFC() }
    setFC(map, S.critCells, crit.cells)
    setFC(map, S.critCols, crit.cols)
    setFC(map, S.critLabels, crit.labels)
    if (showCritical) riseColumns(map, S.critCols)
  }, [data, ready, showCritical])

  // 격자 기둥. 원 지표(민원·과태료, 없으면 과태료) 건수를 칸 가운데 기둥으로. 5건 이상 칸만
  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready || !data) return
    const ids: CircleId[] = circles.length ? circles : ["enf"]
    setFC(map, S.cols, grid3d ? gridColumnsFC(data, ids, selectedDong) : emptyFC())
    if (grid3d) riseColumns(map, S.cols)
  }, [data, ready, grid3d, circles, selectedDong])

  // 테마(17라운드). 바탕 스타일을 통째로 바꾸되 우리 소스(현재 데이터 포함)·레이어(현재 paint 포함)는 그대로 옮겨 싣는다.
  // 첫 스타일은 초기화에서 테마를 이미 반영했으니 바뀔 때만
  const themeAppliedRef = useRef(theme)
  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready || !data || themeAppliedRef.current === theme) return
    themeAppliedRef.current = theme
    const cur = map.getStyle()
    const next = buildBasemapStyle(data.ring, theme)
    for (const [id, src] of Object.entries(cur.sources)) if (id.startsWith("dump-")) next.sources[id] = src
    const firstSym = cur.layers.findIndex((l) => l.type === "symbol" && !l.id.startsWith("dump-"))
    const ours = cur.layers.filter((l) => l.id.startsWith("dump-") && l.id !== HILLSHADE_LAYER)
    const under = ours.filter((l) => cur.layers.indexOf(l) < firstSym)
    const top = ours.filter((l) => cur.layers.indexOf(l) >= firstSym)
    const at = next.layers.findIndex((l) => l.type === "symbol")
    next.layers.splice(at < 0 ? next.layers.length : at, 0, ...under)
    next.layers.push(...top)
    map.once("style.load", () => {
      if (mapRef.current !== map) return
      applyThemePaint(map, theme)
      joinedRef.current = new Set() // 소스가 새로 만들어져 feature-state가 비었다. idle에서 다시 붙는다
      if (tiltRef.current) map.setTerrain({ source: DEM_SOURCE, exaggeration: 1.4 })
    })
    // 지형을 켠 채 스타일을 갈면 maplibre가 옛 지형 렌더러를 만져 shaderPreludeCode 오류(실측). 잠깐 끄고 style.load에서 다시 켠다
    map.setTerrain(null)
    map.setStyle(next, { diff: false })
  }, [ready, data, theme])

  // 입체/평면. 기울기·건물·지형을 한 번에. 평면은 위에서 본 격자(기둥은 윗면만 보인다)
  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return
    map.setLayoutProperty(L_BUILDINGS, "visibility", tilt ? "visible" : "none")
    if (map.getLayer(L_BUILDINGS_NSDI)) map.setLayoutProperty(L_BUILDINGS_NSDI, "visibility", tilt ? "visible" : "none")
    for (const id of FLAT_ONLY) map.setLayoutProperty(id, "visibility", tilt ? "none" : "visible")
    for (const id of TILT_ONLY) map.setLayoutProperty(id, "visibility", tilt ? "visible" : "none")
    if (tilt) for (const id of [S.circleCols, S.weatherCols, S.infraPosts, S.candPosts]) riseColumns(map, id)
    map.setTerrain(tilt ? { source: DEM_SOURCE, exaggeration: 1.4 } : null)
    map.easeTo({ pitch: tilt ? TILT_PITCH : 0, bearing: tilt ? TILT_BEARING : 0, duration: 700 })
  }, [ready, tilt])

  // 자동 회전(시연). 프레임마다 방위를 조금씩. 사용자가 만지면 초기화 effect의 stopOrbit이 부모 상태를 끈다
  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready || !orbit) return
    let raf = 0
    let last = performance.now()
    const step = (t: number) => {
      const m = mapRef.current
      if (!m) return
      // 카메라 큐(easeTo)가 움직이는 동안은 기다린다. setBearing은 jumpTo라 진행 중인 이동을 끊는다
      if (!m.isEasing()) m.setBearing(m.getBearing() + (t - last) * ORBIT_DEG_PER_MS)
      last = t
      raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [ready, orbit])

  // 드론 비행(시연). 18라운드: 구간별 easeTo(휙휙 꺾임) → 한 카메라가 경유지 곡선 위를 연속으로 난다(map-geo flyWaypoints·flyCameraAt).
  // 프레임마다 jumpTo. 방위는 일정 속도로 천천히. 지점에 닿으면 감속해 머물고(dwell) 다시 출발. 끝(조망 복귀)까지 가면 처음부터 반복.
  // 어디를 나는지: 경로 점선 + 번호 지점(지도), 목표 지점 땅 위 고리, 화면 위 안내 띠(flyInfo). 사용자가 만지면 stopOrbit → fly=false
  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready || !fly || !data || !ringBoundsRef.current) return
    map.setPadding(padding())
    const cam = map.cameraForBounds(ringBoundsRef.current, { bearing: TILT_BEARING })
    if (!cam) return
    const c = maplibregl.LngLat.convert(cam.center as maplibregl.LngLatLike)
    const wps = flyWaypoints(data, { center: [c.lng, c.lat], zoom: (cam.zoom ?? 13.4) - TILT_ZOOM_BACK })
    const segs = wps.slice(0, -1).map((w, i) => flySegmentMs(w, wps[i + 1]))
    const stops = wps.filter((w) => w.target).length
    const route = flyRouteFC(data)
    setFC(map, S.flyPath, route.path)
    setFC(map, S.flyPts, route.points)
    // 현재 위치에서 첫 경유지(조망)까지는 짧게 이어 붙인다(갑자기 순간이동하지 않게)
    const start = { center: [map.getCenter().lng, map.getCenter().lat] as [number, number], zoom: map.getZoom(), pitch: map.getPitch(), dwell: 0 }
    const lead = flySegmentMs(start, wps[0]) * 0.5
    const bearing0 = map.getBearing()
    let shown = -1 // 안내를 띄운 경유지 번호
    const announce = (k: number) => {
      if (shown === k) return
      shown = k
      const w = wps[k]
      if (w.target) {
        setFC(map, S.focusRing, fc([{ type: "Feature", properties: { h: 16 }, geometry: ringPolygon(w.target.lnglat[0], w.target.lnglat[1], FOCUS_RING_R_M, 9) }]))
        setFlyInfo({ i: w.target.rank, total: stops, label: w.target.label })
      } else {
        setFC(map, S.focusRing, emptyFC())
        setFlyInfo({ i: 0, total: stops, label: k === 0 ? "구 전체 조망 · 예측 핫스팟 상위 5곳으로" : "구 전체 조망으로 복귀" })
      }
    }
    let raf = 0
    const t0 = performance.now()
    const loopMs = segs.reduce((a, b) => a + b, 0) + wps.reduce((a, w) => a + w.dwell, 0)
    const step = (now: number) => {
      const m = mapRef.current
      if (!m) return
      const bearing = bearing0 + ((now - t0) / 1000) * FLY_BEARING_DEG_PER_S
      let t = now - t0
      if (t < lead) {
        // 진입: 지금 시점 → 조망
        const f = t / lead
        const k = f * f * (3 - 2 * f)
        announce(0)
        m.jumpTo({ center: [start.center[0] + (wps[0].center[0] - start.center[0]) * k, start.center[1] + (wps[0].center[1] - start.center[1]) * k], zoom: start.zoom + (wps[0].zoom - start.zoom) * k, pitch: start.pitch + (wps[0].pitch - start.pitch) * k, bearing })
        raf = requestAnimationFrame(step)
        return
      }
      t = (t - lead) % loopMs
      // 시각 t가 어느 경유지의 머무름 또는 어느 구간에 있는지
      let i = 0
      for (;;) {
        if (t < wps[i].dwell) {
          announce(i)
          const w = wps[i]
          m.jumpTo({ center: w.center, zoom: w.zoom, pitch: w.pitch, bearing })
          break
        }
        t -= wps[i].dwell
        if (i >= segs.length) break
        if (t < segs[i]) {
          announce(i + 1) // 출발하면서 다음 목표를 먼저 알린다
          m.jumpTo({ ...flyCameraAt(wps, i, t / segs[i]), bearing })
          break
        }
        t -= segs[i]
        i += 1
      }
      raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => {
      cancelAnimationFrame(raf)
      const m = mapRef.current
      if (m) {
        setFC(m, S.flyPath, emptyFC())
        setFC(m, S.flyPts, emptyFC())
        setFC(m, S.focusRing, emptyFC())
      }
      setFlyInfo(null)
    }
  }, [ready, fly, data])

  // 동별 민원·과태료 기둥(17라운드: SVG 등축 마커 → 진짜 입체). 동 가운데에 민원 파랑·과태료 갈색 두 기둥, 채널 모드는 민원 기둥을 세 토막으로
  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready || !data) return
    const d = showDongBars ? dongColumnsFC(data, dongMode, dongYear) : { cols: emptyFC(), labels: emptyFC() }
    setFC(map, S.dongCols, d.cols)
    setFC(map, S.dongColLabels, d.labels)
    if (showDongBars) riseColumns(map, S.dongCols, true, 1100)
    // 기둥 값 라벨이 동 이름을 같이 달고 있으니 지도 동 라벨은 겹치지 않게 숨긴다
    map.setLayoutProperty(S.dongLabel, "visibility", showDongBars ? "none" : "visible")
  }, [data, ready, showDongBars, dongMode, dongYear])

  // 목록 클릭 → 해당 지점으로 당겨가기 + 땅 위 고리로 위치를 확실히 표시(18라운드: DOM 펄스 점은 3D 지도 위에서 2D로 떠 보여 고리 레이어로). 글자는 DOM 라벨
  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return
    focusMarkerRef.current?.remove()
    focusMarkerRef.current = null
    if (!focusCandidate) {
      if (!fly) setFC(map, S.focusRing, emptyFC())
      return
    }
    const lnglat: [number, number] = [focusCandidate.latlng[1], focusCandidate.latlng[0]]
    setFC(map, S.focusRing, fc([{ type: "Feature", properties: { h: 16 }, geometry: ringPolygon(lnglat[0], lnglat[1], FOCUS_RING_R_M, 9) }]))
    if (focusCandidate.label) {
      const lb = document.createElement("div")
      lb.className = "dump-focus-label"
      lb.textContent = focusCandidate.label
      focusMarkerRef.current = new maplibregl.Marker({ element: lb, anchor: "bottom", offset: [0, -26] }).setLngLat(lnglat).addTo(map)
    }
    map.flyTo({ center: lnglat, zoom: 16, duration: 600 })
  }, [ready, focusCandidate])

  // 초점 고리 맥동: 높이·투명도를 숨 쉬듯. 고리가 있을 때만 프레임을 돈다
  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready || (!focusCandidate && !fly)) return
    let raf = 0
    const t0 = performance.now()
    const step = (t: number) => {
      const m = mapRef.current
      if (!m || !m.getLayer(S.focusRing)) return
      const k = (Math.sin(((t - t0) / 1400) * Math.PI * 2) + 1) / 2 // 0~1
      m.setPaintProperty(S.focusRing, "fill-extrusion-height", 10 + k * 14)
      m.setPaintProperty(S.focusRing, "fill-extrusion-opacity", 0.55 + k * 0.4)
      raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [ready, focusCandidate, fly])

  // 카메라 큐(시연 장면). 경계 상자를 보이는 영역에 맞추되 기울기·방위·시간은 큐대로. 부드러운 가감속
  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready || !cameraCue) return
    const bounds = cameraCue.bounds ?? ringBoundsRef.current
    if (!bounds) return
    map.setPadding(padding())
    const bearing = map.getBearing() + (cameraCue.bearingDelta ?? 0)
    const cam = map.cameraForBounds(bounds, { bearing, ...(cameraCue.maxZoom != null ? { maxZoom: cameraCue.maxZoom } : {}) })
    if (!cam) return
    const pitch = cameraCue.pitch ?? (tiltRef.current ? TILT_PITCH : 0)
    const zoom = Math.min(cameraCue.maxZoom ?? 99, (cam.zoom ?? map.getZoom()) - (pitch > 0 ? TILT_ZOOM_BACK : 0))
    map.easeTo({ center: cam.center, zoom, bearing, pitch, duration: cameraCue.duration ?? 2400, easing: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2), essential: true })
  }, [ready, cameraCue?.seq])

  // 헤더 배너 리셋 → 구 전체 뷰(기본 방위로)
  useEffect(() => {
    const map = mapRef.current
    if (!resetSeq || !map || !ready || !ringBoundsRef.current) return
    fitTo(ringBoundsRef.current, { duration: 500 })
  }, [resetSeq])

  const pad = fitPadding
  return (
    <div className="relative h-full w-full">
      <div ref={boxRef} className="dumping-map h-full w-full" />
      {/* 드론 비행 안내 띠: 보이는 지도 영역(카드·열이 가리지 않는 곳) 위 가운데. 몇 번째 목표로 가는지 */}
      {flyInfo && (
        <div
          className="pointer-events-none absolute z-[1030] flex justify-center"
          style={{ left: pad?.tl[0] ?? 16, right: pad?.br[0] ?? 16, top: (pad?.tl[1] ?? 16) + 10 }}
          aria-live="polite"
        >
          <div className="dump-fl lg-shell relative flex max-w-full items-center gap-3 rounded-full py-2 pl-3 pr-4">
            <span className="dump-fly-drone" aria-hidden />
            <span className="min-w-0">
              <span className="dump-kicker block text-[10px] text-[var(--cp-text-dim)]">드론 비행 · {flyInfo.i > 0 ? `${flyInfo.i} / ${flyInfo.total}` : "조망"}</span>
              <span className="block truncate text-[13.5px] font-semibold text-[var(--cp-text-strong)]">{flyInfo.label}</span>
            </span>
            <span className="ml-1 flex shrink-0 items-center gap-1" aria-hidden>
              {Array.from({ length: flyInfo.total }, (_, k) => (
                <i key={k} className={`h-1.5 rounded-full transition-all ${k + 1 === flyInfo.i ? "w-4 bg-(--dump-accent)" : k + 1 < flyInfo.i ? "w-1.5 bg-(--dump-accent)/55" : "w-1.5 bg-[var(--cp-border-strong)]"}`} />
              ))}
            </span>
          </div>
        </div>
      )}
    </div>
  )
}

function padWith(p: PaddingOptions, extra: number): PaddingOptions {
  return { top: (p.top ?? 0) + extra, left: (p.left ?? 0) + extra, bottom: (p.bottom ?? 0) + extra, right: (p.right ?? 0) + extra }
}

function setFC(map: MlMap, id: string, data: FC) {
  const src = map.getSource(id) as GeoJSONSource | undefined
  src?.setData(data)
}

// 기둥이 땅에서 솟아오른다(18라운드, 시연 WoW). 데이터 기반 높이는 maplibre 전환(transition)이 보간하지 않아 프레임마다 배율을 올린다.
// 한 레이어에 하나만 돈다(다시 켜면 이전 것을 끊는다). base(토막 기둥)도 같이 눌렀다 편다
const rising = new Map<string, number>()
function riseColumns(map: MlMap, id: string, withBase = false, ms = 900) {
  const prev = rising.get(id)
  if (prev) cancelAnimationFrame(prev)
  const t0 = performance.now()
  const step = (now: number) => {
    if (!map.getLayer(id)) return
    const f = Math.min(1, (now - t0) / ms)
    const k = 1 - Math.pow(1 - f, 3)
    map.setPaintProperty(id, "fill-extrusion-height", k >= 1 ? ["get", "h"] : ["*", ["get", "h"], k])
    if (withBase) map.setPaintProperty(id, "fill-extrusion-base", k >= 1 ? ["get", "base"] : ["*", ["get", "base"], k])
    if (f < 1) rising.set(id, requestAnimationFrame(step))
    else rising.delete(id)
  }
  rising.set(id, requestAnimationFrame(step))
}

// 소스·레이어 전부를 빈 데이터로 선언. 그리는 순서(아래→위): 마스크 → 격자 면 → 동 채움 → 원 → 노선 → 상습격자 면 → 격자선·동 외곽선·구 경계
// → 건물(바닥에 그린 것은 건물이 가리고, 점·기둥은 건물 위에) → 시설·후보·배치추천 → 기둥 3종 → 라벨(항상 맨 위)
function declareLayers(map: MlMap, ringPoly: GeoJSON.Polygon | null) {
  const geo = (id: string) => map.addSource(id, { type: "geojson", data: emptyFC() })
  for (const id of Object.values(S)) geo(id)
  // 바탕 스타일의 첫 라벨 레이어 앞에 면·선을 끼워 넣는다. 도로명·지명은 우리 면 위에 남는다
  const firstSymbol = map.getStyle().layers.find((l) => l.type === "symbol")?.id
  const under = (spec: LayerSpecification) => map.addLayer(spec, firstSymbol)

  under({ id: S.mask, type: "fill", source: S.mask, paint: { "fill-color": "#ffffff", "fill-opacity": 0.55 } })
  under({ id: S.grid, type: "fill", source: S.grid, paint: { "fill-color": ZERO_CELL, "fill-opacity": 0 } })
  under({ id: S.dongFill, type: "fill", source: S.dongFill, filter: ["==", ["get", "name"], ""], paint: { "fill-color": "#c0741a", "fill-opacity": 0.08 } })
  under({
    id: S.circles,
    type: "circle",
    source: S.circles,
    paint: {
      "circle-radius": radiusMetersExpr() as ExpressionSpecification,
      "circle-color": ["get", "color"],
      "circle-opacity": ["get", "fill"],
      "circle-stroke-color": ["get", "color"],
      "circle-stroke-width": 1.1,
      "circle-stroke-opacity": 0.75,
      "circle-pitch-alignment": "map",
      "circle-pitch-scale": "map",
    },
  })
  under({
    id: S.weather,
    type: "circle",
    source: S.weather,
    paint: {
      "circle-radius": radiusMetersExpr() as ExpressionSpecification,
      "circle-color": ["get", "color"],
      "circle-opacity": 0.22,
      "circle-stroke-color": ["get", "color"],
      "circle-stroke-width": 1.1,
      "circle-stroke-opacity": 0.8,
      "circle-pitch-alignment": "map",
      "circle-pitch-scale": "map",
    },
  })
  under({ id: L_ROUTES_GENERAL, type: "line", source: S.routes, filter: ["==", ["get", "focus"], 0], paint: { "line-color": "#64748b", "line-width": 3, "line-opacity": 0.6 } })
  under({ id: L_ROUTES_FOCUS, type: "line", source: S.routes, filter: ["==", ["get", "focus"], 1], paint: { "line-color": "#d97706", "line-width": 5, "line-opacity": 0.85 } })
  under({ id: L_CRIT_FILL, type: "fill", source: S.critCells, paint: { "fill-color": CRIT_COLOR, "fill-opacity": 0.18 } })
  under({ id: L_CRIT_LINE, type: "line", source: S.critCells, paint: { "line-color": CRIT_COLOR, "line-width": 2.5, "line-opacity": 0.95 } })
  under({ id: L_GRID_LINE, type: "line", source: S.grid, paint: { "line-color": "#ffffff", "line-width": 0.8, "line-opacity": 0 } })
  under({ id: S.dongLine, type: "line", source: S.dongLine, paint: { "line-color": "#64748b", "line-width": 1, "line-opacity": 0.4 } })
  under({ id: S.ring, type: "line", source: S.ring, paint: { "line-color": "#64748b", "line-width": 1.8, "line-opacity": 0.8, "line-dasharray": [2, 4] } })
  // OSM 건물(Protomaps buildings). 높이 없는 건물은 9m(3층)로. NSDI 타일이 있으면 구 안은 그쪽이 그리고 OSM은 구 밖만
  under({
    id: L_BUILDINGS,
    type: "fill-extrusion",
    source: BASEMAP_SOURCE,
    "source-layer": "buildings",
    minzoom: 12,
    layout: { visibility: "none" },
    ...(HAS_NSDI_BUILDINGS && ringPoly ? { filter: ["!", ["within", ringPoly]] } : {}),
    paint: {
      "fill-extrusion-color": "#d7d5cd",
      "fill-extrusion-height": ["coalesce", ["get", "height"], 9],
      "fill-extrusion-base": ["coalesce", ["get", "min_height"], 0],
      // 구 밖은 배경. 옅게 물러나야 구 안(칸 값으로 칠한 건물)이 그림의 주인공이 된다
      "fill-extrusion-opacity": HAS_NSDI_BUILDINGS ? 0.45 : 0.85,
    },
  })
  // 국가공간정보포털 GIS건물통합정보(전수). 높이(h)가 0이면 층수×3.2m, 층수도 없으면 6m
  if (HAS_NSDI_BUILDINGS)
    under({
      id: L_BUILDINGS_NSDI,
      type: "fill-extrusion",
      source: NSDI_SOURCE,
      "source-layer": "buildings",
      minzoom: 12,
      layout: { visibility: "none" },
      paint: {
        "fill-extrusion-color": "#d7d5cd",
        "fill-extrusion-height": ["case", [">", ["coalesce", ["get", "h"], 0], 0], ["get", "h"], ["*", ["max", 2, ["coalesce", ["get", "flr"], 2]], 3.2]],
        // 불투명. 반투명이면 원기둥·말뚝과 교차하는 벽이 그 속에 비친다(17라운드 실측 "기둥 텍스처 깨짐")
        "fill-extrusion-opacity": 1,
      },
    })
  // 입체 전용(18라운드): 말뚝·고리·원기둥. 전부 불투명 + 세로 그라데이션. 평면일 때는 tilt effect가 숨긴다
  const solid = (id: string, source: string, color: ExpressionSpecification | string, extra: Record<string, unknown> = {}) =>
    under({
      id,
      type: "fill-extrusion",
      source,
      paint: { "fill-extrusion-color": color, "fill-extrusion-height": ["get", "h"], "fill-extrusion-opacity": 1, "fill-extrusion-vertical-gradient": true, ...extra },
    })
  solid(S.circleCols, S.circleCols, ["get", "color"])
  solid(S.weatherCols, S.weatherCols, ["get", "color"])
  solid(S.infraPosts, S.infraPosts, ["get", "color"])
  solid(S.recoRings, S.recoRings, BIN_RECO_COLOR)
  solid(S.candPosts, S.candPosts, CAND_COLOR.light)
  // 초점 고리(목록 클릭·드론 목표). 높이·투명도는 맥동 effect가 프레임마다 바꾼다
  under({
    id: S.focusRing,
    type: "fill-extrusion",
    source: S.focusRing,
    paint: { "fill-extrusion-color": ACCENT.light, "fill-extrusion-height": 16, "fill-extrusion-opacity": 0.9, "fill-extrusion-vertical-gradient": false },
  })
  // 드론 경로 점선(바닥). 지점 번호는 라벨과 함께 아래에서
  under({ id: S.flyPath, type: "line", source: S.flyPath, paint: { "line-color": ACCENT.light, "line-width": 2.5, "line-opacity": 0.9, "line-dasharray": [1.5, 2.5] } })
  under({
    id: S.infra,
    type: "circle",
    source: S.infra,
    paint: { "circle-radius": ["get", "r"], "circle-color": ["get", "color"], "circle-stroke-color": "#ffffff", "circle-stroke-width": 2 },
  })
  under({ id: S.binReco, type: "symbol", source: S.binReco, layout: { "icon-image": BIN_RECO_ICON, "icon-size": 0.5, "icon-allow-overlap": true } })
  under({
    id: S.cand,
    type: "circle",
    source: S.cand,
    paint: { "circle-radius": 13, "circle-color": CAND_COLOR.light, "circle-stroke-color": "#ffffff", "circle-stroke-width": 2 },
  })
  // 기둥 3종. 위에서 아래로 갈수록 밝아지는 면 그라데이션이 입체감을 만든다. 불투명(반투명끼리 교차하면 건물이 기둥 속에 비친다)
  const col = (id: string, source: string, color: ExpressionSpecification | string) =>
    under({
      id,
      type: "fill-extrusion",
      source,
      paint: { "fill-extrusion-color": color, "fill-extrusion-height": ["get", "h"], "fill-extrusion-opacity": 1, "fill-extrusion-vertical-gradient": true },
    })
  col(S.cols, S.cols, ["get", "color"])
  col(S.critCols, S.critCols, CRIT_COLOR)
  col(S.hotCols, S.hotCols, ["get", "color"])
  // 동별 기둥은 토막(채널 스택)마다 바닥 높이가 다르다
  under({
    id: S.dongCols,
    type: "fill-extrusion",
    source: S.dongCols,
    paint: { "fill-extrusion-color": ["get", "color"], "fill-extrusion-height": ["get", "h"], "fill-extrusion-base": ["get", "base"], "fill-extrusion-opacity": 1, "fill-extrusion-vertical-gradient": true },
  })
  // 라벨. 순위·값은 겹쳐도 보이게, 동 이름은 서로 피한다. 글자는 화면에 세워 기울여도 읽힌다
  const halo = { "text-halo-color": "rgba(255,255,255,0.92)", "text-halo-width": 1.6 }
  map.addLayer({
    id: S.dongLabel,
    type: "symbol",
    source: S.dongLabel,
    layout: { "text-field": ["get", "name"], "text-size": 13, "text-font": ["Noto Sans Medium"], "text-pitch-alignment": "viewport" },
    paint: { "text-color": "#14201c", ...halo },
  })
  map.addLayer({
    id: L_COL_LABEL,
    type: "symbol",
    source: S.cols,
    minzoom: 15,
    layout: { "text-field": ["to-string", ["get", "v"]], "text-size": 11, "text-font": ["Noto Sans Medium"], "text-offset": [0, -1.1], "text-pitch-alignment": "viewport" },
    paint: { "text-color": ["get", "color"], ...halo },
  })
  map.addLayer({
    id: S.critLabels,
    type: "symbol",
    source: S.critLabels,
    layout: { "text-field": ["get", "label"], "text-size": 11.5, "text-font": ["Noto Sans Medium"], "text-allow-overlap": true, "text-pitch-alignment": "viewport" },
    paint: { "text-color": CRIT_COLOR, ...halo },
  })
  map.addLayer({
    id: S.hotLabels,
    type: "symbol",
    source: S.hotLabels,
    layout: {
      "text-field": ["get", "label"],
      // 구 전체 보기(13.5 미만)에서는 작게. 20개가 서로 덮지 않는다(12라운드 실측)
      "text-size": ["step", ["zoom"], 11.5, 13.5, 13],
      "text-font": ["Noto Sans Medium"],
      "text-allow-overlap": true,
      "text-offset": [0, -1],
      "text-pitch-alignment": "viewport",
    },
    paint: { "text-color": ["case", ["==", ["get", "top"], 1], CRIT_COLOR, "#7c2d5e"], ...halo },
  })
  // 동별 기둥 값·동 이름. 두 기둥 사이 바닥에
  map.addLayer({
    id: S.dongColLabels,
    type: "symbol",
    source: S.dongColLabels,
    // 18라운드: 기둥 사이 바닥 글자가 건물·기둥에 묻혔다 → 15px·후광 2.6(건물은 동별 기둥 모드에서 중립색)
    layout: { "text-field": ["get", "label"], "text-size": 15, "text-font": ["Noto Sans Medium"], "text-allow-overlap": true, "text-anchor": "top", "text-offset": [0, 0.5], "text-pitch-alignment": "viewport", "text-line-height": 1.25 },
    paint: { "text-color": "#14201c", "text-halo-color": "rgba(255,255,255,0.96)", "text-halo-width": 2.6 },
  })
  map.addLayer({
    id: S.flyPts,
    type: "symbol",
    source: S.flyPts,
    layout: { "text-field": ["get", "n"], "text-size": 14, "text-font": ["Noto Sans Medium"], "text-allow-overlap": true, "text-offset": [0, -1.2], "text-pitch-alignment": "viewport" },
    paint: { "text-color": ACCENT.light, "text-halo-color": "rgba(255,255,255,0.95)", "text-halo-width": 2 },
  })
  map.addLayer({
    id: L_CAND_LABEL,
    type: "symbol",
    source: S.cand,
    layout: { "text-field": ["get", "label"], "text-size": 13, "text-font": ["Noto Sans Medium"], "text-allow-overlap": true, "text-pitch-alignment": "viewport" },
    paint: { "text-color": CAND_LABEL_COLOR.light },
  })
}

// 테마에 따라 달라지는 지도 색. 데이터 색(램프·원·기둥)은 안 바꾼다. 마스크·격자선·동 외곽선·구 경계·건물·라벨 후광만
function applyThemePaint(map: MlMap, theme: BasemapTheme) {
  const dark = theme === "dark"
  const ink = dark ? "#ece7dc" : "#14201c"
  const halo = dark ? "rgba(16,22,26,0.9)" : "rgba(255,255,255,0.92)"
  if (map.getLayer(S.mask)) map.setPaintProperty(S.mask, "fill-color", dark ? "#0c1114" : "#ffffff")
  // NSDI 건물은 바탕 effect가 칸 값으로 칠한다(중립색도 거기서 테마별로). 여기서는 구 밖 OSM 건물만
  map.setPaintProperty(L_BUILDINGS, "fill-extrusion-color", dark ? NEUTRAL_BUILDING.dark : NEUTRAL_BUILDING.light)
  const accent = dark ? ACCENT.dark : ACCENT.light
  map.setPaintProperty(S.focusRing, "fill-extrusion-color", accent)
  map.setPaintProperty(S.flyPath, "line-color", accent)
  map.setPaintProperty(S.flyPts, "text-color", accent)
  map.setPaintProperty(S.flyPts, "text-halo-color", halo)
  map.setPaintProperty(S.candPosts, "fill-extrusion-color", dark ? CAND_COLOR.dark : CAND_COLOR.light)
  map.setPaintProperty(S.cand, "circle-color", dark ? CAND_COLOR.dark : CAND_COLOR.light)
  map.setPaintProperty(S.cand, "circle-stroke-color", dark ? "#14181b" : "#ffffff")
  map.setPaintProperty(L_CAND_LABEL, "text-color", dark ? CAND_LABEL_COLOR.dark : CAND_LABEL_COLOR.light)
  map.setPaintProperty(S.dongColLabels, "text-halo-width", 2.6)
  if (map.getLayer(S.ring)) map.setPaintProperty(S.ring, "line-color", dark ? "#a19b8f" : "#64748b")
  for (const id of [S.dongLabel, S.critLabels, S.hotLabels, L_COL_LABEL, S.dongColLabels]) {
    if (!map.getLayer(id)) continue
    map.setPaintProperty(id, "text-halo-color", halo)
    if (id === S.dongLabel || id === S.dongColLabels) map.setPaintProperty(id, "text-color", ink)
  }
}
