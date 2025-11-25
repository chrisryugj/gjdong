export type ResolvedDisplay = {
  display: string // "광진구 아차산로400(자양동 870번지, 자양1동)"
  meta: {
    gu: string // "광진구"
    roadName?: string // "아차산로"
    buildingNo?: string // "400" or "400-1"
    unit?: string
    legalDong?: string // "자양동" (법정동)
    jibunNo?: string // "870" or "870-2"
    adminDong?: string // "자양1동" (행정동)
    postalCode?: string
    lon: number // 경도
    lat: number // 위도
    source: "KAKAO" | "FALLBACK"
    bcode?: string // 법정동 코드
    searchMethod?: "ADDRESS" | "KEYWORD" // 검색 방법 추가
    placeName?: string // 건물명 추가
  }
  fallback?: boolean
  message?: string // 에러 메시지 추가
}

const addressCache = new Map<string, ResolvedDisplay>()
const CACHE_MAX_SIZE = 100 // 최대 캐시 크기

export async function resolveAddressDisplay(inputRaw: string): Promise<ResolvedDisplay> {
  const cacheKey = inputRaw.trim().toLowerCase()
  if (addressCache.has(cacheKey)) {
    console.log("[v0] Cache hit for:", inputRaw)
    return addressCache.get(cacheKey)!
  }

  try {
    const response = await fetch("/api/resolve-address", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ address: inputRaw }),
    })

    if (!response.ok) {
      throw new Error("Failed to resolve address")
    }

    const result = await response.json()

    if (addressCache.size >= CACHE_MAX_SIZE) {
      // Remove oldest entry (first entry in Map)
      const firstKey = addressCache.keys().next().value
      addressCache.delete(firstKey)
    }
    addressCache.set(cacheKey, result)

    return result
  } catch (error) {
    console.error("[v0] Address resolution error:", error)
    // Fallback
    return {
      display: inputRaw,
      meta: {
        gu: "",
        lon: 127.0845,
        lat: 37.5384,
        source: "FALLBACK",
      },
      fallback: true,
      message: error.message, // 에러 메시지 추가
    }
  }
}

export function extractAdminDongFromAddress(address: string): string | null {
  const dongMatch = address.match(/(자양|구의|중곡|능동|광장동|화양동|군자동)[1-4]?동/)
  return dongMatch ? dongMatch[0] : null
}
