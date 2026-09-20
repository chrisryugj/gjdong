import type { OntoGraph } from "@/lib/snow/types"
import { SPACES } from "@/lib/snow/schema"

// /snow 온톨로지 배치 3종. /dumping onto-layouts와 같은 발상이지만 허브가 다르고(결빙 사고·민원 지표) 층 순서에 행정동이 있다
//   sphere  허브에서 연결 거리별 구면 셸. 3D 회전
//   layers  데이터 → 관측 → 판단 → 취약요인 → 목표지표 → 대응자원 → 행정동 → 법령·단계 → 주체 세로 열. 2D
//   radial  고른 항목을 가운데, 연결 거리별 동심원. 2D

export type LayoutId = "sphere" | "layers" | "radial"
export const LAYOUTS: { id: LayoutId; label: string; help: string; flat: boolean }[] = [
  { id: "layers", label: "층별 흐름", help: "데이터, 관측, 판단, 요인, 지표, 자원, 구역, 법령·단계, 주체 순. 근거가 왼쪽에서 오른쪽으로 읽힙니다", flat: true },
  { id: "radial", label: "선택 중심", help: "고른 항목을 가운데 두고 연결 거리만큼 바깥 원에 놓습니다", flat: true },
  { id: "sphere", label: "구면", help: "취약구간 커버리지 지표를 가운데 두고 연결 거리만큼 바깥 구면에 놓습니다", flat: false },
]
export const HUB = "kpi-coverage"
export const SPACE_ORDER = ["resource", "evidence", "claim", "concept", "outcome", "lever", "area", "policy", "subject"] as const satisfies readonly (typeof SPACES)[number][]

export interface P3 {
  x: number
  y: number
  z: number
}
const GOLDEN = Math.PI * (3 - Math.sqrt(5))

function adjacency(graph: OntoGraph): Map<string, string[]> {
  const adj = new Map<string, string[]>()
  for (const n of graph.nodes) adj.set(n.id, [])
  for (const e of graph.edges) {
    adj.get(e.f)?.push(e.t)
    adj.get(e.t)?.push(e.f)
  }
  return adj
}
function bfsDepth(adj: Map<string, string[]>, root: string): Map<string, number> {
  const depth = new Map<string, number>()
  if (!adj.has(root)) return depth
  depth.set(root, 0)
  const q = [root]
  while (q.length) {
    const cur = q.shift()!
    for (const nx of adj.get(cur) ?? []) {
      if (!depth.has(nx)) {
        depth.set(nx, depth.get(cur)! + 1)
        q.push(nx)
      }
    }
  }
  return depth
}
function fibonacciSphere(n: number, r: number, lonOffset: number): P3[] {
  const out: P3[] = []
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 0 : (i / (n - 1)) * 2 - 1
    const lat = Math.asin(t * 0.92)
    const lon = i * GOLDEN + lonOffset
    out.push({ x: r * Math.cos(lat) * Math.cos(lon), y: r * Math.sin(lat), z: r * Math.cos(lat) * Math.sin(lon) })
  }
  return out
}

export function layoutSphere(graph: OntoGraph, hub = HUB): Map<string, P3> {
  const adj = adjacency(graph)
  const depth = bfsDepth(adj, hub)
  const maxDepth = Math.max(1, ...depth.values())
  const shells = new Map<number, string[]>()
  for (const n of graph.nodes) {
    const d = depth.get(n.id) ?? maxDepth + 1
    ;(shells.get(d) ?? shells.set(d, []).get(d)!).push(n.id)
  }
  const pos = new Map<string, P3>()
  for (const [d, ids] of shells) {
    if (d === 0) {
      pos.set(ids[0], { x: 0, y: 0, z: 0 })
      continue
    }
    const r = 110 + (d / (maxDepth + 1)) * 260
    fibonacciSphere(ids.length, r, d * 1.7).forEach((p, i) => pos.set(ids[i], p))
  }
  return pos
}

export const LAYER_GAP = 150
export function layoutLayers(graph: OntoGraph): Map<string, P3> {
  const cols = layerColumns(graph)
  const pos = new Map<string, P3>()
  for (const c of cols) {
    const ids = graph.nodes.filter((n) => n.space === c.space).map((n) => n.id)
    const gap = Math.min(40, 700 / Math.max(1, ids.length))
    const mid = (ids.length - 1) / 2
    ids.forEach((id, i) => pos.set(id, { x: c.x, y: (i - mid) * gap, z: 0 }))
  }
  return pos
}
export function layerColumns(graph: OntoGraph): { space: string; x: number }[] {
  const present = SPACE_ORDER.filter((s) => graph.nodes.some((n) => n.space === s))
  const mid = (present.length - 1) / 2
  return present.map((space, i) => ({ space, x: (i - mid) * LAYER_GAP }))
}

export const RADIAL_STEP = 130
export function layoutRadial(graph: OntoGraph, center: string | null): Map<string, P3> {
  const adj = adjacency(graph)
  const root = center && adj.has(center) ? center : HUB
  const depth = bfsDepth(adj, root)
  const maxDepth = Math.max(1, ...depth.values())
  const rings = new Map<number, string[]>()
  for (const n of graph.nodes) {
    const d = depth.get(n.id) ?? maxDepth + 1
    ;(rings.get(d) ?? rings.set(d, []).get(d)!).push(n.id)
  }
  const pos = new Map<string, P3>()
  for (const [d, ids] of rings) {
    if (d === 0) {
      pos.set(ids[0], { x: 0, y: 0, z: 0 })
      continue
    }
    const r = d * RADIAL_STEP
    ids.forEach((id, i) => {
      const a = (i / ids.length) * Math.PI * 2 + d * 0.4
      pos.set(id, { x: r * Math.cos(a), y: r * Math.sin(a), z: 0 })
    })
  }
  return pos
}

export function fitZoom(pos: Map<string, P3>, w: number, h: number, min = 0.5, max = 3.5): number {
  let maxX = 1
  let maxY = 1
  for (const p of pos.values()) {
    maxX = Math.max(maxX, Math.abs(p.x))
    maxY = Math.max(maxY, Math.abs(p.y))
  }
  return Math.max(min, Math.min(max, Math.min((w * 0.9) / 2 / maxX, (h * 0.86) / 2 / maxY)))
}

export function layoutFor(id: LayoutId, graph: OntoGraph, center: string | null): Map<string, P3> {
  if (id === "layers") return layoutLayers(graph)
  if (id === "radial") return layoutRadial(graph, center)
  return layoutSphere(graph)
}
