// /snow 그래프의 한글 표시명. 관계·클래스·속성 키를 화면 말로

export const REL_KO: Record<string, string> = {
  manages: "관리",
  owns: "보유",
  operates: "운영",
  contains: "포함",
  derived_from: "결합 산출",
  supports: "뒷받침",
  describes: "서술",
  targets: "대상",
  lowers: "낮추려 함",
  raises: "위험 높임",
  operationalizes: "대신 측정",
  covers: "배치",
  assigned: "담당",
  within: "소속",
  exemplifies: "실체",
  mobilizes: "동원",
  escalates_to: "격상",
  defines: "정함",
  triggers: "발동 입력",
  delegates: "위임",
  obligates: "의무 부과",
  basis: "근거",
  governs: "해석 규칙",
}
export const relLabel = (rel: string) => REL_KO[rel] ?? rel

export const TYPE_KO: Record<string, string> = {
  Org: "기관·주체",
  Team: "부서",
  Dataset: "데이터셋",
  Evidence: "관측",
  Concept: "취약요인",
  Claim: "판단",
  KPI: "목표지표",
  Lever: "대응자원",
  Policy: "법령·기준",
  Stage: "대응 단계",
  Area: "행정동",
  Zone: "담당 구역",
  Entity: "취약구간",
}
export const typeLabel = (t: string) => TYPE_KO[t] ?? t

export const PROP_KO: Record<string, string> = {
  name: "이름",
  role: "역할",
  rows: "행 수",
  source: "출처",
  asof: "기준일",
  derived_by: "산출",
  confidence: "신뢰도",
  note: "비고",
  def: "정의",
  gist: "요지",
  unit: "단위",
  count: "개소",
  length_m: "연장(m)",
  bags: "포",
  kind: "구분",
  holder: "보유 주체",
  measurable: "측정 가능",
  law: "법령",
  article: "조문",
  efYd: "시행일",
  enacted: "제정일",
  dept: "소관",
  day_hours: "주간 시한(시간)",
  night_until: "야간 시한",
  heavy_cm: "폭설 기준(cm)",
  heavy_hours: "폭설 시한(시간)",
  scope_m: "범위(m)",
  from: "시작",
  to: "종료",
  order: "순서",
  threshold_cm: "적설 임계(cm)",
  until_cm: "상한(cm)",
  heatSeg: "열선 구간",
  heatM: "열선 연장(m)",
  salt: "제설함",
  cacl: "염화칼슘함",
  sand: "모래주머니 지점",
  sandBags: "모래주머니 포",
  status: "상태",
  unimog: "유니목",
  dump15t: "15톤 덤프",
  squads: "실무반",
  phys_m: "도로 길이(m)",
  proxy: "구역 정본",
  basis: "근거",
  center_name: "동주민센터",
  weak: "적설취약구간",
  weakNoHeat: "열선 없는 취약구간",
  weakGap: "자원 공백 취약구간",
  ice: "상습결빙구간",
  schools: "초등학교",
  type: "유형",
  cls: "도로 구분",
  km: "총길이(km)",
  dong: "행정동",
  agency: "관리청",
  heat_near_m: "가장 가까운 열선(m)",
  materials_near: "100m 안 자재",
  gap: "자원 공백",
  request: "확보 방법",
  within_m: "기준 거리(m)",
  heat_id: "열선 번호",
}
export const propLabel = (k: string) => PROP_KO[k] ?? k

// 자원 4종(지도 레이어·범례·동별 표의 정본 순서와 색). 지도 문법: 밤 지도 위에서 열선만 난색(노랑빛 호박), 자재는 차가운 색 2단, 모래주머니는 모래색 테두리.
// color=다크(기본) · colorLight=라이트(인쇄용 보조)
// 3라운드(2026-09-20): 열선 주황 #f0a04b와 취약 벽돌 #e0705a가 다크에서 같은 난색이라 구분이 안 됐다(사용자 지적) → 열선은 노랑 쪽(#ffb703), 취약·결빙은 진홍(#e5484d)으로 갈라 hue 차 40° 이상. tests/snow-copy.test.ts가 단언한다
export const RESOURCES = [
  { id: "heat", label: "도로열선", unit: "구간", color: "#ffb703", colorLight: "#c98a00" },
  { id: "salt", label: "제설함", unit: "개소", color: "#8fa3c0", colorLight: "#3f4f66" },
  { id: "cacl", label: "염화칼슘보관함", unit: "개소", color: "#7cc0e8", colorLight: "#2a7fb0" },
  { id: "sand", label: "모래주머니", unit: "지점", color: "#c9a961", colorLight: "#9a6f1f" },
] as const
// 열선 보조색: 글로우(선 바깥 번짐)·흐름 심선(밝은 점선). 본선은 RESOURCES.heat
export const HEAT_STYLE = {
  glow: { dark: "#ffd166", light: "#e0a92a" },
  flow: { dark: "#fff4d6", light: "#fff7e0" },
} as const
// 취약 층(자원이 아니라 위험). 취약구간·결빙구간은 진홍 하나로 통일하고 선 모양으로 구분한다(실선·점선). 급경사 추정은 별도 보라 점선(추정치라 위험 층과 색을 나눈다).
// casing=선 바깥 어두운 케이싱(도로 위에서 뜨게), badge=번호 배지 후광
export const RISK = {
  weak: { label: "적설취약구간", color: "#e5484d", colorLight: "#b01e33" },
  ice: { label: "상습결빙구간", color: "#e5484d", colorLight: "#b01e33" },
  slope: { label: "지형 경사 추정", color: "#b48ee8", colorLight: "#6d4fb3" },
  school: { label: "초등학교", color: "#ece7dc", colorLight: "#14201c" },
} as const
export const RISK_STYLE = {
  casing: { dark: "#0b1216", light: "#fbf9f3" },
  badge: { dark: "#9f1f24", light: "#7f1a1e" },
  arrow: { dark: "#0b1216", light: "#fbf9f3" }, // 경사 오르막 화살 글리프(선 위 대비색)
} as const
// 관리청별 색(법령·책임 탭 ownerView, 4라운드): 구 관리 = 청빙(화면 액센트) · 시 관리 = 잉크. 위험 색(진홍)은 쓰지 않는다
export const OWNER_STYLE = {
  gu: { label: "구 관리", dark: "#7cc0e8", light: "#2a6f97" },
  si: { label: "시 관리", dark: "#ece7dc", light: "#14201c" },
} as const
