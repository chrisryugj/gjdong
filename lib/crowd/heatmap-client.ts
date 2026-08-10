// 요일×시간 히트맵 클라이언트 로더 — 상세 패널(spot-heatmap)·시간대 렌즈(use-time-lens) 공용.
// 서울은 GitHub Actions가 3시간마다(data 브랜치), 제주는 맥미니가 15분마다(data-jeju 브랜치) 누적한다.
// 도시당 파일 1개를 통째로 받아 세션 동안 캐시 — 지점 수와 무관하게 fetch 1회.

const HEATMAP_URLS: Record<string, string> = {
  seoul: "https://raw.githubusercontent.com/chrisryugj/gjdong/data/heatmap.json",
  jeju: "https://raw.githubusercontent.com/chrisryugj/gjdong/data-jeju/jeju-heatmap.json",
  // 광진 스팟은 서울 RTD 지점 그대로라 서울 누적 파일을 별칭으로 쓴다 (지점명 키 일치)
  gwangjin: "https://raw.githubusercontent.com/chrisryugj/gjdong/data/heatmap.json",
}

export interface HeatEntry {
  sum: number[][]
  cnt: number[][]
}

// 도시마다 원천 파일이 달라 캐시도 도시별로 나눈다
const heatmapCache = new Map<string, Promise<Record<string, HeatEntry> | null>>()

export function loadHeatmap(city: string): Promise<Record<string, HeatEntry> | null> {
  const url = HEATMAP_URLS[city]
  if (!url) return Promise.resolve(null)
  let cached = heatmapCache.get(city)
  if (!cached) {
    cached = fetch(url)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { spots?: Record<string, HeatEntry> } | null) => d?.spots ?? null)
      .catch(() => null)
    heatmapCache.set(city, cached)
  }
  return cached
}

/** 해당 요일(0=일)·시각의 평균 등급 1~4 — 표본이 없으면 0 */
export function patternLevel(entry: HeatEntry | undefined | null, dow: number, hour: number): number {
  if (!entry) return 0
  const cnt = entry.cnt[dow]?.[hour] ?? 0
  if (cnt <= 0) return 0
  const avg = (entry.sum[dow]?.[hour] ?? 0) / cnt
  return Math.min(Math.max(Math.round(avg), 1), 4)
}

// ── 지금 vs 평소 (누적 히트맵 대비 현재 등급) — 목록 배지·상세 헤드라인 공용
export type BaselineDelta = "above" | "below" | "usual"

/**
 * 현재 등급을 같은 요일·비슷한 시각(±1h)의 평균과 비교 — 합산 표본 2회 미만이면 판단하지 않는다(null).
 * 셀당 표본이 주 1회씩만 쌓이는 수집 구조라, 인접 시간대까지 모수에 넣어 초기 몇 주의 공백을 줄인다.
 * 자정 경계는 같은 요일 안에서만 본다(요일을 넘어가면 "평소" 패턴이 달라짐).
 */
export function baselineDelta(
  entry: HeatEntry | undefined | null,
  levelNum: number,
  dow: number,
  hour: number,
): BaselineDelta | null {
  if (!entry || levelNum <= 0) return null
  let sum = 0
  let cnt = 0
  for (const h of [hour - 1, hour, hour + 1]) {
    if (h < 0 || h > 23) continue
    sum += entry.sum[dow]?.[h] ?? 0
    cnt += entry.cnt[dow]?.[h] ?? 0
  }
  if (cnt < 2) return null
  const base = Math.min(Math.max(Math.round(sum / cnt), 1), 4)
  const diff = levelNum - base
  return diff >= 1 ? "above" : diff <= -1 ? "below" : "usual"
}
