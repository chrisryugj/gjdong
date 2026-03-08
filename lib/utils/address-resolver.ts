import { FALLBACK_COORDS } from "@/lib/constants"

// Re-export from canonical location
export type { ResolvedDisplay } from "@/lib/types"
import type { ResolvedDisplay } from "@/lib/types"

const addressCache = new Map<string, ResolvedDisplay>()
const CACHE_MAX_SIZE = 100

export async function resolveAddressDisplay(inputRaw: string): Promise<ResolvedDisplay> {
  const cacheKey = inputRaw.trim().toLowerCase()
  if (addressCache.has(cacheKey)) {
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

    // fallback(실패) 결과는 캐시하지 않음
    if (!result.fallback) {
      if (addressCache.size >= CACHE_MAX_SIZE) {
        const firstKey = addressCache.keys().next().value
        if (firstKey !== undefined) addressCache.delete(firstKey)
      }
      addressCache.set(cacheKey, result)
    }

    return result
  } catch (error) {
    return {
      display: inputRaw,
      meta: {
        sido: "",
        gu: "",
        ...FALLBACK_COORDS,
        source: "FALLBACK",
      },
      fallback: true,
      message: (error as Error).message,
    }
  }
}

export function extractAdminDongFromAddress(address: string): string | null {
  const dongMatch = address.match(/(자양|구의|중곡|능동|광장동|화양동|군자동)[1-4]?동/)
  return dongMatch ? dongMatch[0] : null
}
