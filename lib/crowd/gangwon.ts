// 강원(동해안 벨트) — 강릉시 ITS(공공데이터포털 4201000) + KHOA 해수욕장지수 + KBS 재난 CCTV (서버 전용)
// 강원도 실시간 인파 원천은 없다 — 부산과 같은 축으로 "접근·주차 혼잡"을 등급으로 쓴다:
//   주차 = 강릉 공영주차 재차율(<60% 여유 · <80% 보통 · <95% 약간 붐빔 · ≥95% 붐빔)
//   도로 = 스마트교차로 LOS(A·B=1 원활 / C·D=2 서행 / E·F=3 정체) 이름 매칭 평균
//   지점 등급 = 두 축의 최댓값. 두 축 모두 없으면 "정보 없음"(강릉권 밖 8곳) — 지어내지 않는다.
//
// 데이터 계약 (2026-08-07 실측):
// - getParkRltm  주차 실시간 13곳 {prkId,prkName,totalLots,availLots}
// - getParkInfo  주차 기본 {prkId,prkName,prkAddr,prkType,xCrdn(경도),yCrdn(위도),weekOpenTime,weekEndTime}
// - getSmrtTrff  스마트교차로 {crossName,los,delay,volume,walker,colDate} totalCount 151
//   ⚠️numOfRows 상한 100 — 초과 요청은 빈 객체 {}. pageNo=2도 빈 응답이라 1페이지(100건)가 실질 전량.
//   ⚠️apis.data.go.kr은 동일 키 동시 요청을 거부한다 — 병렬 발사 시 첫 건만 200, 나머지는 빈 {}로
//     침묵 실패. GN 계열은 반드시 순차 호출하고, 타 호스트(KHOA·KBS)만 병렬로 띄운다.
// - KBS 재난 CCTV: 목록(무키)의 url을 한 번 더 GET하면 토큰 붙은 m3u8 URL이 본문으로 온다.
//   토큰에 만료(wowzatokenendtime)가 있어 매 상세 조회마다 재발급받아야 한다.

import {
  LEVEL_COLORS,
  levelNum,
  type CrowdBeachInfo,
  type CrowdCctv,
  type CrowdDetail,
  type CrowdExtra,
  type CrowdSpot,
  type CrowdWeatherHour,
} from "@/lib/crowd/seoul-rtd"
import { krgovJson } from "@/lib/crowd/krgov-fetch"

const GN = "https://apis.data.go.kr/4201000/GNitsTrafficInfoService_1.0/"
const KBSCAM = "https://d.kbs.co.kr/special/cctv/list?area=&disaster=1"
const BEACH = "https://www.khoa.go.kr/khoa/lifeforecast/getBeach.do"
const METEO = "https://api.open-meteo.com/v1/forecast"

const NO_DATA = "정보 없음"

interface GangwonSpotDef {
  name: string
  category: string
  lat: number
  lng: number
  cams: Array<[string, string]> // [KBS cctvId, 카메라명] — 런타임 URL 발급
  prk: Array<[string, string]> // [강릉 prkId, 주차장명] — 강릉권만 존재
  beach?: string // KHOA beachCode
  roads: string[] // 스마트교차로 crossName 매칭 키워드
}

// 동해안 18곳 — 좌표·매핑은 실측 스윕 산출 (2026-08-04).
// 강릉권 밖(속초·양양·동해·삼척·고성·평창)은 주차·교차로 원천이 없어 등급이 "정보 없음"이 된다.
export const GANGWON_SPOTS: GangwonSpotDef[] = [
  { name: "경포해변", category: "해변", lat: 37.8055, lng: 128.9089, cams: [["9952", "강릉방송총국"]], prk: [["PLOT000012", "경포아쿠아리움공영주차장"], ["PLOT000009", "아르떼뮤지엄"], ["PLOT000010", "녹색체험센터"]], beach: "HS35", roads: ["경포사거리", "경포초사거리", "경포생태저류지"] },
  { name: "강문해변·강문솟대다리", category: "해변", lat: 37.7975, lng: 128.9195, cams: [["9952", "강릉방송총국"]], prk: [["PLOT000006", "강문제1공영주차장"], ["PLOT000002", "강문제2공영주차장"]], beach: "HS35", roads: ["경포사거리"] },
  { name: "안목커피거리", category: "시장·거리", lat: 37.772, lng: 128.947, cams: [["9952", "강릉방송총국"]], prk: [], roads: ["송정", "안목"] },
  { name: "주문진항·주문진해변", category: "해변", lat: 37.8934, lng: 128.831, cams: [["9995", "주문진방파제"]], prk: [["PLOT000003", "주문진해안주차타워"]], beach: "HS41", roads: ["주문진"] },
  { name: "정동진", category: "자연·전망", lat: 37.6903, lng: 129.0335, cams: [["8209", "강릉5터널"]], prk: [], roads: [] },
  { name: "강릉중앙시장", category: "시장·거리", lat: 37.7528, lng: 128.899, cams: [["9952", "강릉방송총국"]], prk: [["PLOT000004", "중앙시장제1공영주차장"], ["PLOT000005", "중앙시장제2공영주차장"], ["PLOT000013", "중앙시장제3공영주차장"], ["PLOT000001", "성내동광장주차장"]], roads: ["중앙시장", "성남"] },
  { name: "강릉역·교동", category: "시장·거리", lat: 37.7639, lng: 128.899, cams: [["9952", "강릉방송총국"]], prk: [["PLOT000011", "강릉역"], ["PLOT000007", "도심공영주차장"]], roads: ["교동", "강릉역"] },
  { name: "오죽헌", category: "관광지", lat: 37.779, lng: 128.878, cams: [["9952", "강릉방송총국"]], prk: [], roads: ["죽헌", "오죽헌"] },
  { name: "아르떼뮤지엄·경포아쿠아리움", category: "관광지", lat: 37.791, lng: 128.9065, cams: [["9952", "강릉방송총국"]], prk: [["PLOT000009", "아르떼뮤지엄"], ["PLOT000012", "경포아쿠아리움공영주차장"], ["PLOT000010", "녹색체험센터"]], roads: ["경포"] },
  { name: "동부시장·옥천동", category: "시장·거리", lat: 37.7595, lng: 128.9018, cams: [["9952", "강릉방송총국"]], prk: [["PLOT000014", "동부시장공영주차장"]], roads: ["옥천", "포남"] },
  { name: "속초해변", category: "해변", lat: 38.19, lng: 128.6018, cams: [["9986", "속초 등대전망대"]], prk: [], beach: "HS37", roads: [] },
  { name: "속초 등대전망대·영금정", category: "자연·전망", lat: 38.2134, lng: 128.6001, cams: [["9986", "속초 등대전망대"]], prk: [], roads: [] },
  { name: "낙산사·낙산해변", category: "해변", lat: 38.1215, lng: 128.63, cams: [["9019", "양양 정암리"]], prk: [], beach: "HS38", roads: [] },
  { name: "망상해변", category: "해변", lat: 37.595, lng: 129.095, cams: [["73143", "동해 노봉삼거리"]], prk: [], beach: "HS36", roads: [] },
  { name: "삼척해변", category: "해변", lat: 37.465, lng: 129.175, cams: [["5511", "삼척 한치터널"]], prk: [], beach: "HS46", roads: [] },
  { name: "화진포", category: "해변", lat: 38.475, lng: 128.431, cams: [["9573", "고성 죽정교차로"], ["73186", "고성 안보공원교차로"], ["71713", "고성 대진리입구"]], prk: [], beach: "HS43", roads: [] },
  { name: "송지호해변", category: "해변", lat: 38.329, lng: 128.523, cams: [["9567", "고성 아야진"]], prk: [], beach: "HS47", roads: [] },
  { name: "대관령", category: "자연·전망", lat: 37.698, lng: 128.7553, cams: [["9989", "평창 대관령"], ["8058", "평창 차항육교"]], prk: [], roads: [] },
]

function toNum(v: unknown): number {
  const n = Number.parseFloat(String(v ?? ""))
  return Number.isFinite(n) ? n : 0
}

interface GnLot {
  name: string
  cell: number
  cur: number
  lat: number
  lng: number
  addr: string
  open: string
  close: string
}
interface GnRoad {
  crossName: string
  grade: number // 1 원활 / 2 서행 / 3 정체
  los: string
  delay: number
  volume: number
  walker: number
}

/** 공공데이터포털 응답 껍질 벗기기 — 실패·빈 응답은 모두 빈 배열 */
export function gnItems(raw: unknown): Array<Record<string, unknown>> {
  const body = (raw as { body?: { items?: { item?: unknown } } } | null)?.body
  const item = body?.items?.item
  return Array.isArray(item) ? (item as Array<Record<string, unknown>>) : []
}

function gnCall(op: string, rows = 100): Promise<unknown> {
  const key = process.env.DATA_GO_KR_KEY
  if (!key) throw new Error("DATA_GO_KR_KEY 미설정 — 강원 원천 조회 불가")
  // 포털 발급 그대로가 이미 URL 인코딩된 값이라 재인코딩하지 않는다
  return krgovJson(`${GN}${op}?serviceKey=${key}&pageNo=1&numOfRows=${rows}&type=json`)
}

// LOS A~F → 도로 등급 (원천이 등급 대신 서비스수준 문자를 준다)
export function losGrade(los: unknown): number {
  const g = String(los ?? "").toUpperCase()
  if (g === "A" || g === "B") return 1
  if (g === "E" || g === "F") return 3
  return 2
}

interface GangwonSnapshot {
  lots: Map<string, GnLot>
  roads: GnRoad[]
  at: number
}
let snapshot: GangwonSnapshot | null = null
let snapshotPromise: Promise<GangwonSnapshot> | null = null
const SNAPSHOT_TTL = 120_000

async function loadSnapshot(): Promise<GangwonSnapshot> {
  if (snapshot && Date.now() - snapshot.at < SNAPSHOT_TTL) return snapshot
  if (snapshotPromise) return snapshotPromise
  snapshotPromise = (async () => {
    const lots = new Map<string, GnLot>()

    // ⚠️순차 — 동일 키 동시 요청은 빈 {}로 침묵 실패한다
    let rltm: Array<Record<string, unknown>> = []
    try {
      rltm = gnItems(await gnCall("getParkRltm"))
    } catch {
      // 주차 축만 강등 — 교차로 축으로 계속 간다
    }
    for (const r of rltm) {
      const id = String(r.prkId ?? "")
      if (!id) continue
      const cell = toNum(r.totalLots)
      lots.set(id, {
        name: String(r.prkName ?? ""),
        cell,
        cur: Math.max(0, cell - toNum(r.availLots)),
        lat: 0,
        lng: 0,
        addr: "",
        open: "",
        close: "",
      })
    }

    try {
      for (const r of gnItems(await gnCall("getParkInfo"))) {
        const lot = lots.get(String(r.prkId ?? ""))
        if (!lot) continue
        lot.lat = toNum(r.yCrdn)
        lot.lng = toNum(r.xCrdn)
        lot.addr = String(r.prkAddr ?? "")
        lot.open = String(r.weekOpenTime ?? "")
        lot.close = String(r.weekEndTime ?? "")
      }
    } catch {
      // 좌표·주소 없이도 재차율은 유효 — 상세 표기만 빈다
    }

    // 교차로별 최신 1건만 남긴다 (같은 교차로가 시간대별로 여러 행)
    const roads: GnRoad[] = []
    try {
      const latest = new Map<string, Record<string, unknown>>()
      for (const r of gnItems(await gnCall("getSmrtTrff"))) {
        const k = String(r.crossName ?? "")
        if (!k) continue
        const prev = latest.get(k)
        if (!prev || String(r.colDate ?? "") > String(prev.colDate ?? "")) latest.set(k, r)
      }
      for (const [k, r] of latest) {
        roads.push({
          crossName: k,
          grade: losGrade(r.los),
          los: String(r.los ?? ""),
          delay: toNum(r.delay),
          volume: toNum(r.volume),
          walker: toNum(r.walker),
        })
      }
    } catch {
      // 도로 축만 강등
    }

    const snap: GangwonSnapshot = { lots, roads, at: Date.now() }
    snapshot = snap
    return snap
  })().finally(() => {
    snapshotPromise = null
  })
  return snapshotPromise
}

// ⚠️availLots=0 은 만차가 아니라 "집계 없음"이다 (2026-08-07 06:57 실측: 13곳 중 7곳이 동시에 0 —
// 개장 전인 성내동광장(08시~)·중앙시장제1(10시~)까지 0인 반면, 같은 시각 강문제1은 170/170,
// 중앙시장제3은 32/32로 정상적인 '텅 빔'을 보고했다). 0을 재차율 100%로 읽으면 새벽 내내
// 강릉역 410면이 "붐빔"이 된다 — 그 주차장을 등급 산출에서 빼고, 근거가 하나도 없으면 정보 없음.
export function isCounting(lot: GnLot): boolean {
  return lot.cell > 0 && lot.cell !== lot.cur
}

function parkLvOf(s: GangwonSpotDef, snap: GangwonSnapshot): number {
  let best = 0
  for (const [id] of s.prk) {
    const lot = snap.lots.get(id)
    if (!lot || !isCounting(lot)) continue
    const ratio = lot.cur / lot.cell
    best = Math.max(best, ratio < 0.6 ? 1 : ratio < 0.8 ? 2 : ratio < 0.95 ? 3 : 4)
  }
  return best
}

function roadRowsOf(s: GangwonSpotDef, snap: GangwonSnapshot): GnRoad[] {
  return snap.roads.filter((r) => s.roads.some((k) => r.crossName.includes(k)))
}

function roadLvOf(s: GangwonSpotDef, snap: GangwonSnapshot): number {
  const rows = roadRowsOf(s, snap)
  if (rows.length === 0) return 0
  const mean = rows.reduce((sum, r) => sum + r.grade, 0) / rows.length
  return Math.max(1, Math.min(3, Math.round(mean)))
}

const LV_BY_N = ["", "여유", "보통", "약간 붐빔", "붐빔"]

function levelOf(s: GangwonSpotDef, snap: GangwonSnapshot): { level: string; parkLv: number; roadLv: number } {
  const parkLv = parkLvOf(s, snap)
  const roadLv = roadLvOf(s, snap)
  const n = Math.max(parkLv, roadLv)
  // 두 축 모두 원천이 없으면 등급을 만들지 않는다 (강릉권 밖) — 회색 "정보 없음"으로 나간다
  return { level: n ? LV_BY_N[n] : NO_DATA, parkLv, roadLv }
}

export async function fetchGangwonSpots(): Promise<CrowdSpot[]> {
  const snap = await loadSnapshot()
  return GANGWON_SPOTS.map((s) => {
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

/** KBS 재난 CCTV — 목록의 url을 한 번 더 GET해야 토큰 붙은 m3u8이 나온다 (매번 재발급) */
async function resolveCams(cams: Array<[string, string]>): Promise<CrowdCctv[]> {
  if (cams.length === 0) return []
  let list: Array<Record<string, unknown>> = []
  try {
    const res = await fetch(KBSCAM, { cache: "no-store", signal: AbortSignal.timeout(10000) })
    if (!res.ok) return []
    const d = (await res.json()) as { cctvList?: Array<Record<string, unknown>> }
    list = d.cctvList ?? []
  } catch {
    return []
  }
  const byId = new Map(list.map((c) => [String(c.cctvId ?? ""), c]))

  const out = await Promise.all(
    cams.map(async ([id, camName]): Promise<CrowdCctv | null> => {
      const row = byId.get(id)
      const req = String(row?.url ?? "")
      if (!req) return null
      try {
        const res = await fetch(req, { cache: "no-store", signal: AbortSignal.timeout(10000) })
        if (!res.ok) return null
        const src = (await res.text()).trim()
        if (!src.startsWith("http")) return null
        return {
          name: String(row?.name ?? camName),
          lat: toNum(row?.lat),
          lng: toNum(row?.lng),
          streamId: id,
          src,
          kind: "hls",
        }
      } catch {
        return null
      }
    }),
  )
  return out.filter((c): c is CrowdCctv => c != null)
}

export async function fetchGangwonDetail(name: string): Promise<CrowdDetail> {
  const def = GANGWON_SPOTS.find((s) => s.name === name)
  if (!def) throw new Error(`unknown gangwon spot: ${name}`)

  const kstNow = new Date(Date.now() + 9 * 3600 * 1000)
  const ymd = kstNow.toISOString().slice(0, 10).replace(/-/g, "")

  const [snap, beachRaw, weatherRaw, cctv] = await Promise.all([
    loadSnapshot(),
    def.beach ? krgovJson(`${BEACH}?beachCode=${def.beach}&date=${ymd}`).catch(() => null) : Promise.resolve(null),
    fetch(
      `${METEO}?latitude=${def.lat}&longitude=${def.lng}&hourly=temperature_2m,precipitation_probability&forecast_hours=12&timezone=Asia%2FSeoul`,
      { next: { revalidate: 1800 } },
    )
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null),
    resolveCams(def.cams),
  ])

  const { level, parkLv, roadLv } = levelOf(def, snap)

  const message =
    level === NO_DATA
      ? ["이 지점은 주차·교차로 실시간 원천이 없어 혼잡 등급을 내지 않습니다. 아래 CCTV와 바다·날씨로 확인해주세요."]
      : ["강원은 인파 계측 원천이 없어 접근 도로·주차 혼잡 기준으로 보여드려요."]
  const bits: string[] = []
  if (roadLv) bits.push(`접근 도로 ${roadLv === 1 ? "원활" : roadLv === 2 ? "서행" : "정체"}`)
  if (parkLv) bits.push(`주차 ${LV_BY_N[parkLv]}`)
  if (bits.length > 0) message.push(`지금 ${bits.join(" · ")} 수준이에요.`)

  const beachRows = ((beachRaw as { selectBeach?: Array<Record<string, unknown>> } | null)?.selectBeach ?? []).filter(
    (r) => String(r.date ?? "").replace(/-/g, "") === ymd,
  )
  const beach: CrowdBeachInfo[] = beachRows.map((r) => ({
    gubun: String(r.gubun ?? ""),
    waterTemp: String(r.waterTemp ?? "").trim(),
    waveHeight: String(r.waveHeight ?? "").trim(),
    index: String(r.beachIndex ?? "").trim(),
  }))

  const hourly = (weatherRaw as { hourly?: Record<string, unknown[]> } | null)?.hourly
  const times = (hourly?.time ?? []) as string[]
  const weather: CrowdWeatherHour[] = times.slice(0, 12).map((iso, i) => ({
    hour: `${Number.parseInt(String(iso).slice(11, 13), 10)}시`,
    temp: hourly?.temperature_2m?.[i] != null ? Math.round(toNum(hourly.temperature_2m[i])) : null,
    rainProb: hourly?.precipitation_probability?.[i] != null ? toNum(hourly.precipitation_probability[i]) : null,
    precip: "",
    icon: "",
  }))

  return {
    name,
    city: "gangwon",
    beach: beach.length > 0 ? beach : undefined,
    level,
    levelNum: levelNum(level),
    color: LEVEL_COLORS[level] ?? "#999",
    message,
    trend: {
      hour1: { rate: "", dir: "" },
      hour3: { rate: "", dir: "" },
      month1: { rate: "", dir: "" },
    },
    gender: { male: 0, female: 0 },
    ages: [],
    resident: { resident: 0, nonResident: 0 },
    series: [],
    nowIndex: -1,
    peakPastHour: "",
    peakForecastHour: "",
    peakForecastLevel: "",
    weather,
    cctv,
    updatedAt: new Date().toISOString(),
  }
}

/** 강원 부가정보 — 서울 CrowdExtra 형태로 수렴 (주차 잔여·교차로 소통) */
export async function fetchGangwonExtra(name: string): Promise<CrowdExtra> {
  const def = GANGWON_SPOTS.find((s) => s.name === name)
  if (!def) throw new Error(`unknown gangwon spot: ${name}`)
  const snap = await loadSnapshot()

  const lots = def.prk
    .map(([id, fallbackName]) => {
      const lot = snap.lots.get(id)
      // 집계가 멈춘 주차장(잔여 0 고정)은 잔여 0대로 보여주면 오독을 부른다 — 아예 뺀다
      if (!lot || !isCounting(lot)) return null
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
  const ROAD_IDX = ["", "원활", "서행", "정체"]
  const ROAD_COLOR = ["", "#00d369", "#ffb100", "#ff3939"]
  // 원천에 통행속도가 없다 — 교차로 평균 지체(초)를 안내문으로 대신한다
  const delays = roadRows.map((r) => r.delay).filter((v) => v > 0)

  return {
    alerts: [],
    parking:
      lots.length > 0
        ? { available, percent: capacity > 0 ? Math.round((available / capacity) * 100) : 0, lots }
        : null,
    events: [],
    road: roadLv
      ? {
          idx: ROAD_IDX[roadLv],
          speed: 0,
          msg:
            delays.length > 0
              ? `${roadRows.length}개 교차로 평균 지체 ${Math.round(delays.reduce((a, b) => a + b, 0) / delays.length)}초`
              : "",
          color: ROAD_COLOR[roadLv],
        }
      : null,
    bike: null,
    updatedAt: new Date().toISOString(),
  }
}
