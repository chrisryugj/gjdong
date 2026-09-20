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

test("열선 없는 동 4곳: 중곡1동·자양3동·자양4동·군자동 (2025-01 기준 데이터)", () => {
  assert.deepStrictEqual(
    get("cq-heat-gap").items.map((i) => i.label),
    ["중곡1동", "자양3동", "자양4동", "군자동"],
  )
})

test("자원 4종이 모두 없는 동은 없다", () => {
  assert.strictEqual(get("cq-uncovered").items.length, 0)
})

test("겨냥 자원 없는 취약요인은 적설량 예보 하나(기준의 입력이라 의도한 공백)", () => {
  assert.deepStrictEqual(get("cq-untargeted").items.map((i) => i.id), ["con-snowfall"])
})

test("근거 미연결 자원: 열선·제설함·염화칼슘함·모래주머니·살포기·민관협력 6종 (설치 근거 규정을 아직 안 붙였다)", () => {
  assert.strictEqual(get("cq-basis").items.length, 6)
})

test("잴 수 없는 지표 2: 조례 시한 준수·결빙 사고·민원", () => {
  assert.deepStrictEqual(get("cq-kpi-unmeasured").items.map((i) => i.id), ["kpi-deadline", "kpi-ice-incident"])
})

test("단계 동원 자원은 2·6·8·9종으로 누적이고 누락 없음", () => {
  const items = get("cq-stage").items
  assert.deepStrictEqual(
    items.map((i) => i.label),
    ["보강 단계 · 2종", "1단계 · 6종", "2단계 · 8종", "3단계 · 9종"],
  )
  assert.ok(items.every((i) => !i.note?.includes("누락")))
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

test("판단의 계보는 관측 → 데이터셋 → 부서·기관까지 오른다", () => {
  const ids = lineageOf(graph, "claim-heat-gap").map((x) => x.node.id)
  assert.ok(ids.includes("ev-heat-none"))
  assert.ok(ids.includes("ds-heat"))
  assert.ok(ids.includes("team-road"))
})
