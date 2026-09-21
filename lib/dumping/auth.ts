import { createHmac, timingSafeEqual } from "crypto"
import type { NextRequest } from "next/server"

export const AUTH_COOKIE = "gj_dump_auth"
export const AUTH_TTL_S = 60 * 60 * 24 * 30 // 쿠키 maxAge = 서버 검증 만료(같은 값 하나)

// 비밀번호 자체는 환경변수에만 둔다. 쿠키에는 "만료시각(초).HMAC"만 실린다.
// 키는 DUMPING_COOKIE_SECRET(없으면 비밀번호로 폴백). 무키 sha256(v1)은 오프라인 추측이 가능해 v2로 올렸고,
// v3(독립 리뷰 F2)는 만료 시각을 서명에 묶는다: 브라우저가 쿠키를 지운 뒤 확보해 둔 값을 수동 재전송해도 서버가 거부한다.
// 키를 바꾸면 발급된 쿠키가 전부 무효가 된다. 강제 로그아웃 수단으로 쓴다.
function secret(): string | null {
  return process.env.DUMPING_COOKIE_SECRET || process.env.DUMPING_PASSWORD || null
}

function sign(key: string, exp: number, password: string): string {
  return createHmac("sha256", key).update(`gjdong-dumping-v3|${exp}|${password}`).digest("hex")
}

export function tokenFor(password: string, now = Date.now()): string | null {
  const key = secret()
  if (!key) return null
  const exp = Math.floor(now / 1000) + AUTH_TTL_S
  return `${exp}.${sign(key, exp, password)}`
}

export function verifyPassword(password: string): boolean {
  const key = secret()
  const pw = process.env.DUMPING_PASSWORD
  if (!key || !pw) return false
  return safeEqual(sign(key, 0, password), sign(key, 0, pw))
}

// 토큰의 만료 시각이 지나지 않았고, 그 만료 시각과 비밀번호로 다시 만든 서명이 같아야 통과
export function verifyToken(token: string | undefined, now = Date.now()): boolean {
  const key = secret()
  const pw = process.env.DUMPING_PASSWORD
  if (!key || !pw || !token) return false
  const dot = token.indexOf(".")
  if (dot < 0) return false
  const exp = Number(token.slice(0, dot))
  if (!Number.isInteger(exp) || exp * 1000 <= now) return false
  return safeEqual(token.slice(dot + 1), sign(key, exp, pw))
}

export function verifyRequest(request: NextRequest): boolean {
  return verifyToken(request.cookies.get(AUTH_COOKIE)?.value)
}

function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a)
  const bb = Buffer.from(b)
  if (ba.length !== bb.length) return false
  return timingSafeEqual(ba, bb)
}
