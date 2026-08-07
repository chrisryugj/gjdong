import assert from "node:assert/strict"
import test from "node:test"
import { buildReportModel } from "../lib/crowd/export"
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

const detail = (name: string, people: number, range: string): CrowdDetail => ({
  name,
  level: "붐빔",
  levelNum: 4,
  color: "#ff3939",
  message: [],
  ...emptyDetailFields(),
  series: [{ time: "현재", people, range, yesterday: null, level: "붐빔", color: "#ff3939", kind: "now" }],
  nowIndex: 0,
  weather: [],
  cctv: [],
  updatedAt: "",
})

test("buildReportModel: watch 지정 시 해당 지점만·등급 내림차순·분포 집계", () => {
  const spots = [
    spot({}),
    spot({ name: "명동 관광특구", level: "붐빔", levelNum: 4, color: "#ff3939" }),
    spot({ name: "홍대 관광특구", level: "보통", levelNum: 2, color: "#ffc832" }),
  ]
  const m = buildReportModel({
    city: "seoul",
    cityName: "서울",
    spots,
    watch: ["어린이대공원", "명동 관광특구"],
    details: new Map(),
    extras: new Map(),
    disaster: [],
    at: new Date(2026, 7, 7, 15, 30),
  })
  assert.equal(m.scope, "watch")
  assert.equal(m.totalCount, 2)
  assert.equal(m.stamp, "2026.08.07 15:30")
  // 붐빔이 먼저 (홍대는 watch 밖이라 제외)
  assert.deepEqual(m.rows.map((r) => r.name), ["명동 관광특구", "어린이대공원"])
  assert.deepEqual(
    m.summary.map((s) => `${s.level}:${s.count}`),
    ["붐빔:1", "여유:1"],
  )
  // 자치구 정적 매핑이 행에 실린다
  assert.equal(m.rows[1].district, "광진구")
})

test("buildReportModel: watch 비면 전 지점(scope=all)", () => {
  const spots = [spot({}), spot({ name: "명동 관광특구", level: "붐빔", levelNum: 4 })]
  const m = buildReportModel({
    city: "seoul",
    cityName: "서울",
    spots,
    watch: [],
    details: new Map(),
    extras: new Map(),
    disaster: [],
    at: new Date(2026, 7, 7, 9, 0),
  })
  assert.equal(m.scope, "all")
  assert.equal(m.totalCount, 2)
  assert.equal(m.rows[0].name, "명동 관광특구")
})

test("buildReportModel: 인원은 range 우선, 없으면 people 포맷", () => {
  const spots = [spot({ name: "명동 관광특구", level: "붐빔", levelNum: 4 })]
  const withRange = buildReportModel({
    city: "seoul",
    cityName: "서울",
    spots,
    watch: ["명동 관광특구"],
    details: new Map([["명동 관광특구", detail("명동 관광특구", 38000, "36,000~40,000명")]]),
    extras: new Map(),
    disaster: [],
    at: new Date(2026, 7, 7, 9, 0),
  })
  assert.equal(withRange.rows[0].people, "36,000~40,000명")
  const noRange = buildReportModel({
    city: "seoul",
    cityName: "서울",
    spots,
    watch: ["명동 관광특구"],
    details: new Map([["명동 관광특구", detail("명동 관광특구", 38000, "")]]),
    extras: new Map(),
    disaster: [],
    at: new Date(2026, 7, 7, 9, 0),
  })
  assert.equal(noRange.rows[0].people, "약 38,000명")
})

test("buildReportModel: 특이사항은 종류 중복 제거 + 건수", () => {
  const spots = [spot({ name: "명동 관광특구", level: "붐빔", levelNum: 4 })]
  const m = buildReportModel({
    city: "seoul",
    cityName: "서울",
    spots,
    watch: ["명동 관광특구"],
    details: new Map(),
    extras: new Map([
      [
        "명동 관광특구",
        {
          alerts: [
            { type: "집회", detail: "", info: "행진", occurredAt: "", expectedClearAt: "" },
            { type: "집회", detail: "", info: "농성", occurredAt: "", expectedClearAt: "" },
            { type: "공사", detail: "", info: "차로 통제", occurredAt: "", expectedClearAt: "" },
          ],
          parking: null,
          events: [],
          road: null,
          bike: null,
          updatedAt: "",
        },
      ],
    ]),
    disaster: [],
    at: new Date(2026, 7, 7, 9, 0),
  })
  assert.equal(m.rows[0].notes, "집회·공사 3건")
})

test("buildReportModel: 상세·extra 없는 도시(부산 levelOnly)는 빈 칸으로 성립", () => {
  const m = buildReportModel({
    city: "busan",
    cityName: "부산",
    spots: [spot({ name: "해운대해수욕장", level: "보통", levelNum: 2, basis: "access" })],
    watch: [],
    details: new Map(),
    extras: new Map(),
    disaster: [],
    at: new Date(2026, 7, 7, 9, 0),
  })
  assert.equal(m.rows[0].people, "")
  assert.equal(m.rows[0].notes, "")
  assert.equal(m.rows[0].basis, "주차·도로")
})
