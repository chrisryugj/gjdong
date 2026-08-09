import assert from "node:assert/strict"
import test from "node:test"
import { airGrade, parseAirRows, resolveStation } from "../lib/crowd/air"

// 에어코리아 시도별 실시간 파서 — "-"·통신장애 행이 흔한 원천

test("parseAirRows: 정상 행 파싱 + '-' 값은 null", () => {
  const rows = parseAirRows([
    { stationName: "광진구", dataTime: "2026-08-09 14:00", pm25Value: "12", pm10Value: "30", o3Value: "0.041" },
    { stationName: "중구", pm25Value: "-", pm10Value: "-", o3Value: "-" },
  ])
  assert.equal(rows.get("광진구")?.pm25, 12)
  assert.equal(rows.get("광진구")?.o3, 0.041)
  assert.equal(rows.get("중구")?.pm25, null)
})

test("parseAirRows: 이름 없는 행·중복 행·비배열 방어", () => {
  assert.equal(parseAirRows(null).size, 0)
  const rows = parseAirRows([
    { stationName: "연동", pm25Value: "10" },
    { stationName: "연동", pm25Value: "99" }, // 중복은 첫 행 우선
    { stationName: "" },
  ])
  assert.equal(rows.size, 1)
  assert.equal(rows.get("연동")?.pm25, 10)
})

test("airGrade: 환경부 4단계 경계 — PM2.5·PM10 중 나쁜 쪽", () => {
  assert.equal(airGrade(15, 30), 1)
  assert.equal(airGrade(16, 30), 2)
  assert.equal(airGrade(35, 81), 3) // PM10이 나쁨으로 끌어올림
  assert.equal(airGrade(76, 10), 4)
  assert.equal(airGrade(null, 151), 4)
  assert.equal(airGrade(null, null), 0)
})

test("resolveStation: 후보 우선순위 + 전 항목 결측 행은 건너뛴다", () => {
  const rows = parseAirRows([
    { stationName: "좌동", pm25Value: "-", pm10Value: "-" },
    { stationName: "우동", pm25Value: "20", pm10Value: "40" },
  ])
  const hit = resolveStation(rows, ["좌동", "우동", "해운대"])
  assert.equal(hit?.station, "우동") // 좌동은 전 항목 "-"라 통과
  assert.equal(resolveStation(rows, ["없는측정소"]), null)
})
