import assert from "node:assert/strict"
import test from "node:test"
import { ADAPTERS } from "../lib/crowd/adapters"
import { CITIES, CITY_CAPS, CITY_IDS } from "../lib/crowd/cities"

// capability 테이블(클라이언트)과 어댑터 레지스트리(서버)의 정합 —
// 둘이 어긋나면 UI가 없는 원천을 호출하거나 있는 원천을 숨긴다.

test("전 도시: 레지스트리·capability·도시정보 키가 일치한다", () => {
  for (const id of CITY_IDS) {
    assert.ok(ADAPTERS[id], `ADAPTERS.${id} 누락`)
    assert.equal(ADAPTERS[id].id, id)
    assert.ok(CITY_CAPS[id], `CITY_CAPS.${id} 누락`)
    assert.ok(CITIES[id], `CITIES.${id} 누락`)
  }
})

test("caps.extra와 어댑터 fetchExtra 존재가 일치한다 (제주만 없음)", () => {
  for (const id of CITY_IDS) {
    assert.equal(
      CITY_CAPS[id].extra,
      ADAPTERS[id].fetchExtra != null,
      `${id}: caps.extra=${CITY_CAPS[id].extra}인데 fetchExtra ${ADAPTERS[id].fetchExtra != null ? "있음" : "없음"}`,
    )
  }
  assert.equal(CITY_CAPS.jeju.extra, false)
})

test("caps.disaster와 어댑터 fetchDisaster 존재가 일치한다 (전 도시 — 특보+재난문자)", () => {
  for (const id of CITY_IDS) {
    assert.equal(CITY_CAPS[id].disaster, ADAPTERS[id].fetchDisaster != null, `${id} disaster 불일치`)
    assert.equal(CITY_CAPS[id].disaster, true, `${id}: 안전축 확장 후 전 도시 true`)
  }
})

test("신규 caps: 대기질 전 도시 · TourAPI 행사는 제주·부산·강원 · 지하철은 서울만", () => {
  for (const id of CITY_IDS) {
    assert.equal(CITY_CAPS[id].air, true, `${id} air`)
    assert.equal(CITY_CAPS[id].tourEvents, id === "jeju" || id === "busan" || id === "gangwon", `${id} tourEvents`)
    assert.equal(CITY_CAPS[id].subway, id === "seoul", `${id} subway`)
  }
})

test("캐시 헤더: 서울·부산·강원 120s / 제주 900s / 인천 60s (값 보존)", () => {
  const sec = (id: keyof typeof ADAPTERS) => ADAPTERS[id].cacheHeaders["Cache-Control"]
  assert.equal(sec("seoul"), "public, s-maxage=120, stale-while-revalidate=180")
  assert.equal(sec("busan"), "public, s-maxage=120, stale-while-revalidate=180")
  assert.equal(sec("gangwon"), "public, s-maxage=120, stale-while-revalidate=180")
  assert.equal(sec("jeju"), "public, s-maxage=900, stale-while-revalidate=900")
  assert.equal(sec("incheon"), "public, s-maxage=60, stale-while-revalidate=60")
})

test("폴링 주기: 제주만 15분 (2026-08 원천 차단 사고 대응 값 보존)", () => {
  for (const id of CITY_IDS) {
    assert.equal(CITY_CAPS[id].pollMinutes, id === "jeju" ? 15 : 5)
  }
})
