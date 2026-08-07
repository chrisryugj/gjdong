import assert from "node:assert/strict"
import test from "node:test"
import { appendTick, buildLogCsv, logFilename, logSpotNames, sparkSeries, type OpsLogTick } from "../lib/crowd/oplog"

const tick = (at: string, spots: OpsLogTick["spots"]): OpsLogTick => ({ at, spots })

test("appendTick: 같은 updatedAt 중복 스킵·빈 스냅샷 스킵·상한 초과 앞에서 버림", () => {
  let log: OpsLogTick[] = []
  log = appendTick(log, tick("t1", { A: { lv: 1, level: "여유" } }))
  log = appendTick(log, tick("t1", { A: { lv: 4, level: "붐빔" } })) // 같은 틱 — 스킵
  assert.equal(log.length, 1)
  assert.equal(log[0].spots.A.lv, 1)
  log = appendTick(log, tick("t2", {})) // 빈 스냅샷 — 스킵
  assert.equal(log.length, 1)
  log = appendTick(log, tick("t2", { A: { lv: 2, level: "보통" } }), 2)
  log = appendTick(log, tick("t3", { A: { lv: 4, level: "붐빔" } }), 2) // 상한 2 — t1 밀려남
  assert.deepEqual(log.map((x) => x.at), ["t2", "t3"])
})

test("logSpotNames: 처음 등장 순서 유지, 중간 합류는 뒤에", () => {
  const log = [
    tick("t1", { B: { lv: 1, level: "여유" }, A: { lv: 1, level: "여유" } }),
    tick("t2", { A: { lv: 2, level: "보통" }, C: { lv: 4, level: "붐빔" } }),
  ]
  assert.deepEqual(logSpotNames(log), ["B", "A", "C"])
})

test("buildLogCsv: BOM+CRLF·시간축 행·인원 병기·미기록 빈칸", () => {
  const log = [
    tick("2026-08-07T15:00:00+09:00", { 명동: { lv: 4, level: "붐빔", people: 38000 } }),
    tick("2026-08-07T15:05:00+09:00", { 명동: { lv: 2, level: "보통" }, 홍대: { lv: 1, level: "여유" } }),
  ]
  const csv = buildLogCsv(log)
  assert.ok(csv.startsWith("﻿"), "BOM 누락")
  const lines = csv.slice(1).trimEnd().split("\r\n")
  assert.equal(lines[0], "시각,명동,홍대")
  assert.ok(lines[1].endsWith(',"붐빔(38,000명)",'), lines[1]) // 홍대 미기록 = 빈칸
  assert.ok(lines[2].endsWith(",보통,여유"), lines[2])
})

test("sparkSeries: 미기록 틱은 직전 값 유지, 시작 전은 건너뜀", () => {
  const log = [
    tick("t1", { A: { lv: 1, level: "여유" } }),
    tick("t2", { A: { lv: 1, level: "여유" }, B: { lv: 3, level: "약간 붐빔" } }),
    tick("t3", { B: { lv: 4, level: "붐빔" } }), // A 미기록 → 직전 1 유지
  ]
  assert.deepEqual(sparkSeries(log, "A"), [1, 1, 1])
  assert.deepEqual(sparkSeries(log, "B"), [3, 4]) // t1은 시작 전 — 건너뜀
})

test("logFilename: 도시·일시 스탬프", () => {
  assert.equal(logFilename("seoul", new Date(2026, 7, 7, 15, 45)), "crowd-log-seoul-20260807-1545.csv")
})
