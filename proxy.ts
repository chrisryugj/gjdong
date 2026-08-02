import { NextResponse, type NextRequest } from "next/server"

const ALLOWED_ORIGINS = ["https://gjdong.vercel.app", "http://localhost:3000"]

export function proxy(request: NextRequest) {
  if (!request.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.next()
  }

  const origin = request.headers.get("origin") || ""
  const isExtension = origin.startsWith("chrome-extension://") || origin.startsWith("moz-extension://")
  // 브라우저는 same-origin GET에 Origin 헤더를 싣지 않는다 — GET/HEAD는 Origin 부재 시 통과
  const isSameOriginGet = origin === "" && (request.method === "GET" || request.method === "HEAD")
  const isAllowed = ALLOWED_ORIGINS.includes(origin) || isExtension || isSameOriginGet

  if (!isAllowed) {
    return new NextResponse(JSON.stringify({ error: "Forbidden" }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    })
  }

  if (request.method === "OPTIONS") {
    return new NextResponse(null, {
      status: 204,
      headers: corsHeaders(origin),
    })
  }

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
