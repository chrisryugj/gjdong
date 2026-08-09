import assert from "node:assert/strict"
import test from "node:test"
import { parseFestivals } from "../lib/crowd/events"

// TourAPI searchFestival2 파서 — 진행 중 + 14일 내 예정만

const F = (over: Record<string, string>) => ({
  title: "테스트 축제",
  addr1: "부산광역시 해운대구",
  eventstartdate: "20260801",
  eventenddate: "20260815",
  mapx: "129.16",
  mapy: "35.16",
  firstimage: "",
  ...over,
})

test("parseFestivals: 진행 중 행사만 남기고 날짜를 대시 형식으로", () => {
  const out = parseFestivals([F({})], "20260809")
  assert.equal(out.length, 1)
  assert.equal(out[0].start, "2026-08-01")
  assert.equal(out[0].end, "2026-08-15")
  assert.equal(out[0].lat, 35.16)
  assert.equal(out[0].lng, 129.16)
})

test("parseFestivals: 종료된 행사·15일 이후 시작 행사는 버린다", () => {
  const out = parseFestivals(
    [
      F({ title: "끝난 축제", eventstartdate: "20260701", eventenddate: "20260808" }),
      F({ title: "먼 미래 축제", eventstartdate: "20260901", eventenddate: "20260905" }),
      F({ title: "예정 축제", eventstartdate: "20260820", eventenddate: "20260822" }),
    ],
    "20260809",
  )
  assert.deepEqual(
    out.map((e) => e.title),
    ["예정 축제"],
  )
})

test("parseFestivals: 날짜 형식 불량·제목 없음·비배열 방어", () => {
  assert.deepEqual(parseFestivals(null, "20260809"), [])
  const out = parseFestivals(
    [F({ eventstartdate: "2026-08-01" }), F({ title: "  " })],
    "20260809",
  )
  assert.equal(out.length, 0)
})

test("parseFestivals: 시작일 오름차순 정렬", () => {
  const out = parseFestivals(
    [F({ title: "b", eventstartdate: "20260810", eventenddate: "20260812" }), F({ title: "a" })],
    "20260809",
  )
  assert.deepEqual(
    out.map((e) => e.title),
    ["a", "b"],
  )
})
