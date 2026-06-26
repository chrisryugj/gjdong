// 마커 모양/색상 + 분류별 스타일(localStorage) — 시설관리 대시보드
import { CATEGORY_PALETTE, getCategoryColor, UNCATEGORIZED_COLOR } from "@/lib/facility-storage"

export type MarkerShape = "pin" | "circle" | "square" | "diamond" | "triangle" | "star"

export const MARKER_SHAPES: MarkerShape[] = ["pin", "circle", "square", "diamond", "triangle", "star"]

export const SHAPE_LABELS: Record<MarkerShape, string> = {
  pin: "핀",
  circle: "원",
  square: "사각",
  diamond: "마름모",
  triangle: "삼각",
  star: "별",
}

// 색상 팔레트는 분류 색상과 동일 세트 사용
export const MARKER_COLORS: string[] = [...CATEGORY_PALETTE, UNCATEGORIZED_COLOR]

export type CategoryStyle = { shape: MarkerShape; color: string }

const STYLE_KEY = "gjdong_facility_styles_v1"

// HTML 속성에 보간해도 안전한 색상값(#rrggbb / #rgb)만 통과
function isHexColor(c: unknown): c is string {
  return typeof c === "string" && /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(c)
}

export function loadStyles(): Record<string, CategoryStyle> {
  if (typeof window === "undefined") return {}
  try {
    const raw = localStorage.getItem(STYLE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== "object") return {}
    const out: Record<string, CategoryStyle> = {}
    for (const [k, v] of Object.entries(parsed)) {
      const s = v as Partial<CategoryStyle>
      // color는 hex(#rrggbb)만 허용 — 이 값이 보고서/지도 HTML 속성에 보간되므로,
      // localStorage가 조작된 경우 속성 탈출(XSS)을 차단(저장형 입력 검증).
      if (s && isHexColor(s.color) && typeof s.shape === "string" && MARKER_SHAPES.includes(s.shape as MarkerShape)) {
        out[k] = { shape: s.shape as MarkerShape, color: s.color }
      }
    }
    return out
  } catch {
    return {}
  }
}

export function saveStyles(styles: Record<string, CategoryStyle>): void {
  if (typeof window === "undefined") return
  try {
    localStorage.setItem(STYLE_KEY, JSON.stringify(styles))
  } catch {
    /* 무시 */
  }
}

const ORDER_KEY = "gjdong_facility_cat_order_v1"

// 사용자가 드래그로 정한 분류 표시 순서(localStorage). 색상과 별개로 관리한다.
export function loadCategoryOrder(): string[] {
  if (typeof window === "undefined") return []
  try {
    const raw = localStorage.getItem(ORDER_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((x): x is string => typeof x === "string")
  } catch {
    return []
  }
}

export function saveCategoryOrder(order: string[]): void {
  if (typeof window === "undefined") return
  try {
    localStorage.setItem(ORDER_KEY, JSON.stringify(order))
  } catch {
    /* 무시 */
  }
}

// 저장된 순서를 우선 적용하고, 순서에 없는(새로 등장한) 분류는 원래 등장 순서대로 뒤에 붙인다.
export function orderCategories(cats: string[], order: string[]): string[] {
  const rank = new Map(order.map((c, i) => [c, i] as const))
  const original = new Map(cats.map((c, i) => [c, i] as const))
  return [...cats].sort((a, b) => {
    const ra = rank.get(a) ?? Infinity
    const rb = rank.get(b) ?? Infinity
    if (ra !== rb) return ra - rb
    return (original.get(a) ?? 0) - (original.get(b) ?? 0)
  })
}

// 분류 → 스타일. 사용자가 지정한 게 있으면 우선, 없으면 색상 해시 + 기본 핀, 미분류는 중립 핀.
export function resolveStyle(category: string | undefined, styles: Record<string, CategoryStyle>): CategoryStyle {
  const c = category?.trim()
  if (!c) return { shape: "pin", color: UNCATEGORIZED_COLOR }
  if (styles[c]) return styles[c]
  return { shape: "pin", color: getCategoryColor(c) }
}

// 모양별 SVG 문자열 (지도 divIcon + 미리보기 ShapeIcon 공용). 흰 테두리로 대비 확보.
export function markerSvg(shape: MarkerShape, color: string, px = 26): string {
  const stroke = `stroke="#ffffff" stroke-width="2" stroke-linejoin="round"`
  if (shape === "pin") {
    const h = Math.round(px * 1.5)
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${h}" viewBox="0 0 25 38">
      <path d="M12.5 0C5.6 0 0 5.6 0 12.5C0 21.9 12.5 38 12.5 38S25 21.9 25 12.5C25 5.6 19.4 0 12.5 0Z" fill="${color}" stroke="#fff" stroke-width="1.5"/>
      <circle cx="12.5" cy="12.5" r="5" fill="#fff"/>
    </svg>`
  }
  const inner = (() => {
    switch (shape) {
      case "circle":
        return `<circle cx="12" cy="12" r="9" fill="${color}" ${stroke}/>`
      case "square":
        return `<rect x="3.5" y="3.5" width="17" height="17" rx="3" fill="${color}" ${stroke}/>`
      case "diamond":
        return `<path d="M12 2 L22 12 L12 22 L2 12 Z" fill="${color}" ${stroke}/>`
      case "triangle":
        return `<path d="M12 3 L22 21 L2 21 Z" fill="${color}" ${stroke}/>`
      case "star":
        return `<path d="M12 2 l2.9 6.1 6.6.9 -4.8 4.6 1.2 6.6 -5.9 -3.2 -5.9 3.2 1.2 -6.6 -4.8 -4.6 6.6 -.9 Z" fill="${color}" ${stroke}/>`
      default:
        return `<circle cx="12" cy="12" r="9" fill="${color}" ${stroke}/>`
    }
  })()
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${px}" viewBox="0 0 24 24">${inner}</svg>`
}

// Leaflet divIcon용 — 그림자 래퍼 + 모양별 크기/앵커
export function markerIcon(shape: MarkerShape, color: string): { html: string; size: [number, number]; anchor: [number, number] } {
  const shadow = "filter:drop-shadow(0 1px 2px rgba(0,0,0,0.4));line-height:0;"
  if (shape === "pin") {
    return {
      html: `<div style="${shadow}">${markerSvg("pin", color, 26)}</div>`,
      size: [26, 39],
      anchor: [13, 39],
    }
  }
  return {
    html: `<div style="${shadow}">${markerSvg(shape, color, 26)}</div>`,
    size: [26, 26],
    anchor: [13, 13],
  }
}
