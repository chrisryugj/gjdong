import assert from "node:assert/strict"
import test from "node:test"
import {
  boundsOf,
  cityViewBounds,
  containsBounds,
  cullLabelBoxes,
  SEARCH_FOCUS_MAX,
  searchFocusSet,
  wantsNameLabel,
} from "../lib/crowd/map-view"
import { CITIES, CITY_IDS } from "../lib/crowd/cities"
import { JEJU_SPOTS } from "../lib/crowd/jeju"
import { BUSAN_SPOTS } from "../lib/crowd/busan"
import { GANGWON_SPOTS } from "../lib/crowd/gangwon"
import { INCHEON_SPOTS } from "../lib/crowd/incheon"

test("CITIES.bounds: 정적 정의 명소가 전부 bbox 안 (어댑터 좌표를 고치면 scripts/crowd-city-bounds.ts 재실행)", () => {
  const inside = (city: keyof typeof CITIES, pts: Array<{ name: string; lat: number; lng: number }>) => {
    const [[s, w], [n, e]] = CITIES[city].bounds
    for (const p of pts) assert.ok(p.lat >= s && p.lat <= n && p.lng >= w && p.lng <= e, `${city} ${p.name} 밖`)
  }
  inside("jeju", JEJU_SPOTS)
  inside("busan", BUSAN_SPOTS)
  inside("incheon", INCHEON_SPOTS)
  // 강원은 등급 원천(주차·교차로)이 있는 강릉권만 — 외곽까지 담으면 지점이 콩알이 된다
  const core = GANGWON_SPOTS.filter((s) => s.prk.length > 0 || s.roads.length > 0)
  inside("gangwon", core)
  assert.ok(core.length >= 2 && core.length < GANGWON_SPOTS.length)
})

test("CITIES.bounds: 남<북·서<동이고 center를 담는다", () => {
  for (const id of CITY_IDS) {
    const [[s, w], [n, e]] = CITIES[id].bounds
    assert.ok(s < n && w < e, id)
    const [lat, lng] = CITIES[id].center
    assert.ok(lat >= s - 0.2 && lat <= n + 0.2 && lng >= w - 0.2 && lng <= e + 0.2, `${id} center가 bbox와 동떨어짐`)
  }
})

test("cityViewBounds: CITIES 상수 center 참조일 때만 정적 bbox (보고서 fitView 중심은 null)", () => {
  assert.equal(cityViewBounds("busan", CITIES.busan.center), CITIES.busan.bounds)
  assert.equal(cityViewBounds("busan", [...CITIES.busan.center] as [number, number]), null)
  assert.equal(cityViewBounds("busan", CITIES.seoul.center), null)
  assert.equal(cityViewBounds(null, CITIES.seoul.center), null)
  assert.equal(cityViewBounds("nowhere", CITIES.seoul.center), null)
  assert.equal(cityViewBounds("seoul", undefined), null)
})

test("boundsOf·containsBounds", () => {
  assert.equal(boundsOf([]), null)
  const b = boundsOf([
    { lat: 37.5, lng: 127.1 },
    { lat: 37.4, lng: 127.0 },
    { lat: 37.6, lng: 126.9 },
  ])
  assert.deepEqual(b, [
    [37.4, 126.9],
    [37.6, 127.1],
  ])
  assert.ok(containsBounds(b!, [[37.45, 127], [37.55, 127.05]]))
  assert.ok(!containsBounds(b!, [[37.45, 127], [37.61, 127.05]]))
  assert.ok(containsBounds(b!, [[37.45, 127], [37.61, 127.05]], 0.02))
})

test("searchFocusSet: 1~30개만 지도 반영, 0개·과다·검색 없음은 null", () => {
  assert.equal(searchFocusSet(null), null)
  assert.equal(searchFocusSet(undefined), null)
  assert.equal(searchFocusSet([]), null)
  assert.deepEqual([...searchFocusSet(["성수카페거리"])!], ["성수카페거리"])
  const many = Array.from({ length: SEARCH_FOCUS_MAX }, (_, i) => `s${i}`)
  assert.equal(searchFocusSet(many)!.size, SEARCH_FOCUS_MAX)
  assert.equal(searchFocusSet([...many, "x"]), null)
})

test("wantsNameLabel: 좁은 화면은 약간 붐빔·붐빔 + 즐겨찾기 + 선택만, 검색 중엔 매칭만", () => {
  const base = { levelNum: 1, fav: false, selected: false, matched: null as boolean | null, crowded: false }
  assert.equal(wantsNameLabel(base), true)
  assert.equal(wantsNameLabel({ ...base, crowded: true }), false)
  assert.equal(wantsNameLabel({ ...base, crowded: true, levelNum: 2 }), false)
  assert.equal(wantsNameLabel({ ...base, crowded: true, levelNum: 3 }), true)
  assert.equal(wantsNameLabel({ ...base, crowded: true, levelNum: 4 }), true)
  assert.equal(wantsNameLabel({ ...base, crowded: true, fav: true }), true)
  assert.equal(wantsNameLabel({ ...base, crowded: true, selected: true }), true)
  assert.equal(wantsNameLabel({ ...base, matched: false, levelNum: 4 }), false)
  assert.equal(wantsNameLabel({ ...base, matched: false, selected: true }), true)
  // 좁은 화면이라도 검색 매칭은 등급과 무관하게 이름표
  assert.equal(wantsNameLabel({ ...base, crowded: true, matched: true }), true)
})

test("cullLabelBoxes: 우선순위 앞이 남고, 겹치는 이름표·남은 점을 덮는 이름표·이름표 밑 점은 숨김", () => {
  const box = (x: number, y: number, w = 60) => ({ x, y, w, h: 20, r: 8 })
  // 멀리 떨어진 둘 — 둘 다 남는다
  assert.deepEqual(cullLabelBoxes([box(0, 0), box(300, 300)]), [false, false])
  // 이름표끼리 겹침
  assert.deepEqual(cullLabelBoxes([box(0, 0), box(10, 5)]), [false, true])
  // 두 번째 이름표가 첫 점을 덮는다 (점은 이름표 왼쪽 — 이름표끼리는 안 겹침)
  assert.deepEqual(cullLabelBoxes([box(100, 0), box(40, 2, 50)]), [false, true])
  // 두 번째 점이 첫 이름표 밑에 깔림 (이름표는 위로 비켜 안 겹치게)
  assert.deepEqual(cullLabelBoxes([box(0, 0), box(40, 14, 10)]), [false, true])
  // 숨긴 이름표는 장애물이 아니다 — 세 번째는 두 번째와만 겹치면 남는다
  assert.deepEqual(cullLabelBoxes([box(0, 0), box(10, 5), box(10, 40)]), [false, true, false])
})
