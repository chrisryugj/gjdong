import assert from "node:assert/strict"
import test from "node:test"
import {
  neighborBuildingQueries,
  pickConsistentKeywordDoc,
  statedAdminDong,
  withoutGu,
} from "../lib/utils/address-hints"
import type { KakaoKeywordDocument } from "../lib/types"

test("statedAdminDong: 1:1 법정동·폐지동·행정동 표기에서 행정동을 읽는다", () => {
  assert.equal(statedAdminDong("서울 광진구 능동로13길 69, 1층 (화양동)"), "화양동")
  assert.equal(statedAdminDong("서울 광진구 능동 237-2 광명빌딩"), "능동")
  assert.equal(statedAdminDong("서울 광진구 노유동 36-505 유진슈퍼"), "자양4동")
  assert.equal(statedAdminDong("서울 광진구 노유2동 49-117번지"), "자양4동")
  assert.equal(statedAdminDong("서울 광진구 모진동 195-19"), "화양동")
  assert.equal(statedAdminDong("서울 광진구 자양4동 785-1번지 대동상가"), "자양4동")
  assert.equal(statedAdminDong("서울 광진구 중곡3동 174-80"), "중곡3동")
})

test("statedAdminDong: 분동된 법정동만 적혔거나 도로명에 동 글자가 섞이면 없음", () => {
  assert.equal(statedAdminDong("서울 광진구 자양동 228-64"), undefined)
  assert.equal(statedAdminDong("서울 광진구 중곡동 50-19 101호"), undefined)
  assert.equal(statedAdminDong("서울 광진구 능동로 276, 1층"), undefined) // '능동로'의 능동은 동명이 아님
  assert.equal(statedAdminDong("서울 광진구 광장로 79"), undefined)
})

test("withoutGu: 구 토큰만 빼고, 구가 없으면 null", () => {
  assert.equal(withoutGu("서울 성동구 광나루로 614"), "서울 광나루로 614")
  assert.equal(withoutGu("서울특별시 광진구 구의동 1-1"), "서울특별시 구의동 1-1")
  assert.equal(withoutGu("서울 광나루로 614"), null)
})

test("neighborBuildingQueries: 부번은 본번 먼저, 이어서 같은 홀짝 ±2·±4", () => {
  assert.deepEqual(neighborBuildingQueries("서울 광진구 광나루로 570"), [
    "서울 광진구 광나루로 572",
    "서울 광진구 광나루로 568",
    "서울 광진구 광나루로 574",
    "서울 광진구 광나루로 566",
  ])
  assert.deepEqual(neighborBuildingQueries("서울 광진구 광나루로 509-11"), [
    "서울 광진구 광나루로 509",
    "서울 광진구 광나루로 511",
    "서울 광진구 광나루로 507",
    "서울 광진구 광나루로 513",
    "서울 광진구 광나루로 505",
  ])
  assert.deepEqual(neighborBuildingQueries("서울 광진구 아차산로29길 29-1")[0], "서울 광진구 아차산로29길 29")
  assert.deepEqual(neighborBuildingQueries("서울 광진구 능동로26길"), []) // 번호 없음
  assert.deepEqual(neighborBuildingQueries("서울 광진구 자양동 228-64"), []) // 지번은 대상 아님
})

const doc = (place_name: string, road_address_name: string, address_name: string): KakaoKeywordDocument => ({
  place_name,
  road_address_name,
  address_name,
  x: "127.07",
  y: "37.54",
  category_group_code: "",
  category_group_name: "",
})

test("pickConsistentKeywordDoc: 도로명·지점명이 맞는 결과를 고르고 다른 지점은 거른다", () => {
  const docs = [
    doc("아이스크림스토리 중곡점", "서울 광진구 천호대로119길 23", "서울 광진구 중곡동 130-10"),
    doc("아이스크림스토리 건대후문점", "서울 광진구 광나루로 370", "서울 광진구 화양동 116-2"),
  ]
  const r = pickConsistentKeywordDoc("서울 광진구 광나루로 아이스크림스토리 건대후문점", docs)
  assert.equal(r.checked, true)
  assert.equal(r.doc?.place_name, "아이스크림스토리 건대후문점")
})

test("pickConsistentKeywordDoc: 법정동이 다르면 채택하지 않는다", () => {
  const docs = [doc("현대종합공사", "서울 광진구 광나루로 535", "서울 광진구 구의동 59-23")]
  const r = pickConsistentKeywordDoc("서울 광진구 동일로6길 1 (자양동) 현대종합공사", docs)
  assert.equal(r.checked, true)
  assert.equal(r.doc, undefined)
})

test("pickConsistentKeywordDoc: 도로명·동이 없는 시설명 질의는 검사하지 않는다", () => {
  const r = pickConsistentKeywordDoc("광진구청", [doc("광진구청", "서울 광진구 자양로 117", "서울 광진구 자양동 680-63")])
  assert.equal(r.checked, false)
  assert.equal(r.doc, undefined)
})
