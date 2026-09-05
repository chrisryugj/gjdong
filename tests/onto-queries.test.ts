import { test } from "node:test"
import assert from "node:assert"
import graphJson from "../data/dumping/graph.json" with { type: "json" }
import type { OntoGraph } from "../lib/dumping/types"
import {
  cqEvidenceWithoutLineage,
  cqLeversByVerdict,
  cqLeversWithoutBasis,
  cqPreregistrationCoverage,
  cqProvenanceGaps,
  cqRetractedCitations,
  cqUnsupportedClaims,
  cqUntargetedFactors,
  lineageOf,
  OUTCOME,
  OUTCOME_CELL,
  runCompetencyQuestions,
} from "../lib/dumping/queries"

const graph = graphJson as unknown as OntoGraph
const ids = (r: { hits: { id: string }[] }) => r.hits.map((h) => h.id).sort()

test("CQ1 대책 없는 요인 — 상권 밀집만 실제 공백, 도로 형태·생활인구 노출은 통제변수", () => {
  const r = cqUntargetedFactors(graph)
  assert.deepStrictEqual(ids(r), ["con-alley", "con-arterial-dist", "con-commercial", "con-living-pop"])
  assert.strictEqual(r.gaps, 1)
  assert.match(r.hits.find((h) => h.id === "con-living-pop")!.note!, /노출/)
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

test("CQ4 개입 판정 분포 — 11건(의류수거함 검토 포함) 전부 판정 엣지 보유", () => {
  const r = cqLeversByVerdict(graph)
  assert.strictEqual(r.hits.length, 11)
  assert.strictEqual(r.gaps, 0)
  assert.strictEqual(r.hits.filter((h) => h.note === "제안").length, 6)
})

test("CQ5 실행 근거 없는 개입 4건", () => {
  assert.deepStrictEqual(ids(cqLeversWithoutBasis(graph)), ["lev-bin", "lev-cctv-fixed", "lev-cctv-relocate", "lev-recycling"])
})

test("CQ6 계보 끊긴 증거 — 0건 (결정 레이어·서울 레이어 전부 데이터셋에 닿는다)", () => {
  assert.deepStrictEqual(ids(cqEvidenceWithoutLineage(graph)), [])
})

test("CQ7 사전등록 연결 — 제안 6건 전부 restricts로 연결 (내보내기가 정책 문구와 그래프를 맞춤)", () => {
  const r = cqPreregistrationCoverage(graph)
  assert.strictEqual(r.hits.length, 6)
  assert.strictEqual(r.gaps, 0)
})

test("CQ8 PROV 공백 — 기존 59노드도 내보내기 주석 레이어가 출처·시점·스크립트를 붙여 0건", () => {
  const r = cqProvenanceGaps(graph)
  assert.deepStrictEqual(ids(r), [])
  assert.strictEqual(r.gaps, 0)
  const ev = graph.nodes.find((n) => n.id === "ev-fines")!
  assert.ok(ev.props.source && ev.props.asof && ev.props.derived_by)
})

test("결함 1·2 해소 — 격자 β는 kpi-dump-count-cell로, ρ·개입은 kpi-dump-rate로, 주장→지표 규칙은 governs", () => {
  const betaTargets = new Set(graph.edges.filter((e) => e.props?.beta !== undefined).map((e) => e.t))
  assert.deepStrictEqual([...betaTargets], [OUTCOME_CELL])
  const rhoTargets = new Set(graph.edges.filter((e) => e.props?.rho !== undefined && e.props?.level === "행정동").map((e) => e.t))
  assert.deepStrictEqual([...rhoTargets], [OUTCOME])
  assert.ok(graph.edges.some((e) => e.f === OUTCOME_CELL && e.rel === "operationalizes" && e.t === OUTCOME))
  assert.ok(graph.edges.some((e) => e.f === "claim-two-phenomena" && e.rel === "governs"))
  assert.ok(!graph.edges.some((e) => e.rel === "constrains" && e.f.startsWith("claim-")))
})

test("runCompetencyQuestions는 8문항, id 중복 없음", () => {
  const rs = runCompetencyQuestions(graph)
  assert.strictEqual(rs.length, 8)
  assert.strictEqual(new Set(rs.map((r) => r.id)).size, 8)
})

test("lineageOf — 주장에서 증거·데이터셋·기관까지 거슬러 올라간다", () => {
  const l = lineageOf(graph, "claim-bias")
  assert.ok(l.evidence.includes("ev-channel") && l.evidence.includes("ev-fines") && l.evidence.includes("ev-fines-route"))
  assert.ok(l.datasets.includes("ds-complaints") && l.datasets.includes("ds-fines"))
  assert.ok(l.owners.includes("org-gwangjin"))
})
