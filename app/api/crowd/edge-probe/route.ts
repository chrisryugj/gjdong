// 임시 진단 — Edge 런타임(Cloudflare 대역)에서 제주 원천이 데이터를 주는지 확인한다.
// Node 함수(AWS 대역)는 403 대신 200+빈 배열로 거절당한다(icn1 리전에서도 동일).
// 판별이 끝나면 이 라우트는 지운다.
export const runtime = "edge"
export const dynamic = "force-dynamic"

const URL_ =
  "https://jeju.mms.gislab.co.kr/mms_new/GEONET.getTimePopByCircle.php?SELECT=M_POP_00,W_POP_00&X=126.5286&Y=33.5121&R=500"

export async function GET() {
  try {
    const res = await fetch(URL_, {
      cache: "no-store",
      headers: { "Sec-Fetch-Site": "same-origin" },
    })
    const text = await res.text()
    let rows: unknown = null
    try {
      rows = JSON.parse(text)
    } catch {
      // 원천이 JSON이 아닌 것을 돌려준 경우 — 본문 앞부분으로 판단한다
    }
    return Response.json({
      status: res.status,
      len: text.length,
      isArray: Array.isArray(rows),
      rows: Array.isArray(rows) ? rows.length : null,
      head: text.slice(0, 120),
    })
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 })
  }
}
