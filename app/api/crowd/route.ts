import { type NextRequest, NextResponse } from "next/server"
import { fetchAllSpots, fetchDisasterToday, fetchSpotDetail } from "@/lib/crowd/seoul-rtd"

export const dynamic = "force-dynamic"

// 서울시 데이터가 5분 주기 갱신이므로 엣지 캐시 2분 + SWR 3분
const CACHE_HEADERS = {
  "Cache-Control": "public, s-maxage=120, stale-while-revalidate=180",
}

export async function GET(request: NextRequest) {
  const spot = request.nextUrl.searchParams.get("spot")

  try {
    if (spot) {
      if (spot.length > 60) {
        return NextResponse.json({ error: "Invalid spot name" }, { status: 400 })
      }
      const detail = await fetchSpotDetail(spot)
      return NextResponse.json(detail, { headers: CACHE_HEADERS })
    }

    // 재난문자는 전 명소 공통이라 목록 응답에 실어 대시보드 배너로 노출
    const [spots, disaster] = await Promise.all([
      fetchAllSpots(),
      fetchDisasterToday().catch(() => []),
    ])
    return NextResponse.json(
      { spots, disaster, updatedAt: new Date().toISOString() },
      { headers: CACHE_HEADERS },
    )
  } catch (error) {
    console.error("[crowd] API error:", error instanceof Error ? error.message : "Unknown error")
    return NextResponse.json({ error: "서울시 실시간 데이터를 불러오지 못했습니다." }, { status: 502 })
  }
}
