// 부산 교통정보센터(its.busan.go.kr) + 부산시설공단(bsparking) + KHOA 해수욕장지수 연동 (서버 전용)
// 부산은 서울·제주 같은 실시간 인파 원천이 없다 — 등급은 "접근·주차 혼잡"으로 정직하게 재정의:
//   주차 = bsparking 재차율(<60% 여유 · <80% 보통 · <95% 약간 붐빔 · ≥95% 붐빔) 우선, ITS congestion(1~3) 보조
//   도로 = 이름 매칭 구간 등급 평균(1원활/2서행/3정체) · 지점 등급 = 두 축의 최댓값
//
// 데이터 계약 (2026-08-04 실측):
// - its.busan.go.kr/api/exl/pklList.do  공영주차 31곳 {addr,lat,lot,congestion,pkSpaceCnt}
// - its.busan.go.kr/api/sxnTrf/list.do  도로소통 257구간 {sxnNm,bgngSxnNm,endSxnNm,trfGradeCd,...} (좌표 없음)
// - its.busan.go.kr/api/inc/list.do     돌발 {incSpotNm,incTypeCdNm,incCn,ocrnDt,lat,lot}
//   (무키·Referer+X-Requested-With 필요 · 일부 데이터센터 IP는 차단 — 실패 시 해당 축만 조용히 강등)
// - bsparking.bisco.or.kr/api/parking/realtime/list?parkingId={id}  {parkingName,cellCount,parkCount,lat,lng}
// - khoa.go.kr/khoa/lifeforecast/getBeach.do?beachCode=&date=YYYYMMDD  selectBeach[{gubun,waterTemp,waveHeight,beachIndex}]
// - CCTV: its-stream*.busan.go.kr HLS 고정 URL (https·CORS 전면 개방 실측 — 브라우저 직접 재생)

import {
  LEVEL_COLORS,
  levelNum,
  type CrowdCctv,
  type CrowdDetail,
  type CrowdExtra,
  type CrowdSpot,
} from "@/lib/crowd/seoul-rtd"
import {
  createSnapshot,
  emptyDetailFields,
  fetchBeachInfo,
  fetchMeteo12h,
  LV_BY_N,
  meanRoadLv,
  parkRatioLv,
  ROAD_COLOR,
  ROAD_IDX,
  toNum,
} from "@/lib/crowd/adapter-kit"
import { haversineKmServer } from "@/lib/crowd/geo"
import { krgovJson } from "@/lib/crowd/krgov-fetch"

const ITS = "https://its.busan.go.kr/api/"
const BSP = "https://bsparking.bisco.or.kr/api/parking/realtime/list?parkingId="

const ITS_HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
  Referer: "https://its.busan.go.kr/",
  "X-Requested-With": "XMLHttpRequest",
  Accept: "application/json, text/plain, */*",
}

interface BusanSpotDef {
  name: string
  category: string
  lat: number
  lng: number
  cams: Array<[string, string]> // [HLS URL, 카메라명] — ≤1.6km 스윕 큐레이션
  bsp: Array<[number, string]> // [bisco parkingId, 주차장명] — ≤1.3km
  beach?: string // KHOA beachCode
  roads: string[] // 도로소통 구간명 매칭 키워드
}

// 명소 26곳 — 좌표 nominatim 교차검증, CCTV·주차·도로 매핑은 실측 스윕 산출 (2026-08-04)
export const BUSAN_SPOTS: BusanSpotDef[] = [
  { name: "해운대해수욕장", category: "해변", lat: 35.1587, lng: 129.1604, cams: [["https://its-stream5.busan.go.kr:8443/rtplive/cctv_308.stream/playlist.m3u8", "기계공고 삼거리"], ["https://its-stream4.busan.go.kr:8443/rtplive/cctv_406.stream/playlist.m3u8", "해운대 암소갈비 앞"]], bsp: [[36, "해운대광장"], [17, "동백사거리"], [11, "부산기계공고 후문"]], beach: "HS29", roads: ["해운대해변로"] },
  { name: "광안리해수욕장", category: "해변", lat: 35.1532, lng: 129.1187, cams: [["https://its-stream4.busan.go.kr:8443/rtplive/cctv_119.stream/playlist.m3u8", "광안리해변"], ["https://its-stream4.busan.go.kr:8443/rtplive/cctv_199.stream/playlist.m3u8", "장대골삼거리"]], bsp: [[23, "수변공원"]], beach: "HS30", roads: ["해수욕장로"] },
  { name: "송정해수욕장", category: "해변", lat: 35.1786, lng: 129.1997, cams: [["https://its-stream5.busan.go.kr:8443/rtplive/cctv_257.stream/playlist.m3u8", "송정삼거리"], ["https://its-stream2.busan.go.kr:8443/rtplive/2026-EC-03-014.stream/playlist.m3u8", "송정해수욕장입구"]], bsp: [], beach: "HS32", roads: ["송정삼거리-롯데프리미엄아울렛", "장산로"] },
  { name: "송도해수욕장", category: "해변", lat: 35.0764, lng: 129.017, cams: [["https://its-stream2.busan.go.kr:8443/rtplive/cctv_1031_.stream/playlist.m3u8", "천마산터널(영도입구)"], ["https://its-stream4.busan.go.kr:8443/rtplive/cctv_137.stream/playlist.m3u8", "남항대교입구(서구)"]], bsp: [], beach: "HS31", roads: ["암남공원로", "충무대로"] },
  { name: "다대포해수욕장", category: "해변", lat: 35.0466, lng: 128.9655, cams: [["https://its-stream4.busan.go.kr:8443/rtplive/cctv_105.stream/playlist.m3u8", "다대포해수욕장입구"]], bsp: [], beach: "HS33", roads: ["다대로"] },
  { name: "일광해수욕장", category: "해변", lat: 35.2603, lng: 129.2337, cams: [], bsp: [], beach: "HS34", roads: ["일광로"] },
  { name: "임랑해수욕장", category: "해변", lat: 35.3187, lng: 129.2578, cams: [], bsp: [], beach: "HS54", roads: ["일광로", "기장대로"] },
  { name: "서면", category: "시장·거리", lat: 35.1579, lng: 129.0594, cams: [["https://its-stream4.busan.go.kr:8443/rtplive/cctv_129.stream/playlist.m3u8", "NC백화점"]], bsp: [[43, "부전복개도로1"], [44, "부전복개도로2"]], roads: ["서면교차로"] },
  { name: "전포카페거리", category: "시장·거리", lat: 35.1553, lng: 129.0648, cams: [["https://its-stream4.busan.go.kr:8443/rtplive/cctv_197.stream/playlist.m3u8", "전포사거리"], ["https://its-stream4.busan.go.kr:8443/rtplive/cctv_129.stream/playlist.m3u8", "NC백화점"]], bsp: [[43, "부전복개도로1"], [44, "부전복개도로2"]], roads: ["전포대로"] },
  { name: "남포동 BIFF광장·국제시장", category: "시장·거리", lat: 35.0996, lng: 128.9812, cams: [["https://its-stream4.busan.go.kr:8443/rtplive/cctv_136.stream/playlist.m3u8", "사하우체국"], ["https://its-stream4.busan.go.kr:8443/rtplive/cctv_101.stream/playlist.m3u8", "하단교차로"]], bsp: [], roads: ["구덕로", "대청로"] },
  { name: "자갈치시장", category: "시장·거리", lat: 35.0967, lng: 128.9905, cams: [["https://its-stream4.busan.go.kr:8443/rtplive/cctv_136.stream/playlist.m3u8", "사하우체국"], ["https://its-stream4.busan.go.kr:8443/rtplive/cctv_103.stream/playlist.m3u8", "사하 국민체육센터"], ["https://its-stream2.busan.go.kr:8443/rtplive/cctv_1026_.stream/playlist.m3u8", "천마산터널장림측"]], bsp: [], roads: ["자갈치사거리", "충무대로"] },
  { name: "부산역·초량이바구길", category: "시장·거리", lat: 35.1151, lng: 129.0403, cams: [], bsp: [[28, "중앙공원"]], roads: ["초량로"] },
  { name: "감천문화마을", category: "문화마을", lat: 35.0975, lng: 129.0106, cams: [["https://its-stream5.busan.go.kr:8443/rtplive/cctv_731.stream/playlist.m3u8", "대티터널(괴정동입출구)"], ["https://its-stream4.busan.go.kr:8443/rtplive/cctv_109.stream/playlist.m3u8", "부민사거리"], ["https://its-stream5.busan.go.kr:8443/rtplive/cctv_735.stream/playlist.m3u8", "대티터널(대신동입출구)"]], bsp: [], roads: ["감천로", "옥천로"] },
  { name: "흰여울문화마을", category: "문화마을", lat: 35.0785, lng: 129.0455, cams: [["https://its-stream5.busan.go.kr:8443/rtplive/cctv_525.stream/playlist.m3u8", "남항_2383m"], ["https://its-stream4.busan.go.kr:8443/rtplive/cctv_195.stream/playlist.m3u8", "영선아래사거리"], ["https://its-stream5.busan.go.kr:8443/rtplive/cctv_522.stream/playlist.m3u8", "남항_(4터널시작)"]], bsp: [[15, "신선3동"]], roads: ["절영로"] },
  { name: "용두산공원·부산타워", category: "전망·공원", lat: 35.101, lng: 129.0324, cams: [], bsp: [[37, "롯데 광복점 뒤(2)"]], roads: ["대청로", "구덕로"] },
  { name: "태종대", category: "자연·전망", lat: 35.0533, lng: 129.0873, cams: [], bsp: [], roads: ["태종로"] },
  { name: "오륙도 스카이워크", category: "자연·전망", lat: 35.1015, lng: 129.124, cams: [], bsp: [], roads: ["용호로", "동명로"] },
  { name: "이기대 해안산책로", category: "자연·전망", lat: 35.1317, lng: 129.1233, cams: [["https://its-stream4.busan.go.kr:8443/rtplive/cctv_180.stream/playlist.m3u8", "광안대교(하부 용당 합류)"], ["https://its-stream4.busan.go.kr:8443/rtplive/cctv_190.stream/playlist.m3u8", "광안대교(하부 광안리합류)"], ["https://its-stream4.busan.go.kr:8443/rtplive/cctv_183.stream/playlist.m3u8", "광안대교(상부 49호 진출)"], ["https://its-stream4.busan.go.kr:8443/rtplive/cctv_182.stream/playlist.m3u8", "광안대교(상부 이기대분기)"]], bsp: [], roads: ["용호로"] },
  { name: "달맞이고개·청사포", category: "자연·전망", lat: 35.1552, lng: 129.1848, cams: [["https://its-stream4.busan.go.kr:8443/rtplive/cctv_401.stream/playlist.m3u8", "달맞이 어울마당"], ["https://its-stream4.busan.go.kr:8443/rtplive/cctv_402.stream/playlist.m3u8", "미포교차로"], ["https://its-stream4.busan.go.kr:8443/rtplive/cctv_408.stream/playlist.m3u8", "미포교차로-2"]], bsp: [], roads: ["좌동로", "장산로"] },
  { name: "동백섬·누리마루", category: "자연·전망", lat: 35.1526, lng: 129.152, cams: [["https://its-stream4.busan.go.kr:8443/rtplive/cctv_127.stream/playlist.m3u8", "운촌삼거리"], ["https://its-stream5.busan.go.kr:8443/rtplive/cctv_308.stream/playlist.m3u8", "기계공고 삼거리"], ["https://its-stream4.busan.go.kr:8443/rtplive/cctv_131.stream/playlist.m3u8", "해운대소방서"]], bsp: [[17, "동백사거리"], [36, "해운대광장"]], roads: ["해운대해변로"] },
  { name: "민락수변공원", category: "전망·공원", lat: 35.155, lng: 129.1266, cams: [["https://its-stream4.busan.go.kr:8443/rtplive/cctv_119.stream/playlist.m3u8", "광안리해변"]], bsp: [[23, "수변공원"], [3, "수변어린이공원"]], roads: ["좌수영로", "광남로"] },
  { name: "벡스코·센텀시티", category: "관광지", lat: 35.1691, lng: 129.136, cams: [["https://its-stream5.busan.go.kr:8443/rtplive/ID-1318_.stream/playlist.m3u8", "벡스코 컨벤션홀"], ["https://its-stream5.busan.go.kr:8443/rtplive/ID-1319_.stream/playlist.m3u8", "벡스코 신관"], ["https://its-stream4.busan.go.kr:8443/rtplive/cctv_203.stream/playlist.m3u8", "센텀시티역"]], bsp: [[41, "요트경기장 앞 1구역"], [50, "요트경기장 앞 2구역(대형)"], [12, "해운대 센텀시티"]], roads: ["센텀"] },
  { name: "해동용궁사", category: "관광지", lat: 35.1883, lng: 129.2233, cams: [["https://its-stream5.busan.go.kr:8443/rtplive/cctv_259.stream/playlist.m3u8", "롯데몰 동부산점"], ["https://its-stream2.busan.go.kr:8443/rtplive/2026-EC-03-015.stream/playlist.m3u8", "동부산롯데월드"]], bsp: [], roads: ["송정삼거리-롯데프리미엄아울렛", "기장대로"] },
  { name: "롯데월드 어드벤처 부산", category: "관광지", lat: 35.1969, lng: 129.2137, cams: [["https://its-stream2.busan.go.kr:8443/rtplive/2026-EC-03-015.stream/playlist.m3u8", "동부산롯데월드"]], bsp: [], roads: ["롯데프리미"] },
  { name: "부산시민공원", category: "전망·공원", lat: 35.1665, lng: 129.0577, cams: [["https://its-stream4.busan.go.kr:8443/rtplive/cctv_143.stream/playlist.m3u8", "진구청 옥상"]], bsp: [], roads: ["새싹로"] },
  { name: "범어사", category: "관광지", lat: 35.2837, lng: 129.0679, cams: [], bsp: [], roads: ["노포로"] },
]

// ITS·KHOA 모두 관공서 인증서 체인 이슈가 있어 krgov 헬퍼(검증 완화 + 브라우저 UA)로 통신
function itsFetch(path: string): Promise<unknown> {
  return krgovJson(`${ITS}${path}`, { headers: ITS_HEADERS })
}

interface ItsParking {
  lat: number
  lng: number
  congestion: number
}
interface ItsRoadRow {
  sxnNm?: string
  bgngSxnNm?: string
  endSxnNm?: string
  trfGradeCd?: string | number
  spd?: string | number
}
interface ItsInc {
  nm: string
  tp: string
  cn: string
  dt: string
  lat: number
  lng: number
}
interface BiscoLot {
  name: string
  cell: number
  cur: number
  lat: number
  lng: number
}

// 원천별 모듈 캐시 — 목록·상세가 같은 갱신 주기(2분) 안에서 중복 콜을 내지 않게
interface BusanSnapshot {
  itsPk: ItsParking[]
  roads: ItsRoadRow[]
  inc: ItsInc[]
  lots: Map<number, BiscoLot>
}

const busanSnapshot = createSnapshot(120_000, async (): Promise<BusanSnapshot> => {
  const [pkRaw, roadRaw, incRaw] = await Promise.all([
    itsFetch("exl/pklList.do").catch(() => null),
    itsFetch("sxnTrf/list.do").catch(() => null),
    itsFetch("inc/list.do").catch(() => null),
  ])
  const itsPk: ItsParking[] = (((pkRaw as { list?: unknown[] } | null)?.list ?? []) as Array<Record<string, unknown>>).map(
    (p) => ({ lat: toNum(p.lat), lng: toNum(p.lot), congestion: toNum(p.congestion) }),
  )
  const roads = ((roadRaw as { list?: unknown[] } | null)?.list ?? []) as ItsRoadRow[]
  const inc: ItsInc[] = (((incRaw as { list?: unknown[] } | null)?.list ?? []) as Array<Record<string, unknown>>).map(
    (r) => ({
      nm: String(r.incSpotNm ?? ""),
      tp: String(r.incTypeCdNm ?? ""),
      cn: String(r.incCn ?? ""),
      dt: String(r.ocrnDt ?? ""),
      lat: toNum(r.lat),
      lng: toNum(r.lot),
    }),
  )

  // bisco 단건 — 전 명소가 쓰는 유니크 주차장만 (전체 목록 API는 452KB라 단건 고정)
  const lots = new Map<number, BiscoLot>()
  const ids = [...new Set(BUSAN_SPOTS.flatMap((s) => s.bsp.map(([id]) => id)))]
  const BATCH = 6
  for (let i = 0; i < ids.length; i += BATCH) {
    await Promise.all(
      ids.slice(i, i + BATCH).map(async (id) => {
        try {
          const res = await fetch(`${BSP}${id}`, { cache: "no-store", signal: AbortSignal.timeout(10000) })
          if (!res.ok) return
          const d = (await res.json()) as { data?: Array<Record<string, unknown>> }
          const r = d.data?.[0]
          if (!r) return
          lots.set(id, {
            name: String(r.parkingName ?? ""),
            cell: toNum(r.cellCount),
            cur: toNum(r.parkCount),
            lat: toNum(r.lat),
            lng: toNum(r.lng),
          })
        } catch {
          // 주차장 단건 실패 = 해당 축만 강등
        }
      }),
    )
  }
  return { itsPk, roads, inc, lots }
})

const loadSnapshot = () => busanSnapshot.get()

// 주차 등급: bisco 재차율 우선, 없으면 ITS congestion(1~3, ≤1.3km) 보조
function parkLvOf(s: BusanSpotDef, snap: BusanSnapshot): number {
  let best = 0
  for (const [id] of s.bsp) {
    const lot = snap.lots.get(id)
    if (!lot || !lot.cell) continue
    best = Math.max(best, parkRatioLv(lot.cur / lot.cell))
  }
  if (!best) {
    for (const p of snap.itsPk) {
      if (haversineKmServer(s.lat, s.lng, p.lat, p.lng) <= 1.3) best = Math.max(best, Math.min(3, p.congestion))
    }
  }
  return best
}

function roadRowsOf(s: BusanSpotDef, snap: BusanSnapshot): ItsRoadRow[] {
  return snap.roads.filter((r) => {
    const t = `${r.sxnNm ?? ""}|${r.bgngSxnNm ?? ""}|${r.endSxnNm ?? ""}`
    return s.roads.some((k) => t.includes(k))
  })
}

function roadLvOf(s: BusanSpotDef, snap: BusanSnapshot): number {
  return meanRoadLv(roadRowsOf(s, snap).map((r) => toNum(r.trfGradeCd) || 2))
}

function levelOf(s: BusanSpotDef, snap: BusanSnapshot): { level: string; parkLv: number; roadLv: number } {
  const parkLv = parkLvOf(s, snap)
  const roadLv = roadLvOf(s, snap)
  const n = Math.max(parkLv, roadLv) || 2
  return { level: LV_BY_N[n], parkLv, roadLv }
}

export async function fetchBusanSpots(): Promise<CrowdSpot[]> {
  const snap = await loadSnapshot()
  return BUSAN_SPOTS.map((s) => {
    const { level } = levelOf(s, snap)
    return {
      name: s.name,
      category: s.category,
      lat: s.lat,
      lng: s.lng,
      level,
      levelNum: levelNum(level),
      color: LEVEL_COLORS[level] ?? "#999",
    }
  })
}

export async function fetchBusanDetail(name: string): Promise<CrowdDetail> {
  const def = BUSAN_SPOTS.find((s) => s.name === name)
  if (!def) throw new Error(`unknown busan spot: ${name}`)

  const kstNow = new Date(Date.now() + 9 * 3600 * 1000)
  const ymd = kstNow.toISOString().slice(0, 10).replace(/-/g, "")

  const [snap, beach, weather] = await Promise.all([
    loadSnapshot(),
    def.beach ? fetchBeachInfo(def.beach, ymd) : Promise.resolve([]),
    fetchMeteo12h(def.lat, def.lng),
  ])

  const { level, parkLv, roadLv } = levelOf(def, snap)

  const message = ["부산은 인파 계측 원천이 없어 접근 도로·주차 혼잡 기준으로 보여드려요."]
  const bits: string[] = []
  if (roadLv) bits.push(`접근 도로 ${LV_BY_N[roadLv] === "약간 붐빔" ? "정체" : roadLv === 1 ? "원활" : "서행"}`)
  if (parkLv) bits.push(`주차 ${LV_BY_N[parkLv]}`)
  if (bits.length > 0) message.push(`지금 ${bits.join(" · ")} 수준이에요.`)

  // 큐레이션 CCTV — https·CORS 개방 스트림이라 클라이언트 직접 재생 (좌표 미제공 → 0)
  const cctv: CrowdCctv[] = def.cams.map(([src, camName]) => ({
    name: camName,
    lat: 0,
    lng: 0,
    streamId: src,
    src,
    kind: "hls",
  }))

  return {
    name,
    city: "busan",
    beach: beach.length > 0 ? beach : undefined,
    level,
    levelNum: levelNum(level),
    color: LEVEL_COLORS[level] ?? "#999",
    message,
    ...emptyDetailFields(),
    weather,
    cctv,
    updatedAt: new Date().toISOString(),
  }
}

/** 부산 부가정보 — 서울 CrowdExtra와 같은 형태로 수렴 (주차 잔여·도로소통·돌발) */
export async function fetchBusanExtra(name: string): Promise<CrowdExtra> {
  const def = BUSAN_SPOTS.find((s) => s.name === name)
  if (!def) throw new Error(`unknown busan spot: ${name}`)
  const snap = await loadSnapshot()

  const lots = def.bsp
    .map(([id, fallbackName]) => {
      const lot = snap.lots.get(id)
      if (!lot || !lot.cell) return null
      return {
        name: lot.name || fallbackName,
        capacity: lot.cell,
        available: Math.max(lot.cell - lot.cur, 0),
        lat: lot.lat,
        lng: lot.lng,
      }
    })
    .filter((l): l is NonNullable<typeof l> => l != null)
  const capacity = lots.reduce((s, l) => s + l.capacity, 0)
  const available = lots.reduce((s, l) => s + l.available, 0)

  const roadRows = roadRowsOf(def, snap)
  const roadLv = roadLvOf(def, snap)
  const speeds = roadRows.map((r) => toNum(r.spd)).filter((v) => v > 0)

  const alerts = snap.inc
    .filter((i) => i.lat && haversineKmServer(def.lat, def.lng, i.lat, i.lng) <= 2)
    .slice(0, 6)
    .map((i) => ({
      type: i.tp,
      detail: "",
      info: [i.nm, i.cn].filter(Boolean).join(" — "),
      occurredAt: i.dt,
      expectedClearAt: "",
    }))

  return {
    alerts,
    parking:
      lots.length > 0
        ? { available, percent: capacity > 0 ? Math.round((available / capacity) * 100) : 0, lots }
        : null,
    events: [],
    road: roadLv
      ? {
          idx: ROAD_IDX[roadLv],
          speed: speeds.length > 0 ? Math.round(speeds.reduce((a, b) => a + b, 0) / speeds.length) : 0,
          msg: "",
          color: ROAD_COLOR[roadLv],
        }
      : null,
    bike: null,
    updatedAt: new Date().toISOString(),
  }
}
