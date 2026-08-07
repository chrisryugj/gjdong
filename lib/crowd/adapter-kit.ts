// 도시 어댑터 공통 헬퍼 (서버 전용)
// busan·gangwon·incheon·jeju에 반복되던 조각을 모은다 — 함수 추출 선에서 멈추고,
// 도시별 계약 차이(기본 등급·순차/병렬 로딩·CCTV 방식)는 각 어댑터에 남긴다.

import type { CrowdBeachInfo, CrowdDetail, CrowdWeatherHour } from "@/lib/crowd/seoul-rtd"
import { krgovJson } from "@/lib/crowd/krgov-fetch"

/** 숫자 강제 변환 — 비수치는 0. 인천공항의 toNumOrNull(미운영 "-"를 null로)과는 의미가 다르니 혼용 금지 */
export function toNum(v: unknown): number {
  const n = Number.parseFloat(String(v ?? ""))
  return Number.isFinite(n) ? n : 0
}

/** 등급 숫자(1~4) → 한국어 등급 라벨 (i18n 키이기도 하다) */
export const LV_BY_N = ["", "여유", "보통", "약간 붐빔", "붐빔"]

export const ROAD_IDX = ["", "원활", "서행", "정체"]
export const ROAD_COLOR = ["", "#00d369", "#ffb100", "#ff3939"]

/** 주차 재차율 → 등급 1~4 (<60% 여유 · <80% 보통 · <95% 약간 붐빔 · ≥95% 붐빔) */
export function parkRatioLv(ratio: number): number {
  return ratio < 0.6 ? 1 : ratio < 0.8 ? 2 : ratio < 0.95 ? 3 : 4
}

/** 도로 구간 등급(1원활/2서행/3정체) 평균 → 1~3. 구간이 없으면 0(축 없음) */
export function meanRoadLv(grades: number[]): number {
  if (grades.length === 0) return 0
  const mean = grades.reduce((sum, g) => sum + g, 0) / grades.length
  return Math.max(1, Math.min(3, Math.round(mean)))
}

/** Open-Meteo 12시간 기온·강수확률 — 기상청 원천이 없는 도시 공통(제주·부산·강원·인천) */
export async function fetchMeteo12h(lat: number, lng: number): Promise<CrowdWeatherHour[]> {
  const raw = await fetch(
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&hourly=temperature_2m,precipitation_probability&forecast_hours=12&timezone=Asia%2FSeoul`,
    { next: { revalidate: 1800 } },
  )
    .then((r) => (r.ok ? r.json() : null))
    .catch(() => null)
  const hourly = (raw as { hourly?: Record<string, unknown[]> } | null)?.hourly
  const times = (hourly?.time ?? []) as string[]
  return times.slice(0, 12).map((iso, i) => ({
    hour: `${Number.parseInt(String(iso).slice(11, 13), 10)}시`,
    temp: hourly?.temperature_2m?.[i] != null ? Math.round(toNum(hourly.temperature_2m[i])) : null,
    rainProb: hourly?.precipitation_probability?.[i] != null ? toNum(hourly.precipitation_probability[i]) : null,
    precip: "",
    icon: "",
  }))
}

/** KHOA 해수욕장 생활지수 — 당일 행만 (부산·강원 해변 공통). 실패는 빈 배열 */
export async function fetchBeachInfo(beachCode: string, ymd: string): Promise<CrowdBeachInfo[]> {
  const raw = await krgovJson(`https://www.khoa.go.kr/khoa/lifeforecast/getBeach.do?beachCode=${beachCode}&date=${ymd}`).catch(
    () => null,
  )
  const rows = ((raw as { selectBeach?: Array<Record<string, unknown>> } | null)?.selectBeach ?? []).filter(
    (r) => String(r.date ?? "").replace(/-/g, "") === ymd,
  )
  return rows.map((r) => ({
    gubun: String(r.gubun ?? ""),
    waterTemp: String(r.waterTemp ?? "").trim(),
    waveHeight: String(r.waveHeight ?? "").trim(),
    index: String(r.beachIndex ?? "").trim(),
  }))
}

/** 인파 원천이 없는 도시의 상세 골격 — 시계열·구성비 필드를 빈 값으로 채운다 */
export function emptyDetailFields(): Pick<
  CrowdDetail,
  "trend" | "gender" | "ages" | "resident" | "series" | "nowIndex" | "peakPastHour" | "peakForecastHour" | "peakForecastLevel"
> {
  return {
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
  }
}

/**
 * 모듈 스냅샷 캐시 — TTL 내 재사용 + 동시 호출 단일화(pending promise 공유).
 * 로드 실패는 캐시하지 않아 다음 호출이 재시도한다.
 * (제주는 직결→프록시→맥미니 3단 폴백으로 계약이 달라 이 헬퍼를 쓰지 않는다)
 */
export function createSnapshot<T>(ttlMs: number, load: () => Promise<T>): { get(): Promise<T> } {
  let data: { at: number; value: T } | null = null
  let pending: Promise<T> | null = null
  return {
    get() {
      if (data && Date.now() - data.at < ttlMs) return Promise.resolve(data.value)
      if (pending) return pending
      pending = load()
        .then((value) => {
          data = { at: Date.now(), value }
          return value
        })
        .finally(() => {
          pending = null
        })
      return pending
    },
  }
}
