import assert from "node:assert/strict"
import test from "node:test"
import { createSnapshot, emptyDetailFields, LV_BY_N, meanRoadLv, parkRatioLv, toNum } from "../lib/crowd/adapter-kit"

// busan·gangwon에서 추출한 공통 임계 — 값이 바뀌면 두 도시 등급이 동시에 바뀐다.

test("parkRatioLv 경계: 0.6/0.8/0.95 재차율", () => {
  assert.equal(parkRatioLv(0.59), 1)
  assert.equal(parkRatioLv(0.6), 2)
  assert.equal(parkRatioLv(0.79), 2)
  assert.equal(parkRatioLv(0.8), 3)
  assert.equal(parkRatioLv(0.94), 3)
  assert.equal(parkRatioLv(0.95), 4)
  assert.equal(parkRatioLv(1), 4)
})

test("meanRoadLv: 평균 반올림 후 1~3 클램프, 빈 배열은 0(축 없음)", () => {
  assert.equal(meanRoadLv([]), 0)
  assert.equal(meanRoadLv([1, 1, 1]), 1)
  assert.equal(meanRoadLv([2, 3]), 3) // 2.5 → round 3
  assert.equal(meanRoadLv([1, 2]), 2) // 1.5 → round 2
  assert.equal(meanRoadLv([3, 3, 3]), 3)
})

test("toNum: 비수치는 0", () => {
  assert.equal(toNum("12.5"), 12.5)
  assert.equal(toNum(null), 0)
  assert.equal(toNum("abc"), 0)
  assert.equal(toNum(""), 0)
})

test("LV_BY_N: 등급 라벨 순서 고정 (i18n 사전 키와 결합돼 있다)", () => {
  assert.deepEqual(LV_BY_N, ["", "여유", "보통", "약간 붐빔", "붐빔"])
})

test("emptyDetailFields: 인파 원천 없는 도시의 상세 골격", () => {
  const f = emptyDetailFields()
  assert.equal(f.nowIndex, -1)
  assert.deepEqual(f.series, [])
  assert.deepEqual(f.gender, { male: 0, female: 0 })
  assert.deepEqual(f.trend.hour1, { rate: "", dir: "" })
})

test("createSnapshot: TTL 내 재사용·동시 호출 단일화·실패는 캐시하지 않음", async () => {
  let calls = 0
  let fail = false
  const snap = createSnapshot(10_000, async () => {
    calls += 1
    if (fail) throw new Error("boom")
    return calls
  })

  // 동시 호출은 로더를 한 번만 태운다
  const [a, b] = await Promise.all([snap.get(), snap.get()])
  assert.equal(a, 1)
  assert.equal(b, 1)
  assert.equal(calls, 1)

  // TTL 내 재호출은 캐시
  assert.equal(await snap.get(), 1)
  assert.equal(calls, 1)

  // 실패는 캐시되지 않고 다음 호출이 재시도한다
  const failing = createSnapshot(10_000, async () => {
    calls += 1
    if (fail) throw new Error("boom")
    return calls
  })
  fail = true
  await assert.rejects(failing.get())
  fail = false
  assert.equal(typeof (await failing.get()), "number")
})
