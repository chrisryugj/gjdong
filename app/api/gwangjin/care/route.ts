import { NextResponse } from "next/server"
import { fetchErRooms, fetchPharmacies } from "@/lib/gwangjin/emergency"

export const dynamic = "force-dynamic"

// 응급실 병상은 분 단위로 변한다 — 2분 캐시. 약국은 같은 응답에 실어도 손해 없음(신고 기반)
const CACHE_HEADERS = { "Cache-Control": "public, s-maxage=120, stale-while-revalidate=180" }

export async function GET() {
  const [er, pharmacies] = await Promise.all([fetchErRooms(), fetchPharmacies()])
  return NextResponse.json({ er, pharmacies }, { headers: CACHE_HEADERS })
}
