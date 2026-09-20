// 서울시 강설 대응 단계와 광진구 조례 제설 시한. 순수 함수라 tests/snow-stage.test.ts가 검증한다.
// 단계 기준 출처: 서울시 보도자료 2026-02-01 "평시 · 보강(1cm 미만 예보) · 1단계(5cm 미만) · 2단계(5cm 이상 또는 대설주의보) · 3단계(10cm 이상 또는 대설경보)".
// 2라운드(2026-09-20): 기상청 기상특보 API(WthrWrnInfoService, 활용신청 완료)로 대설주의보·경보를 받아 예보 적설과 함께 판정한다. 둘 중 높은 단계

export type StageId = "calm" | "stage-0" | "stage-1" | "stage-2" | "stage-3"

export interface StageDef {
  id: StageId
  order: number
  label: string
  cond: string
  gist: string
}

export const STAGES: StageDef[] = [
  { id: "calm", order: -1, label: "평시", cond: "적설 예보 없음", gist: "대책기간 중 상황실이 감시합니다. 열선·살포기는 기온 조건으로 자동 가동합니다" },
  { id: "stage-0", order: 0, label: "보강", cond: "적설 1cm 미만 예보", gist: "상황실을 보강 근무하고 취약구간을 사전 점검합니다" },
  { id: "stage-1", order: 1, label: "1단계", cond: "적설 5cm 미만 예보", gist: "제설제를 사전 살포하고 취약구간·다중이용 구간에 인력을 배치합니다" },
  { id: "stage-2", order: 2, label: "2단계", cond: "적설 5cm 이상 예보 또는 대설주의보", gist: "전 장비와 인력을 투입합니다. 간선도로는 장비로 밀어내고 이면도로는 자재를 살포합니다" },
  { id: "stage-3", order: 3, label: "3단계", cond: "적설 10cm 이상 예보 또는 대설경보", gist: "전 직원과 민관협력을 총동원하고 서울시에 지원을 요청합니다" },
]

// 예보 적설(cm, 앞으로 24시간 합)과 특보(대설주의보=advisory·대설경보=warning)로 단계를 정한다. 둘 중 높은 쪽. 둘 다 없으면 평시
export type WarningLevel = "none" | "advisory" | "warning"
export function stageForSnow(cm: number, warning: WarningLevel = "none"): StageDef {
  let bySnow = STAGES[0]
  if (cm > 0) bySnow = cm < 1 ? STAGES[1] : cm < 5 ? STAGES[2] : cm < 10 ? STAGES[3] : STAGES[4]
  const byWarn = warning === "warning" ? STAGES[4] : warning === "advisory" ? STAGES[3] : STAGES[0]
  return byWarn.order > bySnow.order ? byWarn : bySnow
}
// 제설대책기간(11월 15일 ~ 3월 15일) 안인가. 밖이면 화면 기본을 시나리오 모드로
export function inSnowSeason(d: Date): boolean {
  const m = d.getMonth() + 1
  const day = d.getDate()
  if (m === 11) return day >= 15
  if (m === 3) return day <= 15
  return m === 12 || m === 1 || m === 2
}

// 단계가 동원하는 자원 id(graph.json의 mobilizes 엣지와 같은 목록. 그래프가 정본이고 여기는 지도 레이어 기본값용)
export const MOBILIZED: Record<StageId, string[]> = {
  calm: ["lev-heat", "lev-sprayer"],
  "stage-0": ["lev-heat", "lev-sprayer"],
  "stage-1": ["lev-heat", "lev-sprayer", "lev-salt", "lev-cacl", "lev-sand", "lev-staff"],
  "stage-2": ["lev-heat", "lev-sprayer", "lev-salt", "lev-cacl", "lev-sand", "lev-staff", "lev-fleet", "lev-owner"],
  "stage-3": ["lev-heat", "lev-sprayer", "lev-salt", "lev-cacl", "lev-sand", "lev-staff", "lev-fleet", "lev-owner", "lev-civic"],
}

// 광진구 건축물관리자의 제설·제빙에 관한 조례 제5조 제1항:
//   보도·이면도로·보행자전용도로에 내린 눈은 눈이 그친 때로부터 주간은 4시간 이내, 야간은 다음 날 오전 11시까지.
//   다만 1일 내린 눈의 양이 10cm 이상이면 눈이 그친 때로부터 24시간 이내.
// 조례는 주간·야간의 시각을 정하지 않는다. 여기서는 07:00~19:00을 주간으로 둔다(가정. 화면에도 적는다)
export const DAY_START = 7
export const DAY_END = 19

export interface Deadline {
  due: Date
  rule: "day4h" | "night11" | "heavy24h"
  text: string
}

export function ordinanceDeadline(snowEnd: Date, dailySnowCm: number): Deadline {
  if (dailySnowCm >= 10) {
    const due = new Date(snowEnd.getTime() + 24 * 3600 * 1000)
    return { due, rule: "heavy24h", text: "1일 적설 10cm 이상: 그친 때로부터 24시간 이내" }
  }
  const h = snowEnd.getHours()
  if (h >= DAY_START && h < DAY_END) {
    const due = new Date(snowEnd.getTime() + 4 * 3600 * 1000)
    return { due, rule: "day4h", text: "주간(07~19시)에 그침: 4시간 이내" }
  }
  const due = new Date(snowEnd)
  if (h >= DAY_END) due.setDate(due.getDate() + 1)
  due.setHours(11, 0, 0, 0)
  return { due, rule: "night11", text: "야간에 그침: 다음 날 오전 11시까지" }
}

export const fmtHM = (d: Date) => `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`
