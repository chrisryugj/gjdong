const KAKAO_REST_KEY = process.env.KAKAO_REST_API_KEY

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
    // 매칭된 그룹 중 첫 번째 non-null 값 찾기
    const extractedUnit = match
      .slice(1)
      .find((g) => g !== undefined)
      ?.trim()
    if (extractedUnit) {
      units.push(extractedUnit)
      console.log("[v0] Extracted unit part:", extractedUnit)
    }
  }

  // 추출된 모든 세부주소 패턴 제거
  if (units.length > 0) {
    cleaned = cleaned.replace(clearUnitPattern, " ").trim()
    // 연속된 공백을 하나로 정리
    cleaned = cleaned.replace(/\s+/g, " ").trim()
    // 쉼표 뒤 공백 정리
    cleaned = cleaned.replace(/,\s*$/, "").trim()
    unit = units.join(" ")
  }

  // 2단계: 남은 주소에서 "건물번호 + 추가 숫자-숫자" 패턴 확인
  const additionalUnitPattern = /(\d+(?:-\d+)?)\s+(\d+-\d+)(?=\s|$|\()/
  const additionalMatch = cleaned.match(additionalUnitPattern)

  if (additionalMatch) {
    const additionalUnit = additionalMatch[2]
    cleaned = cleaned.replace(/\s+\d+-\d+(?=\s|$|\()/, " ").trim()

    unit = unit ? `${unit} ${additionalUnit}` : additionalUnit
    console.log("[v0] Extracted additional unit:", additionalUnit)
  }

  console.log("[v0] Final cleaned address:", cleaned)
  if (unit) {
    console.log("[v0] Final unit:", unit)
  }

  return { cleaned, unit }
}

async function fetchWithRetry(url: string, options: RequestInit, retries = 2): Promise<Response> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 10000) // 10초 타임아웃

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    })
    clearTimeout(timeoutId)

    if (response.status === 429 && retries > 0) {
      console.log(`[v0] Rate limited, retrying after delay... (${retries} attempts left)`)
      const delay = (3 - retries) * 2000 // 2초, 4초 증가
      await new Promise((resolve) => setTimeout(resolve, delay))
      return fetchWithRetry(url, options, retries - 1)
    }

    return response
  } catch (error) {
    clearTimeout(timeoutId)

    if (retries > 0) {
      console.log(`[v0] Fetch failed, retrying... (${retries} attempts left)`)
      await new Promise((resolve) => setTimeout(resolve, 1000)) // 1초 대기
      return fetchWithRetry(url, options, retries - 1)
    }
    throw error
  }
}

export async function kakaoSearchAddress(q: string) {
  try {
    if (!KAKAO_REST_KEY) {
      console.error("[v0] KAKAO_REST_API_KEY is not set")
      return null
    }

    const { cleaned: cleanedQuery } = removeApartmentUnit(q)
    console.log("[v0] Original query:", q)
    console.log("[v0] Cleaned query:", cleanedQuery)

    const response = await fetchWithRetry(
      `https://dapi.kakao.com/v2/local/search/address.json?query=${encodeURIComponent(cleanedQuery)}`,
      {
        headers: {
          Authorization: `KakaoAK ${KAKAO_REST_KEY}`,
        },
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

export async function kakaoKeywordSearch(q: string) {
  try {
    if (!KAKAO_REST_KEY) {
      console.error("[v0] KAKAO_REST_API_KEY is not set")
      return null
    }

    const { cleaned: cleanedQuery } = removeApartmentUnit(q)

    const response = await fetchWithRetry(
      `https://dapi.kakao.com/v2/local/search/keyword.json?query=${encodeURIComponent(cleanedQuery)}&size=5`,
      {
        headers: {
          Authorization: `KakaoAK ${KAKAO_REST_KEY}`,
        },
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

export async function kakaoCoord2Address(lon: number, lat: number) {
  try {
    if (!KAKAO_REST_KEY) {
      console.error("[v0] KAKAO_REST_API_KEY is not set")
      return null
    }

    const response = await fetchWithRetry(`https://dapi.kakao.com/v2/local/geo/coord2address.json?x=${lon}&y=${lat}`, {
      headers: {
        Authorization: `KakaoAK ${KAKAO_REST_KEY}`,
      },
    })

    if (!response.ok) {
      if (response.status === 429) {
        console.log("[v0] Rate limited on coord2address, returning null")
        return null
      }
      console.error("[v0] Kakao API response not ok:", response.status, response.statusText)
      return null
    }

    const contentType = response.headers.get("content-type")
    if (!contentType || !contentType.includes("application/json")) {
      console.log("[v0] Non-JSON response received, likely rate limited")
      return null
    }

    const data = await response.json()
    return data.documents && data.documents.length > 0 ? data.documents[0] : null
  } catch (error) {
    console.error("[v0] Kakao coord2address error:", error instanceof Error ? error.message : error)
    return null
  }
}

export async function kakaoCoord2Region(lon: number, lat: number) {
  try {
    if (!KAKAO_REST_KEY) {
      console.error("[v0] KAKAO_REST_API_KEY is not set")
      return []
    }

    const response = await fetchWithRetry(
      `https://dapi.kakao.com/v2/local/geo/coord2regioncode.json?x=${lon}&y=${lat}`,
      {
        headers: {
          Authorization: `KakaoAK ${KAKAO_REST_KEY}`,
        },
      },
    )

    if (!response.ok) {
      if (response.status === 429) {
        console.log("[v0] Rate limited on coord2region, returning empty array")
        return []
      }
      console.error("[v0] Kakao API response not ok:", response.status, response.statusText)
      return []
    }

    const contentType = response.headers.get("content-type")
    if (!contentType || !contentType.includes("application/json")) {
      console.log("[v0] Non-JSON response received, likely rate limited")
      return []
    }

    const data = await response.json()
    return data.documents || []
  } catch (error) {
    console.error("[v0] Kakao coord2region error:", error instanceof Error ? error.message : error)
    return []
  }
}

export type ResolvedAddressResult = {
  display: string
  meta: {
    gu: string
    roadName?: string
    buildingNo?: string
    unit?: string
    legalDong?: string
    jibunNo?: string
    adminDong?: string
    postalCode?: string
    lon: number
    lat: number
    source: "KAKAO" | "FALLBACK"
    bcode?: string
    searchMethod?: "ADDRESS" | "KEYWORD"
    placeName?: string
  }
  fallback?: boolean
  message?: string
  originalInput?: string
}

export async function resolveAddress(address: string): Promise<ResolvedAddressResult> {
  try {
    const { cleaned: cleanedAddress, unit: apartmentUnit } = removeApartmentUnit(address)

    let result = null
    let searchMethod: "ADDRESS" | "KEYWORD" = "ADDRESS"

    // 1. 건물 키워드가 있으면 키워드 검색 우선
    if (containsBuildingKeyword(cleanedAddress)) {
      const keywordResults = await kakaoKeywordSearch(cleanedAddress)
      if (keywordResults && keywordResults.length > 0) {
        result = keywordResults[0]
        searchMethod = "KEYWORD"
      }
    }

    // 2. 주소 검색
    if (!result) {
      result = await kakaoSearchAddress(cleanedAddress)
      searchMethod = "ADDRESS"
    }

    // 3. 주소 검색 실패 시 키워드 검색 시도
    if (!result && !containsBuildingKeyword(cleanedAddress)) {
      const keywordResults = await kakaoKeywordSearch(cleanedAddress)
      if (keywordResults && keywordResults.length > 0) {
        result = keywordResults[0]
        searchMethod = "KEYWORD"
      }
    }

    // 4. 결과 없으면 fallback
    if (!result) {
      return {
        display: address,
        meta: {
          gu: "",
          lon: 127.0845,
          lat: 37.5384,
          source: "FALLBACK",
        },
        fallback: true,
        message: "정확한 주소를 찾을 수 없습니다.",
        originalInput: address,
      }
    }

    const lon = Number.parseFloat(result.x)
    const lat = Number.parseFloat(result.y)

    // 5. 좌표 → 주소 변환
    const addrDoc = await kakaoCoord2Address(lon, lat)
    const regions = await kakaoCoord2Region(lon, lat)

    const adminRegion = regions.find((r: any) => r.region_type === "H")
    const legalRegion = regions.find((r: any) => r.region_type === "B")

    const roadAddr = addrDoc?.road_address
    const jibunAddr = addrDoc?.address

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
    const display = `${gu} ${roadName}${buildingNoDisplay}(${legalDong} ${jibunNo}, ${adminDong})`

    return {
      display,
      meta: {
        gu,
        roadName,
        buildingNo, // Keep original building number without unit
        unit: apartmentUnit || undefined, // Store unit separately
        legalDong,
        jibunNo,
        adminDong,
        postalCode, // Added postal code
        lon,
        lat,
        source: "KAKAO",
        bcode: legalRegion?.code,
        searchMethod,
        placeName: searchMethod === "KEYWORD" ? result.place_name : undefined,
      },
      originalInput: address,
    }
  } catch (error) {
    console.error("[v0] Address resolution error:", error instanceof Error ? error.message : error)
    return {
      display: address,
      meta: {
        gu: "",
        lon: 127.0845,
        lat: 37.5384,
        source: "FALLBACK",
      },
      fallback: true,
      message: "주소 변환 중 오류가 발생했습니다.",
      originalInput: address,
    }
  }
}
