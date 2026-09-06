import { NextResponse } from "next/server"
import { fetchErRooms, fetchPharmacies, upstreamDiag, upstreamStatus } from "@/lib/gwangjin/emergency"

export const dynamic = "force-dynamic"

// 응급실 병상은 분 단위로 변한다 — 2분 캐시. 약국은 같은 응답에 실어도 손해 없음(신고 기반)
const CACHE_HEADERS = { "Cache-Control": "public, s-maxage=120, stale-while-revalidate=180" }

export async function GET(request: Request) {
  const [er, pharmacies] = await Promise.all([fetchErRooms(), fetchPharmacies()])
  // ?diag=1 은 상위 응답 원인만 덧붙인다 (인증키는 upstreamDiag 에서 이미 지워진 상태)
  const status = upstreamStatus()
  const diag = new URL(request.url).searchParams.get("diag") === "1"
  return NextResponse.json(diag ? { er, pharmacies, status, diag: upstreamDiag() } : { er, pharmacies, status }, {
    headers: CACHE_HEADERS,
  })
}
