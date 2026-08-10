import { NextResponse } from "next/server"
import { ADAPTERS } from "@/lib/crowd/adapters"
import { GWANGJIN_SPOTS, NEARBY_SPOTS } from "@/lib/gwangjin/constants"
import { fetchAirNow, fetchKondaeCmrcl, fetchParking, fetchRain, fetchRiver } from "@/lib/gwangjin/env-safety"
import { fetchBikes } from "@/lib/gwangjin/life"

export const dynamic = "force-dynamic"

// 5분 축 묶음 — 혼잡도(무키 RTD)·대기·강우·수위·주차·상권·따릉이.
// 키 없는 블록은 null — 클라이언트가 KEY_GUIDES로 발급 안내 카드를 그린다.
const CACHE_HEADERS = { "Cache-Control": "public, s-maxage=120, stale-while-revalidate=180" }

export async function GET() {
  const wanted = new Set<string>([...GWANGJIN_SPOTS, ...NEARBY_SPOTS])
  const [spots, air, rain, river, parking, cmrcl, bikes] = await Promise.all([
    ADAPTERS.seoul
      .fetchSpots()
      .then((all) => all.filter((s) => wanted.has(s.name)))
      .catch(() => []),
    fetchAirNow(),
    fetchRain(),
    fetchRiver(),
    fetchParking(),
    fetchKondaeCmrcl(),
    fetchBikes(),
  ])
  return NextResponse.json({ spots, air, rain, river, parking, cmrcl, bikes }, { headers: CACHE_HEADERS })
}
