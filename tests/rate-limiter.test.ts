import assert from "node:assert/strict"
import test from "node:test"
import { checkRateLimit } from "../lib/utils/rate-limiter"

test("blocks requests after the single-address limit is reached", () => {
  const ip = `single-${Date.now()}`

  for (let i = 0; i < 30; i += 1) {
    assert.equal(checkRateLimit(ip, "single").allowed, true)
  }

  assert.equal(checkRateLimit(ip, "single").allowed, false)
})

test("tracks rate limits independently by request type", () => {
  const ip = `mixed-${Date.now()}`

  assert.equal(checkRateLimit(ip, "single").allowed, true)
  assert.equal(checkRateLimit(ip, "batch").allowed, true)
  assert.equal(checkRateLimit(ip, "geocode").allowed, true)
})
