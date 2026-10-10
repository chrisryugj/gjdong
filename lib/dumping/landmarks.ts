// /dumping 입체 지도 랜드마크 이름표(24라운드, 2026-10-09 사용자: "광진구청은 왜 안 그려 넣었어?"). 바탕 지도는 아이콘 레이어를 빼서 시설 이름이 없다.
// 자리는 OSM 지명(Protomaps pois)·건물 중심. 광진구청은 2025년 4~5월 옮긴 신청사(자양동 870, 아차산로 400, 지상 18층 82.3m, 사용승인 2025-01-23,
// 건축물대장 실측). rank 가 작을수록 겹칠 때 먼저 산다(maplibre symbol-sort-key).
// 보이기 시작하는 줌은 등급(tier)마다 레이어 minzoom 으로 준다: 필터 안 ["zoom"] 은 정수 타일 줌으로만 평가돼 12.4·13.2 같은 소수 문턱이 다음 정수로 밀렸다(검증 실측)
export interface Landmark {
  name: string
  lat: number
  lng: number
  rank: number
  /** 0 구 전체 보기부터 · 1 동네 · 2 가까이 */
  tier: 0 | 1 | 2
  /** 모형 보기에 전용 모델이 있다(toon-landmark). 모형 입체에서 가까이 가면 알약을 숨긴다: 모델의 간판이 이름을 말하고 알약은 모델 밑동을 덮었다 */
  model?: boolean
}
/** 모델 있는 랜드마크 알약을 숨기는 줌(모형 입체에서만) */
export const LANDMARK_MODEL_HIDE_ZOOM = 16.8
export const LANDMARK_TIER_ZOOM = [12.4, 13.2, 14.2] as const

export const LANDMARKS: Landmark[] = [
  { name: "광진구청", lat: 37.53635, lng: 127.08764, rank: 0, tier: 0, model: true },
  { name: "강변테크노마트", lat: 37.53557, lng: 127.09519, rank: 1, tier: 1 },
  { name: "건국대학교", lat: 37.54185, lng: 127.07711, rank: 2, tier: 1 },
  { name: "서울어린이대공원", lat: 37.54889, lng: 127.08047, rank: 3, tier: 1 },
  { name: "건대 스타시티", lat: 37.5385, lng: 127.0718, rank: 4, tier: 1 },
  { name: "세종대학교", lat: 37.5508, lng: 127.0748, rank: 5, tier: 1 },
  { name: "동서울종합터미널", lat: 37.53461, lng: 127.09425, rank: 6, tier: 2 },
  { name: "그랜드 워커힐", lat: 37.55533, lng: 127.11015, rank: 7, tier: 1 },
  { name: "아차산", lat: 37.56684, lng: 127.10274, rank: 8, tier: 1 },
  { name: "뚝섬한강공원", lat: 37.52983, lng: 127.06811, rank: 9, tier: 1 },
  { name: "광나루한강공원", lat: 37.54087, lng: 127.11568, rank: 10, tier: 1 },
  { name: "건국대학교병원", lat: 37.54062, lng: 127.07232, rank: 11, tier: 2 },
  { name: "국립정신건강센터", lat: 37.5657, lng: 127.0854, rank: 12, tier: 2 },
  { name: "커먼그라운드", lat: 37.54121, lng: 127.06562, rank: 13, tier: 2 },
  { name: "광진문화예술회관", lat: 37.5376, lng: 127.07054, rank: 14, tier: 2 },
]

export function landmarksFC(): GeoJSON.FeatureCollection<GeoJSON.Point, { name: string; rank: number; tier: number; model: number }> {
  return {
    type: "FeatureCollection",
    features: LANDMARKS.map((l) => ({ type: "Feature", properties: { name: l.name, rank: l.rank, tier: l.tier, model: l.model ? 1 : 0 }, geometry: { type: "Point", coordinates: [l.lng, l.lat] } })),
  }
}
