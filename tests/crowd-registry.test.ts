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

test("신규 caps: 대기질 전 도시 · TourAPI 행사는 인천공항만 제외 · 지하철은 서울 계열만", () => {
  for (const id of CITY_IDS) {
    assert.equal(CITY_CAPS[id].air, true, `${id} air`)
    assert.equal(CITY_CAPS[id].tourEvents, id !== "incheon", `${id} tourEvents`)
    // 광진은 서울 RTD 부분집합 — 서울 플럼빙을 그대로 타므로 지하철도 함께 켠다
    assert.equal(CITY_CAPS[id].subway, id === "seoul" || id === "gwangjin", `${id} subway`)
  }
})

test("캐시 헤더: 서울·광진 300s / 부산·강원 120s(SWR 600) / 제주 900s / 인천 60s", () => {
  const sec = (id: keyof typeof ADAPTERS) => ADAPTERS[id].cacheHeaders["Cache-Control"]
  // 서울 RTD 원천이 5분 주기 — 서울 계열은 캐시를 원천 주기에 맞춘다
  assert.equal(sec("seoul"), "public, s-maxage=300, stale-while-revalidate=300")
  assert.equal(sec("gwangjin"), "public, s-maxage=300, stale-while-revalidate=300")
  // 부산·강원은 원천 대기가 길어(부산 MISS 9.4초) SWR 창을 폴링 5분보다 넉넉히 — 2026-10-05
  assert.equal(sec("busan"), "public, s-maxage=120, stale-while-revalidate=600")
  assert.equal(sec("gangwon"), "public, s-maxage=120, stale-while-revalidate=600")
  assert.equal(sec("jeju"), "public, s-maxage=900, stale-while-revalidate=900")
  assert.equal(sec("incheon"), "public, s-maxage=60, stale-while-revalidate=60")
})

test("폴링 주기: 제주만 15분 (2026-08 원천 차단 사고 대응 값 보존)", () => {
  for (const id of CITY_IDS) {
    assert.equal(CITY_CAPS[id].pollMinutes, id === "jeju" ? 15 : 5)
  }
})

test("캐시 창(s-maxage + SWR)이 폴링 주기를 덮는다 — 혼자 보는 사용자의 폴링이 원천 대기 MISS로 빠지지 않게 (인천은 원천이 빨라 제외)", () => {
  for (const id of CITY_IDS) {
    if (id === "incheon") continue
    const cc = ADAPTERS[id].cacheHeaders["Cache-Control"]
    const maxAge = Number(/s-maxage=(\d+)/.exec(cc)?.[1])
    const swr = Number(/stale-while-revalidate=(\d+)/.exec(cc)?.[1])
    assert.ok(maxAge + swr > CITY_CAPS[id].pollMinutes * 60, `${id}: ${cc} vs 폴링 ${CITY_CAPS[id].pollMinutes}분`)
  }
})

test("hasSpot: 정적 목록 도시는 자기 명소만 true — 다른 도시 명소·빈 이름은 false (404 판정)", async () => {
  assert.equal(await ADAPTERS.busan.hasSpot("감천문화마을"), true)
  assert.equal(await ADAPTERS.busan.hasSpot("경포해변"), false)
  assert.equal(await ADAPTERS.busan.hasSpot(""), false)
  assert.equal(await ADAPTERS.gangwon.hasSpot("경포해변"), true)
  assert.equal(await ADAPTERS.incheon.hasSpot("T1 1번 출국장"), true)
  assert.equal(await ADAPTERS.gwangjin.hasSpot("건대입구역"), true)
  assert.equal(await ADAPTERS.gwangjin.hasSpot("광화문·덕수궁"), false)
  for (const id of ["jeju", "busan", "gangwon", "incheon"] as const) {
    assert.equal(await ADAPTERS[id].hasSpot("존재하지 않는 명소"), false, id)
  }
})
