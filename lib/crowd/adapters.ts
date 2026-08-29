// 도시 어댑터 레지스트리 (서버 전용 — 어댑터들이 node:https를 쓰므로 클라이언트 import 금지)
// 라우트는 도시를 모른다 — ADAPTERS[city]로만 분기한다. 클라이언트 분기는 cities.ts의 CITY_CAPS.

import {
  fetchAllSpots,
  fetchDisasterToday,
  fetchSpotDetail,
  fetchSpotExtra,
  type CrowdDetail,
  type CrowdDisaster,
  type CrowdExtra,
  type CrowdSpot,
} from "@/lib/crowd/seoul-rtd"
import { fetchJejuDetail, fetchJejuSpots } from "@/lib/crowd/jeju"
import { fetchBusanDetail, fetchBusanExtra, fetchBusanSpots } from "@/lib/crowd/busan"
import { fetchGangwonDetail, fetchGangwonExtra, fetchGangwonSpots } from "@/lib/crowd/gangwon"
import { fetchIncheonDetail, fetchIncheonExtra, fetchIncheonSpots } from "@/lib/crowd/incheon"
import { augmentWithTopis } from "@/lib/crowd/topis"
import { fetchSafety } from "@/lib/crowd/safety"
import { GWANGJIN_SPOTS, NEARBY_SPOTS } from "@/lib/gwangjin/constants"
import type { CityId } from "@/lib/crowd/cities"

export interface CrowdAdapter {
  id: CityId
  /** 목록·상세 공통 캐시 헤더 — 원천 갱신 주기에 맞춘 값 */
  cacheHeaders: Record<string, string>
  fetchSpots(): Promise<CrowdSpot[]>
  fetchDetail(spot: string): Promise<CrowdDetail>
  /** 부가정보(사고·주차·행사·도로·따릉이). 부재 = CITY_CAPS[city].extra false와 일치해야 한다 */
  fetchExtra?(spot: string): Promise<CrowdExtra>
  /** 안전 정보(기상특보 + 당일 재난문자) — 전 도시. 키 미승인 축은 빈 배열로 강등 */
  fetchDisaster?(): Promise<CrowdDisaster[]>
}

// 부산 2분 주기 갱신 → 엣지 캐시 2분 + SWR 3분
const CACHE_120 = { "Cache-Control": "public, s-maxage=120, stale-while-revalidate=180" }
// 서울 RTD는 5분 주기 갱신 — 2분 캐시는 같은 스냅샷을 두 번 받아오던 셈이라 원천 주기에 맞췄다.
// 클라이언트 폴링도 CITY_CAPS.pollMinutes 5분이라 주기당 재검증 1회로 수렴한다.
const CACHE_300 = { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=300" }
// 제주는 명소당 1콜(66콜/회) 구조라 원천 부담이 서울·부산의 수십 배 — 15분 캐시로 낮춘다.
// (2026-08 원천 차단 사고 이후 감축. 클라이언트 폴링도 제주만 15분으로 맞춰져 있다.)
const CACHE_900 = { "Cache-Control": "public, s-maxage=900, stale-while-revalidate=900" }
// 인천공항 승객예고는 1분 주기 원천 — 대기줄은 빨리 변하므로 짧게 잡는다
const CACHE_60 = { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=60" }

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

// 서울 상세·안전은 광진(서울 부분집합 도시)과 공유 — detail.city는 "seoul"로 흘려
// spot-detail의 extra/air/행사 후속 호출이 서울 플럼빙을 그대로 탄다
async function seoulFetchDetail(spot: string): Promise<CrowdDetail> {
  const detail = await fetchSpotDetail(spot)
  // 서울 RTD 지점별 CCTV(0~8대)에 TOPIS 전역 510대 근접 카메라 병합
  const origin = detail.cctv[0] ?? null
  const coords = await seoulSpotCoords(spot)
  if (coords) detail.cctv = await augmentWithTopis(coords, detail.cctv)
  else if (origin) detail.cctv = await augmentWithTopis({ lat: origin.lat, lng: origin.lng }, detail.cctv)
  return { ...detail, city: "seoul" }
}

async function seoulFetchDisaster(): Promise<CrowdDisaster[]> {
  // RTD 재난문자가 이미 당일 서울 발송분 — 행안부 원천은 중복이라 특보만 얹는다
  const [warnings, msgs] = await Promise.all([
    fetchSafety("seoul", { withEmergency: false }).catch(() => []),
    fetchDisasterToday().catch(() => []),
  ])
  return [...warnings, ...msgs]
}

export const ADAPTERS: Record<CityId, CrowdAdapter> = {
  seoul: {
    id: "seoul",
    cacheHeaders: CACHE_300,
    async fetchSpots() {
      const spots = await fetchAllSpots()
      cacheSeoulCoords(spots)
      return spots
    },
    fetchDetail: seoulFetchDetail,
    fetchExtra: fetchSpotExtra,
    fetchDisaster: seoulFetchDisaster,
  },
  // 광진 = 서울 RTD 121곳 중 광진 소재 5곳 + 생활권 1곳(광나루) — /gwangjin 전용 서피스
  gwangjin: {
    id: "gwangjin",
    cacheHeaders: CACHE_300,
    async fetchSpots() {
      const all = await fetchAllSpots()
      cacheSeoulCoords(all)
      const want = new Set<string>([...GWANGJIN_SPOTS, ...NEARBY_SPOTS])
      return all.filter((s) => want.has(s.name))
    },
    fetchDetail: seoulFetchDetail,
    fetchExtra: fetchSpotExtra,
    fetchDisaster: seoulFetchDisaster,
  },
  jeju: {
    id: "jeju",
    cacheHeaders: CACHE_900,
    fetchSpots: fetchJejuSpots,
    fetchDetail: fetchJejuDetail,
    // 제주는 extra 원천이 없다 — CITY_CAPS.jeju.extra=false와 쌍.
    // 안전 정보는 GEONET과 무관한 별도 원천이라 원천 보호 제약에 걸리지 않는다.
    fetchDisaster: () => fetchSafety("jeju"),
  },
  busan: {
    id: "busan",
    cacheHeaders: CACHE_120,
    fetchSpots: fetchBusanSpots,
    fetchDetail: fetchBusanDetail,
    fetchExtra: fetchBusanExtra,
    fetchDisaster: () => fetchSafety("busan"),
  },
  gangwon: {
    id: "gangwon",
    cacheHeaders: CACHE_120,
    fetchSpots: fetchGangwonSpots,
    fetchDetail: fetchGangwonDetail,
    fetchExtra: fetchGangwonExtra,
    fetchDisaster: () => fetchSafety("gangwon"),
  },
  incheon: {
    id: "incheon",
    cacheHeaders: CACHE_60,
    fetchSpots: fetchIncheonSpots,
    fetchDetail: fetchIncheonDetail,
    fetchExtra: fetchIncheonExtra,
    fetchDisaster: () => fetchSafety("incheon"),
  },
}
