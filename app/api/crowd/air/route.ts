import { type NextRequest, NextResponse } from "next/server"
import { fetchAir } from "@/lib/crowd/air"
import { isCityId, type CityId } from "@/lib/crowd/cities"

export const dynamic = "force-dynamic"
// 에어코리아 원천이 10초를 넘기는 일이 잦다 — Vercel 기본 10초로는 재시도 전에 함수가 죽는다
export const maxDuration = 30

// 시도당 1콜 15분 스냅샷 위 얹힌 조회라 엣지 캐시도 넉넉히
const CACHE = { "Cache-Control": "public, s-maxage=600, stale-while-revalidate=900" }

export async function GET(request: NextRequest) {
  const spot = request.nextUrl.searchParams.get("spot") ?? ""
  const cityRaw = request.nextUrl.searchParams.get("city")
  const city: CityId = isCityId(cityRaw) ? cityRaw : "seoul"
  if (!spot || spot.length > 60) {
    return NextResponse.json({ error: "Invalid spot name" }, { status: 400 })
  }
  // 실패·미승인 키는 null — 클라이언트는 섹션을 그리지 않는다
  const air = await fetchAir(city, spot).catch(() => null)
  return NextResponse.json({ air }, { headers: CACHE })
}
