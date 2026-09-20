// /snow 데이터 타입. data/snow/map.json(scripts/snow-data.mjs 산출)과 graph.json의 모양.
// 온톨로지 그래프 타입은 /dumping과 같은 프로퍼티 그래프 규약(OntoGraph)을 그대로 쓴다. 클래스·관계는 lib/snow/schema.ts

export type { OntoEdge, OntoGraph, OntoNode } from "@/lib/dumping/types"

export type DatasetKey = "heat" | "heatGu" | "salt" | "cacl" | "sand" | "seoul" | "weak" | "ice" | "schools" | "freeze" | "accidents" | "roads" | "dem"

export interface DongRow {
  d: string
  heatSeg: number
  heatM: number // 1차로 기준 연장 합
  heatPhysM: number // 도로 길이 합(연장 ÷ 차로수)
  salt: number
  cacl: number
  sand: number
  sandBags: number
  weak: number // 행안부 적설취약구간
  weakNoHeat: number
  weakGap: number // 열선도 자재도 없는 취약구간
  ice: number // 상습결빙구간
  schools: number
  slopes: number // DEM 추정 급경사
  center: [number, number] // [lat, lng] 동주민센터
  centerName: string
}

// named=노선명 도로 · network=다른 도로 · point=두 점 같아 연장만큼 · straight=직선 · trunk=간선 체인 절단(결빙구간) · points=선형 미확인, 끝점만 표시(결빙구간)
export type SnapMethod = "named" | "network" | "point" | "straight" | "trunk" | "points"

export interface HeatSeg {
  i: number
  seoulNo: number
  guNo: number | null // 구 41행 연번(조인됐을 때)
  d: string | null
  route: string
  routeSrc: "gu" | "road" | "none"
  from: string
  to: string
  m: number // 열선연장(m, 1차로 기준. 서울시 집계)
  lanes: string
  lanesN: number | null
  physM: number | null // 도로 길이 = m ÷ 차로수
  year: number | null
  month: number | null
  note: string
  a: [number, number]
  b: [number, number]
  path: [number, number][] // 도로 스냅 선형 [lat,lng]
  pathM: number
  method: SnapMethod
  approx: boolean
  roadName: string
  snapNote: string
}

// 취약구간(행안부 적설취약구간·상습결빙구간) 공통
export interface SegNear {
  heat: number | null
  salt: number | null
  cacl: number | null
  sand: number | null
}
export interface SegBase {
  a: [number, number]
  b: [number, number]
  path: [number, number][]
  pathM: number
  method: SnapMethod
  approx: boolean
  roadName: string
  d: string | null
  near: SegNear
  heatIds: number[]
  matNear: { salt: number; cacl: number; sand: number }
  heatCovered: boolean
  materialsNear: number
  gap: boolean
}
export interface WeakSeg extends SegBase {
  i: number
  name: string
  road: string
  type: string // 고갯길 · 급경사 · 기타
  cls: string
  km: number
  agency: string
}
export interface IceSeg extends SegBase {
  id: string
  agency: string
  cls: string
  road: string
  km: number
}
export interface SlopeSeg {
  name: string
  kind: string
  detail: string
  coords: [number, number][]
  len: number
  grade: number
  rise: number
  d: string | null
  near: SegNear
  heatIds: number[]
  materialsNear: number
  weakNear: number[]
}
export interface School {
  name: string
  addr: string
  lat: number
  lng: number
  d: string | null
  heatNear: number[]
  weakNear: number[]
}
export interface Gaps {
  weakTotal: number
  weakHeat: number
  weakNoHeat: number
  weakNone: number
  weakByType: Record<string, { n: number; heat: number; none: number }>
  iceTotal: number
  iceHeat: number
  iceNone: number
  iceByAgency: Record<string, number>
  noHeatDongs: string[]
  schoolsNoHeat: number
  slopeCount: number
  slopeKm: number
  slopeNoHeat: number
  weakOnSlope: number
  heatNearM: number
  materialNearM: number
  schoolNearM: number
}

export interface SaltBox {
  id: string
  addr: string
  detail: string
  lat: number
  lng: number
  d: string | null // 경계 판정. 구 경계선 밖(천호대로 등)은 null
}

export interface CaclBox {
  id: string
  addr: string
  lat: number
  lng: number
  d: string
}

export interface SandSite {
  kind: "site" | "center" // 취약지역 · 동 주민센터
  d: string
  addr: string
  qty: number
  note: string
  lat: number
  lng: number
  approx: boolean
}

export interface SeoulGu {
  gu: string
  n: number
  m: number
}

export interface OpsFigures {
  source: string
  period: { from: string; to: string }
  staff: number
  squads: number
  unimog: number
  dump15t: number
  sprayers: number
  heatSites: number
  weakPoints: number
  boxSites: number
  saltTons: number
  seasonStaff: number
  seasonEquip: number
}

export interface SnowMapData {
  asof: Record<DatasetKey, string>
  source: Record<DatasetKey, string>
  ring: [number, number][]
  dongOutlines: Record<string, [number, number][][]>
  dongs: DongRow[]
  heat: HeatSeg[]
  salt: SaltBox[]
  cacl: CaclBox[]
  sand: SandSite[]
  weak: WeakSeg[]
  ice: IceSeg[]
  slopes: SlopeSeg[]
  schools: School[]
  seoul: SeoulGu[]
  climate: { freezeDays: { year: number; total: number; nov: number; dec: number; jan: number; feb: number; mar: number }[]; source: string; asof: string; station: string }
  accidents: { fetched: string; years: { year: number; seoul: number; gwangjin: number; gwangjinSpots: { name: string; n: number; lat: number; lng: number }[] }[]; source: string; def: string } | null
  gaps: Gaps
  ops: OpsFigures
  meta: {
    built: string
    geocode: { rule: string; heatGeoFail: number; sandApprox: number; schoolsMissing: number }
    snap: { rule: string; heat: Record<string, number>; weak: Record<string, number>; ice: Record<string, number>; heatApprox: number }
    heatJoin: { seoulRows: number; guMatched: number; guRows: number; guUnmatched: number[] }
    slope: { window: number; step: number; minGrade: number; minLen: number; maxGrade: number; awayFromTrunkM: number; count: number; km: number; weakOnSlope: number; dropped: number; rule: string }
    saltNoDong: number
    thresholds: { heatNearM: number; materialNearM: number; schoolNearM: number }
  }
}

export type ResourceId = "heat" | "salt" | "cacl" | "sand"
// 지도 레이어 id(자원 4 + 취약구간·급경사 추정·초등학교)
export type LayerId = ResourceId | "weak" | "ice" | "slope" | "school"

// 예보(app/api/snow/forecast). 기상청 단기예보(SNO·PTY·TMP)를 서버가 받아 필요한 것만 넘긴다. 실패 시 Open-Meteo
export interface ForecastHour {
  t: string // ISO(Asia/Seoul)
  temp: number
  snow: number // cm
  code: number // WMO
}
export interface SnowForecast {
  fetched: string
  model: string
  hours: ForecastHour[]
  snow24: number // 앞으로 24시간 적설 합(cm)
  snow48: number
  minTemp24: number
  now: { temp: number; snow: number; code: number } | null
  warning?: SnowWarning | null // 기상특보(서울). 없으면 null
}
// 기상청 기상특보 현황(getPwnStatus stnId=109 서울). 대설 주의보·경보만 단계 판정에 쓴다
export interface SnowWarning {
  fetched: string
  level: "none" | "advisory" | "warning" // 대설주의보 · 대설경보
  text: string // 통보문 t6 원문 요약(서울 부분)
  tmFc: string
}
