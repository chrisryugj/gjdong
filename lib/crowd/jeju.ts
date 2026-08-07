// 제주관광공사 빅데이터 지도 백엔드(GEONET, SKT 기반) 연동 (서버 전용)
// 인증키 불필요. 원형(중심좌표+반경) 단위 조회라 명소당 1콜 — 목록은 배치 병렬로 수집한다.
//
// 데이터 계약 (2026-08-04 실측):
// - getTimePopByCircle: SELECT(성별×연령 20컬럼) 필수 — 26행 [{IN_POP,OUT_POP,TIME}]
//   TIME='NOW'(현재)·'3AVG'(최근 3시간 평균)·이후 현재 시각부터 역순 24시간. IN=도민, OUT=관광객.
// - getSexAgePopByCircle: [도민 성×연령 20키, 관광객 성×연령 20키] 2행(한글 키).
// - 호스트가 TLS 중간 인증서 누락 체인이라 체인 검증을 끄고 통신한다(krgovFetch).
//
// ⚠️2026-08-07: 원천이 `Sec-Fetch-Site: same-origin` 이 없는 요청을 403으로 막기 시작했다.
//   실측으로 좁힌 결과 이 헤더 하나가 전부다 — UA·Referer·Accept-*·TLS 버전은 전부 무관하고,
//   cross-site·none 값은 403이다. 자기 페이지의 XHR만 받겠다는 뜻이라 호출을 아끼는 게 전제다:
//   목록 캐시 15분 + 클라이언트 숨김 탭 정지로 낮춰 두었다(2026-08 차단 사고 대응).
//   80포트는 이제 301로 https로 넘긴다 — http 직결은 더 이상 통하지 않는다.

import {
  LEVEL_COLORS,
  levelNum,
  type CrowdCctv,
  type CrowdDetail,
  type CrowdSeriesPoint,
  type CrowdSpot,
  type CrowdWeatherHour,
} from "@/lib/crowd/seoul-rtd"
import { krgovJson } from "@/lib/crowd/krgov-fetch"

const GEONET = "https://jeju.mms.gislab.co.kr/mms_new/GEONET."
// 원천이 자기 페이지發 XHR만 받는다 — 이 헤더가 빠지면 전건 403
const GEONET_HEADERS = { "Sec-Fetch-Site": "same-origin" }
const GEONET_SEL =
  "M_POP_00,M_POP_10,M_POP_20,M_POP_30,M_POP_40,M_POP_50,M_POP_60,M_POP_70,M_POP_80,M_POP_90,W_POP_00,W_POP_10,W_POP_20,W_POP_30,W_POP_40,W_POP_50,W_POP_60,W_POP_70,W_POP_80,W_POP_90"
const METEO = "https://api.open-meteo.com/v1/forecast"

interface JejuSpotDef {
  name: string
  category: string
  lat: number
  lng: number
  r: number // 조회 반경(m): 시장/거리 400~500 · 해변/오름 500~800 · 단지/섬 900~2600
}

// 명소 66곳 — 좌표는 nominatim 교차검증 + GEONET 커버리지 스윕을 통과한 값 (2026-08-03 실측 데이터)
export const JEJU_SPOTS: JejuSpotDef[] = [
  // ── 제주시 도심권
  { name: "동문재래시장", category: "시장·거리", lat: 33.5121, lng: 126.5286, r: 500 },
  { name: "칠성로 쇼핑거리", category: "시장·거리", lat: 33.5133, lng: 126.524, r: 400 },
  { name: "탑동 해변공연장", category: "시장·거리", lat: 33.5178, lng: 126.5197, r: 500 },
  { name: "누웨마루 거리", category: "시장·거리", lat: 33.489, lng: 126.4959, r: 500 },
  { name: "제주시청 대학로", category: "시장·거리", lat: 33.4996, lng: 126.5312, r: 400 },
  { name: "용두암", category: "오름·자연", lat: 33.5165, lng: 126.5119, r: 400 },
  { name: "사라봉", category: "오름·자연", lat: 33.5187, lng: 126.547, r: 500 },
  { name: "도두봉·무지개해안도로", category: "오름·자연", lat: 33.5088, lng: 126.4655, r: 700 },
  { name: "제주국제공항", category: "교통", lat: 33.5104, lng: 126.4914, r: 800 },
  { name: "삼양검은모래해변", category: "해변", lat: 33.5252, lng: 126.5855, r: 600 },
  { name: "이호테우해변", category: "해변", lat: 33.4977, lng: 126.453, r: 600 },
  { name: "한라수목원", category: "오름·자연", lat: 33.4696, lng: 126.4944, r: 500 },
  // ── 조천·구좌 (동북)
  { name: "함덕해수욕장·서우봉", category: "해변", lat: 33.5434, lng: 126.6694, r: 800 },
  { name: "김녕해수욕장", category: "해변", lat: 33.5578, lng: 126.7595, r: 600 },
  { name: "만장굴", category: "관광지", lat: 33.5283, lng: 126.7715, r: 500 },
  { name: "비자림", category: "오름·자연", lat: 33.4907, lng: 126.8095, r: 600 },
  { name: "월정리해변", category: "해변", lat: 33.5565, lng: 126.796, r: 600 },
  { name: "세화해변·세화시장", category: "해변", lat: 33.5253, lng: 126.8603, r: 600 },
  { name: "다랑쉬오름", category: "오름·자연", lat: 33.4813, lng: 126.8253, r: 500 },
  { name: "용눈이오름", category: "오름·자연", lat: 33.457, lng: 126.832, r: 500 },
  { name: "아부오름", category: "오름·자연", lat: 33.4476, lng: 126.7797, r: 500 },
  { name: "산굼부리", category: "오름·자연", lat: 33.434, lng: 126.6885, r: 500 },
  { name: "에코랜드 테마파크", category: "관광지", lat: 33.4585, lng: 126.6673, r: 600 },
  { name: "제주돌문화공원", category: "관광지", lat: 33.4405, lng: 126.6605, r: 600 },
  { name: "절물자연휴양림", category: "오름·자연", lat: 33.4415, lng: 126.6325, r: 700 },
  { name: "사려니숲길", category: "오름·자연", lat: 33.4235, lng: 126.6333, r: 900 },
  { name: "거문오름", category: "오름·자연", lat: 33.456, lng: 126.7205, r: 600 },
  // ── 성산·표선 (동남)
  { name: "성산일출봉", category: "오름·자연", lat: 33.4587, lng: 126.9423, r: 1200 },
  { name: "광치기해변", category: "해변", lat: 33.45, lng: 126.9195, r: 600 },
  { name: "섭지코지", category: "관광지", lat: 33.43, lng: 126.926, r: 800 },
  { name: "성산포항(우도 배편)", category: "섬·포구", lat: 33.4737, lng: 126.9285, r: 400 },
  { name: "우도", category: "섬·포구", lat: 33.503, lng: 126.953, r: 2600 },
  { name: "성읍민속마을", category: "관광지", lat: 33.3925, lng: 126.7995, r: 500 },
  { name: "표선해수욕장·민속촌", category: "해변", lat: 33.3268, lng: 126.842, r: 700 },
  // ── 남원·서귀포
  { name: "큰엉해안경승지", category: "오름·자연", lat: 33.2697, lng: 126.7063, r: 600 },
  { name: "쇠소깍", category: "폭포·계곡", lat: 33.252, lng: 126.6235, r: 500 },
  { name: "정방폭포", category: "폭포·계곡", lat: 33.2447, lng: 126.5717, r: 400 },
  { name: "서귀포매일올레시장", category: "시장·거리", lat: 33.25, lng: 126.563, r: 450 },
  { name: "천지연폭포", category: "폭포·계곡", lat: 33.2447, lng: 126.5545, r: 500 },
  { name: "외돌개·황우지해안", category: "오름·자연", lat: 33.239, lng: 126.542, r: 500 },
  { name: "돈내코 원앙폭포", category: "폭포·계곡", lat: 33.2828, lng: 126.5838, r: 500 },
  // ── 중문·안덕·대정 (서남)
  { name: "중문관광단지", category: "관광지", lat: 33.248, lng: 126.412, r: 1000 },
  { name: "대포주상절리", category: "오름·자연", lat: 33.2377, lng: 126.4255, r: 500 },
  { name: "박수기정·대평포구", category: "섬·포구", lat: 33.238, lng: 126.3945, r: 400 },
  { name: "카멜리아힐", category: "관광지", lat: 33.2895, lng: 126.3685, r: 500 },
  { name: "제주신화월드", category: "관광지", lat: 33.3055, lng: 126.32, r: 900 },
  { name: "오설록 티뮤지엄", category: "관광지", lat: 33.3057, lng: 126.2895, r: 600 },
  { name: "산방산·용머리해안", category: "오름·자연", lat: 33.234, lng: 126.3125, r: 700 },
  { name: "사계해변", category: "해변", lat: 33.2258, lng: 126.2965, r: 600 },
  { name: "화순금모래해수욕장", category: "해변", lat: 33.2385, lng: 126.339, r: 500 },
  { name: "송악산", category: "오름·자연", lat: 33.2005, lng: 126.29, r: 700 },
  { name: "가파도", category: "섬·포구", lat: 33.1735, lng: 126.2725, r: 1200 },
  { name: "모슬포항(운진항)", category: "섬·포구", lat: 33.2145, lng: 126.251, r: 500 },
  { name: "수월봉·차귀도포구", category: "섬·포구", lat: 33.302, lng: 126.165, r: 900 },
  // ── 한림·애월 (서북)
  { name: "신창풍차해안도로", category: "해변", lat: 33.3445, lng: 126.178, r: 700 },
  { name: "협재·금능해수욕장", category: "해변", lat: 33.392, lng: 126.2375, r: 800 },
  { name: "한림매일시장", category: "시장·거리", lat: 33.4128, lng: 126.2622, r: 400 },
  { name: "금오름", category: "오름·자연", lat: 33.352, lng: 126.306, r: 500 },
  { name: "새별오름", category: "오름·자연", lat: 33.368, lng: 126.3595, r: 600 },
  { name: "애월한담해안산책로", category: "해변", lat: 33.4642, lng: 126.312, r: 600 },
  { name: "곽지해수욕장", category: "해변", lat: 33.4508, lng: 126.305, r: 600 },
  // ── 한라산
  { name: "1100고지 습지", category: "한라산", lat: 33.3565, lng: 126.462, r: 500 },
  { name: "어리목 탐방로", category: "한라산", lat: 33.3925, lng: 126.4955, r: 500 },
  { name: "영실 탐방로", category: "한라산", lat: 33.348, lng: 126.478, r: 500 },
  { name: "성판악 탐방로", category: "한라산", lat: 33.3852, lng: 126.6195, r: 500 },
  { name: "한라산 백록담", category: "한라산", lat: 33.3617, lng: 126.5292, r: 500 },
]

interface GeonetRow {
  IN_POP: number | string
  OUT_POP: number | string
  TIME: number | string
}

/**
 * 원천 직결. 국내 일반 회선에서는 이것만으로 충분하다.
 * 클라우드 IP에서는 403 대신 200+빈 배열이 오므로 호출부가 폴백을 판단한다.
 */
async function geonetDirect(path: string): Promise<unknown> {
  return krgovJson(`${GEONET}${path}`, { headers: GEONET_HEADERS, timeoutMs: 12000 })
}

/**
 * 우회 경로 — 원천이 받아주는 회선에 있는 프록시를 경유한다.
 * `GEONET_PROXY`에 `...?url=` 형태의 프리픽스를 넣으면 그 뒤에 인코딩된 원천 URL을 붙인다.
 * 응답이 `{status, body}` 봉투면 벗기고, 원문 그대로면 그대로 파싱한다.
 */
async function geonetViaProxy(path: string, proxy: string): Promise<unknown> {
  const raw = await krgovJson(`${proxy}${encodeURIComponent(`${GEONET}${path}`)}`, { timeoutMs: 15000 })
  const env = raw as { status?: number; body?: unknown; error?: string } | null
  if (env && typeof env === "object" && "body" in env) {
    // 봉투가 실패를 알리는 방식이 둘이다: 상류 상태코드, 그리고 프록시 자체 사유(쿨다운 등).
    // status 0 + body "" 를 성공으로 읽으면 JSON.parse("")가 터져 원인이 가려진다.
    if (env.error) throw new Error(`proxy ${env.error}`)
    if (typeof env.status === "number" && (env.status === 0 || env.status >= 400)) {
      throw new Error(`proxy upstream ${env.status}`)
    }
    return typeof env.body === "string" ? JSON.parse(env.body) : env.body
  }
  return raw
}

// 빈 배열 = 원천이 이 회선을 조용히 거절한 것(클라우드 IP 실측). 직결이 빈손이면 프록시로 한 번 더 간다.
function isEmpty(rows: unknown): boolean {
  return !Array.isArray(rows) || rows.length === 0
}

async function geonetFetch(path: string): Promise<unknown> {
  const proxy = process.env.GEONET_PROXY
  try {
    const direct = await geonetDirect(path)
    if (!isEmpty(direct) || !proxy) return direct
  } catch (err) {
    if (!proxy) throw err
  }
  return geonetViaProxy(path, proxy)
}

function popUrl(s: JejuSpotDef): string {
  return `getTimePopByCircle.php?SELECT=${GEONET_SEL}&X=${s.lng}&Y=${s.lat}&R=${s.r}`
}

function toNum(v: unknown): number {
  const n = Number.parseFloat(String(v ?? ""))
  return Number.isFinite(n) ? n : 0
}

interface JejuPop {
  inp: number // 도민
  outp: number // 관광객
  total: number
  avg3: number | null
  series: Array<{ h: number; v: number }> // 시간 오름차순 24점
}

function parsePop(rows: GeonetRow[]): JejuPop | null {
  let nowRow: GeonetRow | null = null
  let avgRow: GeonetRow | null = null
  const series: Array<{ h: number; v: number }> = []
  for (const r of rows) {
    if (r.TIME === "NOW") nowRow = r
    else if (r.TIME === "3AVG") avgRow = r
    else if (r.IN_POP !== "" && r.IN_POP != null) series.push({ h: +r.TIME, v: toNum(r.IN_POP) + toNum(r.OUT_POP) })
  }
  if (!nowRow || nowRow.IN_POP === "" || nowRow.IN_POP == null) return null
  series.reverse() // 응답 = 현재 시각부터 역순 → 오름차순
  const inp = toNum(nowRow.IN_POP)
  const outp = toNum(nowRow.OUT_POP)
  return {
    inp,
    outp,
    total: inp + outp,
    avg3: avgRow ? toNum(avgRow.IN_POP) + toNum(avgRow.OUT_POP) : null,
    series,
  }
}

// 혼잡 등급 파생 — 원천에 등급이 없어(절대 인구뿐) 두 축으로 산출:
// ① 리듬 비율 = 현재 ÷ 자기 지난 24시간 최대 (자기 정규화 — 지점 간 규모 차 무관)
// ② 밀도 상한 = 인구/면적(명/km²)이 낮으면 등급 상한 (한적한 넓은 반경이 자기 피크라는
//    이유만으로 '붐빔'이 되는 과대해석 방지)
const LV_BY_N = ["", "여유", "보통", "약간 붐빔", "붐빔"]
function deriveLevel(now: number, rhythmMax: number, rKm: number): string {
  const ratio = now / Math.max(rhythmMax, 1)
  const n = ratio >= 0.85 ? 4 : ratio >= 0.6 ? 3 : ratio >= 0.35 ? 2 : 1
  const dens = now / Math.max(Math.PI * rKm * rKm, 0.01)
  const cap = dens < 60 ? 1 : dens < 250 ? 2 : dens < 800 ? 3 : 4
  return LV_BY_N[Math.min(n, cap)]
}

export async function fetchJejuSpots(): Promise<CrowdSpot[]> {
  const spots: CrowdSpot[] = []
  let firstError: string | undefined
  const BATCH = 8
  for (let i = 0; i < JEJU_SPOTS.length; i += BATCH) {
    await Promise.all(
      JEJU_SPOTS.slice(i, i + BATCH).map(async (s) => {
        try {
          const rows = (await geonetFetch(popUrl(s))) as GeonetRow[]
          if (!Array.isArray(rows)) {
            firstError ??= `not-array: ${JSON.stringify(rows).slice(0, 160)}`
            return
          }
          const pop = parsePop(rows)
          if (!pop) {
            firstError ??= `parse-null(len=${rows.length}): ${JSON.stringify(rows[0] ?? null).slice(0, 160)}`
            return
          }
          const rhythmMax = Math.max(...pop.series.map((x) => x.v), pop.total, 1)
          const level = deriveLevel(pop.total, rhythmMax, s.r / 1000)
          spots.push({
            name: s.name,
            category: s.category,
            lat: s.lat,
            lng: s.lng,
            level,
            levelNum: levelNum(level),
            color: LEVEL_COLORS[level] ?? "#999",
          })
        } catch (err) {
          // 지점 단위 실패 = 이번 회차 스킵 (다음 갱신에 회복)
          firstError ??= err instanceof Error ? err.message : String(err)
        }
      }),
    )
  }
  // 전건 실패는 원천 계약이 바뀐 신호다 — 원인을 삼키면 502만 보이고 진단이 불가능해진다
  if (spots.length === 0) throw new Error(`GEONET empty (${firstError ?? "no error captured"})`)
  // 배치 병렬로 순서가 섞이므로 정의 순서로 복원
  const order = new Map(JEJU_SPOTS.map((s, i) => [s.name, i]))
  return spots.sort((a, b) => (order.get(a.name) ?? 0) - (order.get(b.name) ?? 0))
}

export async function fetchJejuDetail(name: string): Promise<CrowdDetail> {
  const def = JEJU_SPOTS.find((s) => s.name === name)
  if (!def) throw new Error(`unknown jeju spot: ${name}`)

  const [popRaw, sexAgeRaw, weatherRaw] = await Promise.all([
    geonetFetch(popUrl(def)),
    geonetFetch(`getSexAgePopByCircle.php?X=${def.lng}&Y=${def.lat}&R=${def.r}`).catch(() => null),
    fetch(
      `${METEO}?latitude=${def.lat}&longitude=${def.lng}&hourly=temperature_2m,precipitation_probability&forecast_hours=12&timezone=Asia%2FSeoul`,
      { next: { revalidate: 1800 } },
    )
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null),
  ])

  const pop = parsePop(popRaw as GeonetRow[])
  if (!pop) throw new Error(`GEONET detail missing for ${name}`)

  const rhythmMax = Math.max(...pop.series.map((x) => x.v), pop.total, 1)
  const level = deriveLevel(pop.total, rhythmMax, def.r / 1000)

  // 시계열 → 공통 형태 (전부 과거, 마지막 점 = NOW 값으로 치환해 신선도 유지)
  const series: CrowdSeriesPoint[] = pop.series.map((p, i) => {
    const last = i === pop.series.length - 1
    const v = last ? pop.total : p.v
    const lv = deriveLevel(v, rhythmMax, def.r / 1000)
    return {
      time: last ? "현재" : `${p.h}시`,
      people: v,
      range: "",
      yesterday: null,
      level: lv,
      color: LEVEL_COLORS[lv] ?? "#999",
      kind: last ? "now" : "past",
    }
  })
  const nowIndex = series.length - 1

  // 추세 — 1시간 전·3시간 평균 대비 (원천에 증감률 필드가 없어 직접 계산)
  const prev = pop.series.length >= 2 ? pop.series[pop.series.length - 2].v : 0
  const rate = (base: number) => (base > 0 ? `${Math.round(Math.abs((pop.total - base) / base) * 100)}%` : "")
  const dir = (base: number) => (pop.total >= base ? "up" : "down")

  // 성·연령 구성 — 도민+관광객 합산 2행(한글 키 "도민_남_20대" 형태)
  let male = 0
  let female = 0
  const ageMap: Record<string, number> = {}
  for (const row of Array.isArray(sexAgeRaw) ? (sexAgeRaw as Array<Record<string, unknown>>) : []) {
    for (const key of Object.keys(row ?? {})) {
      const parts = key.split("_")
      if (parts.length !== 3) continue
      const v = toNum(row[key])
      if (parts[1] === "남") male += v
      else if (parts[1] === "여") female += v
      ageMap[parts[2]] = (ageMap[parts[2]] ?? 0) + v
    }
  }
  const sexTotal = male + female
  const pct = (v: number) => (sexTotal > 0 ? Math.round((v / sexTotal) * 100) : 0)
  const ages =
    sexTotal > 0
      ? [
          { label: "10대 이하", value: pct((ageMap["10세미만"] ?? 0) + (ageMap["10대"] ?? 0)) },
          { label: "20대", value: pct(ageMap["20대"] ?? 0) },
          { label: "30대", value: pct(ageMap["30대"] ?? 0) },
          { label: "40대", value: pct(ageMap["40대"] ?? 0) },
          { label: "50대", value: pct(ageMap["50대"] ?? 0) },
          {
            label: "60대 이상",
            value: pct((ageMap["60대"] ?? 0) + (ageMap["70대"] ?? 0) + (ageMap["80대"] ?? 0) + (ageMap["90대이상"] ?? 0)),
          },
        ]
      : []

  // 도민/관광객 비율 — 서울의 상주/비상주와 같은 의미 축 (라벨은 클라이언트에서 도시별 분기)
  const residentPct = pop.total > 0 ? Math.round((pop.inp / pop.total) * 100) : 50

  const hourly = (weatherRaw as { hourly?: Record<string, unknown[]> } | null)?.hourly
  const times = (hourly?.time ?? []) as string[]
  const weather: CrowdWeatherHour[] = times.slice(0, 12).map((iso, i) => ({
    hour: `${Number.parseInt(String(iso).slice(11, 13), 10)}시`,
    temp: hourly?.temperature_2m?.[i] != null ? Math.round(toNum(hourly.temperature_2m[i])) : null,
    rainProb: hourly?.precipitation_probability?.[i] != null ? toNum(hourly.precipitation_probability[i]) : null,
    precip: "",
    icon: "",
  }))

  const peakPast = pop.series.reduce((best, p) => (p.v > best.v ? p : best), pop.series[0])

  const message = [
    `지금 이 일대(반경 ${def.r}m)에 약 ${pop.total.toLocaleString("ko-KR")}명 — 관광객 ${pop.outp.toLocaleString("ko-KR")} · 도민 ${pop.inp.toLocaleString("ko-KR")}.`,
  ]
  if (pop.avg3 != null && pop.avg3 > 0) {
    const diff = Math.round(((pop.total - pop.avg3) / pop.avg3) * 100)
    message.push(
      diff >= 5
        ? `최근 3시간 평균보다 ${diff}% 늘어나는 중이에요.`
        : diff <= -5
          ? `최근 3시간 평균보다 ${Math.abs(diff)}% 줄어드는 중이에요.`
          : "최근 3시간 평균과 비슷한 수준이에요.",
    )
  }

  const cctv: CrowdCctv[] = [] // 제주 무키 공개 CCTV 원천 미확보 — 확보 시 여기서 병합

  return {
    name,
    city: "jeju",
    level,
    levelNum: levelNum(level),
    color: LEVEL_COLORS[level] ?? "#999",
    message,
    trend: {
      hour1: { rate: rate(prev), dir: dir(prev) },
      hour3: { rate: pop.avg3 != null ? rate(pop.avg3) : "", dir: pop.avg3 != null ? dir(pop.avg3) : "" },
      month1: { rate: "", dir: "" },
    },
    gender: { male: pct(male), female: pct(female) },
    ages,
    resident: { resident: residentPct, nonResident: 100 - residentPct },
    series,
    nowIndex,
    peakPastHour: peakPast ? `${peakPast.h}시` : "",
    peakForecastHour: "",
    peakForecastLevel: "",
    weather,
    cctv,
    updatedAt: new Date().toISOString(),
  }
}
