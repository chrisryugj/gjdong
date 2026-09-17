import { FALLBACK_COORDS } from "@/lib/constants"
import { neighborBuildingQueries, pickConsistentKeywordDoc, statedAdminDong, withoutGu } from "@/lib/utils/address-hints"
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

function fallbackResult(address: string, message: string): ResolvedDisplay {
  // 검색은 실패해도 주소에 적힌 동명(1:1 법정동·폐지동·행정동 표기)으로 행정동만은 살린다
  const adminDong = statedAdminDong(address)
  return {
    display: address,
    meta: { sido: "", gu: "", ...(adminDong && { adminDong }), ...FALLBACK_COORDS, source: "FALLBACK" },
    fallback: true,
    message: adminDong ? `${message} 주소에 적힌 동명으로 행정동만 ${adminDong}(으)로 채웠습니다.` : message,
    originalInput: address,
  }
}

const ROAD_ONLY_MESSAGE = "건물번호 없이 도로명만 일치했습니다. 도로 대표 좌표 기준이라 행정동은 추정값입니다."
const KEYWORD_UNVERIFIED_MESSAGE = "상호 검색 결과가 입력 주소의 도로명·동과 일치하지 않아 추정값입니다."

// 좌표는 유효하지만 정확 매칭이 아닌 결과(도로명만 일치·인접번호·미검증 상호) 표시. fallback+partial 조합은 finalizeResolved와 동일 규약
function markPartial(resolved: ResolvedDisplay, message: string): ResolvedDisplay {
  return { ...resolved, fallback: true, partial: true, message }
}

// 매칭 좌표 → 역지오코딩으로 표준주소/행정동 등 완성 (resolveAddress / resolveAddressStrict 공용)
async function finalizeResolved(
  lon: number,
  lat: number,
  apartmentUnit: string | null,
  address: string,
  searchMethod: "ADDRESS" | "KEYWORD",
  placeName?: string,
): Promise<ResolvedDisplay> {
  // 두 역지오코딩은 서로 독립적이라 병렬 호출 — 시설당 왕복 지연을 줄여 대량 변환 총 소요시간 단축
  const [addrDoc, regions] = await Promise.all([kakaoCoord2Address(lon, lat), kakaoCoord2Region(lon, lat)])

  const adminRegion = regions.find((r) => r.region_type === "H")
  const legalRegion = regions.find((r) => r.region_type === "B")
  const roadAddr = addrDoc?.road_address
  const jibunAddr = addrDoc?.address
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
      placeName,
    },
    ...(isPartial && {
      fallback: true,
      partial: true, // 좌표는 유효 — 소비자가 fallback과 구분해 살릴 수 있도록 표시
      message: "좌표는 확인되었으나 상세 주소를 가져올 수 없습니다.",
    }),
    originalInput: address,
  }
}

/**
 * 시설관리 전용: 주소 검색만 사용(키워드/이름 검색 금지 → 동명 시설 전국 오매칭 방지).
 * 주소 뒤 군더더기(괄호 보조표기·건물명 등)는 뒤에서부터 한 토큰씩 떼며 주소 검색을 재시도한다.
 */
export async function resolveAddressStrict(address: string): Promise<ResolvedDisplay> {
  try {
    const { cleaned, unit } = removeApartmentUnit(address)
    const base = cleaned
      .replace(/\([^)]*\)/g, " ") // "(화양동)" 같은 보조표기 제거
      .replace(/[(),]/g, " ") // 짝 안 맞는 괄호("주유소))")·쉼표("570,")는 토큰을 더럽혀 번호 인식을 막는다
      .replace(/\s+/g, " ")
      .trim()
    const tokens = base.split(" ").filter(Boolean)
    if (tokens.length === 0) return fallbackResult(address, "주소가 비어 있습니다.")

    // 동/구 등 지명 단위(REGION) 매칭은 시설 좌표로 부적합 — 토큰을 떼다 '서울 광진구'까지
    // 줄어들면 구 대표좌표가 잡혀 오위치로 '성공' 처리되는 것을 막는다(지번/도로명 매칭만 채택).
    const acceptDoc = (d: KakaoAddressDocument | null): KakaoAddressDocument | null =>
      d && d.address_type !== "REGION" ? d : null

    // 뒤에서부터 한 토큰씩 떼며 주소 검색. 도로명만 일치한 ROAD 결과(건물번호 없음)는 정확 매칭이 아니라
    // 바로 채택하지 않고 기억만 해 두고, 구 오기·인접번호 시도가 다 실패했을 때 마지막 수단으로 쓴다.
    const tried = new Set<string>()
    let roadOnlyDoc: KakaoAddressDocument | null = null
    const trimSearch = async (toks: string[]): Promise<KakaoAddressDocument | null> => {
      for (let end = toks.length; end >= Math.min(2, toks.length); end--) {
        const cand = toks.slice(0, end).join(" ")
        if (tried.has(cand)) continue
        tried.add(cand)
        const found = acceptDoc(await kakaoSearchAddress(cand))
        if (!found) continue
        if (found.address_type !== "ROAD") return found
        roadOnlyDoc ??= found
      }
      return null
    }
    let doc = await trimSearch(tokens)

    // 구 오기: "서울 성동구 광나루로 614"(실제 광진구)는 그대로 0건, 구를 빼면 카카오가 맞는 구로 찾는다
    if (!doc) {
      const noGu = withoutGu(base)
      if (noGu) doc = await trimSearch(noGu.split(" "))
    }

    // 없는 건물번호(폐업·재개발로 번호 소멸): 같은 홀짝 인접 번호로 위치를 추정하고 partial로 표시.
    // 뒤에서부터 뗀 후보 중 '도로명 + 번호'로 끝나는 가장 긴 것 하나에만 시도한다.
    let partialNote: string | undefined
    for (let end = tokens.length; end >= 2 && !doc; end--) {
      const queries = neighborBuildingQueries(tokens.slice(0, end).join(" "))
      if (queries.length === 0) continue
      for (const q of queries) {
        const found = acceptDoc(await kakaoSearchAddress(q))
        if (found && found.address_type !== "ROAD") {
          doc = found
          partialNote = `건물번호가 없어 인접 번호(${q})로 추정했습니다. 행정동은 추정값입니다.`
          break
        }
      }
      break
    }

    // 도로명만 일치(ROAD): 층·호만 남은 "능동로26길 101호" 같은 입력. 도로 대표점이라 정확 매칭처럼 내보내면 안 된다
    if (!doc && roadOnlyDoc) {
      doc = roadOnlyDoc
      partialNote = ROAD_ONLY_MESSAGE
    }
    if (!doc) return fallbackResult(address, "주소를 찾을 수 없습니다. 도로명/지번 주소를 확인하세요.")

    const lon = Number.parseFloat(doc.x)
    const lat = Number.parseFloat(doc.y)
    if (isNaN(lon) || isNaN(lat)) return fallbackResult(address, "좌표 정보를 파싱할 수 없습니다.")
    const resolved = await finalizeResolved(lon, lat, unit, address, "ADDRESS")
    return partialNote ? markPartial(resolved, partialNote) : resolved
  } catch (error) {
    console.error("[v0] strict resolve error:", error instanceof Error ? error.message : error)
    return fallbackResult(address, "주소 변환 중 오류가 발생했습니다.")
  }
}

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

    // 2. 주소 검색 (구 오기면 구를 빼고 한 번 더)
    if (!result) {
      result = (await kakaoSearchAddress(cleanedAddress)) as (KakaoAddressDocument & KakaoKeywordDocument) | null
      searchMethod = "ADDRESS"
      const noGu = result ? null : withoutGu(cleanedAddress)
      if (noGu) result = (await kakaoSearchAddress(noGu)) as (KakaoAddressDocument & KakaoKeywordDocument) | null
    }

    // 3. 주소 검색 실패 시 키워드 검색 시도 — 첫 결과를 그대로 쓰면 다른 지점·다른 동이 잡히므로
    //    입력의 도로명/법정동/지점명과 맞는 결과를 고르고, 확인 못 하면 첫 결과를 partial로 표시
    let keywordUnverified = false
    if (!result && !containsBuildingKeyword(cleanedAddress)) {
      const keywordResults = await kakaoKeywordSearch(cleanedAddress)
      if (keywordResults && keywordResults.length > 0) {
        const { doc, checked } = pickConsistentKeywordDoc(cleanedAddress, keywordResults)
        result = (doc ?? keywordResults[0]) as KakaoAddressDocument & KakaoKeywordDocument
        keywordUnverified = checked && !doc
        searchMethod = "KEYWORD"
      }
    }

    // 4. 결과 없으면 fallback
    if (!result) {
      return fallbackResult(address, "정확한 주소를 찾을 수 없습니다.")
    }

    const lon = Number.parseFloat(result.x)
    const lat = Number.parseFloat(result.y)
    if (isNaN(lon) || isNaN(lat)) {
      return fallbackResult(address, "좌표 정보를 파싱할 수 없습니다.")
    }

    // 5. 좌표 → 주소 변환
    const resolved = await finalizeResolved(
      lon,
      lat,
      apartmentUnit,
      address,
      searchMethod,
      searchMethod === "KEYWORD" ? result.place_name : undefined,
    )
    if (keywordUnverified) return markPartial(resolved, KEYWORD_UNVERIFIED_MESSAGE)
    if (searchMethod === "ADDRESS" && result.address_type === "ROAD") return markPartial(resolved, ROAD_ONLY_MESSAGE)
    return resolved
  } catch (error) {
    console.error("[v0] Address resolution error:", error instanceof Error ? error.message : error)
    return fallbackResult(address, "주소 변환 중 오류가 발생했습니다.")
  }
}
