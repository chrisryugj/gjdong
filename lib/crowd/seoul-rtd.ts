// 서울시 실시간 도시데이터(SeoulRtd) 공개 엔드포인트 연동 (서버 전용)
// 인증키 불필요 — data.seoul.go.kr/SeoulRtd 웹이 쓰는 공개 API를 프록시한다.
// Referer 헤더가 없으면 빈 응답을 주므로 반드시 포함할 것.

const RTD_BASE = "https://data.seoul.go.kr/SeoulRtd/api"

const RTD_HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
  Referer: "https://data.seoul.go.kr/SeoulRtd/map",
  Accept: "application/json, text/plain, */*",
}

export const CONGEST_LEVELS = ["여유", "보통", "약간 붐빔", "붐빔"] as const
export type CongestLevel = (typeof CONGEST_LEVELS)[number]

// 서울시 공식 혼잡도 색 (API congestion_color와 동일 체계)
export const LEVEL_COLORS: Record<string, string> = {
  여유: "#00d369",
  보통: "#ffb100",
  "약간 붐빔": "#ff8040",
  붐빔: "#ff3939",
}

// 라이트 테마에서 소형 텍스트 대비(WCAG 4.5:1) 확보용 진한 변형 — 배경 틴트·다크 테마는 원색 유지
const LEVEL_TEXT_COLORS_LIGHT: Record<string, string> = {
  "#00d369": "#15803d",
  "#ffb100": "#b45309",
  "#ff8040": "#c2410c",
  "#ff3939": "#b91c1c",
}

export function textColor(color: string, light: boolean): string {
  return light ? (LEVEL_TEXT_COLORS_LIGHT[color] ?? color) : color
}

export function levelNum(level: string): number {
  const idx = CONGEST_LEVELS.indexOf(level as CongestLevel)
  return idx === -1 ? 0 : idx + 1
}

export interface CrowdSpot {
  name: string
  category: string
  lat: number
  lng: number
  level: string
  levelNum: number
  color: string
}

export interface CrowdSeriesPoint {
  time: string // "17시" | "현재"
  people: number
  range: string // "14,000~16,000명"
  yesterday: number | null
  level: string
  color: string
  kind: "past" | "now" | "forecast"
}

export interface CrowdCctv {
  name: string
  lat: number // 좌표 미제공 카메라(부산 큐레이션)는 0 — 지도 마커·거리 표기 생략
  lng: number
  streamId: string
  src: string // http HLS 원본 — 재생은 서울시 https 플레이어 페이지 iframe으로
  /** hls = https+CORS 개방 스트림(TOPIS·부산) — hls.js/네이티브로 직접 재생. 생략 = 서울 RTD 프록시 */
  kind?: "rtd" | "hls"
}

/** 해수욕장 생활지수(KHOA) — 부산 해변 명소 전용 */
export interface CrowdBeachInfo {
  gubun: string // 오전·오후
  waterTemp: string
  waveHeight: string
  index: string // 매우좋음~나쁨
}

export interface CrowdWeatherHour {
  hour: string
  temp: number | null
  rainProb: number | null
  precip: string
  icon: string
}

export interface CrowdDetail {
  name: string
  /** 데이터 도시 — 클라이언트가 도시별 렌더 분기(히트맵·도민/관광객 라벨 등)에 사용. 생략 = seoul */
  city?: "seoul" | "jeju" | "busan" | "gangwon" | "incheon"
  /** 해변 명소만 (부산·강원) — 수온·파고·해수욕지수 */
  beach?: CrowdBeachInfo[]
  level: string
  levelNum: number
  color: string
  message: string[]
  trend: {
    hour1: { rate: string; dir: string }
    hour3: { rate: string; dir: string }
    month1: { rate: string; dir: string }
  }
  gender: { male: number; female: number }
  ages: Array<{ label: string; value: number }>
  resident: { resident: number; nonResident: number }
  series: CrowdSeriesPoint[]
  nowIndex: number
  peakPastHour: string
  peakForecastHour: string
  peakForecastLevel: string
  weather: CrowdWeatherHour[]
  cctv: CrowdCctv[]
  updatedAt: string
}

// ── 상세 부가정보 (사고통제·주차·문화행사·도로소통·따릉이) — 지연 로드용 별도 응답
// 신규 엔드포인트 좌표축 실측: acc X=lng/Y=lat, bike sbike_x=lng/sbike_y=lat,
// parking lat/lng 명시, event x=lng/y=lat (hotspot-category의 x=lat와 반대이니 주의)

export interface CrowdAlert {
  type: string // 교통사고·공사·집회 등
  detail: string
  info: string
  occurredAt: string
  expectedClearAt: string
}

export interface CrowdParkingLot {
  name: string
  capacity: number
  available: number
  lat: number
  lng: number
}

export interface CrowdEvent {
  title: string
  place: string
  period: string
  free: boolean
  category: string
  url: string
}

export interface CrowdRoadInfo {
  idx: string // 원활·서행·정체
  speed: number
  msg: string
  color: string
}

export interface CrowdBikeStation {
  name: string
  bikes: number
  racks: number
  lat: number
  lng: number
}

export interface CrowdExtra {
  alerts: CrowdAlert[]
  parking: { available: number; percent: number; lots: CrowdParkingLot[] } | null
  events: CrowdEvent[]
  road: CrowdRoadInfo | null
  bike: { bikes: number; stations: CrowdBikeStation[] } | null
  updatedAt: string
}

export interface CrowdDisaster {
  type: string // 폭염·호우 등
  step: string // 안전안내·긴급재난 등
  content: string
  at: string
}

/** 오늘 발송된 재난문자 — 전 명소 공통이라 대시보드 배너용 (기준 명소는 아무 곳이나 무방) */
export async function fetchDisasterToday(name = "광화문·덕수궁"): Promise<CrowdDisaster[]> {
  const raw = await rtdFetch(`disaster-message/today/${encodeURIComponent(name)}`, {})
  return (Array.isArray(raw) ? raw : [])
    .map((m: Record<string, string>) => ({
      type: m.DST_SE_NM ?? "",
      step: m.EMRG_STEP_NM ?? "",
      content: (m.MSG_CN ?? "").trim(),
      at: m.CRT_DT ?? "",
    }))
    .filter((m) => m.content)
}

export async function fetchSpotExtra(name: string): Promise<CrowdExtra> {
  const [accRaw, parkingRaw, eventRaw, roadRaw, bikeRaw] = await Promise.all([
    rtdFetch("acc", { hotspotNm: name }).catch(() => null),
    rtdFetch("parking", { hotspotNm: name }).catch(() => null),
    rtdFetch("event", { hotspotNm: name }).catch(() => null),
    rtdFetch("road", { hotspotNm: name }).catch(() => null),
    rtdFetch("bike", { hotspotNm: name }).catch(() => null),
  ])

  const alerts: CrowdAlert[] = (Array.isArray(accRaw) ? accRaw : [])
    .map((a: Record<string, string>) => ({
      type: a.ACDNT_TYPE ?? "",
      detail: a.ACDNT_DTYPE ?? "",
      info: (a.ACDNT_INFO ?? "").trim(),
      occurredAt: a.ACDNT_OCCR_DT ?? "",
      expectedClearAt: a.EXP_CLR_DT ?? "",
    }))
    .filter((a) => a.info || a.type)

  // 실시간 잔여를 주는 주차장만 — 정적 목록은 "여유"라는 질문에 답이 안 됨
  const pk = parkingRaw as { publicParkingList?: unknown[]; privateParkingList?: unknown[] } | null
  const lots: CrowdParkingLot[] = [...(pk?.publicParkingList ?? []), ...(pk?.privateParkingList ?? [])]
    .map((p) => p as Record<string, unknown>)
    .filter((p) => p.realtime === true)
    .map((p) => {
      const capacity = toNum(p.cpcty)
      return {
        name: String(p.prk_nm ?? ""),
        capacity,
        available: Math.max(capacity - toNum(p.cur_prk_cnt), 0),
        lat: toNum(p.lat),
        lng: toNum(p.lng),
      }
    })
    .filter((p) => p.name && p.capacity > 0)
  const parkingCapacity = lots.reduce((s, p) => s + p.capacity, 0)
  const parkingAvailable = lots.reduce((s, p) => s + p.available, 0)
  const parking =
    lots.length > 0
      ? {
          available: parkingAvailable,
          percent: Math.round((parkingAvailable / parkingCapacity) * 100),
          lots,
        }
      : null

  // 문화행사: row가 주최기관별 그룹 — 오늘 진행 중인 것만, 무료 우선
  const kstToday = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10)
  const groups = (eventRaw as { row?: Record<string, unknown[]> } | null)?.row ?? {}
  const events: CrowdEvent[] = Object.values(groups)
    .flat()
    .map((e) => e as Record<string, string>)
    .filter((e) => {
      const start = (e.strtDate ?? "").slice(0, 10)
      const end = (e.endDate ?? "").slice(0, 10)
      return start && end && start <= kstToday && kstToday <= end
    })
    .map((e) => ({
      title: (e.TITLE ?? "").trim(),
      place: (e.PLACE ?? "").trim(),
      period: e.DATE ?? "",
      free: e.isFree === "무료",
      category: e.CODENAME ?? "",
      url: e.HMPG_ADDR || e.orgLink || "",
    }))
    .filter((e) => e.title)
    .sort((a, b) => Number(b.free) - Number(a.free))
    .slice(0, 12)

  // row[0]가 핫스팟 전체 요약(지수·평균속도·안내문)을 담고 있음
  const roadRows = (roadRaw as { row?: unknown[] } | null)?.row
  const r0 = Array.isArray(roadRows) && roadRows.length > 0 ? (roadRows[0] as Record<string, string>) : null
  const road: CrowdRoadInfo | null =
    r0 && (r0.ROAD_TRAFFIC_IDX || r0.ROAD_MSG)
      ? {
          idx: r0.ROAD_TRAFFIC_IDX ?? "",
          speed: toNum(r0.ROAD_TRAFFIC_SPD),
          msg: (r0.ROAD_MSG ?? "").trim(),
          color: r0.COLOR ?? "#999",
        }
      : null

  const bk = bikeRaw as { parkingBikeTotCnt?: unknown; row?: unknown[] } | null
  const stations: CrowdBikeStation[] = (bk?.row ?? [])
    .map((s) => s as Record<string, unknown>)
    .map((s) => ({
      name: String(s.sbike_spot_nm ?? "").replace(/^\d+\.\s*/, ""),
      bikes: toNum(s.sbike_parking_cnt),
      racks: toNum(s.sbike_rack_cnt),
      lat: toNum(s.sbike_y),
      lng: toNum(s.sbike_x),
    }))
    .filter((s) => s.name)
    .slice(0, 24)
  const bike = stations.length > 0 ? { bikes: toNum(bk?.parkingBikeTotCnt), stations } : null

  return { alerts, parking, events, road, bike, updatedAt: new Date().toISOString() }
}

/** 서울시 실시간도시데이터의 CCTV 라이브 플레이어 페이지 (HLS 프록시 내장, iframe 허용) */
export function cctvPlayerUrl(item: CrowdCctv): string {
  return `https://data.seoul.go.kr/SeoulRtd/cctv?src=${encodeURIComponent(item.src)}&cctvname=${encodeURIComponent(item.streamId)}`
}

/** 서울시 https HLS 프록시 스트림 — Safari 계열은 이걸 <video>에 직접 물려 네이티브 재생
 * (서울시 iframe 플레이어가 WebKit에서 "원본 시스템 점검중" 오류를 내는 문제 우회) */
export function cctvStreamUrl(item: CrowdCctv): string {
  return `https://data.seoul.go.kr/SeoulRtd/cctv/proxy?src=${encodeURIComponent(item.src)}`
}

/** 네이티브 HLS 재생 지원 여부 (Safari/iOS). 클라이언트 전용 */
export function supportsNativeHls(): boolean {
  if (typeof document === "undefined") return false
  const video = document.createElement("video")
  return video.canPlayType("application/vnd.apple.mpegurl") !== ""
}

async function rtdFetch(path: string, params: Record<string, string>): Promise<unknown> {
  const qs = new URLSearchParams(params).toString()
  const res = await fetch(`${RTD_BASE}/${path}?${qs}`, {
    headers: RTD_HEADERS,
    cache: "no-store",
    signal: AbortSignal.timeout(15000),
  })
  if (!res.ok) throw new Error(`SeoulRtd ${path} HTTP ${res.status}`)
  const text = await res.text()
  if (!text) throw new Error(`SeoulRtd ${path} empty response`)
  return JSON.parse(text)
}

interface RawCategoryRow {
  area_nm: string
  category: string
  x: string // 위도
  y: string // 경도 (서울시 응답이 x=lat, y=lng로 뒤집혀 있음)
  area_congest_lvl: string
  congestion_color: string
  area_congest_num: number
}

export async function fetchAllSpots(): Promise<CrowdSpot[]> {
  // count 상한이 있어 50개씩 3페이지 병렬 조회 (전체 121곳)
  const pages = await Promise.all(
    [1, 2, 3].map((page) =>
      rtdFetch("hotspot-category", {
        page: String(page),
        category: "전체보기",
        count: "50",
        sort: "false",
      }) as Promise<{ total: number; row: RawCategoryRow[] }>,
    ),
  )

  const seen = new Set<string>()
  const spots: CrowdSpot[] = []
  for (const page of pages) {
    for (const row of page.row ?? []) {
      if (seen.has(row.area_nm)) continue
      seen.add(row.area_nm)
      const lat = Number.parseFloat(row.x)
      const lng = Number.parseFloat(row.y)
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue
      spots.push({
        name: row.area_nm,
        category: row.category,
        lat,
        lng,
        level: row.area_congest_lvl,
        levelNum: levelNum(row.area_congest_lvl),
        color: LEVEL_COLORS[row.area_congest_lvl] ?? row.congestion_color ?? "#999",
      })
    }
  }
  return spots
}

function splitPipe(value: unknown): string[] {
  return typeof value === "string" && value.length > 0 ? value.split("|") : []
}

function toNum(value: unknown): number {
  const n = Number.parseFloat(String(value ?? ""))
  return Number.isFinite(n) ? n : 0
}

export async function fetchSpotDetail(name: string): Promise<CrowdDetail> {
  const [ppltnRaw, congestRaw, weatherRaw, cctvRaw] = await Promise.all([
    rtdFetch("ppltn", { hotspotNm: name }),
    rtdFetch("ppltn_congest", { hotspotNm: name }),
    rtdFetch("weather", { hotspotNm: name }).catch(() => null),
    rtdFetch("cctv", { hotspotNm: name }).catch(() => null),
  ])

  const ppltn = (Array.isArray(ppltnRaw) ? ppltnRaw[0] : null) as Record<string, string> | null
  const congest = (Array.isArray(congestRaw) ? congestRaw[0] : null) as Record<string, string> | null
  if (!ppltn || !congest) throw new Error(`SeoulRtd detail missing for ${name}`)

  const times = splitPipe(congest.time_cd)
  const people = splitPipe(congest.people_value).map(toNum)
  const ranges = splitPipe(congest.people_interval).map((s) => s.replace(/\//g, ","))
  const levels = splitPipe(congest.congestion_label_list)
  const colors = splitPipe(congest.congestion_color_list)
  const yesterday = splitPipe(congest.before_people_value).map(toNum)
  const nowIndex = times.indexOf("현재")

  const series: CrowdSeriesPoint[] = times.map((time, i) => ({
    time: time.replace(/^\d+\/\d+ /, ""), // "8/02 0시" → "0시"
    people: people[i] ?? 0,
    range: ranges[i] ?? "",
    yesterday: Number.isFinite(yesterday[i]) ? yesterday[i] : null,
    level: levels[i] ?? "",
    color: LEVEL_COLORS[levels[i]] ?? colors[i] ?? "#999",
    kind: i === nowIndex ? "now" : i < nowIndex ? "past" : "forecast",
  }))

  // 안내 문구: "<li>...</li><li>...</li>" → 문장 배열
  const message = (ppltn.congestion_instruction ?? "")
    .split(/<\/?li>/)
    .map((s) => s.replace(/<[^>]+>/g, "").trim())
    .filter(Boolean)

  const ages = [
    { label: "10대 이하", value: toNum(ppltn.RATE_10_VALUE) },
    { label: "20대", value: toNum(ppltn.RATE_20_VALUE) },
    { label: "30대", value: toNum(ppltn.RATE_30_VALUE) },
    { label: "40대", value: toNum(ppltn.RATE_40_VALUE) },
    { label: "50대", value: toNum(ppltn.RATE_50_VALUE) },
    { label: "60대 이상", value: toNum(ppltn.RATE_60_VALUE) },
  ]

  const w24 = ((weatherRaw as { w24?: unknown[] } | null)?.w24 ?? []) as Array<Record<string, string>>
  const weather: CrowdWeatherHour[] = w24.slice(0, 12).map((w) => ({
    hour: w.fcstHour ?? "",
    temp: w.TMP ? toNum(w.TMP) : null,
    rainProb: w.POP ? toNum(w.POP) : null,
    precip: w.PCP && w.PCP !== "-" ? w.PCP : "",
    icon: w.icon ?? "",
  }))

  // CCTV: 좌표는 XCOORD=경도, YCOORD=위도 (hotspot-category와 반대 방향이니 주의)
  const cctv: CrowdCctv[] = (Array.isArray(cctvRaw) ? cctvRaw : [])
    .map((c: Record<string, string>) => ({
      name: c.CCTVNAME ?? "",
      lat: toNum(c.YCOORD),
      lng: toNum(c.XCOORD),
      streamId: c.STRMID ?? "",
      src: c.src ?? "",
    }))
    .filter((c) => c.name && Number.isFinite(c.lat) && c.lat !== 0)

  const level = ppltn.congestion_text || series[nowIndex]?.level || ""

  return {
    name,
    level,
    levelNum: levelNum(level),
    color: LEVEL_COLORS[level] ?? ppltn.congestion_color ?? "#999",
    message,
    trend: {
      hour1: { rate: ppltn.ONEHOUR_RATE ?? "", dir: ppltn.ONEHOUR_RATE_UP_DOWN ?? "" },
      hour3: { rate: ppltn.THREEHOUR_RATE ?? "", dir: ppltn.THREEHOUR_RATE_UP_DOWN ?? "" },
      month1: { rate: ppltn.ONEMONTH_RATE ?? "", dir: ppltn.ONEMONTH_RATE_UP_DOWN ?? "" },
    },
    gender: { male: toNum(ppltn.MALE_PPLTN_RATE), female: toNum(ppltn.FEMALE_PPLTN_RATE) },
    ages,
    resident: { resident: toNum(ppltn.RESIDENT_VALUE), nonResident: toNum(ppltn.NON_RESIDENT_VALUE) },
    series,
    nowIndex,
    peakPastHour: congest.before_max_congestion_hour ?? "",
    peakForecastHour: congest.predict_max_congestion_hour ?? "",
    peakForecastLevel: congest.predict_max_congestion_text ?? "",
    weather,
    cctv,
    updatedAt: new Date().toISOString(),
  }
}
