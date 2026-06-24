// IP 기반 sliding window rate limiter
// ⚠️ 주의: 인메모리 Map 기반이므로 Vercel 서버리스에서는 인스턴스마다 독립적으로 동작
// 프로덕션에서 확실한 rate limiting이 필요하면 Upstash Redis(@upstash/ratelimit)로 교체 필요

type RateLimitEntry = {
  timestamps: number[]
}

const ipMap = new Map<string, RateLimitEntry>()
const WINDOW_MS = 60_000 // 1분

// 주기적 만료 엔트리 정리 (인스턴스 수명 동안만 유효)
if (typeof setInterval !== "undefined") {
  const cleanupTimer = setInterval(() => {
    const now = Date.now()
    for (const [key, entry] of ipMap) {
      entry.timestamps = entry.timestamps.filter((t) => now - t < WINDOW_MS)
      if (entry.timestamps.length === 0) ipMap.delete(key)
    }
  }, 60_000)

  cleanupTimer.unref?.()
}

// 신뢰 가능한 클라이언트 IP를 추출한다.
// x-forwarded-for의 '맨 왼쪽'은 클라이언트가 임의로 위조할 수 있어(Vercel은 실제 IP를 오른쪽에 append)
// rate-limit 키로 쓰면 헤더 변조로 우회된다. Vercel이 신뢰값으로 채우는 x-real-ip를 우선하고,
// 없으면 XFF의 '마지막' 값(프록시가 본 실제 IP에 가장 가까움)을 쓴다.
export function getClientIp(headers: Headers): string {
  const realIp = headers.get("x-real-ip")?.trim()
  if (realIp) return realIp
  const xff = headers.get("x-forwarded-for")
  if (xff) {
    const parts = xff
      .split(",")
      .map((p) => p.trim())
      .filter(Boolean)
    if (parts.length > 0) return parts[parts.length - 1]
  }
  return "unknown"
}

export type RateLimitType = "single" | "batch" | "geocode"

const LIMITS: Record<RateLimitType, number> = {
  single: 30,
  batch: 30,
  geocode: 300,
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
