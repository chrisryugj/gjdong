import assert from "node:assert/strict"
import test from "node:test"
import { parseSetFile, serializeSet, SET_FILE_FORMAT, type FacilitySet } from "../lib/facility-sets"

function sampleSet(): FacilitySet {
  return {
    id: "set-1",
    name: "자양동 점검",
    savedAt: 1_700_000_000_000,
    facilities: [
      {
        id: "f1",
        name: "자양보건지소",
        category: "자양제2동",
        originalInput: "광진구 자양로 117",
        address: "광진구 자양로 117(자양동 680-1, 자양2동)",
        lat: 37.5384,
        lon: 127.0823,
        createdAt: 1_700_000_000_000,
      },
    ],
    styles: { 자양제2동: { shape: "star", color: "#16a34a" } },
    categoryOrder: ["자양제2동", "구의제1동"],
  }
}

test("serialize → parse 라운드트립: 데이터 보존 + 새 id 부여", () => {
  const set = sampleSet()
  const parsed = parseSetFile(serializeSet(set))
  assert.ok(parsed)
  assert.equal(parsed!.name, "자양동 점검")
  assert.equal(parsed!.facilities.length, 1)
  assert.equal(parsed!.facilities[0].name, "자양보건지소")
  assert.deepEqual(parsed!.categoryOrder, ["자양제2동", "구의제1동"])
  assert.deepEqual(parsed!.styles["자양제2동"], { shape: "star", color: "#16a34a" })
  assert.notEqual(parsed!.id, "set-1") // 가져올 때 새 id 발급
})

test("형식 마커 없는 JSON은 거부", () => {
  assert.equal(parseSetFile(JSON.stringify({ facilities: [] })), null)
  assert.equal(parseSetFile("not json"), null)
})

test("유효 시설 0개면 거부", () => {
  const empty = { format: SET_FILE_FORMAT, name: "빈세트", facilities: [] }
  assert.equal(parseSetFile(JSON.stringify(empty)), null)
})

test("sanitize: 비-hex 색상·잘못된 모양·깨진 좌표 제거", () => {
  const malicious = {
    format: SET_FILE_FORMAT,
    name: "조작",
    facilities: [
      { id: "ok", name: "정상", lat: 37.5, lon: 127.0 },
      { id: "bad", name: "좌표깨짐", lat: Number.NaN, lon: 127.0 }, // 제거되어야
    ],
    styles: {
      good: { shape: "circle", color: "#dc2626" },
      xss: { shape: "circle", color: 'red" onmouseover="alert(1)' }, // hex 아님 → 제거
      badShape: { shape: "hexagon", color: "#000000" }, // 화이트리스트 외 → 제거
    },
    categoryOrder: ["good", 42, "xss"], // 숫자 제거
  }
  const parsed = parseSetFile(JSON.stringify(malicious))
  assert.ok(parsed)
  assert.equal(parsed!.facilities.length, 1) // 깨진 좌표 1건 제외
  assert.deepEqual(Object.keys(parsed!.styles), ["good"]) // 위험 스타일 제거
  assert.deepEqual(parsed!.categoryOrder, ["good", "xss"]) // 문자열만
})
