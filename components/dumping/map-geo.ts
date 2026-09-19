// /dumping 지도의 순수 계산부(16라운드, 2026-09-19 MapLibre 전환). 색·범례 정의, 툴팁 HTML, GeoJSON 조립, 동별 막대 SVG.
// 지도 엔진(maplibre)을 모르는 코드만 둔다. 상수는 map-controls·범례·테스트가 같이 쓴다
import type { BinReco, CctvCandidate, CircleId, DumpingMapData, GridCell, HotspotRow, InfraLayerId, WeatherKey, BaseMode } from "@/lib/dumping/types"
import { tallyInfra, type InfraSpot } from "@/lib/dumping/facts"
import { CHANNEL_DEF, WEATHER_DEF, type DongMode } from "@/lib/dumping/labels"

// 모드별 팔레트를 분리해 "지금 뭘 보고 있는지"가 색으로 구분되게 한다
// 원인(다가구·단독 밀집)=초록 · 민원=파랑 · 과태료=주황
export const PAL_GREEN = ["#dfe9e3", "#b9d6ca", "#8ec2ae", "#5ea78d", "#2f8267", "#0b4f45"] // 낮은 단계를 바탕(#e8ebe6)에서 띄움. 줌을 빼면 첫 단계 칸이 지도에 묻혔다(2026-09-18)
export const PAL_BLUE = ["#e9eef7", "#cfddf0", "#a6c3e3", "#78a3d2", "#4377b8", "#1c4f96"]
export const PAL_AMBER = ["#faeee6", "#f5d3c0", "#eeab8a", "#e27f52", "#d9480f", "#8f2f08"]
export const PAL_SLATE = ["#e6e9ee", "#c5ccd8", "#9faabd", "#75849e", "#4c5d7c", "#2f3e5e"] // 생활인구(노출). 결과·원인 색과 겹치지 않게. 낮은 단계는 바탕에서 띄움
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
export const BASE_DEF: Record<BaseMode, { idx: 4 | 5 | 6 | 8; stops: number[]; unit: string; pal: string[]; legend: string }> = {
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

// 격자 기둥·상습격자·핫스팟 기둥 색. 기둥은 원 지표를 세운 것이라 원과 같은 색(민원 빨강·과태료 보라)
export const COL_COLOR: Record<CircleId, string> = { comp: "#a8322a", enf: "#5b21b6" }
export const CRIT_COLOR = "#a8322a"
export const HOT_COLOR = "#b45309"
// 기둥 높이(m). 구 전체 보기(줌 13.4·기울기 55도)에서 가장 높은 기둥이 화면 1/4쯤. 값이 0에 가까워도 바닥에서 보이게 최소 높이
export const COL_MAX_M = 280
export const COL_MIN_M = 18
export const COL_MIN_COUNT = 5 // 이 건수 미만 칸은 기둥을 세우지 않는다(전부 세우면 지저분)

export function colorOf(v: number, stops: number[], pal: string[]): string {
  for (let i = stops.length - 1; i >= 0; i--) {
    if (v > stops[i]) return pal[Math.min(i + 1, 5)]
  }
  return pal[0]
}

// maplibre step 표현식용. colorOf와 같은 경계(v > stop → 다음 단계)
export function stepExpr(prop: string, stops: number[], pal: string[]): unknown[] {
  const out: unknown[] = ["step", ["get", prop], pal[0]]
  for (let i = 0; i < stops.length; i++) out.push(stops[i] + 1, pal[Math.min(i + 1, 5)])
  return out
}

export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
}

export function cellTooltip(cell: GridCell): string {
  const dong = escapeHtml(cell[7] || "광진구")
  // 서울시 생활인구(2026-07 한 달, 24시간·31일 평균). 250m 격자를 100m 칸에 면적 비례로 나눈 값. 설명은 지도 도움말·방법 모달에
  const lp = cell[8] ? `<br/>생활인구 ${cell[8].toLocaleString()}명` : ""
  return `<b>${dong}</b><br/>민원 ${cell[4]}건 · 과태료 ${cell[5]}건<br/>다가구·단독 ${cell[6]}세대${lp}`
}

export function candidateTooltip(rank: number, c: CctvCandidate): string {
  return (
    `<b>재배치 후보 ${rank}위</b> · ${escapeHtml(c[4])}<br/>` +
    `<b>${escapeHtml(c[5] || "대표 주소 없음 (격자 중심)")}</b> 인근<br/>` +
    `민원 ${c[2]}건 · 과태료 ${c[3]}건(전 기간)<br/>` +
    `<span style="color:#a8322a">발생이력 기준 자원배분 논리. 통계 효과 근거 아님</span>`
  )
}

// 한 좌표에 여러 설치장소가 겹칠 때 전부 보여준다. 점 하나가 곧 한 곳이라는 오해를 여기서 끊는다
export function infraTooltip(id: InfraLayerId, spot: InfraSpot): string {
  const { label } = INFRA_STYLE[id]
  const head = spot.at.length > 1 ? `<b>${label}</b> · 이 지점에 ${spot.at.length}곳` : `<b>${label}</b>`
  const body = spot.at
    .map((p) => `${escapeHtml(p[2])}${p[3] ? ` <span style="color:#64748b">${escapeHtml(p[3])}</span>` : ""}`)
    .join("<br/>")
  return `${head}<br/>${body}`
}

export function binRecoTooltip(seq: number, r: BinReco): string {
  return (
    `<b>${BIN_RECO_LABEL} ${seq}번</b> · ${escapeHtml(r[2])}<br/>` +
    `<b>${escapeHtml(r[3] || r[4])}</b><br/>` +
    (r[3] && r[4] ? `${escapeHtml(r[4])}<br/>` : "") +
    `<span style="color:#be185d">데이터팀 격자분석 제안. 번호는 자료 순서이지 우선순위가 아니고, 설치 지점은 현장 확인이 필요합니다</span>`
  )
}

export function hotspotTooltip(rank: number, h: HotspotRow): string {
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

// ─── GeoJSON 조립 ───
export type Feature = GeoJSON.Feature<GeoJSON.Geometry, Record<string, unknown>>
export type FC = GeoJSON.FeatureCollection<GeoJSON.Geometry, Record<string, unknown>>
export const emptyFC = (): FC => ({ type: "FeatureCollection", features: [] })
export const fc = (features: Feature[]): FC => ({ type: "FeatureCollection", features })

// [lat, lng] → [lng, lat]
export const ll = (p: [number, number]): [number, number] => [p[1], p[0]]
export const cellCenter = (c: GridCell): [number, number] => [(c[1] + c[3]) / 2, (c[0] + c[2]) / 2]

// 칸 [s, w, n, e]를 사각형으로. inset은 가로·세로 비율(0.2면 양쪽 20%씩 들여 60% 폭)
export function cellPolygon(s: number, w: number, n: number, e: number, insetX = 0, insetY = insetX): GeoJSON.Polygon {
  const dx = (e - w) * insetX
  const dy = (n - s) * insetY
  return {
    type: "Polygon",
    coordinates: [
      [
        [w + dx, s + dy],
        [e - dx, s + dy],
        [e - dx, n - dy],
        [w + dx, n - dy],
        [w + dx, s + dy],
      ],
    ],
  }
}

// 중심점 둘레 한 변 side(m)인 정사각형. 핫스팟 행은 좌표만 있어 칸 크기(100m)를 여기서 다시 만든다
export function squareAround(lat: number, lng: number, side: number): GeoJSON.Polygon {
  const dLat = side / 2 / 111320
  const dLng = side / 2 / (111320 * Math.cos((lat * Math.PI) / 180))
  return cellPolygon(lat - dLat, lng - dLng, lat + dLat, lng + dLng)
}

// 값 → 기둥 높이(m). 최댓값 대비 비례, 바닥에서 보이는 최소 높이 보장
export const colHeight = (v: number, max: number): number => COL_MIN_M + (Math.max(0, v) / Math.max(1, max)) * (COL_MAX_M - COL_MIN_M)

// 격자 폴리곤 전체. 바탕·툴팁·0칸 판정에 쓰는 속성만 담는다
export function gridFC(data: DumpingMapData): FC {
  return fc(
    data.grid.map((c, i) => ({
      type: "Feature",
      id: i,
      properties: { i, comp: c[4], enf: c[5], unm: c[6], lp: c[8], dong: c[7] || "", tip: cellTooltip(c) },
      geometry: cellPolygon(c[0], c[1], c[2], c[3]),
    })),
  )
}

// 원 오버레이(민원·과태료). 반경은 미터(원은 제 칸 안, 상한 48m). 26건 이상은 크기 대신 진하기(14라운드)
export function circlesFC(data: DumpingMapData, circles: CircleId[]): FC {
  const feats: Feature[] = []
  for (const cid of circles) {
    const cdef = CIRCLE_DEF[cid]
    for (const c of data.grid) {
      const v = c[cdef.idx]
      if (v <= 0) continue
      feats.push({
        type: "Feature",
        properties: {
          dong: c[7] || "",
          r: Math.min(48, 8 + Math.pow(v, 0.6) * 6),
          color: cdef.color,
          fill: 0.15 + 0.4 * Math.min(1, v / 40),
          tip: cellTooltip(c),
        },
        geometry: { type: "Point", coordinates: cellCenter(c) },
      })
    }
  }
  // 큰 원이 작은 원을 덮지 않게 큰 것부터 그린다
  feats.sort((a, b) => (b.properties.r as number) - (a.properties.r as number))
  return fc(feats)
}

// 날씨별 원(12라운드): 그 조건에 접수된 민원을 하루당으로 환산. 절대치가 작아 조건 안 최댓값 대비 상대 크기
export function weatherFC(data: DumpingMapData, weather: WeatherKey): FC {
  if (!data.env.cellWeather || !data.env.weatherDays) return emptyFC()
  const k = { hot: 0, mild: 1, cold: 2, rain: 3 }[weather]
  const days = Math.max(1, data.env.weatherDays[weather])
  const wdef = WEATHER_DEF[weather]
  const maxCnt = Math.max(1, ...data.env.cellWeather.map((v) => v[k]))
  const feats: Feature[] = []
  data.grid.forEach((c, i) => {
    const cnt = data.env.cellWeather[i]?.[k] ?? 0
    if (!cnt) return
    const per100 = (cnt / days) * 100
    feats.push({
      type: "Feature",
      properties: {
        dong: c[7] || "",
        r: 6 + Math.sqrt(cnt / maxCnt) * 64,
        color: wdef.color,
        tip: `${cellTooltip(c)}<br/><span style="color:${wdef.color}">${wdef.label} 민원 ${cnt}건 · 하루당 ${(cnt / days).toFixed(2)}건(100일 환산 ${per100.toFixed(1)})</span>`,
      },
      geometry: { type: "Point", coordinates: cellCenter(c) },
    })
  })
  return fc(feats)
}

// 격자 기둥: 칸마다 원 지표 1~2개(민원·과태료). 지표가 둘이면 칸을 좌우로 갈라 나란히 세운다
export function gridColumnsFC(data: DumpingMapData, ids: CircleId[], selectedDong: string | null): FC {
  const maxV = Math.max(1, ...ids.flatMap((id) => data.grid.map((c) => c[CIRCLE_DEF[id].idx])))
  const feats: Feature[] = []
  for (const c of data.grid) {
    if (selectedDong && c[7] !== selectedDong) continue
    const vals = ids.map((id) => c[CIRCLE_DEF[id].idx])
    if (Math.max(...vals) < COL_MIN_COUNT) continue
    ids.forEach((id, i) => {
      const v = vals[i]
      const geometry =
        ids.length === 1
          ? cellPolygon(c[0], c[1], c[2], c[3], 0.2)
          : (() => {
              // 왼쪽 12~46% · 오른쪽 54~88%
              const w = c[1] + (c[3] - c[1]) * (i === 0 ? 0.12 : 0.54)
              const e = c[1] + (c[3] - c[1]) * (i === 0 ? 0.46 : 0.88)
              return cellPolygon(c[0], w, c[2], e, 0, 0.2)
            })()
      feats.push({
        type: "Feature",
        properties: { v, h: colHeight(v, maxV), color: COL_COLOR[id], metric: CIRCLE_DEF[id].label, tip: cellTooltip(c) },
        geometry,
      })
    })
  }
  return fc(feats)
}

// 집중관리 상습격자(12개월 10건 이상). 칸 외곽선 + 기둥(높이=12개월 건수)
export function criticalFC(data: DumpingMapData): { cells: FC; cols: FC; labels: FC } {
  const rows = data.decision.kpi.criticalCells
  const maxCrit = Math.max(1, ...rows.map((c) => c[4]))
  const cells: Feature[] = []
  const cols: Feature[] = []
  const labels: Feature[] = []
  for (const c of rows) {
    const tip = `<b>집중관리 상습격자</b> · ${escapeHtml(c[5] || "광진구")}<br/>최근 12개월 민원+과태료 ${c[4]}건`
    cells.push({ type: "Feature", properties: { tip }, geometry: cellPolygon(c[0], c[1], c[2], c[3]) })
    cols.push({ type: "Feature", properties: { h: colHeight(c[4], maxCrit), tip }, geometry: cellPolygon(c[0], c[1], c[2], c[3], 0.22) })
    labels.push({ type: "Feature", properties: { label: String(c[4]) }, geometry: { type: "Point", coordinates: [(c[1] + c[3]) / 2, (c[0] + c[2]) / 2] } })
  }
  return { cells: fc(cells), cols: fc(cols), labels: fc(labels) }
}

// 예측 핫스팟 20(운영·전망 탭). 기둥(높이=점수) + 순위 꼬리표. 상위 3은 색으로 구분
export function hotspotsFC(data: DumpingMapData): { cols: FC; labels: FC } {
  const rows = data.decision.hotspots.top
  const maxScore = Math.max(1, ...rows.map((h) => h[2]))
  const cols: Feature[] = []
  const labels: Feature[] = []
  rows.forEach((h, i) => {
    const tip = hotspotTooltip(i + 1, h)
    cols.push({
      type: "Feature",
      properties: { h: colHeight(h[2], maxScore), color: i < 3 ? CRIT_COLOR : HOT_COLOR, tip },
      geometry: squareAround(h[0], h[1], 72),
    })
    labels.push({ type: "Feature", properties: { label: `${i + 1}위`, top: i < 3 ? 1 : 0, tip }, geometry: { type: "Point", coordinates: [h[1], h[0]] } })
  })
  return { cols: fc(cols), labels: fc(labels) }
}

// 시설 점. 완전히 같은 행을 두 번 그리지 않는다. 같은 좌표에 겹친 서로 다른 곳은 점 하나에 모아 툴팁으로 편다
export function infraFC(data: DumpingMapData, layers: InfraLayerId[]): FC {
  const feats: Feature[] = []
  for (const id of layers) {
    const { color } = INFRA_STYLE[id]
    for (const spot of tallyInfra(data.infra[id]).spots) {
      feats.push({
        type: "Feature",
        properties: { color, r: spot.at.length > 1 ? 6 : 5, tip: infraTooltip(id, spot) },
        geometry: { type: "Point", coordinates: [spot.lng, spot.lat] },
      })
    }
  }
  return fc(feats)
}

export function candidatesFC(data: DumpingMapData): FC {
  return fc(
    data.cctvCandidates.map((c, i) => ({
      type: "Feature",
      properties: { label: String(i + 1), tip: candidateTooltip(i + 1, c) },
      geometry: { type: "Point", coordinates: [c[1], c[0]] },
    })),
  )
}

export function binRecosFC(data: DumpingMapData): FC {
  return fc(
    (data.binRecos?.items ?? []).map((r, i) => ({
      type: "Feature",
      properties: { tip: binRecoTooltip(i + 1, r) },
      geometry: { type: "Point", coordinates: [r[1], r[0]] },
    })),
  )
}

// 행정동 외곽선(선)과 라벨 자리(꼭짓점 평균). 동별 막대도 같은 자리를 쓴다
export function dongCenter(rings: [number, number][][]): [number, number] | null {
  const pts = rings.flat()
  if (!pts.length) return null
  const lat = pts.reduce((s, p) => s + p[0], 0) / pts.length
  const lng = pts.reduce((s, p) => s + p[1], 0) / pts.length
  return [lng, lat]
}

export function dongFC(data: DumpingMapData): { lines: FC; fills: FC; labels: FC } {
  const lines: Feature[] = []
  const fills: Feature[] = []
  const labels: Feature[] = []
  for (const [name, rings] of Object.entries(data.dongOutlines)) {
    if (!rings.length) continue
    for (const r of rings) lines.push({ type: "Feature", properties: { name }, geometry: { type: "LineString", coordinates: r.map(ll) } })
    fills.push({ type: "Feature", properties: { name }, geometry: { type: "MultiPolygon", coordinates: rings.map((r) => [r.map(ll)]) } })
    const c = dongCenter(rings)
    if (c) labels.push({ type: "Feature", properties: { name }, geometry: { type: "Point", coordinates: c } })
  }
  return { lines: fc(lines), fills: fc(fills), labels: fc(labels) }
}

// 구 경계 링과 바깥 딤 마스크(세계 사각형에서 구를 뚫은 폴리곤)
export function ringFC(ring: [number, number][]): { line: FC; mask: FC; bounds: [[number, number], [number, number]] } {
  const coords = ring.map(ll)
  const closed = coords[0][0] === coords[coords.length - 1][0] && coords[0][1] === coords[coords.length - 1][1] ? coords : [...coords, coords[0]]
  const world: [number, number][] = [
    [-180, -85],
    [180, -85],
    [180, 85],
    [-180, 85],
    [-180, -85],
  ]
  const lngs = coords.map((p) => p[0])
  const lats = coords.map((p) => p[1])
  return {
    line: fc([{ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: closed } }]),
    mask: fc([{ type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [world, closed] } }]),
    bounds: [
      [Math.min(...lngs), Math.min(...lats)],
      [Math.max(...lngs), Math.max(...lats)],
    ],
  }
}

// 「2026년 도로청소 종합계획」 관리도로. 도로명 기준(광진 구간 전체를 그림, 문서상 세부 구간과 근사)
const ROUTE_FOCUS = new Set(["천호대로", "아차산로"])
const ROUTE_GENERAL = new Set([
  "능동로", "자양로", "동일로", "뚝섬로", "구의로", "용마산로", "광나루로", "긴고랑로",
  "영화사로", "구의강변로", "워커힐로", "아차산로70길", "광나루로56길", "아차산로58길",
])
export function routesFC(links: { n?: string; p: number[][] }[]): FC {
  const feats: Feature[] = []
  for (const link of links) {
    const name = link.n ?? ""
    const focus = ROUTE_FOCUS.has(name)
    if (!focus && !ROUTE_GENERAL.has(name)) continue
    feats.push({
      type: "Feature",
      properties: {
        focus: focus ? 1 : 0,
        tip:
          `<b>${focus ? "집중관리도로" : "일반관리도로"}</b> · ${escapeHtml(name)}<br/>` +
          (focus ? "겨울 4회/일 · 평상시 1회/일" : "평상시 1회/2일 이상") +
          `<br/><span style="color:#64748b">도로명 기준 표시(광진 구간 전체)</span>`,
      },
      geometry: { type: "LineString", coordinates: link.p.map((p) => [p[1], p[0]]) },
    })
  }
  return fc(feats)
}

// 미터 반경을 줌별 픽셀로. 지수(밑 2) 보간이면 두 줌 사이가 정확히 미터 비례가 된다(웹 메르카토르)
const LAT0 = 37.546
const metersPerPixel = (z: number) => (156543.03392 * Math.cos((LAT0 * Math.PI) / 180)) / Math.pow(2, z)
export function radiusMetersExpr(prop = "r"): unknown[] {
  return ["interpolate", ["exponential", 2], ["zoom"], 10, ["/", ["get", prop], metersPerPixel(10)], 22, ["/", ["get", prop], metersPerPixel(22)]]
}

// ─── 동별 3D 막대 SVG. 등축 막대 2개(민원 파랑·과태료 갈색), 앞면·옆면·윗면 세 조각. 값은 위, 동 이름은 아래.
// 자라나는 애니메이션은 globals.css .dump-bar3d .bar ───
export const BAR_W = 76
export const BAR_TOP = 18 // 값 글자 자리
export const BAR_BOTTOM = 26 // 동 이름 자리
export const BAR_H = 72 // 최대 막대 높이(px)
export type Face = { front: string; side: string; top: string }
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
export const COMP_FACE: Face = { front: "#2f5aa8", side: "#1d3f78", top: "#6b93d6" }
export const ENF_FACE: Face = { front: "#9a6a2a", side: "#6e4a1b", top: "#c99a55" }

// 동별 막대. segments가 있으면 민원 막대를 채널 스택(아래부터 순서대로)으로
export function dongBarSvg(name: string, comp: number, enf: number, hc: number, he: number, H: number, segments?: { h: number; face: Face }[]): string {
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

// 동별 막대 한 벌(15개 동). 마커 자리·SVG·툴팁 카드까지 여기서 만든다
export interface DongBar {
  name: string
  lnglat: [number, number]
  svg: string
  tip: string
}
export function dongBars(data: DumpingMapData, dongMode: DongMode, dongYear: string | null): DongBar[] {
  // 12라운드: 모드별 값. 연도 모드는 그 해의 민원(접수)·과태료(위반), 채널 모드는 민원 막대를 앱·120·직접 스택으로
  const valOf = (d: (typeof data.dong)[number]) =>
    dongMode === "year" && dongYear
      ? { comp: d.yr?.complaints[dongYear] ?? 0, enf: d.yr?.enforcement[dongYear] ?? 0 }
      : { comp: d.comp, enf: d.enf }
  const max = Math.max(1, ...data.dong.flatMap((d) => [valOf(d).comp, valOf(d).enf]))
  const H = BAR_H
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
  const out: DongBar[] = []
  for (const d of data.dong) {
    const c = dongCenter(data.dongOutlines[d.d] ?? [])
    if (!c) continue
    const v = valOf(d)
    const hc = Math.max(3, Math.round((v.comp / max) * H))
    const he = Math.max(3, Math.round((v.enf / max) * H))
    // 채널 스택: 세 토막 높이 합 = hc. 아래부터 직접·120·앱(앱이 가장 많아 위에 진하게)
    const segments =
      dongMode === "channel" && d.comp > 0 && d.ch
        ? (["direct", "c120", "app"] as const).map((ch) => ({ h: Math.round((d.ch[ch] / d.comp) * hc), face: CHANNEL_DEF[ch] as Face }))
        : undefined
    out.push({ name: d.d, lnglat: c, svg: dongBarSvg(d.d, v.comp, v.enf, hc, he, H, segments), tip: tip(d) })
  }
  return out
}
