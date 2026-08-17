// SeoulRtd 재시도 — Actions 러너에서 연결이 잠깐 끊겼다 돌아오는 구간을 버텨야 한다.
// 실패 재현: Crowd Heatmap 32073300178 "SeoulRtd hotspot-category failed: fetch failed"
// (60런 중 4런이 같은 이유로 죽었고, 죽으면 그 3시간 슬롯 수집이 통째로 날아간다)
import assert from "node:assert/strict"
import { test } from "node:test"
import { rtdJson } from "../scripts/rtd-fetch.mjs"

const noSleep = async () => {}
const ok = () => new Response(JSON.stringify({ row: [{ area_nm: "홍대입구역(2호선)" }] }))

/** 앞의 `failures`번은 연결이 끊기고 그 다음부터 정상 응답하는 fetch. */
function flaky(failures: number) {
  let calls = 0
  const impl = async () => {
    calls += 1
    if (calls <= failures) {
      // Node fetch가 연결 실패에 내는 형태 그대로 (cause에 진짜 원인이 들어있다)
      throw Object.assign(new TypeError("fetch failed"), {
        cause: new Error("getaddrinfo EAI_AGAIN data.seoul.go.kr"),
      })
    }
    return ok()
  }
  return { impl, calls: () => calls }
}

function withFetch<T>(impl: typeof fetch, fn: () => Promise<T>): Promise<T> {
  const original = globalThis.fetch
  globalThis.fetch = impl
  return fn().finally(() => {
    globalThis.fetch = original
  })
}

test("연속 4회 끊겼다 돌아오면 수집을 이어간다", async () => {
  const f = flaky(4)
  const json = await withFetch(f.impl as typeof fetch, () =>
    rtdJson("hotspot-category", { page: "1" }, { sleep: noSleep }),
  )
  assert.deepEqual(json, { row: [{ area_nm: "홍대입구역(2호선)" }] })
  assert.equal(f.calls(), 5)
})

test("첫 시도에 성공하면 재시도하지 않는다", async () => {
  const f = flaky(0)
  await withFetch(f.impl as typeof fetch, () =>
    rtdJson("ppltn_congest", { hotspotNm: "홍대입구역(2호선)" }, { sleep: noSleep }),
  )
  assert.equal(f.calls(), 1)
})

test("끝까지 실패하면 cause까지 담아 던진다 — 다음 실패 로그로 진짜 원인을 안다", async () => {
  const f = flaky(Number.POSITIVE_INFINITY)
  await assert.rejects(
    () =>
      withFetch(f.impl as typeof fetch, () =>
        rtdJson("hotspot-category", { page: "1" }, { sleep: noSleep }),
      ),
    (err: Error) => {
      assert.match(err.message, /SeoulRtd hotspot-category failed/)
      assert.match(err.message, /EAI_AGAIN/)
      return true
    },
  )
})

test("백오프는 시도마다 길어진다 — 짧은 blip이 아니라 수십 초 구간도 버틴다", async () => {
  const slept: number[] = []
  const f = flaky(Number.POSITIVE_INFINITY)
  await withFetch(f.impl as typeof fetch, () =>
    rtdJson("hotspot-category", { page: "1" }, { sleep: async (ms: number) => void slept.push(ms) }).catch(
      () => null,
    ),
  )
  assert.ok(slept.length >= 4, `재시도 대기 ${slept.length}회 — 최소 4회여야 한다`)
  assert.ok(
    slept.reduce((a, b) => a + b, 0) >= 20_000,
    `총 대기 ${slept.reduce((a, b) => a + b, 0)}ms — 20초 이상 버텨야 한다`,
  )
})
