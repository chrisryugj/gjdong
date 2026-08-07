import assert from "node:assert/strict"
import test from "node:test"
import { parsePop } from "../lib/crowd/jeju"

// GEONET getTimePopByCircle 응답 파싱 특성화 — 데이터 계약(2026-08-04 실측):
// TIME='NOW'·'3AVG' + 현재 시각부터 역순 24시간, IN=도민 OUT=관광객.

test("NOW/3AVG 행을 분리하고 역순 시계열을 오름차순으로 뒤집는다", () => {
  const pop = parsePop([
    { IN_POP: "10", OUT_POP: "20", TIME: "NOW" },
    { IN_POP: 5, OUT_POP: 5, TIME: "3AVG" },
    { IN_POP: "1", OUT_POP: "1", TIME: 14 }, // 역순: 최신이 먼저 온다
    { IN_POP: "2", OUT_POP: "2", TIME: 13 },
  ])
  assert.ok(pop)
  assert.equal(pop.inp, 10)
  assert.equal(pop.outp, 20)
  assert.equal(pop.total, 30)
  assert.equal(pop.avg3, 10)
  assert.deepEqual(pop.series, [
    { h: 13, v: 4 },
    { h: 14, v: 2 },
  ])
})

test("IN_POP이 빈 문자열인 시계열 행은 제외한다", () => {
  const pop = parsePop([
    { IN_POP: "10", OUT_POP: "0", TIME: "NOW" },
    { IN_POP: "", OUT_POP: "", TIME: 12 },
    { IN_POP: "3", OUT_POP: "0", TIME: 11 },
  ])
  assert.ok(pop)
  assert.deepEqual(pop.series, [{ h: 11, v: 3 }])
})

test("NOW 행이 없거나 NOW가 빈 값이면 null (지어내지 않는다)", () => {
  assert.equal(parsePop([{ IN_POP: "1", OUT_POP: "1", TIME: 10 }]), null)
  assert.equal(parsePop([{ IN_POP: "", OUT_POP: "", TIME: "NOW" }]), null)
  assert.equal(parsePop([]), null)
})

test("3AVG가 없으면 avg3=null, 문자열 숫자는 수치로 강제된다", () => {
  const pop = parsePop([{ IN_POP: "7.5", OUT_POP: "2.5", TIME: "NOW" }])
  assert.ok(pop)
  assert.equal(pop.total, 10)
  assert.equal(pop.avg3, null)
})
