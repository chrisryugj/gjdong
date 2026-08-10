import { NextResponse } from "next/server"
import { fetchAirNow, fetchKondaeCmrcl, fetchParking, fetchRain, fetchRiver } from "@/lib/gwangjin/env-safety"
import { fetchBikes } from "@/lib/gwangjin/life"

export const dynamic = "force-dynamic"

// 5분 축 묶음 — 대기·강우·수위·주차·상권·따릉이. 혼잡도 스팟은 /api/crowd?city=gwangjin 담당.
// 키 없는 블록은 null — 클라이언트가 KEY_GUIDES로 발급 안내 카드를 그린다.
const CACHE_HEADERS = { "Cache-Control": "public, s-maxage=120, stale-while-revalidate=180" }

export async function GET() {
  const [air, rain, river, parking, cmrcl, bikes] = await Promise.all([
    fetchAirNow(),
    fetchRain(),
    fetchRiver(),
    fetchParking(),
    fetchKondaeCmrcl(),
    fetchBikes(),
  ])
  return NextResponse.json({ air, rain, river, parking, cmrcl, bikes }, { headers: CACHE_HEADERS })
}
