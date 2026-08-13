import { NextResponse } from "next/server"
import { fetchTraffic } from "@/lib/gwangjin/traffic"

export const dynamic = "force-dynamic"

// 도로 소통 — 교통 레이어 켤 때만 조회, 원천(RTD)이 5분 주기라 CDN 4분 캐시
export async function GET() {
  const traffic = await fetchTraffic()
  if (traffic === null) return NextResponse.json({ links: [], at: "" }, { status: 502 })
  return NextResponse.json(traffic, { headers: { "Cache-Control": "public, s-maxage=240, stale-while-revalidate=120" } })
}
