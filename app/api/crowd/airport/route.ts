import { type NextRequest, NextResponse } from "next/server"
import {
  BUS_AREAS,
  fetchAirportBoard,
  fetchArexTimetables,
  fetchBusDetail,
  fetchBusRoutes,
  fetchInoutForecast,
} from "@/lib/crowd/incheon-airport"
import { fetchParking } from "@/lib/crowd/incheon"

export const dynamic = "force-dynamic"

// 인천공항 실황 보드 — 기본: 도착편+택시+주차. ?busArea=/-?routeId=는 버스 목록·시간표 (정적이라 길게 캐시)
const LIVE_HEADERS = { "Cache-Control": "public, s-maxage=120, stale-while-revalidate=180" }
const BUS_HEADERS = { "Cache-Control": "public, s-maxage=21600, stale-while-revalidate=3600" }

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams
  try {
    const routeId = sp.get("routeId")
    if (routeId) {
      const detail = await fetchBusDetail(routeId)
      if (!detail) return NextResponse.json({ error: "노선을 찾지 못했습니다." }, { status: 404 })
      return NextResponse.json(detail, { headers: BUS_HEADERS })
    }
    const area = sp.get("busArea")
    if (area) {
      if (!BUS_AREAS.some((a) => a.id === area)) {
        return NextResponse.json({ error: "Invalid area" }, { status: 400 })
      }
      return NextResponse.json({ routes: await fetchBusRoutes(area) }, { headers: BUS_HEADERS })
    }
    if (sp.get("arex") != null) {
      return NextResponse.json(await fetchArexTimetables(), { headers: BUS_HEADERS })
    }
    const [board, parking, inout] = await Promise.all([
      fetchAirportBoard(),
      fetchParking().catch(() => []),
      fetchInoutForecast().catch(() => null),
    ])
    return NextResponse.json({ ...board, parking, inout, updatedAt: new Date().toISOString() }, { headers: LIVE_HEADERS })
  } catch (error) {
    console.error("[crowd/airport] API error:", error instanceof Error ? error.message : "Unknown error")
    return NextResponse.json({ error: "공항 실황을 불러오지 못했습니다." }, { status: 502 })
  }
}
