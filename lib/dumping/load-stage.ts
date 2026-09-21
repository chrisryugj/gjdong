// 로딩 커튼 4단계(자료·지도 바탕·건물 결합·시설 아이콘)의 진행 단계(dumping-dashboard.tsx).
// 각 단계는 독립 플래그로 받고, 앞에서부터 연속으로 채워진 수가 진행 단계다. 시설 아이콘(동적 import 뒤 곧바로 알림)이
// 첫 idle(건물 결합)보다 먼저 와도 3단계를 완료로 덮지 않는다(독립 리뷰 F5). 4 = 전부 준비. 그때만 정상 완료로 커튼을 걷는다
export const LOAD_STEPS = ["data", "map", "idle", "icons"] as const
export type LoadReady = Record<(typeof LOAD_STEPS)[number], boolean>
export const LOAD_NONE: LoadReady = { data: false, map: false, idle: false, icons: false }

export function loadStageOf(r: LoadReady): number {
  const i = LOAD_STEPS.findIndex((k) => !r[k])
  return i < 0 ? LOAD_STEPS.length : i
}
