// 시설관리 대시보드 — 데이터 모델 + localStorage 영속화 + 분류 색상 팔레트
// 공무원이 관리 시설(주소+시설명+분류)을 브라우저에 저장하고 지도/엑셀로 활용

export type Facility = {
  id: string
  name: string // 시설명 (지도 라벨)
  category?: string // 분류 (마커 색상 기준)
  originalInput: string // 입력한 주소 원문
  address: string // 변환된 표준주소 (display)
  road?: string // 도로명주소
  jibun?: string // 지번주소
  adminDong?: string // 행정동
  postalCode?: string // 우편번호
  memo?: string // 메모 (담당자/점검일 등)
  lat: number
  lon: number
  createdAt: number
}

export const STORAGE_KEY = "gjdong_facilities_v1"

// 분류별로 자동 배정되는 마커 색상 (분류 문자열 해시 → 팔레트 인덱스)
export const CATEGORY_PALETTE = [
  "#2563eb", // blue
  "#16a34a", // green
  "#db2777", // pink
  "#ea580c", // orange
  "#7c3aed", // violet
  "#0891b2", // cyan
  "#ca8a04", // amber
  "#dc2626", // red
  "#4f46e5", // indigo
  "#0d9488", // teal
]

// 분류 없음(미분류) 마커 색상 — 분류된 시설과 구분되도록 중립 그레이
export const UNCATEGORIZED_COLOR = "#64748b"

export function getCategoryColor(category?: string): string {
  const trimmed = category?.trim()
  if (!trimmed) return UNCATEGORIZED_COLOR
  let hash = 0
  for (let i = 0; i < trimmed.length; i++) {
    hash = (hash * 31 + trimmed.charCodeAt(i)) >>> 0
  }
  return CATEGORY_PALETTE[hash % CATEGORY_PALETTE.length]
}

// 행정동명에서 숫자 분동 접미(제N동·N동)를 떼어 상위 동으로 묶는다.
// 예) "자양1동"·"자양제2동" → "자양동", "화양동"·"능동" → 그대로. 빈값은 "".
export function baseAdminDong(dong?: string): string {
  const d = dong?.trim()
  if (!d) return ""
  return d.replace(/제?\s?\d+\s?동$/, "동")
}

function generateId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID()
  }
  return `f_${Date.now()}_${Math.floor(Math.random() * 1e6)}`
}

// 같은 시설 중복 추가 방지용 키 (시설명 + 좌표)
function dedupeKey(f: Pick<Facility, "name" | "lat" | "lon">): string {
  return `${f.name.trim()}__${f.lat.toFixed(5)}_${f.lon.toFixed(5)}`
}

export function loadFacilities(): Facility[] {
  if (typeof window === "undefined") return []
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      // Number.isFinite: typeof NaN/Infinity === "number"가 true라 좌표가 깨진 레코드를
      // 통과시켜 지도 fitBounds에서 예외가 나는 것을 로드 단계에서 차단
      (f): f is Facility =>
        f && typeof f.id === "string" && typeof f.name === "string" && Number.isFinite(f.lat) && Number.isFinite(f.lon),
    )
  } catch {
    return []
  }
}

// 저장 성공 여부를 반환 — 호출부가 quota 초과 등 실패를 사용자에게 알릴 수 있게 한다.
export function saveFacilities(facilities: Facility[]): boolean {
  if (typeof window === "undefined") return false
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(facilities))
    return true
  } catch {
    // QuotaExceededError 등 — 조용히 삼키지 말고 실패를 알린다
    return false
  }
}

export type NewFacilityInput = Omit<Facility, "id" | "createdAt">

// 입력 한 줄 파싱 결과 (직접입력/엑셀/붙여넣기 공용)
export type ParsedRow = { address: string; name: string; category: string }

// 기존 목록에 새 시설들을 병합. 중복(시설명+좌표)은 건너뜀.
// added: 실제 추가된 수, skipped: 중복으로 제외된 수
export function mergeFacilities(
  existing: Facility[],
  incoming: NewFacilityInput[],
): { merged: Facility[]; added: number; skipped: number } {
  const seen = new Set(existing.map(dedupeKey))
  const merged = [...existing]
  let added = 0
  let skipped = 0
  const now = Date.now()

  for (const item of incoming) {
    const key = dedupeKey(item)
    if (seen.has(key)) {
      skipped++
      continue
    }
    seen.add(key)
    merged.push({ ...item, id: generateId(), createdAt: now + added })
    added++
  }

  return { merged, added, skipped }
}
