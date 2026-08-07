import { type NextRequest, NextResponse } from "next/server"
import { fetchSpotExtra } from "@/lib/crowd/seoul-rtd"
import { fetchBusanExtra } from "@/lib/crowd/busan"
import { fetchGangwonExtra } from "@/lib/crowd/gangwon"
import { fetchIncheonExtra } from "@/lib/crowd/incheon"

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
    const city = request.nextUrl.searchParams.get("city")
    const extra =
      city === "busan"
        ? await fetchBusanExtra(spot)
        : city === "gangwon"
          ? await fetchGangwonExtra(spot)
          : city === "incheon"
            ? await fetchIncheonExtra(spot)
            : await fetchSpotExtra(spot)
    return NextResponse.json(extra, { headers: CACHE_HEADERS })
  } catch (error) {
    console.error("[crowd/extra] API error:", error instanceof Error ? error.message : "Unknown error")
    return NextResponse.json({ error: "부가 정보를 불러오지 못했습니다." }, { status: 502 })
  }
}
