// IP 기반 sliding window rate limiter

type RateLimitEntry = {
  timestamps: number[]
}

const ipMap = new Map<string, RateLimitEntry>()
const WINDOW_MS = 60_000 // 1분

// 주기적 만료 엔트리 정리
if (typeof setInterval !== "undefined") {
  setInterval(() => {
    const now = Date.now()
    for (const [key, entry] of ipMap) {
      entry.timestamps = entry.timestamps.filter((t) => now - t < WINDOW_MS)
      if (entry.timestamps.length === 0) ipMap.delete(key)
    }
  }, 60_000)
}

export type RateLimitType = "single" | "batch" | "geocode"

const LIMITS: Record<RateLimitType, number> = {
  single: 30,
  batch: 5,
  geocode: 10,
}

export function checkRateLimit(
  ip: string,
  type: RateLimitType,
): { allowed: boolean; remaining: number } {
  const limit = LIMITS[type]
  const key = `${ip}:${type}`
  const now = Date.now()

  let entry = ipMap.get(key)
  if (!entry) {
    entry = { timestamps: [] }
    ipMap.set(key, entry)
  }

  entry.timestamps = entry.timestamps.filter((t) => now - t < WINDOW_MS)

  if (entry.timestamps.length >= limit) {
    return { allowed: false, remaining: 0 }
  }

  entry.timestamps.push(now)
  return { allowed: true, remaining: limit - entry.timestamps.length }
}
