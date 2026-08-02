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
  lat: number
  lng: number
  streamId: string
  src: string // http HLS 원본 — 재생은 서울시 https 플레이어 페이지 iframe으로
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
