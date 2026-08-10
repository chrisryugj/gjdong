import { type NextRequest, NextResponse } from "next/server"
import { fetchDongPattern } from "@/lib/gwangjin/life"
import { DONG_CODES } from "@/lib/gwangjin/constants"

export const dynamic = "force-dynamic"

// 생활인구는 일배치(약 열흘 지연) — 반나절 캐시
const CACHE_HEADERS = { "Cache-Control": "public, s-maxage=43200, stale-while-revalidate=43200" }

export async function GET(request: NextRequest) {
  const dong = request.nextUrl.searchParams.get("dong") ?? ""
  if (!DONG_CODES.some((d) => d.code === dong)) {
    return NextResponse.json({ error: "Invalid dong code" }, { status: 400 })
  }
  const pattern = await fetchDongPattern(dong)
  if (pattern === null) return NextResponse.json({ needKey: "seoul" }, { headers: CACHE_HEADERS })
  return NextResponse.json(pattern, { headers: CACHE_HEADERS })
}
