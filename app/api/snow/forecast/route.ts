import { NextResponse } from "next/server"
import type { ForecastHour, SnowForecast, SnowWarning } from "@/lib/snow/types"

// 광진구 시간별 적설·기온 예보 + 서울 기상특보.
// 1순위 기상청 단기예보(VilageFcstInfoService_2.0 getVilageFcst, 격자 nx=62 ny=126, DATA_GO_KR_KEY 활용신청 2026-09-20 완료)
//   ★SNO(1시간 신적설)는 문자열이다: "적설없음" · "1.0" · "0.5 미만"(=0.3으로 둔다) · "5.0 이상"(=5). PTY 0 없음·1 비·2 비/눈·3 눈·4 소나기·5 빗방울·6 빗방울눈날림·7 눈날림
//   발표 시각은 02·05·08·11·14·17·20·23시, 각 발표는 약 10분 뒤에 열린다 → 가장 최근 발표 시각(지금-10분 기준)을 쓴다
// 특보: WthrWrnInfoService getPwnStatus stnId=109(서울). t6=현재 특보 텍스트("o 없 음" 또는 "o 대설주의보 : 서울…"). 대설만 단계 판정에 쓴다
// 폴백: Open-Meteo best_match(키 없음). ★kma_seamless 모델은 이 좌표에서 전부 null(2026-09-20 실측). null 시각은 버린다(0으로 바꾸면 "최저 0도 결빙" 거짓 화면)
// 서버 30분 캐시. 브라우저·CDN도 같은 시간(s-maxage)

export const revalidate = 1800

const LAT = 37.5385
const LNG = 127.0823
const NX = 62
const NY = 126
const KEY = process.env.DATA_GO_KR_KEY ?? ""

const seoulNow = () => new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Seoul" }))
const pad = (n: number) => String(n).padStart(2, "0")
const ymd = (d: Date) => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`

// 가장 최근 단기예보 발표 시각(base_date·base_time). 발표 뒤 10분은 아직 안 열린 것으로 본다
function latestBase(now: Date): { base_date: string; base_time: string } {
  const t = new Date(now.getTime() - 10 * 60 * 1000)
  const slots = [2, 5, 8, 11, 14, 17, 20, 23]
  let h = -1
  for (const s of slots) if (t.getHours() >= s) h = s
  if (h < 0) {
    t.setDate(t.getDate() - 1)
    h = 23
  }
  return { base_date: ymd(t), base_time: `${pad(h)}00` }
}

// SNO 문자열 → cm
function snoCm(v: string): number {
  if (!v || /없음/.test(v)) return 0
  if (/미만/.test(v)) return 0.3
  const n = parseFloat(v)
  return Number.isFinite(n) ? n : 0
}

interface KmaItem {
  category: string
  fcstDate: string
  fcstTime: string
  fcstValue: string
}

async function fromKma(now: Date): Promise<Omit<SnowForecast, "warning"> | null> {
  if (!KEY) return null
  const base = latestBase(now)
  const url = `https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getVilageFcst?serviceKey=${KEY}&numOfRows=1000&pageNo=1&dataType=JSON&base_date=${base.base_date}&base_time=${base.base_time}&nx=${NX}&ny=${NY}`
  const r = await fetch(url, { next: { revalidate } })
  if (!r.ok) throw new Error(`kma ${r.status}`)
  const txt = await r.text()
  // eslint-disable-next-line no-control-regex
  const j = JSON.parse(txt.replace(/[\x00-\x1f]/g, " ")) as { response?: { header?: { resultCode?: string; resultMsg?: string }; body?: { items?: { item?: KmaItem[] } } } }
  const code = j.response?.header?.resultCode
  if (code !== "00") throw new Error(`kma ${code} ${j.response?.header?.resultMsg ?? ""}`)
  const items = j.response?.body?.items?.item ?? []
  const byT = new Map<string, { temp?: number; snow?: number; pty?: number; sky?: number }>()
  for (const it of items) {
    const k = `${it.fcstDate.slice(0, 4)}-${it.fcstDate.slice(4, 6)}-${it.fcstDate.slice(6, 8)}T${it.fcstTime.slice(0, 2)}:00`
    const row = byT.get(k) ?? {}
    if (it.category === "TMP") row.temp = parseFloat(it.fcstValue)
    else if (it.category === "SNO") row.snow = snoCm(it.fcstValue)
    else if (it.category === "PTY") row.pty = parseInt(it.fcstValue, 10)
    else if (it.category === "SKY") row.sky = parseInt(it.fcstValue, 10)
    byT.set(k, row)
  }
  const nowKey = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:00`
  const hours: ForecastHour[] = []
  for (const [t, v] of [...byT.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    if (t < nowKey || v.temp == null) continue
    // WMO 비슷하게: 눈이면 71, 비/눈 68, 비 61, 흐림 3, 구름 2, 맑음 0
    const code = v.pty === 3 || v.pty === 7 ? 71 : v.pty === 2 || v.pty === 6 ? 68 : v.pty === 1 || v.pty === 4 || v.pty === 5 ? 61 : v.sky === 4 ? 3 : v.sky === 3 ? 2 : 0
    hours.push({ t, temp: v.temp, snow: v.snow ?? 0, code })
  }
  if (!hours.length) return null
  const sum = (n: number) => hours.slice(0, n).reduce((s, x) => s + x.snow, 0)
  return {
    fetched: new Date().toISOString(),
    model: `기상청 단기예보(발표 ${base.base_date.slice(4, 6)}/${base.base_date.slice(6, 8)} ${base.base_time.slice(0, 2)}시)`,
    hours: hours.slice(0, 48),
    snow24: Math.round(sum(24) * 10) / 10,
    snow48: Math.round(sum(48) * 10) / 10,
    minTemp24: Math.min(...hours.slice(0, 24).map((x) => x.temp)),
    now: hours[0].t === nowKey ? { temp: hours[0].temp, snow: hours[0].snow, code: hours[0].code } : null,
  }
}

async function fromOpenMeteo(now: Date): Promise<Omit<SnowForecast, "warning">> {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${LAT}&longitude=${LNG}&hourly=temperature_2m,snowfall,weather_code&timezone=Asia%2FSeoul&forecast_days=3&models=best_match`
  const r = await fetch(url, { next: { revalidate } })
  if (!r.ok) throw new Error(`open-meteo ${r.status}`)
  const j = (await r.json()) as { hourly?: { time: string[]; temperature_2m: (number | null)[]; snowfall: (number | null)[]; weather_code: (number | null)[] } }
  const h = j.hourly
  if (!h?.time?.length) throw new Error("empty")
  const nowKey = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:00`
  const hours: ForecastHour[] = []
  let cur: SnowForecast["now"] = null
  for (let i = 0; i < h.time.length; i++) {
    const t = h.time[i]
    const temp = h.temperature_2m[i]
    const snow = h.snowfall[i]
    if (temp == null || snow == null) continue
    const row = { t, temp, snow, code: h.weather_code[i] ?? 0 }
    if (t === nowKey) cur = { temp: row.temp, snow: row.snow, code: row.code }
    if (t >= nowKey) hours.push(row)
  }
  const sum = (n: number) => hours.slice(0, n).reduce((s, x) => s + x.snow, 0)
  return {
    fetched: new Date().toISOString(),
    model: "Open-Meteo(ECMWF·GFS 결합, 기상청 예보 불가 시 대체)",
    hours: hours.slice(0, 48),
    snow24: Math.round(sum(24) * 10) / 10,
    snow48: Math.round(sum(48) * 10) / 10,
    minTemp24: hours.length ? Math.min(...hours.slice(0, 24).map((x) => x.temp)) : 0,
    now: cur,
  }
}

// 서울 특보 현황. 대설주의보·대설경보만 등급으로, 원문은 서울 관련 줄만 요약
async function fromWarning(): Promise<SnowWarning | null> {
  if (!KEY) return null
  try {
    const url = `https://apis.data.go.kr/1360000/WthrWrnInfoService/getPwnStatus?serviceKey=${KEY}&numOfRows=5&pageNo=1&dataType=JSON&stnId=109`
    const r = await fetch(url, { next: { revalidate } })
    if (!r.ok) return null
    const txt = await r.text()
    // eslint-disable-next-line no-control-regex
    const j = JSON.parse(txt.replace(/[\x00-\x1f]/g, " ")) as { response?: { header?: { resultCode?: string }; body?: { items?: { item?: { t6?: string; t7?: string; tmFc?: number | string }[] } } } }
    if (j.response?.header?.resultCode !== "00") return null
    const it = j.response?.body?.items?.item?.[0]
    if (!it) return null
    const t6 = String(it.t6 ?? "")
    const level: SnowWarning["level"] = /대설경보/.test(t6) ? "warning" : /대설주의보/.test(t6) ? "advisory" : "none"
    const text = level === "none" ? "특보 없음" : t6.split(/\s*o\s*/).filter((s) => /대설/.test(s))[0]?.trim().slice(0, 120) ?? "대설 특보"
    return { fetched: new Date().toISOString(), level, text, tmFc: String(it.tmFc ?? "") }
  } catch {
    return null
  }
}

export async function GET() {
  const now = seoulNow()
  try {
    let base: Omit<SnowForecast, "warning"> | null = null
    try {
      base = await fromKma(now)
    } catch {
      base = null
    }
    if (!base) base = await fromOpenMeteo(now)
    const warning = await fromWarning()
    const body: SnowForecast = { ...base, warning }
    return NextResponse.json(body, { headers: { "Cache-Control": "public, s-maxage=1800, stale-while-revalidate=600" } })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "forecast failed" }, { status: 502 })
  }
}
