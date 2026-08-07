import assert from "node:assert/strict"
import test from "node:test"
import { deriveLevel } from "../lib/crowd/jeju"

// 특성화 테스트 — 제주 등급 파생(리듬비율×밀도상한)의 현재 동작을 스펙으로 고정한다.
// 임계값이 바뀌면 사용자에게 다른 등급이 나가는 것이므로 의도적 변경일 때만 기대값을 고친다.

test("리듬비율 경계: 0.85 이상 붐빔, 미만 약간 붐빔 (밀도 상한 미개입 조건)", () => {
  // r=0.5km → 면적 0.785km², now=850 → 밀도 1,082명/km² ≥ 800 → cap=4 (비개입)
  assert.equal(deriveLevel(850, 1000, 0.5), "붐빔")
  assert.equal(deriveLevel(849, 1000, 0.5), "약간 붐빔")
})

test("리듬비율 경계: 0.6 / 0.35", () => {
  assert.equal(deriveLevel(600, 1000, 0.5), "약간 붐빔")
  assert.equal(deriveLevel(599, 1000, 0.5), "보통")
  assert.equal(deriveLevel(350, 1000, 0.5), "보통")
  assert.equal(deriveLevel(349, 1000, 0.5), "여유")
})

test("밀도 상한: 넓은 반경의 자기 피크는 밀도가 낮으면 등급이 캡된다 (우도 r=2.6km 시나리오)", () => {
  // now=rhythmMax=1000 → 리듬비율 1.0(붐빔감)이지만 밀도 47명/km² < 60 → 여유로 캡
  assert.equal(deriveLevel(1000, 1000, 2.6), "여유")
})

test("밀도 상한 경계: 60/250/800 명/km²", () => {
  // r=1km → 면적 π≈3.1416km². 리듬비율은 1.0으로 고정해 밀도 축만 본다.
  assert.equal(deriveLevel(188, 188, 1), "여유") // 59.8 < 60 → cap 1
  assert.equal(deriveLevel(189, 189, 1), "보통") // 60.2 → cap 2
  assert.equal(deriveLevel(785, 785, 1), "보통") // 249.9 < 250 → cap 2
  assert.equal(deriveLevel(786, 786, 1), "약간 붐빔") // 250.2 → cap 3
  assert.equal(deriveLevel(2513, 2513, 1), "약간 붐빔") // 799.9 < 800 → cap 3
  assert.equal(deriveLevel(2514, 2514, 1), "붐빔") // 800.2 → cap 4
})

test("rhythmMax=0 가드: 0으로 나누지 않고 여유가 된다", () => {
  assert.equal(deriveLevel(0, 0, 1), "여유")
})
