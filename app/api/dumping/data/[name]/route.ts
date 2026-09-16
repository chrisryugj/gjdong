import { NextResponse, type NextRequest } from "next/server"
import { verifyRequest } from "@/lib/dumping/auth"
import { applyErrata } from "@/lib/dumping/errata"
import type { OntoGraph } from "@/lib/dumping/types"
import binRecos from "@/data/dumping/bin-recos.json"
import graph from "@/data/dumping/graph.json"
import interventions from "@/data/dumping/interventions.json"
import mapData from "@/data/dumping/map.json"

export const runtime = "nodejs"

// 대시보드 데이터 — 격자 단위 민원·과태료 집계라 public/ 정적 서빙 대신 인증 뒤에 둔다.
// 파일은 빌드 시점에 번들되므로 갱신은 export_dashboard.py → 재배포.
// 그래프는 정오표(errata.ts)를 거친다 — 질의응답 프롬프트(context.ts)와 같은 버전을 화면이 본다
// bin-recos(데이터팀 추천 50지점)도 여기로만. 클라이언트가 정적 import하면 암호화가 무의미하게 공개 청크에 평문으로 실린다(2026-09-16 실측)
const FILES: Record<string, unknown> = { map: mapData, graph: applyErrata(graph as unknown as OntoGraph), interventions, "bin-recos": binRecos }

export async function GET(request: NextRequest, { params }: { params: Promise<{ name: string }> }) {
  if (!verifyRequest(request)) return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  const { name } = await params
  const data = Object.hasOwn(FILES, name) ? FILES[name] : undefined
  if (!data) return NextResponse.json({ error: "not found" }, { status: 404 })
  return NextResponse.json(data, { headers: { "Cache-Control": "private, no-store" } })
}
