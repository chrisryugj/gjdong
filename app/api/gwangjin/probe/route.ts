// TEMP 실측 프로브 v2 — 커밋 금지, 검증 후 삭제.
// ① GetParkingInfo 광진 전 행(실시간 외 정적 주차장·요금·좌표 필드) ② 도서관 2종 광진분
import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"

export async function GET() {
  const key = process.env.SEOUL_OPEN_KEY ?? ""
  const get = (path: string) =>
    fetch(`http://openapi.seoul.go.kr:8088/${key}/json/${path}`)
      .then((r) => r.json())
      .catch(() => null)

  const env = (j: unknown, svc: string) =>
    (j as Record<string, { list_total_count?: number; row?: Array<Record<string, unknown>> }> | null)?.[svc]

  // ── 주차: 전체 행 (기존 어댑터는 PRK_STTS_YN=1만)
  const pj = await get(`GetParkingInfo/1/200/${encodeURIComponent("광진구")}`)
  const prows = env(pj, "GetParkingInfo")?.row ?? []
  const parking = {
    total: env(pj, "GetParkingInfo")?.list_total_count ?? null,
    got: prows.length,
    realtime: prows.filter((r) => r.PRK_STTS_YN === "1").length,
    fields: prows[0] ? Object.keys(prows[0]) : [],
    sample: prows.slice(0, 14).map((r) => ({
      nm: r.PKLT_NM,
      rt: r.PRK_STTS_YN,
      type: r.PKLT_KND_NM ?? r.PKLT_TYPE,
      pay: r.PAY_YN_NM ?? r.PAY_YN,
      chg: r.BSC_PRK_CRG,
      hr: r.BSC_PRK_HR,
      wd: `${r.WD_OPER_BGNG_TM ?? ""}-${r.WD_OPER_END_TM ?? ""}`,
      lat: r.LAT,
      lot: r.LOT,
      tot: r.TPKCT,
    })),
  }

  // ── 도서관 2종 — CODE_VALUE=광진구 클라 필터
  const lib1 = await get("SeoulPublicLibraryInfo/1/1000/")
  const l1rows = env(lib1, "SeoulPublicLibraryInfo")?.row ?? []
  const g1 = l1rows.filter((r) => r.CODE_VALUE === "광진구")
  const lib2pages = await Promise.all([get("SeoulLibraryTimeInfo/1/1000/"), get("SeoulLibraryTimeInfo/1001/2000/")])
  const l2rows = lib2pages.flatMap((j) => env(j, "SeoulLibraryTimeInfo")?.row ?? [])
  const g2 = l2rows.filter((r) => r.CODE_VALUE === "광진구")
  const libs = {
    pub: { total: l1rows.length, gwangjin: g1.length, fields: l1rows[0] ? Object.keys(l1rows[0]) : [], sample: g1.slice(0, 6) },
    time: {
      total: l2rows.length,
      gwangjin: g2.length,
      fields: l2rows[0] ? Object.keys(l2rows[0]) : [],
      closed: g2.filter((r) => String(r.FDRM_CLOSE_DATE ?? "").includes("휴관")).length,
      sample: g2.slice(0, 8).map((r) => ({ nm: r.LBRRY_NAME, cl: r.FDRM_CLOSE_DATE, x: r.XCNTS, y: r.YDNTS })),
    },
  }

  return NextResponse.json({ parking, libs })
}
