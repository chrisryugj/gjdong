// 통합 타입 정의

export type ResolvedAddressMeta = {
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

export type ResolvedDisplay = {
  display: string
  meta: ResolvedAddressMeta
  fallback?: boolean
  message?: string
  originalInput?: string
}

// Kakao API 응답 타입

export interface KakaoJibunAddress {
  address_name: string
  region_1depth_name: string
  region_2depth_name: string
  region_3depth_name: string
  main_address_no: string
  sub_address_no: string
  zip_code: string
  [key: string]: unknown
}

export interface KakaoRoadAddress {
  address_name: string
  region_1depth_name: string
  region_2depth_name: string
  road_name: string
  main_building_no: string
  sub_building_no: string
  building_name: string
  zone_no: string
  [key: string]: unknown
}

export interface KakaoAddressDocument {
  address_name: string
  address_type: string
  x: string
  y: string
  address?: KakaoJibunAddress
  road_address?: KakaoRoadAddress
  [key: string]: unknown
}

export interface KakaoKeywordDocument {
  place_name: string
  address_name: string
  road_address_name: string
  x: string
  y: string
  category_group_code: string
  category_group_name: string
  [key: string]: unknown
}

export interface KakaoCoord2AddressDocument {
  road_address: KakaoRoadAddress | null
  address: KakaoJibunAddress
  [key: string]: unknown
}

export interface KakaoRegionDocument {
  region_type: "H" | "B"
  code: string
  address_name: string
  region_1depth_name: string
  region_2depth_name: string
  region_3depth_name: string
  region_4depth_name: string
  x: number
  y: number
  [key: string]: unknown
}
