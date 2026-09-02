import { NextResponse, type NextRequest } from "next/server"
import { AUTH_COOKIE, tokenFor, verifyPassword, verifyRequest } from "@/lib/dumping/auth"
import { checkRateLimit, getClientIp } from "@/lib/utils/rate-limiter"

export const runtime = "nodejs"

// 로그인 상태 확인
export async function GET(request: NextRequest) {
  return NextResponse.json({ ok: verifyRequest(request) })
}

// 비밀번호 검증 → 인증 쿠키 발급
export async function POST(request: NextRequest) {
  // 짧은 숫자 비밀번호라 무제한 시도를 두면 몇 분 안에 뚫린다 — IP당 분당 10회
  if (!checkRateLimit(getClientIp(request.headers), "dumpingAuth").allowed) {
    return NextResponse.json(
      { ok: false, error: "시도가 너무 많습니다. 1분 뒤 다시 시도해 주세요" },
      { status: 429, headers: { "Retry-After": "60" } },
    )
  }

  let password = ""
  try {
    const body = await request.json()
    password = typeof body?.password === "string" ? body.password : ""
  } catch {
    // fallthrough
  }

  const token = tokenFor(password)
  if (!process.env.DUMPING_PASSWORD || !token) {
    return NextResponse.json({ ok: false, error: "서버에 비밀번호가 설정되지 않았습니다" }, { status: 500 })
  }
  if (!verifyPassword(password)) {
    return NextResponse.json({ ok: false, error: "비밀번호가 틀렸습니다" }, { status: 401 })
  }

  const res = NextResponse.json({ ok: true })
  res.cookies.set(AUTH_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  })
  return res
}
