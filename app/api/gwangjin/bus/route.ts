import { NextResponse } from "next/server"
import { fetchBusArrivals } from "@/lib/gwangjin/bus"

export const dynamic = "force-dynamic"

// 정류소 도착 — 팝업 열릴 때만 조회(지하철 패턴). 실시간이라 캐시 15초만
export async function GET(request: Request) {
  const ars = new URL(request.url).searchParams.get("ars") ?? ""
  const arrivals = await fetchBusArrivals(ars)
  if (arrivals === null) return NextResponse.json({ needKey: true })
  return NextResponse.json({ arrivals }, { headers: { "Cache-Control": "public, s-maxage=15" } })
}
