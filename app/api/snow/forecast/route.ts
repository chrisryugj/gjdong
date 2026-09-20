import { NextResponse } from "next/server"
import type { ForecastHour, SnowForecast } from "@/lib/snow/types"

// 광진구청 좌표의 시간별 적설·기온 예보. Open-Meteo 무료 API(키 없음). 기상청 단기예보 API는 data.go.kr 활용신청이 별도라 안 쓴다.
// ★모델 `kma_seamless`(기상청 재배포)는 이 좌표에서 시간별 값이 전부 null로 온다(2026-09-20 실측) → 기본 `best_match`(ECMWF·GFS 등 결합)를 쓰고 화면에 모델명을 적는다.
// 값이 null인 시각은 버린다(0으로 바꾸면 "24시간 최저 0도 = 결빙 조건" 같은 거짓 화면이 된다).
// 서버가 30분 캐시. 브라우저·CDN도 같은 시간 캐시(s-maxage)

export const revalidate = 1800

const LAT = 37.5385
const LNG = 127.0823
const MODEL = "best_match"
const URL = `https://api.open-meteo.com/v1/forecast?latitude=${LAT}&longitude=${LNG}&hourly=temperature_2m,snowfall,weather_code&timezone=Asia%2FSeoul&forecast_days=3&models=${MODEL}`

interface OpenMeteo {
  hourly?: { time: string[]; temperature_2m: (number | null)[]; snowfall: (number | null)[]; weather_code: (number | null)[] }
}

export async function GET() {
  try {
    const r = await fetch(URL, { next: { revalidate } })
    if (!r.ok) throw new Error(`open-meteo ${r.status}`)
    const j = (await r.json()) as OpenMeteo
    const h = j.hourly
    if (!h?.time?.length) throw new Error("empty")
    // 지금 시각(서울) 이후만. 예보 배열은 오늘 00시부터 시작한다
    const nowSeoul = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Seoul" }))
    const nowKey = `${nowSeoul.getFullYear()}-${String(nowSeoul.getMonth() + 1).padStart(2, "0")}-${String(nowSeoul.getDate()).padStart(2, "0")}T${String(nowSeoul.getHours()).padStart(2, "0")}:00`
    const hours: ForecastHour[] = []
    let now: SnowForecast["now"] = null
    for (let i = 0; i < h.time.length; i++) {
      const t = h.time[i]
      const temp = h.temperature_2m[i]
      const snow = h.snowfall[i]
      if (temp == null || snow == null) continue // null 시각은 버린다(0으로 바꾸면 "최저 0도 = 결빙" 거짓 화면)
      const row = { t, temp, snow, code: h.weather_code[i] ?? 0 }
      if (t === nowKey) now = { temp: row.temp, snow: row.snow, code: row.code }
      if (t >= nowKey) hours.push(row)
    }
    const sum = (n: number) => hours.slice(0, n).reduce((s, x) => s + x.snow, 0)
    const body: SnowForecast = {
      fetched: new Date().toISOString(),
      model: `Open-Meteo ${MODEL}(ECMWF·GFS 결합)`,
      hours: hours.slice(0, 48),
      snow24: Math.round(sum(24) * 10) / 10,
      snow48: Math.round(sum(48) * 10) / 10,
      minTemp24: hours.length ? Math.min(...hours.slice(0, 24).map((x) => x.temp)) : 0,
      now,
    }
    return NextResponse.json(body, { headers: { "Cache-Control": "public, s-maxage=1800, stale-while-revalidate=600" } })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "forecast failed" }, { status: 502 })
  }
}
