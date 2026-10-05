import assert from "node:assert/strict"
import test from "node:test"
import {
  createSnapshot,
  emptyDetailFields,
  LV_BY_N,
  meanRoadLv,
  parkRatioLv,
  settleSnapshotRefreshes,
  toNum,
} from "../lib/crowd/adapter-kit"

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

// ── createSnapshot stale-while-revalidate (가짜 시계 + 손으로 끝내는 로더) ──

function deferredLoader() {
  const calls: Array<{ resolve: (v: number) => void; reject: (e: Error) => void }> = []
  const load = () =>
    new Promise<number>((resolve, reject) => {
      calls.push({ resolve, reject })
    })
  return { calls, load }
}

const tick = () => new Promise<void>((r) => setImmediate(r))

test("createSnapshot SWR: 신선→캐시, 만료→즉시 묵은 값 + 백그라운드 갱신 1회(동시 요청도 1회)", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: 0 })
  const { calls, load } = deferredLoader()
  const snap = createSnapshot(10_000, load)

  const first = snap.get()
  calls[0].resolve(1)
  assert.equal(await first, 1)

  t.mock.timers.setTime(9_999) // TTL 안 — 로더를 안 탄다
  assert.equal(await snap.get(), 1)
  assert.equal(calls.length, 1)

  t.mock.timers.setTime(12_000) // TTL 지남·상한(20초) 안 — 묵은 값 즉시, 갱신은 동시 요청 셋이어도 1회
  assert.deepEqual(await Promise.all([snap.get(), snap.get(), snap.get()]), [1, 1, 1])
  assert.equal(calls.length, 2)

  calls[1].resolve(2)
  await settleSnapshotRefreshes()
  assert.equal(await snap.get(), 2) // 갱신분이 새 기준(12초 시작)으로 신선
  assert.equal(calls.length, 2)
})

test("createSnapshot SWR: 갱신 실패 시 묵은 값 유지, 다음 요청이 재시도", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: 0 })
  const { calls, load } = deferredLoader()
  const snap = createSnapshot(10_000, load)
  const first = snap.get()
  calls[0].resolve(1)
  await first

  t.mock.timers.setTime(15_000)
  assert.equal(await snap.get(), 1)
  calls[1].reject(new Error("원천 장애"))
  await settleSnapshotRefreshes()
  await tick()

  assert.equal(await snap.get(), 1) // 실패는 캐시하지 않는다 — 묵은 값 + 재시도
  assert.equal(calls.length, 3)
  calls[2].resolve(3)
  await settleSnapshotRefreshes()
  assert.equal(await snap.get(), 3)
})

test("createSnapshot SWR: 상한(TTL×2)을 넘긴 값은 버리고 새 로드를 기다린다", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: 0 })
  const { calls, load } = deferredLoader()
  const snap = createSnapshot(10_000, load)
  const first = snap.get()
  calls[0].resolve(1)
  await first

  t.mock.timers.setTime(20_000)
  let settled = false
  const waiting = snap.get().then((v) => {
    settled = true
    return v
  })
  await tick()
  assert.equal(settled, false) // 묵은 1을 주지 않고 기다린다
  calls[1].resolve(2)
  assert.equal(await waiting, 2)
})

test("createSnapshot SWR: 60초 넘게 안 끝나는 갱신은 죽은 것으로 보고 새로 띄우며, 늦게 끝난 옛 로드는 새 값을 덮지 않는다", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: 0 })
  const { calls, load } = deferredLoader()
  const snap = createSnapshot(60_000, load)
  const first = snap.get()
  calls[0].resolve(1)
  await first

  t.mock.timers.setTime(61_000)
  assert.equal(await snap.get(), 1) // 백그라운드 갱신 시작(얼어붙었다고 가정)
  assert.equal(calls.length, 2)

  t.mock.timers.setTime(119_000) // 아직 상한(120초) 안·갱신 시작 58초 — 진행 중으로 본다
  assert.equal(await snap.get(), 1)
  assert.equal(calls.length, 2)

  t.mock.timers.setTime(121_500) // 상한 넘김 + 갱신 시작 60.5초 — 죽은 갱신 대신 새로 띄우고 기다린다
  const waiting = snap.get()
  assert.equal(calls.length, 3)
  calls[2].resolve(3)
  assert.equal(await waiting, 3)

  calls[1].resolve(2) // 옛 로드가 뒤늦게 끝나도 새 값 유지
  await tick()
  assert.equal(await snap.get(), 3)
})
