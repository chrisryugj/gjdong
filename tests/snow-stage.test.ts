import { test } from "node:test"
import assert from "node:assert"
import { inSnowSeason, MOBILIZED, ordinanceDeadline, stageForSnow } from "../lib/snow/stage"

test("적설 예보 → 서울시 단계: 0 평시 · 0.5 보강 · 3 1단계 · 5 2단계 · 12 3단계", () => {
  assert.strictEqual(stageForSnow(0).id, "calm")
  assert.strictEqual(stageForSnow(0.5).id, "stage-0")
  assert.strictEqual(stageForSnow(3).id, "stage-1")
  assert.strictEqual(stageForSnow(4.99).id, "stage-1")
  assert.strictEqual(stageForSnow(5).id, "stage-2")
  assert.strictEqual(stageForSnow(12).id, "stage-3")
  assert.strictEqual(stageForSnow(Number.NaN).id, "calm")
})

test("특보는 예보와 별개로 단계를 올린다: 주의보=2단계, 경보=3단계, 예보가 더 높으면 예보", () => {
  assert.strictEqual(stageForSnow(0, "advisory").id, "stage-2")
  assert.strictEqual(stageForSnow(0, "warning").id, "stage-3")
  assert.strictEqual(stageForSnow(12, "advisory").id, "stage-3")
  assert.strictEqual(stageForSnow(3, "none").id, "stage-1")
})

test("제설대책기간은 11월 15일부터 3월 15일까지", () => {
  assert.ok(inSnowSeason(new Date(2026, 10, 15)))
  assert.ok(inSnowSeason(new Date(2026, 0, 3)))
  assert.ok(inSnowSeason(new Date(2026, 2, 15)))
  assert.ok(!inSnowSeason(new Date(2026, 2, 16)))
  assert.ok(!inSnowSeason(new Date(2026, 8, 20)))
  assert.ok(!inSnowSeason(new Date(2026, 10, 14)))
})

test("단계 동원 목록은 누적이다", () => {
  const order = ["calm", "stage-0", "stage-1", "stage-2", "stage-3"] as const
  for (let i = 1; i < order.length; i++) for (const x of MOBILIZED[order[i - 1]]) assert.ok(MOBILIZED[order[i]].includes(x), `${order[i]}에 ${x} 없음`)
})

test("조례 제5조 시한: 주간 4시간 · 야간 익일 11시 · 10cm 이상 24시간", () => {
  const day = ordinanceDeadline(new Date(2026, 0, 10, 9, 30), 3)
  assert.strictEqual(day.rule, "day4h")
  assert.strictEqual(day.due.getHours(), 13)
  assert.strictEqual(day.due.getMinutes(), 30)

  const night = ordinanceDeadline(new Date(2026, 0, 10, 22, 0), 3)
  assert.strictEqual(night.rule, "night11")
  assert.strictEqual(night.due.getDate(), 11)
  assert.strictEqual(night.due.getHours(), 11)

  const dawn = ordinanceDeadline(new Date(2026, 0, 10, 3, 0), 3) // 새벽에 그침: 같은 날 11시
  assert.strictEqual(dawn.rule, "night11")
  assert.strictEqual(dawn.due.getDate(), 10)
  assert.strictEqual(dawn.due.getHours(), 11)

  const heavy = ordinanceDeadline(new Date(2026, 0, 10, 9, 30), 10)
  assert.strictEqual(heavy.rule, "heavy24h")
  assert.strictEqual(heavy.due.getDate(), 11)
  assert.strictEqual(heavy.due.getHours(), 9)
})
