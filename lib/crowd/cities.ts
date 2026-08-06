// 인파레이더 멀티시티 레지스트리 — 도시별 지도 초기 뷰·데이터 출처 표기
// 어댑터(seoul-rtd / jeju / busan)는 모두 CrowdSpot·CrowdDetail 공통 형태로 수렴한다.

export const CITY_IDS = ["seoul", "jeju", "busan", "gangwon", "incheon"] as const
export type CityId = (typeof CITY_IDS)[number]

export function isCityId(value: string | null | undefined): value is CityId {
  return CITY_IDS.includes(value as CityId)
}

export interface CityInfo {
  id: CityId
  nameKo: string
  center: [number, number]
  zoom: number
  /** 데이터 출처 링크 (푸터) */
  sourceUrl: string
}

export const CITIES: Record<CityId, CityInfo> = {
  seoul: {
    id: "seoul",
    nameKo: "서울",
    center: [37.5519, 126.9918],
    zoom: 12,
    sourceUrl: "https://data.seoul.go.kr/SeoulRtd/",
  },
  jeju: {
    id: "jeju",
    nameKo: "제주",
    center: [33.375, 126.53],
    zoom: 10,
    sourceUrl: "https://www.visitjeju.net/",
  },
  busan: {
    id: "busan",
    nameKo: "부산",
    center: [35.13, 129.06],
    zoom: 11,
    sourceUrl: "https://its.busan.go.kr/",
  },
  gangwon: {
    id: "gangwon",
    nameKo: "강원",
    // 동해안 벨트(고성~삼척)가 남북으로 길어 강릉을 중심으로 넓게 잡는다
    center: [37.95, 128.83],
    zoom: 9,
    sourceUrl: "https://www.data.go.kr/data/15140011/openapi.do",
  },
  incheon: {
    id: "incheon",
    nameKo: "인천공항",
    center: [37.4588, 126.4435],
    zoom: 14,
    sourceUrl: "https://www.airport.kr/",
  },
}
