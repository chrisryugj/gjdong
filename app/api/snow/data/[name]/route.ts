import { NextResponse } from "next/server"
import mapJson from "@/data/snow/map.json"
import graphJson from "@/data/snow/graph.json"

// /snow 정적 데이터. 공공데이터(시설 위치)라 인증 없이 서빙하고 CDN 캐시를 건다. 갱신은 scripts/snow-data.mjs 재실행 + 배포

const FILES: Record<string, unknown> = { map: mapJson, graph: graphJson }

export async function GET(_req: Request, ctx: { params: Promise<{ name: string }> }) {
  const { name } = await ctx.params
  const body = FILES[name]
  if (!body) return NextResponse.json({ error: "not found" }, { status: 404 })
  return NextResponse.json(body, { headers: { "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=3600" } })
}
