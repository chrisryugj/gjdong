import { test } from "node:test"
import assert from "node:assert"
import { existsSync, readFileSync } from "node:fs"
import graphJson from "../data/dumping/graph.json" with { type: "json" }
import type { DumpingMapData, OntoGraph } from "../lib/dumping/types"
import { channelGrowth, collinearRange, finesCensorNote, finesDirection, fmtRatio, periodOf, partialYearSuffix, regressionBetas, sampleSizes } from "../lib/dumping/facts"
import { buildFindings } from "../components/dumping/findings-data"
import { applyErrata, EDGE_ERRATA } from "../lib/dumping/errata"

// map.json은 공개 레포에 암호문만 있다(scripts/dumping-data.mjs). 평문이 없는 환경(키 없는 CI)은 실데이터 테스트를 건너뛴다
const MAP_PATH = new URL("../data/dumping/map.json", import.meta.url)
const map: DumpingMapData | null = existsSync(MAP_PATH) ? (JSON.parse(readFileSync(MAP_PATH, "utf8")) as DumpingMapData) : null
const graph = graphJson as unknown as OntoGraph
const withMap = { skip: map ? false : "data/dumping/map.json 없음 — `npm run dumping:decrypt`" }

test("channelGrowth — 실데이터: 마지막 해가 부분 연도면 연환산하고 기준을 문장으로 돌려준다", withMap, () => {
  const g = channelGrowth(map!)
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

test("적발 경로 — 과태료 대부분이 신고 유래(순찰 17%)이고, 신고와 독립인 순찰 적발도 절반 이하로 줄었다", withMap, () => {
  const g = channelGrowth(map!)
  assert.strictEqual(g.patrolSharePct, 17)
  assert.ok(g.finesPatrol < 0.6 && g.finesReported < 0.6, `patrol=${g.finesPatrol} reported=${g.finesReported}`)
  assert.match(finesCensorNote(map!), /과소 집계/)
  // 화면 어디에도 "신고 성향과 무관한 실측"류 문장이 남으면 안 된다
  const fs = JSON.stringify(buildFindings(map!, graph))
  assert.ok(!/신고 성향과 무관한 과태료/.test(fs) && !/신고편향 없는/.test(fs), "과태료를 신고와 독립인 실측으로 서술한다")
  assert.ok(fs.includes("순찰"), "순찰 적발 계열 언급 없음")
})

test("collinearRange·sampleSizes — 문장에 박혀 있던 수치를 그래프·데이터에서 읽는다", withMap, () => {
  assert.strictEqual(collinearRange(graph), "0.85~0.97")
  const sz = sampleSizes(map!, graph)
  assert.strictEqual(sz.gridN, 1062)
  assert.strictEqual(sz.ledgerRows, 24520)
  assert.strictEqual(sz.dongN, 15)
  assert.strictEqual(map!.meta?.reproduce.hashes, 110)
  assert.strictEqual(map!.meta?.binSites, 64)
})

test("channelGrowth — 완결 연도끼리면 연환산하지 않는다", withMap, () => {
  const synthetic = {
    ...map!,
    yearly: {
      ...map!.yearly,
      complaints: { "2024": 100, "2025": 150 },
      enforcement: { "2024": 50, "2025": 55 },
      complaintsMonthly: Object.fromEntries(
        [..."2024 2025".split(" ")].flatMap((y) => Array.from({ length: 12 }, (_, i) => [`${y}-${String(i + 1).padStart(2, "0")}`, 10])),
      ),
    },
    decision: { ...map!.decision, channels: { ...map!.decision.channels, yearly: { app: { "2024": 50, "2025": 100 }, c120: { "2024": 20, "2025": 20 }, direct: { "2024": 30, "2025": 30 } } } },
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

test("periodOf·partialYearSuffix — 마지막 달이 12월 미만일 때만 꼬리표", withMap, () => {
  const p = periodOf(map!.yearly.complaintsMonthly)
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

test("buildFindings — 14장(서울 데이터 3장·K-apt 대리변수 검증 포함), 배율은 연환산 기준을 밝히고 과태료는 감소로 서술한다", withMap, () => {
  const fs = buildFindings(map!, graph)
  assert.strictEqual(fs.length, 14)
  assert.ok(fs.some((f) => f.tag === "격자 검증") && fs.some((f) => f.tag === "통념 검증") && fs.some((f) => f.tag === "노출 통제") && fs.some((f) => f.tag === "대리변수 검증"))
  const proxy = fs.find((f) => f.tag === "대리변수 검증")!
  assert.ok(/다가구·단독/.test(proxy.title) && /다세대·연립/.test(proxy.body), "대리변수 검증 카드가 세 갈래 결과를 말하지 않는다")
  const exposure = fs.find((f) => f.tag === "노출 통제")!
  assert.ok(JSON.stringify(exposure).includes("상주인구"), "노출 통제 카드에 상주인구가 없다")
  const all = JSON.stringify(fs)
  assert.ok(!/과태료[^.]{0,20}1\.1배/.test(all), "'과태료 1.1배' 오류 문구가 남아 있다")
  assert.ok(all.includes("연환산"), "연환산 기준 미고지")
  assert.ok(all.includes("0.53배"), "과태료 배율(0.53배)이 문장에 없다")
  assert.ok(!all.includes("인구·상권·도로 형태를 통제"), "회귀식에 없는 인구 통제를 주장한다")
  assert.ok(all.includes("대리변수"))
  // 카드 제목은 대시보드가 활성 발견을 title로 식별한다 — 중복 금지
  assert.strictEqual(new Set(fs.map((f) => f.title)).size, fs.length)
})

test("applyErrata — 정오표가 비어 있으면 그래프를 그대로 돌려주고, 정본이 고쳐진 ERR-001은 데이터에 남아 있지 않다", () => {
  assert.strictEqual(EDGE_ERRATA.length, 0)
  const fixed = applyErrata(graph)
  assert.strictEqual(fixed, graph)
  const e = graph.edges.find((x) => x.f === "ev-fines" && x.rel === "supports" && x.t === "claim-bias")
  assert.ok(!String(e?.props?.note).includes("1.1배"), "정본 export가 다시 낡은 note를 내보냈다")
  assert.match(String(e?.props?.note), /감소/)
})
