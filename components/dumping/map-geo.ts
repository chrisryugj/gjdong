// /dumping 지도의 순수 계산부(16라운드, 2026-09-19 MapLibre 전환). 색·범례 정의, 툴팁 HTML, GeoJSON 조립, 동별 막대 SVG.
// 지도 엔진(maplibre)을 모르는 코드만 둔다. 상수는 map-controls·범례·테스트가 같이 쓴다
import type { BinReco, CctvCandidate, CircleId, DumpingMapData, GridCell, HotspotRow, InfraLayerId, WeatherKey, BaseMode } from "@/lib/dumping/types"
import { tallyInfra, type InfraSpot } from "@/lib/dumping/facts"
import { CHANNEL_DEF, WEATHER_DEF, type DongMode } from "@/lib/dumping/labels"
import dongCenters from "@/lib/dumping/dong-centers.json"

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
// 재배치 후보(제안 위치)는 잉크색. 빨강은 과태료 램프·핫스팟 기둥과 겹쳐 "제안 위치와 과태료가 구분 안 됐다"(18라운드 실측). 라벨은 종이색
export const CAND_COLOR = { light: "#1c1a15", dark: "#ece7dc" } as const
export const CAND_LABEL_COLOR = { light: "#fbf9f3", dark: "#14181b" } as const

// 두 hex 색을 섞는다(t=0이면 a). 점 레이어가 켜졌을 때 건물 히트맵을 중립색 쪽으로 눌러 말뚝이 앞에 서게
export function mixHex(a: string, b: string, t: number): string {
  const pa = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16))
  const pb = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16))
  return `#${pa.map((v, i) => Math.round(v + (pb[i] - v) * t).toString(16).padStart(2, "0")).join("")}`
}
export const BIN_RECO_LABEL = "가로쓰레기통 배치추천(데이터팀)"

// 바탕(면)은 하나만. 두 히트맵을 겹치면 색이 섞여 판독 불가라 중첩 금지
export type DataBase = Exclude<BaseMode, "none">
export const BASE_DEF: Record<DataBase, { idx: 4 | 5 | 6 | 8; stops: number[]; unit: string; pal: string[]; legend: string }> = {
  unm: { idx: 6, stops: UNM_STOPS, unit: "세대", pal: PAL_GREEN, legend: "다가구·단독" },
  comp: { idx: 4, stops: CNT_STOPS, unit: "건", pal: PAL_BLUE, legend: "민원" },
  enf: { idx: 5, stops: CNT_STOPS, unit: "건", pal: PAL_AMBER, legend: "과태료" },
  lp: { idx: 8, stops: LP_STOPS, unit: "명", pal: PAL_SLATE, legend: "생활인구" },
}

// 원(점) 오버레이는 바탕 위에 자유 중첩
// 18라운드 후속: 지도 색을 테마 계열로 통일. 민원 = 잉크 청회(차가움), 과태료 = 앰버(따뜻함, 결과지표라 액센트), 상습·핫스팟 = 벽돌.
// 옛 빨강·보라는 종이·앰버 테마 위에서 튀었다(유저 지적)
export const COMP_COLOR = "#3f4f66"
export const ENF_COLOR = "#c0741a"
export const CIRCLE_DEF: Record<CircleId, { idx: 4 | 5; color: string; label: string }> = {
  comp: { idx: 4, color: COMP_COLOR, label: "민원" },
  enf: { idx: 5, color: ENF_COLOR, label: "과태료" },
}

// 격자 기둥·상습격자·핫스팟 기둥 색. 기둥은 원 지표를 세운 것이라 원과 같은 색
export const COL_COLOR: Record<CircleId, string> = { comp: COMP_COLOR, enf: ENF_COLOR }
export const CRIT_COLOR = "#a8322a"
export const HOT_COLOR = "#b8756a" // 핫스팟 4~20위(벽돌 옅게). 상위 3은 CRIT_COLOR
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
export function stepExpr(prop: string, stops: number[], pal: string[], input: unknown[] = ["get", prop]): unknown[] {
  const out: unknown[] = ["step", input, pal[0]]
  for (let i = 0; i < stops.length; i++) out.push(stops[i] + 1, pal[Math.min(i + 1, 5)])
  return out
}

export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
}

// ─── 카드형 툴팁(18라운드). 글자 나열 대신 머리(꼬리표·제목·배지) + 지표 타일(색 칩·큰 숫자·단위·구 최댓값 대비 막대) + 각주. 스타일은 globals.css .dump-tip ───
export interface TipMetric {
  label: string
  value: number | string
  unit?: string
  color?: string
  ratio?: number // 0~1, 막대 길이(구 최댓값 대비). 없으면 막대 없음
  sub?: string // 숫자 옆 작은 보조(예: "하루당 0.12")
}
export interface TipCard {
  kicker?: string
  title: string
  badges?: { label: string; color: string }[]
  metrics?: TipMetric[]
  lines?: string[] // 본문 줄(시설 이름 등). 이미 escape된 HTML
  note?: string
  noteColor?: string
}
export function tipCard(c: TipCard): string {
  const badges = (c.badges ?? []).map((b) => `<span class="b" style="--c:${b.color}">${escapeHtml(b.label)}</span>`).join("")
  const metrics = (c.metrics ?? [])
    .map((m) => {
      const v = typeof m.value === "number" ? m.value.toLocaleString() : escapeHtml(m.value)
      const bar = m.ratio != null ? `<em><i style="width:${Math.round(Math.max(0, Math.min(1, m.ratio)) * 100)}%"></i></em>` : ""
      const sub = m.sub ? `<span class="s">${escapeHtml(m.sub)}</span>` : ""
      return `<div class="m" style="--c:${m.color ?? "#64748b"}"><span class="l">${m.color ? "<i></i>" : ""}${escapeHtml(m.label)}</span><b>${v}${m.unit ? `<small>${escapeHtml(m.unit)}</small>` : ""}</b>${sub}${bar}</div>`
    })
    .join("")
  const lines = (c.lines ?? []).map((l) => `<div class="p">${l}</div>`).join("")
  return (
    `<div class="dump-tip">` +
    (c.kicker ? `<div class="k">${escapeHtml(c.kicker)}</div>` : "") +
    `<div class="t">${escapeHtml(c.title)}${badges}</div>` +
    (metrics ? `<div class="g">${metrics}</div>` : "") +
    lines +
    (c.note ? `<div class="f"${c.noteColor ? ` style="color:${c.noteColor}"` : ""}>${escapeHtml(c.note)}</div>` : "") +
    `</div>`
  )
}

// 격자 지표 최댓값(막대 기준). 데이터 객체마다 한 번만
const maxCache = new WeakMap<DumpingMapData, { comp: number; enf: number; unm: number; lp: number }>()
export function gridMaxes(data: DumpingMapData): { comp: number; enf: number; unm: number; lp: number } {
  let m = maxCache.get(data)
  if (!m) {
    m = { comp: 1, enf: 1, unm: 1, lp: 1 }
    for (const c of data.grid) {
      m.comp = Math.max(m.comp, c[4])
      m.enf = Math.max(m.enf, c[5])
      m.unm = Math.max(m.unm, c[6])
      m.lp = Math.max(m.lp, c[8] ?? 0)
    }
    maxCache.set(data, m)
  }
  return m
}
const CELL_COLORS = { comp: COMP_COLOR, enf: ENF_COLOR, unm: "#2f8267", lp: "#4c5d7c" } as const

export function cellMetrics(cell: GridCell, max: ReturnType<typeof gridMaxes>): TipMetric[] {
  const out: TipMetric[] = [
    { label: "민원", value: cell[4], unit: "건", color: CELL_COLORS.comp, ratio: cell[4] / max.comp },
    { label: "과태료", value: cell[5], unit: "건", color: CELL_COLORS.enf, ratio: cell[5] / max.enf },
    { label: "다가구·단독", value: cell[6], unit: "세대", color: CELL_COLORS.unm, ratio: cell[6] / max.unm },
  ]
  // 서울시 생활인구(2026-07 한 달, 24시간·31일 평균). 250m 격자를 100m 칸에 면적 비례로 나눈 값. 설명은 지도 도움말·방법 모달에
  if (cell[8]) out.push({ label: "생활인구", value: Math.round(cell[8]), unit: "명", color: CELL_COLORS.lp, ratio: cell[8] / max.lp })
  return out
}
export function cellTooltip(cell: GridCell, max: ReturnType<typeof gridMaxes>, extra?: TipMetric[], note?: string): string {
  return tipCard({ kicker: "100m 칸 · 막대는 구 최댓값 대비", title: cell[7] || "광진구", metrics: [...cellMetrics(cell, max), ...(extra ?? [])], note })
}

export function candidateTooltip(rank: number, c: CctvCandidate): string {
  return tipCard({
    kicker: `이동식 CCTV 재배치 후보 ${rank}위 · ${c[4]}`,
    title: `${c[5] || "대표 주소 없음(격자 중심)"} 인근`,
    metrics: [
      { label: "민원", value: c[2], unit: "건", color: CELL_COLORS.comp },
      { label: "과태료", value: c[3], unit: "건", color: CELL_COLORS.enf },
    ],
    note: "전 기간 · 발생이력 기준 자원배분 논리. 통계 효과 근거 아님",
    noteColor: "#a8322a",
  })
}

// 한 좌표에 여러 설치장소가 겹칠 때 전부 보여준다. 점 하나가 곧 한 곳이라는 오해를 여기서 끊는다
export function infraTooltip(id: InfraLayerId, spot: InfraSpot): string {
  const { label, color } = INFRA_STYLE[id]
  return tipCard({
    kicker: spot.at.length > 1 ? `${label} · 이 지점에 ${spot.at.length}곳` : label,
    title: spot.at[0] ? spot.at[0][2] : label,
    badges: [{ label: `${spot.at.length}곳`, color }],
    lines: spot.at.slice(spot.at.length > 1 ? 0 : 1).map((p) => `${escapeHtml(p[2])}${p[3] ? ` <span class="d">${escapeHtml(p[3])}</span>` : ""}`).concat(spot.at.length === 1 && spot.at[0][3] ? [`<span class="d">${escapeHtml(spot.at[0][3])}</span>`] : []),
  })
}

export function binRecoTooltip(seq: number, r: BinReco): string {
  return tipCard({
    kicker: `${BIN_RECO_LABEL} ${seq}번 · ${r[2]}`,
    title: r[3] || r[4],
    lines: r[3] && r[4] ? [escapeHtml(r[4])] : [],
    note: "데이터팀 격자분석 제안. 번호는 자료 순서이지 우선순위가 아니고, 설치 지점은 현장 확인이 필요합니다",
    noteColor: BIN_RECO_COLOR,
  })
}

export function hotspotTooltip(rank: number, h: HotspotRow): string {
  const badges: { label: string; color: string }[] = []
  if (h[12] === 1) badges.push({ label: "집중관리", color: "#a8322a" })
  if (h[7] === 0) badges.push({ label: "CCTV 없음", color: "#b45309" })
  return tipCard({
    kicker: `예측 핫스팟 ${rank}위 · ${h[5] || "광진구"}`,
    title: `${h[6] || "대표 주소 없음(격자 중심)"} 인근`,
    badges,
    metrics: [
      { label: "최근 180일 민원", value: h[3], unit: "건", color: CELL_COLORS.comp },
      { label: "최근 180일 과태료", value: h[4], unit: "건", color: CELL_COLORS.enf },
      { label: "최근 90일", value: h[9], unit: "건", sub: `이전 90일 ${h[10]}건` },
      { label: "12개월", value: h[8], unit: "건", sub: h[11] >= 0 ? `마지막 기록 ${h[11]}일 전` : undefined },
    ],
    note: "순위는 최근 기록일수록 크게(90일마다 절반) 더한 점수",
  })
}

export function criticalTooltip(c: DumpingMapData["decision"]["kpi"]["criticalCells"][number], max: number): string {
  return tipCard({
    kicker: `집중관리 상습격자 · ${c[5] || "광진구"}`,
    title: "최근 12개월 10건 이상 칸",
    metrics: [{ label: "12개월 민원+과태료", value: c[4], unit: "건", color: CRIT_COLOR, ratio: c[4] / Math.max(1, max) }],
  })
}

export function routeTooltip(name: string, focus: boolean): string {
  return tipCard({
    kicker: focus ? "집중관리도로" : "일반관리도로",
    title: name,
    lines: [focus ? "겨울 4회/일 · 평상시 1회/일" : "평상시 1회/2일 이상"],
    note: "도로명 기준 표시(광진 구간 전체) · 2026 도로청소 종합계획",
  })
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
  const max = gridMaxes(data)
  return fc(
    data.grid.map((c, i) => ({
      type: "Feature",
      id: i,
      properties: { i, comp: c[4], enf: c[5], unm: c[6], lp: c[8], dong: c[7] || "", tip: cellTooltip(c, max) },
      geometry: cellPolygon(c[0], c[1], c[2], c[3]),
    })),
  )
}

// 원 오버레이(민원·과태료). 반경은 미터(원은 제 칸 안, 상한 48m). 26건 이상은 크기 대신 진하기(14라운드)
export function circlesFC(data: DumpingMapData, circles: CircleId[]): FC {
  const feats: Feature[] = []
  const max = gridMaxes(data)
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
          tip: cellTooltip(c, max),
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
  const max = gridMaxes(data)
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
        tip: cellTooltip(c, max, [{ label: `${wdef.label} 민원`, value: cnt, unit: "건", color: wdef.color, ratio: cnt / maxCnt, sub: `하루당 ${(cnt / days).toFixed(2)} · 100일 환산 ${per100.toFixed(1)}` }], "접수일 기준이라 투기 시각은 아님"),
      },
      geometry: { type: "Point", coordinates: cellCenter(c) },
    })
  })
  return fc(feats)
}

// 격자 기둥: 칸마다 원 지표 1~2개(민원·과태료). 지표가 둘이면 칸을 좌우로 갈라 나란히 세운다
export function gridColumnsFC(data: DumpingMapData, ids: CircleId[], selectedDong: string | null): FC {
  const maxV = Math.max(1, ...ids.flatMap((id) => data.grid.map((c) => c[CIRCLE_DEF[id].idx])))
  const max = gridMaxes(data)
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
        properties: { v, h: colHeight(v, maxV), color: COL_COLOR[id], metric: CIRCLE_DEF[id].label, tip: cellTooltip(c, max) },
        geometry,
      })
    })
  }
  return fc(feats)
}

// 집중관리 상습격자(12개월 10건 이상). 칸 외곽선 + 기둥(높이=12개월 건수)
// 건수(12개월)는 입체에서 기둥 꼭대기 입체 숫자(counts → icons3d), 평면에서 바닥 라벨(labels). 예측 핫스팟 순위와 같은 문법
export function criticalFC(data: DumpingMapData): { cells: FC; cols: FC; labels: FC; counts: ColumnDigit[] } {
  const rows = data.decision.kpi.criticalCells
  const maxCrit = Math.max(1, ...rows.map((c) => c[4]))
  const cells: Feature[] = []
  const cols: Feature[] = []
  const labels: Feature[] = []
  const counts: ColumnDigit[] = []
  for (const c of rows) {
    const tip = criticalTooltip(c, maxCrit)
    const height = colHeight(c[4], maxCrit)
    const center: [number, number] = [(c[1] + c[3]) / 2, (c[0] + c[2]) / 2]
    cells.push({ type: "Feature", properties: { tip }, geometry: cellPolygon(c[0], c[1], c[2], c[3]) })
    cols.push({ type: "Feature", properties: { h: height, tip }, geometry: cellPolygon(c[0], c[1], c[2], c[3], 0.22) })
    labels.push({ type: "Feature", properties: { label: String(c[4]) }, geometry: { type: "Point", coordinates: center } })
    counts.push({ lng: center[0], lat: center[1], rank: c[4], h: height, color: CRIT_COLOR })
  }
  return { cells: fc(cells), cols: fc(cols), labels: fc(labels), counts }
}

// 예측 핫스팟 20(운영·전망 탭). 기둥(높이=점수) + 순위 꼬리표. 상위 3은 색으로 구분
// 21라운드: 기둥 꼭대기 입체 숫자(icons3d, 재배치 후보 핀과 같은 문법). 바닥 라벨은 기둥 밑에 깔려 안 읽혔다 → 입체에서는 숫자, 평면에서는 바닥 배지(labels)
export interface ColumnDigit {
  lng: number
  lat: number
  rank: number // 숫자로 쓸 값(순위 또는 건수)
  h: number // 기둥 높이(m). 숫자는 이 위에 선다
  color: string
}
export function hotspotsFC(data: DumpingMapData): { cols: FC; labels: FC; ranks: ColumnDigit[] } {
  const rows = data.decision.hotspots.top
  const maxScore = Math.max(1, ...rows.map((h) => h[2]))
  const cols: Feature[] = []
  const labels: Feature[] = []
  const ranks: ColumnDigit[] = []
  rows.forEach((h, i) => {
    const tip = hotspotTooltip(i + 1, h)
    const height = colHeight(h[2], maxScore)
    const color = i < 3 ? CRIT_COLOR : HOT_COLOR
    cols.push({
      type: "Feature",
      properties: { h: height, color, tip },
      geometry: squareAround(h[0], h[1], 72),
    })
    labels.push({ type: "Feature", properties: { label: String(i + 1), top: i < 3 ? 1 : 0, tip }, geometry: { type: "Point", coordinates: [h[1], h[0]] } })
    ranks.push({ lng: h[1], lat: h[0], rank: i + 1, h: height, color })
  })
  return { cols: fc(cols), labels: fc(labels), ranks }
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

// 동 기준점(18라운드 후속, 2026-09-20): 동주민센터 위치(lib/dumping/dong-centers.json, 카카오 키워드 검색 실측 15곳). 라벨·동별 기둥이 같은 자리를 쓴다.
// 예전 꼭짓점 평균은 길쭉한 동(광장동·구의3동)에서 동 밖이나 한강 위로 떨어졌다. 목록에 없는 동만 꼭짓점 평균
const DONG_CENTERS = dongCenters as Record<string, { name: string; road: string; lat: number; lng: number }>
export function dongCenter(rings: [number, number][][], name?: string): [number, number] | null {
  const c = name ? DONG_CENTERS[name] : undefined
  if (c) return [c.lng, c.lat]
  const pts = rings.flat()
  if (!pts.length) return null
  const lat = pts.reduce((s, p) => s + p[0], 0) / pts.length
  const lng = pts.reduce((s, p) => s + p[1], 0) / pts.length
  return [lng, lat]
}

// 기준점이 너무 가까운 동 쌍(중곡1동·2동 주민센터 136m)은 기둥·라벨이 겹친다 → 두 점을 잇는 선을 따라 최소 간격까지 벌린다(양쪽 반씩)
export const DONG_MIN_GAP_M = 420
export function dongAnchors(data: DumpingMapData): Map<string, [number, number]> {
  const out = new Map<string, [number, number]>()
  for (const [name, rings] of Object.entries(data.dongOutlines)) {
    const c = dongCenter(rings, name)
    if (c) out.set(name, [c[0], c[1]])
  }
  const names = [...out.keys()]
  for (let i = 0; i < names.length; i++)
    for (let j = i + 1; j < names.length; j++) {
      const a = out.get(names[i])!
      const b = out.get(names[j])!
      const kx = 111320 * Math.cos((a[1] * Math.PI) / 180)
      const dx = (b[0] - a[0]) * kx
      const dy = (b[1] - a[1]) * 111320
      const d = Math.hypot(dx, dy)
      if (d >= DONG_MIN_GAP_M || d === 0) continue
      const push = (DONG_MIN_GAP_M - d) / 2
      const ux = dx / d
      const uy = dy / d
      out.set(names[i], [a[0] - (ux * push) / kx, a[1] - (uy * push) / 111320])
      out.set(names[j], [b[0] + (ux * push) / kx, b[1] + (uy * push) / 111320])
    }
  return out
}

export function dongFC(data: DumpingMapData): { lines: FC; fills: FC; labels: FC } {
  const anchors = dongAnchors(data)
  const lines: Feature[] = []
  const fills: Feature[] = []
  const labels: Feature[] = []
  for (const [name, rings] of Object.entries(data.dongOutlines)) {
    if (!rings.length) continue
    for (const r of rings) lines.push({ type: "Feature", properties: { name }, geometry: { type: "LineString", coordinates: r.map(ll) } })
    fills.push({ type: "Feature", properties: { name }, geometry: { type: "MultiPolygon", coordinates: rings.map((r) => [r.map(ll)]) } })
    const c = anchors.get(name)
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
        tip: routeTooltip(name, focus),
      },
      geometry: { type: "LineString", coordinates: link.p.map((p) => [p[1], p[0]]) },
    })
  }
  return fc(feats)
}

// 청소차 경로(18라운드 후속): 도로명별 링크를 끝점이 이어지는 순으로 엮어 폴리라인 체인으로. 트럭은 체인 위를 달린다(icons3d setTrucks).
// 링크는 순서·방향 정보가 없어 탐욕적으로 잇는다(끝점 30m 안에 시작점이 있는 링크, 뒤집힌 링크도 허용). 짧은 자투리(300m 미만)는 버린다
export interface RouteChain {
  name: string
  focus: boolean
  coords: [number, number][] // [lng,lat]
  meters: number
}
const near = (a: [number, number], b: [number, number], m: number) => Math.hypot((a[0] - b[0]) * 88000, (a[1] - b[1]) * 111000) < m
export function routeChains(links: { n?: string; p: number[][] }[]): RouteChain[] {
  const byName = new Map<string, [number, number][][]>()
  for (const l of links) {
    const name = l.n ?? ""
    if (!ROUTE_FOCUS.has(name) && !ROUTE_GENERAL.has(name)) continue
    const coords = l.p.map((p) => [p[1], p[0]] as [number, number])
    if (coords.length >= 2) (byName.get(name) ?? byName.set(name, []).get(name)!).push(coords)
  }
  const out: RouteChain[] = []
  for (const [name, segs] of byName) {
    const pool = segs.slice()
    while (pool.length) {
      const chain = pool.shift()!.slice()
      let grew = true
      while (grew) {
        grew = false
        for (let i = 0; i < pool.length; i++) {
          const sgm = pool[i]
          const tail = chain[chain.length - 1]
          if (near(sgm[0], tail, 30)) chain.push(...sgm.slice(1))
          else if (near(sgm[sgm.length - 1], tail, 30)) chain.push(...sgm.slice(0, -1).reverse())
          else continue
          pool.splice(i, 1)
          grew = true
          break
        }
      }
      let meters = 0
      for (let i = 1; i < chain.length; i++) meters += Math.hypot((chain[i][0] - chain[i - 1][0]) * 88000, (chain[i][1] - chain[i - 1][1]) * 111000)
      if (meters >= 300) out.push({ name, focus: ROUTE_FOCUS.has(name), coords: chain, meters })
    }
  }
  return out.sort((a, b) => b.meters - a.meters)
}

// 미터 반경을 줌별 픽셀로. 지수(밑 2) 보간이면 두 줌 사이가 정확히 미터 비례가 된다(웹 메르카토르)
const LAT0 = 37.546
const metersPerPixel = (z: number) => (156543.03392 * Math.cos((LAT0 * Math.PI) / 180)) / Math.pow(2, z)
export function radiusMetersExpr(prop = "r"): unknown[] {
  return ["interpolate", ["exponential", 2], ["zoom"], 10, ["/", ["get", prop], metersPerPixel(10)], 22, ["/", ["get", prop], metersPerPixel(22)]]
}

// ─── 동별 민원·과태료 기둥(17라운드: 진짜 입체). 동 가운데에 민원 파랑·과태료 갈색 두 기둥.
// 값은 구 최댓값 대비, 격자 기둥(최대 280m)보다 훨씬 커야 동 단위 합계임이 한눈에 읽힌다 ───
export const DONG_COL_MAX_M = 720
export const DONG_COL_MIN_M = 24
const DONG_COL_SIDE = 96 // 기둥 한 변(m)
const DONG_COL_GAP = 70 // 두 기둥 중심 간격(m)
const dongColHeight = (v: number, max: number) => DONG_COL_MIN_M + (Math.max(0, v) / Math.max(1, max)) * (DONG_COL_MAX_M - DONG_COL_MIN_M)

export interface DongRankBadge {
  lng: number
  lat: number
  rank: number
  h: number // 기둥 높이(m)
  color: string
  side: -1 | 1 // 민원 -1(왼쪽 기둥) · 과태료 1. 한 동에 둘 다 순위면 배지가 겹치니 icons3d가 좌우로 비킨다
}
export function dongColumnsFC(data: DumpingMapData, dongMode: DongMode, dongYear: string | null): { cols: FC; labels: FC; ranks: DongRankBadge[] } {
  // 12라운드: 모드별 값. 연도 모드는 그 해의 민원(접수)·과태료(위반), 채널 모드는 민원 기둥을 앱·120·직접 세 토막으로
  const valOf = (d: (typeof data.dong)[number]) =>
    dongMode === "year" && dongYear
      ? { comp: d.yr?.complaints[dongYear] ?? 0, enf: d.yr?.enforcement[dongYear] ?? 0 }
      : { comp: d.comp, enf: d.enf }
  const max = Math.max(1, ...data.dong.flatMap((d) => [valOf(d).comp, valOf(d).enf]))
  const n = data.dong.length
  const rank = (key: "comp" | "enf", v: number) => data.dong.filter((x) => valOf(x)[key] > v).length + 1
  // 민원과 과태료는 집계 시작이 다르다(민원 2024.1~, 과태료 2022.3~). 기둥을 나란히 두니 툴팁에 밝힌다
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
      block("민원", COMP_COLOR, v.comp, yearMode ? perYear(v.comp, d.comp, d.cr) : d.cr, rank("comp", v.comp)) +
      block("과태료", ENF_COLOR, v.enf, yearMode ? perYear(v.enf, d.enf, d.er) : d.er, rank("enf", v.enf)) +
      chLine +
      `<div class="f">기둥: 구 최댓값 대비 · 순위: ${n}개 동 중<br>${yearMode ? `${dongYear}년 · 민원은 접수일, 과태료는 위반일 기준` : `누계 시작: 민원 ${compFrom} · 과태료 ${enfFrom}`}</div></div>`
    )
  }
  const cols: Feature[] = []
  const labels: Feature[] = []
  const ranks: DongRankBadge[] = [] // 1~3위 배지(지표별). 기둥 꼭대기에 띄운다(dumping-map → icons3d)
  const anchors = dongAnchors(data)
  for (const d of data.dong) {
    const c = anchors.get(d.d)
    if (!c) continue
    const [lng, lat] = c
    const v = valOf(d)
    const dLng = DONG_COL_GAP / 2 / (111320 * Math.cos((lat * Math.PI) / 180))
    const rc = rank("comp", v.comp)
    if (rc <= 3 && v.comp > 0) ranks.push({ lng: lng - dLng, lat, rank: rc, h: dongColHeight(v.comp, max), color: COMP_COLOR, side: -1 })
    const re = rank("enf", v.enf)
    if (re <= 3 && v.enf > 0) ranks.push({ lng: lng + dLng, lat, rank: re, h: dongColHeight(v.enf, max), color: ENF_COLOR, side: 1 })
    const card = tip(d)
    const props = { tip: card, card: 1, dong: d.d }
    // 민원 기둥(왼쪽). 채널 모드는 아래부터 직접·120·앱(앱이 가장 많아 위에 진하게)
    const hc = dongColHeight(v.comp, max)
    if (dongMode === "channel" && d.comp > 0 && d.ch) {
      let base = 0
      for (const ch of ["direct", "c120", "app"] as const) {
        const h = (d.ch[ch] / d.comp) * hc
        if (h <= 0) continue
        cols.push({ type: "Feature", properties: { ...props, color: CHANNEL_DEF[ch].front, base, h: base + h }, geometry: squareAround(lat, lng - dLng, DONG_COL_SIDE) })
        base += h
      }
    } else cols.push({ type: "Feature", properties: { ...props, color: COMP_COLOR, base: 0, h: hc }, geometry: squareAround(lat, lng - dLng, DONG_COL_SIDE) })
    // 과태료 기둥(오른쪽)
    cols.push({ type: "Feature", properties: { ...props, color: ENF_COLOR, base: 0, h: dongColHeight(v.enf, max) }, geometry: squareAround(lat, lng + dLng, DONG_COL_SIDE) })
    labels.push({ type: "Feature", properties: { label: `${d.d}\n${v.comp.toLocaleString()} · ${v.enf.toLocaleString()}` }, geometry: { type: "Point", coordinates: [lng, lat] } })
  }
  return { cols: fc(cols), labels: fc(labels), ranks }
}

// ─── 드론 비행(17라운드 시연 → 18라운드 연속 비행). 구 전체(내려다봄) → 핫스팟 상위 5곳 → 다시 구 전체.
// 구간마다 easeTo를 이어 붙이면 방향이 휙휙 꺾였다(유저 실측). 지금은 경유지를 지나는 Catmull-Rom 곡선 위를 한 카메라가 연속으로 난다:
// 지점마다 부드럽게 감속해 잠시 머물고(dwell) 다시 출발, 방위는 일정한 속도로 천천히 돈다(급회전 없음), 지점 사이에서는 살짝 떠올랐다 내려앉는다(lift) ───
export interface FlyWaypoint {
  center: [number, number]
  zoom: number
  pitch: number
  dwell: number // 도착해 머무는 시간(ms)
  target?: { rank: number; label: string; lnglat: [number, number] } // 핫스팟이면 그 지점(화면 안내·초점 고리)
}
export const FLY_BEARING_DEG_PER_S = 2.6 // 방위 회전 속도(도/초). 한 바퀴 약 2분 20초
export const FLY_HOT_ZOOM = 15.6
export const FLY_HOT_PITCH = 62
// 비행 목표 묶음(21라운드 시연: 장면마다 다른 목록을 1위부터). 레이어 패널의 "드론 비행"은 hotspots
export type FlyKind = "hotspots" | "candidates" | "critical"
export const FLY_KIND_LABEL: Record<FlyKind, string> = { hotspots: "예측 핫스팟", candidates: "재배치 후보", critical: "집중관리 상습격자" }
export interface FlyStop {
  rank: number
  label: string
  lnglat: [number, number]
}
export function flyStops(data: DumpingMapData, kind: FlyKind = "hotspots", n = 5): FlyStop[] {
  if (kind === "candidates")
    return data.cctvCandidates.slice(0, n).map((c, i) => ({ rank: i + 1, label: `재배치 후보 ${i + 1}위 · ${c[4] || "광진구"} · ${c[5] || "대표 주소 없음"}`, lnglat: [c[1], c[0]] }))
  if (kind === "critical") {
    const rows = [...data.decision.kpi.criticalCells].sort((a, b) => b[4] - a[4])
    return rows.slice(0, n).map((c, i) => ({ rank: i + 1, label: `상습격자 ${i + 1}위 · ${c[5] || "광진구"} · 12개월 ${c[4]}건`, lnglat: [(c[1] + c[3]) / 2, (c[0] + c[2]) / 2] }))
  }
  return data.decision.hotspots.top.slice(0, n).map((h, i) => ({ rank: i + 1, label: `예측 핫스팟 ${i + 1}위 · ${h[5] || "광진구"} · ${h[6] || "대표 주소 없음"}`, lnglat: [h[1], h[0]] }))
}
export function flyWaypoints(data: DumpingMapData, overview: { center: [number, number]; zoom: number }, kind: FlyKind = "hotspots"): FlyWaypoint[] {
  const out: FlyWaypoint[] = [{ center: overview.center, zoom: overview.zoom, pitch: 50, dwell: 1200 }]
  for (const st of flyStops(data, kind)) out.push({ center: st.lnglat, zoom: FLY_HOT_ZOOM, pitch: FLY_HOT_PITCH, dwell: 2600, target: st })
  out.push({ center: overview.center, zoom: overview.zoom, pitch: 50, dwell: 1500 })
  return out
}
// 구간 비행 시간(ms): 거리에 비례하되 너무 짧거나 길지 않게. 조망↔핫스팟은 줌 변화가 커서 조금 더
export function flySegmentMs(a: FlyWaypoint, b: FlyWaypoint): number {
  const km = Math.hypot((b.center[0] - a.center[0]) * 111.32 * Math.cos((a.center[1] * Math.PI) / 180), (b.center[1] - a.center[1]) * 111.32)
  const zoomGap = Math.abs(b.zoom - a.zoom)
  return Math.round(Math.min(11000, Math.max(5000, 3800 + km * 2200 + zoomGap * 1200)))
}
const smooth = (t: number) => t * t * (3 - 2 * t) // smoothstep: 양 끝 속도 0(지점에서 부드럽게 서고 떠난다)
const catmull = (p0: number, p1: number, p2: number, p3: number, t: number) =>
  0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (-p0 + 3 * p1 - 3 * p2 + p3) * t * t * t)
// 구간 i(경유지 i → i+1)의 진행률 f(0~1)에서의 카메라. 위치는 경유지를 지나는 곡선, 줌·기울기는 같은 곡선으로 보간 + 지점 사이 떠오름
export function flyCameraAt(wps: FlyWaypoint[], i: number, f: number): { center: [number, number]; zoom: number; pitch: number } {
  const at = (k: number) => wps[Math.max(0, Math.min(wps.length - 1, k))]
  const [a, b, c, d] = [at(i - 1), at(i), at(i + 1), at(i + 2)]
  const t = smooth(Math.max(0, Math.min(1, f)))
  const lng = catmull(a.center[0], b.center[0], c.center[0], d.center[0], t)
  const lat = catmull(a.center[1], b.center[1], c.center[1], d.center[1], t)
  // 핫스팟 사이는 살짝 떠올라(줌 -0.7) 다음 지점을 내려다보다 내려앉는다. 조망↔핫스팟 구간은 그냥 보간
  const lift = b.target && c.target ? 0.7 * Math.sin(Math.PI * t) : 0
  const zoom = b.zoom + (c.zoom - b.zoom) * t - lift
  const pitch = b.pitch + (c.pitch - b.pitch) * t - lift * 6
  return { center: [lng, lat], zoom, pitch }
}
// 드론 비행 경로 그림: 목표 상위 5곳을 잇는 점선. 번호 지점은 없다(순위는 기둥·핀 숫자와 안내 띠가 말한다. 바닥 번호까지 있으면 숫자가 둘씩 겹친다)
export function flyRouteFC(data: DumpingMapData, kind: FlyKind = "hotspots"): { path: FC } {
  const coords = flyStops(data, kind).map((s) => s.lnglat)
  return { path: coords.length > 1 ? fc([{ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: coords } }]) : emptyFC() }
}

// ─── 18라운드(2026-09-19): 입체 보기 전용 도형. 평면의 원·점은 지형 위에 드레이핑되어 건물 아래 깔린다(maplibre는 fill·line·circle을 지형 텍스처로 굽고
// fill-extrusion·symbol만 3D로 그린다). 그래서 입체에서는 원을 원기둥으로, 시설·후보 점을 말뚝으로, 초점 링을 땅 위 고리로 세운다 ───
export const CYL_MIN_M = 30 // 원기둥 최소 높이. 3층 다가구(약 10m) 위로 머리가 나오게
export const CYL_MAX_M = 240
export const POST_R_M = 9 // 시설 말뚝 반지름(m)
export const POST_H_M = 34
export const CAND_POST_R_M = 13 // 재배치 후보 말뚝(잉크색, 시설 말뚝보다 높다)
export const CAND_POST_H_M = 96
export const RECO_RING_R_M = 17 // 배치추천 고리(아직 없는 것이라 속이 빈 고리)
export const RECO_RING_H_M = 12
export const FOCUS_RING_R_M = 46 // 초점 고리(목록 클릭·드론 목표)
export const NEUTRAL_BUILDING = { light: "#d7d5cd", dark: "#2a343b" } as const
// 재배치 후보를 표시하는 동안의 바탕 램프: 색 대신 회색 단계(진할수록 기록 많음). 앰버 핀·보라 카메라만 색을 갖는다(2026-09-21)
export const GREY_RAMP = { light: ["#e2e0d9", "#cfccc3", "#b7b3a9", "#9a968c", "#7a766d", "#57544d"], dark: ["#2a343b", "#3a454d", "#4b5761", "#5f6c77", "#76848f", "#93a0aa"] } as const
export function greyRamp(theme: "light" | "dark", n: number): string[] {
  const src = GREY_RAMP[theme]
  return Array.from({ length: n }, (_, i) => src[Math.round((i * (src.length - 1)) / Math.max(1, n - 1))])
}

// 실사풍 건물 색(바탕 "없음"·기본): 층수로 건물 유형을 짐작해 칠한다. 1~2층 단독(따뜻한 베이지) · 3~4층 다가구(벽돌 톤) · 5~9층 근생·빌라(콘크리트)
// · 10~19층 아파트(회백) · 20층+ 고층(유리 청회). 같은 층수라도 UFID 끝자리로 ±1층 흔들어 이웃 건물이 똑같은 색으로 붙지 않게 한다
export const REAL_BUILDING = {
  light: ["#ddd2be", "#cdb9a3", "#c9c5bb", "#bfc2c4", "#adb8c3"],
  dark: ["#3a3730", "#403832", "#343a3e", "#323b44", "#2f3e4c"],
} as const
export function realBuildingExpr(theme: "light" | "dark"): unknown[] {
  const pal = REAL_BUILDING[theme]
  const flr: unknown[] = ["coalesce", ["get", "flr"], 2]
  // UFID 문자열 끝 두 자리 → 0·1·2 → -1·0·+1
  const jitter: unknown[] = ["-", ["%", ["to-number", ["slice", ["to-string", ["get", "id"]], -2], 0], 3], 1]
  return ["interpolate", ["linear"], ["+", flr, jitter], 1, pal[0], 4, pal[1], 8, pal[2], 16, pal[3], 28, pal[4]]
}

// 중심 둘레 반지름 r(m)인 정다각형(원 근사). n=20이면 화면에서 원으로 읽힌다
export function discPolygon(lng: number, lat: number, r: number, n = 20): GeoJSON.Polygon {
  const dLat = r / 111320
  const dLng = r / (111320 * Math.cos((lat * Math.PI) / 180))
  const ring: [number, number][] = []
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2
    ring.push([lng + Math.cos(a) * dLng, lat + Math.sin(a) * dLat])
  }
  return { type: "Polygon", coordinates: [ring] }
}
// 속이 빈 고리(바깥 반지름 r, 두께 t)
export function ringPolygon(lng: number, lat: number, r: number, t: number, n = 24): GeoJSON.Polygon {
  const outer = discPolygon(lng, lat, r, n).coordinates[0]
  const inner = discPolygon(lng, lat, Math.max(1, r - t), n).coordinates[0].reverse()
  return { type: "Polygon", coordinates: [outer, inner] }
}

// 원 겹치기(민원·과태료)를 원기둥으로. 발자국은 평면 원과 같은 반지름(m), 높이는 그 지표의 구 최댓값 대비. 두 지표가 한 칸에 있으면 좌우로 비켜 세운다
export function circleColumnsFC(data: DumpingMapData, circles: CircleId[]): FC {
  const feats: Feature[] = []
  const both = circles.length > 1
  const max = gridMaxes(data)
  circles.forEach((cid, k) => {
    const cdef = CIRCLE_DEF[cid]
    const maxV = Math.max(1, ...data.grid.map((c) => c[cdef.idx]))
    for (const c of data.grid) {
      const v = c[cdef.idx]
      if (v <= 0) continue
      const r = Math.min(48, 8 + Math.pow(v, 0.6) * 6)
      const [lng0, lat] = cellCenter(c)
      const lng = both ? lng0 + ((k === 0 ? -1 : 1) * 20) / (111320 * Math.cos((lat * Math.PI) / 180)) : lng0
      feats.push({
        type: "Feature",
        properties: { dong: c[7] || "", v, h: CYL_MIN_M + (v / maxV) * (CYL_MAX_M - CYL_MIN_M), color: cdef.color, tip: cellTooltip(c, max) },
        geometry: discPolygon(lng, lat, r),
      })
    }
  })
  return fc(feats)
}

// 날씨별 원을 원기둥으로. 평면과 같은 상대 크기(조건 안 최댓값 대비)
export function weatherColumnsFC(data: DumpingMapData, weather: WeatherKey): FC {
  const flat = weatherFC(data, weather)
  return fc(
    flat.features.map((f) => {
      const [lng, lat] = (f.geometry as GeoJSON.Point).coordinates
      const r = f.properties.r as number
      return { type: "Feature", properties: { ...f.properties, h: CYL_MIN_M + ((r - 6) / 64) * (CYL_MAX_M - CYL_MIN_M) }, geometry: discPolygon(lng, lat, r) }
    }),
  )
}

// 점(시설·후보)을 말뚝으로. 같은 속성(tip·color)을 그대로 들고 발자국만 네모(원기둥=건수와 모양으로 갈라 보인다. 이동식 CCTV 보라와 과태료 보라가 같이 서도 구분)
export function postsFC(points: FC, r: number, h: number): FC {
  return fc(
    points.features.map((f) => {
      const [lng, lat] = (f.geometry as GeoJSON.Point).coordinates
      return { type: "Feature", properties: { ...f.properties, h }, geometry: squareAround(lat, lng, r * 2) }
    }),
  )
}
export function ringsFC(points: FC, r: number, t: number, h: number): FC {
  return fc(
    points.features.map((f) => {
      const [lng, lat] = (f.geometry as GeoJSON.Point).coordinates
      return { type: "Feature", properties: { ...f.properties, h }, geometry: ringPolygon(lng, lat, r, t) }
    }),
  )
}

// 좌표 → 격자 칸 번호. 건물(GIS건물통합정보) 중심점을 칸에 붙여 건물 색을 칸 값으로 칠할 때 쓴다.
// 격자가 완전한 정규 격자는 아니라(칸 크기 1.000~1.002배) 칸 크기 단위 버킷에 칸을 등록해 두고 점이 든 버킷의 후보만 포함 검사
export function cellLookup(grid: GridCell[]): (lat: number, lng: number) => number {
  if (!grid.length) return () => -1
  const dLat = grid[0][2] - grid[0][0]
  const dLng = grid[0][3] - grid[0][1]
  const key = (lat: number, lng: number) => `${Math.floor(lat / dLat)}:${Math.floor(lng / dLng)}`
  const buckets = new Map<string, number[]>()
  grid.forEach((c, i) => {
    for (const lat of [c[0], c[2]]) for (const lng of [c[1], c[3]]) {
      const k = key(lat, lng)
      const b = buckets.get(k)
      if (b) b.push(i)
      else buckets.set(k, [i])
    }
  })
  return (lat, lng) => {
    const b = buckets.get(key(lat, lng))
    if (!b) return -1
    for (const i of b) {
      const c = grid[i]
      if (lat >= c[0] && lat < c[2] && lng >= c[1] && lng < c[3]) return i
    }
    return -1
  }
}

