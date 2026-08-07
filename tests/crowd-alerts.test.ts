import assert from "node:assert/strict"
import test from "node:test"
import { ALERT_COOLDOWN_MS, detectTransitions, initAlertState } from "../lib/crowd/alerts"

const spots = (lv: Record<string, number>) => Object.entries(lv).map(([name, levelNum]) => ({ name, levelNum }))
const watch = new Set(["명동", "홍대"])
const T0 = 1_000_000_000

test("씨딩: 이미 붐빔인 지점은 켠 직후 발화하지 않는다 (알림 폭탄 방지)", () => {
  const st = initAlertState()
  assert.deepEqual(detectTransitions(st, spots({ 명동: 4, 홍대: 2 }), watch, T0), [])
})

test("상향 전환만 발화하고, 붐빔에 머무는 동안은 재발화하지 않는다", () => {
  const st = initAlertState()
  detectTransitions(st, spots({ 명동: 2, 홍대: 2 }), watch, T0) // 씨딩
  assert.deepEqual(detectTransitions(st, spots({ 명동: 4, 홍대: 2 }), watch, T0 + 1), ["명동"])
  assert.deepEqual(detectTransitions(st, spots({ 명동: 4, 홍대: 2 }), watch, T0 + 2), []) // 유지 = 무발화
})

test("임계 미만으로 내려오면 재무장 — 쿨다운 지난 뒤 다시 발화", () => {
  const st = initAlertState()
  detectTransitions(st, spots({ 명동: 2 }), new Set(["명동"]), T0)
  assert.deepEqual(detectTransitions(st, spots({ 명동: 4 }), new Set(["명동"]), T0 + 1), ["명동"])
  detectTransitions(st, spots({ 명동: 3 }), new Set(["명동"]), T0 + 2) // 하락 = 재무장
  // 쿨다운 안: 재무장됐어도 발화 억제 (경계 진동 흡수)
  assert.deepEqual(detectTransitions(st, spots({ 명동: 4 }), new Set(["명동"]), T0 + 3), [])
  // 쿨다운 후: 하락→재무장→상승이면 다시 발화
  detectTransitions(st, spots({ 명동: 2 }), new Set(["명동"]), T0 + ALERT_COOLDOWN_MS)
  assert.deepEqual(detectTransitions(st, spots({ 명동: 4 }), new Set(["명동"]), T0 + ALERT_COOLDOWN_MS + 1), ["명동"])
})

test("감시 목록 밖 지점은 무시, 새로 감시에 든 지점은 씨딩부터", () => {
  const st = initAlertState()
  detectTransitions(st, spots({ 명동: 2, 강남: 2 }), new Set(["명동"]), T0)
  // 강남이 붐빔이 됐지만 감시 밖 → 무시
  assert.deepEqual(detectTransitions(st, spots({ 명동: 2, 강남: 4 }), new Set(["명동"]), T0 + 1), [])
  // 강남을 감시에 추가 — 이미 붐빔이므로 씨딩(무발화), 이후 하락→상승에만 반응
  assert.deepEqual(detectTransitions(st, spots({ 명동: 2, 강남: 4 }), new Set(["명동", "강남"]), T0 + 2), [])
  detectTransitions(st, spots({ 명동: 2, 강남: 2 }), new Set(["명동", "강남"]), T0 + 3)
  assert.deepEqual(detectTransitions(st, spots({ 명동: 2, 강남: 4 }), new Set(["명동", "강남"]), T0 + 4), ["강남"])
})

test("정보 없음(levelNum 0) 지점은 발화하지 않는다", () => {
  const st = initAlertState()
  detectTransitions(st, spots({ 속초해변: 0 }), new Set(["속초해변"]), T0)
  assert.deepEqual(detectTransitions(st, spots({ 속초해변: 0 }), new Set(["속초해변"]), T0 + 1), [])
})
