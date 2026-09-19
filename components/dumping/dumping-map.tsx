"use client"

import { useEffect, useRef, useState } from "react"
import type { LayerGroup, Map as LeafletMap, Renderer } from "leaflet"
import type {
  BaseMode,
  BinReco,
  CctvCandidate,
  CircleId,
  DumpingMapData,
  GridCell,
  HotspotRow,
  InfraLayerId,
  WeatherKey,
} from "@/lib/dumping/types"
import { tallyInfra, type InfraSpot } from "@/lib/dumping/facts"
import { CHANNEL_DEF, WEATHER_DEF, type DongMode } from "@/lib/dumping/labels"

// 100m 격자 choropleth. 960셀 + 인프라 최대 1,400점이라 canvas 렌더러 필수
// 타일: OSM 표준 + CSS grayscale 뮤트(globals.css .dumping-map). CARTO는 무키 워터마크,
// Esri Light Gray는 한국 z14+ 미제공("Map data not yet available") 실측
const TILE_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png"
const TILE_ATTR = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'

// 모드별 팔레트를 분리해 "지금 뭘 보고 있는지"가 색으로 구분되게 한다
// 원인(다가구·단독 밀집)=초록 · 민원=파랑 · 과태료=주황
const PAL_GREEN = ["#dfe9e3", "#b9d6ca", "#8ec2ae", "#5ea78d", "#2f8267", "#0b4f45"] // 낮은 단계를 바탕(#e8ebe6)에서 띄움. 줌을 빼면 첫 단계 칸이 지도에 묻혔다(2026-09-18)
const PAL_BLUE = ["#e9eef7", "#cfddf0", "#a6c3e3", "#78a3d2", "#4377b8", "#1c4f96"]
const PAL_AMBER = ["#faeee6", "#f5d3c0", "#eeab8a", "#e27f52", "#d9480f", "#8f2f08"]
const PAL_SLATE = ["#e6e9ee", "#c5ccd8", "#9faabd", "#75849e", "#4c5d7c", "#2f3e5e"] // 생활인구(노출). 결과·원인 색과 겹치지 않게. 낮은 단계는 바탕에서 띄움
const UNM_STOPS = [0, 20, 60, 150, 300, 600]
const CNT_STOPS = [0, 1, 2, 4, 8, 20]
const LP_STOPS = [0, 100, 300, 600, 1000, 2000] // 100m 격자 생활인구(명, 시간·일 평균)
export const ZERO_CELL = "#94a3b8" // 값 0인 칸의 옅은 테두리. 범례와 같은 색

export const INFRA_STYLE: Record<InfraLayerId, { color: string; label: string }> = {
  clothBins: { color: "#0e7490", label: "의류수거함" },
  cctvFixed: { color: "#b45309", label: "고정 CCTV" },
  cctvMobile: { color: "#7c3aed", label: "이동식 CCTV" },
  recycling: { color: "#059669", label: "재활용정거장" },
  bins: { color: "#475569", label: "가로쓰레기통" },
}

// 배치 추천은 설치 현황이 아니라 제안이라 인프라 레이어와 색·모양을 갈라 둔다(점선 원 = 아직 없는 것)
export const BIN_RECO_COLOR = "#be185d"
export const BIN_RECO_LABEL = "가로쓰레기통 배치추천(데이터팀)"

// 바탕(면)은 하나만. 두 히트맵을 겹치면 색이 섞여 판독 불가라 중첩 금지
export const BASE_DEF: Record<
  BaseMode,
  { idx: 4 | 5 | 6 | 8; stops: number[]; unit: string; pal: string[]; legend: string }
> = {
  unm: { idx: 6, stops: UNM_STOPS, unit: "세대", pal: PAL_GREEN, legend: "다가구·단독" },
  comp: { idx: 4, stops: CNT_STOPS, unit: "건", pal: PAL_BLUE, legend: "민원" },
  enf: { idx: 5, stops: CNT_STOPS, unit: "건", pal: PAL_AMBER, legend: "과태료" },
  lp: { idx: 8, stops: LP_STOPS, unit: "명", pal: PAL_SLATE, legend: "생활인구" },
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
  // 서울시 생활인구(2026-07 한 달, 24시간·31일 평균). 250m 격자를 100m 칸에 면적 비례로 나눈 값. 설명은 지도 도움말·방법 모달에
  const lp = cell[8] ? `<br/>생활인구 ${cell[8].toLocaleString()}명` : ""
  return `<b>${dong}</b><br/>민원 ${cell[4]}건 · 과태료 ${cell[5]}건<br/>다가구·단독 ${cell[6]}세대${lp}`
}

function candidateTooltip(rank: number, c: CctvCandidate): string {
  return (
    `<b>재배치 후보 ${rank}위</b> · ${escapeHtml(c[4])}<br/>` +
    `<b>${escapeHtml(c[5] || "대표 주소 없음 (격자 중심)")}</b> 인근<br/>` +
    `민원 ${c[2]}건 · 과태료 ${c[3]}건(전 기간)<br/>` +
    `<span style="color:#a8322a">발생이력 기준 자원배분 논리. 통계 효과 근거 아님</span>`
  )
}

// 한 좌표에 여러 설치장소가 겹칠 때 전부 보여준다. 점 하나가 곧 한 곳이라는 오해를 여기서 끊는다
function infraTooltip(id: InfraLayerId, spot: InfraSpot): string {
  const { label } = INFRA_STYLE[id]
  const head = spot.at.length > 1 ? `<b>${label}</b> · 이 지점에 ${spot.at.length}곳` : `<b>${label}</b>`
  const body = spot.at
    .map((p) => `${escapeHtml(p[2])}${p[3] ? ` <span style="color:#64748b">${escapeHtml(p[3])}</span>` : ""}`)
    .join("<br/>")
  return `${head}<br/>${body}`
}

function binRecoTooltip(seq: number, r: BinReco): string {
  return (
    `<b>${BIN_RECO_LABEL} ${seq}번</b> · ${escapeHtml(r[2])}<br/>` +
    `<b>${escapeHtml(r[3] || r[4])}</b><br/>` +
    (r[3] && r[4] ? `${escapeHtml(r[4])}<br/>` : "") +
    `<span style="color:#be185d">데이터팀 격자분석 제안. 번호는 자료 순서이지 우선순위가 아니고, 설치 지점은 현장 확인이 필요합니다</span>`
  )
}

function hotspotTooltip(rank: number, h: HotspotRow): string {
  return (
    `<b>예측 핫스팟 ${rank}위</b> · ${escapeHtml(h[5] || "광진구")}<br/>` +
    `<b>${escapeHtml(h[6] || "대표 주소 없음 (격자 중심)")}</b> 인근<br/>` +
    `최근 180일 민원 ${h[3]}건 · 과태료 ${h[4]}건<br/>` +
    `<span style="color:#64748b">이유 · 최근 90일 ${h[9]}건(이전 90일 ${h[10]}건) · 12개월 ${h[8]}건${h[11] >= 0 ? ` · 마지막 기록 ${h[11]}일 전` : ""}</span>` +
    (h[12] === 1 ? `<br/><span style="color:#a8322a">집중관리 상습격자</span>` : "") +
    (h[7] === 0 ? `<br/><span style="color:#b45309">이동식 CCTV 없음</span>` : "")
  )
}

export interface CandidateFocus {
  seq: number // 같은 후보를 연속 클릭해도 flyTo가 다시 일어나게 하는 시퀀스
  latlng: [number, number]
  label?: string // 하이라이트에 붙는 설명 (예: "예측 핫스팟 3위 · 화양동 45-7 인근")
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
  resetSeq: number // 증가 시 구 전체 뷰로 복귀 (헤더 배너 리셋)
  fitPadding?: { tl: [number, number]; br: [number, number] } // 지도 위에 뜬 카드·열이 가리는 영역(px). 구 전체 맞춤이 보이는 부분에만 맞춘다(2026-09-18 지도 전면)
}

// 동별 3D 막대 SVG. 등축 막대 2개(민원 파랑·과태료 갈색), 앞면·옆면·윗면 세 조각. 값은 위, 동 이름은 아래.
// 자라나는 애니메이션은 globals.css .dump-bar3d .bar
const BAR_W = 76
const BAR_TOP = 18 // 값 글자 자리
const BAR_BOTTOM = 26 // 동 이름 자리
// 등축 막대 한 토막. base=바닥 y. 세 조각(앞·옆·윗면). 스택은 같은 x에 y0를 올려 가며 여러 토막
type Face = { front: string; side: string; top: string }
function isoBar(x: number, base: number, y0: number, h: number, bw: number, D: number, f: Face, cls = ""): string {
  const y = base - y0 - h
  return (
    `<g class="bar ${cls}">` +
    `<rect x="${x}" y="${y}" width="${bw}" height="${h}" fill="${f.front}"/>` +
    `<polygon points="${x + bw},${y} ${x + bw + D},${y - D} ${x + bw + D},${y - D + h} ${x + bw},${y + h}" fill="${f.side}"/>` +
    `<polygon points="${x},${y} ${x + D},${y - D} ${x + bw + D},${y - D} ${x + bw},${y}" fill="${f.top}"/>` +
    `</g>`
  )
}
const COMP_FACE: Face = { front: "#2f5aa8", side: "#1d3f78", top: "#6b93d6" }
const ENF_FACE: Face = { front: "#9a6a2a", side: "#6e4a1b", top: "#c99a55" }
// 격자 기둥은 원 지표를 세운 것이라 원과 같은 색(민원 빨강·과태료 보라). 동별 막대(파랑·갈색)와 같은 색이면 둘을 같이 켰을 때 구분이 안 됐다(2026-09-18)
const GRID_COMP_FACE: Face = { front: "#a8322a", side: "#7a2420", top: "#cf6a63" }
const GRID_ENF_FACE: Face = { front: "#5b21b6", side: "#3f1683", top: "#9b6fe0" }
const CRIT_FACE: Face = { front: "#a8322a", side: "#7a2420", top: "#d0605a" }
const HOT_FACE: Face = { front: "#b45309", side: "#7c3a06", top: "#e0873a" }

// 기둥 하나(격자 기둥·상습격자·핫스팟). 값 라벨은 위, 선택 꼬리표(순위 등)는 라벨 자리에
const COL_W = 34
function columnSvg(h: number, H: number, face: Face, label: string, cls = ""): string {
  const D = 6
  const bw = 14
  const top = 16
  const base = top + H
  return (
    `<svg class="dump-bar3d dump-col" width="${COL_W}" height="${H + top + 4}" viewBox="0 0 ${COL_W} ${H + top + 4}">` +
    isoBar(10, base, 0, h, bw, D, face, cls) +
    (label ? `<text x="${10 + bw / 2 + 3}" y="${base - h - D - 4}" text-anchor="middle" font-size="11" font-weight="700" fill="${face.side}">${label}</text>` : "") +
    `</svg>`
  )
}

// 격자 기둥: 칸마다 원 지표 1~2개(민원·과태료). 이름 없이 값만
function cellBarsSvg(bars: { h: number; v: number; face: Face }[], H: number, labels = true): string {
  const D = 5
  const bw = 10
  const top = 14
  const base = top + H
  const w = 12 + bars.length * 16
  return (
    `<svg class="dump-bar3d dump-col" width="${w}" height="${H + top + 4}" viewBox="0 0 ${w} ${H + top + 4}">` +
    bars
      .map(
        (b, i) =>
          isoBar(6 + i * 16, base, 0, b.h, bw, D, b.face) +
          (labels ? `<text x="${6 + i * 16 + bw / 2 + 2}" y="${base - b.h - D - 3}" text-anchor="middle" font-size="9.5" fill="${b.face.side}">${b.v}</text>` : ""),
      )
      .join("") +
    `</svg>`
  )
}

// 동별 막대. segments가 있으면 민원 막대를 채널 스택(아래부터 순서대로)으로
function dongBarSvg(
  name: string,
  comp: number,
  enf: number,
  hc: number,
  he: number,
  H: number,
  segments?: { h: number; face: Face }[],
): string {
  const D = 7 // 깊이
  const bw = 16
  const base = BAR_TOP + H
  const x1 = 14
  const x2 = 42
  let compSvg = ""
  if (segments) {
    let y0 = 0
    for (const sg of segments) {
      if (sg.h <= 0) continue
      compSvg += isoBar(x1, base, y0, sg.h, bw, D, sg.face, "comp")
      y0 += sg.h
    }
  } else compSvg = isoBar(x1, base, 0, hc, bw, D, COMP_FACE, "comp")
  return (
    `<svg class="dump-bar3d" width="${BAR_W}" height="${H + BAR_TOP + BAR_BOTTOM}" viewBox="0 0 ${BAR_W} ${H + BAR_TOP + BAR_BOTTOM}">` +
    compSvg +
    isoBar(x2, base, 0, he, bw, D, ENF_FACE, "enf") +
    `<text x="${x1 + bw / 2 + 3}" y="${base - hc - D - 4}" text-anchor="middle" font-size="11" fill="#1d3f78">${comp.toLocaleString()}</text>` +
    `<text x="${x2 + bw / 2 + 3}" y="${base - he - D - 4}" text-anchor="middle" font-size="11" fill="#6e4a1b">${enf.toLocaleString()}</text>` +
    `<text x="${BAR_W / 2}" y="${base + 16}" text-anchor="middle" font-size="12.5" fill="#1f2937">${name}</text>` +
    `</svg>`
  )
}

// 「2026년 도로청소 종합계획」 관리도로. 도로명 기준(광진 구간 전체를 그림, 문서상 세부 구간과 근사)
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
  resetSeq,
  fitPadding,
}: DumpingMapProps) {
  const boxRef = useRef<HTMLDivElement>(null)
  const fitPadRef = useRef(fitPadding)
  fitPadRef.current = fitPadding
  const fitOpts = () => {
    const p = fitPadRef.current
    return p ? { paddingTopLeft: p.tl, paddingBottomRight: p.br } : { padding: [12, 12] as [number, number] }
  }
  const mapRef = useRef<LeafletMap | null>(null)
  const rendererRef = useRef<Renderer | null>(null)
  const infraRendererRef = useRef<Renderer | null>(null)
  const gridLayerRef = useRef<LayerGroup | null>(null)
  const dongLayerRef = useRef<LayerGroup | null>(null)
  const infraLayerRef = useRef<LayerGroup | null>(null)
  const boundaryDrawn = useRef(false)
  const prevDongRef = useRef<string | null>(null)
  const resizeObsRef = useRef<ResizeObserver | null>(null)
  // 컨테이너 높이가 0일 때(모바일 지도 접힘) 미뤄 둔 구 전체 맞춤. 높이가 생기면 ResizeObserver가 실행한다
  const pendingFitRef = useRef<(() => void) | null>(null)
  const routesLayerRef = useRef<LayerGroup | null>(null)
  const hotspotLayerRef = useRef<LayerGroup | null>(null)
  const criticalLayerRef = useRef<LayerGroup | null>(null)
  const focusLayerRef = useRef<LayerGroup | null>(null)
  const dongBarsLayerRef = useRef<LayerGroup | null>(null)
  const gridBarsLayerRef = useRef<LayerGroup | null>(null)
  // Leaflet 동적 import가 data fetch보다 늦으면 data 의존 effect가 헛돌고 끝난다. ready로 재트리거
  const [ready, setReady] = useState(false)
  // 줌 14 미만(모바일 전체보기)에선 핫스팟 순위 배지 20개가 서로 덮는다. 작은 점으로 바꾸기 위한 트리거
  const [zoomedOut, setZoomedOut] = useState(false)
  const [zoomTick, setZoomTick] = useState(0) // 줌이 바뀔 때마다 격자 기둥 밀도를 다시 정한다

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
      // 패널을 넓힌 뒤 구 전체보기가 13.75 근처라 14 기준이면 데스크톱에서도 순위가 사라진다(7라운드)
      map.on("zoomend", () => {
        setZoomedOut(map.getZoom() < 13.5)
        setZoomTick((t) => t + 1)
      })
      const observer = new ResizeObserver(() => {
        const m = mapRef.current
        // 탭 전환으로 컨테이너가 떨어져 나간 뒤 도착한 알림은 무시(제거된 지도에 invalidateSize를 부르면 _leaflet_pos 오류)
        if (!m || !boxRef.current?.isConnected) return
        m.invalidateSize()
        if (pendingFitRef.current && m.getSize().y > 0) {
          pendingFitRef.current()
          pendingFitRef.current = null
        }
      })
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
      mapRef.current?.stop() // 진행 중인 이동·줌 애니메이션 프레임이 제거된 지도를 만지지 않게
      mapRef.current?.remove()
      mapRef.current = null
      rendererRef.current = null
      infraRendererRef.current = null
      gridLayerRef.current = null
      dongLayerRef.current = null
      infraLayerRef.current = null
      hotspotLayerRef.current = null
      criticalLayerRef.current = null
      focusLayerRef.current = null
      boundaryDrawn.current = false
      setReady(false)
    }
  }, [])

  // 경계(바깥 딤 + 점선 링). 데이터 도착 후 1회
  useEffect(() => {
    const draw = async () => {
      const map = mapRef.current
      if (!map || !data || boundaryDrawn.current) return
      boundaryDrawn.current = true
      const L = await import("leaflet")
      if (mapRef.current !== map) return // 대기 중 탭 전환으로 지도가 제거됐으면 그리지 않는다(_leaflet_pos 오류 실측)
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
      // 높이 0인 컨테이너에 fitBounds를 하면 Leaflet이 줌을 최대(18)로 잡아 한 블록만 보인다(2026-09-16 폰 실측). 높이가 생길 때로 미룬다
      // animate:false — 줌 애니메이션 중 탭을 바꾸면 Leaflet이 250ms 뒤 _onZoomTransitionEnd를 제거된 지도에 불러 _leaflet_pos 오류(실측: 데이터 도착 직후 전환)
      const fit = () => {
        map.fitBounds(L.latLngBounds(data.ring), { ...fitOpts(), animate: false })
        setZoomedOut(map.getZoom() < 13.5)
      }
      if (map.getSize().y > 0) fit()
      else pendingFitRef.current = fit
    }
    void draw()
  }, [data, ready])

  // 격자 레이어. 바탕·원·선택동 변경마다 재구축 (canvas라 재구축 비용 낮음)
  useEffect(() => {
    const draw = async () => {
      const map = mapRef.current
      const renderer = rendererRef.current ?? undefined
      if (!map || !data) return
      const L = await import("leaflet")
      if (mapRef.current !== map) return // 대기 중 탭 전환으로 지도가 제거됐으면 그리지 않는다(_leaflet_pos 오류 실측)
      gridLayerRef.current?.remove()
      const group = L.layerGroup()
      const def = BASE_DEF[base]
      // 인프라·후보·핫스팟·상습격자 레이어가 켜지면 격자를 자동으로 흐려 점이 확실히 보이게
      const muted = layers.length > 0 || showCandidates || showBinRecos || showHotspots || showCritical

      // 동을 골랐으면 그 동 안은 항상 또렷하게. 레이어 때문에 흐려지는 건 선택 없는 전체보기일 때만
      const isDimmed = (cell: GridCell) => {
        const inDong = selectedDong === null || cell[7] === selectedDong
        return !inDong || (muted && selectedDong === null)
      }

      for (const cell of data.grid) {
        const v = cell[def.idx]
        const dimmed = isDimmed(cell)
        const bounds: [[number, number], [number, number]] = [
          [cell[0], cell[1]],
          [cell[2], cell[3]],
        ]
        if (v > 0) {
          // 칸 사이 흰 헤어라인. 다가구·단독·생활인구처럼 이웃 칸이 같은 단계로 이어지는 바탕은 선이 없으면 줌을 빼면 한 덩어리로 보인다(2026-09-18)
          L.rectangle(bounds, {
            pane: "dumpGrid",
            renderer,
            color: "#ffffff",
            weight: 0.8,
            opacity: dimmed ? 0.25 : 0.7,
            fillColor: colorOf(v, def.stops, def.pal),
            fillOpacity: dimmed ? (muted ? 0.25 : 0.18) : 0.8,
          })
            .bindTooltip(cellTooltip(cell), { sticky: true, direction: "top", opacity: 1 })
            .addTo(group)
        } else if (!dimmed) {
          // 값이 0인 칸도 옅은 테두리로 그린다. 안 그리면 "격자가 없는 곳은 뭐냐"는 물음에 답이 없다.
          // 그래도 흰 바탕으로 남는 곳은 민원·과태료·다가구·단독이 모두 0이라 격자 자료 자체에 없는 칸이다(범례에 적음)
          L.rectangle(bounds, {
            pane: "dumpGrid",
            renderer,
            color: ZERO_CELL,
            weight: 0.8,
            opacity: 0.55,
            fillColor: ZERO_CELL,
            fillOpacity: 0.12,
          })
            .bindTooltip(`${cellTooltip(cell)}<br/><span style="color:#64748b">${def.legend} 0${def.unit}인 칸</span>`, {
              sticky: true,
              direction: "top",
              opacity: 1,
            })
            .addTo(group)
        }
      }

      // 날씨별 원(12라운드): 보통 원 대신 그 조건에 접수된 민원을 하루당으로 환산(×100일)해 원으로. 접수일 기준
      if (weather && data.env.cellWeather && data.env.weatherDays) {
        const k = { hot: 0, mild: 1, cold: 2, rain: 3 }[weather]
        const days = Math.max(1, data.env.weatherDays[weather])
        const wdef = WEATHER_DEF[weather]
        const maxCnt = Math.max(1, ...data.env.cellWeather.map((v) => v[k]))
        data.grid.forEach((cell, i) => {
          const cnt = data.env.cellWeather[i]?.[k] ?? 0
          if (!cnt) return
          const per100 = (cnt / days) * 100
          const dimmed = isDimmed(cell)
          L.circle([(cell[0] + cell[2]) / 2, (cell[1] + cell[3]) / 2], {
            pane: "dumpGrid",
            renderer,
            // 하루당 값은 절대치가 작아(0.01~0.3) 보통 원 공식이면 전부 점이 된다. 그 조건 안의 최댓값 대비 상대 크기
            radius: 6 + Math.sqrt(cnt / maxCnt) * 64,
            color: wdef.color,
            weight: 1.1,
            opacity: dimmed ? 0.15 : 0.8,
            fillColor: wdef.color,
            fillOpacity: dimmed ? 0.04 : 0.22,
          })
            .bindTooltip(
              `${cellTooltip(cell)}<br/><span style="color:${wdef.color}">${wdef.label} 민원 ${cnt}건 · 하루당 ${(cnt / days).toFixed(2)}건(100일 환산 ${per100.toFixed(1)})</span>`,
              { sticky: true, direction: "top", opacity: 1 },
            )
            .addTo(group)
        })
      }
      // 원 오버레이. 선택된 지표들을 바탕 위에 중첩(날씨별이 켜져 있으면 그쪽 원만)
      for (const cid of weather ? [] : circles) {
        const cdef = CIRCLE_DEF[cid]
        const busy = data.grid.filter((c) => c[cdef.idx] > 0).sort((a, b) => b[cdef.idx] - a[cdef.idx])
        for (const cell of busy) {
          const v = cell[cdef.idx]
          const dimmed = isDimmed(cell)
          // 반경은 미터. 격자(약 100m)에 붙어 줌과 함께 커지고 작아진다. 픽셀 고정이면 전체보기에서 원끼리 덮는다.
          // 14라운드: 반경 상한 48m로 원이 제 칸(반지름 50m)을 넘지 않게. 26건 이상은 크기 대신 진하기로 구분(칸을 넘던 원이 옆 칸 원과 겹쳐 오독)
          L.circle([(cell[0] + cell[2]) / 2, (cell[1] + cell[3]) / 2], {
            pane: "dumpGrid",
            renderer,
            radius: Math.min(48, 8 + Math.pow(v, 0.6) * 6),
            color: cdef.color,
            weight: 1.1,
            opacity: dimmed ? 0.15 : 0.75,
            fillColor: cdef.color,
            fillOpacity: dimmed ? 0.04 : 0.15 + 0.4 * Math.min(1, v / 40),
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
  }, [data, base, circles, selectedDong, ready, layers, showCandidates, showBinRecos, showHotspots, showCritical, weather])

  // 동 경계 레이어. 전체 동은 상시 얇게, 선택 동은 굵게 + 동 전체가 화면에 들어오게 fit
  useEffect(() => {
    const draw = async () => {
      const map = mapRef.current
      if (!map || !data) return
      const L = await import("leaflet")
      if (mapRef.current !== map) return // 대기 중 탭 전환으로 지도가 제거됐으면 그리지 않는다(_leaflet_pos 오류 실측)
      dongLayerRef.current?.remove()
      const group = L.layerGroup()
      for (const [dong, rings] of Object.entries(data.dongOutlines)) {
        if (!rings.length) continue
        const on = dong === selectedDong
        // 실제 행정동 폴리곤 링. 선택 동은 은은한 채움까지
        L.polyline(rings as [number, number][][], {
          pane: "dumpDong",
          color: on ? "#c2410c" : "#64748b",
          weight: on ? 3.2 : 1,
          opacity: on ? 0.95 : 0.4,
          interactive: false,
        }).addTo(group)
        if (on) {
          L.polygon(rings as [number, number][][], {
            pane: "dumpDong",
            stroke: false,
            fillColor: "#c2410c",
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
        map.flyToBounds(L.latLngBounds(data.ring), { ...fitOpts(), duration: 0.5 })
      }
      prevDongRef.current = selectedDong
    }
    void draw()
  }, [data, selectedDong, ready])

  // 인프라 + 재배치 후보 + 배치추천 레이어
  useEffect(() => {
    const draw = async () => {
      const map = mapRef.current
      const renderer = infraRendererRef.current ?? undefined
      if (!map || !data) return
      const L = await import("leaflet")
      if (mapRef.current !== map) return // 대기 중 탭 전환으로 지도가 제거됐으면 그리지 않는다(_leaflet_pos 오류 실측)
      infraLayerRef.current?.remove()
      const group = L.layerGroup()

      for (const id of layers) {
        const { color } = INFRA_STYLE[id]
        // 완전히 같은 행을 두 번 그리지 않는다. 같은 좌표에 겹친 서로 다른 곳은 점 하나에 모아 툴팁으로 편다
        for (const spot of tallyInfra(data.infra[id]).spots) {
          L.circleMarker([spot.lat, spot.lng], {
            pane: "dumpInfra",
            renderer,
            radius: spot.at.length > 1 ? 6 : 5,
            color: "#ffffff",
            weight: 2,
            fillColor: color,
            fillOpacity: 1,
          })
            .bindTooltip(infraTooltip(id, spot), { sticky: true, direction: "top", opacity: 1 })
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

      if (showBinRecos) {
        // 점선 원 = 아직 없는 것(제안). 설치 현황(bins)의 채운 점과 한눈에 갈린다
        for (const [i, r] of (data.binRecos?.items ?? []).entries()) {
          L.circleMarker([r[0], r[1]], {
            pane: "dumpInfra",
            renderer,
            radius: 6,
            color: BIN_RECO_COLOR,
            weight: 2,
            dashArray: "3 3",
            fillColor: BIN_RECO_COLOR,
            fillOpacity: 0.25,
          })
            .bindTooltip(binRecoTooltip(i + 1, r), { sticky: true, direction: "top", opacity: 1 })
            .addTo(group)
        }
      }

      group.addTo(map)
      infraLayerRef.current = group
    }
    void draw()
  }, [data, layers, showCandidates, showBinRecos, ready])

  // 청소차 관리노선 레이어. road-links.json 동적 임포트(번들 제외), 도로명으로 필터
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

  // 예측 핫스팟 20 순위 배지 (운영·전망 탭). 재배치 후보와 구분되는 각진 배지
  useEffect(() => {
    const draw = async () => {
      const map = mapRef.current
      if (!map) return
      hotspotLayerRef.current?.remove()
      hotspotLayerRef.current = null
      if (!showHotspots || !data) return
      const L = await import("leaflet")
      if (mapRef.current !== map) return // 대기 중 탭 전환으로 지도가 제거됐으면 그리지 않는다(_leaflet_pos 오류 실측)
      const group = L.layerGroup()
      const HH = 56
      const maxScore = Math.max(1, ...data.decision.hotspots.top.map((h) => h[2]))
      data.decision.hotspots.top.forEach((h, i) => {
        // 기둥(높이=점수) 위에 순위. 구 전체 보기에서도 20개는 겹치지 않아 항상 기둥으로(12라운드 실측). 상위 3은 색으로 구분
        const sm = false
        const hh = Math.max(4, Math.round((h[2] / maxScore) * HH))
        L.marker([h[0], h[1]], {
          pane: "dumpInfra",
          icon: L.divIcon({
            className: "",
            html: sm
              ? `<div class="dump-hot dump-hot-sm${i < 3 ? " dump-hot-top" : ""}"></div>`
              : columnSvg(hh, HH, i < 3 ? CRIT_FACE : HOT_FACE, `${i + 1}위`),
            iconSize: sm ? [10, 10] : [COL_W, HH + 20],
            iconAnchor: sm ? [5, 5] : [COL_W / 2, HH + 16],
          }),
        })
          .bindTooltip(hotspotTooltip(i + 1, h), { sticky: true, direction: "top", opacity: 1 })
          .addTo(group)
      })
      group.addTo(map)
      hotspotLayerRef.current = group
    }
    void draw()
  }, [data, showHotspots, ready, zoomedOut])

  // 동별 민원·과태료 3D 막대. 행정동 외곽선 꼭짓점 평균을 기둥 자리로 쓴다. 15개 동은 줌 13 이상이면 서로 겹치지 않는다
  useEffect(() => {
    const draw = async () => {
      const map = mapRef.current
      if (!map) return
      dongBarsLayerRef.current?.remove()
      dongBarsLayerRef.current = null
      if (!showDongBars || !data) return
      const L = await import("leaflet")
      if (mapRef.current !== map) return // 대기 중 탭 전환으로 지도가 제거됐으면 그리지 않는다
      const group = L.layerGroup()
      // 12라운드: 모드별 값. 연도 모드는 그 해의 민원(접수)·과태료(위반), 채널 모드는 민원 막대를 앱·120·직접 스택으로
      const valOf = (d: (typeof data.dong)[number]) =>
        dongMode === "year" && dongYear
          ? { comp: d.yr?.complaints[dongYear] ?? 0, enf: d.yr?.enforcement[dongYear] ?? 0 }
          : { comp: d.comp, enf: d.enf }
      const max = Math.max(1, ...data.dong.flatMap((d) => [valOf(d).comp, valOf(d).enf]))
      const H = 72 // 최대 막대 높이(px)
      const n = data.dong.length
      const rank = (key: "comp" | "enf", v: number) => data.dong.filter((x) => valOf(x)[key] > v).length + 1
      // 민원과 과태료는 집계 시작이 다르다(민원 2024.1~, 과태료 2022.3~). 막대를 나란히 두니 툴팁에 밝힌다
      const compFrom = `${Object.keys(data.yearly.complaints)[0]}.1`
      const enfFrom = (Object.keys(data.decision.fines.monthly)[0] ?? "").replace(/-0?/, ".")
      // 툴팁: 글자 나열이 아니라 카드. 지표마다 색띠 블록(칩·순위·큰 숫자·천명당·구 최댓값 대비 막대). 스타일은 globals.css .dump-bartip
      const tip = (d: (typeof data.dong)[number]) => {
        const block = (label: string, color: string, v: number, per: number, r: number) =>
          `<div class="m" style="--c:${color}">` +
          `<div class="h"><i></i><b>${label}</b><em>${r}위<small>/${n}</small></em></div>` +
          `<div class="v">${v.toLocaleString()}<small>건</small><span class="k">천명당<b>${per.toFixed(1)}</b></span></div>` +
          `<div class="bar"><i style="width:${Math.round((v / max) * 100)}%"></i></div></div>`
        const v = valOf(d)
        const yearMode = dongMode === "year" && !!dongYear
        // 연도 모드의 천명당은 그 해 건수 ÷ 등록인구(천명). 누계 천명당(d.cr)에 비례 환산
        const perYear = (cnt: number, total: number, per: number) => (total ? (per * cnt) / total : 0)
        const chLine =
          dongMode === "channel" && d.ch
            ? `<div class="f">민원 채널 · 앱 ${d.ch.app.toLocaleString()} · 120 ${d.ch.c120.toLocaleString()} · 직접 ${d.ch.direct.toLocaleString()}</div>`
            : ""
        return (
          `<div class="dump-bartip"><div class="t">${d.d}<span>${yearMode ? `${dongYear}년` : `세대 ${d.hh.toLocaleString()}`}</span></div>` +
          block("민원", "#2f5aa8", v.comp, yearMode ? perYear(v.comp, d.comp, d.cr) : d.cr, rank("comp", v.comp)) +
          block("과태료", "#9a6a2a", v.enf, yearMode ? perYear(v.enf, d.enf, d.er) : d.er, rank("enf", v.enf)) +
          chLine +
          `<div class="f">막대: 구 최댓값 대비 · 순위: ${n}개 동 중<br>${yearMode ? `${dongYear}년 · 민원은 접수일, 과태료는 위반일 기준` : `누계 시작: 민원 ${compFrom} · 과태료 ${enfFrom}`}</div></div>`
        )
      }
      for (const d of data.dong) {
        const pts = (data.dongOutlines[d.d] ?? []).flat() // 외곽선은 링 배열. 꼭짓점을 한 줄로
        if (!pts.length) continue
        const lat = pts.reduce((s, p) => s + p[0], 0) / pts.length
        const lng = pts.reduce((s, p) => s + p[1], 0) / pts.length
        const v = valOf(d)
        const hc = Math.max(3, Math.round((v.comp / max) * H))
        const he = Math.max(3, Math.round((v.enf / max) * H))
        // 채널 스택: 세 토막 높이 합 = hc. 아래부터 직접·120·앱(앱이 가장 많아 위에 진하게)
        const segments =
          dongMode === "channel" && d.comp > 0 && d.ch
            ? (["direct", "c120", "app"] as const).map((c) => ({ h: Math.round((d.ch[c] / d.comp) * hc), face: CHANNEL_DEF[c] as Face }))
            : undefined
        const mk = L.marker([lat, lng], {
          pane: "dumpInfra",
          icon: L.divIcon({
            className: "",
            html: dongBarSvg(d.d, v.comp, v.enf, hc, he, H, segments),
            iconSize: [BAR_W, H + BAR_TOP + BAR_BOTTOM],
            iconAnchor: [BAR_W / 2, H + BAR_TOP],
          }),
        })
          .bindTooltip(tip(d), {
            // top 고정이면 북쪽 끝 동(중곡3·4동)에서 지도 밖으로 나간다. auto = 지도 중심 기준 좌/우로 뒤집힘. 막대 중간 높이 옆에
            direction: "auto",
            opacity: 1,
            offset: [BAR_W / 2 + 4, -(H + BAR_TOP) / 2],
            className: "dump-bartip-wrap",
          })
          .addTo(group)
        // 카드가 지도 위·아래로 삐져나가면(북쪽 끝 동은 헤더가 툴바 뒤로 숨는다) 열리는 순간 세로 오프셋을 지도 안으로 당긴다
        mk.on("tooltipopen", (ev) => {
          const tt = ev.tooltip
          const el = tt.getElement()
          const h = el?.offsetHeight ?? 180
          const pt = map.latLngToContainerPoint(mk.getLatLng())
          const size = map.getSize()
          let oy = -(H + BAR_TOP) / 2
          oy = Math.max(oy, h / 2 - pt.y + 8) // 위쪽 여유
          oy = Math.min(oy, size.y - pt.y - h / 2 - 8) // 아래쪽 여유
          tt.options.offset = L.point(BAR_W / 2 + 4, oy)
          tt.update()
        })
      }
      group.addTo(map)
      dongBarsLayerRef.current = group
    }
    void draw()
  }, [data, showDongBars, dongMode, dongYear, ready])

  // 격자 기둥(12라운드). 원 지표(민원·과태료, 없으면 과태료) 건수를 칸 가운데 기둥으로. 5건 이상 칸만(전부 세우면 지저분)
  useEffect(() => {
    const draw = async () => {
      const map = mapRef.current
      if (!map) return
      gridBarsLayerRef.current?.remove()
      gridBarsLayerRef.current = null
      if (!grid3d || !data) return
      const L = await import("leaflet")
      if (mapRef.current !== map) return // 대기 중 탭 전환으로 지도가 제거됐으면 그리지 않는다(_leaflet_pos 오류 실측)
      const group = L.layerGroup()
      const ids: CircleId[] = circles.length ? circles : ["enf"]
      const dense = map.getZoom() < 14.5 // 구 전체 보기(약 13.6)에선 237칸에 값 라벨까지 세우면 서로 겹쳐 읽히지 않는다
      const H = dense ? 40 : 48
      const minV = dense ? 10 : 5
      const maxV = Math.max(1, ...ids.flatMap((id) => data.grid.map((c) => c[CIRCLE_DEF[id].idx])))
      for (const cell of data.grid) {
        const vals = ids.map((id) => cell[CIRCLE_DEF[id].idx])
        if (Math.max(...vals) < minV) continue
        if (selectedDong && cell[7] !== selectedDong) continue
        const bars = ids.map((id, i) => ({ v: vals[i], h: Math.max(2, Math.round((vals[i] / maxV) * H)), face: id === "comp" ? GRID_COMP_FACE : GRID_ENF_FACE }))
        const w = 12 + bars.length * 16
        L.marker([(cell[0] + cell[2]) / 2, (cell[1] + cell[3]) / 2], {
          pane: "dumpInfra",
          icon: L.divIcon({ className: "", html: cellBarsSvg(bars, H, !dense), iconSize: [w, H + 18], iconAnchor: [w / 2, H + 14] }),
        })
          .bindTooltip(cellTooltip(cell), { sticky: true, direction: "top", opacity: 1 })
          .addTo(group)
      }
      group.addTo(map)
      gridBarsLayerRef.current = group
    }
    void draw()
  }, [data, grid3d, circles, selectedDong, ready, zoomedOut, zoomTick])

  // 집중관리 상습격자 (12개월 10건 이상). 격자 외곽선 강조
  useEffect(() => {
    const draw = async () => {
      const map = mapRef.current
      if (!map) return
      criticalLayerRef.current?.remove()
      criticalLayerRef.current = null
      if (!showCritical || !data) return
      const L = await import("leaflet")
      if (mapRef.current !== map) return // 대기 중 탭 전환으로 지도가 제거됐으면 그리지 않는다(_leaflet_pos 오류 실측)
      const renderer = infraRendererRef.current ?? undefined
      const group = L.layerGroup()
      const CH = 60
      const maxCrit = Math.max(1, ...data.decision.kpi.criticalCells.map((c) => c[4]))
      for (const c of data.decision.kpi.criticalCells) {
        L.rectangle(
          [
            [c[0], c[1]],
            [c[2], c[3]],
          ],
          {
            pane: "dumpInfra",
            renderer,
            color: "#a8322a",
            weight: 2.5,
            opacity: 0.95,
            fillColor: "#a8322a",
            fillOpacity: 0.18,
          },
        )
          .bindTooltip(
            `<b>집중관리 상습격자</b> · ${escapeHtml(c[5] || "광진구")}<br/>` +
              `최근 12개월 민원+과태료 ${c[4]}건`,
            { sticky: true, direction: "top", opacity: 1 },
          )
          .addTo(group)
        // 12라운드: 칸 가운데 기둥. 높이 = 12개월 건수(구 최댓값 대비). 성과지표라 정책 탭에서도 켠다
        const ch = Math.max(4, Math.round((c[4] / maxCrit) * CH))
        L.marker([(c[0] + c[2]) / 2, (c[1] + c[3]) / 2], {
          pane: "dumpInfra",
          icon: L.divIcon({
            className: "",
            html: columnSvg(ch, CH, CRIT_FACE, String(c[4])),
            iconSize: [COL_W, CH + 20],
            iconAnchor: [COL_W / 2, CH + 16],
          }),
          interactive: false,
        }).addTo(group)
      }
      group.addTo(map)
      criticalLayerRef.current = group
    }
    void draw()
  }, [data, showCritical, ready])

  // 목록 클릭 → 해당 지점으로 당겨가기 + 펄스 하이라이트로 위치를 확실히 표시
  useEffect(() => {
    const run = async () => {
      const map = mapRef.current
      if (!map) return
      focusLayerRef.current?.remove()
      focusLayerRef.current = null
      if (!focusCandidate) return
      const L = await import("leaflet")
      if (mapRef.current !== map) return // 대기 중 탭 전환으로 지도가 제거됐으면 그리지 않는다(_leaflet_pos 오류 실측)
      const group = L.layerGroup()
      const marker = L.marker(focusCandidate.latlng, {
        pane: "dumpInfra",
        interactive: false,
        icon: L.divIcon({
          className: "",
          html: `<div class="dump-focus"><i class="dump-focus-dot"></i><i class="dump-focus-ring"></i></div>`,
          iconSize: [64, 64],
          iconAnchor: [32, 32],
        }),
      })
      if (focusCandidate.label) {
        marker.bindTooltip(escapeHtml(focusCandidate.label), {
          permanent: true,
          direction: "top",
          offset: [0, -20],
          opacity: 1,
          className: "dump-focus-label",
        })
      }
      marker.addTo(group)
      group.addTo(map)
      focusLayerRef.current = group
      map.flyTo(focusCandidate.latlng, 16, { duration: 0.6 })
    }
    void run()
  }, [focusCandidate])

  // 헤더 배너 리셋 → 구 전체 뷰
  useEffect(() => {
    const map = mapRef.current
    if (!resetSeq || !map || !data) return
    const run = async () => {
      const L = await import("leaflet")
      if (mapRef.current !== map) return // 대기 중 탭 전환으로 지도가 제거됐으면 그리지 않는다(_leaflet_pos 오류 실측)
      map.flyToBounds(L.latLngBounds(data.ring), { padding: [12, 12], duration: 0.5 })
    }
    void run()
  }, [resetSeq])

  return <div ref={boxRef} className="dumping-map h-full w-full" />
}
