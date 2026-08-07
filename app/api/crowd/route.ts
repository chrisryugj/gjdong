import { type NextRequest, NextResponse } from "next/server"
import { ADAPTERS } from "@/lib/crowd/adapters"
import { isCityId, type CityId } from "@/lib/crowd/cities"

export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  const spot = request.nextUrl.searchParams.get("spot")
  const cityRaw = request.nextUrl.searchParams.get("city")
  const city: CityId = isCityId(cityRaw) ? cityRaw : "seoul"
  const adapter = ADAPTERS[city]

  try {
    if (spot) {
      if (spot.length > 60) {
        return NextResponse.json({ error: "Invalid spot name" }, { status: 400 })
      }
      return NextResponse.json(await adapter.fetchDetail(spot), { headers: adapter.cacheHeaders })
    }

    // 재난문자는 전 명소 공통이라 목록 응답에 실어 대시보드 배너로 노출 (원천이 있는 도시만)
    const [spots, disaster] = await Promise.all([
      adapter.fetchSpots(),
      adapter.fetchDisaster ? adapter.fetchDisaster().catch(() => []) : Promise.resolve([]),
    ])
    return NextResponse.json(
      { spots, disaster, updatedAt: new Date().toISOString() },
      { headers: adapter.cacheHeaders },
    )
  } catch (error) {
    console.error("[crowd] API error:", error instanceof Error ? error.message : "Unknown error")
    return NextResponse.json({ error: "실시간 데이터를 불러오지 못했습니다." }, { status: 502 })
  }
}
