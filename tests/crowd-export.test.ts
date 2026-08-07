import assert from "node:assert/strict"
import test from "node:test"
import { buildCsv, buildReport, csvFilename } from "../lib/crowd/export"
import type { CrowdDetail, CrowdSpot } from "../lib/crowd/seoul-rtd"
import { emptyDetailFields } from "../lib/crowd/adapter-kit"

const spot = (over: Partial<CrowdSpot>): CrowdSpot => ({
  name: "어린이대공원",
  category: "공원",
  lat: 37.548,
  lng: 127.081,
  level: "여유",
  levelNum: 1,
  color: "#00d369",
  ...over,
})

test("buildCsv: BOM 선두·CRLF·헤더·자치구 컬럼", () => {
  const csv = buildCsv({
    city: "seoul",
    spots: [spot({}), spot({ name: "명동 관광특구", category: "관광특구", level: "붐빔", levelNum: 4 })],
    updatedAt: "2026-08-07T05:00:00.000Z",
  })
  assert.ok(csv.startsWith("﻿"), "BOM 누락 — Excel에서 한글이 깨진다")
  const lines = csv.slice(1).split("\r\n")
  assert.equal(lines[0], "순번,지점,자치구,카테고리,등급,등급숫자,산출근거,위도,경도,기준시각")
  assert.ok(lines[1].includes("어린이대공원,광진구,공원,여유,1,인파"))
  assert.ok(lines[2].includes("명동 관광특구"))
})

test("buildCsv: 쉼표·따옴표 포함 값은 인용 이스케이프", () => {
  const csv = buildCsv({
    city: "seoul",
    spots: [spot({ name: '이상한,지점"이름' })],
    updatedAt: null,
  })
  assert.ok(csv.includes('"이상한,지점""이름"'))
})

test("buildCsv: basis별 산출근거 라벨 (부산 access → 주차·도로)", () => {
  const csv = buildCsv({
    city: "busan",
    spots: [spot({ name: "해운대해수욕장", basis: "access" }), spot({ name: "속초해변", basis: "none" })],
    updatedAt: null,
  })
  assert.ok(csv.includes("주차·도로"))
  assert.ok(csv.includes("정보 없음"))
})

test("csvFilename: 도시·일시 스탬프", () => {
  assert.equal(csvFilename("seoul", new Date(2026, 7, 7, 14, 5)), "crowd-seoul-20260807-1405.csv")
})

test("buildReport: 등급 분포 총괄·붐빔 우선·인원·특이사항·재난문자", () => {
  const detail: CrowdDetail = {
    name: "명동 관광특구",
    level: "붐빔",
    levelNum: 4,
    color: "#ff3939",
    message: [],
    ...emptyDetailFields(),
    series: [{ time: "현재", people: 38000, range: "", yesterday: null, level: "붐빔", color: "#ff3939", kind: "now" }],
    nowIndex: 0,
    weather: [],
    cctv: [],
    updatedAt: "",
  }
  const report = buildReport({
    cityName: "서울",
    watchSpots: [spot({}), spot({ name: "명동 관광특구", level: "붐빔", levelNum: 4 })],
    details: new Map([["명동 관광특구", detail]]),
    extras: new Map([
      [
        "명동 관광특구",
        {
          alerts: [{ type: "집회", detail: "", info: "행진", occurredAt: "", expectedClearAt: "" }],
          parking: null,
          events: [],
          road: null,
          bike: null,
          updatedAt: "",
        },
      ],
    ]),
    disaster: [{ type: "폭염", step: "안전안내", content: "폭염이 지속되고 있습니다.", at: "" }],
    at: new Date(2026, 7, 7, 14, 30),
  })
  const lines = report.split("\n")
  assert.equal(lines[0], "[서울 인파 상황보고] 2026.08.07 14:30")
  assert.equal(lines[1], "감시 2곳 — 붐빔 1 · 여유 1")
  assert.ok(lines[3].startsWith("· 명동 관광특구 — 붐빔 (약 38,000명) — 특이: 집회 1건"), lines[3])
  assert.ok(report.includes("※ 오늘 재난문자"))
  assert.ok(report.includes("[폭염 안전안내]"))
})

test("buildReport: 인원 원천 없는 도시(부산)는 등급만", () => {
  const report = buildReport({
    cityName: "부산",
    watchSpots: [spot({ name: "해운대해수욕장", level: "보통", levelNum: 2, basis: "access" })],
    details: new Map(),
    extras: new Map(),
    disaster: [],
    at: new Date(2026, 7, 7, 9, 0),
  })
  assert.ok(report.includes("· 해운대해수욕장 — 보통\n") || report.endsWith("· 해운대해수욕장 — 보통") || report.includes("· 해운대해수욕장 — 보통\n\n"), report)
  assert.ok(!report.includes("약 "))
})
