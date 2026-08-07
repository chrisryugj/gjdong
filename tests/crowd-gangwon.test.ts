import assert from "node:assert/strict"
import test from "node:test"
import { gnItems, isCounting, levelOf, losGrade } from "../lib/crowd/gangwon"

// 강원 어댑터 특성화 — 핵심은 availLots=0 함정(2026-08-07 실측):
// 잔여 0은 만차가 아니라 "집계 없음"일 수 있다. 오독하면 새벽 내내 강릉역 410면이 붐빔이 된다.

const lot = (cell: number, cur: number) => ({
  name: "테스트주차장",
  cell,
  cur,
  lat: 0,
  lng: 0,
  addr: "",
  open: "",
  close: "",
})

test("isCounting: 잔여 0(cur=cell)은 집계 중단으로 보고 등급 산출에서 뺀다", () => {
  // 실측 시나리오: 강릉역 410면, availLots=0 → cur=410 → 재차율 100%로 읽으면 거짓 붐빔
  assert.equal(isCounting(lot(410, 410)), false)
})

test("isCounting: 정상적인 '텅 빔'(cur=0)과 일반 재차는 집계 중", () => {
  assert.equal(isCounting(lot(170, 0)), true) // 강문제1 170/170 잔여 — 텅 빔
  assert.equal(isCounting(lot(100, 55)), true)
})

test("isCounting: cell=0 주차장은 등급 산출 불가", () => {
  assert.equal(isCounting(lot(0, 0)), false)
})

test("losGrade: A·B 원활(1) / E·F 정체(3) / 그 외·빈값 서행(2), 소문자 허용", () => {
  assert.equal(losGrade("A"), 1)
  assert.equal(losGrade("b"), 1)
  assert.equal(losGrade("C"), 2)
  assert.equal(losGrade("D"), 2)
  assert.equal(losGrade("E"), 3)
  assert.equal(losGrade("f"), 3)
  assert.equal(losGrade(""), 2)
  assert.equal(losGrade(undefined), 2)
  assert.equal(losGrade("G"), 2)
})

// ── levelOf 단일 근거 상한 (2026-08-08 07:54 실측: 경포아쿠아리움 68면 avail=1 하나가
// 도로 서행인데도 경포해변·아르떼를 붐빔으로 만들었다 — 센서 고착과 실제 만차 구분 불가)

const spotDef = (prk: Array<[string, string]>, roads: string[] = []) => ({
  name: "테스트지점",
  category: "해변",
  lat: 37.8,
  lng: 128.9,
  cams: [] as Array<[string, string]>,
  prk,
  roads,
})
const road = (crossName: string, grade: number) => ({ crossName, grade, los: "D", delay: 0, volume: 0, walker: 0 })
const snap = (lots: Array<[string, ReturnType<typeof lot>]>, roads: ReturnType<typeof road>[] = []) => ({
  lots: new Map(lots),
  roads,
})

test("levelOf: 집계 주차장 1곳 ≥95%는 도로 정체 없이는 '약간 붐빔' 상한", () => {
  const s = snap([["P1", lot(68, 67)]], [road("테스트사거리", 2)])
  assert.equal(levelOf(spotDef([["P1", "아쿠아리움"]], ["테스트"]), s).level, "약간 붐빔")
})

test("levelOf: 복수 집계 주차장이면 ≥95% 하나로도 붐빔 유지", () => {
  const s = snap([
    ["P1", lot(68, 67)],
    ["P2", lot(100, 40)],
  ])
  assert.equal(levelOf(spotDef([["P1", "아쿠아리움"], ["P2", "이웃"]]), s).level, "붐빔")
})

test("levelOf: 단일 주차장이라도 도로 정체(3)가 뒷받침하면 붐빔 유지", () => {
  const s = snap([["P1", lot(68, 67)]], [road("테스트사거리", 3)])
  assert.equal(levelOf(spotDef([["P1", "아쿠아리움"]], ["테스트"]), s).level, "붐빔")
})

test("levelOf: 두 축 모두 없으면 정보 없음", () => {
  assert.equal(levelOf(spotDef([]), snap([])).level, "정보 없음")
})

test("gnItems: 공공데이터포털 빈 응답·비배열 item은 전부 빈 배열", () => {
  assert.deepEqual(gnItems(null), [])
  assert.deepEqual(gnItems({}), []) // 동일 키 동시요청 침묵 실패가 이 형태로 온다
  assert.deepEqual(gnItems({ body: { items: {} } }), [])
  assert.deepEqual(gnItems({ body: { items: { item: "oops" } } }), [])
  assert.deepEqual(gnItems({ body: { items: { item: [{ prkId: "P1" }] } } }), [{ prkId: "P1" }])
})
