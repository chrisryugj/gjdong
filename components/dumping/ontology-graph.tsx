"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import type { OntoGraph } from "@/lib/dumping/types"

// 59노드·76엣지 — 의존성 없이 자체 포스 시뮬레이션으로 정적 배치를 계산하고
// SVG로 렌더한다. 시뮬레이션은 마운트 시 1회(결정적 시드)라 리렌더 비용이 없다.

export const SPACE_COLOR: Record<string, string> = {
  subject: "#94a3b8",
  resource: "#60a5fa",
  concept: "#5eead4",
  claim: "#fbbf24",
  evidence: "#c084fc",
  lever: "#4ade80",
  policy: "#f9a8d4",
  outcome: "#f87171",
}

export const SPACE_KO: Record<string, string> = {
  subject: "주체",
  resource: "데이터",
  concept: "요인·개념",
  claim: "주장·변수",
  evidence: "증거",
  lever: "개입수단",
  policy: "법령·정책",
  outcome: "결과지표",
}

const W = 1200
const H = 860

interface Pos {
  x: number
  y: number
}

// 결정적 의사난수 — 렌더마다 같은 배치
function mulberry32(seed: number) {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// 방사형 배치: 발생률 KPI가 그래프의 허브라 BFS 깊이 = 링 반지름으로 놓으면
// "무엇이 결과에 직접 닿아 있나"가 그대로 보인다. 포스 시뮬은 59노드에서 벽에 눌려 폐기.
const HUB = "kpi-dump-rate"

function layout(graph: OntoGraph): Map<string, Pos> {
  const rand = mulberry32(20260828)
  const adj = new Map<string, string[]>()
  for (const e of graph.edges) {
    if (!adj.has(e.f)) adj.set(e.f, [])
    if (!adj.has(e.t)) adj.set(e.t, [])
    adj.get(e.f)!.push(e.t)
    adj.get(e.t)!.push(e.f)
  }
  // BFS 깊이
  const depth = new Map<string, number>()
  if (graph.nodes.some((n) => n.id === HUB)) {
    depth.set(HUB, 0)
    const queue = [HUB]
    while (queue.length) {
      const cur = queue.shift()!
      for (const next of adj.get(cur) ?? []) {
        if (!depth.has(next)) {
          depth.set(next, depth.get(cur)! + 1)
          queue.push(next)
        }
      }
    }
  }
  const maxDepth = Math.max(1, ...depth.values())
  const orphanDepth = maxDepth + 1 // 비연결 노드는 최외곽
  const byDepth = new Map<number, typeof graph.nodes>()
  for (const n of graph.nodes) {
    const d = n.id === HUB ? 0 : (depth.get(n.id) ?? orphanDepth)
    if (!byDepth.has(d)) byDepth.set(d, [])
    byDepth.get(d)!.push(n)
  }
  const cx = W / 2
  const cy = H / 2
  const maxR = H / 2 - 70
  const pos = new Map<string, Pos>()
  const spaceOrder = Object.keys(SPACE_COLOR)
  for (const [d, nodes] of byDepth) {
    if (d === 0 && nodes.length === 1) {
      pos.set(nodes[0].id, { x: cx, y: cy })
      continue
    }
    // 같은 링 안에서 space끼리 붙여 색 군집이 보이게 정렬
    const sorted = [...nodes].sort(
      (a, b) => spaceOrder.indexOf(a.space) - spaceOrder.indexOf(b.space) || a.id.localeCompare(b.id),
    )
    // 깊이 비례 + 링 위 노드가 겹치지 않을 최소 둘레 보장
    const rScale = d === 0 ? 60 : 60 + ((maxR - 60) * d) / orphanDepth
    const r = Math.max(rScale, (nodes.length * 54) / (2 * Math.PI))
    sorted.forEach((n, i) => {
      const a = (i / sorted.length) * Math.PI * 2 - Math.PI / 2 + d * 0.35
      const jitter = (rand() - 0.5) * 24
      pos.set(n.id, {
        x: cx + Math.cos(a) * (r * 1.38 + jitter), // 가로로 늘려 화면비 활용
        y: cy + Math.sin(a) * (r + jitter),
      })
    })
  }
  return pos
}

function shortLabel(label: string): string {
  return label.length > 22 ? `${label.slice(0, 21)}…` : label
}

interface OntologyGraphProps {
  graph: OntoGraph | null
  selectedId: string | null
  onSelect: (id: string | null) => void
}

export default function OntologyGraph({ graph, selectedId, onSelect }: OntologyGraphProps) {
  const [hoverId, setHoverId] = useState<string | null>(null)
  const [view, setView] = useState({ x: 0, y: 0, k: 1 })
  const dragRef = useRef<{ sx: number; sy: number; ox: number; oy: number } | null>(null)
  const svgRef = useRef<SVGSVGElement>(null)

  const pos = useMemo(() => (graph ? layout(graph) : new Map<string, Pos>()), [graph])

  const neighbors = useMemo(() => {
    const m = new Map<string, Set<string>>()
    if (!graph) return m
    for (const e of graph.edges) {
      if (!m.has(e.f)) m.set(e.f, new Set())
      if (!m.has(e.t)) m.set(e.t, new Set())
      m.get(e.f)!.add(e.t)
      m.get(e.t)!.add(e.f)
    }
    return m
  }, [graph])

  // wheel 줌 — passive 리스너로는 preventDefault가 안 먹어 native로 등록
  useEffect(() => {
    const el = svgRef.current
    if (!el) return
    const onWheel = (ev: WheelEvent) => {
      ev.preventDefault()
      setView((v) => {
        const k = Math.max(0.5, Math.min(4, v.k * (ev.deltaY < 0 ? 1.12 : 0.89)))
        return { ...v, k }
      })
    }
    el.addEventListener("wheel", onWheel, { passive: false })
    return () => el.removeEventListener("wheel", onWheel)
  }, [])

  if (!graph) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-[var(--cp-text-dim)]">
        온톨로지 로딩 중…
      </div>
    )
  }

  const focus = hoverId ?? selectedId
  const focusSet = focus ? (neighbors.get(focus) ?? new Set()) : null

  return (
    <div className="relative h-full w-full overflow-hidden bg-[var(--cp-bg)]">
      <svg
        ref={svgRef}
        className="h-full w-full cursor-grab active:cursor-grabbing"
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="xMidYMid meet"
        onPointerDown={(e) => {
          dragRef.current = { sx: e.clientX, sy: e.clientY, ox: view.x, oy: view.y }
        }}
        onPointerMove={(e) => {
          const d = dragRef.current
          if (!d) return
          setView((v) => ({ ...v, x: d.ox + (e.clientX - d.sx) / v.k, y: d.oy + (e.clientY - d.sy) / v.k }))
        }}
        onPointerUp={(e) => {
          const d = dragRef.current
          dragRef.current = null
          // 클릭(드래그 아님) 시 선택 해제
          if (d && Math.abs(e.clientX - d.sx) < 4 && Math.abs(e.clientY - d.sy) < 4) onSelect(null)
        }}
        onPointerLeave={() => {
          dragRef.current = null
        }}
      >
        <g transform={`translate(${W / 2},${H / 2}) scale(${view.k}) translate(${view.x - W / 2},${view.y - H / 2})`}>
          {graph.edges.map((e, i) => {
            const a = pos.get(e.f)
            const b = pos.get(e.t)
            if (!a || !b) return null
            const active = focus !== null && (e.f === focus || e.t === focus)
            const faded = focus !== null && !active
            const mx = (a.x + b.x) / 2
            const my = (a.y + b.y) / 2
            return (
              <g key={i} opacity={faded ? 0.08 : active ? 0.95 : 0.3}>
                <line
                  x1={a.x}
                  y1={a.y}
                  x2={b.x}
                  y2={b.y}
                  stroke={active ? "#e2e8f0" : "#64748b"}
                  strokeWidth={active ? 1.6 : 0.8}
                />
                {active && (
                  <text
                    x={mx}
                    y={my - 3}
                    textAnchor="middle"
                    fontSize={11}
                    fill="#cbd5e1"
                    style={{ paintOrder: "stroke", stroke: "var(--cp-bg)", strokeWidth: 3 }}
                  >
                    {e.rel}
                  </text>
                )}
              </g>
            )
          })}
          {graph.nodes.map((n) => {
            const p = pos.get(n.id)
            if (!p) return null
            const color = SPACE_COLOR[n.space] ?? "#94a3b8"
            const isFocus = focus === n.id
            const isNeighbor = focusSet?.has(n.id) ?? false
            const faded = focus !== null && !isFocus && !isNeighbor
            const r = n.type === "KPI" || n.type === "Claim" ? 11 : n.type === "Lever" ? 9 : 7
            return (
              <g
                key={n.id}
                transform={`translate(${p.x},${p.y})`}
                opacity={faded ? 0.18 : 1}
                className="cursor-pointer"
                onPointerDown={(e) => e.stopPropagation()}
                onPointerUp={(e) => {
                  e.stopPropagation()
                  onSelect(n.id === selectedId ? null : n.id)
                }}
                onPointerEnter={() => setHoverId(n.id)}
                onPointerLeave={() => setHoverId(null)}
              >
                <circle
                  r={r}
                  fill={color}
                  fillOpacity={isFocus ? 1 : 0.85}
                  stroke={isFocus ? "#fff" : "var(--cp-bg)"}
                  strokeWidth={isFocus ? 2.5 : 1.2}
                />
                <text
                  y={-r - 5}
                  textAnchor="middle"
                  fontSize={isFocus ? 13 : 11}
                  fontWeight={isFocus ? 700 : 400}
                  fill={faded ? "#64748b" : "#e2e8f0"}
                  style={{ paintOrder: "stroke", stroke: "var(--cp-bg)", strokeWidth: 3.5 }}
                >
                  {shortLabel(n.label)}
                </text>
              </g>
            )
          })}
        </g>
      </svg>
      {/* 범례 */}
      <div className="pointer-events-none absolute left-2 top-2 flex flex-wrap gap-x-3 gap-y-1 rounded-lg border border-[var(--cp-border)] bg-[var(--cp-overlay)] px-3 py-2 text-[11px] text-[var(--cp-text-muted)] backdrop-blur">
        {Object.entries(SPACE_KO).map(([space, ko]) => (
          <span key={space} className="inline-flex items-center gap-1.5">
            <i className="h-2 w-2 rounded-full" style={{ background: SPACE_COLOR[space] }} />
            {ko}
          </span>
        ))}
      </div>
      <div className="pointer-events-none absolute bottom-2 left-2 rounded bg-[var(--cp-overlay)] px-2 py-1 text-[11px] text-[var(--cp-text-dim)]">
        59노드 · 76관계 — 노드 클릭 = 상세, 휠 = 확대, 드래그 = 이동
      </div>
    </div>
  )
}
