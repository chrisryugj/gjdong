import { NextResponse } from "next/server"
import { fetchEvents, fetchEv, fetchShelters, fetchStationPois } from "@/lib/gwangjin/life"
import { STATIONS } from "@/lib/gwangjin/constants"

export const dynamic = "force-dynamic"

// 하루 축 묶음 — 행사·EV·무더위쉼터·지하철역 좌표. 갱신이 느린 원천이라 길게 캐시
const CACHE_HEADERS = { "Cache-Control": "public, s-maxage=1800, stale-while-revalidate=3600" }

export async function GET() {
  const [events, ev, shelters, stations] = await Promise.all([
    fetchEvents(),
    fetchEv(),
    fetchShelters(),
    fetchStationPois(STATIONS.map((s) => ({ base: s.base, lines: s.lines }))),
  ])
  return NextResponse.json({ events, ev, shelters, stations }, { headers: CACHE_HEADERS })
}
