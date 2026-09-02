import type { DumpingMapData, OntoGraph } from "./types"

// map.json·graph.json에서 파생하는 표시용 사실 — 헤더·프롬프트·모달이 같은 값을 쓰도록 한 곳에 모은다.
// 데이터가 갱신되면 여기서 뽑는 숫자·기간이 함께 바뀌어야 하므로 문구에 숫자를 박아 두지 않는다.

export function sumValues(o: Record<string, number>): number {
  return Object.values(o).reduce((a, b) => a + b, 0)
}

// "2024-01" → "2024.1"
export function ym(key: string): string {
  const [y, m] = key.split("-")
  return `${y}.${Number(m)}`
}

export interface Period {
  from: string // "2024-01"
  to: string // "2026-08"
  label: string // "2024.1~2026.8"
  lastYear: string // "2026"
  lastMonth: number // 8
  months: number
}

export function periodOf(monthly: Record<string, number>): Period {
  const keys = Object.keys(monthly).sort()
  const from = keys[0] ?? ""
  const to = keys[keys.length - 1] ?? ""
  return {
    from,
    to,
    label: from && to ? `${ym(from)}~${ym(to)}` : "",
    lastYear: to.slice(0, 4),
    lastMonth: Number(to.slice(5, 7)),
    months: keys.length,
  }
}

// 마지막 연도가 12월 미만이면 "(1~8월)" 꼬리표
export function partialYearSuffix(p: Period, year: string): string {
  return year === p.lastYear && p.lastMonth < 12 ? ` (1~${p.lastMonth}월)` : ""
}

export function fmtKrw(won: number): string {
  return `${(won / 10000).toLocaleString(undefined, { maximumFractionDigits: 0 })}만원`
}

// 대시보드 전체가 공유하는 요약 수치
export function summarize(data: DumpingMapData) {
  const period = periodOf(data.yearly.complaintsMonthly)
  const finesPeriod = periodOf(data.decision.fines.monthly)
  return {
    period,
    finesPeriod,
    complaints: sumValues(data.yearly.complaints),
    enforcement: sumValues(data.yearly.enforcement),
    dongCount: data.dong.length,
    gridCount: data.grid.length,
  }
}

export function graphSize(graph: OntoGraph): { nodes: number; edges: number } {
  return { nodes: graph.nodes.length, edges: graph.edges.length }
}

// 격자 회귀 표준화 β — Covariate 노드의 coefficient에서 뽑는다 (철회된 DID 항목 제외)
export interface BetaRow {
  id: string
  label: string
  beta: number
  p: number
}

export function regressionBetas(graph: OntoGraph): BetaRow[] {
  return graph.nodes
    .filter((n) => n.type === "Covariate" && typeof n.props.coefficient === "number" && !n.props.retracted)
    .map((n) => ({
      id: n.id,
      label: n.label.replace(/\s*\(변수\)$/, ""),
      beta: Number(n.props.coefficient),
      p: Number(n.props.p_value ?? NaN),
    }))
    .sort((a, b) => Math.abs(b.beta) - Math.abs(a.beta))
}

// 동별 수치 강조·권고 임계 — 발견 탭 표와 동 브리핑 권고가 같은 기준을 쓴다 (단위 %, cr·er는 천명당 건)
export const DONG_THRESHOLDS = { cr: 15, er: 15, unm: 45, one: 55, yth: 35, frn: 10 } as const
