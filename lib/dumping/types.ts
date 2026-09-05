// /dumping 대시보드 공유 타입 — 데이터 산출은 내부 저장소 gwangjin-dumping(비공개)/scripts/export_dashboard.py

// [s, w, n, e, 민원, 과태료, 무관리주거, 행정동, 생활인구(서울시 250m 격자 → 100m 면적 배분, 2026-07 평균)]
export type GridCell = [number, number, number, number, number, number, number, string, number]

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
  // 서울시 생활인구(행정동, 2024-01~2026-07 시간·일 평균) — 등록인구가 아니라 체류 인구 기준 노출
  lp: number | null // 총 생활인구(내국인)
  lpf: number | null // 장기체류 외국인 생활인구
  crl: number | null // 민원 생활인구 천명당
  erl: number | null // 과태료 생활인구 천명당
}

// [lat, lng, 라벨, 행정동]
export type InfraPoint = [number, number, string, string]

export interface InfraLayers {
  clothBins: InfraPoint[] // 의류수거함 479 (공공데이터포털 15109594, 2026-03)
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
  // 의사결정 레이어 (build_decision_layer.py) — 품목·퍼널·SLA·KPI·핫스팟·전망
  decision: DecisionLayer
  // 내보내기 메타 — 재현 패키지 해시 수(manifest에서), 구청 쓰레기통 장부 고유 위치 수, 원자료 수집일
  meta?: {
    reproduce: { hashes: number; numbers: number; note: string }
    binSites: number
    asof: string
  }
}

// [lat, lng, 점수, 민원180일, 과태료180일, 행정동, 대표주소, 이동식CCTV유무(0/1)]
export type HotspotRow = [number, number, number, number, number, string, string, number]

export interface DecisionLayer {
  asof: string
  fines: {
    categories: { cat: string; n: number; amount: number }[]
    categoryMonthly: Record<string, Record<string, number>>
    funnel: Record<string, { n: number; amount: number }>
    totalN: number
    totalAmount: number
    paidN: number
    paidAmount: number
    arrearsN: number
    arrearsAmount: number
    collectionRatePct: number | null
    monthly: Record<string, number>
    // 적발 경로(원자료 route): 신고 유래 vs 순찰(수시). 과태료의 83%가 신고 유래라 "신고와 무관한 실측"이 아니다.
    // 순찰 적발만 신고 성향과 독립. 최근 월은 부과 처리 지연으로 과소 집계(우측 절단)
    byRoute?: {
      yearly: Record<string, Record<string, number>>
      monthly: Record<string, Record<string, number>>
      byCategory: Record<string, Record<string, number>>
      labels: Record<string, string>
      note: string
    }
  }
  channels: {
    yearly: Record<string, Record<string, number>>
    monthly: Record<string, Record<string, number>>
  }
  sla: {
    byYear: Record<string, { n: number; medianH: number; p90H: number; within3dPct: number }>
    note: string
  }
  kpi: {
    watchCellsNow: number
    criticalCellsNow: number
    criticalCellsNowNoApp: number // 앱 민원 제외(120·직접+과태료) 집중관리 격자 수
    criticalNoAppOverlap: number
    // [s, w, n, e, 12개월 건수, 행정동] — 지도 강조 레이어용 격자 사각형
    criticalCells: [number, number, number, number, number, string][]
    persistentQuarterly: { asof: string; watch: number; critical: number; criticalNoApp?: number }[]
    thresholds?: { months: number; watch: number; critical: number } // 화면 문구 "12개월 10건+"의 원천
    definition: string
  }
  hotspots: {
    top: HotspotRow[]
    backtest: {
      windows: { cutoff: string; precision20: number; capture20: number; randomCapture: number }[]
      avgPrecision20: number | null
      avgCapture20: number | null
      avgRandomCapture: number | null
    }
    method: string
  }
  forecast: {
    series: Record<string, number>
    fc: { m: string; yhat: number; lo: number; hi: number }[]
    backtest: {
      mapePct: number // 롤링 원점(각 달마다 그 이전 자료로만 모수 선택) 1스텝 MAPE
      rmse: number
      window: string
      naiveMapePct?: number // 기준모형 = 전년 동월(계절 나이브)
      maeHw?: number
      maeNaive?: number
      coverage80Pct?: number // 80% 예측구간 경험적 적중률
      rows?: { m: string; y: number; hw: number; naive: number }[]
      note?: string
    }
    note: string
  }
  // 서울시 공개데이터 맥락 (build_seoul_layers.py) — 25구 비교·서울 전체 앱 추세
  seoul?: SeoulContext
  // v2 격자 회귀 (regression_v2.py) — 생활인구 노출·의류수거함 추가, 200m 민감도
  regressionV2?: RegressionV2
  // 구조 전망 — 건축HUB 인허가 파이프라인 (fetch_permits.py, 없으면 null)
  permits: {
    asof: string
    source: string
    window: string
    note: string
    guTotal: {
      inProgress: number
      smallAptPermits12m: number
      smallAptUnits12m: number
      detachedPermits12m: number
    }
    byDong: {
      dong: string
      inProgress: number
      smallAptPermits: number
      smallAptUnits: number
      detached: number
    }[]
  } | null
}

export interface SeoulContext {
  sources: { id: string; name: string; org: string; window: string }[]
  cctv: {
    asof: string
    source: string
    rows: { gu: string; total: number; crime: number; dumping: number }[]
    gwangjin: { gu: string; total: number; crime: number; dumping: number; dumpingRank: number; of: number; dumpingShareOfTotalPct: number }
    seoulDumpingTotal: number
    reportingGus: number
    note: string
  }
  streetBins: {
    source: string
    years: string[]
    gwangjinByYear: number[] | null
    seoulByYear: number[] | null
    gwangjin202511: { rows: number; sites: number }
  }
  smartReport: { monthly: { ym: string; cleaning: number; total: number }[]; cleaningByYear: Record<string, number> }
  livingPopWindow: string
  livingPop250Month: string
}

export interface RegCoef {
  beta: number
  p: number
  p_hc3: number
  nb_beta: number | null
  nb_p: number | null
}

export interface RegressionV2 {
  spec: string
  base100: { n: number; r2: number }
  v2_100: { n: number; r2: number; coef: Record<string, RegCoef> }
  v2_100_complaints: { r2: number; coef: Record<string, RegCoef> }
  v2_200: { n: number; r2: number; coef: Record<string, RegCoef> }
  gridSensitivity: { base: Record<string, boolean>; v2: Record<string, boolean>; note: string }
}

// 조치 대장 (data/dumping/interventions.json — 인증 API /api/dumping/data/interventions 로 서빙)
export interface InterventionEntry {
  id: string
  lever: string
  title: string
  targetCells: string[]
  targetDong: string
  registeredAt: string
  startAt: string
  evalWindowDays: number
  control: string
  successMetric: string
  status: "registered" | "active" | "evaluated" | "abandoned"
  result: string | null
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

export type MapMode = "overlay" | "unm" | "comp" | "enf" | "lp"

// 지도 레이어 분해: 바탕(면)은 하나만, 원(점)은 자유 중첩. lp = 서울시 생활인구(노출)
export type BaseMode = "unm" | "comp" | "enf" | "lp"
export type CircleId = "comp" | "enf"
