import { createHmac, timingSafeEqual } from "crypto"
import type { NextRequest } from "next/server"

export const AUTH_COOKIE = "gj_dump_auth"

// 비밀번호 자체는 환경변수에만 둔다. 쿠키에는 HMAC만 실린다.
// 키는 DUMPING_COOKIE_SECRET(없으면 비밀번호로 폴백). 무키 sha256(v1)은 오프라인 추측이 가능해 v2로 올렸다.
// 키를 바꾸면 발급된 쿠키가 전부 무효가 된다. 강제 로그아웃 수단으로 쓴다.
function secret(): string | null {
  return process.env.DUMPING_COOKIE_SECRET || process.env.DUMPING_PASSWORD || null
}

export function tokenFor(password: string): string | null {
  const key = secret()
  if (!key) return null
  return createHmac("sha256", key).update(`gjdong-dumping-v2|${password}`).digest("hex")
}

function expectedToken(): string | null {
  const pw = process.env.DUMPING_PASSWORD
  if (!pw) return null
  return tokenFor(pw)
}

export function verifyPassword(password: string): boolean {
  const expected = expectedToken()
  const given = tokenFor(password)
  if (!expected || !given) return false
  return safeEqual(given, expected)
}

export function verifyRequest(request: NextRequest): boolean {
  const expected = expectedToken()
  if (!expected) return false
  const cookie = request.cookies.get(AUTH_COOKIE)?.value
  if (!cookie) return false
  return safeEqual(cookie, expected)
}

function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a)
  const bb = Buffer.from(b)
  if (ba.length !== bb.length) return false
  return timingSafeEqual(ba, bb)
}
