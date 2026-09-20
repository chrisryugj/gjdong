// /snow 데이터 타입. data/snow/map.json(scripts/snow-data.mjs 산출)과 graph.json의 모양.
// 온톨로지 그래프 타입은 /dumping과 같은 프로퍼티 그래프 규약(OntoGraph)을 그대로 쓴다. 클래스·관계는 lib/snow/schema.ts

export type { OntoEdge, OntoGraph, OntoNode } from "@/lib/dumping/types"

export type DatasetKey = "heat" | "salt" | "cacl" | "sand" | "seoul"

export interface DongRow {
  d: string
  heatSeg: number
  heatM: number
  salt: number
  cacl: number
  sand: number
  sandBags: number
  center: [number, number] // [lat, lng]
}

export interface HeatSeg {
  i: number
  d: string
  route: string
  from: string
  to: string
  m: number // 열선연장(m, 1차로 기준)
  lanes: string
  year: number | null
  month: number | null
  note: string
  a: [number, number]
  b: [number, number]
  approx: boolean // 기점·종점 지오코딩 실패로 노선명·동 중심으로 둔 구간
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
  seoul: SeoulGu[]
  ops: OpsFigures
  meta: { built: string; geocode: { rule: string; heatApprox: number; sandApprox: number }; saltNoDong: number }
}

export type ResourceId = "heat" | "salt" | "cacl" | "sand"

// 예보(app/api/snow/forecast). Open-Meteo 기상청 모델을 서버가 받아 필요한 것만 넘긴다
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
}
