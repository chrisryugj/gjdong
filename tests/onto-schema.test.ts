import { test } from "node:test"
import assert from "node:assert"
import graphJson from "../data/dumping/graph.json" with { type: "json" }
import type { OntoGraph } from "../lib/dumping/types"
import { CLASSES, RELATIONS, observedSignatures, validateGraph } from "../lib/dumping/schema"
import { REL_KO, TYPE_KO } from "../lib/dumping/labels"

const graph = graphJson as unknown as OntoGraph

test("현재 graph.json은 스키마 오류 0 · 주의 0 (cls-cell 고아는 격자 민감도 증거가 서술해 해소)", () => {
  const issues = validateGraph(graph)
  assert.deepStrictEqual(issues, [], JSON.stringify(issues, null, 1))
})

test("스키마의 모든 클래스·관계에 한글 표시명이 있다 (labels.ts가 정본)", () => {
  for (const c of CLASSES) assert.ok(TYPE_KO[c.type], `TYPE_KO[${c.type}] 없음`)
  for (const r of RELATIONS) assert.ok(REL_KO[r.rel], `REL_KO[${r.rel}] 없음`)
})

test("그래프에서 관측된 (출발→도착) 조합은 전부 스키마 도메인×레인지 안에 있다", () => {
  const obs = observedSignatures(graph)
  for (const [rel, sigs] of Object.entries(obs)) {
    const def = RELATIONS.find((r) => r.rel === rel)
    assert.ok(def, `관계 ${rel} 미정의`)
    for (const sig of sigs) {
      const [f, t] = sig.split("→")
      assert.ok(def!.domain.includes(f) && def!.range.includes(t), `${rel}: ${sig} 위반`)
    }
  }
})

test("도메인·레인지·철회·판정 규약 위반을 잡는다", () => {
  const bad: OntoGraph = {
    nodes: [
      { id: "a", type: "Lever", space: "lever", label: "a", props: {} },
      { id: "b", type: "Dataset", space: "resource", label: "b", props: {} },
      { id: "c", type: "Evidence", space: "evidence", label: "c", props: { retracted: "x", confidence: 0.9 } },
      { id: "d", type: "Claim", space: "claim", label: "d", props: {} },
      { id: "k", type: "KPI", space: "outcome", label: "k", props: {} },
      { id: "z", type: "Zzz", space: "claim", label: "z", props: {} },
    ],
    edges: [
      { f: "a", rel: "lowers", t: "b" }, // range 위반 + status 없음
      { f: "a", rel: "lowers", t: "k", props: { status: "제안" } }, // 정상
      { f: "c", rel: "supports", t: "d" },
      { f: "a", rel: "nope", t: "k" },
      { f: "a", rel: "affects", t: "ghost" },
    ],
  }
  const codes = validateGraph(bad).map((i) => i.code)
  for (const c of ["RANGE_VIOLATION", "VERDICT_MISSING_STATUS", "RETRACTED_CONFIDENCE", "UNKNOWN_REL", "DANGLING_EDGE", "UNKNOWN_TYPE", "ORPHAN_NODE"]) {
    assert.ok(codes.includes(c as never), `${c} 미검출: ${codes.join(",")}`)
  }
  assert.ok(!codes.includes("CLAIM_UNSUPPORTED"), "supports가 있는 주장은 통과해야 한다")
})
