// 대시보드 지도의 뷰·이름표 규칙 — crowd-map.tsx가 쓰는 순수 함수 (tests/crowd-map-view.test.ts가 고정)

import { CITIES, isCityId } from "@/lib/crowd/cities"

/** [[남, 서], [북, 동]] — Leaflet LatLngBoundsLiteral과 같은 모양 */
export type Bounds = [[number, number], [number, number]]

/**
 * 도시 전체 보기면 정적 bbox, 아니면 null.
 * 대시보드는 center로 CITIES 상수 자체(참조)를 넘긴다 = "그 도시 기본 뷰". 보고서 배치도는 fitView가
 * 만든 부분 집합 중심을 넘기므로 참조가 달라 기존 동작(데이터 도착 시 실좌표 fitBounds)을 유지한다.
 */
export function cityViewBounds(fitCity: string | null | undefined, center: [number, number] | undefined): Bounds | null {
  if (!isCityId(fitCity) || !center || center !== CITIES[fitCity].center) return null
  return CITIES[fitCity].bounds
}

export function boundsOf(points: ReadonlyArray<{ lat: number; lng: number }>): Bounds | null {
  if (points.length === 0) return null
  let s = Infinity
  let w = Infinity
  let n = -Infinity
  let e = -Infinity
  for (const p of points) {
    s = Math.min(s, p.lat)
    w = Math.min(w, p.lng)
    n = Math.max(n, p.lat)
    e = Math.max(e, p.lng)
  }
  return [
    [s, w],
    [n, e],
  ]
}

/** outer가 inner를 담는가 — tol(도)만큼 바깥 여유를 허용 */
export function containsBounds(outer: Bounds, inner: Bounds, tol = 0): boolean {
  return (
    inner[0][0] >= outer[0][0] - tol &&
    inner[0][1] >= outer[0][1] - tol &&
    inner[1][0] <= outer[1][0] + tol &&
    inner[1][1] <= outer[1][1] + tol
  )
}

/** 검색 결과를 지도에 반영할 최대 개수 — 그보다 많으면 "찾았다"가 아니라 도시 전체라 지도는 그대로 둔다 */
export const SEARCH_FOCUS_MAX = 30

/** 검색 매칭 이름 → 지도 반영 집합. 0개·과다·검색 없음은 null(지도 불변) */
export function searchFocusSet(names: readonly string[] | null | undefined): Set<string> | null {
  if (!names || names.length === 0 || names.length > SEARCH_FOCUS_MAX) return null
  return new Set(names)
}

/** 좁은 화면 기준(지도 컨테이너 폭, px) — 390px 모바일에서 121개 이름표가 한 덩어리가 되던 문제 */
export const NARROW_MAP_WIDTH = 640
/** 이 개수 이하면 좁아도 이름표를 다 단다 (광진 6·인천 8·강원 18·부산 26은 덩어리가 안 된다) */
export const NARROW_LABEL_MIN_SPOTS = 30

/**
 * 이름표(permanent pill)를 달 지점인가. 이름표 모드가 켜진 상태에서만 묻는다.
 * 좁은 화면 + 지점 많음이면 혼잡 위주(약간 붐빔·붐빔) + 즐겨찾기 + 선택만 — 나머지는 hover 툴팁으로 내려간다.
 * 검색 중이면 매칭 지점은 화면 폭과 무관하게 이름표를 달고(찾는 대상이다), 흐려진 지점은 뗀다.
 */
export function wantsNameLabel(o: {
  levelNum: number
  fav: boolean
  selected: boolean
  /** 검색 매칭(true) · 비매칭으로 흐림(false) · 검색 없음(null) */
  matched: boolean | null
  crowded: boolean
}): boolean {
  if (o.selected || o.matched === true) return true
  if (o.matched === false) return false
  if (!o.crowded) return true
  return o.fav || o.levelNum >= 3
}

/** 이름표 겹침 판정 입력 — x,y = 마커 중심(컨테이너 px), w,h = 이름표 크기, r = 마커 반지름 */
export interface LabelBox {
  x: number
  y: number
  w: number
  h: number
  r: number
}

type Rect = { x1: number; y1: number; x2: number; y2: number }
const hit = (a: Rect, b: Rect) => a.x1 < b.x2 && a.x2 > b.x1 && a.y1 < b.y2 && a.y2 > b.y1

/**
 * 우선순위 순으로 정렬된 이름표 중 숨길 것(true)을 고른다. 이름표는 마커 오른쪽 gap px에 세로 중앙 정렬.
 * 숨김 조건: 남긴 이름표와 겹침 · 남긴 이름표의 마커 점을 덮음 · 내 점이 남긴 이름표 밑에 깔림.
 * 이름표끼리만 보던 시절엔 남대문시장·숭례문·북창동처럼 점이 몰린 곳에서 이름표가 이웃 점을 덮어
 * 어느 점의 이름인지 읽히지 않았다(2026-10-05 데스크톱 붐빔 필터 실측).
 */
export function cullLabelBoxes(boxes: readonly LabelBox[], gap = 8): boolean[] {
  const keptLabels: Rect[] = []
  const keptDots: Rect[] = []
  return boxes.map((b) => {
    const label = { x1: b.x + gap, y1: b.y - b.h / 2, x2: b.x + gap + b.w, y2: b.y + b.h / 2 }
    const dot = { x1: b.x - b.r, y1: b.y - b.r, x2: b.x + b.r, y2: b.y + b.r }
    const culled = keptLabels.some((r) => hit(label, r) || hit(dot, r)) || keptDots.some((r) => hit(label, r))
    if (!culled) {
      keptLabels.push(label)
      keptDots.push(dot)
    }
    return culled
  })
}
