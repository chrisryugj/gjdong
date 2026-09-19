"use client"

import { useEffect, useRef, useState } from "react"
import maplibregl, {
  type ExpressionSpecification,
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
import { BASEMAP_BOUNDS, BASEMAP_SOURCE, DEM_SOURCE, buildBasemapStyle } from "@/lib/dumping/basemap-style"
import {
  BAR_BOTTOM,
  BAR_H,
  BAR_TOP,
  BAR_W,
  BASE_DEF,
  BIN_RECO_COLOR,
  CRIT_COLOR,
  ZERO_CELL,
  binRecosFC,
  candidatesFC,
  circlesFC,
  criticalFC,
  dongBars,
  dongFC,
  emptyFC,
  gridColumnsFC,
  gridFC,
  hotspotsFC,
  infraFC,
  radiusMetersExpr,
  ringFC,
  routesFC,
  stepExpr,
  weatherFC,
  type CandidateFocus,
  type FC,
} from "./map-geo"

// 16라운드(2026-09-19): Leaflet → MapLibre GL. 서울 3D Atlas를 보고 "지도가 분석 결론을 그림으로 말하게" 바꿨다.
// 바탕은 자체 호스팅 벡터 타일(lib/dumping/basemap-style.ts) + 건물 3D + 아차산 지형, 기둥은 진짜 입체(fill-extrusion).
// 레이어는 처음 한 번 전부 선언하고(빈 데이터) 이후에는 setData·setPaintProperty·visibility만 바꾼다(엔진 관용구, 재생성 비용 0)
// 상수·툴팁·GeoJSON 조립은 map-geo.ts(엔진 없이 테스트 가능. 이 파일은 CSS를 임포트해 tsx 테스트가 못 읽는다)
export type { CandidateFocus } from "./map-geo"

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
} as const
const L_BUILDINGS = "dump-buildings"
const L_GRID_LINE = "dump-grid-line"
const L_COL_LABEL = "dump-col-label"
const L_ROUTES_GENERAL = "dump-routes-general"
const L_ROUTES_FOCUS = "dump-routes-focus"
const L_CRIT_FILL = "dump-crit-fill"
const L_CRIT_LINE = "dump-crit-line"
const L_CAND_LABEL = "dump-cand-label"
// 호버 툴팁을 읽는 레이어. 위에 그린 것부터(queryRenderedFeatures가 위→아래 순으로 준다)
const HOVER_LAYERS = [
  L_CAND_LABEL, S.cand, S.binReco, S.infra, S.hotLabels, S.hotCols, S.critCols, L_CRIT_FILL, S.cols, L_ROUTES_FOCUS, L_ROUTES_GENERAL, S.weather, S.circles, S.grid,
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
  orbit: boolean // 자동 회전(시연용). 사용자가 지도를 만지면 onOrbitStop
  onOrbitStop?: () => void
  resetSeq: number // 증가 시 구 전체 뷰로 복귀 (헤더 배너 리셋)
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
  orbit,
  onOrbitStop,
  resetSeq,
  fitPadding,
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
  const dongBarMarkersRef = useRef<MlMarker[]>([])
  const focusMarkersRef = useRef<MlMarker[]>([])
  const ringBoundsRef = useRef<LngLatBoundsLike | null>(null)
  // 컨테이너 높이가 0일 때(모바일 지도 접힘) 미뤄 둔 구 전체 맞춤. 높이가 생기면 ResizeObserver가 실행한다
  const pendingFitRef = useRef<(() => void) | null>(null)
  // 스타일·레이어가 다 선언된 뒤에야 데이터 effect가 돈다. 데이터가 먼저 와도 ready로 재트리거
  const [ready, setReady] = useState(false)

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
      style: buildBasemapStyle(data.ring),
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
    const popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false, className: "dump-pop", maxWidth: "340px", offset: 14 })
    popupRef.current = popup

    map.on("load", () => {
      if (mapRef.current !== map) return
      map.addImage(BIN_RECO_ICON, dashedCircleIcon().data, { pixelRatio: 2 })
      declareLayers(map)
      setReady(true)
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
      dongBarMarkersRef.current = []
      focusMarkersRef.current = []
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
  }, [data, ready, base, circles, selectedDong, layers, showCandidates, showBinRecos, showHotspots, showCritical, weather])

  // 동 선택. 전체 동은 상시 얇게, 선택 동은 굵게 + 은은한 채움 + 동 전체가 화면에 들어오게
  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready || !data) return
    const sel = selectedDong ?? ""
    map.setPaintProperty(S.dongLine, "line-color", ["case", ["==", ["get", "name"], sel], "#c2410c", "#64748b"])
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
    setFC(map, S.infra, infraFC(data, layers))
    setFC(map, S.cand, showCandidates ? candidatesFC(data) : emptyFC())
    setFC(map, S.binReco, showBinRecos ? binRecosFC(data) : emptyFC())
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
  }, [data, ready, showHotspots])

  // 집중관리 상습격자 (12개월 10건 이상). 칸 외곽선 + 기둥(높이=12개월 건수)
  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready || !data) return
    const crit = showCritical ? criticalFC(data) : { cells: emptyFC(), cols: emptyFC(), labels: emptyFC() }
    setFC(map, S.critCells, crit.cells)
    setFC(map, S.critCols, crit.cols)
    setFC(map, S.critLabels, crit.labels)
  }, [data, ready, showCritical])

  // 격자 기둥. 원 지표(민원·과태료, 없으면 과태료) 건수를 칸 가운데 기둥으로. 5건 이상 칸만
  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready || !data) return
    const ids: CircleId[] = circles.length ? circles : ["enf"]
    setFC(map, S.cols, grid3d ? gridColumnsFC(data, ids, selectedDong) : emptyFC())
  }, [data, ready, grid3d, circles, selectedDong])

  // 입체/평면. 기울기·건물·지형을 한 번에. 평면은 위에서 본 격자(기둥은 윗면만 보인다)
  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return
    map.setLayoutProperty(L_BUILDINGS, "visibility", tilt ? "visible" : "none")
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
      m.setBearing(m.getBearing() + (t - last) * ORBIT_DEG_PER_MS)
      last = t
      raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [ready, orbit])

  // 동별 민원·과태료 3D 막대(HTML 마커, SVG 등축). 기울여도 화면에 선 채로 따라온다
  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return
    for (const mk of dongBarMarkersRef.current) mk.remove()
    dongBarMarkersRef.current = []
    // 막대에 동 이름이 붙으니 지도 동 라벨은 겹치지 않게 숨긴다
    map.setLayoutProperty(S.dongLabel, "visibility", showDongBars ? "none" : "visible")
    if (!showDongBars || !data) return
    const popup = popupRef.current
    for (const bar of dongBars(data, dongMode, dongYear)) {
      const el = document.createElement("div")
      el.className = "dump-dongbar"
      el.innerHTML = bar.svg
      // 툴팁 카드는 막대 옆에. 화면 밖으로 나가면 maplibre가 anchor를 뒤집는다
      el.addEventListener("mouseenter", () => {
        popup?.setLngLat(bar.lnglat).setHTML(bar.tip).setOffset([BAR_W / 2 + 4, -(BAR_H + BAR_TOP) / 2]).addClassName("dump-bartip-wrap").addTo(map)
      })
      el.addEventListener("mouseleave", () => {
        popup?.removeClassName("dump-bartip-wrap").setOffset(14)
        popup?.remove()
      })
      const mk = new maplibregl.Marker({ element: el, anchor: "bottom", offset: [0, BAR_BOTTOM] }).setLngLat(bar.lnglat).addTo(map)
      dongBarMarkersRef.current.push(mk)
    }
  }, [data, ready, showDongBars, dongMode, dongYear])

  // 목록 클릭 → 해당 지점으로 당겨가기 + 펄스 하이라이트로 위치를 확실히 표시
  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return
    for (const mk of focusMarkersRef.current) mk.remove()
    focusMarkersRef.current = []
    if (!focusCandidate) return
    const lnglat: [number, number] = [focusCandidate.latlng[1], focusCandidate.latlng[0]]
    const el = document.createElement("div")
    el.className = "dump-focus"
    el.innerHTML = `<i class="dump-focus-dot"></i><i class="dump-focus-ring"></i>`
    focusMarkersRef.current.push(new maplibregl.Marker({ element: el, anchor: "center" }).setLngLat(lnglat).addTo(map))
    if (focusCandidate.label) {
      const lb = document.createElement("div")
      lb.className = "dump-focus-label"
      lb.textContent = focusCandidate.label
      focusMarkersRef.current.push(new maplibregl.Marker({ element: lb, anchor: "bottom", offset: [0, -20] }).setLngLat(lnglat).addTo(map))
    }
    map.flyTo({ center: lnglat, zoom: 16, duration: 600 })
  }, [ready, focusCandidate])

  // 헤더 배너 리셋 → 구 전체 뷰(기본 방위로)
  useEffect(() => {
    const map = mapRef.current
    if (!resetSeq || !map || !ready || !ringBoundsRef.current) return
    fitTo(ringBoundsRef.current, { duration: 500 })
  }, [resetSeq])

  return <div ref={boxRef} className="dumping-map h-full w-full" />
}

function padWith(p: PaddingOptions, extra: number): PaddingOptions {
  return { top: (p.top ?? 0) + extra, left: (p.left ?? 0) + extra, bottom: (p.bottom ?? 0) + extra, right: (p.right ?? 0) + extra }
}

function setFC(map: MlMap, id: string, data: FC) {
  const src = map.getSource(id) as GeoJSONSource | undefined
  src?.setData(data)
}

// 소스·레이어 전부를 빈 데이터로 선언. 그리는 순서(아래→위): 마스크 → 격자 면 → 동 채움 → 원 → 노선 → 상습격자 면 → 격자선·동 외곽선·구 경계
// → 건물(바닥에 그린 것은 건물이 가리고, 점·기둥은 건물 위에) → 시설·후보·배치추천 → 기둥 3종 → 라벨(항상 맨 위)
function declareLayers(map: MlMap) {
  const geo = (id: string) => map.addSource(id, { type: "geojson", data: emptyFC() })
  for (const id of Object.values(S)) geo(id)
  // 바탕 스타일의 첫 라벨 레이어 앞에 면·선을 끼워 넣는다. 도로명·지명은 우리 면 위에 남는다
  const firstSymbol = map.getStyle().layers.find((l) => l.type === "symbol")?.id
  const under = (spec: LayerSpecification) => map.addLayer(spec, firstSymbol)

  under({ id: S.mask, type: "fill", source: S.mask, paint: { "fill-color": "#ffffff", "fill-opacity": 0.55 } })
  under({ id: S.grid, type: "fill", source: S.grid, paint: { "fill-color": ZERO_CELL, "fill-opacity": 0 } })
  under({ id: S.dongFill, type: "fill", source: S.dongFill, filter: ["==", ["get", "name"], ""], paint: { "fill-color": "#c2410c", "fill-opacity": 0.06 } })
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
  // OSM 건물(Protomaps buildings). 구 안은 조금 진하게, 밖은 마스크와 같은 밝기. 높이 없는 건물은 9m(3층)로
  under({
    id: L_BUILDINGS,
    type: "fill-extrusion",
    source: BASEMAP_SOURCE,
    "source-layer": "buildings",
    minzoom: 12,
    layout: { visibility: "none" },
    paint: {
      "fill-extrusion-color": "#d7d5cd",
      "fill-extrusion-height": ["coalesce", ["get", "height"], 9],
      "fill-extrusion-base": ["coalesce", ["get", "min_height"], 0],
      "fill-extrusion-opacity": 0.85,
    },
  })
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
    paint: { "circle-radius": 13, "circle-color": "#dc2626", "circle-stroke-color": "#ffffff", "circle-stroke-width": 2 },
  })
  // 기둥 3종. 위에서 아래로 갈수록 밝아지는 면 그라데이션이 입체감을 만든다
  const col = (id: string, source: string, color: ExpressionSpecification | string) =>
    under({
      id,
      type: "fill-extrusion",
      source,
      paint: { "fill-extrusion-color": color, "fill-extrusion-height": ["get", "h"], "fill-extrusion-opacity": 0.88, "fill-extrusion-vertical-gradient": true },
    })
  col(S.cols, S.cols, ["get", "color"])
  col(S.critCols, S.critCols, CRIT_COLOR)
  col(S.hotCols, S.hotCols, ["get", "color"])
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
  map.addLayer({
    id: L_CAND_LABEL,
    type: "symbol",
    source: S.cand,
    layout: { "text-field": ["get", "label"], "text-size": 12.5, "text-font": ["Noto Sans Medium"], "text-allow-overlap": true, "text-pitch-alignment": "viewport" },
    paint: { "text-color": "#ffffff" },
  })
}
