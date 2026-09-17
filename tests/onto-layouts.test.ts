import { test } from "node:test"
import assert from "node:assert"
import graphJson from "../data/dumping/graph.json" with { type: "json" }
import type { OntoGraph } from "../lib/dumping/types"
import { CLUSTER_RING, clusterRadius, HUB, LAYER_GAP, LAYOUTS, layoutFor, RADIAL_STEP, SPACE_ORDER } from "../components/dumping/onto-layouts"

// 14라운드: 근거 그래프 배치 4종. 모든 노드에 좌표가 있고, 각 배치가 약속한 기하(열·군집·동심원)를 지킨다
const graph = graphJson as unknown as OntoGraph
const dist = (a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z)

test("배치 4종 모두 노드 전부에 좌표를 준다", () => {
  for (const l of LAYOUTS) {
    const pos = layoutFor(l.id, graph, null)
    assert.strictEqual(pos.size, graph.nodes.length, l.id)
    for (const p of pos.values()) assert.ok(Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z), l.id)
  }
})

test("구면: 허브가 원점, 나머지는 원점에서 떨어져 있다", () => {
  const pos = layoutFor("sphere", graph, null)
  assert.deepStrictEqual(pos.get(HUB), { x: 0, y: 0, z: 0 })
  assert.ok([...pos.entries()].filter(([id]) => id !== HUB).every(([, p]) => dist(p, { x: 0, y: 0, z: 0 }) > 40))
})

test("층별 흐름: 종류 순서대로 왼쪽→오른쪽 열, 평면(z=0), 같은 열 안 노드는 y가 서로 다르다", () => {
  const pos = layoutFor("layers", graph, null)
  const xOf = (space: string) => graph.nodes.filter((n) => n.space === space).map((n) => pos.get(n.id)!.x)
  for (let i = 1; i < SPACE_ORDER.length; i++) {
    const prev = xOf(SPACE_ORDER[i - 1])
    const cur = xOf(SPACE_ORDER[i])
    if (!prev.length || !cur.length) continue
    assert.ok(Math.max(...prev) < Math.min(...cur), `${SPACE_ORDER[i - 1]} < ${SPACE_ORDER[i]}`)
    assert.ok(Math.abs(Math.min(...cur) - Math.max(...prev) - LAYER_GAP) < 1e-6)
  }
  for (const p of pos.values()) assert.strictEqual(p.z, 0)
  for (const space of SPACE_ORDER) {
    const ys = graph.nodes.filter((n) => n.space === space).map((n) => pos.get(n.id)!.y)
    assert.strictEqual(new Set(ys).size, ys.length, space)
  }
})

test("분류별 군집: 같은 종류는 한 덩어리(군집 반지름 안), 다른 종류 중심은 큰 원 위에서 떨어져 있다", () => {
  const pos = layoutFor("clusters", graph, null)
  for (const space of SPACE_ORDER) {
    const nodes = graph.nodes.filter((n) => n.space === space)
    if (!nodes.length) continue
    const ps = nodes.map((n) => pos.get(n.id)!)
    const c = { x: ps.reduce((a, p) => a + p.x, 0) / ps.length, y: ps.reduce((a, p) => a + p.y, 0) / ps.length, z: ps.reduce((a, p) => a + p.z, 0) / ps.length }
    // 구면 위 점들이라 서로 간 거리는 지름(2R) 이하
    for (const a of ps) for (const b of ps) assert.ok(dist(a, b) <= 2 * clusterRadius(nodes.length) + 1, `${space} 군집 밖`)
    assert.ok(Math.hypot(c.x, c.z) > CLUSTER_RING * 0.8, `${space} 중심이 큰 원에서 벗어남`)
  }
})

test("선택 중심: 고른 노드가 원점, 직접 이웃은 첫 고리, 평면. 고른 것이 없으면 허브 중심", () => {
  const center = "con-unmanaged"
  const pos = layoutFor("radial", graph, center)
  assert.deepStrictEqual(pos.get(center), { x: 0, y: 0, z: 0 })
  const neighbors = new Set(graph.edges.flatMap((e) => (e.f === center ? [e.t] : e.t === center ? [e.f] : [])))
  assert.ok(neighbors.size >= 5)
  // 직접 이웃은 모두 같은 반지름(첫 고리)이고 그 반지름은 기본 간격 이상
  const radii = [...neighbors].map((id) => Math.hypot(pos.get(id)!.x, pos.get(id)!.y))
  assert.ok(radii.every((r) => Math.abs(r - radii[0]) < 1e-6 && r >= RADIAL_STEP - 1e-6), JSON.stringify(radii))
  for (const p of pos.values()) assert.strictEqual(p.z, 0)
  assert.deepStrictEqual(layoutFor("radial", graph, null).get(HUB), { x: 0, y: 0, z: 0 })
  assert.deepStrictEqual(layoutFor("radial", graph, "없는-노드").get(HUB), { x: 0, y: 0, z: 0 })
})
