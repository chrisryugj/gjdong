import { test } from "node:test"
import assert from "node:assert"
import graphJson from "../data/snow/graph.json" with { type: "json" }
import type { OntoGraph } from "../lib/snow/types"
import { CLASSES, RELATIONS, SPACES, observedSignatures, validateGraph } from "../lib/snow/schema"
import { REL_KO, TYPE_KO } from "../lib/snow/labels"

const graph = graphJson as unknown as OntoGraph

test("현재 graph.json은 스키마 오류 0 · 주의 0", () => {
  const issues = validateGraph(graph)
  assert.deepStrictEqual(issues, [], JSON.stringify(issues, null, 1))
})

test("그래프에 쓰인 클래스·관계는 전부 스키마와 한글 라벨을 갖는다", () => {
  const types = new Set(graph.nodes.map((n) => n.type))
  for (const t of types) {
    assert.ok(CLASSES.some((c) => c.type === t), `클래스 정의 없음: ${t}`)
    assert.ok(TYPE_KO[t], `한글 라벨 없음: ${t}`)
  }
  const rels = new Set(graph.edges.map((e) => e.rel))
  for (const r of rels) {
    assert.ok(RELATIONS.some((d) => d.rel === r), `관계 정의 없음: ${r}`)
    assert.ok(REL_KO[r], `한글 라벨 없음: ${r}`)
  }
  for (const s of new Set(graph.nodes.map((n) => n.space))) assert.ok((SPACES as readonly string[]).includes(s), `space 없음: ${s}`)
})

test("검증기는 도메인·레인지·미지원 판단·status 없는 lowers를 잡는다", () => {
  const bad: OntoGraph = {
    nodes: [
      { id: "a", type: "Area", space: "area", label: "a", props: {} },
      { id: "l", type: "Lever", space: "lever", label: "l", props: {} },
      { id: "c", type: "Claim", space: "claim", label: "c", props: {} },
      { id: "k", type: "KPI", space: "outcome", label: "k", props: {} },
    ],
    edges: [
      { f: "a", rel: "covers", t: "l" }, // 도메인·레인지 둘 다 위반
      { f: "l", rel: "lowers", t: "k" }, // status 없음
      { f: "c", rel: "governs", t: "k" },
    ],
  }
  const codes = validateGraph(bad).map((i) => i.code)
  assert.ok(codes.includes("DOMAIN"))
  assert.ok(codes.includes("RANGE"))
  assert.ok(codes.includes("STATUS_MISSING"))
  assert.ok(codes.includes("CLAIM_UNSUPPORTED"))
})

test("행정동 15개 · 대응 단계 4개 · 자원 9종 · 데이터셋 6벌", () => {
  const count = (t: string) => graph.nodes.filter((n) => n.type === t).length
  assert.strictEqual(count("Area"), 15)
  assert.strictEqual(count("Stage"), 4)
  assert.strictEqual(count("Lever"), 9)
  assert.strictEqual(count("Dataset"), 6)
  assert.ok(observedSignatures(graph).includes("Stage -mobilizes-> Lever"))
  assert.ok(observedSignatures(graph).includes("Policy -delegates-> Policy"))
})
