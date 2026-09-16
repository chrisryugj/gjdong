import type { DumpingMapData, InfraPoint, OntoGraph } from "./types"

// map.json·graph.json에서 파생하는 표시용 사실. 헤더·프롬프트·모달이 같은 값을 쓰도록 한 곳에 모은다.
// 데이터가 갱신되면 여기서 뽑는 숫자·기간이 함께 바뀌어야 하므로 문구에 숫자를 박아 두지 않는다.

// 인프라 원자료는 세 층이 다르다. 가로쓰레기통이 가장 심한데 128행이 전부 64곳을 두 번씩 적은 것이고,
// 그 64곳도 지오코딩이 서로 다른 설치장소를 한 좌표에 뭉쳐 51지점으로 겹친다(강변역 한 점에 6곳).
// 그래서 지도는 좌표당 한 점만 그리고, 칩은 행이 아니라 고유 기록을 센다. 다른 레이어에도 중복 행이 있다.
export interface InfraSpot {
  lat: number
  lng: number
  at: InfraPoint[] // 이 좌표에 겹친 서로 다른 기록. 길이 1이면 흔한 경우
}

export interface InfraTally {
  rows: number // 원자료 행 수 (중복 포함)
  records: InfraPoint[] // 완전히 같은 행을 하나로 접은 것
  spots: InfraSpot[] // 좌표별 묶음. 지도 마커 하나가 이 묶음 하나
}

export function tallyInfra(points: InfraPoint[]): InfraTally {
  const seen = new Set<string>()
  const records: InfraPoint[] = []
  for (const p of points) {
    const k = JSON.stringify(p)
    if (seen.has(k)) continue
    seen.add(k)
    records.push(p)
  }
  const byCoord = new Map<string, InfraSpot>()
  for (const p of records) {
    const k = `${p[0]},${p[1]}`
    const spot = byCoord.get(k)
    if (spot) spot.at.push(p)
    else byCoord.set(k, { lat: p[0], lng: p[1], at: [p] })
  }
  return { rows: points.length, records, spots: [...byCoord.values()] }
}

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

// 격자 회귀 표준화 β. Covariate 노드의 coefficient에서 뽑는다 (철회된 DID 항목 제외)
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

// 동별 수치 강조·권고 임계. 발견 탭 표와 동 브리핑 권고가 같은 기준을 쓴다 (단위 %, cr·er는 천명당 건)
export const DONG_THRESHOLDS = { cr: 15, er: 15, unm: 45, one: 55, yth: 35, frn: 10 } as const

// ─── 채널 증가 배율 ────────────────────────────────────────────
// "민원 2.10배·앱 2.97배·채널고정 1.10배"는 마지막 해(부분 연도)를 12개월로 연환산해 첫 완결 연도와 나눈 값이다.
// 문구마다 숫자를 박아 두면 재수출 때 어긋나고, 연환산 기준을 빠뜨리기 쉬워 한 곳에서 계산해 basis까지 같이 돌려준다.
export interface ChannelGrowth {
  baseYear: string
  lastYear: string
  lastMonth: number
  annualized: boolean // 마지막 해가 부분 연도라 ×12/lastMonth 로 환산했는가
  basis: string // "2026년 1~8월 연환산 대비 2024년" 같은 한 줄 기준
  total: number // 민원 전체
  app: number // 앱(서울스마트불편신고)
  fixed: number // 채널고정(120·직접)
  fines: number // 과태료 부과 전체(위반일시 기준)
  // 적발 경로별. 과태료의 대부분(신고 유래)은 신고 성향과 무관하지 않다. 순찰(수시) 적발만 신고와 독립
  finesPatrol: number // 순찰(수시) 적발
  finesReported: number // 신고 유래 적발
  patrolSharePct: number // 순찰 적발 비중(전 기간, %)
}

export function channelGrowth(data: DumpingMapData): ChannelGrowth {
  const period = periodOf(data.yearly.complaintsMonthly)
  const years = Object.keys(data.yearly.complaints).sort()
  const baseYear = years[0]
  const lastYear = period.lastYear
  const factor = period.lastMonth < 12 ? 12 / period.lastMonth : 1
  const ch = data.decision.channels.yearly
  const at = (o: Record<string, number> | undefined, y: string) => o?.[y] ?? 0
  const ratio = (last: number, base: number) => (base > 0 ? Math.round((last * factor) / base * 100) / 100 : NaN)
  const fixedOf = (y: string) => at(ch.c120, y) + at(ch.direct, y)
  const route = data.decision.fines.byRoute?.yearly ?? {}
  const patrolAll = sumValues(route["수시"] ?? {})
  const reportedAll = sumValues(route["신고"] ?? {})
  return {
    baseYear,
    lastYear,
    lastMonth: period.lastMonth,
    annualized: factor !== 1,
    basis:
      factor !== 1
        ? `${lastYear}년 1~${period.lastMonth}월을 12개월로 연환산해 ${baseYear}년과 비교`
        : `${lastYear}년 대비 ${baseYear}년`,
    total: ratio(at(data.yearly.complaints, lastYear), at(data.yearly.complaints, baseYear)),
    app: ratio(at(ch.app, lastYear), at(ch.app, baseYear)),
    fixed: ratio(fixedOf(lastYear), fixedOf(baseYear)),
    fines: ratio(at(data.yearly.enforcement, lastYear), at(data.yearly.enforcement, baseYear)),
    finesPatrol: ratio(at(route["수시"], lastYear), at(route["수시"], baseYear)),
    finesReported: ratio(at(route["신고"], lastYear), at(route["신고"], baseYear)),
    patrolSharePct: patrolAll + reportedAll > 0 ? Math.round((patrolAll / (patrolAll + reportedAll)) * 100) : NaN,
  }
}

// 최근 월 과태료 우측 절단. 위반→부과 처리 지연으로 마지막 달들은 과소 집계된다. 문장은 한 곳에서
export function finesCensorNote(data: DumpingMapData): string {
  const p = periodOf(data.decision.fines.monthly)
  return `과태료는 위반일시 기준이라 ${ym(p.to)} 등 최근 2~3개월은 부과 처리 지연으로 과소 집계될 수 있습니다`
}

// 네 요인(다가구·단독 밀집·1인세대·청년·외국인) 공선성 범위. claim-collinear 문장의 ρ 구간에서 읽는다
export function collinearRange(graph: OntoGraph): string {
  const s = String(graph.nodes.find((n) => n.id === "claim-collinear")?.props.statement ?? "")
  const m = /ρ\s*([\d.]+)\s*~\s*([\d.]+)/.exec(s)
  return m ? `${m[1]}~${m[2]}` : "0.85~0.97"
}

// 문장에 박혀 있던 표본 크기. 그래프·데이터에서 읽는다
export function sampleSizes(data: DumpingMapData, graph: OntoGraph): { gridN: number; ledgerRows: number; dongN: number } {
  const unmEdge = graph.edges.find((e) => e.f === "con-unmanaged" && e.props?.beta !== undefined)
  const gridN = Number(unmEdge?.props?.n ?? data.decision.regressionV2?.v2_100.n ?? data.grid.length)
  const ledgerRows = Number(graph.nodes.find((n) => n.id === "ds-ledger")?.props.rows ?? NaN)
  return { gridN, ledgerRows, dongN: data.dong.length }
}

// "2.10배" / "0.53배". 배율 표기 한 곳
export function fmtRatio(r: number): string {
  return Number.isFinite(r) ? `${r.toFixed(2)}배` : "미산출"
}

// ─── 8라운드(2026-09-13 출품 재검토) 파생값 ────────────────────────
// 앱 민원의 계단. 한 달 배율이 가장 큰 달(직전 달 20건 이상만). 서울 전체 청소 신고의 같은 달 배율을 같이 준다.
// "앱 보급 효과"가 점진적 확산이 아니라 한 달 계단이면 그 달의 사건(캠페인·제도·연계)을 특정해야 한다
export interface AppStep {
  month: string // "2026-03"
  prev: string // "2026-02"
  from: number
  to: number
  ratio: number
  seoulRatio: number | null // 서울 스마트불편신고 청소 분야 같은 달 배율
}

export function appStep(data: DumpingMapData): AppStep | null {
  const app = data.decision.channels.monthly.app ?? {}
  const keys = Object.keys(app).sort()
  let best: AppStep | null = null
  for (let i = 1; i < keys.length; i++) {
    const from = app[keys[i - 1]] ?? 0
    const to = app[keys[i]] ?? 0
    if (from < 20) continue
    const ratio = to / from
    if (!best || ratio > best.ratio) best = { month: keys[i], prev: keys[i - 1], from, to, ratio: Math.round(ratio * 100) / 100, seoulRatio: null }
  }
  if (!best || best.ratio < 2) return null
  const sm = data.decision.seoul?.smartReport.monthly ?? []
  const a = sm.find((m) => m.ym === best!.prev)?.cleaning
  const b = sm.find((m) => m.ym === best!.month)?.cleaning
  if (a && b) best.seoulRatio = Math.round((b / a) * 100) / 100
  return best
}

// 지오코딩 폴백 제외 건수. 지도·핫스팟·상습격자·회귀에서 뺀 기록의 규모. 없으면 null
export function geocodeExcluded(data: DumpingMapData): { complaints: number; enforcement: number; ledger: number; cctvMobile: number } | null {
  const g = data.meta?.geocode
  if (!g) return null
  return {
    complaints: g.complaints?.fallbackExcluded ?? 0,
    enforcement: g.enforcement?.fallbackExcluded ?? 0,
    ledger: g.ledger?.fallbackExcluded ?? 0,
    cctvMobile: g.cctvMobile?.fallbackExcluded ?? 0,
  }
}

// 외부 산출물(데이터팀 배치추천)이 이번 분석의 집중관리 격자·핫스팟 20과 얼마나 겹치는가. 두 산출물이 독립임을 숫자로 보인다
export function binRecoOverlap(data: DumpingMapData, items: [number, number, ...unknown[]][]): { total: number; inCritical: number; inHotspot: number } {
  const crit = data.decision.kpi.criticalCells
  const top = data.decision.hotspots.top
  let inCritical = 0
  let inHotspot = 0
  for (const [lat, lng] of items) {
    if (crit.some((c) => lat >= c[0] && lat < c[2] && lng >= c[1] && lng < c[3])) inCritical++
    if (top.some((h) => Math.abs(h[0] - lat) < 0.00046 && Math.abs(h[1] - lng) < 0.00058)) inHotspot++
  }
  return { total: items.length, inCritical, inHotspot }
}

// 처리 소요의 연도 변화. 마지막 두 해(마지막 해는 부분 연도)
export interface SlaShift {
  prevYear: string
  lastYear: string
  prev: { medianH: number; p90H: number; within3dPct: number; n: number }
  last: { medianH: number; p90H: number; within3dPct: number; n: number }
  slower: boolean // 상위 10% 소요가 길어졌고 3일 내 처리 비율이 떨어졌다
}

export function slaShift(data: DumpingMapData): SlaShift | null {
  const years = Object.keys(data.decision.sla.byYear).sort()
  if (years.length < 2) return null
  const prevYear = years[years.length - 2]
  const lastYear = years[years.length - 1]
  const prev = data.decision.sla.byYear[prevYear]
  const last = data.decision.sla.byYear[lastYear]
  return { prevYear, lastYear, prev, last, slower: last.p90H > prev.p90H && last.within3dPct < prev.within3dPct }
}

// 과태료가 늘었나 줄었나. 문장 조립용 (배율 1 미만이면 감소)
export function finesDirection(g: ChannelGrowth): "줄었" | "늘었" | "비슷했" {
  if (!Number.isFinite(g.fines)) return "비슷했"
  if (g.fines < 0.9) return "줄었"
  if (g.fines > 1.1) return "늘었"
  return "비슷했"
}
