// 공유 상수

export const FALLBACK_COORDS = {
  lat: 37.5384,
  lon: 127.0845,
} as const

export type OutputField = "standard1" | "standard2" | "road" | "jibun" | "adminDong" | "postalCode" | "unit"

export const OUTPUT_FIELDS: OutputField[] = [
  "standard1",
  "standard2",
  "road",
  "jibun",
  "adminDong",
  "postalCode",
  "unit",
]

export const OUTPUT_FIELD_LABELS: Record<OutputField, string> = {
  standard1: "표준형식 1 (전체)",
  standard2: "표준형식 2 (구부터)",
  road: "도로명 주소",
  jibun: "지번 주소",
  adminDong: "행정동",
  postalCode: "우편번호",
  unit: "세부주소",
}
