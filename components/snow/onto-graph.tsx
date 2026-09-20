"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import type { OntoGraph } from "@/lib/snow/types"
import { relLabel } from "@/lib/snow/labels"
import { SPACE_KO } from "@/lib/snow/schema"
import { DEFAULT_ZOOM, labelVisible, placeLabels, projScale, type LabelCandAlt } from "@/components/dumping/onto-view"
import { fitZoom, HUB, LAYOUTS, layerColumns, layoutFor, type LayoutId, type P3 } from "./onto-layouts"

// /snow 온톨로지 그래프. /dumping ontology-graph의 SVG 투영·라벨 배치 규약을 따르되 배치·색·라벨은 제설 도메인.
// 구면은 3D(드래그 = 회전, 가만두면 자동 회전), 층별·선택 중심은 평면(드래그 = 이동). 휠·버튼 = 줌

// 색 문법: 지도와 충돌하지 않게 자원(lever)은 남색, 행정동(area)은 회녹, 위험·지표(outcome)는 벽돌. 열선 주황·청빙은 지도 자원 색이라 그래프에서 안 쓴다
export const SPACE_COLOR: Record<string, string> = {
  subject: "#64748b",
  resource: "#2563eb",
  evidence: "#9333ea",
  concept: "#0d9488",
  claim: "#d97706",
  outcome: "#c8553d",
  lever: "#4b5563",
  policy: "#db2777",
  area: "#5b7a6a",
}
// 그래프에 그리는 노드: 취약구간 실체(Entity 56)는 지도가 보여 주므로 그래프에서는 뺀다(72노드에서도 헤어볼이었다)
export function viewGraph(graph: OntoGraph): OntoGraph {
  const hide = new Set(graph.nodes.filter((n) => n.type === "Entity").map((n) => n.id))
  return { nodes: graph.nodes.filter((n) => !hide.has(n.id)), edges: graph.edges.filter((e) => !hide.has(e.f) && !hide.has(e.t)) }
}

const W = 1200
const H = 860
const clampZoom = (k: number) => Math.max(0.5, Math.min(3.5, k))
function rotate(p: P3, yaw: number, pitch: number): P3 {
  const cy = Math.cos(yaw)
  const sy = Math.sin(yaw)
  const cp = Math.cos(pitch)
  const sp = Math.sin(pitch)
  const x1 = p.x * cy + p.z * sy
  const z1 = -p.x * sy + p.z * cy
  return { x: x1, y: p.y * cp - z1 * sp, z: p.y * sp + z1 * cp }
}
const shortLabel = (s: string, max = 20) => (s.length > max ? `${s.slice(0, max - 1)}…` : s)
const nodeBase = (type: string) => (type === "KPI" || type === "Claim" ? 14 : type === "Lever" || type === "Stage" ? 12 : 10)

interface Props {
  graph: OntoGraph | null
  selectedId: string | null
  onSelect: (id: string | null) => void
}

export default function OntoGraphView({ graph: fullGraph, selectedId, onSelect }: Props) {
  const graph = useMemo(() => (fullGraph ? viewGraph(fullGraph) : null), [fullGraph])
  const [hoverId, setHoverId] = useState<string | null>(null)
  const [view, setView] = useState({ yaw: 0.6, pitch: 0.28, k: DEFAULT_ZOOM })
  const [layout, setLayout] = useState<LayoutId>("layers")
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const dragRef = useRef<{ sx: number; sy: number; yaw: number; pitch: number; px: number; py: number; moved: boolean } | null>(null)
  const interactedRef = useRef(false)
  const svgRef = useRef<SVGSVGElement>(null)
  const flat = LAYOUTS.find((l) => l.id === layout)?.flat ?? false
  const radialCenter = layout === "radial" ? selectedId : null
  const pos = useMemo(() => (graph ? layoutFor(layout, graph, radialCenter) : new Map<string, P3>()), [graph, layout, radialCenter])
  const viewRef = useRef(view)
  viewRef.current = view
  const fittedRef = useRef(false)
  useEffect(() => {
    if (!graph || fittedRef.current) return
    fittedRef.current = true
    setView((v) => ({ ...v, k: fitZoom(layoutFor("layers", graph, null), W, H) }))
  }, [graph])
  const panRef = useRef(pan)
  panRef.current = pan

  const radialFit = (p: Map<string, P3>, center: string | null) => {
    if (!graph) return DEFAULT_ZOOM
    const c = center && p.has(center) ? center : HUB
    const keep = new Set<string>([c])
    for (const e of graph.edges) {
      if (e.f === c) keep.add(e.t)
      if (e.t === c) keep.add(e.f)
    }
    const sub = new Map<string, P3>()
    for (const [id, q] of p) if (keep.has(id)) sub.set(id, q)
    return fitZoom(sub, W, H, 0.6, 2.2)
  }
  const switchLayout = (id: LayoutId) => {
    setLayout(id)
    setPan({ x: 0, y: 0 })
    if (graph && id === "radial") setView((v) => ({ ...v, k: radialFit(layoutFor(id, graph, selectedId), selectedId) }))
    else if (graph && id === "layers") setView((v) => ({ ...v, k: fitZoom(layoutFor(id, graph, null), W, H) }))
    else setView((v) => ({ ...v, k: DEFAULT_ZOOM }))
  }

  // 평면: 선택 노드를 중앙으로 이동
  useEffect(() => {
    if (!flat || !selectedId) return
    const p = pos.get(selectedId)
    if (!p) return
    const k = layout === "radial" ? radialFit(pos, selectedId) : viewRef.current.k
    if (layout === "radial") setView((v) => ({ ...v, k }))
    const target = { x: -p.x * k, y: -p.y * k }
    const start = { ...panRef.current }
    const t0 = performance.now()
    let raf = 0
    const step = (t: number) => {
      const q = Math.min(1, (t - t0) / 450)
      const e = 1 - Math.pow(1 - q, 3)
      setPan({ x: start.x + (target.x - start.x) * e, y: start.y + (target.y - start.y) * e })
      if (q < 1) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [flat, layout, selectedId, pos])

  // 3D: 선택 노드가 정면에 오도록 회전
  useEffect(() => {
    if (flat || !selectedId) return
    const p = pos.get(selectedId)
    if (!p) return
    const h = Math.hypot(p.x, p.z)
    if (h < 1e-6 && Math.abs(p.y) < 1e-6) return
    const targetYaw = Math.atan2(-p.x, p.z) + Math.PI
    const targetPitch = Math.max(-1.35, Math.min(1.35, Math.atan2(-p.y, h)))
    const start = { yaw: viewRef.current.yaw, pitch: viewRef.current.pitch }
    let dYaw = targetYaw - start.yaw
    dYaw = ((((dYaw + Math.PI) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)) - Math.PI
    const dPitch = targetPitch - start.pitch
    const t0 = performance.now()
    let raf = 0
    const step = (t: number) => {
      const q = Math.min(1, (t - t0) / 450)
      const e = 1 - Math.pow(1 - q, 3)
      setView((v) => ({ ...v, yaw: start.yaw + dYaw * e, pitch: start.pitch + dPitch * e }))
      if (q < 1) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [flat, selectedId, pos])

  const neighbors = useMemo(() => {
    const m = new Map<string, Set<string>>()
    if (!graph) return m
    for (const e of graph.edges) {
      ;(m.get(e.f) ?? m.set(e.f, new Set()).get(e.f)!).add(e.t)
      ;(m.get(e.t) ?? m.set(e.t, new Set()).get(e.t)!).add(e.f)
    }
    return m
  }, [graph])

  useEffect(() => {
    if (flat) return
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return
    const timer = setInterval(() => {
      if (interactedRef.current || selectedId || hoverId || dragRef.current) return
      setView((v) => ({ ...v, yaw: v.yaw + 0.0045 }))
    }, 40)
    return () => clearInterval(timer)
  }, [flat, selectedId, hoverId])

  useEffect(() => {
    const el = svgRef.current
    if (!el) return
    const onWheel = (ev: WheelEvent) => {
      ev.preventDefault()
      setView((v) => ({ ...v, k: clampZoom(v.k * (ev.deltaY < 0 ? 1.28 : 0.78)) }))
    }
    el.addEventListener("wheel", onWheel, { passive: false })
    return () => el.removeEventListener("wheel", onWheel)
  }, [graph])

  if (!graph) return <div className="flex h-full items-center justify-center text-base text-[var(--cp-text-dim)]">근거 그래프를 불러오는 중</div>

  const focus = hoverId ?? selectedId ?? HUB
  const focusSet = focus ? (neighbors.get(focus) ?? new Set()) : null
  const projected = graph.nodes
    .map((n) => {
      const p = pos.get(n.id)
      if (!p) return null
      const r = flat ? p : rotate(p, view.yaw, view.pitch)
      const s = projScale(r.z, view.k)
      return { n, x: W / 2 + r.x * s + (flat ? pan.x : 0), y: H / 2 + r.y * s + (flat ? pan.y : 0), z: r.z, s }
    })
    .filter((p): p is NonNullable<typeof p> => p !== null)
    .sort((a, b) => b.z - a.z)
  const byId = new Map(projected.map((p) => [p.n.id, p]))

  // 라벨 자리(위·오른쪽·왼쪽·아래)와 겹침 제거. 포커스 이웃은 포커스에서 바깥쪽 자리를 먼저 시도한다
  const focusP = focus ? byId.get(focus) : null
  type Slot = { tx: number; ty: number; anchor: "start" | "middle" | "end"; x: number; y: number; w: number; h: number }
  const slotsOf = new Map<string, Slot[]>()
  const labelCands: LabelCandAlt[] = [...projected].reverse().flatMap(({ n, x, y, z, s }) => {
    const isFocusNode = focus === n.id
    const fon = isFocusNode || (focusSet?.has(n.id) ?? false)
    if (focus && !fon) return []
    if (!labelVisible(z, view.k, fon)) return []
    const nodeR = Math.max(3, nodeBase(n.type) * s)
    const fs = isFocusNode ? 18 : flat ? 13.5 : 14.5 * Math.max(0.85, Math.min(1.3, s))
    const w = shortLabel(n.label, isFocusNode ? 34 : 20).length * fs * 0.92 + 8
    const h = fs + 6
    const above: Slot = { tx: 0, ty: -nodeR - 5, anchor: "middle", x, y: y - nodeR - 5 - fs / 2, w, h }
    const below: Slot = { tx: 0, ty: nodeR + 4 + fs, anchor: "middle", x, y: y + nodeR + 4 + fs / 2, w, h }
    const right: Slot = { tx: nodeR + 7, ty: fs * 0.36, anchor: "start", x: x + nodeR + 7 + w / 2, y, w, h }
    const left: Slot = { tx: -(nodeR + 7), ty: fs * 0.36, anchor: "end", x: x - nodeR - 7 - w / 2, y, w, h }
    let order: Slot[] = [above, right, left, below]
    if (focusP && !isFocusNode) {
      const dx = x - focusP.x
      const dy = y - focusP.y
      const side = dx >= 0 ? right : left
      const vert = dy > 0 ? below : above
      order = Math.abs(dx) >= Math.abs(dy) * 0.9 ? [side, vert, dy > 0 ? above : below] : [vert, side, dx >= 0 ? left : right]
    }
    slotsOf.set(n.id, order)
    const [first, ...alts] = order
    return [{ id: n.id, x: first.x, y: first.y, w, h, keep: isFocusNode, alts }]
  })
  const edgeLabelPos = new Map<number, { x: number; y: number }>()
  if (focusP) {
    graph.edges.forEach((e, i) => {
      if (e.f !== focus && e.t !== focus) return
      const other = byId.get(e.f === focus ? e.t : e.f)
      if (!other) return
      const dx = other.x - focusP.x
      const dy = other.y - focusP.y
      const len = Math.hypot(dx, dy) || 1
      let px = -dy / len
      let py = dx / len
      if (py > 0) {
        px = -px
        py = -py
      }
      const lx = focusP.x + dx * 0.58 + px * 9
      const ly = focusP.y + dy * 0.58 + py * 9
      edgeLabelPos.set(i, { x: lx, y: ly })
      labelCands.push({ id: `e:${i}`, x: lx, y: ly, w: relLabel(e.rel).length * 12.5 * 0.92 + 6, h: 16, keep: false })
    })
  }
  const chosen = placeLabels(labelCands)
  const labelSet = new Set(chosen.keys())
  const placement = new Map<string, Slot>()
  for (const [id, idx] of chosen) {
    const sl = slotsOf.get(id)?.[idx]
    if (sl) placement.set(id, sl)
  }

  return (
    <div className="relative h-full w-full overflow-hidden bg-[var(--cp-bg)]">
      <svg
        ref={svgRef}
        className="h-full w-full touch-none cursor-grab active:cursor-grabbing"
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="xMidYMid meet"
        onPointerDown={(e) => {
          interactedRef.current = true
          e.currentTarget.setPointerCapture(e.pointerId)
          dragRef.current = { sx: e.clientX, sy: e.clientY, yaw: view.yaw, pitch: view.pitch, px: pan.x, py: pan.y, moved: false }
        }}
        onPointerMove={(e) => {
          const d = dragRef.current
          if (!d) return
          const dx = e.clientX - d.sx
          const dy = e.clientY - d.sy
          if (Math.abs(dx) + Math.abs(dy) > 3) d.moved = true
          if (flat) {
            const f = W / Math.max(1, e.currentTarget.clientWidth)
            setPan({ x: d.px + dx * f, y: d.py + dy * f })
            return
          }
          setView((v) => ({ ...v, yaw: d.yaw + dx * 0.006, pitch: Math.max(-1.35, Math.min(1.35, d.pitch + dy * 0.006)) }))
        }}
        onPointerUp={() => {
          const d = dragRef.current
          dragRef.current = null
          if (d && !d.moved) onSelect(null)
          setTimeout(() => {
            interactedRef.current = false
          }, 4000)
        }}
        onPointerLeave={() => {
          dragRef.current = null
        }}
      >
        {layout === "layers" &&
          layerColumns(graph).map((c) => (
            <text key={c.space} x={W / 2 + c.x * view.k + pan.x} y={22} textAnchor="middle" fontSize={14} fontWeight={700} fill={SPACE_COLOR[c.space] ?? "#64748b"}>
              {SPACE_KO[c.space as keyof typeof SPACE_KO] ?? c.space}
            </text>
          ))}
        {graph.edges.map((e, i) => {
          const a = byId.get(e.f)
          const b = byId.get(e.t)
          if (!a || !b) return null
          const active = focus !== null && (e.f === focus || e.t === focus)
          const faded = focus !== null && !active
          const depthOpacity = 0.12 + 0.3 * (1 - (a.z + b.z) / 2 / 400)
          return (
            <g key={i} opacity={faded ? 0.05 : active ? 0.95 : Math.max(0.08, Math.min(0.5, depthOpacity))}>
              <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={active ? "var(--cp-text)" : "var(--cp-text-faint)"} strokeWidth={active ? 1.8 : 0.8} />
              {active && labelSet.has(`e:${i}`) && edgeLabelPos.get(i) && (
                <text x={edgeLabelPos.get(i)!.x} y={edgeLabelPos.get(i)!.y} textAnchor="middle" fontSize={12.5} fill="var(--cp-text-muted)" style={{ paintOrder: "stroke", stroke: "var(--cp-bg)", strokeWidth: 3.5 }}>
                  {relLabel(e.rel)}
                </text>
              )}
            </g>
          )
        })}
        {projected.map(({ n, x, y, s }) => {
          const color = SPACE_COLOR[n.space] ?? "#64748b"
          const isFocus = focus === n.id
          const isNeighbor = focusSet?.has(n.id) ?? false
          const faded = focus !== null && !isFocus && !isNeighbor
          const r = Math.max(3, nodeBase(n.type) * s)
          const pl = placement.get(n.id)
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
              {n.type === "Stage" ? <rect x={-r} y={-r} width={r * 2} height={r * 2} rx={2} fill={color} fillOpacity={isFocus ? 1 : 0.88} stroke={isFocus ? "var(--cp-text-strong)" : "var(--cp-bg)"} strokeWidth={isFocus ? 2.5 : 1.2} /> : <circle r={r} fill={color} fillOpacity={isFocus ? 1 : 0.88} stroke={isFocus ? "var(--cp-text-strong)" : "var(--cp-bg)"} strokeWidth={isFocus ? 2.5 : 1.2} />}
              {labelSet.has(n.id) && (
                <text x={pl?.tx ?? 0} y={pl?.ty ?? -r - 5} textAnchor={pl?.anchor ?? "middle"} fontSize={isFocus ? 18 : flat ? 13.5 : 14.5 * Math.max(0.85, Math.min(1.3, s))} fontWeight={isFocus ? 700 : 500} fill={faded ? "var(--cp-text-faint)" : "var(--cp-text-strong)"} style={{ paintOrder: "stroke", stroke: "var(--cp-bg)", strokeWidth: 4.5 }}>
                  {shortLabel(n.label, isFocus ? 34 : 20)}
                </text>
              )}
            </g>
          )
        })}
      </svg>
      <div className="pointer-events-none absolute left-2 top-2 flex max-w-[60%] flex-wrap gap-x-3 gap-y-1 rounded-lg border border-[var(--cp-border)] bg-[var(--cp-overlay)] px-3 py-2 text-[13px] text-[var(--cp-text-muted)] backdrop-blur">
        {Object.entries(SPACE_KO).map(([space, ko]) => (
          <span key={space} className="inline-flex items-center gap-1.5">
            <i className="h-2 w-2 rounded-full" style={{ background: SPACE_COLOR[space] }} />
            {ko}
          </span>
        ))}
      </div>
      <div role="group" aria-label="배치" className="absolute right-2 top-2 flex items-center gap-1 rounded-lg border border-[var(--cp-border)] bg-[var(--cp-overlay)] px-2 py-1.5 backdrop-blur">
        <span className="mr-0.5 text-[12.5px] text-[var(--cp-text-dim)]">배치</span>
        {LAYOUTS.map((l) => (
          <button key={l.id} type="button" aria-pressed={layout === l.id} title={l.help} onClick={() => switchLayout(l.id)} className={`rounded-full border px-2.5 py-0.5 text-[13px] transition-colors ${layout === l.id ? "border-(--dump-accent) bg-(--dump-accent)/10 font-semibold text-(--dump-accent)" : "border-[var(--cp-border)] text-[var(--cp-text-muted)] hover:bg-[var(--cp-hover)]"}`}>
            {l.label}
          </button>
        ))}
      </div>
      <div className="absolute bottom-2 right-2 flex flex-col overflow-hidden rounded-lg border border-[var(--cp-border)] bg-[var(--cp-overlay)] backdrop-blur">
        <button type="button" onClick={() => setView((v) => ({ ...v, k: clampZoom(v.k * 1.28) }))} aria-label="확대" className="h-8 w-8 text-[16px] leading-none text-[var(--cp-text)] hover:bg-[var(--cp-hover)]">+</button>
        <button type="button" onClick={() => setView((v) => ({ ...v, k: clampZoom(v.k * 0.78) }))} aria-label="축소" className="h-8 w-8 border-t border-[var(--cp-border)] text-[16px] leading-none text-[var(--cp-text)] hover:bg-[var(--cp-hover)]">−</button>
      </div>
      <div className="pointer-events-none absolute bottom-2 left-2 max-w-[calc(100%-4rem)] rounded bg-[var(--cp-overlay)] px-2 py-1 text-[13px] text-[var(--cp-text-dim)]">
        지식 {graph.nodes.length}개 · 연결 {graph.edges.length}개 · {flat ? "끌어서 이동" : "끌어서 회전"}, 두 손가락 또는 휠로 확대, 동그라미를 누르면 상세
      </div>
    </div>
  )
}
