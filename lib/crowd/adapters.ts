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
import { fetchJejuDetail, fetchJejuSpots, JEJU_SPOTS } from "@/lib/crowd/jeju"
import { BUSAN_SPOTS, fetchBusanDetail, fetchBusanExtra, fetchBusanSpots } from "@/lib/crowd/busan"
import { fetchGangwonDetail, fetchGangwonExtra, fetchGangwonSpots, GANGWON_SPOTS } from "@/lib/crowd/gangwon"
import { fetchIncheonDetail, fetchIncheonExtra, fetchIncheonSpots, INCHEON_SPOTS } from "@/lib/crowd/incheon"
import { augmentWithTopis } from "@/lib/crowd/topis"
import { fetchSafety } from "@/lib/crowd/safety"
import { GWANGJIN_SPOTS, NEARBY_SPOTS } from "@/lib/gwangjin/constants"
import type { CityId } from "@/lib/crowd/cities"

export interface CrowdAdapter {
  id: CityId
  /** 목록·상세 공통 캐시 헤더 — 원천 갱신 주기에 맞춘 값 */
  cacheHeaders: Record<string, string>
  fetchSpots(): Promise<CrowdSpot[]>
  /** 이 도시 명소인가 — 라우트가 상세 전에 검사해 없는 명소를 404로 가른다(원천 실패 502와 구분) */
  hasSpot(spot: string): boolean | Promise<boolean>
  fetchDetail(spot: string): Promise<CrowdDetail>
  /** 부가정보(사고·주차·행사·도로·따릉이). 부재 = CITY_CAPS[city].extra false와 일치해야 한다 */
  fetchExtra?(spot: string): Promise<CrowdExtra>
  /** 안전 정보(기상특보 + 당일 재난문자) — 전 도시. 키 미승인 축은 빈 배열로 강등 */
  fetchDisaster?(): Promise<CrowdDisaster[]>
}

// 부산 2분 주기 갱신 → 엣지 캐시 2분. SWR은 폴링 주기(5분)보다 넉넉히 10분 — 종전 3분(창 합계 5분)은
// 혼자 보는 사용자의 5분 폴링이 매번 창을 벗어나 원천 대기 MISS가 됐다(2026-10-05 실측: 부산 상세 MISS 9.4초).
// 재검증은 창 안 요청마다 백그라운드 1회라 원천 호출은 늘지 않는다. 대신 창 안 응답은 직전 폴링 때 받은 값이다.
const CACHE_120 = { "Cache-Control": "public, s-maxage=120, stale-while-revalidate=600" }
// 서울 RTD는 5분 주기 갱신 — 2분 캐시는 같은 스냅샷을 두 번 받아오던 셈이라 원천 주기에 맞췄다.
// 클라이언트 폴링도 CITY_CAPS.pollMinutes 5분이라 주기당 재검증 1회로 수렴한다.
// SWR은 늘리지 않는다 — 창 합계 10분이 이미 폴링 5분을 덮고, 서울 MISS는 84~140ms로 싸다(2026-10-05 실측).
// 늘리면 숨김 탭 복귀·첫 방문이 최악 10분보다 더 묵은 값을 받을 뿐이다.
const CACHE_300 = { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=300" }
// 제주는 명소당 1콜(66콜/회) 구조라 원천 부담이 서울·부산의 수십 배 — 15분 캐시로 낮춘다.
// (2026-08 원천 차단 사고 이후 감축. 클라이언트 폴링도 제주만 15분으로 맞춰져 있다.)
const CACHE_900 = { "Cache-Control": "public, s-maxage=900, stale-while-revalidate=900" }
// 인천공항 승객예고는 1분 주기 원천 — 대기줄은 빨리 변하므로 짧게 잡는다.
// SWR을 폴링(5분) 밖으로 늘리지 않는다: 원천이 40ms대로 빨라(2026-10-05 로컬 실측) MISS가 싸고,
// 늘리면 혼자 보는 사용자가 매 폴링 5분 묵은 대기시간을 받는다.
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

// 서울 명소 목록은 정적 사본이 없다(RTD 121곳) — 좌표 캐시가 곧 명소 목록이다.
// 목록 조회가 실패해 캐시가 비었으면 판정하지 않고 원천에 맡긴다(종전 502 경로).
async function seoulHasSpot(spot: string): Promise<boolean> {
  await seoulSpotCoords(spot)
  return seoulCoords.size === 0 || seoulCoords.has(spot)
}

const GWANGJIN_SET = new Set<string>([...GWANGJIN_SPOTS, ...NEARBY_SPOTS])

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
    hasSpot: seoulHasSpot,
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
    hasSpot: (spot) => GWANGJIN_SET.has(spot),
    fetchDetail: seoulFetchDetail,
    fetchExtra: fetchSpotExtra,
    fetchDisaster: seoulFetchDisaster,
  },
  jeju: {
    id: "jeju",
    cacheHeaders: CACHE_900,
    fetchSpots: fetchJejuSpots,
    // 정적 목록 검사 — 제주 원천(GEONET)을 부르지 않는다
    hasSpot: (spot) => JEJU_SPOTS.some((s) => s.name === spot),
    fetchDetail: fetchJejuDetail,
    // 제주는 extra 원천이 없다 — CITY_CAPS.jeju.extra=false와 쌍.
    // 안전 정보는 GEONET과 무관한 별도 원천이라 원천 보호 제약에 걸리지 않는다.
    fetchDisaster: () => fetchSafety("jeju"),
  },
  busan: {
    id: "busan",
    cacheHeaders: CACHE_120,
    fetchSpots: fetchBusanSpots,
    hasSpot: (spot) => BUSAN_SPOTS.some((s) => s.name === spot),
    fetchDetail: fetchBusanDetail,
    fetchExtra: fetchBusanExtra,
    fetchDisaster: () => fetchSafety("busan"),
  },
  gangwon: {
    id: "gangwon",
    cacheHeaders: CACHE_120,
    fetchSpots: fetchGangwonSpots,
    hasSpot: (spot) => GANGWON_SPOTS.some((s) => s.name === spot),
    fetchDetail: fetchGangwonDetail,
    fetchExtra: fetchGangwonExtra,
    fetchDisaster: () => fetchSafety("gangwon"),
  },
  incheon: {
    id: "incheon",
    cacheHeaders: CACHE_60,
    fetchSpots: fetchIncheonSpots,
    hasSpot: (spot) => INCHEON_SPOTS.some((s) => s.name === spot),
    fetchDetail: fetchIncheonDetail,
    fetchExtra: fetchIncheonExtra,
    fetchDisaster: () => fetchSafety("incheon"),
  },
}
