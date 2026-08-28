// /dumping 대시보드 공유 타입 — 데이터 산출은 gwangjin-dumping/scripts/export_dashboard.py

// [s, w, n, e, 민원, 과태료, 무관리주거, 행정동]
export type GridCell = [number, number, number, number, number, number, number, string]

export interface DongRow {
  d: string // 행정동
  cr: number // 민원 천명당
  er: number // 과태료 천명당
  comp: number // 민원 총건
  enf: number // 과태료 총건
  one: number // 1인세대 %
  yth: number // 청년 20-34 %
  frn: number // 등록외국인 %
  unm: number // 무관리 주거 %
  hh: number // 세대수
  mf: number // 다가구 가구
  apt: number // 공동주택 세대
  o: number // 표시 순서
}

// [lat, lng, 라벨, 행정동]
export type InfraPoint = [number, number, string, string]

export interface InfraLayers {
  cctvFixed: InfraPoint[]
  cctvMobile: InfraPoint[]
  recycling: InfraPoint[]
  bins: InfraPoint[]
}

export type InfraLayerId = keyof InfraLayers

// [lat, lng, 민원, 과태료, 행정동, 대표주소] — 재배치 후보(자원배분 논리, 통계 효과 근거 아님)
// 대표주소 = 해당 격자에 지오코딩된 민원 중 최빈 주소
export type CctvCandidate = [number, number, number, number, string, string]

export interface DumpingMapData {
  grid: GridCell[]
  ring: [number, number][]
  dong: DongRow[]
  ts: Record<string, (number | null)[]> // 청년비율 2015→2025
  // 동별 실제 행정동 경계 링 목록 (vuski/admdongkor) — [ [lat,lng][], ... ]
  dongOutlines: Record<string, [number, number][][]>
  infra: InfraLayers
  cctvCandidates: CctvCandidate[]
  // 연도별·월별 집계 (민원=접수시각, 과태료=위반일시, 2026년은 8월까지 부분)
  yearly: {
    complaints: Record<string, number>
    complaintsApp: Record<string, number>
    enforcement: Record<string, number>
    complaintsMonthly: Record<string, number>
  }
  // 환경요인 일평균 (날씨=Open-Meteo 일별 조인, 과태료 시간대·요일은 단속 근무 패턴 포함 주의)
  env: {
    seasons: Record<string, EnvGroup>
    rain: Record<string, EnvGroup>
    temp: Record<string, EnvGroup>
    enfByHour: Record<string, number>
    enfByDow: Record<string, number>
  }
}

export interface EnvGroup {
  days: number
  compPerDay: number
  enfPerDay: number
}

// 발견 카드·예시 질문이 지도에 거는 시각화 지시
export interface VizAction {
  mode?: MapMode
  layers?: InfraLayerId[]
  candidates?: boolean
  routes?: boolean // 청소차 관리노선 레이어
  dong?: string | null
}

export interface OntoNode {
  id: string
  type: string
  space: string
  label: string
  props: Record<string, string | number>
}

export interface OntoEdge {
  f: string
  rel: string
  t: string
  props?: Record<string, string | number>
}

export interface OntoGraph {
  nodes: OntoNode[]
  edges: OntoEdge[]
}

export type MapMode = "overlay" | "unm" | "comp" | "enf"

// 지도 레이어 분해: 바탕(면)은 하나만, 원(점)은 자유 중첩
export type BaseMode = "unm" | "comp" | "enf"
export type CircleId = "comp" | "enf"
