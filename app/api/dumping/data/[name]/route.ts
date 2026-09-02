import { NextResponse, type NextRequest } from "next/server"
import { verifyRequest } from "@/lib/dumping/auth"
import graph from "@/data/dumping/graph.json"
import interventions from "@/data/dumping/interventions.json"
import mapData from "@/data/dumping/map.json"

export const runtime = "nodejs"

// 대시보드 데이터 — 격자 단위 민원·과태료 집계라 public/ 정적 서빙 대신 인증 뒤에 둔다.
// 파일은 빌드 시점에 번들되므로 갱신은 export_dashboard.py → 재배포.
const FILES: Record<string, unknown> = { map: mapData, graph, interventions }

export async function GET(request: NextRequest, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params
  const data = FILES[name]
  if (!data) return NextResponse.json({ error: "not found" }, { status: 404 })
  if (!verifyRequest(request)) return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  return NextResponse.json(data, { headers: { "Cache-Control": "private, no-store" } })
}
