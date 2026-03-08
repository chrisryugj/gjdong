import assert from "node:assert/strict"
import test from "node:test"
import { resolveAddress } from "../lib/utils/kakao-api"

const originalFetch = globalThis.fetch
const originalApiKey = process.env.KAKAO_REST_API_KEY

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  })

test.afterEach(() => {
  globalThis.fetch = originalFetch
  if (originalApiKey === undefined) {
    delete process.env.KAKAO_REST_API_KEY
  } else {
    process.env.KAKAO_REST_API_KEY = originalApiKey
  }
})

test("falls back to the original input when reverse geocoding is unavailable", async () => {
  process.env.KAKAO_REST_API_KEY = "test-key"

  let callCount = 0
  globalThis.fetch = (async () => {
    callCount += 1

    if (callCount === 1) {
      return jsonResponse({
        documents: [
          {
            x: "127.0845",
            y: "37.5384",
          },
        ],
      })
    }

    return jsonResponse({ documents: [] })
  }) as typeof fetch

  const result = await resolveAddress("서울시 테스트 123")

  assert.equal(result.fallback, true)
  assert.equal(result.display, "서울시 테스트 123")
  assert.equal(result.meta.source, "KAKAO")
  assert.equal(result.meta.lat, 37.5384)
  assert.equal(result.meta.lon, 127.0845)
  assert.match(result.message ?? "", /상세 주소/)
  assert.equal(callCount, 3)
})
