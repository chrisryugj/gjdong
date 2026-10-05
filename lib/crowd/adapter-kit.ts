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

// 묵은 값 허용 상한 = TTL×2. 부산·강원(2분)은 4분, 인천(1분)은 2분으로 클라이언트 폴링 주기(5분)보다
// 짧다 — 상한이 폴링보다 길면 CDN stale-while-revalidate(이전 폴링 응답) 위에 함수 SWR(이전 스냅샷)이
// 겹쳐, 혼자 보는 사용자가 폴링 두 주기 묵은 값을 받는다. 상한을 넘긴 값은 버리고 새로 받을 때까지 기다린다.
const STALE_FACTOR = 2
// 백그라운드 갱신이 이 시간 안에 안 끝나면 죽은 것으로 보고 다음 요청이 새로 띄운다 — 응답 뒤 얼어붙은
// 함수 인스턴스에서 promise가 영영 안 끝나면 묵은 값만 계속 나간다. (로더 최장: 부산 ITS 12초 + bisco 3배치×10초 ≈ 42초)
const REFRESH_DEAD_MS = 60_000

// 응답을 막지 않고 띄운 갱신들 — 라우트가 after()로 함수 수명을 이어 준다 (settleSnapshotRefreshes)
const backgroundRefreshes = new Set<Promise<unknown>>()

/** 진행 중인 백그라운드 스냅샷 갱신이 모두 끝날 때까지 — 라우트의 after(settleSnapshotRefreshes)용 */
export function settleSnapshotRefreshes(): Promise<void> {
  return Promise.allSettled([...backgroundRefreshes]).then(() => undefined)
}

/**
 * 모듈 스냅샷 캐시 — stale-while-revalidate.
 * TTL 내면 캐시, TTL이 지났어도 상한(TTL×STALE_FACTOR) 안이면 묵은 값을 즉시 주고 갱신은 백그라운드 1회.
 * 값이 없거나 상한을 넘겼을 때만 로드를 기다린다. 동시 호출은 진행 중 로드 하나를 공유한다.
 * 로드 실패는 캐시하지 않아(묵은 값은 그대로) 다음 호출이 재시도한다.
 * (2026-10-05 프로덕션 실측: 부산 상세 캐시 MISS 9.4초 — TTL 만료 때마다 ITS 3종+bisco 재수집을 기다렸다)
 * (제주는 맥미니 스냅샷 전용 로더(jeju.ts loadSnapshot)라 이 헬퍼를 쓰지 않는다)
 */
export function createSnapshot<T>(ttlMs: number, load: () => Promise<T>): { get(): Promise<T> } {
  // at = 로드 시작 시각 — 늦게 끝난 옛 로드가 새 값을 덮지 않게 비교 기준으로도 쓴다
  let data: { at: number; value: T } | null = null
  let pending: { at: number; promise: Promise<T> } | null = null

  const refresh = (): Promise<T> => {
    if (pending && Date.now() - pending.at < REFRESH_DEAD_MS) return pending.promise
    const at = Date.now()
    const promise = load().then((value) => {
      if (!data || at >= data.at) data = { at, value }
      return value
    })
    const entry = { at, promise }
    pending = entry
    const clear = () => {
      if (pending === entry) pending = null
    }
    void promise.then(clear, clear)
    return promise
  }

  return {
    get() {
      if (data) {
        const age = Date.now() - data.at
        if (age < ttlMs) return Promise.resolve(data.value)
        if (age < ttlMs * STALE_FACTOR) {
          const bg = refresh()
          backgroundRefreshes.add(bg)
          const drop = () => backgroundRefreshes.delete(bg)
          void bg.then(drop, drop)
          return Promise.resolve(data.value)
        }
      }
      return refresh()
    },
  }
}
