import { test } from "node:test"
import assert from "node:assert"
import graphJson from "../data/dumping/graph.json" with { type: "json" }
import type { OntoGraph } from "../lib/dumping/types"
import {
  cqEvidenceWithoutLineage,
  cqLeversByVerdict,
  cqLeversWithoutBasis,
  cqPreregistrationCoverage,
  cqRetractedCitations,
  cqUnsupportedClaims,
  cqUntargetedFactors,
  lineageOf,
  runCompetencyQuestions,
} from "../lib/dumping/queries"

const graph = graphJson as unknown as OntoGraph
const ids = (r: { hits: { id: string }[] }) => r.hits.map((h) => h.id).sort()

test("CQ1 대책 없는 요인 — 상권 밀집만 실제 공백, 도로 형태 둘은 구조 변수", () => {
  const r = cqUntargetedFactors(graph)
  assert.deepStrictEqual(ids(r), ["con-alley", "con-arterial-dist", "con-commercial"])
  assert.strictEqual(r.gaps, 1)
  assert.match(r.hits.find((h) => h.id === "con-commercial")!.note!, /β \+0\.086/)
})

test("CQ2 증거 없는 주장 — 0건", () => {
  const r = cqUnsupportedClaims(graph)
  assert.strictEqual(r.hits.length, 0)
  assert.strictEqual(r.gaps, 0)
})

test("CQ3 철회된 근거의 연결 — 도착이 철회 노드거나 판정이 철회면 공백으로 세지 않는다", () => {
  const r = cqRetractedCitations(graph)
  assert.deepStrictEqual(ids(r), ["lev-cctv-mobile"])
  assert.strictEqual(r.gaps, 0)
})

test("CQ4 개입 판정 분포 — 10건 전부 판정 엣지 보유", () => {
  const r = cqLeversByVerdict(graph)
  assert.strictEqual(r.hits.length, 10)
  assert.strictEqual(r.gaps, 0)
  assert.strictEqual(r.hits.filter((h) => h.note === "제안").length, 6)
})

test("CQ5 실행 근거 없는 개입 4건", () => {
  assert.deepStrictEqual(ids(cqLeversWithoutBasis(graph)), ["lev-bin", "lev-cctv-fixed", "lev-cctv-relocate", "lev-recycling"])
})

test("CQ6 계보 끊긴 증거 — 결정 레이어 2건 (내보내기 시 데이터셋 노드 보강 대상)", () => {
  assert.deepStrictEqual(ids(cqEvidenceWithoutLineage(graph)), ["ev-hotspot-backtest", "ev-permits"])
})

test("CQ7 사전등록 연결 — 제안 6건 중 1건(공동배출)만 restricts로 연결, 5건 공백 (말과 구조의 어긋남)", () => {
  const r = cqPreregistrationCoverage(graph)
  assert.strictEqual(r.hits.length, 6)
  assert.strictEqual(r.gaps, 5)
})

test("runCompetencyQuestions는 7문항, id 중복 없음", () => {
  const rs = runCompetencyQuestions(graph)
  assert.strictEqual(rs.length, 7)
  assert.strictEqual(new Set(rs.map((r) => r.id)).size, 7)
})

test("lineageOf — 주장에서 증거·데이터셋·기관까지 거슬러 올라간다", () => {
  const l = lineageOf(graph, "claim-bias")
  assert.ok(l.evidence.includes("ev-channel") && l.evidence.includes("ev-fines"))
  assert.ok(l.datasets.includes("ds-complaints") && l.datasets.includes("ds-fines"))
  assert.ok(l.owners.includes("org-gwangjin"))
})
