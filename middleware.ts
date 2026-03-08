import { NextResponse, type NextRequest } from "next/server"

const ALLOWED_ORIGINS = ["https://gjdong.vercel.app", "http://localhost:3000"]

export function middleware(request: NextRequest) {
  // API 경로만 CORS 처리
  if (!request.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.next()
  }

  const origin = request.headers.get("origin") || ""

  // 특정 Chrome 익스텐션 ID만 허용 (env 설정 시)
  const extensionId = process.env.CHROME_EXTENSION_ID
  const isExtensionAllowed = extensionId ? origin === `chrome-extension://${extensionId}` : false
  const isAllowed = ALLOWED_ORIGINS.includes(origin) || isExtensionAllowed

  // 비허용 origin 처리
  if (!isAllowed) {
    if (request.method === "OPTIONS") {
      return new NextResponse(null, { status: 403 })
    }
    // CORS 헤더 없이 응답 (브라우저가 차단)
    return NextResponse.next()
  }

  // OPTIONS 프리플라이트 요청 처리
  if (request.method === "OPTIONS") {
    return new NextResponse(null, {
      status: 204,
      headers: corsHeaders(origin),
    })
  }

  // 응답에 CORS 헤더 추가
  const response = NextResponse.next()
  for (const [key, value] of Object.entries(corsHeaders(origin))) {
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
