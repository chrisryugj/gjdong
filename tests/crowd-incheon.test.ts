import assert from "node:assert/strict"
import test from "node:test"
import { aggregate, gateLevelNum, hhmm, parseParkPage, toNumOrNull } from "../lib/crowd/incheon"

// 인천공항 어댑터 특성화 — 미운영 "-"를 0으로 뭉개지 않는 것과
// 주차 HTML의 "만차"(숫자 없음)를 잔여 0으로 읽는 것이 핵심 계약이다.

test('toNumOrNull: 미운영 "-"·빈 문자열은 null (0이 아니다)', () => {
  assert.equal(toNumOrNull("-"), null)
  assert.equal(toNumOrNull(""), null)
  assert.equal(toNumOrNull("  "), null)
  assert.equal(toNumOrNull(null), null)
  assert.equal(toNumOrNull("abc"), null)
  assert.equal(toNumOrNull("12"), 12)
  assert.equal(toNumOrNull("3.5"), 3.5)
})

test("gateLevelNum 경계: 10/20/30분", () => {
  assert.equal(gateLevelNum(9), 1)
  assert.equal(gateLevelNum(10), 2)
  assert.equal(gateLevelNum(19), 2)
  assert.equal(gateLevelNum(20), 3)
  assert.equal(gateLevelNum(29), 3)
  assert.equal(gateLevelNum(30), 4)
})

test('hhmm: "0630" → "06:30", 4자리가 아니면 빈 문자열', () => {
  assert.equal(hhmm("0630"), "06:30")
  assert.equal(hhmm("2359"), "23:59")
  assert.equal(hhmm("630"), "")
  assert.equal(hhmm(""), "")
})

// ── aggregate 분류 — 닫힌 출국장(미운영)과 데이터 없음(정보 없음)을 뭉개지 않는 계약
const gate = { name: "T1 1번 출국장", category: "출국장", lat: 0, lng: 0, terminal: "1" as const, no: 1 }
const row = (open: boolean, waitMin: number | null) => ({
  id: "DG1_E",
  side: "E",
  open,
  waitMin,
  people: waitMin != null ? 10 : null,
  operBgn: "0500",
  operEnd: "1900",
  at: "202608080800",
})
const snapOf = (rows: ReturnType<typeof row>[]) => ({ rows: new Map(rows.length ? [["1-1", rows]] : []) })

test("aggregate: 입구 행이 전부 닫힘(NP)이면 '미운영' — 정보 없음이 아니다", () => {
  assert.equal(aggregate(gate, snapOf([row(false, null), row(false, null)])).level, "미운영")
})

test("aggregate: 행 자체가 없으면 '정보 없음'", () => {
  assert.equal(aggregate(gate, snapOf([])).level, "정보 없음")
})

test("aggregate: 열려 있는데 수치가 없으면 '정보 없음' (미운영으로 오분류 금지)", () => {
  assert.equal(aggregate(gate, snapOf([row(true, null)])).level, "정보 없음")
})

test("aggregate: 운영 입구의 최대 대기로 등급 — 닫힌 입구는 무시", () => {
  const r = aggregate(gate, snapOf([row(true, 25), row(false, null)]))
  assert.equal(r.level, "약간 붐빔")
  assert.equal(r.waitMin, 25)
})

const page = (zone: string, strong: string, width: string) =>
  `<div class="num-txt">
    <span>${zone}</span>
    <strong class="c-point01">${strong}</strong>
  </div>
  <div class="num-line on"><span style="width: ${width}%"></span></div>`

test("parseParkPage: 잔여 대수와 점유율을 함께 파싱한다", () => {
  const lots = parseParkPage(page("P1 지상", "1,234대 가능", "56.7"), "1", "단기")
  assert.equal(lots.length, 1)
  assert.equal(lots[0].name, "T1 단기 P1 지상")
  assert.equal(lots[0].available, 1234)
  assert.equal(lots[0].occupancyPct, 57)
  assert.equal(lots[0].capacity, 0) // 총면수는 원천에 없다 — 역산하지 않는 계약
})

test('parseParkPage: "만차"는 잔여 0으로 싣는다 (스킵하면 가장 중요한 상태가 사라진다)', () => {
  const lots = parseParkPage(page("P2 지하", "만차", "100"), "2", "장기")
  assert.equal(lots.length, 1)
  assert.equal(lots[0].name, "T2 장기 P2 지하")
  assert.equal(lots[0].available, 0)
  assert.equal(lots[0].occupancyPct, 100)
})

test("parseParkPage: 구역명이 빈 블록은 건너뛴다", () => {
  assert.deepEqual(parseParkPage(page("", "10대 가능", "50"), "1", "단기"), [])
})
