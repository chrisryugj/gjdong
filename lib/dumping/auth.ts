import { createHash, timingSafeEqual } from "crypto"
import type { NextRequest } from "next/server"

export const AUTH_COOKIE = "gj_dump_auth"

// 비밀번호 자체는 환경변수에만 둔다 — 쿠키에는 해시만 실린다
function expectedToken(): string | null {
  const pw = process.env.DUMPING_PASSWORD
  if (!pw) return null
  return createHash("sha256").update(`${pw}|gjdong-dumping-v1`).digest("hex")
}

export function tokenFor(password: string): string {
  return createHash("sha256").update(`${password}|gjdong-dumping-v1`).digest("hex")
}

export function verifyPassword(password: string): boolean {
  const expected = expectedToken()
  if (!expected) return false
  return safeEqual(tokenFor(password), expected)
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
