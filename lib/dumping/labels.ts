// 온톨로지 표시용 한글 라벨 사전 — 그래프·패널이 공유한다.
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
  Claim: "검증된 주장",
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
}

export function propLabel(k: string): string {
  return PROP_KO[k] ?? k
}

// 통계 용어 쉬운 풀이 — 해당 키가 화면에 있을 때만 노출
export const PROP_HELP: Record<string, string> = {
  coefficient: "β(베타): 0보다 크면 이 요인이 많은 곳일수록 무단투기도 많다는 뜻. 숫자가 클수록 영향이 크다.",
  beta: "β(베타): 0보다 크면 이 요인이 많은 곳일수록 무단투기도 많다는 뜻. 음수면 반대.",
  p_value: "p값: 이런 결과가 순전히 우연으로 나올 확률. 0.05보다 작으면 우연이라 보기 어렵다.",
  p: "p값: 이런 결과가 순전히 우연으로 나올 확률. 0.05보다 작으면 우연이라 보기 어렵다.",
  confidence: "신뢰도: 분석팀이 이 내용을 얼마나 확신하는지. 1에 가까울수록 확신.",
  rho: "상관 ρ(로): 두 값이 같이 움직이는 정도. 1에 가까울수록 거의 붙어 다닌다.",
  did: "DID: 설치한 곳과 안 한 곳의 전후 변화 차이. 0이면 효과가 없다는 뜻.",
  did_symmetric: "대칭 DID: 비교 조건을 양쪽에 똑같이 걸어 다시 잰 값. 여기선 효과가 사라졌다.",
  t: "t값: 0에서 멀수록 우연이 아닐 가능성이 크다.",
  n: "표본: 분석에 쓴 데이터 개수.",
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
