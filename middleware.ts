import { NextResponse, type NextRequest } from "next/server"

const ALLOWED_ORIGINS = [
  "https://gjdong.vercel.app",
  "http://localhost:3000",
]

export function middleware(request: NextRequest) {
  // API 경로만 CORS 처리
  if (!request.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.next()
  }

  const origin = request.headers.get("origin") || ""
  const isAllowed = ALLOWED_ORIGINS.includes(origin) || origin.startsWith("chrome-extension://")
  const allowOrigin = isAllowed ? origin : ALLOWED_ORIGINS[0]

  // OPTIONS 프리플라이트 요청 처리
  if (request.method === "OPTIONS") {
    return new NextResponse(null, {
      status: 204,
      headers: corsHeaders(allowOrigin),
    })
  }

  // 응답에 CORS 헤더 추가
  const response = NextResponse.next()
  for (const [key, value] of Object.entries(corsHeaders(allowOrigin))) {
    response.headers.set(key, value)
  }
  return response
}

function corsHeaders(origin: string): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
  }
}

export const config = {
  matcher: "/api/:path*",
}
