// 온톨로지 표시용 한글 라벨 사전. 그래프·패널이 공유한다.
// 데이터(graph.json)의 관계·속성 키는 원문(영문)을 유지하고 표시만 바꾼다.

export const REL_KO: Record<string, string> = {
  supports: "근거가 됨",
  contradicts: "반박함",
  predicts: "예측함",
  lowers: "낮추려는 수단",
  affects: "영향 줌",
  influences: "영향 줌",
  related_to: "관련 있음",
  part_of: "일부임",
  contains: "포함함",
  manages: "관리함",
  owns: "운영함",
  describes: "설명함",
  classifies: "분류 기준임",
  constrains: "줄이는 방향 연관",
  contributes_to: "늘리는 방향 연관",
  degrades: "악화시킴",
  derived_from: "이 데이터에서 나옴",
  governed_by: "실행 근거 법령",
  exemplifies: "사례임",
  mentions: "언급함",
  restricts: "제한함",
  stabilizes: "굳어지게 함",
  governs: "운용 규칙을 정함",
  operationalizes: "격자 수준 정의임",
}

export function relLabel(rel: string): string {
  return REL_KO[rel] ?? rel
}

// 노드 타입(Entity·Dataset 등 영문)을 쉬운 한글로
export const TYPE_KO: Record<string, string> = {
  Org: "기관",
  Team: "부서",
  Dataset: "데이터",
  Evidence: "증거",
  Class: "분석단위",
  Concept: "요인·개념",
  Entity: "대상",
  Topic: "이론",
  Claim: "주장", // 상태(범위 한정·철회·정정)는 노드 속성 배지로. "검증된"을 타입 이름에 넣으면 철회 주장도 검증된 것으로 읽힌다
  Covariate: "분석 변수",
  KPI: "결과지표",
  Risk: "위험도",
  Lever: "개입수단",
  Policy: "법령·정책",
}

export function typeLabel(t: string): string {
  return TYPE_KO[t] ?? t
}

export const PROP_KO: Record<string, string> = {
  statement: "주장",
  summary: "요약",
  confidence: "신뢰도",
  coefficient: "표준화 β",
  p_value: "p값",
  variable: "원 변수명",
  definition: "정의",
  unit: "단위",
  rows: "행 수",
  industry: "구분",
  domain: "출처",
  category: "분류",
  severity: "심각도",
  probability: "확률",
  beta: "β",
  note: "노트",
  t: "t값",
  p: "p값",
  n: "표본",
  dep: "종속변수",
  rho: "상관 ρ",
  level: "분석 수준",
  model: "모형",
  did: "DID 계수",
  did_symmetric: "대칭 DID",
  window: "관측 창",
  status: "검증 상태",
  design: "설계",
  cost: "비용",
  rationale: "근거 논리",
  size: "인원",
  retracted: "철회 사유",
  source: "출처",
  asof: "기준 시점",
  derived_by: "산출 스크립트",
  erratum: "정오표",
  label_initial: "초기 라벨",
  refit: "재적합",
}

export function propLabel(k: string): string {
  return PROP_KO[k] ?? k
}

// 통계 용어 쉬운 풀이. 해당 키가 화면에 있을 때만 노출
export const PROP_HELP: Record<string, string> = {
  coefficient: "β(베타): 0보다 크면 이 조건이 큰 곳일수록 무단투기도 많다는 뜻입니다. 숫자가 클수록 영향이 큽니다.",
  beta: "β(베타): 0보다 크면 이 조건이 큰 곳일수록 무단투기도 많다는 뜻입니다. 음수면 반대입니다.",
  p_value: "p값: 연관이 없다고 가정했을 때 이만한 차이가 나올 가능성입니다. 0.05보다 작으면 이번 분석에서 연관이 확인된 것으로 봅니다. 원인을 뜻하지는 않습니다.",
  p: "p값: 연관이 없다고 가정했을 때 이만한 차이가 나올 가능성입니다. 0.05보다 작으면 이번 분석에서 연관이 확인된 것으로 봅니다. 원인을 뜻하지는 않습니다.",
  confidence: "신뢰도: 분석팀이 이 내용을 얼마나 확신하는지 나타냅니다. 1에 가까울수록 확신이 큽니다.",
  rho: "상관 ρ(로): 두 값이 함께 움직이는 정도입니다. 1에 가까울수록 거의 붙어 다닙니다.",
  did: "DID: 설치한 곳과 하지 않은 곳의 전후 변화를 비교한 차이입니다. 0이면 효과가 없다는 뜻입니다.",
  did_symmetric: "대칭 DID: 비교 조건을 양쪽에 똑같이 걸어 다시 잰 값입니다. 여기서는 효과가 사라졌습니다.",
  t: "t값: 0에서 멀수록 연관이 확인될 가능성이 큽니다.",
  n: "표본: 분석에 쓴 데이터 개수입니다.",
}

export function helpForKeys(keys: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const k of keys) {
    const h = PROP_HELP[k]
    if (h && !seen.has(h)) {
      seen.add(h)
      out.push(h)
    }
  }
  return out
}

// ── 지도 모드 상수(12라운드). map-controls(툴바·범례)와 dumping-map(그리기)이 같이 쓴다. dumping-map이 map-controls를
//    import하면 순환이라 여기 둔다
import type { WeatherKey } from "./types"
export type DongMode = "total" | "channel" | "year"
export const DONG_MODE_LABEL: Record<DongMode, string> = { total: "합계", channel: "채널", year: "연도" }
// 채널 스택 색. 민원 파랑 계열 안에서 진하기로 구분(앱이 가장 많아 진하게)
export const CHANNEL_DEF = {
  app: { label: "앱 신고", front: "#2f5aa8", side: "#1d3f78", top: "#6b93d6" },
  c120: { label: "120", front: "#6b93d6", side: "#4a6fb0", top: "#a9c1ea" },
  direct: { label: "직접", front: "#b7c8ea", side: "#8fa6d1", top: "#dbe4f5" },
} as const
export const WEATHER_DEF: Record<WeatherKey, { label: string; short: string; color: string }> = {
  hot: { label: "더운 날(일평균 25도 이상)", short: "더움", color: "#c2410c" },
  mild: { label: "온화한 날(5~25도)", short: "온화", color: "#0e7490" },
  cold: { label: "추운 날(5도 미만)", short: "추움", color: "#1d4ed8" },
  rain: { label: "비 오는 날(일강수 1mm 이상)", short: "비", color: "#0369a1" },
}
