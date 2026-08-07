// 붐빔 전환 감지 — 순수 로직 (테스트 대상). 알림 발화·권한은 use-crowd-alerts 훅이 담당.
//
// 원칙: 상향 "전환"만 발화한다. 이미 붐빔인 지점은 감시 시작 시점에 비무장으로 씨딩해
// 조용히 넘어가고(켜자마자 알림 폭탄 방지), 임계 미만으로 내려오면 재무장한다.
// 등급이 경계에서 진동해도 지점별 쿨다운이 재발화를 막는다.

/** 재발화 쿨다운 — 폴링 5분 주기 기준 3회 연속 진동까지 흡수 */
export const ALERT_COOLDOWN_MS = 15 * 60_000

/** 기본 임계 — 붐빔(4) 도달 시 발화 */
export const ALERT_THRESHOLD = 4

export interface AlertState {
  /** 지점별 무장 여부 — 미등록 지점은 다음 관측에서 현재 상태 기준으로 씨딩된다 */
  armed: Map<string, boolean>
  lastFired: Map<string, number>
}

export function initAlertState(): AlertState {
  return { armed: new Map(), lastFired: new Map() }
}

/** 폴링 스냅샷 1회분을 관측하고 발화할 지점명을 돌려준다 (state는 제자리 갱신) */
export function detectTransitions(
  state: AlertState,
  spots: Array<{ name: string; levelNum: number }>,
  watch: Set<string>,
  now: number,
  thresholdNum: number = ALERT_THRESHOLD,
): string[] {
  const fire: string[] = []
  for (const s of spots) {
    if (!watch.has(s.name)) continue
    const above = s.levelNum >= thresholdNum
    const wasArmed = state.armed.get(s.name)
    if (wasArmed === undefined) {
      // 첫 관측 = 씨딩 — 이미 임계 이상이면 비무장으로 시작 (전환이 아니므로 발화 없음)
      state.armed.set(s.name, !above)
      continue
    }
    if (above && wasArmed) {
      const last = state.lastFired.get(s.name) ?? 0
      if (now - last >= ALERT_COOLDOWN_MS) {
        fire.push(s.name)
        state.lastFired.set(s.name, now)
      }
      state.armed.set(s.name, false)
    } else if (!above) {
      state.armed.set(s.name, true)
    }
  }
  return fire
}
