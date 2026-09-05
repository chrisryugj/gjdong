import { NextResponse, type NextRequest } from "next/server"
import { verifyRequest } from "@/lib/dumping/auth"
import { applyErrata } from "@/lib/dumping/errata"
import type { OntoGraph } from "@/lib/dumping/types"
import graph from "@/data/dumping/graph.json"
import interventions from "@/data/dumping/interventions.json"
import mapData from "@/data/dumping/map.json"

export const runtime = "nodejs"

// 대시보드 데이터 — 격자 단위 민원·과태료 집계라 public/ 정적 서빙 대신 인증 뒤에 둔다.
// 파일은 빌드 시점에 번들되므로 갱신은 export_dashboard.py → 재배포.
// 그래프는 정오표(errata.ts)를 거친다 — 질의응답 프롬프트(context.ts)와 같은 버전을 화면이 본다
const FILES: Record<string, unknown> = { map: mapData, graph: applyErrata(graph as unknown as OntoGraph), interventions }

export async function GET(request: NextRequest, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params
  const data = FILES[name]
  if (!data) return NextResponse.json({ error: "not found" }, { status: 404 })
  if (!verifyRequest(request)) return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  return NextResponse.json(data, { headers: { "Cache-Control": "private, no-store" } })
}
