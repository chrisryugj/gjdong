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

/**
 * 도시별 데이터 능력 테이블 — 클라이언트 안전(순수 데이터).
 * UI는 여기서만 도시 분기를 읽고, 서버 라우팅은 adapters.ts의 ADAPTERS를 쓴다.
 * 도시를 추가할 때는 이 테이블 + 어댑터 항목만 늘리면 라우트·컴포넌트는 무수정.
 */
export interface CityCapabilities {
  /** 24시간 시계열 차트 (서울·제주) */
  series: boolean
  /** 예보 포인트 — 서울만. 제주는 과거 실측뿐 */
  forecast: boolean
  /** /api/crowd/extra 부가정보(사고·주차·행사·도로·따릉이) — 제주만 없음 */
  extra: boolean
  /** 요일×시간 히트맵 데이터 브랜치 (서울·제주) */
  heatmap: boolean
  /** 성별·연령·상주/방문 구성 (서울·제주) */
  demographics: boolean
  /** KHOA 해수욕장지수 가능 지점 존재 (부산·강원) */
  beach: boolean
  /** 안전 배너(기상특보+재난문자) — 전 도시. 서울=RTD 재난문자+특보, 나머지=행안부+특보 */
  disaster: boolean
  /** 대기질(에어코리아) 섹션 — 측정소 매핑이 있는 도시 */
  air: boolean
  /** TourAPI 축제·행사 레이어 — 서울은 RTD 문화행사가 이미 있어 제외 */
  tourEvents: boolean
  /** 지점 근처 지하철 실시간 도착(서울 RTD subway) — extra에 실려온다 */
  subway: boolean
  /** 목적 프리셋 칩 — 카테고리 체계가 서울일 때만 */
  presets: boolean
  /** 클라이언트 자동 갱신 주기(분) — 제주 15분은 2026-08 원천 차단 사고 대응 */
  pollMinutes: number
  /** 상황실 카드의 상세(인원) 팬아웃 허용 — 서울만. 제주는 원천 보호(2026-08 차단 사고),
   *  부산·강원은 인원 원천이 없고, 인천은 상세를 불러도 카드에 더할 숫자가 없다 */
  opsDetail: "full" | "levelOnly"
  /** 자치구 필터 노출 — 인천공항은 단일 시설이라 무의미 */
  districts: boolean
}

export const CITY_CAPS: Record<CityId, CityCapabilities> = {
  seoul: { series: true, forecast: true, extra: true, heatmap: true, demographics: true, beach: false, disaster: true, air: true, tourEvents: false, subway: true, presets: true, pollMinutes: 5, opsDetail: "full", districts: true },
  jeju: { series: true, forecast: false, extra: false, heatmap: true, demographics: true, beach: false, disaster: true, air: true, tourEvents: true, subway: false, presets: false, pollMinutes: 15, opsDetail: "levelOnly", districts: true },
  busan: { series: false, forecast: false, extra: true, heatmap: false, demographics: false, beach: true, disaster: true, air: true, tourEvents: true, subway: false, presets: false, pollMinutes: 5, opsDetail: "levelOnly", districts: true },
  gangwon: { series: false, forecast: false, extra: true, heatmap: false, demographics: false, beach: true, disaster: true, air: true, tourEvents: true, subway: false, presets: false, pollMinutes: 5, opsDetail: "levelOnly", districts: true },
  incheon: { series: false, forecast: false, extra: true, heatmap: false, demographics: false, beach: false, disaster: true, air: true, tourEvents: false, subway: false, presets: false, pollMinutes: 5, opsDetail: "levelOnly", districts: false },
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
