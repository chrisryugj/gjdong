import { test } from "node:test"
import assert from "node:assert"
import graphJson from "../data/snow/graph.json" with { type: "json" }
import type { OntoGraph } from "../lib/snow/types"
import { lineageOf, runCompetencyQuestions } from "../lib/snow/queries"

const graph = graphJson as unknown as OntoGraph
const cq = runCompetencyQuestions(graph)
const get = (id: string) => {
  const r = cq.find((c) => c.id === id)
  assert.ok(r, id)
  return r
}

test("취약구간 56곳(적설취약 47 + 상습결빙 9) 중 60m 안 열선 없는 곳 19, 자원 공백 7(이면도로 1 + 간선·자동차전용도로 결빙구간 6). 도로망 타일 봉합 뒤 수치", () => {
  const r = get("cq-seg-gap")
  assert.strictEqual(r.badge, "19/56")
  assert.strictEqual(r.items.length, 19)
  const gaps = r.items.filter((i) => i.note?.includes("자원 공백")).map((i) => i.label)
  assert.strictEqual(gaps.length, 7)
  assert.ok(gaps.includes("능동로 120"))
  assert.strictEqual(gaps.filter((l) => /상습결빙구간/.test(l)).length, 6)
  assert.ok(r.core)
})

test("열선 없는 동 4곳: 중곡1동·자양3동·자양4동·군자동 (서울시 2026-05 집계 55구간 기준)", () => {
  assert.deepStrictEqual(
    get("cq-heat-gap").items.map((i) => i.label),
    ["중곡1동", "자양3동", "자양4동", "군자동"],
  )
})

test("자원 4종이 모두 없는 동은 없다", () => {
  assert.strictEqual(get("cq-uncovered").items.length, 0)
})

test("대상 자원 없는 취약요인 0(적설량 예보는 기준의 입력이라 필터에서 제외)", () => {
  assert.deepStrictEqual(get("cq-untargeted").items, [])
})

test("근거 미연결 자원: 민관협력 1종(열선·제설함·자재·살포기·인력·장비는 제설대책기간 운영 계획이 근거)", () => {
  assert.deepStrictEqual(get("cq-basis").items.map((i) => i.id), ["lev-civic"])
})

test("측정 자료 없는 지표 2: 조례 시한 준수·제설 민원. 결빙 교통사고는 도로교통공단 다발지역 0곳으로 측정됨", () => {
  assert.deepStrictEqual(get("cq-kpi-unmeasured").items.map((i) => i.id), ["kpi-deadline", "kpi-complaint"])
  const ice = graph.nodes.find((n) => n.id === "kpi-ice-incident")
  assert.ok(String(ice?.props.measurable).startsWith("다발지역 0곳"))
})

test("기본 노출 질문은 6개(취약구간 공백·열선 없는 동·근거 미연결·측정 불가 지표·보도자료만·기준일 격차)", () => {
  assert.deepStrictEqual(
    cq.filter((c) => c.core).map((c) => c.id),
    ["cq-seg-gap", "cq-heat-gap", "cq-basis", "cq-kpi-unmeasured", "cq-press-only", "cq-stale"],
  )
})

test("단계 동원 자원은 2·6·8·9종으로 누적이고 누락 없음", () => {
  const items = get("cq-stage").items
  assert.deepStrictEqual(
    items.map((i) => i.label),
    ["보강 단계 · 2종", "1단계 · 6종", "2단계 · 8종", "3단계 · 9종"],
  )
  assert.ok(items.every((i) => !i.note?.includes("누락")))
  assert.strictEqual(get("cq-stage").badge, "누락 0")
})

test("계보 끊긴 관측 0 · 보도자료만으로 서술되는 항목은 살포기·장비·인력·평가 4", () => {
  assert.strictEqual(get("cq-lineage").items.length, 0)
  assert.deepStrictEqual(get("cq-press-only").items.map((i) => i.id).sort(), ["kpi-eval", "lev-fleet", "lev-sprayer", "lev-staff"])
})

test("기준일 격차: 가장 오래된 것이 모래주머니(2022-01-19)", () => {
  const items = get("cq-stale").items
  assert.strictEqual(items[0].id, "ds-sand")
  assert.strictEqual(items[0].note, "2022-01-19")
})

test("판단의 계보는 관측 › 데이터셋 › 부서·기관까지 오른다", () => {
  const ids = lineageOf(graph, "claim-heat-gap").map((x) => x.node.id)
  assert.ok(ids.includes("ev-heat-none"))
  assert.ok(ids.includes("ds-heat"))
  assert.ok(ids.includes("org-seoul"))
  const gap = lineageOf(graph, "claim-weak-gap").map((x) => x.node.id)
  assert.ok(gap.includes("ev-weak-heat"))
  assert.ok(gap.includes("ds-weak"))
  assert.ok(gap.includes("org-mois"))
})
