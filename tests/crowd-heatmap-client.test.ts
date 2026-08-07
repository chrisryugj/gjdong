import assert from "node:assert/strict"
import test from "node:test"
import { patternLevel, type HeatEntry } from "../lib/crowd/heatmap-client"

// 시간대 렌즈·상세 히트맵이 공유하는 평균 등급 산출 — 반올림·클램프·무표본 경계를 고정한다.

const entry = (sum: number, cnt: number): HeatEntry => ({
  sum: [[sum]],
  cnt: [[cnt]],
})

test("patternLevel: 평균 반올림 경계 (1.4→1, 1.5→2)", () => {
  assert.equal(patternLevel(entry(14, 10), 0, 0), 1)
  assert.equal(patternLevel(entry(15, 10), 0, 0), 2)
})

test("patternLevel: 1~4 클램프 — 수집 이상값이 섞여도 등급 밖으로 안 나간다", () => {
  assert.equal(patternLevel(entry(60, 10), 0, 0), 4)
  assert.equal(patternLevel(entry(1, 10), 0, 0), 1)
})

test("patternLevel: 표본 없음(cnt=0)·엔트리 없음·행 누락은 전부 0", () => {
  assert.equal(patternLevel(entry(0, 0), 0, 0), 0)
  assert.equal(patternLevel(null, 0, 0), 0)
  assert.equal(patternLevel(undefined, 0, 0), 0)
  assert.equal(patternLevel(entry(10, 5), 3, 7), 0) // 없는 요일·시각 칸
})
