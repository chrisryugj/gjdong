import { type NextRequest, NextResponse } from "next/server"
import { ADAPTERS } from "@/lib/crowd/adapters"
import { isCityId, type CityId } from "@/lib/crowd/cities"

export const dynamic = "force-dynamic"

// 상세 첫 페인트를 막지 않도록 부가정보(사고·주차·행사·도로·따릉이)는 별도 지연 로드
const CACHE_HEADERS = {
  "Cache-Control": "public, s-maxage=120, stale-while-revalidate=180",
}

export async function GET(request: NextRequest) {
  const spot = request.nextUrl.searchParams.get("spot")
  if (!spot || spot.length > 60) {
    return NextResponse.json({ error: "Invalid spot name" }, { status: 400 })
  }

  try {
    const cityRaw = request.nextUrl.searchParams.get("city")
    const city: CityId = isCityId(cityRaw) ? cityRaw : "seoul"
    // fetchExtra 부재 도시(제주)는 종전처럼 서울 폴백 — UI는 CITY_CAPS.extra 가드로 호출하지 않는다
    const fetchExtra = ADAPTERS[city].fetchExtra ?? ADAPTERS.seoul.fetchExtra
    const extra = await fetchExtra!(spot)
    return NextResponse.json(extra, { headers: CACHE_HEADERS })
  } catch (error) {
    console.error("[crowd/extra] API error:", error instanceof Error ? error.message : "Unknown error")
    return NextResponse.json({ error: "부가 정보를 불러오지 못했습니다." }, { status: 502 })
  }
}
