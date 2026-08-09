import assert from "node:assert/strict"
import test from "node:test"
import { parseSubwayRows } from "../lib/crowd/seoul-rtd"

// RTD subway 실측(2026-08-09): row = [{호선, STATN_NM, Latitude, Longitude, realtimeArrivalList}]

const ROW = {
  호선: "3",
  STATN_NM: "경복궁",
  Latitude: "37.5769",
  Longitude: "126.9736",
  realtimeArrivalList: [
    { bstatnNm: "대화", updnLine: "상행", arvlMsg2: "5분 30초 후 (을지로3가)" },
    { bstatnNm: "오금", updnLine: "하행", arvlMsg2: "3분 후 (독립문)" },
  ],
}

test("parseSubwayRows: 호선·역명·좌표·도착 안내를 파싱한다", () => {
  const out = parseSubwayRows([ROW])
  assert.equal(out.length, 1)
  assert.equal(out[0].line, "3")
  assert.equal(out[0].station, "경복궁")
  assert.equal(out[0].lat, 37.5769)
  assert.equal(out[0].arrivals.length, 2)
  assert.equal(out[0].arrivals[0].dest, "대화")
  assert.equal(out[0].arrivals[0].msg, "5분 30초 후 (을지로3가)")
})

test("parseSubwayRows: 도착 안내 없는 역·필드 결손 행은 버린다", () => {
  assert.equal(parseSubwayRows([{ ...ROW, realtimeArrivalList: [] }]).length, 0)
  assert.equal(parseSubwayRows([{ ...ROW, STATN_NM: "" }]).length, 0)
  assert.equal(parseSubwayRows(undefined).length, 0)
})

test("parseSubwayRows: 역 4개·역당 도착 4건 상한", () => {
  const many = Array.from({ length: 6 }, (_, i) => ({
    ...ROW,
    STATN_NM: `역${i}`,
    realtimeArrivalList: Array.from({ length: 8 }, (_, j) => ({
      bstatnNm: "대화",
      updnLine: "상행",
      arvlMsg2: `${j}분 후`,
    })),
  }))
  const out = parseSubwayRows(many)
  assert.equal(out.length, 4)
  assert.equal(out[0].arrivals.length, 4)
})
