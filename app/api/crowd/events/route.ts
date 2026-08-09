import { type NextRequest, NextResponse } from "next/server"
import { fetchTourEvents } from "@/lib/crowd/events"
import { CITY_CAPS, isCityId, type CityId } from "@/lib/crowd/cities"

export const dynamic = "force-dynamic"

// 원천이 6시간 스냅샷 — 엣지도 1시간 캐시
const CACHE = { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=3600" }

export async function GET(request: NextRequest) {
  const cityRaw = request.nextUrl.searchParams.get("city")
  const city: CityId = isCityId(cityRaw) ? cityRaw : "seoul"
  if (!CITY_CAPS[city].tourEvents) {
    return NextResponse.json({ error: `${city}는 TourAPI 행사 레이어가 없습니다` }, { status: 400 })
  }
  return NextResponse.json({ events: await fetchTourEvents(city) }, { headers: CACHE })
}
