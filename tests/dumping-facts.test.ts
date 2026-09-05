import { test } from "node:test"
import assert from "node:assert"
import mapJson from "../data/dumping/map.json" with { type: "json" }
import graphJson from "../data/dumping/graph.json" with { type: "json" }
import type { DumpingMapData, OntoGraph } from "../lib/dumping/types"
import { channelGrowth, finesDirection, fmtRatio, periodOf, partialYearSuffix, regressionBetas } from "../lib/dumping/facts"
import { buildFindings } from "../components/dumping/findings-data"
import { applyErrata, EDGE_ERRATA } from "../lib/dumping/errata"

const map = mapJson as unknown as DumpingMapData
const graph = graphJson as unknown as OntoGraph

test("channelGrowth — 실데이터: 마지막 해가 부분 연도면 연환산하고 기준을 문장으로 돌려준다", () => {
  const g = channelGrowth(map)
  assert.strictEqual(g.baseYear, "2024")
  assert.strictEqual(g.lastYear, "2026")
  assert.strictEqual(g.annualized, true)
  assert.match(g.basis, /연환산/)
  // README 정본 2.10 / 2.97 / 1.10(반올림 1.11) — 과태료는 오히려 감소(0.53)
  assert.strictEqual(g.total, 2.1)
  assert.strictEqual(g.app, 2.97)
  assert.ok(Math.abs(g.fixed - 1.11) < 0.011, `fixed=${g.fixed}`)
  assert.ok(g.fines < 0.6, `fines=${g.fines} — "과태료 1.1배"는 데이터와 맞지 않는다`)
  assert.strictEqual(finesDirection(g), "줄었")
})

test("channelGrowth — 완결 연도끼리면 연환산하지 않는다", () => {
  const synthetic = {
    ...map,
    yearly: {
      ...map.yearly,
      complaints: { "2024": 100, "2025": 150 },
      enforcement: { "2024": 50, "2025": 55 },
      complaintsMonthly: Object.fromEntries(
        [..."2024 2025".split(" ")].flatMap((y) => Array.from({ length: 12 }, (_, i) => [`${y}-${String(i + 1).padStart(2, "0")}`, 10])),
      ),
    },
    decision: { ...map.decision, channels: { ...map.decision.channels, yearly: { app: { "2024": 50, "2025": 100 }, c120: { "2024": 20, "2025": 20 }, direct: { "2024": 30, "2025": 30 } } } },
  } as DumpingMapData
  const g = channelGrowth(synthetic)
  assert.strictEqual(g.annualized, false)
  assert.strictEqual(g.total, 1.5)
  assert.strictEqual(g.app, 2)
  assert.strictEqual(g.fixed, 1)
  assert.strictEqual(g.fines, 1.1)
  assert.strictEqual(finesDirection(g), "비슷했")
  assert.strictEqual(fmtRatio(g.total), "1.50배")
})

test("periodOf·partialYearSuffix — 마지막 달이 12월 미만일 때만 꼬리표", () => {
  const p = periodOf(map.yearly.complaintsMonthly)
  assert.strictEqual(p.from, "2024-01")
  assert.strictEqual(p.lastMonth, 8)
  assert.strictEqual(partialYearSuffix(p, "2026"), " (1~8월)")
  assert.strictEqual(partialYearSuffix(p, "2025"), "")
})

test("regressionBetas — 철회된 DID 계수는 빠지고 |β| 내림차순", () => {
  const b = regressionBetas(graph)
  assert.ok(!b.some((x) => x.id === "cov-did-cctv"))
  assert.strictEqual(b[0].id, "cov-unmanaged")
  for (let i = 1; i < b.length; i++) assert.ok(Math.abs(b[i - 1].beta) >= Math.abs(b[i].beta))
})

test("buildFindings — 10장, 배율은 연환산 기준을 밝히고 과태료는 감소로 서술한다", () => {
  const fs = buildFindings(map, graph)
  assert.strictEqual(fs.length, 10)
  const all = JSON.stringify(fs)
  assert.ok(!/과태료[^.]{0,20}1\.1배/.test(all), "'과태료 1.1배' 오류 문구가 남아 있다")
  assert.ok(all.includes("연환산"), "연환산 기준 미고지")
  assert.ok(all.includes("0.53배"), "과태료 배율(0.53배)이 문장에 없다")
  assert.ok(!all.includes("인구·상권·도로 형태를 통제"), "회귀식에 없는 인구 통제를 주장한다")
  assert.ok(all.includes("대리변수"))
  // 카드 제목은 대시보드가 활성 발견을 title로 식별한다 — 중복 금지
  assert.strictEqual(new Set(fs.map((f) => f.title)).size, fs.length)
})

test("applyErrata — 낡은 엣지 note를 정정하고 erratum id를 남긴다 (ERR-001)", () => {
  const fixed = applyErrata(graph)
  const e = fixed.edges.find((x) => x.f === "ev-fines" && x.rel === "supports" && x.t === "claim-bias")
  assert.ok(e?.props?.erratum === "ERR-001")
  assert.ok(!String(e?.props?.note).includes("1.1배"))
  // 다른 엣지·노드는 손대지 않는다
  assert.strictEqual(fixed.nodes, graph.nodes)
  assert.strictEqual(fixed.edges.filter((x) => x.props?.erratum).length, EDGE_ERRATA.length)
})
