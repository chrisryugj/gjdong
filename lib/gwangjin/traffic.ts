// 광진 도로 소통 (서버 전용) — 서울 RTD 공개 road 엔드포인트를 6개 보스팟으로 합산
// ── 데이터 계약 실측 (2026-08-13)
// GET data.seoul.go.kr/SeoulRtd/api/road?hotspotNm= — 인증키 불필요, Referer 필수(없으면 빈 응답).
// 응답 {row:[…]} — 링크별: XYLIST "경도_위도|경도_위도|…" 폴리라인, IDX 원활/서행/정체,
// SPD 링크속도(km/h), ROAD_NM 도로명, LINK_ID(보스팟 간 중복 — 뎁둥 필수), DATEPUBLISHED.
// 행 COLOR(#E34B63식)는 원천 팔레트 — 앱 혼잡도 색과 통일하려고 IDX 기준으로 다시 칠한다.
// 커버리지는 보스팟 반경 도로만 — 광진 6곳(건대·군자·어대공·아차산·뚝섬·광나루)이 구 주요축을 대체로 덮는다.

import { GWANGJIN_SPOTS, NEARBY_SPOTS } from "@/lib/gwangjin/constants"

const RTD_HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
  Referer: "https://data.seoul.go.kr/SeoulRtd/map",
  Accept: "application/json, text/plain, */*",
}

export interface TrafficLink {
  id: string
  road: string
  /** 원활 | 서행 | 정체 */
  idx: string
  /** 링크 속도 km/h */
  spd: number
  color: string
  /** [lat, lng][] — Leaflet polyline 그대로 */
  path: Array<[number, number]>
}

export interface TrafficBundle {
  links: TrafficLink[]
  /** 원천 발행 시각 "2026-08-13 11:20" — 최신 링크 기준 */
  at: string
}

// 혼잡도 명소 마커와 같은 시각 언어 — 원활=여유색, 서행=보통색, 정체=붐빔색
const IDX_COLOR: Record<string, string> = {
  원활: "#00d369",
  서행: "#ffb100",
  정체: "#ff3939",
}

function parseXyList(xy: string): Array<[number, number]> {
  const out: Array<[number, number]> = []
  for (const pair of xy.split("|")) {
    const [lng, lat] = pair.split("_").map((v) => Number.parseFloat(v))
    if (Number.isFinite(lat) && Number.isFinite(lng)) out.push([lat, lng])
  }
  return out
}

export async function fetchTraffic(): Promise<TrafficBundle | null> {
  const spots = [...GWANGJIN_SPOTS, ...NEARBY_SPOTS]
  const results = await Promise.all(
    spots.map((name) =>
      fetch(`https://data.seoul.go.kr/SeoulRtd/api/road?hotspotNm=${encodeURIComponent(name)}`, {
        headers: RTD_HEADERS,
        next: { revalidate: 240 },
      })
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null),
    ),
  )
  if (results.every((r) => r === null)) return null
  const byId = new Map<string, TrafficLink>()
  let at = ""
  for (const raw of results) {
    const rows = (raw as { row?: Array<Record<string, unknown>> } | null)?.row
    if (!Array.isArray(rows)) continue
    for (const r of rows) {
      const id = String(r.LINK_ID ?? "")
      if (!id || byId.has(id)) continue
      const path = parseXyList(String(r.XYLIST ?? ""))
      if (path.length < 2) continue
      const idx = String(r.IDX ?? "").trim()
      byId.set(id, {
        id,
        road: String(r.ROAD_NM ?? "").trim(),
        idx,
        spd: Number.parseFloat(String(r.SPD ?? "0")) || 0,
        color: IDX_COLOR[idx] ?? "#94a3b8",
        path,
      })
      const pub = String(r.DATEPUBLISHED ?? "")
      if (pub > at) at = pub
    }
  }
  return { links: [...byId.values()], at }
}
