// 광진 버스 (서버 전용) — 정류소 위치(서울 열린데이터) + 정류소별 도착(TOPIS ws.bus.go.kr)
// ── 데이터 계약 실측 (2026-08-11)
// 정류소: tbisMasterStation 11,492행(샘플키 실측) — CRTR_NO 5자리 ARS번호(01001식),
//   CRTR_ID 정류소ID, CRTR_NM, CRTR_TYPE(중앙차로/가로변), LAT/LOT. 구 필드 없음 —
//   ARS 구코드 프리픽스(광진="05")로 거르고 광진 bbox로 재확인(가상정류장 오염 방어).
// 도착: ws.bus.go.kr/api/rest/stationinfo/getStationByUid?arsId= — data.go.kr
//   "서울특별시_정류소정보조회 서비스"(15000303) 활용신청 필요(자동승인, DATA_GO_KR_KEY 공용).
//   응답 <msgBody><itemList> 반복 — rtNm 노선명, adirection 방면, arrmsg1/2 도착문구
//   ("3분38초후[2번째 전]"·"곧 도착"·"운행종료"), routeType 노선유형(3간선 4지선…).
//   ⚠️미신청 실측(2026-08-12): ws.bus.go.kr는 data.go.kr 게이트웨이와 달리 HTTP 200 +
//   <headerCd>7</headerCd> + "SERVICE KEY IS NOT REGISTERED"(공백 구분!)로 답한다 —
//   문자열 매칭이 아니라 headerCd로 판정해야 미신청이 "도착 없음"으로 위장하지 않는다.
//   ⚠️이 호스트는 http 전용(443 미개방 실측) — krgovFetch(node:https 전용)가 아니라
//   plain fetch로 부른다. http라 TLS 체인 문제도 없다.

import { seoulRows } from "@/lib/gwangjin/seoul-open"

const KEY = () => process.env.DATA_GO_KR_KEY ?? ""

export interface BusStop {
  /** 5자리 ARS 번호 — 도착 조회 키 */
  arsId: string
  name: string
  /** 중앙차로/가로변 등 */
  type: string
  lat: number
  lng: number
}

export interface BusArrival {
  route: string
  /** 방면 (다음 정류소) */
  direction: string
  /** 첫차·둘째차 도착 문구 — 원문 그대로 */
  msg1: string
  msg2: string
  /** TOPIS 노선유형 코드 — 마커·뱃지 색 매핑용 */
  routeType: string
}

// 광진 bbox — ARS 프리픽스가 어긋난 가상·이관 정류장 방어용 (경계 폴리곤까진 불필요한 정밀도)
const GJ_BBOX = { latMin: 37.515, latMax: 37.58, lngMin: 127.05, lngMax: 127.13 }

let stopCache: { at: number; data: BusStop[] } | null = null

export async function fetchBusStops(): Promise<BusStop[] | null> {
  if (stopCache && Date.now() - stopCache.at < 86_400_000) return stopCache.data
  const pages = await Promise.all(
    Array.from({ length: 12 }, (_, i) => seoulRows("tbisMasterStation", `${i * 1000 + 1}/${i * 1000 + 1000}/`, 86_400)),
  )
  if (pages.every((p) => p === null)) return null
  const out: BusStop[] = []
  for (const rows of pages) {
    for (const r of (rows ?? []) as Array<Record<string, unknown>>) {
      const ars = String(r.CRTR_NO ?? "")
      if (!ars.startsWith("05") || ars.length !== 5) continue
      const lat = Number.parseFloat(String(r.LAT ?? "0")) || 0
      const lng = Number.parseFloat(String(r.LOT ?? "0")) || 0
      if (lat < GJ_BBOX.latMin || lat > GJ_BBOX.latMax || lng < GJ_BBOX.lngMin || lng > GJ_BBOX.lngMax) continue
      out.push({ arsId: ars, name: String(r.CRTR_NM ?? ""), type: String(r.CRTR_TYPE ?? "").trim(), lat, lng })
    }
  }
  const data = out.filter((s) => s.name).sort((a, b) => a.arsId.localeCompare(b.arsId))
  if (data.length > 0) stopCache = { at: Date.now(), data }
  return data
}

/** 정류소 도착 — 미신청/키 없음 null, 정상인데 도착 없음 [] */
export async function fetchBusArrivals(arsId: string): Promise<BusArrival[] | null> {
  const key = KEY()
  if (!key || !/^\d{5}$/.test(arsId)) return null
  const url = `http://ws.bus.go.kr/api/rest/stationinfo/getStationByUid?serviceKey=${key}&arsId=${arsId}`
  const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(10000) }).catch(() => null)
  if (res && res.status === 403) return null
  const xml = res?.ok ? await res.text().catch(() => "") : ""
  // headerCd 7 = 인증(미신청) — 신청 안내로 구분. 그 외 에러 코드는 빈 도착으로 수렴
  const headerCd = xml.match(/<headerCd>(\d+)<\/headerCd>/)?.[1]
  if (headerCd === "7") return null
  const items: BusArrival[] = []
  for (const m of xml.matchAll(/<itemList>([\s\S]*?)<\/itemList>/g)) {
    const tag = (name: string) => m[1].match(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`))?.[1]?.trim() ?? ""
    items.push({
      route: tag("rtNm"),
      direction: tag("adirection"),
      msg1: tag("arrmsg1"),
      msg2: tag("arrmsg2"),
      routeType: tag("routeType"),
    })
  }
  return items.filter((i) => i.route)
}

/** TOPIS 노선유형 → 서울 버스 도색 (1공항 2마을 3간선 4지선 5순환 6광역) — 미매핑은 회색 */
export const BUS_TYPE_COLOR: Record<string, string> = {
  "1": "#65b5f0",
  "2": "#6fbe44",
  "3": "#3d5bab",
  "4": "#53a532",
  "5": "#f2b70a",
  "6": "#e60012",
}
