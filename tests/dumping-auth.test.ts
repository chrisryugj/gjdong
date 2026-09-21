import assert from "node:assert/strict"
import { test } from "node:test"
import { AUTH_TTL_S, tokenFor, verifyPassword, verifyToken } from "../lib/dumping/auth"

// 인증 쿠키 토큰(독립 리뷰 F2): 쿠키 maxAge와 별개로 서버가 만료 시각을 서명·검증한다.
// 시험용 환경변수만 쓴다. 실제 운영 쿠키·비밀번호는 쓰지 않는다
process.env.DUMPING_PASSWORD = "test-pw-1234"
process.env.DUMPING_COOKIE_SECRET = "test-secret"

const T0 = Date.UTC(2026, 8, 21, 0, 0, 0)
const DAY = 86_400_000

test("발급 토큰은 만료 직전까지 통과하고 만료 뒤에는 같은 토큰을 다시 보내도 거부된다", () => {
  const token = tokenFor("test-pw-1234", T0)!
  assert.ok(token)
  assert.equal(verifyToken(token, T0), true)
  assert.equal(verifyToken(token, T0 + AUTH_TTL_S * 1000 - 1000), true)
  assert.equal(verifyToken(token, T0 + AUTH_TTL_S * 1000 + 1000), false)
  assert.equal(verifyToken(token, T0 + 366 * DAY), false)
})

test("만료 시각을 늘려 적거나 서명이 다르면 거부된다", () => {
  const token = tokenFor("test-pw-1234", T0)!
  const [exp, sig] = token.split(".")
  assert.equal(verifyToken(`${Number(exp) + 86_400}.${sig}`, T0), false)
  assert.equal(verifyToken(`${exp}.${"0".repeat(sig.length)}`, T0), false)
  assert.equal(verifyToken(`${exp}.${sig}x`, T0), false)
  assert.equal(verifyToken(undefined, T0), false)
  assert.equal(verifyToken("", T0), false)
  assert.equal(verifyToken("garbage", T0), false)
  // 옛 형식(v2, 만료 없는 고정 HMAC)은 통과하지 않는다
  assert.equal(verifyToken("a".repeat(64), T0), false)
})

test("틀린 비밀번호로 만든 토큰과 키 회전 뒤의 토큰은 거부된다", () => {
  assert.equal(verifyToken(tokenFor("wrong", T0)!, T0), false)
  const before = tokenFor("test-pw-1234", T0)!
  process.env.DUMPING_COOKIE_SECRET = "rotated"
  assert.equal(verifyToken(before, T0), false)
  assert.equal(verifyToken(tokenFor("test-pw-1234", T0)!, T0), true)
  process.env.DUMPING_COOKIE_SECRET = "test-secret"
})

test("비밀번호 검증은 그대로", () => {
  assert.equal(verifyPassword("test-pw-1234"), true)
  assert.equal(verifyPassword("test-pw-12345"), false)
  assert.equal(verifyPassword(""), false)
})
