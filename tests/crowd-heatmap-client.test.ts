import assert from "node:assert/strict"
import test from "node:test"
import { baselineDelta, patternLevel, type HeatEntry } from "../lib/crowd/heatmap-client"

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

// ── baselineDelta (지금 vs 평소) — ±1h 합산·임계 2·경계를 고정한다

/** hour 인덱스별 (sum, cnt) 쌍으로 하루짜리 엔트리 구성 */
const dayEntry = (cells: Record<number, [number, number]>): HeatEntry => {
  const sum = Array.from({ length: 24 }, () => 0)
  const cnt = Array.from({ length: 24 }, () => 0)
  for (const [h, [s, c]] of Object.entries(cells)) {
    sum[Number(h)] = s
    cnt[Number(h)] = c
  }
  return { sum: [sum], cnt: [cnt] }
}

test("baselineDelta: ±1h 표본 합산으로 임계 2를 넘긴다 (당시각 1회 + 인접 1회)", () => {
  const e = dayEntry({ 9: [1, 1], 10: [1, 1] }) // 평균 1
  assert.equal(baselineDelta(e, 3, 0, 10), "above")
  assert.equal(baselineDelta(e, 1, 0, 10), "usual")
})

test("baselineDelta: 합산 표본 2 미만이면 판단하지 않는다", () => {
  const e = dayEntry({ 10: [4, 1] })
  assert.equal(baselineDelta(e, 4, 0, 10), null)
  assert.equal(baselineDelta(dayEntry({}), 2, 0, 10), null)
})

test("baselineDelta: 인접 시간대는 ±1h까지만 — 2시간 밖 표본은 모수에 안 들어간다", () => {
  const e = dayEntry({ 8: [1, 1], 10: [1, 1] }) // 12시 기준 둘 다 2시간 밖
  assert.equal(baselineDelta(e, 4, 0, 12), null)
})

test("baselineDelta: 자정 경계는 같은 요일 안에서만 (0시는 -1h 없음, 23시는 +1h 없음)", () => {
  const e = dayEntry({ 0: [1, 1], 1: [1, 1], 22: [4, 1], 23: [4, 1] })
  assert.equal(baselineDelta(e, 3, 0, 0), "above") // 0·1시만 합산(평균 1), 23시 불참
  assert.equal(baselineDelta(e, 1, 0, 23), "below") // 22·23시만 합산(평균 4), 0시 불참
})

test("baselineDelta: 등급 없음(levelNum 0)·엔트리 없음은 null", () => {
  assert.equal(baselineDelta(dayEntry({ 10: [2, 2] }), 0, 0, 10), null)
  assert.equal(baselineDelta(null, 3, 0, 10), null)
  assert.equal(baselineDelta(undefined, 3, 0, 10), null)
})
