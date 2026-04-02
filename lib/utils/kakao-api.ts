import { FALLBACK_COORDS } from "@/lib/constants"
import type {
  KakaoAddressDocument,
  KakaoKeywordDocument,
  KakaoCoord2AddressDocument,
  KakaoRegionDocument,
  ResolvedDisplay,
} from "@/lib/types"

function getKakaoApiKey(): string | undefined {
  return process.env.KAKAO_REST_API_KEY
}

const BUILDING_KEYWORDS = [
  "주민센터",
  "동사무소",
  "구청",
  "시청",
  "군청",
  "면사무소",
  "읍사무소",
  "행정복지센터",
  "보건소",
  "우체국",
  "경찰서",
  "파출소",
  "소방서",
  "학교",
  "초등학교",
  "중학교",
  "고등학교",
  "대학교",
  "병원",
  "의원",
  "약국",
  "은행",
  "역",
  "터미널",
  "정류장",
]

export function containsBuildingKeyword(query: string): boolean {
  return BUILDING_KEYWORDS.some((keyword) => query.includes(keyword))
}

export function removeApartmentUnit(address: string): { cleaned: string; unit: string | null } {
  let cleaned = address.trim()
  let unit: string | null = null
  const units: string[] = []

  const clearUnitPattern =
    /\s+(?:([A-Z가-힣]+(?:빌)?동\s*\d+층\s*\d+층?호)|([A-Z가-힣]+(?:빌)?동\s*\d+층\s*\d+호)|([A-Z가-힣]+(?:빌)?동\s*[A-Z]\d+호)|([A-Z가-힣]+(?:빌)?동\s*\d+호)|(\d+층동\s*\d+호)|(\d+층동)|(지하\d+층\d+호)|(지층동\s*\d+호)|(지층\d*호?)|(지하\d+호)|(비\d+호)|(지\d+호)|(\d+층)|(\d+동\s*\d+호)|([a-zA-Z]-?\d+호)|(\d{1,4}호))(?=\s|,|$|\()/g

  let match
  while ((match = clearUnitPattern.exec(cleaned)) !== null) {
    const extractedUnit = match
      .slice(1)
      .find((g) => g !== undefined)
      ?.trim()
    if (extractedUnit) {
      units.push(extractedUnit)
    }
  }

  if (units.length > 0) {
    cleaned = cleaned.replace(clearUnitPattern, " ").trim()
    cleaned = cleaned.replace(/\s+/g, " ").trim()
    cleaned = cleaned.replace(/,\s*$/, "").trim()
    unit = units.join(" ")
  }

  const additionalUnitPattern = /(\d+(?:-\d+)?)\s+(\d+-\d+)(?=\s|$|\()/
  const additionalMatch = cleaned.match(additionalUnitPattern)

  if (additionalMatch) {
    const additionalUnit = additionalMatch[2]
    cleaned = cleaned.replace(/\s+\d+-\d+(?=\s|$|\()/, " ").trim()
    unit = unit ? `${unit} ${additionalUnit}` : additionalUnit
  }

  return { cleaned, unit }
}

async function fetchWithRetry(url: string, options: RequestInit, retries = 2): Promise<Response> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 10000)

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    })
    clearTimeout(timeoutId)

    if (response.status === 429 && retries > 0) {
      const delay = (3 - retries) * 2000
      await new Promise((resolve) => setTimeout(resolve, delay))
      return fetchWithRetry(url, options, retries - 1)
    }

    return response
  } catch (error) {
    clearTimeout(timeoutId)

    if (retries > 0) {
      await new Promise((resolve) => setTimeout(resolve, 1000))
      return fetchWithRetry(url, options, retries - 1)
    }
    throw error
  }
}

export async function kakaoSearchAddress(q: string): Promise<KakaoAddressDocument | null> {
  try {
    const apiKey = getKakaoApiKey()
    if (!apiKey) {
      console.error("[v0] KAKAO_REST_API_KEY is not set")
      return null
    }

    const { cleaned: cleanedQuery } = removeApartmentUnit(q)

    const response = await fetchWithRetry(
      `https://dapi.kakao.com/v2/local/search/address.json?query=${encodeURIComponent(cleanedQuery)}`,
      {
        headers: { Authorization: `KakaoAK ${apiKey}` },
      },
    )

    if (!response.ok) {
      console.error("[v0] Kakao API response not ok:", response.status, response.statusText)
      return null
    }
    const data = await response.json()
    return data.documents && data.documents.length > 0 ? data.documents[0] : null
  } catch (error) {
    console.error("[v0] Kakao address search error:", error instanceof Error ? error.message : error)
    return null
  }
}

export async function kakaoKeywordSearch(q: string): Promise<KakaoKeywordDocument[] | null> {
  try {
    const apiKey = getKakaoApiKey()
    if (!apiKey) {
      console.error("[v0] KAKAO_REST_API_KEY is not set")
      return null
    }

    const { cleaned: cleanedQuery } = removeApartmentUnit(q)

    const response = await fetchWithRetry(
      `https://dapi.kakao.com/v2/local/search/keyword.json?query=${encodeURIComponent(cleanedQuery)}&size=5`,
      {
        headers: { Authorization: `KakaoAK ${apiKey}` },
      },
    )

    if (!response.ok) {
      console.error("[v0] Kakao API response not ok:", response.status, response.statusText)
      return null
    }
    const data = await response.json()
    return data.documents && data.documents.length > 0 ? data.documents : null
  } catch (error) {
    console.error("[v0] Kakao keyword search error:", error instanceof Error ? error.message : error)
    return null
  }
}

export async function kakaoCoord2Address(lon: number, lat: number): Promise<KakaoCoord2AddressDocument | null> {
  try {
    const apiKey = getKakaoApiKey()
    if (!apiKey) {
      console.error("[v0] KAKAO_REST_API_KEY is not set")
      return null
    }

    const response = await fetchWithRetry(`https://dapi.kakao.com/v2/local/geo/coord2address.json?x=${lon}&y=${lat}`, {
      headers: { Authorization: `KakaoAK ${apiKey}` },
    })

    if (!response.ok) {
      if (response.status === 429) return null
      console.error("[v0] Kakao API response not ok:", response.status, response.statusText)
      return null
    }

    const contentType = response.headers.get("content-type")
    if (!contentType || !contentType.includes("application/json")) return null

    const data = await response.json()
    return data.documents && data.documents.length > 0 ? data.documents[0] : null
  } catch (error) {
    console.error("[v0] Kakao coord2address error:", error instanceof Error ? error.message : error)
    return null
  }
}

export async function kakaoCoord2Region(lon: number, lat: number): Promise<KakaoRegionDocument[]> {
  try {
    const apiKey = getKakaoApiKey()
    if (!apiKey) {
      console.error("[v0] KAKAO_REST_API_KEY is not set")
      return []
    }

    const response = await fetchWithRetry(
      `https://dapi.kakao.com/v2/local/geo/coord2regioncode.json?x=${lon}&y=${lat}`,
      {
        headers: { Authorization: `KakaoAK ${apiKey}` },
      },
    )

    if (!response.ok) {
      if (response.status === 429) return []
      console.error("[v0] Kakao API response not ok:", response.status, response.statusText)
      return []
    }

    const contentType = response.headers.get("content-type")
    if (!contentType || !contentType.includes("application/json")) return []

    const data = await response.json()
    return data.documents || []
  } catch (error) {
    console.error("[v0] Kakao coord2region error:", error instanceof Error ? error.message : error)
    return []
  }
}

// Re-export for backwards compatibility
export type ResolvedAddressResult = ResolvedDisplay

export async function resolveAddress(address: string): Promise<ResolvedDisplay> {
  try {
    const { cleaned: cleanedAddress, unit: apartmentUnit } = removeApartmentUnit(address)

    let result: (KakaoAddressDocument & KakaoKeywordDocument) | null = null
    let searchMethod: "ADDRESS" | "KEYWORD" = "ADDRESS"

    // 1. 건물 키워드가 있으면 키워드 검색 우선
    if (containsBuildingKeyword(cleanedAddress)) {
      const keywordResults = await kakaoKeywordSearch(cleanedAddress)
      if (keywordResults && keywordResults.length > 0) {
        result = keywordResults[0] as KakaoAddressDocument & KakaoKeywordDocument
        searchMethod = "KEYWORD"
      }
    }

    // 2. 주소 검색
    if (!result) {
      result = (await kakaoSearchAddress(cleanedAddress)) as (KakaoAddressDocument & KakaoKeywordDocument) | null
      searchMethod = "ADDRESS"
    }

    // 3. 주소 검색 실패 시 키워드 검색 시도
    if (!result && !containsBuildingKeyword(cleanedAddress)) {
      const keywordResults = await kakaoKeywordSearch(cleanedAddress)
      if (keywordResults && keywordResults.length > 0) {
        result = keywordResults[0] as KakaoAddressDocument & KakaoKeywordDocument
        searchMethod = "KEYWORD"
      }
    }

    // 4. 결과 없으면 fallback
    if (!result) {
      return {
        display: address,
        meta: {
          sido: "",
          gu: "",
          ...FALLBACK_COORDS,
          source: "FALLBACK",
        },
        fallback: true,
        message: "정확한 주소를 찾을 수 없습니다.",
        originalInput: address,
      }
    }

    const lon = Number.parseFloat(result.x)
    const lat = Number.parseFloat(result.y)

    if (isNaN(lon) || isNaN(lat)) {
      return {
        display: address,
        meta: { sido: "", gu: "", ...FALLBACK_COORDS, source: "FALLBACK" },
        fallback: true,
        message: "좌표 정보를 파싱할 수 없습니다.",
        originalInput: address,
      }
    }

    // 5. 좌표 → 주소 변환
    const addrDoc = await kakaoCoord2Address(lon, lat)
    const regions = await kakaoCoord2Region(lon, lat)

    const adminRegion = regions.find((r) => r.region_type === "H")
    const legalRegion = regions.find((r) => r.region_type === "B")

    const roadAddr = addrDoc?.road_address
    const jibunAddr = addrDoc?.address

    // reverse geocode 실패 시 부분 성공 처리
    // addrDoc이 null이면 도로명/지번 정보가 없으므로 isPartial
    const isPartial = !roadAddr && !jibunAddr

    const sido = legalRegion?.region_1depth_name || ""
    const gu = legalRegion?.region_2depth_name || ""
    const roadName = roadAddr?.road_name || ""
    const buildingNo = roadAddr?.main_building_no
      ? `${roadAddr.main_building_no}${roadAddr.sub_building_no ? `-${roadAddr.sub_building_no}` : ""}`
      : ""
    const legalDong = legalRegion?.region_3depth_name || ""
    const jibunNo = jibunAddr?.main_address_no
      ? `${jibunAddr.main_address_no}${jibunAddr.sub_address_no ? `-${jibunAddr.sub_address_no}` : ""}`
      : ""
    const adminDong = adminRegion?.region_3depth_name || legalDong
    const postalCode = roadAddr?.zone_no || jibunAddr?.zip_code || ""

    const buildingNoDisplay = apartmentUnit ? `${buildingNo} ${apartmentUnit}` : buildingNo
    const display = isPartial
      ? address
      : `${gu} ${roadName} ${buildingNoDisplay}(${legalDong} ${jibunNo}, ${adminDong})`

    return {
      display,
      meta: {
        sido,
        gu,
        roadName,
        buildingNo,
        unit: apartmentUnit || undefined,
        legalDong,
        jibunNo,
        adminDong,
        postalCode,
        lon,
        lat,
        source: "KAKAO",
        bcode: legalRegion?.code,
        searchMethod,
        placeName: searchMethod === "KEYWORD" ? result.place_name : undefined,
      },
      ...(isPartial && {
        fallback: true,
        message: "좌표는 확인되었으나 상세 주소를 가져올 수 없습니다.",
      }),
      originalInput: address,
    }
  } catch (error) {
    console.error("[v0] Address resolution error:", error instanceof Error ? error.message : error)
    return {
      display: address,
      meta: {
        sido: "",
        gu: "",
        ...FALLBACK_COORDS,
        source: "FALLBACK",
      },
      fallback: true,
      message: "주소 변환 중 오류가 발생했습니다.",
      originalInput: address,
    }
  }
}
