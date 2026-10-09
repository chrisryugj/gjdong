"use client"

import { useEffect, useRef, useState } from "react"
import * as maplibregl from "maplibre-gl"
import type {
  ExpressionSpecification,
  GeoJSONSource,
  LngLatBoundsLike,
  Map as MlMap,
  Marker as MlMarker,
  PaddingOptions,
  Popup as MlPopup,
} from "maplibre-gl"
import { Protocol } from "pmtiles"
import { tipNode } from "@/lib/dumping/tip-node"
import type { IconKind, IconPoint, Icons3DLayer } from "./icons3d"
import type { ToonLayer } from "./toon-layer"
import WeatherOverlay from "./weather-overlay"
import { NO_SKY, mapSkyFor, type SkyWeather } from "@/lib/dumping/map-weather"
import { tallyInfra } from "@/lib/dumping/facts"
import "maplibre-gl/dist/maplibre-gl.css"
import type { BaseMode, CircleId, DumpingMapData, InfraLayerId, WeatherKey } from "@/lib/dumping/types"
import type { DongMode } from "@/lib/dumping/labels"
import { BASEMAP_BOUNDS, BASEMAP_PATH, DEM_SOURCE, HAS_NSDI_BUILDINGS, NSDI_SOURCE, TERRAIN_EXAG, buildBasemapStyle, type BasemapLook, type BasemapTheme } from "@/lib/dumping/basemap-style"
import { BEAM_LAYERS, BIN_RECO_ICON, FLAT_ONLY, HOVER_LAYERS, L_BUILDINGS, L_BUILDINGS_NSDI, L_GRID_LINE, PILL_ICON, S, TILT_ONLY, applyThemePaint, declareLayers, restyleBasemap } from "./map-layers"
import { landmarksFC } from "@/lib/dumping/landmarks"
import {
  BASE_DEF,
  BIN_RECO_COLOR,
  CRIT_COLOR,
  INFRA_STYLE,
  CAND_POST_H_M,
  CAND_POST_R_M,
  FOCUS_RING_R_M,
  NEUTRAL_BUILDING,
  greyRamp,
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
  FLY_KIND_LABEL,
  flyRouteFC,
  flySegmentMs,
  flyWaypoints,
  type FlyKind,
  FLY_BEARING_DEG_PER_S,
  gridColumnsFC,
  gridFC,
  hotspotsFC,
  infraFC,
  mixHex,
  postsFC,
  realBuildingExpr,
  ringFC,
  ringPolygon,
  ringsFC,
  routeChains,
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

let protocolReady = false
function ensureProtocol() {
  if (protocolReady) return
  const protocol = new Protocol()
  maplibregl.addProtocol("pmtiles", protocol.tile)
  // maplibre 6 ESM 워커는 번들러가 못 옮겨 public/ 에 복사해 둔 것을 가리킨다(scripts/copy-maplibre-worker.mjs)
  maplibregl.setWorkerUrl("/maplibre/maplibre-gl-worker.mjs")
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

// 랜드마크 이름표 바탕 알약(24라운드). icon-text-fit 으로 글자 둘레에 늘어난다(가운데만 늘리고 둥근 끝은 그대로)
function pillIcon(dark: boolean): { data: ImageData; pixelRatio: number; stretchX: [number, number][]; stretchY: [number, number][]; content: [number, number, number, number] } {
  const ratio = 2
  const w = 40 * ratio
  const h = 24 * ratio
  const canvas = document.createElement("canvas")
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext("2d")!
  const r = h / 2 - 2 * ratio
  ctx.beginPath()
  ctx.roundRect(2 * ratio, 2 * ratio, w - 4 * ratio, h - 4 * ratio, r)
  ctx.fillStyle = dark ? "rgba(22,28,34,0.92)" : "rgba(255,253,249,0.95)"
  ctx.shadowColor = "rgba(0,0,0,0.18)"
  ctx.shadowBlur = 2 * ratio
  ctx.fill()
  ctx.shadowBlur = 0
  ctx.lineWidth = ratio
  ctx.strokeStyle = dark ? "rgba(236,231,220,0.28)" : "rgba(28,26,21,0.18)"
  ctx.stroke()
  return { data: ctx.getImageData(0, 0, w, h), pixelRatio: ratio, stretchX: [[h / 2, w - h / 2]], stretchY: [[h / 2 - ratio, h / 2 + ratio]], content: [h / 2 - 2 * ratio, 4 * ratio, w - h / 2 + 2 * ratio, h - 4 * ratio] }
}

// 모형 보기 빛기둥(24라운드): 지도 기둥 레이어와 같은 데이터·색. 상습격자는 레이어 고정색. 굵기는 발자국 반지름 비율(동별 기둥은 조금 굵게)
const BEAM_COLOR: Partial<Record<string, string>> = { [S.critCols]: CRIT_COLOR }
const BEAM_THIN: Partial<Record<string, number>> = { [S.dongCols]: 0.4, [S.cols]: 0.34, [S.critCols]: 0.34 }

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
  look: BasemapLook // 23라운드: 입체 표현. 도면(지도 압출 건물) · 모형(카툰 three 건물·나무, toon-layer.ts). 바탕 팔레트도 같이 바뀐다
  sky?: SkyWeather // 23라운드 지도 날씨(실황 또는 수동): 모형 조명·구름·눈, 입체 하늘 안개, 빗줄기·눈송이 덮개. 데이터 색은 그대로
  orbit: boolean // 자동 회전(시연용). 사용자가 지도를 만지면 onOrbitStop
  fly: false | FlyKind // 드론 비행(시연용). 구 전체 → 목표 상위 5곳(예측 핫스팟·재배치 후보·상습격자)을 1위부터 천천히 돌고 돌아온다. 만지면 onOrbitStop
  onOrbitStop?: () => void
  resetSeq: number // 증가 시 구 전체 뷰로 복귀 (헤더 배너 리셋)
  // 카메라 큐(18라운드 시연): seq가 바뀌면 그 구도로 천천히 간다. bounds 없으면 구 전체. 도착 뒤 orbit이 켜져 있으면 회전이 이어진다
  cameraCue?: CameraCue | null
  fitPadding?: { tl: [number, number]; br: [number, number] } // 지도 위에 뜬 카드·열이 가리는 영역(px). 구 전체 맞춤이 보이는 부분에만 맞춘다(2026-09-18 지도 전면)
  // 19라운드 로딩 커튼: 지도 준비 단계를 대시보드에 알린다. map = 스타일·첫 타일, idle = 타일 렌더·건물 조인 완료(첫 번), icons = 3D 시설 레이어 준비
  onStage?: (stage: MapLoadStage) => void
  onTiles?: (p: { loaded: number; failed: number; total: number }) => void // 첫 idle까지 네트워크 타일(벡터·DEM) 요청·도착·실패 수. 커튼의 "지도 타일 n/m"
  padSeq?: number // 증가 시 가려진 영역(fitPadding)을 다시 재서 보이는 영역 가운데로 부드럽게 옮긴다(시연 중 카드 숨김·보임)
  onToon?: (ready: boolean) => void // 23라운드: 모형 건물이 섰나(범례가 지도와 같은 색을 말하게. 못 받으면 도면 압출이 대신 선다)
}
export type MapLoadStage = "map" | "idle" | "icons"

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
  look,
  sky = { kind: "clear", level: 0.35 },
  orbit,
  fly,
  onOrbitStop,
  resetSeq,
  fitPadding,
  cameraCue,
  onStage,
  onTiles,
  padSeq = 0,
  onToon,
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
  const onStageRef = useRef(onStage)
  onStageRef.current = onStage
  const onTilesRef = useRef(onTiles)
  onTilesRef.current = onTiles
  const dataRef = useRef(data)
  dataRef.current = data
  const prevDongRef = useRef<string | null>(null)
  const themeRef = useRef(theme)
  themeRef.current = theme
  const lookRef = useRef(look)
  lookRef.current = look
  const skyRef = useRef(sky)
  skyRef.current = sky
  const ringBoundsRef = useRef<LngLatBoundsLike | null>(null)
  // 컨테이너 높이가 0일 때(모바일 지도 접힘) 미뤄 둔 구 전체 맞춤. 높이가 생기면 ResizeObserver가 실행한다
  const pendingFitRef = useRef<(() => void) | null>(null)
  // 스타일·레이어가 다 선언된 뒤에야 데이터 effect가 돈다. 데이터가 먼저 와도 ready로 재트리거
  const [ready, setReady] = useState(false)
  // 드론 비행 안내(지도 위 띠): 몇 번째 구간, 어디로 가는지
  const [flyInfo, setFlyInfo] = useState<{ i: number; total: number; label: string } | null>(null)
  // 건물 조인(18라운드): 격자 칸 값을 건물 feature-state로. 처리한 건물 id는 기억해 둔다(24라운드부터 테마·표현을 바꿔도 소스가 그대로라 상태가 남는다)
  const joinedRef = useRef<Set<string>>(new Set())
  const lookupRef = useRef<((lat: number, lng: number) => number) | null>(null)
  const joinRef = useRef<(() => void) | null>(null)
  // 입체 시설 아이콘(Three.js 커스텀 레이어, icons3d.ts). three는 무거워 지도가 뜬 뒤 동적으로 싣는다
  const iconsRef = useRef<Icons3DLayer | null>(null)
  const [iconsReady, setIconsReady] = useState(false)
  // 모형 보기(23라운드): three 툰 건물·나무 층. 처음 모형+입체가 될 때 싣는다(평면 기본인 모바일은 안 받는다). 다 서기 전엔 지도 압출 건물이 대신 선다
  const toonRef = useRef<ToonLayer | null>(null)
  const toonLoadingRef = useRef(false)
  const [toonState, setToonState] = useState<"none" | "ready" | "failed">("none")
  const toonStateRef = useRef(toonState)
  toonStateRef.current = toonState
  const onToonRef = useRef(onToon)
  onToonRef.current = onToon
  useEffect(() => onToonRef.current?.(toonState === "ready"), [toonState])
  // 커튼 03(건물 입체 결합)은 첫 idle에, 모형+입체면 툰 건물이 다 선 것까지 기다린다
  const firstIdleRef = useRef(false)
  const idleToldRef = useRef(false)
  const tellIdle = () => {
    if (idleToldRef.current || !firstIdleRef.current) return
    if (tiltRef.current && lookRef.current === "model" && toonStateRef.current === "none") return
    idleToldRef.current = true
    onStageRef.current?.("idle")
  }
  // 입체 건물·배경 건물·기둥 투명도(표현·입체·툰 준비에 따라). 23라운드엔 바탕을 setStyle 로 갈아 옛 가시성이 옮겨 실리는 문제가 있었고,
  // 24라운드부터는 바탕을 제자리에서 다시 칠해(restyleBasemap) 레이어가 그대로라 이 함수만 다시 부르면 된다
  const showBuildings = (map: MlMap) => {
    const toonOn = tiltRef.current && lookRef.current === "model" && toonStateRef.current === "ready"
    toonRef.current?.setVisible(toonOn)
    try {
      if (map.getLayer(L_BUILDINGS_NSDI)) map.setLayoutProperty(L_BUILDINGS_NSDI, "visibility", tiltRef.current && !toonOn ? "visible" : "none")
      // 구 밖 배경 건물(24라운드: 빌드 때 구 밖만 뽑아 구 안 유령 건물이 없다). 두 표현 다 세운다(모형에서 구가 섬처럼 뜨지 않게)
      map.setLayoutProperty(L_BUILDINGS, "visibility", tiltRef.current ? "visible" : "none")
      // 모형이면 기둥은 빛기둥(three)이 그리고 지도 기둥은 투명으로 툴팁만 받는다
      for (const id of BEAM_LAYERS) map.setPaintProperty(id, "fill-extrusion-opacity", toonOn ? 0 : 1)
    } catch {
      // 지도를 내리는 중 등(레이어가 없을 때)
    }
  }
  // 지도 날씨: 모형 층(조명·구름·눈)과 MapLibre 하늘(입체에서만. 맑음은 기본 하늘).
  // isStyleLoaded()로 거르면 타일이 하나라도 로딩 중일 때 false라 첫 로드·테마 전환 뒤 하늘이 빠졌다 → 가드 없이 예외만 막는다
  const applySky = (map: MlMap) => {
    toonRef.current?.setWeather(skyRef.current)
    try {
      map.setSky(tiltRef.current ? mapSkyFor(skyRef.current, themeRef.current === "dark") : NO_SKY)
    } catch {
      // 지도를 내리는 중 등
    }
  }
  // 빛기둥(24라운드): 지도 기둥 레이어에 실은 데이터·거르기·솟기를 three 빛기둥에도 똑같이. 툰 층이 아직 없으면 마지막 값을 들고 있다가 생길 때 넘긴다
  const beamDataRef = useRef(new Map<string, { fc: FC; filter: string | null }>())
  const setCols = (map: MlMap, id: string, data: FC) => {
    setFC(map, id, data)
    beamDataRef.current.set(id, { fc: data, filter: beamDataRef.current.get(id)?.filter ?? null })
    toonRef.current?.beams.setData(id, data, BEAM_COLOR[id], BEAM_THIN[id])
  }
  /** dong: 지도 거르기와 같은 뜻(null 전부 · 동 이름 그 동만 · "\u0000" 전부 숨김) */
  const filterCols = (map: MlMap, id: string, dong: string | null) => {
    map.setFilter(id, dong === null ? null : ["==", ["get", "dong"], dong])
    const b = beamDataRef.current.get(id)
    if (b) b.filter = dong
    toonRef.current?.beams.setFilter(id, dong)
  }
  const rise = (map: MlMap, id: string, withBase = false, ms = 900) => {
    riseColumns(map, id, withBase, ms)
    toonRef.current?.beams.rise(id, ms)
  }
  const ensureToon = (map: MlMap) => {
    if (toonRef.current || toonLoadingRef.current || !tiltRef.current || lookRef.current !== "model") return
    toonLoadingRef.current = true
    void import("./toon-layer")
      .then(({ ToonLayer }) => {
        if (mapRef.current !== map) return
        const toon = new ToonLayer({ dark: themeRef.current === "dark", exag: TERRAIN_EXAG })
        toonRef.current = toon
        toon.setWeather(skyRef.current)
        for (const [id, b] of beamDataRef.current) {
          toon.beams.setData(id, b.fc, BEAM_COLOR[id], BEAM_THIN[id])
          toon.beams.setFilter(id, b.filter)
        }
        // 지도 압출 건물과 같은 자리(기둥·말뚝보다 먼저 그려 깊이를 나눈다)
        try {
          if (map.getLayer(S.circleCols)) map.addLayer(toon, S.circleCols)
        } catch {
          // Style is not done loading
        }
        const c = maplibregl.MercatorCoordinate.fromLngLat(map.getCenter())
        const a = maplibregl.MercatorCoordinate.fromLngLat([127.085, 37.546])
        const perM = a.meterInMercatorCoordinateUnits()
        return toon.load(BASEMAP_PATH, [(c.x - a.x) / perM, (c.y - a.y) / perM]).then(() => {
          if (mapRef.current === map) setToonState("ready")
        })
      })
      .catch(() => {
        // 자료를 못 받으면 도면 건물로 남는다(커튼도 기다리지 않는다)
        if (mapRef.current === map) setToonState("failed")
      })
  }
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
      style: buildBasemapStyle(data.ring, themeRef.current, lookRef.current),
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
    // 진단 손잡이(scripts/dumping-shots.mjs가 프로덕션 빌드에서 카메라를 잡는다. /snow 4라운드 규약대로 프로덕션에도 둔다: 참조 하나뿐이라 비용 0)
    ;(window as unknown as { __dumpMap?: MlMap }).__dumpMap = map
    const popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false, className: "dump-pop", maxWidth: "340px", offset: 14 })
    popupRef.current = popup

    map.on("load", () => {
      if (mapRef.current !== map) return
      declareLayers(map)
      applyThemePaint(map, themeRef.current, lookRef.current)
      setReady(true)
      onStageRef.current?.("map")
      ensureToon(map)
      void import("./icons3d").then(({ Icons3DLayer }) => {
        if (mapRef.current !== map) return
        const icons = new Icons3DLayer()
        icons.visible = tiltRef.current
        icons.setTheme(themeRef.current === "dark")
        map.addLayer(icons, S.infraPosts) // 투명 말뚝(툴팁 조회용) 바로 아래. 라벨은 그 위
        iconsRef.current = icons
        setIconsReady(true)
        onStageRef.current?.("icons")
      })
    })
    // 캔버스로 그리는 아이콘(배치추천 점선 원·랜드마크 알약)은 처음 쓰일 때 등록한다(maplibre 6 은 styleimagemissing 이 알림 전용이라 resolver 로)
    map.setMissingStyleImageResolver((id) => {
      if (id === BIN_RECO_ICON && !map.hasImage(BIN_RECO_ICON)) map.addImage(BIN_RECO_ICON, dashedCircleIcon().data, { pixelRatio: 2 })
      if ((id === PILL_ICON.light || id === PILL_ICON.dark) && !map.hasImage(id)) {
        const { data: img, ...opts } = pillIcon(id === PILL_ICON.dark)
        map.addImage(id, img, opts)
      }
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
    // 첫 idle까지 타일 진행(/snow 5라운드 방식): 네트워크 타일(벡터·DEM)만 센다. geojson 소스 타일은 즉시라 분모만 부풀린다
    const tiles = { started: 0, done: 0, failed: 0 }
    let idled = false
    const isTile = (e: { dataType?: string; tile?: unknown; source?: { type?: string } }) => e.dataType === "source" && !!e.tile && (e.source?.type === "vector" || e.source?.type === "raster-dem")
    const reportTiles = () => onTilesRef.current?.({ loaded: Math.min(tiles.done, tiles.started), failed: tiles.failed, total: tiles.started })
    map.on("dataloading", (e) => {
      if (idled || !isTile(e)) return
      tiles.started++
      reportTiles()
    })
    map.on("data", (e) => {
      if (idled || !isTile(e)) return
      tiles.done++
      reportTiles()
    })
    map.on("error", (e) => {
      if (idled || !("tile" in e)) return
      tiles.failed++
      reportTiles()
    })
    map.on("idle", () => {
      joinBuildings()
      iconsRef.current?.refreshElevation()
      if (!idled) {
        idled = true
        firstIdleRef.current = true
        tellIdle()
      }
    })
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
      popup.setLngLat(e.lngLat).setDOMContent(tipNode(String(hit.properties.tip))).addTo(m)
    })
    map.on("mouseout", () => popup.remove())
    map.on("dragstart", () => popup.remove())
    // 사용자가 만지면 자동 회전을 멈춘다
    const stopOrbit = () => onOrbitStopRef.current?.()
    map.on("dragstart", stopOrbit)
    map.on("wheel", stopOrbit)
    map.on("touchstart", stopOrbit)
    // 지도가 움직이는 동안(회전·드론·카메라 큐·드래그) html.lg-moving을 붙여 유리 굴절 필터를 쉬게 한다(globals.css).
    // 굴절(backdrop-filter: url)은 지도가 바뀔 때마다 다시 그려져 회전 fps를 반으로 깎았다(2026-09-21 실측 25→56). 멈추면 240ms 뒤 굴절 복귀
    const root = document.documentElement
    let movingTimer = 0
    const onMove = () => {
      if (!movingTimer) root.classList.add("lg-moving")
      else window.clearTimeout(movingTimer)
      movingTimer = window.setTimeout(() => {
        movingTimer = 0
        root.classList.remove("lg-moving")
      }, 240)
    }
    map.on("move", onMove)
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
      window.clearTimeout(movingTimer)
      root.classList.remove("lg-moving")
      popup.remove()
      // map.remove()는 커스텀 레이어 onRemove를 안 부른다(three 렌더러·캔버스 누수). 툰 층은 먼저 떼고 비운다
      const toon = toonRef.current
      if (toon) {
        if (map.getLayer(toon.id)) map.removeLayer(toon.id)
        toon.dispose()
      }
      toonRef.current = null
      toonLoadingRef.current = false
      // 아이콘 층(icons3d)도 같은 이유로 먼저 떼고 렌더러를 비운다(지도를 다시 만들 때마다 옛 three 렌더러가 남았다)
      const icons = iconsRef.current
      if (icons) {
        if (map.getLayer(icons.id)) map.removeLayer(icons.id)
        icons.dispose()
      }
      map.remove()
      mapRef.current = null
      popupRef.current = null
      focusMarkerRef.current?.remove()
      focusMarkerRef.current = null
      iconsRef.current = null
      setIconsReady(false)
      setToonState("none")
      firstIdleRef.current = false
      idleToldRef.current = false
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
    setFC(map, S.landmarks, landmarksFC())
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
    // 인프라·후보·핫스팟·상습격자 레이어가 켜지면 격자를 자동으로 흐려 점이 확실히 보이게
    const muted = layers.length > 0 || showCandidates || showBinRecos || showHotspots || showCritical
    // 동을 골랐으면 그 동 안은 항상 또렷하게. 레이어 때문에 흐려지는 건 선택 없는 전체보기일 때만
    const dimmed: ExpressionSpecification = selectedDong ? ["!=", ["get", "dong"], selectedDong] : ["literal", muted]
    // 재배치 후보를 표시하는 동안은 바탕 램프를 회색 단계로: 근거(기록이 많은 칸)는 남기되 색은 앰버 핀·보라 카메라만 갖는다(2026-09-21 "색이 겹친다")
    const greyMode = showCandidates && !selectedDong && base !== "none"
    if (base === "none") {
      // 바탕 없음: 격자를 안 칠한다. 동 선택 시 그 동만 옅은 격자선으로 범위를 알린다
      map.setPaintProperty(S.grid, "fill-opacity", 0)
      map.setPaintProperty(L_GRID_LINE, "line-color", ZERO_CELL)
      map.setPaintProperty(L_GRID_LINE, "line-opacity", selectedDong ? ["case", dimmed, 0, 0.35] : 0)
    } else {
      const def = BASE_DEF[base]
      const prop = { 4: "comp", 5: "enf", 6: "unm", 8: "lp" }[def.idx]
      const positive: ExpressionSpecification = [">", ["get", prop], 0]
      // 값 0인 칸도 옅은 테두리로 그린다. 안 그리면 "격자가 없는 곳은 뭐냐"는 물음에 답이 없다(흐림 상태에선 숨김)
      map.setPaintProperty(S.grid, "fill-color", ["case", positive, stepExpr(prop, def.stops, greyMode ? greyRamp(themeRef.current, def.pal.length) : def.pal) as ExpressionSpecification, ZERO_CELL])
      map.setPaintProperty(S.grid, "fill-opacity", ["case", positive, ["case", dimmed, muted ? 0.25 : 0.18, 0.8], ["case", dimmed, 0, 0.12]])
      map.setPaintProperty(L_GRID_LINE, "line-color", ["case", positive, "#ffffff", ZERO_CELL])
      map.setPaintProperty(L_GRID_LINE, "line-opacity", ["case", positive, ["case", dimmed, 0.25, 0.7], ["case", dimmed, 0, 0.55]])
    }
    const dimPt: ExpressionSpecification = selectedDong ? ["!=", ["get", "dong"], selectedDong] : ["literal", muted && !selectedDong]
    // 날씨별 원이 켜져 있으면 보통 원 대신 그쪽만
    setFC(map, S.circles, weather ? emptyFC() : circlesFC(data, circles))
    map.setPaintProperty(S.circles, "circle-opacity", ["case", dimPt, 0.04, ["get", "fill"]])
    map.setPaintProperty(S.circles, "circle-stroke-opacity", ["case", dimPt, 0.15, 0.75])
    setFC(map, S.weather, weather ? weatherFC(data, weather) : emptyFC())
    map.setPaintProperty(S.weather, "circle-opacity", ["case", dimPt, 0.04, 0.22])
    map.setPaintProperty(S.weather, "circle-stroke-opacity", ["case", dimPt, 0.15, 0.8])
    // 입체: 원 → 원기둥. 격자 기둥이 켜져 있으면 같은 자리에 두 기둥이 겹치니 원기둥은 쉰다. 흐림(다른 레이어 켜짐)은 평면의 0.04처럼 숨김, 동 선택은 그 동만
    setCols(map, S.circleCols, weather || grid3d ? emptyFC() : circleColumnsFC(data, circles))
    setCols(map, S.weatherCols, weather ? weatherColumnsFC(data, weather) : emptyFC())
    if (tiltRef.current) rise(map, weather ? S.weatherCols : S.circleCols)
    const colDong = selectedDong ? selectedDong : muted ? "\u0000" : null
    filterCols(map, S.circleCols, colDong)
    filterCols(map, S.weatherCols, colDong)
    // 건물 색 = 그 건물이 선 칸의 바탕 값(feature-state). 값 0·칸 밖·다른 동은 중립색. 평면 격자와 같은 램프라 범례가 그대로 통한다.
    // 시설·후보·배치추천 말뚝이 서면 히트맵을 중립색 쪽으로 55% 눌러 말뚝이 앞에 선다(빨간 후보가 주황 건물에 묻혔던 실측). 동별 기둥은 기둥이 주인공이라 건물은 중립
    // 바탕 없음이면 층수 실사 색(map-geo realBuildingExpr). 동 선택·동별 기둥 때도 실사 색 유지(중립 회색보다 지도가 살아 있다)
    const neutral = NEUTRAL_BUILDING[themeRef.current]
    // 재배치 후보가 서면 건물도 회색 단계(greyMode): 과태료 바탕(앰버·벽돌) 위에서 앰버 핀·숫자가 묻혔다(2026-09-21 사용자 지적 "색이 겹친다").
    // 근거(진할수록 기록 많음)는 남고 색은 앰버 핀·보라 카메라만. 바탕 없음이면 실사 대신 중립 회색
    const dimB: ExpressionSpecification = selectedDong ? ["!=", ["feature-state", "dong"], selectedDong] : ["literal", showDongBars]
    if (map.getLayer(L_BUILDINGS_NSDI)) {
      if (base === "none") map.setPaintProperty(L_BUILDINGS_NSDI, "fill-extrusion-color", showCandidates && !selectedDong ? neutral : (realBuildingExpr(themeRef.current) as ExpressionSpecification))
      else {
        const def = BASE_DEF[base]
        const prop = { 4: "comp", 5: "enf", 6: "unm", 8: "lp" }[def.idx]
        const val: ExpressionSpecification = ["coalesce", ["feature-state", prop], 0]
        const pointsOn = layers.length > 0 || showBinRecos
        const pal = greyMode ? greyRamp(themeRef.current, def.pal.length) : pointsOn ? def.pal.map((c) => mixHex(c, neutral, 0.55)) : def.pal
        map.setPaintProperty(L_BUILDINGS_NSDI, "fill-extrusion-color", ["case", dimB, neutral, [">", val, 0], stepExpr(prop, def.stops, pal, val) as ExpressionSpecification, neutral])
      }
    }
  }, [data, ready, base, circles, selectedDong, layers, showCandidates, showBinRecos, showHotspots, showCritical, weather, grid3d, theme, showDongBars])

  // 모형 건물(23라운드)도 위와 같은 규칙(toon-palette): 동마다 벽·지붕 색 텍스처만 다시 올린다(three 텍스처만 만진다).
  // 툰 상태를 MapLibre 칠하기 effect deps 에 걸지 않는다: 툰이 설 때마다 원기둥이 다시 솟았다(23라운드)
  useEffect(() => {
    if (!ready || !data) return
    toonRef.current?.setPaint({ theme, base, grid: data.grid, selectedDong, dongBars: showDongBars, candidates: showCandidates, pointsOn: layers.length > 0 || showBinRecos })
  }, [data, ready, base, selectedDong, layers, showCandidates, showBinRecos, theme, showDongBars, toonState])

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
    // 입체: 투명 말뚝·고리(툴팁 조회용 자리) + Three.js 아이콘(모양은 icons3d.ts)
    setFC(map, S.infraPosts, postsFC(infra, POST_R_M, POST_H_M))
    setFC(map, S.candPosts, postsFC(cand, CAND_POST_R_M, CAND_POST_H_M))
    setFC(map, S.recoRings, ringsFC(reco, RECO_RING_R_M, 5, RECO_RING_H_M))
    const icons = iconsRef.current
    if (icons) {
      for (const id of Object.keys(INFRA_STYLE) as InfraLayerId[]) {
        const pts: IconPoint[] = layers.includes(id) ? tallyInfra(data.infra[id]).spots.map((sp) => ({ lng: sp.lng, lat: sp.lat })) : []
        icons.setPoints(id as IconKind, pts)
      }
      icons.setPoints("cand", showCandidates ? data.cctvCandidates.map((c, i) => ({ lng: c[1], lat: c[0], rank: i + 1 })) : [])
      icons.setPoints("binReco", showBinRecos ? (data.binRecos?.items ?? []).map((r) => ({ lng: r[1], lat: r[0] })) : [])
    }
  }, [data, ready, layers, showCandidates, showBinRecos, iconsReady])

  // 청소차 관리노선. road-links.json 동적 임포트(번들 제외), 도로명으로 필터
  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return
    if (!showRoutes) {
      setFC(map, S.routes, emptyFC())
      iconsRef.current?.setTrucks([])
      return
    }
    let alive = true
    void import("@/lib/gwangjin/road-links.json").then((roads) => {
      const m = mapRef.current
      if (!alive || !m) return
      const links = (roads.default as unknown as { links: { n?: string; p: number[][] }[] }).links
      setFC(m, S.routes, routesFC(links))
      // 청소차(18라운드 후속): 노선 체인마다 1~2대가 왕복한다(icons3d)
      iconsRef.current?.setTrucks(routeChains(links))
    })
    return () => {
      alive = false
    }
  }, [ready, showRoutes, iconsReady])

  // 예측 핫스팟 20 기둥+순위(운영·전망 탭). 순위는 입체에서 기둥 꼭대기 입체 숫자(재배치 후보와 같은 문법, 21라운드: 바닥 라벨은 기둥에 깔려 안 읽혔다), 평면에서 바닥 배지
  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready || !data) return
    const hot = showHotspots ? hotspotsFC(data) : { cols: emptyFC(), labels: emptyFC(), ranks: [] }
    setCols(map, S.hotCols, hot.cols)
    setFC(map, S.hotLabels, hot.labels)
    if (showHotspots) rise(map, S.hotCols)
    const icons = iconsRef.current
    if (!icons) return
    if (!showHotspots) {
      icons.setPoints("hotRank", [])
      return
    }
    // 기둥이 다 솟은 뒤 숫자가 선다
    const t = window.setTimeout(() => iconsRef.current?.setPoints("hotRank", hot.ranks), 900)
    return () => window.clearTimeout(t)
  }, [data, ready, showHotspots, iconsReady])

  // 집중관리 상습격자 (12개월 10건 이상). 칸 외곽선 + 기둥(높이=12개월 건수). 건수는 입체에서 기둥 꼭대기 입체 숫자, 평면에서 바닥 라벨(21라운드)
  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready || !data) return
    const crit = showCritical ? criticalFC(data) : { cells: emptyFC(), cols: emptyFC(), labels: emptyFC(), counts: [] }
    setFC(map, S.critCells, crit.cells)
    setCols(map, S.critCols, crit.cols)
    setFC(map, S.critLabels, crit.labels)
    if (showCritical) rise(map, S.critCols)
    const icons = iconsRef.current
    if (!icons) return
    if (!showCritical) {
      icons.setPoints("critCount", [])
      return
    }
    const t = window.setTimeout(() => iconsRef.current?.setPoints("critCount", crit.counts), 900)
    return () => window.clearTimeout(t)
  }, [data, ready, showCritical, iconsReady])

  // 격자 기둥. 원 지표(민원·과태료, 없으면 과태료) 건수를 칸 가운데 기둥으로. 5건 이상 칸만
  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready || !data) return
    const ids: CircleId[] = circles.length ? circles : ["enf"]
    setCols(map, S.cols, grid3d ? gridColumnsFC(data, ids, selectedDong) : emptyFC())
    if (grid3d) rise(map, S.cols)
  }, [data, ready, grid3d, circles, selectedDong])

  // 테마(17라운드)·표현(23라운드 도면/모형). 24라운드부터 바탕을 setStyle 로 갈지 않고 같은 레이어의 칠하기만 바꾼다(map-layers restyleBasemap):
  // 예전엔 새 스타일이 뜨는 30~90ms 사이 다른 토글이 setPaintProperty 를 부르면 오류 화면으로 떨어졌다. 소스·feature-state·커스텀 층이 그대로라 다시 붙일 것도 없다.
  // 첫 스타일은 초기화에서 이미 반영했으니 바뀔 때만
  const themeAppliedRef = useRef(`${theme}:${look}`)
  useEffect(() => {
    const map = mapRef.current
    const key = `${theme}:${look}`
    if (!map || !ready || !data || themeAppliedRef.current === key) return
    themeAppliedRef.current = key
    restyleBasemap(map, buildBasemapStyle(data.ring, theme, look))
    applyThemePaint(map, theme, look)
    toonRef.current?.setTheme(theme === "dark")
    iconsRef.current?.setTheme(theme === "dark")
    showBuildings(map)
    applySky(map)
  }, [ready, data, theme, look])

  // 지도 날씨(23라운드). 바뀔 때·테마·입체 전환 때 다시
  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return
    applySky(map)
  }, [ready, sky.kind, sky.level, theme, tilt, toonState])

  // 입체/평면. 기울기·건물·지형을 한 번에. 평면은 위에서 본 격자(기둥은 윗면만 보인다)
  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return
    for (const id of FLAT_ONLY) map.setLayoutProperty(id, "visibility", tilt ? "none" : "visible")
    for (const id of TILT_ONLY) map.setLayoutProperty(id, "visibility", tilt ? "visible" : "none")
    iconsRef.current?.setVisible(tilt)
    if (tilt) for (const id of [S.circleCols, S.weatherCols]) rise(map, id)
    map.setTerrain(tilt ? { source: DEM_SOURCE, exaggeration: TERRAIN_EXAG } : null)
    map.easeTo({ pitch: tilt ? TILT_PITCH : 0, bearing: tilt ? TILT_BEARING : 0, duration: 700 })
  }, [ready, tilt])

  // 입체 건물: 도면이면 지도 압출(GIS건물통합정보 타일), 모형이면 three 툰 건물. 툰이 다 서기 전·못 받았으면 압출이 대신 선다(빈 동네 없이 한 번에 바뀐다)
  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return
    showBuildings(map)
    ensureToon(map)
    tellIdle()
  }, [ready, tilt, look, toonState])

  // 자동 회전(시연). 프레임마다 방위를 조금씩. 사용자가 만지면 초기화 effect의 stopOrbit이 부모 상태를 끈다
  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready || !orbit) return
    let raf = 0
    let last = performance.now()
    const step = (t: number) => {
      const m = mapRef.current
      if (!m) return
      // 카메라 큐(easeTo)가 움직이는 동안은 기다린다. setBearing은 jumpTo라 진행 중인 이동을 끊는다(maplibre 6 은 isEasing 이 Map 에 없어 isMoving: 끌기 중에도 쉰다)
      if (!m.isMoving()) m.setBearing(m.getBearing() + (t - last) * ORBIT_DEG_PER_MS)
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
    const wps = flyWaypoints(data, { center: [c.lng, c.lat], zoom: (cam.zoom ?? 13.4) - TILT_ZOOM_BACK }, fly)
    const segs = wps.slice(0, -1).map((w, i) => flySegmentMs(w, wps[i + 1]))
    const stops = wps.filter((w) => w.target).length
    // 경로 점선만. 번호 지점은 뺐다(21라운드: 기둥·핀의 순위 숫자, 상습격자의 건수 라벨과 같은 자리에 숫자가 둘씩 겹쳤다). 몇 번째인지는 안내 띠·초점 고리가 말한다
    setFC(map, S.flyPath, flyRouteFC(data, fly).path)
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
        setFlyInfo({ i: 0, total: stops, label: k === 0 ? `구 전체 조망 · ${FLY_KIND_LABEL[fly]} 상위 ${stops}곳으로` : "구 전체 조망으로 복귀" })
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
        setFC(m, S.focusRing, emptyFC())
      }
      setFlyInfo(null)
    }
  }, [ready, fly, data])

  // 동별 민원·과태료 기둥(17라운드: SVG 등축 마커 → 진짜 입체). 동 가운데에 민원 파랑·과태료 갈색 두 기둥, 채널 모드는 민원 기둥을 세 토막으로
  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready || !data) return
    const d = showDongBars ? dongColumnsFC(data, dongMode, dongYear) : { cols: emptyFC(), labels: emptyFC(), ranks: [] }
    setCols(map, S.dongCols, d.cols)
    setFC(map, S.dongColLabels, d.labels)
    if (showDongBars) rise(map, S.dongCols, true, 1100)
    // 1~3위 배지를 기둥 꼭대기에(입체에서만 보이는 아이콘 레이어). 기둥이 다 솟은 뒤 나타나게 살짝 늦춘다
    // 기둥 값 라벨이 동 이름을 같이 달고 있으니 지도 동 라벨은 겹치지 않게 숨긴다
    map.setLayoutProperty(S.dongLabel, "visibility", showDongBars ? "none" : "visible")
    const icons = iconsRef.current
    if (!icons) return
    if (!showDongBars) {
      icons.setPoints("dongRank", [])
      return
    }
    const t = window.setTimeout(() => iconsRef.current?.setPoints("dongRank", d.ranks), 900)
    return () => window.clearTimeout(t)
  }, [data, ready, showDongBars, dongMode, dongYear, iconsReady])

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
      lb.style.zIndex = "4" // 날씨 덮개(지도 상자 뒤 형제) 위로
      lb.textContent = focusCandidate.label
      focusMarkerRef.current = new maplibregl.Marker({ element: lb, anchor: "bottom", offset: [0, -54] }).setLngLat(lnglat).addTo(map)
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

  // 카드 숨김·보임(padSeq): 지도 padding만 새로 주고 같은 중심을 보이는 영역 가운데로. 줌·기울기·방위는 그대로(회전·비행 중이면 그 위에 얹힌다)
  const padSeqRef = useRef(padSeq)
  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready || padSeqRef.current === padSeq) return
    padSeqRef.current = padSeq
    // 드론 비행은 프레임마다 jumpTo라 easeTo가 첫 프레임에 끊긴다 → 즉시 적용. 회전(orbit)은 isEasing 중 쉬므로 부드럽게
    if (fly) map.setPadding(padding())
    else map.easeTo({ padding: padding(), duration: 700, essential: true })
  }, [ready, padSeq, fly])

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
      {/* 빗줄기·눈송이·안개(지도 날씨). 카드·열이 가리지 않는 영역에만(유리 패널 아래가 움직이면 굴절을 매 프레임 다시 계산한다) */}
      <WeatherOverlay sky={sky} dark={theme === "dark"} inset={{ left: fitPadding?.tl[0] ?? 0, top: fitPadding?.tl[1] ?? 0, right: fitPadding?.br[0] ?? 0, bottom: fitPadding?.br[1] ?? 0 }} />
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
