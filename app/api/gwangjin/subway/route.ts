import { type NextRequest, NextResponse } from "next/server"
import { fetchSubwayBoard } from "@/lib/gwangjin/subway"
import { STATIONS } from "@/lib/gwangjin/constants"

export const dynamic = "force-dynamic"

// 도착정보는 초 단위로 변한다 — 엣지 캐시 15초
const CACHE_HEADERS = { "Cache-Control": "public, s-maxage=15, stale-while-revalidate=15" }

export async function GET(request: NextRequest) {
  const st = request.nextUrl.searchParams.get("st") ?? ""
  if (!STATIONS.some((s) => s.base === st)) {
    return NextResponse.json({ error: "Invalid station" }, { status: 400 })
  }
  const board = await fetchSubwayBoard(st)
  if (board === null) return NextResponse.json({ needKey: "seoul" }, { headers: CACHE_HEADERS })
  return NextResponse.json(board, { headers: CACHE_HEADERS })
}
