// 광진 생활상황판 상수 — 클라이언트 안전(순수 데이터)
// 데이터 계약 실측(2026-08-10): 각 값의 출처는 개별 어댑터 파일 헤더 참조.

/** 서울 RTD 121곳 중 광진구 소재 5곳 + 생활권(강동 접경) 1곳 — 2026-08-10 hotspot-category 라이브 실측 */
export const GWANGJIN_SPOTS = ["건대입구역", "군자역", "뚝섬한강공원", "어린이대공원", "아차산"] as const
export const NEARBY_SPOTS = ["광나루한강공원"] as const

/**
 * citydata_cmrcl 지원 지점 — 2026-08-11 실키 실측: 광진 스팟 6곳 중 역세권 2곳만 응답
 * (공원·산 지역명은 RESULT 에러). ⚠️샘플키는 지역 인자를 무시하고 전 지점 동일 응답 — 실키로만 검증.
 */
export const CMRCL_AREAS = ["건대입구역", "군자역"] as const

/**
 * 광진구 지하철역 8곳 — swopenapi 실측(2026-08-10): 부역명 포함 정식 역명이어야 조회된다
 * ("아차산" 단독은 INFO-200, "아차산(어린이대공원후문)"은 정상). 표기는 base로, 조회는 api로.
 */
export interface StationDef {
  /** UI 표기 (짧은 이름) */
  base: string
  /** swopenapi 조회용 정식 역명 */
  api: string
  /** 노선 라벨 */
  lines: string[]
}
export const STATIONS: StationDef[] = [
  { base: "건대입구", api: "건대입구", lines: ["2", "7"] },
  { base: "구의", api: "구의", lines: ["2"] },
  { base: "강변", api: "강변", lines: ["2"] },
  { base: "군자", api: "군자(능동)", lines: ["5", "7"] },
  { base: "아차산", api: "아차산(어린이대공원후문)", lines: ["5"] },
  { base: "광나루", api: "광나루(장신대)", lines: ["5"] },
  { base: "중곡", api: "중곡", lines: ["7"] },
  { base: "어린이대공원", api: "어린이대공원(세종대)", lines: ["7"] },
]

/** subwayId → 노선 라벨 (swopenapi 실측: 1002=2호선, 1005=5호선, 1007=7호선) */
export const SUBWAY_LINE: Record<string, string> = {
  "1002": "2호선",
  "1005": "5호선",
  "1007": "7호선",
}
export const SUBWAY_LINE_COLOR: Record<string, string> = {
  "1002": "#00a84d",
  "1005": "#996cac",
  "1007": "#747f00",
}

/**
 * 광진구 행정동 15개 → 생활인구 행정동코드(SPOP_LOCAL_RESD_DONG).
 * 2026-08-10 샘플키 전수 실측 + 행자부 KIKcd_H(vuski/admdongkor ver20250401) 교차확인.
 * ⚠️함정 둘: ①자양4동은 끝자리 47(11215847) — 10단위 스캔에 안 걸린다(2008년 노유동→자양4동
 * 개칭 때 끼워넣기 코드). ②코드 순서가 동명 순서와 다르다 — 820~840이 자양1~3동, 850~870이
 * 구의1~3동. 11215720·11215880은 현행 미부여 코드(INFO-200 실측).
 */
export const DONG_CODES: Array<{ code: string; name: string }> = [
  { code: "11215710", name: "화양동" },
  { code: "11215730", name: "군자동" },
  { code: "11215740", name: "중곡1동" },
  { code: "11215750", name: "중곡2동" },
  { code: "11215760", name: "중곡3동" },
  { code: "11215770", name: "중곡4동" },
  { code: "11215780", name: "능동" },
  { code: "11215810", name: "광장동" },
  { code: "11215820", name: "자양1동" },
  { code: "11215830", name: "자양2동" },
  { code: "11215840", name: "자양3동" },
  { code: "11215847", name: "자양4동" },
  { code: "11215850", name: "구의1동" },
  { code: "11215860", name: "구의2동" },
  { code: "11215870", name: "구의3동" },
]

/** 광진구 응급의료기관 좌표 — E-Gen 응답엔 좌표가 없어 고정값 (OSM Nominatim 실측 2026-08-10) */
export const HOSPITAL_COORDS: Record<string, [number, number]> = {
  건국대학교병원: [37.5406, 127.0723],
  혜민병원: [37.5353, 127.0837],
}

/** 키 미설정 시 카드에 노출할 발급 안내 — url은 실제 신청 페이지 */
export interface NeedKey {
  key: string
  label: string
  url: string
  note?: string
}
export const KEY_GUIDES = {
  seoul: {
    key: "SEOUL_OPEN_KEY",
    label: "서울 열린데이터광장 인증키",
    url: "https://data.seoul.go.kr/together/mypage/actKeyMain.do",
    note: "회원가입 후 '인증키 신청' — 즉시 발급, 무료",
  },
  subway: {
    key: "SEOUL_SUBWAY_KEY",
    label: "서울 열린데이터광장 — 실시간 지하철 인증키 (일반 키와 별도)",
    url: "https://data.seoul.go.kr/dataList/OA-12764/F/1/datasetView.do",
    note: "일반 인증키는 ERROR-338 — 이 페이지의 실시간 인증키 신청으로 발급 후 SEOUL_SUBWAY_KEY에 설정",
  },
  egen: {
    key: "DATA_GO_KR_KEY",
    label: "공공데이터포털 — 전국 응급의료기관 정보(15000563) 활용신청",
    url: "https://www.data.go.kr/data/15000563/openapi.do",
    note: "자동승인 — 같은 키로 약국(15000576)도 별도 활용신청 필요",
  },
  pharmacy: {
    key: "DATA_GO_KR_KEY",
    label: "공공데이터포털 — 전국 약국 정보(15000576) 활용신청",
    url: "https://www.data.go.kr/data/15000576/openapi.do",
    note: "자동승인",
  },
  ev: {
    key: "DATA_GO_KR_KEY",
    label: "공공데이터포털 — 전기차 충전소 정보(15076352) 활용신청",
    url: "https://www.data.go.kr/data/15076352/openapi.do",
    note: "자동승인",
  },
  shelter: {
    key: "SEOUL_OPEN_KEY",
    label: "서울 열린데이터광장 인증키 (무더위쉼터 OA-21065)",
    url: "https://data.seoul.go.kr/dataList/OA-21065/A/1/datasetView.do",
    note: "일반 인증키로 동작 — 행안부 data.go.kr 무더위쉼터 API는 2026년 현재 폐기됨",
  },
} satisfies Record<string, NeedKey>
