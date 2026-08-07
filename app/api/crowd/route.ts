import { type NextRequest, NextResponse } from "next/server"
import { fetchAllSpots, fetchDisasterToday, fetchSpotDetail } from "@/lib/crowd/seoul-rtd"
import { fetchJejuDetail, fetchJejuSpots } from "@/lib/crowd/jeju"
import { fetchBusanDetail, fetchBusanSpots } from "@/lib/crowd/busan"
import { fetchGangwonDetail, fetchGangwonSpots } from "@/lib/crowd/gangwon"
import { fetchIncheonDetail, fetchIncheonSpots } from "@/lib/crowd/incheon"
import { augmentWithTopis } from "@/lib/crowd/topis"
import { isCityId, type CityId } from "@/lib/crowd/cities"

export const dynamic = "force-dynamic"

// 서울 5분·부산 2분 주기 갱신 → 엣지 캐시 2분 + SWR 3분
const CACHE_HEADERS = {
  "Cache-Control": "public, s-maxage=120, stale-while-revalidate=180",
}
// 제주는 명소당 1콜(66콜/회) 구조라 원천 부담이 서울·부산의 수십 배 — 15분 캐시로 낮춘다.
// (2026-08 원천 차단 사고 이후 감축. 클라이언트 폴링도 제주만 15분으로 맞춰져 있다.)
const JEJU_CACHE_HEADERS = {
  "Cache-Control": "public, s-maxage=900, stale-while-revalidate=900",
}
// 인천공항 승객예고는 1분 주기 원천 — 대기줄은 빨리 변하므로 짧게 잡는다
const ICN_CACHE_HEADERS = {
  "Cache-Control": "public, s-maxage=60, stale-while-revalidate=60",
}

export async function GET(request: NextRequest) {
  const spot = request.nextUrl.searchParams.get("spot")
  const cityRaw = request.nextUrl.searchParams.get("city")
  const city: CityId = isCityId(cityRaw) ? cityRaw : "seoul"

  try {
    if (spot) {
      if (spot.length > 60) {
        return NextResponse.json({ error: "Invalid spot name" }, { status: 400 })
      }
      if (city === "jeju") {
        return NextResponse.json(await fetchJejuDetail(spot), { headers: JEJU_CACHE_HEADERS })
      }
      if (city === "busan") {
        return NextResponse.json(await fetchBusanDetail(spot), { headers: CACHE_HEADERS })
      }
      if (city === "gangwon") {
        return NextResponse.json(await fetchGangwonDetail(spot), { headers: CACHE_HEADERS })
      }
      if (city === "incheon") {
        return NextResponse.json(await fetchIncheonDetail(spot), { headers: ICN_CACHE_HEADERS })
      }
      const detail = await fetchSpotDetail(spot)
      // 서울 RTD 지점별 CCTV(0~8대)에 TOPIS 전역 510대 근접 카메라 병합
      const origin = detail.cctv[0] ?? null
      const coords = await seoulSpotCoords(spot)
      if (coords) detail.cctv = await augmentWithTopis(coords, detail.cctv)
      else if (origin) detail.cctv = await augmentWithTopis({ lat: origin.lat, lng: origin.lng }, detail.cctv)
      return NextResponse.json({ ...detail, city: "seoul" }, { headers: CACHE_HEADERS })
    }

    if (city === "jeju") {
      const spots = await fetchJejuSpots()
      return NextResponse.json(
        { spots, disaster: [], updatedAt: new Date().toISOString() },
        { headers: JEJU_CACHE_HEADERS },
      )
    }
    if (city === "busan") {
      const spots = await fetchBusanSpots()
      return NextResponse.json(
        { spots, disaster: [], updatedAt: new Date().toISOString() },
        { headers: CACHE_HEADERS },
      )
    }
    if (city === "gangwon") {
      const spots = await fetchGangwonSpots()
      return NextResponse.json(
        { spots, disaster: [], updatedAt: new Date().toISOString() },
        { headers: CACHE_HEADERS },
      )
    }
    if (city === "incheon") {
      const spots = await fetchIncheonSpots()
      return NextResponse.json(
        { spots, disaster: [], updatedAt: new Date().toISOString() },
        { headers: ICN_CACHE_HEADERS },
      )
    }

    // 재난문자는 전 명소 공통이라 목록 응답에 실어 대시보드 배너로 노출
    const [spots, disaster] = await Promise.all([
      fetchAllSpots(),
      fetchDisasterToday().catch(() => []),
    ])
    cacheSeoulCoords(spots)
    return NextResponse.json(
      { spots, disaster, updatedAt: new Date().toISOString() },
      { headers: CACHE_HEADERS },
    )
  } catch (error) {
    console.error("[crowd] API error:", error instanceof Error ? error.message : "Unknown error")
    return NextResponse.json({ error: "실시간 데이터를 불러오지 못했습니다." }, { status: 502 })
  }
}

// TOPIS 근접 검색용 서울 명소 좌표 — 목록 응답에서 흘려받아 캐시, 콜드 스타트 시엔 1회 재조회
const seoulCoords = new Map<string, { lat: number; lng: number }>()
let seoulCoordsAt = 0

function cacheSeoulCoords(spots: Array<{ name: string; lat: number; lng: number }>) {
  for (const s of spots) seoulCoords.set(s.name, { lat: s.lat, lng: s.lng })
  seoulCoordsAt = Date.now()
}

async function seoulSpotCoords(name: string): Promise<{ lat: number; lng: number } | null> {
  if (seoulCoords.size === 0 || Date.now() - seoulCoordsAt > 3600_000) {
    try {
      cacheSeoulCoords(await fetchAllSpots())
    } catch {
      // 좌표 없이도 상세는 동작 — TOPIS 보강만 생략
    }
  }
  return seoulCoords.get(name) ?? null
}
