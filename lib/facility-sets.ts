// 시설 세트(명명된 묶음) — 시설+마커스타일+분류순서를 한 단위로 localStorage 저장하고
// JSON 파일로 내보내기/가져오기. 여러 작업 묶음을 이름 붙여 전환·백업하기 위함.
import type { Facility } from "./facility-storage"
import { MARKER_SHAPES, type CategoryStyle, type MarkerShape } from "./facility-markers"

export type FacilitySet = {
  id: string
  name: string
  savedAt: number
  facilities: Facility[]
  styles: Record<string, CategoryStyle>
  categoryOrder: string[]
}

// 내보내기 파일에 박는 포맷 식별자 — 가져올 때 형식 검증 + 향후 마이그레이션 기준
export const SET_FILE_FORMAT = "gjdong.facility-set"
const SET_FILE_VERSION = 1

const SETS_KEY = "gjdong_facility_sets_v1"

function newId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID()
  }
  return `set_${Date.now()}_${Math.floor(Math.random() * 1e6)}`
}

function isHexColor(c: unknown): c is string {
  return typeof c === "string" && /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(c)
}

// 외부(파일/조작된 localStorage)에서 들어온 시설 배열을 신뢰 가능한 형태로 정화.
// 좌표가 유한하고 id/name이 문자열인 레코드만 통과 — 지도 fitBounds 예외/깨진 데이터 차단.
function sanitizeFacilities(input: unknown): Facility[] {
  if (!Array.isArray(input)) return []
  const out: Facility[] = []
  for (const f of input) {
    if (
      f &&
      typeof f === "object" &&
      typeof (f as Facility).id === "string" &&
      typeof (f as Facility).name === "string" &&
      Number.isFinite((f as Facility).lat) &&
      Number.isFinite((f as Facility).lon)
    ) {
      out.push(f as Facility)
    }
  }
  return out
}

// 색상은 hex만 허용(보고서/지도 HTML 속성에 보간되므로 속성 탈출 차단), 모양은 화이트리스트.
function sanitizeStyles(input: unknown): Record<string, CategoryStyle> {
  if (!input || typeof input !== "object") return {}
  const out: Record<string, CategoryStyle> = {}
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    const s = v as Partial<CategoryStyle>
    if (s && isHexColor(s.color) && typeof s.shape === "string" && MARKER_SHAPES.includes(s.shape as MarkerShape)) {
      out[k] = { shape: s.shape as MarkerShape, color: s.color }
    }
  }
  return out
}

function sanitizeOrder(input: unknown): string[] {
  if (!Array.isArray(input)) return []
  return input.filter((x): x is string => typeof x === "string")
}

export function loadSets(): FacilitySet[] {
  if (typeof window === "undefined") return []
  try {
    const raw = localStorage.getItem(SETS_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter((s) => s && typeof s.id === "string" && typeof s.name === "string")
      .map((s) => ({
        id: s.id as string,
        name: s.name as string,
        savedAt: Number.isFinite(s.savedAt) ? (s.savedAt as number) : 0,
        facilities: sanitizeFacilities(s.facilities),
        styles: sanitizeStyles(s.styles),
        categoryOrder: sanitizeOrder(s.categoryOrder),
      }))
      .sort((a, b) => b.savedAt - a.savedAt)
  } catch {
    return []
  }
}

function persist(sets: FacilitySet[]): boolean {
  if (typeof window === "undefined") return false
  try {
    localStorage.setItem(SETS_KEY, JSON.stringify(sets))
    return true
  } catch {
    return false // QuotaExceededError 등 — 호출부가 사용자에게 알림
  }
}

// 현재 작업 상태를 새 세트로 저장. 같은 이름이 있으면 덮어쓴다(최신화).
export function saveSet(
  name: string,
  data: { facilities: Facility[]; styles: Record<string, CategoryStyle>; categoryOrder: string[] },
  savedAt: number,
): { ok: boolean; sets: FacilitySet[] } {
  const sets = loadSets()
  const trimmed = name.trim()
  const entry: FacilitySet = {
    id: newId(),
    name: trimmed,
    savedAt,
    facilities: data.facilities,
    styles: data.styles,
    categoryOrder: data.categoryOrder,
  }
  const without = sets.filter((s) => s.name !== trimmed)
  const next = [entry, ...without].sort((a, b) => b.savedAt - a.savedAt)
  const ok = persist(next)
  return { ok, sets: ok ? next : sets }
}

export function deleteSet(id: string): FacilitySet[] {
  const next = loadSets().filter((s) => s.id !== id)
  persist(next)
  return next
}

// 세트 1개를 JSON 파일 문자열로 직렬화 (포맷/버전 마커 포함)
export function serializeSet(set: FacilitySet): string {
  return JSON.stringify(
    {
      format: SET_FILE_FORMAT,
      version: SET_FILE_VERSION,
      name: set.name,
      savedAt: set.savedAt,
      facilities: set.facilities,
      styles: set.styles,
      categoryOrder: set.categoryOrder,
    },
    null,
    2,
  )
}

// 가져온 JSON 파일 문자열을 세트로 파싱·검증. 형식이 아니면 null.
export function parseSetFile(text: string): FacilitySet | null {
  try {
    const parsed = JSON.parse(text)
    if (!parsed || typeof parsed !== "object" || parsed.format !== SET_FILE_FORMAT) return null
    const facilities = sanitizeFacilities(parsed.facilities)
    if (facilities.length === 0) return null
    return {
      id: newId(),
      name: typeof parsed.name === "string" && parsed.name.trim() ? parsed.name.trim() : "가져온 시설",
      savedAt: Number.isFinite(parsed.savedAt) ? parsed.savedAt : 0,
      facilities,
      styles: sanitizeStyles(parsed.styles),
      categoryOrder: sanitizeOrder(parsed.categoryOrder),
    }
  } catch {
    return null
  }
}

// 가져온 세트를 localStorage 세트 목록에 추가 저장
export function addSet(set: FacilitySet): { ok: boolean; sets: FacilitySet[] } {
  const sets = loadSets()
  const next = [set, ...sets].sort((a, b) => b.savedAt - a.savedAt)
  const ok = persist(next)
  return { ok, sets: ok ? next : sets }
}
