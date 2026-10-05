import assert from "node:assert/strict"
import test from "node:test"
import { deriveLevel, sleepBase } from "../lib/crowd/jeju"

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

// ── 잠든 인구 바닥(2026-10-05): 생활인구 총량엔 그 일대 거주민이 늘 깔려 있어(동문시장 새벽 3시 12,926명 ·
// 하루 최대 15,141명) 바닥을 빼지 않으면 리듬비율이 하루 종일 0.85를 넘어 24시간 '붐빔'이 된다(프로덕션 실측).

test("거주민 바닥: 새벽 3시 동문시장은 여유, 저녁 피크는 붐빔 (프로덕션 2026-10-05 값)", () => {
  assert.equal(deriveLevel(12926, 15141, 0.5, 12960), "여유")
  assert.equal(deriveLevel(15141, 15141, 0.5, 12960), "붐빔")
})

test("거주민 바닥: 지금이 바닥보다 낮으면 음수가 아니라 여유", () => {
  assert.equal(deriveLevel(12804, 15195, 0.5, 14718), "여유")
})

test("거주민 바닥: 바닥을 뺀 활동 인구로 밀도 상한을 건다", () => {
  // r=0.5km(0.785km²), 활동 인구 100 → 127명/km² → cap 2(보통). 총량 밀도로는 cap 4였다
  assert.equal(deriveLevel(13060, 13060, 0.5, 12960), "보통")
})

test("sleepBase: 3·4·5시 평균, 그 시각이 없으면 최솟값, 빈 시계열은 0", () => {
  const series = [
    { h: 2, v: 90 },
    { h: 3, v: 10 },
    { h: 4, v: 20 },
    { h: 5, v: 30 },
    { h: 14, v: 5 },
  ]
  assert.equal(sleepBase(series), 20)
  assert.equal(
    sleepBase([
      { h: 12, v: 40 },
      { h: 13, v: 25 },
    ]),
    25,
  )
  assert.equal(sleepBase([]), 0)
})
