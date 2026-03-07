export type ResolvedDisplay = {
  display: string
  meta: {
    sido?: string
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
}

export type OutputField =
  | "standard1"
  | "standard2"
  | "road"
  | "jibun"
  | "adminDong"
  | "postalCode"
  | "unit"

export const FIELD_LABELS: Record<OutputField, string> = {
  standard1: "표준형식1",
  standard2: "표준형식2",
  road: "도로명주소",
  jibun: "지번주소",
  adminDong: "행정동",
  postalCode: "우편번호",
  unit: "세부주소"
}

export const FIELD_EXAMPLES: Record<OutputField, string> = {
  standard1: "서울특별시 광진구 아차산로400(자양동 870, 자양2동)",
  standard2: "광진구 아차산로400(자양동 870, 자양2동)",
  road: "광진구 아차산로400",
  jibun: "광진구 자양동 870",
  adminDong: "자양2동",
  postalCode: "05050",
  unit: "102동 304호"
}

export type HistoryItem = {
  input: string
  result: ResolvedDisplay
  timestamp: number
  favorite?: boolean
}

export type MapProvider = "kakao" | "naver"

export type ExtensionSettings = {
  apiBaseUrl: string
  defaultFormat: OutputField
  enableAutoDetect: boolean
  enableNotifications: boolean
  showMapLink: boolean
  showMiniMap: boolean
  mapProvider: MapProvider
  enableClipboardDetect: boolean
  selectedFields: OutputField[]
}

export const DEFAULT_SETTINGS: ExtensionSettings = {
  apiBaseUrl: "https://gjdong.vercel.app",
  defaultFormat: "standard1",
  enableAutoDetect: false,
  enableNotifications: true,
  showMapLink: true,
  showMiniMap: true,
  mapProvider: "kakao",
  enableClipboardDetect: false,
  selectedFields: ["standard1", "standard2", "road", "jibun", "adminDong", "postalCode", "unit"]
}
