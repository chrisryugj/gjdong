import { NextResponse, type NextRequest } from "next/server"

const ALLOWED_ORIGINS = ["https://gjdong.vercel.app", "http://localhost:3000"]

export function proxy(request: NextRequest) {
  if (!request.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.next()
  }

  const origin = request.headers.get("origin") || ""
  // 확장 허용은 주소변환 API용 — 암호 게이트 뒤의 /api/dumping은 어떤 확장에서도 부를 일이 없다
  const isExtension =
    !request.nextUrl.pathname.startsWith("/api/dumping/") &&
    (origin.startsWith("chrome-extension://") || origin.startsWith("moz-extension://"))
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

// 프록시는 CDN 캐시 앞에서 돈다 — 캐시 히트여도 함수가 매번 깨어난다. 인파레이더·광진 라이프는
// same-origin GET 폴링뿐이라 여기서 통과만 시키고 끝나므로, 폴링 경로는 매처에서 뺀다.
// (2026-08 Fluid Active CPU 초과 당시 gjdong 함수 호출의 54%가 이 미들웨어였다.)
// CORS가 실제로 필요한 건 크롬 확장이 부르는 resolve-address 계열이다.
export const config = {
  matcher: "/api/((?!crowd|gwangjin).*)",
}
