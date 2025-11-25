export type GeocodingResult = {
  lat: number
  lng: number
  display_name: string
  address: any
}

const API_URL = "https://nominatim.openstreetmap.org/search"

function normalizeAddress(address: string): string[] {
  const variants: string[] = []

  // 원본
  variants.push(address)

  // 띄어쓰기 제거
  variants.push(address.replace(/\s+/g, ""))

  // 서울 추가
  if (!address.includes("서울")) {
    variants.push(`서울 ${address}`)
    variants.push(`서울특별시 ${address}`)
  }

  return variants
}

export async function geocodeKoreanAddress(address: string): Promise<GeocodingResult | null> {
  const variants = normalizeAddress(address)

  for (const variant of variants) {
    try {
      const response = await fetch(`${API_URL}?q=${encodeURIComponent(variant)}&format=json&addressdetails=1&limit=1`, {
        headers: {
          "User-Agent": "AddressGenerator/1.0",
        },
      })

      if (!response.ok) continue

      const data = await response.json()

      if (data && data.length > 0) {
        const result = data[0]
        return {
          lat: Number.parseFloat(result.lat),
          lng: Number.parseFloat(result.lon),
          display_name: result.display_name,
          address: result.address,
        }
      }
    } catch (error) {
      console.error("[v0] Geocoding error:", error)
      continue
    }
  }

  return null
}
