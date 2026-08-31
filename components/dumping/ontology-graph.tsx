"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import type { OntoGraph } from "@/lib/dumping/types"
import { relLabel } from "@/lib/dumping/labels"

// 3D 온톨로지 그래프 — 의존성 없이 SVG로 직접 구현.
// KPI 허브를 원점에 두고 BFS 깊이 = 구면 셸 반지름으로 배치(피보나치 구면 분포),
// 드래그 = 회전(yaw/pitch), 휠 = 줌, 가만두면 천천히 자동 회전. 59노드라 SVG로 충분.

export const SPACE_COLOR: Record<string, string> = {
  subject: "#64748b",
  resource: "#2563eb",
  concept: "#0d9488",
  claim: "#d97706",
  evidence: "#9333ea",
  lever: "#16a34a",
  policy: "#db2777",
  outcome: "#dc2626",
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
const FOV = 1100 // 원근 초점거리
const HUB = "kpi-dump-rate"

interface P3 {
  x: number
  y: number
  z: number
}

// 구면 셸 배치: BFS 깊이별 반지름, 셸 안에서는 피보나치 구면으로 고르게.
// space 순으로 정렬해 배치하면 같은 색끼리 구면 위에서 이웃하게 된다.
function layout3d(graph: OntoGraph): Map<string, P3> {
  const adj = new Map<string, string[]>()
  for (const e of graph.edges) {
    if (!adj.has(e.f)) adj.set(e.f, [])
    if (!adj.has(e.t)) adj.set(e.t, [])
    adj.get(e.f)!.push(e.t)
    adj.get(e.t)!.push(e.f)
  }
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
  const orphanDepth = maxDepth + 1
  const byDepth = new Map<number, typeof graph.nodes>()
  for (const n of graph.nodes) {
    const d = n.id === HUB ? 0 : (depth.get(n.id) ?? orphanDepth)
    if (!byDepth.has(d)) byDepth.set(d, [])
    byDepth.get(d)!.push(n)
  }
  const spaceOrder = Object.keys(SPACE_COLOR)
  const maxR = 340
  const pos = new Map<string, P3>()
  const golden = Math.PI * (3 - Math.sqrt(5))
  for (const [d, nodes] of byDepth) {
    if (d === 0 && nodes.length === 1) {
      pos.set(nodes[0].id, { x: 0, y: 0, z: 0 })
      continue
    }
    const r = Math.max((maxR * d) / orphanDepth, Math.sqrt(nodes.length) * 52)
    const sorted = [...nodes].sort(
      (a, b) => spaceOrder.indexOf(a.space) - spaceOrder.indexOf(b.space) || a.id.localeCompare(b.id),
    )
    sorted.forEach((n, i) => {
      // 피보나치 구면 — i를 [-1,1] 위도로 펴고 골든앵글로 경도 회전
      const t = sorted.length === 1 ? 0 : (i / (sorted.length - 1)) * 2 - 1
      const lat = Math.asin(t * 0.92) // 극점 뭉침 완화
      const lon = i * golden + d * 1.1
      pos.set(n.id, {
        x: r * Math.cos(lat) * Math.cos(lon),
        y: r * Math.sin(lat),
        z: r * Math.cos(lat) * Math.sin(lon),
      })
    })
  }
  return pos
}

function rotate(p: P3, yaw: number, pitch: number): P3 {
  const cy = Math.cos(yaw)
  const sy = Math.sin(yaw)
  const cp = Math.cos(pitch)
  const sp = Math.sin(pitch)
  const x1 = p.x * cy + p.z * sy
  const z1 = -p.x * sy + p.z * cy
  const y2 = p.y * cp - z1 * sp
  const z2 = p.y * sp + z1 * cp
  return { x: x1, y: y2, z: z2 }
}

function shortLabel(label: string): string {
  return label.length > 20 ? `${label.slice(0, 19)}…` : label
}

interface OntologyGraphProps {
  graph: OntoGraph | null
  selectedId: string | null
  onSelect: (id: string | null) => void
}

export default function OntologyGraph({ graph, selectedId, onSelect }: OntologyGraphProps) {
  const [hoverId, setHoverId] = useState<string | null>(null)
  const [view, setView] = useState({ yaw: 0.6, pitch: 0.28, k: 1 })
  const dragRef = useRef<{ sx: number; sy: number; yaw: number; pitch: number; moved: boolean } | null>(null)
  const interactedRef = useRef(false)
  const svgRef = useRef<SVGSVGElement>(null)

  const pos = useMemo(() => (graph ? layout3d(graph) : new Map<string, P3>()), [graph])
  const viewRef = useRef(view)
  viewRef.current = view

  // 노드 선택 → 그 노드가 정면 중앙에 오도록 회전 애니메이션 (화면 밖·뒷면 노드 대응)
  useEffect(() => {
    if (!selectedId) return
    const p = pos.get(selectedId)
    if (!p) return
    const h = Math.hypot(p.x, p.z)
    if (h < 1e-6 && Math.abs(p.y) < 1e-6) return // 허브(중심)는 회전 불필요
    const targetYaw = Math.atan2(-p.x, p.z) + Math.PI
    const targetPitch = Math.max(-1.35, Math.min(1.35, Math.atan2(-p.y, h)))
    const start = { yaw: viewRef.current.yaw, pitch: viewRef.current.pitch }
    let dYaw = targetYaw - start.yaw
    dYaw = ((dYaw + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI // 최단 경로
    const dPitch = targetPitch - start.pitch
    const t0 = performance.now()
    const DUR = 450
    let raf = 0
    const step = (t: number) => {
      const k = Math.min(1, (t - t0) / DUR)
      const e = 1 - Math.pow(1 - k, 3)
      setView((v) => ({ ...v, yaw: start.yaw + dYaw * e, pitch: start.pitch + dPitch * e }))
      if (k < 1) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [selectedId, pos])

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

  // 자동 회전 — 사용자가 조작하거나 노드를 보고 있을 때는 멈춘다
  useEffect(() => {
    const timer = setInterval(() => {
      if (interactedRef.current || selectedId || hoverId || dragRef.current) return
      setView((v) => ({ ...v, yaw: v.yaw + 0.0045 }))
    }, 40)
    return () => clearInterval(timer)
  }, [selectedId, hoverId])

  // wheel 줌 — passive 리스너로는 preventDefault가 안 먹어 native로 등록
  useEffect(() => {
    const el = svgRef.current
    if (!el) return
    const onWheel = (ev: WheelEvent) => {
      ev.preventDefault()
      setView((v) => ({ ...v, k: Math.max(0.5, Math.min(3.5, v.k * (ev.deltaY < 0 ? 1.28 : 0.78))) }))
    }
    el.addEventListener("wheel", onWheel, { passive: false })
    return () => el.removeEventListener("wheel", onWheel)
  }, [])

  if (!graph) {
    return (
      <div className="flex h-full items-center justify-center text-base text-[var(--cp-text-dim)]">
        온톨로지 로딩 중…
      </div>
    )
  }

  const focus = hoverId ?? selectedId
  const focusSet = focus ? (neighbors.get(focus) ?? new Set()) : null

  // 회전·투영 후 z 내림차순(뒤 → 앞) 렌더
  const projected = graph.nodes
    .map((n) => {
      const p = pos.get(n.id)
      if (!p) return null
      const r = rotate(p, view.yaw, view.pitch)
      const s = (FOV / (FOV + r.z)) * view.k
      return { n, x: W / 2 + r.x * s, y: H / 2 + r.y * s, z: r.z, s }
    })
    .filter((p): p is NonNullable<typeof p> => p !== null)
    .sort((a, b) => b.z - a.z)
  const byId = new Map(projected.map((p) => [p.n.id, p]))

  return (
    <div className="relative h-full w-full overflow-hidden bg-[var(--cp-bg)]">
      <svg
        ref={svgRef}
        className="h-full w-full cursor-grab active:cursor-grabbing"
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="xMidYMid meet"
        onPointerDown={(e) => {
          interactedRef.current = true
          dragRef.current = { sx: e.clientX, sy: e.clientY, yaw: view.yaw, pitch: view.pitch, moved: false }
        }}
        onPointerMove={(e) => {
          const d = dragRef.current
          if (!d) return
          const dx = e.clientX - d.sx
          const dy = e.clientY - d.sy
          if (Math.abs(dx) + Math.abs(dy) > 3) d.moved = true
          setView((v) => ({
            ...v,
            yaw: d.yaw + dx * 0.006,
            pitch: Math.max(-1.35, Math.min(1.35, d.pitch + dy * 0.006)),
          }))
        }}
        onPointerUp={() => {
          const d = dragRef.current
          dragRef.current = null
          if (d && !d.moved) onSelect(null) // 빈 곳 클릭 = 선택 해제
          setTimeout(() => {
            interactedRef.current = false // 잠시 뒤 자동 회전 재개
          }, 4000)
        }}
        onPointerLeave={() => {
          dragRef.current = null
        }}
      >
        {/* 엣지 — 양 끝 평균 z로 깊이감 (앞쪽일수록 진하게) */}
        {graph.edges.map((e, i) => {
          const a = byId.get(e.f)
          const b = byId.get(e.t)
          if (!a || !b) return null
          const active = focus !== null && (e.f === focus || e.t === focus)
          const faded = focus !== null && !active
          const depthOpacity = 0.12 + 0.3 * (1 - (a.z + b.z) / 2 / 400)
          return (
            <g key={i} opacity={faded ? 0.05 : active ? 0.95 : Math.max(0.08, Math.min(0.5, depthOpacity))}>
              <line
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
                stroke={active ? "var(--cp-text)" : "var(--cp-text-faint)"}
                strokeWidth={active ? 1.8 : 0.8}
              />
              {active && (
                <text
                  x={(a.x + b.x) / 2}
                  y={(a.y + b.y) / 2 - 4}
                  textAnchor="middle"
                  fontSize={15}
                  fill="var(--cp-text)"
                  style={{ paintOrder: "stroke", stroke: "var(--cp-bg)", strokeWidth: 3.5 }}
                >
                  {relLabel(e.rel)}
                </text>
              )}
            </g>
          )
        })}
        {/* 노드 — 뒤에서 앞으로, 원근 스케일 반영 */}
        {projected.map(({ n, x, y, s }) => {
          const color = SPACE_COLOR[n.space] ?? "#64748b"
          const isFocus = focus === n.id
          const isNeighbor = focusSet?.has(n.id) ?? false
          const faded = focus !== null && !isFocus && !isNeighbor
          const base = n.type === "KPI" || n.type === "Claim" ? 14 : n.type === "Lever" ? 12 : 10
          const r = Math.max(3, base * s)
          const showLabel = isFocus || isNeighbor || s > 0.98
          return (
            <g
              key={n.id}
              transform={`translate(${x},${y})`}
              opacity={faded ? 0.12 : Math.min(1, 0.45 + s * 0.55)}
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
                fillOpacity={isFocus ? 1 : 0.88}
                stroke={isFocus ? "var(--cp-text-strong)" : "var(--cp-bg)"}
                strokeWidth={isFocus ? 2.5 : 1.2}
              />
              {showLabel && (
                <text
                  y={-r - 5}
                  textAnchor="middle"
                  fontSize={isFocus ? 17 : 13 * Math.min(1.15, s)}
                  fontWeight={isFocus ? 700 : 500}
                  fill={faded ? "var(--cp-text-faint)" : "var(--cp-text-strong)"}
                  style={{ paintOrder: "stroke", stroke: "var(--cp-bg)", strokeWidth: 3.5 }}
                >
                  {shortLabel(n.label)}
                </text>
              )}
            </g>
          )
        })}
      </svg>
      {/* 범례 */}
      <div className="pointer-events-none absolute left-2 top-2 flex flex-wrap gap-x-3 gap-y-1 rounded-lg border border-[var(--cp-border)] bg-[var(--cp-overlay)] px-3 py-2 text-[13px] text-[var(--cp-text-muted)] backdrop-blur">
        {Object.entries(SPACE_KO).map(([space, ko]) => (
          <span key={space} className="inline-flex items-center gap-1.5">
            <i className="h-2 w-2 rounded-full" style={{ background: SPACE_COLOR[space] }} />
            {ko}
          </span>
        ))}
      </div>
      <div className="pointer-events-none absolute bottom-2 left-2 rounded bg-[var(--cp-overlay)] px-2 py-1 text-[13px] text-[var(--cp-text-dim)]">
        지식 {graph.nodes.length}개 · 연결 {graph.edges.length}개 · 드래그로 회전, 휠로 확대, 동그라미를
        누르면 상세 (가만두면 천천히 돕니다)
      </div>
    </div>
  )
}
