import assert from "node:assert/strict"
import test from "node:test"
import { gnItems, isCounting, losGrade } from "../lib/crowd/gangwon"

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

test("gnItems: 공공데이터포털 빈 응답·비배열 item은 전부 빈 배열", () => {
  assert.deepEqual(gnItems(null), [])
  assert.deepEqual(gnItems({}), []) // 동일 키 동시요청 침묵 실패가 이 형태로 온다
  assert.deepEqual(gnItems({ body: { items: {} } }), [])
  assert.deepEqual(gnItems({ body: { items: { item: "oops" } } }), [])
  assert.deepEqual(gnItems({ body: { items: { item: [{ prkId: "P1" }] } } }), [{ prkId: "P1" }])
})
