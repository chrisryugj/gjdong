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

export interface DumpingMapData {
  grid: GridCell[]
  ring: [number, number][]
  dong: DongRow[]
  ts: Record<string, (number | null)[]> // 청년비율 2015→2025
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
