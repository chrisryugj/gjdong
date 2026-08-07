import assert from "node:assert/strict"
import test from "node:test"
import { DISTRICTS, districtOf, listDistricts } from "../lib/crowd/districts"
import { DISTRICT_T } from "../lib/crowd/i18n-districts"
import { JEJU_SPOTS } from "../lib/crowd/jeju"
import { BUSAN_SPOTS } from "../lib/crowd/busan"
import { GANGWON_SPOTS } from "../lib/crowd/gangwon"

// 자치구 정적 매핑 무결성 — 어댑터 정의와 매핑·번역 테이블이 어긋나면 잡는다.

test("정적 정의 도시(제주·부산·강원): 전 지점이 자치구 매핑을 가진다", () => {
  for (const s of JEJU_SPOTS) assert.ok(DISTRICTS.jeju[s.name], `jeju ${s.name} 미매핑`)
  for (const s of BUSAN_SPOTS) assert.ok(DISTRICTS.busan[s.name], `busan ${s.name} 미매핑`)
  for (const s of GANGWON_SPOTS) assert.ok(DISTRICTS.gangwon[s.name], `gangwon ${s.name} 미매핑`)
})

test("서울: 121곳 매핑, 광진구에 어린이대공원이 있다", () => {
  assert.ok(Object.keys(DISTRICTS.seoul).length >= 100)
  assert.equal(districtOf("seoul", "어린이대공원"), "광진구")
})

test("매핑 값은 전부 구·시·군으로 끝난다", () => {
  for (const table of Object.values(DISTRICTS)) {
    for (const [name, gu] of Object.entries(table)) {
      assert.match(gu, /(구|시|군)$/, `${name} → ${gu}`)
    }
  }
})

test("번역 테이블: 매핑에 등장하는 모든 구가 3개 언어를 가진다 (조용한 누락 방지)", () => {
  const all = new Set(Object.values(DISTRICTS).flatMap((t) => Object.values(t)))
  for (const gu of all) {
    const tuple = DISTRICT_T[gu]
    assert.ok(tuple, `DISTRICT_T에 ${gu} 없음`)
    tuple.forEach((v, i) => assert.ok(v.trim().length > 0, `${gu}[${i}] 빈 번역`))
  }
})

test("listDistricts: 존재하는 구만 가나다순", () => {
  const got = listDistricts("gangwon", GANGWON_SPOTS.map((s) => s.name))
  assert.deepEqual(got, [...got].sort((a, b) => a.localeCompare(b, "ko")))
  assert.ok(got.includes("강릉시"))
  assert.deepEqual(listDistricts("seoul", ["없는지점"]), [])
})
