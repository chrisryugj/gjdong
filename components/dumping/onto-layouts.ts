import type { OntoGraph } from "@/lib/dumping/types"

// 근거 그래프 배치 4종. 순수 함수라 하네스(tests/onto-layouts.test.ts)에서 검증한다.
// 14라운드: 구면(힘 배치 비슷한 무작위 느낌) 하나뿐이라 심사 냉독에서 "헤어볼"로 읽혔다. 칩으로 배치를 바꾼다.
//   sphere   결과지표 허브에서 연결 거리별 구면 셸(기존). 3D 회전
//   layers   자료 → 증거 → 요인 → 주장 → 지표 → 수단 → 법령 세로 열. 근거 경로가 왼쪽에서 오른쪽으로 읽힌다(PROV 계보 관례). 2D
//   clusters 같은 종류(space)끼리 작은 구면으로 모아 큰 원에 배치. 종류 사이 연결이 보인다. 3D 회전
//   radial   고른 항목(없으면 허브)을 가운데, 연결 거리별 동심원. 계보 탐색용. 2D

export type LayoutId = "sphere" | "layers" | "clusters" | "radial"

export const LAYOUTS: { id: LayoutId; label: string; help: string; flat: boolean }[] = [
  { id: "sphere", label: "구면", help: "결과지표를 가운데 두고 연결 거리만큼 바깥 구면에 놓습니다. 드래그로 돌려 봅니다", flat: false },
  { id: "layers", label: "층별 흐름", help: "자료 → 증거 → 요인 → 주장 → 지표 → 수단 → 법령 순서의 세로 열. 근거 경로가 왼쪽에서 오른쪽으로 읽힙니다", flat: true },
  { id: "clusters", label: "분류별 군집", help: "같은 종류끼리 한 덩어리로 모아 둥글게 놓습니다. 종류 사이의 연결이 보입니다", flat: false },
  { id: "radial", label: "선택 중심", help: "고른 항목을 가운데 두고 연결 거리만큼 바깥 원에 놓습니다. 고른 것이 없으면 결과지표 중심", flat: true },
]

export const HUB = "kpi-dump-rate"
// 범례·군집·층 순서의 정본. ontology-graph.tsx SPACE_COLOR와 같은 순서
export const SPACE_ORDER = ["subject", "resource", "evidence", "concept", "claim", "outcome", "lever", "policy"] as const

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

// 뿌리에서 BFS 깊이. 닿지 않는 노드는 없다(호출자가 바깥 고리로)
function bfsDepth(adj: Map<string, string[]>, root: string): Map<string, number> {
  const depth = new Map<string, number>()
  if (!adj.has(root)) return depth
  depth.set(root, 0)
  const queue = [root]
  while (queue.length) {
    const cur = queue.shift()!
    for (const next of adj.get(cur) ?? []) {
      if (!depth.has(next)) {
        depth.set(next, depth.get(cur)! + 1)
        queue.push(next)
      }
    }
  }
  return depth
}

const spaceRank = (s: string) => {
  const i = (SPACE_ORDER as readonly string[]).indexOf(s)
  return i < 0 ? SPACE_ORDER.length : i
}

// 피보나치 구면. n개를 반지름 r 구면에 고르게. 극점 뭉침 완화(0.92), 셸마다 경도 시작 각을 달리한다
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

// ─── 구면(기존) ───
export function layoutSphere(graph: OntoGraph): Map<string, P3> {
  const adj = adjacency(graph)
  const depth = bfsDepth(adj, HUB)
  const maxDepth = Math.max(1, ...depth.values())
  const orphanDepth = maxDepth + 1
  const byDepth = new Map<number, typeof graph.nodes>()
  for (const n of graph.nodes) {
    const d = n.id === HUB ? 0 : (depth.get(n.id) ?? orphanDepth)
    if (!byDepth.has(d)) byDepth.set(d, [])
    byDepth.get(d)!.push(n)
  }
  const maxR = 340
  const pos = new Map<string, P3>()
  for (const [d, nodes] of byDepth) {
    if (d === 0 && nodes.length === 1) {
      pos.set(nodes[0].id, { x: 0, y: 0, z: 0 })
      continue
    }
    const r = Math.max((maxR * d) / orphanDepth, Math.sqrt(nodes.length) * 52)
    const sorted = [...nodes].sort((a, b) => spaceRank(a.space) - spaceRank(b.space) || a.id.localeCompare(b.id))
    fibonacciSphere(sorted.length, r, d * 1.1).forEach((p, i) => pos.set(sorted[i].id, p))
  }
  return pos
}

// ─── 층별 흐름 ───
// 열 = space 순서(자료가 왼쪽, 법령이 오른쪽). 열 안 순서는 이웃의 평균 y(무게중심)로 몇 번 정렬해 교차를 줄인다(스기야마 약식)
export const LAYER_GAP = 150
export function layoutLayers(graph: OntoGraph): Map<string, P3> {
  const adj = adjacency(graph)
  const layers = SPACE_ORDER.map((s) => graph.nodes.filter((n) => n.space === s).sort((a, b) => a.type.localeCompare(b.type) || a.id.localeCompare(b.id))).filter((l) => l.length > 0)
  const others = graph.nodes.filter((n) => spaceRank(n.space) >= SPACE_ORDER.length)
  if (others.length) layers.push(others)
  const y = new Map<string, number>()
  const assign = (nodes: typeof graph.nodes) => {
    const dy = Math.min(46, 780 / Math.max(1, nodes.length))
    nodes.forEach((n, i) => y.set(n.id, (i - (nodes.length - 1) / 2) * dy))
  }
  layers.forEach(assign)
  for (let sweep = 0; sweep < 4; sweep++) {
    const order = sweep % 2 === 0 ? layers : [...layers].reverse()
    for (const nodes of order) {
      const bary = new Map<string, number>()
      for (const n of nodes) {
        const ys = (adj.get(n.id) ?? []).map((m) => y.get(m)).filter((v): v is number => typeof v === "number")
        bary.set(n.id, ys.length ? ys.reduce((a, b) => a + b, 0) / ys.length : (y.get(n.id) ?? 0))
      }
      nodes.sort((a, b) => bary.get(a.id)! - bary.get(b.id)! || a.id.localeCompare(b.id))
      assign(nodes)
    }
  }
  const pos = new Map<string, P3>()
  const mid = (layers.length - 1) / 2
  layers.forEach((nodes, li) => {
    for (const n of nodes) pos.set(n.id, { x: (li - mid) * LAYER_GAP, y: y.get(n.id) ?? 0, z: 0 })
  })
  return pos
}

// ─── 분류별 군집 ───
// 종류마다 큰 원(반지름 290, xz 평면) 위에 중심을 두고, 그 안은 작은 구면. y는 번갈아 위아래로 두어 선이 덜 겹친다
export const CLUSTER_RING = 290
export function clusterRadius(n: number): number {
  return 26 + 11 * Math.sqrt(n)
}
export function layoutClusters(graph: OntoGraph): Map<string, P3> {
  const pos = new Map<string, P3>()
  const groups = new Map<string, typeof graph.nodes>()
  for (const n of graph.nodes) {
    const key = spaceRank(n.space) < SPACE_ORDER.length ? n.space : "other"
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(n)
  }
  const keys = [...groups.keys()].sort((a, b) => spaceRank(a) - spaceRank(b))
  keys.forEach((key, gi) => {
    const nodes = [...groups.get(key)!].sort((a, b) => a.type.localeCompare(b.type) || a.id.localeCompare(b.id))
    const ang = (gi / keys.length) * 2 * Math.PI
    const c: P3 = { x: CLUSTER_RING * Math.cos(ang), y: gi % 2 ? 60 : -60, z: CLUSTER_RING * Math.sin(ang) }
    fibonacciSphere(nodes.length, clusterRadius(nodes.length), gi * 0.7).forEach((p, i) => pos.set(nodes[i].id, { x: c.x + p.x, y: c.y + p.y, z: c.z + p.z }))
  })
  return pos
}

// ─── 선택 중심 방사형 ───
// 가운데 = 고른 노드(없으면 허브). 고리 d = 연결 거리 d, 반지름 d×105. 고리 안 순서는 안쪽 고리 이웃의 각도를 따라가 선이 짧게
export const RADIAL_STEP = 130
export function layoutRadial(graph: OntoGraph, center: string | null): Map<string, P3> {
  const adj = adjacency(graph)
  const root = center && adj.has(center) ? center : adj.has(HUB) ? HUB : graph.nodes[0]?.id
  const pos = new Map<string, P3>()
  if (!root) return pos
  const depth = bfsDepth(adj, root)
  const maxDepth = Math.max(0, ...depth.values())
  const orphanDepth = maxDepth + 1
  const rings = new Map<number, typeof graph.nodes>()
  for (const n of graph.nodes) {
    const d = depth.get(n.id) ?? orphanDepth
    if (!rings.has(d)) rings.set(d, [])
    rings.get(d)!.push(n)
  }
  const angle = new Map<string, number>()
  pos.set(root, { x: 0, y: 0, z: 0 })
  angle.set(root, 0)
  for (const d of [...rings.keys()].sort((a, b) => a - b)) {
    if (d === 0) continue
    const nodes = rings.get(d)!
    const parentAngle = (n: (typeof nodes)[number]) => {
      const inner = (adj.get(n.id) ?? []).filter((m) => angle.has(m) && (depth.get(m) ?? orphanDepth) < d)
      if (!inner.length) return null
      // 평균 각도는 원형이라 벡터 합으로
      const sx = inner.reduce((a, m) => a + Math.cos(angle.get(m)!), 0)
      const sy = inner.reduce((a, m) => a + Math.sin(angle.get(m)!), 0)
      return Math.atan2(sy, sx)
    }
    const keyed = nodes.map((n) => ({ n, pa: parentAngle(n) }))
    keyed.sort((a, b) => (a.pa ?? 99) - (b.pa ?? 99) || spaceRank(a.n.space) - spaceRank(b.n.space) || a.n.id.localeCompare(b.n.id))
    const start = keyed[0].pa ?? 0
    const r = d * RADIAL_STEP
    keyed.forEach(({ n }, i) => {
      const a = nodes.length === 1 && keyed[0].pa != null ? keyed[0].pa : start + (i / nodes.length) * 2 * Math.PI
      angle.set(n.id, a)
      pos.set(n.id, { x: r * Math.cos(a), y: r * Math.sin(a), z: 0 })
    })
  }
  return pos
}

// 층별 흐름의 열 제목 위치(x). 그래프 컴포넌트가 열 머리에 종류 이름을 쓴다
export function layerColumns(graph: OntoGraph): { space: string; x: number }[] {
  const present = SPACE_ORDER.filter((s) => graph.nodes.some((n) => n.space === s))
  const hasOther = graph.nodes.some((n) => spaceRank(n.space) >= SPACE_ORDER.length)
  const count = present.length + (hasOther ? 1 : 0)
  const mid = (count - 1) / 2
  return present.map((space, i) => ({ space, x: (i - mid) * LAYER_GAP }))
}

// 평면 배치가 캔버스(w×h)에 들어오는 줌. 라벨 여유로 90%만 쓴다
export function fitZoom(pos: Map<string, P3>, w: number, h: number, min = 0.5, max = 3.5): number {
  let maxX = 1
  let maxY = 1
  for (const p of pos.values()) {
    maxX = Math.max(maxX, Math.abs(p.x))
    maxY = Math.max(maxY, Math.abs(p.y))
  }
  const k = Math.min((w * 0.9) / 2 / maxX, (h * 0.86) / 2 / maxY)
  return Math.max(min, Math.min(max, k))
}

export function layoutFor(id: LayoutId, graph: OntoGraph, center: string | null): Map<string, P3> {
  switch (id) {
    case "layers":
      return layoutLayers(graph)
    case "clusters":
      return layoutClusters(graph)
    case "radial":
      return layoutRadial(graph, center)
    default:
      return layoutSphere(graph)
  }
}
