"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import type { OntoGraph } from "@/lib/dumping/types"
import { relLabel } from "@/lib/dumping/labels"
import { DEFAULT_ZOOM, labelVisible, placeLabels, projScale, type LabelCandAlt } from "./onto-view"
import { fitZoom, HUB, LAYOUTS, layerColumns, layoutFor, type LayoutId, type P3 } from "./onto-layouts"

// 온톨로지 그래프. 의존성 없이 SVG로 직접 구현.
// 배치 4종(onto-layouts.ts)을 칩으로 바꾼다. 구면·군집은 3D(드래그 = 회전, 가만두면 자동 회전), 층별·선택 중심은 평면(드래그 = 이동).
// 휠·버튼 = 줌. 노드가 백여 개라 SVG로 충분.

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
const clampZoom = (k: number) => Math.max(0.5, Math.min(3.5, k))

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

function shortLabel(label: string, max = 20): string {
  return label.length > max ? `${label.slice(0, max - 1)}…` : label
}

interface OntologyGraphProps {
  graph: OntoGraph | null
  selectedId: string | null
  onSelect: (id: string | null) => void
}

export default function OntologyGraph({ graph, selectedId, onSelect }: OntologyGraphProps) {
  const [hoverId, setHoverId] = useState<string | null>(null)
  const [view, setView] = useState({ yaw: 0.6, pitch: 0.28, k: DEFAULT_ZOOM })
  const [layout, setLayout] = useState<LayoutId>("sphere")
  const [pan, setPan] = useState({ x: 0, y: 0 }) // 평면 배치의 이동(viewBox 단위)
  const [legendOpen, setLegendOpen] = useState(false) // 모바일에서만 의미. 데스크톱은 항상 펼침
  const dragRef = useRef<{ sx: number; sy: number; yaw: number; pitch: number; px: number; py: number; moved: boolean } | null>(null)
  const interactedRef = useRef(false)
  const svgRef = useRef<SVGSVGElement>(null)

  const flat = LAYOUTS.find((l) => l.id === layout)?.flat ?? false
  // 선택 중심 배치만 고른 노드를 따라 다시 계산한다. 다른 배치는 그래프가 바뀔 때만
  const radialCenter = layout === "radial" ? selectedId : null
  const pos = useMemo(() => (graph ? layoutFor(layout, graph, radialCenter) : new Map<string, P3>()), [graph, layout, radialCenter])
  const viewRef = useRef(view)
  viewRef.current = view
  const panRef = useRef(pan)
  panRef.current = pan

  // 선택 중심 맞춤 줌: 전체가 아니라 가운데 노드 + 2단계 이웃까지만 화면에 맞춘다(바깥 고리까지 맞추면 콩알이 된다)
  const radialFit = (p: Map<string, P3>, center: string | null) => {
    if (!graph) return DEFAULT_ZOOM
    const c = center && p.has(center) ? center : HUB
    const ring1 = new Set<string>()
    for (const e of graph.edges) {
      if (e.f === c) ring1.add(e.t)
      if (e.t === c) ring1.add(e.f)
    }
    const keep = new Set<string>([c, ...ring1])
    for (const e of graph.edges) {
      if (ring1.has(e.f)) keep.add(e.t)
      if (ring1.has(e.t)) keep.add(e.f)
    }
    const sub = new Map<string, P3>()
    for (const [id, q] of p) if (keep.has(id)) sub.set(id, q)
    return fitZoom(sub, W, H, 0.6, 2.2)
  }

  const switchLayout = (id: LayoutId) => {
    setLayout(id)
    setPan({ x: 0, y: 0 })
    // 평면 배치는 한 화면에 들어오는 줌으로 시작(층별 흐름은 전체, 선택 중심은 2단계 이웃까지). 3D는 기본 줌
    const def = LAYOUTS.find((l) => l.id === id)
    if (graph && id === "radial") setView((v) => ({ ...v, k: radialFit(layoutFor(id, graph, selectedId), selectedId) }))
    else if (graph && def?.flat) setView((v) => ({ ...v, k: fitZoom(layoutFor(id, graph, null), W, H) }))
    else setView((v) => ({ ...v, k: DEFAULT_ZOOM }))
  }

  // 평면 배치에서 노드 선택 → 그 노드가 중앙에 오도록 이동 애니메이션
  useEffect(() => {
    if (!flat || !selectedId) return
    const p = pos.get(selectedId)
    if (!p) return
    const k = layout === "radial" ? radialFit(pos, selectedId) : viewRef.current.k
    if (layout === "radial") setView((v) => ({ ...v, k }))
    const target = { x: -p.x * k, y: -p.y * k }
    const start = { ...panRef.current }
    const t0 = performance.now()
    const DUR = 450
    let raf = 0
    const step = (t: number) => {
      const q = Math.min(1, (t - t0) / DUR)
      const e = 1 - Math.pow(1 - q, 3)
      setPan({ x: start.x + (target.x - start.x) * e, y: start.y + (target.y - start.y) * e })
      if (q < 1) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [flat, layout, selectedId, pos])

  // 3D 배치에서 노드 선택 → 그 노드가 정면 중앙에 오도록 회전 애니메이션 (화면 밖·뒷면 노드 대응)
  useEffect(() => {
    if (flat || !selectedId) return
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
  }, [flat, selectedId, pos])

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

  // 자동 회전. 사용자가 조작하거나 노드를 보고 있을 때는 멈춘다. 움직임 줄이기 설정이면 아예 돌리지 않는다
  useEffect(() => {
    if (flat) return
    if (typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return
    const timer = setInterval(() => {
      if (interactedRef.current || selectedId || hoverId || dragRef.current) return
      setView((v) => ({ ...v, yaw: v.yaw + 0.0045 }))
    }, 40)
    return () => clearInterval(timer)
  }, [flat, selectedId, hoverId])

  const zoomBy = (f: number) => setView((v) => ({ ...v, k: clampZoom(v.k * f) }))

  // wheel 줌. passive 리스너로는 preventDefault가 안 먹어 native로 등록.
  // svg는 graph가 온 뒤에야 마운트되므로 graph를 의존성에 둔다 (빈 deps면 늦게 온 그래프에 휠이 안 붙는다)
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

  if (!graph) {
    return (
      <div className="flex h-full items-center justify-center text-base text-[var(--cp-text-dim)]">
        근거 그래프를 불러오는 중
      </div>
    )
  }

  // 선택 중심 배치는 고른 것이 없어도 허브 기준 에고 뷰(전체 라벨을 다 그리면 읽히지 않는다)
  const focus = hoverId ?? selectedId ?? (layout === "radial" ? HUB : null)
  const focusSet = focus ? (neighbors.get(focus) ?? new Set()) : null

  // 회전·투영 후 z 내림차순(뒤 → 앞) 렌더
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

  // 라벨 배치와 겹침 제거. 박스 추정은 렌더와 같은 폰트 공식(한글 폭 ≈ 폰트 크기).
  // 노드를 고르면(포커스) ① 무관한 노드 라벨은 아예 숨기고 ② 이웃 라벨은 포커스에서 바깥 방향(옆·위·아래)에 놓아 선과 안 겹치게 하며
  // ③ 이웃끼리도 충돌 검사(전에는 이웃을 무조건 그려 서로 덮였다) ④ 관계 라벨은 선의 58% 지점 옆에 두고 노드 라벨보다 뒤에 자리를 잡는다
  const focusP = focus ? byId.get(focus) : null
  type Slot = { tx: number; ty: number; anchor: "start" | "middle" | "end"; x: number; y: number; w: number; h: number }
  const slotsOf = new Map<string, Slot[]>()
  const labelCands: LabelCandAlt[] = [...projected].reverse().flatMap(({ n, x, y, z, s }) => {
    const isFocusNode = focus === n.id
    const fon = isFocusNode || (focusSet?.has(n.id) ?? false)
    if (focus && !fon) return []
    if (!labelVisible(z, view.k, fon)) return []
    const base = n.type === "KPI" || n.type === "Claim" ? 14 : n.type === "Lever" ? 12 : 10
    const nodeR = Math.max(3, base * s)
    const fs = isFocusNode ? 18 : flat ? 13.5 : 14.5 * Math.max(0.85, Math.min(1.3, s))
    const w = shortLabel(n.label, isFocusNode ? 34 : 20).length * fs * 0.92 + 8
    const h = fs + 6
    // 자리 후보: 위 · 아래 · 오른쪽 · 왼쪽. 포커스 이웃은 포커스에서 바깥쪽 자리를 먼저 시도한다
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
      // 선의 58% 지점에서 수직으로 9px 비켜 선 위에 글자가 앉지 않게
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
          e.currentTarget.setPointerCapture(e.pointerId) // 포인터가 svg 밖으로 나가도 드래그 유지
          dragRef.current = { sx: e.clientX, sy: e.clientY, yaw: view.yaw, pitch: view.pitch, px: pan.x, py: pan.y, moved: false }
        }}
        onPointerMove={(e) => {
          const d = dragRef.current
          if (!d) return
          const dx = e.clientX - d.sx
          const dy = e.clientY - d.sy
          if (Math.abs(dx) + Math.abs(dy) > 3) d.moved = true
          if (flat) {
            // 화면 px → viewBox 단위. svg는 xMidYMid meet라 폭 기준 한 배율
            const f = W / Math.max(1, e.currentTarget.clientWidth)
            setPan({ x: d.px + dx * f, y: d.py + dy * f })
            return
          }
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
        {/* 층별 흐름의 열 제목. 종류 색으로 */}
        {layout === "layers" &&
          layerColumns(graph).map((c) => (
            <text key={c.space} x={W / 2 + c.x * view.k + pan.x} y={22} textAnchor="middle" fontSize={14} fontWeight={700} fill={SPACE_COLOR[c.space] ?? "#64748b"}>
              {SPACE_KO[c.space] ?? c.space}
            </text>
          ))}
        {/* 엣지. 양 끝 평균 z로 깊이감 (앞쪽일수록 진하게) */}
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
              {active && labelSet.has(`e:${i}`) && edgeLabelPos.get(i) && (
                <text
                  x={edgeLabelPos.get(i)!.x}
                  y={edgeLabelPos.get(i)!.y}
                  textAnchor="middle"
                  fontSize={12.5}
                  fill="var(--cp-text-muted)"
                  style={{ paintOrder: "stroke", stroke: "var(--cp-bg)", strokeWidth: 3.5 }}
                >
                  {relLabel(e.rel)}
                </text>
              )}
            </g>
          )
        })}
        {/* 노드. 뒤에서 앞으로, 원근 스케일 반영 */}
        {projected.map(({ n, x, y, s }) => {
          const color = SPACE_COLOR[n.space] ?? "#64748b"
          const isFocus = focus === n.id
          const isNeighbor = focusSet?.has(n.id) ?? false
          const faded = focus !== null && !isFocus && !isNeighbor
          const base = n.type === "KPI" || n.type === "Claim" ? 14 : n.type === "Lever" ? 12 : 10
          const r = Math.max(3, base * s)
          const showLabel = labelSet.has(n.id)
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
                  x={placement.get(n.id)?.tx ?? 0}
                  y={placement.get(n.id)?.ty ?? -r - 5}
                  textAnchor={placement.get(n.id)?.anchor ?? "middle"}
                  fontSize={isFocus ? 18 : flat ? 13.5 : 14.5 * Math.max(0.85, Math.min(1.3, s))}
                  fontWeight={isFocus ? 700 : 500}
                  fill={faded ? "var(--cp-text-faint)" : "var(--cp-text-strong)"}
                  style={{ paintOrder: "stroke", stroke: "var(--cp-bg)", strokeWidth: 4.5 }}
                >
                  {shortLabel(n.label, isFocus ? 34 : 20)}
                </text>
              )}
            </g>
          )
        })}
      </svg>
      {/* 범례. 좁은 화면에선 그래프를 가려서 접어 두고 버튼으로 편다 */}
      <button
        type="button"
        onClick={() => setLegendOpen((o) => !o)}
        aria-expanded={legendOpen}
        className="absolute left-2 top-2 rounded-lg border border-[var(--cp-border)] bg-[var(--cp-overlay)] px-2.5 py-1 text-[13px] text-[var(--cp-text-muted)] backdrop-blur sm:hidden"
      >
        범례 {legendOpen ? "▾" : "▸"}
      </button>
      <div
        className={`pointer-events-none absolute left-2 top-2 flex flex-wrap gap-x-3 gap-y-1 rounded-lg border border-[var(--cp-border)] bg-[var(--cp-overlay)] px-3 py-2 text-[13px] text-[var(--cp-text-muted)] backdrop-blur max-sm:top-10 ${
          legendOpen ? "" : "max-sm:hidden"
        }`}
      >
        {Object.entries(SPACE_KO).map(([space, ko]) => (
          <span key={space} className="inline-flex items-center gap-1.5">
            <i className="h-2 w-2 rounded-full" style={{ background: SPACE_COLOR[space] }} />
            {ko}
          </span>
        ))}
      </div>
      {/* 배치 칩. 구면 하나면 "헤어볼"이라 심사 냉독에서 읽히지 않았다(14라운드) */}
      <div role="group" aria-label="배치" className="absolute right-2 top-2 flex max-w-[calc(100%-1rem)] flex-wrap items-center justify-end gap-1 rounded-lg border border-[var(--cp-border)] bg-[var(--cp-overlay)] px-2 py-1.5 backdrop-blur">
        <span className="mr-0.5 text-[12.5px] text-[var(--cp-text-dim)]">배치</span>
        {LAYOUTS.map((l) => (
          <button
            key={l.id}
            type="button"
            aria-pressed={layout === l.id}
            title={l.help}
            onClick={() => switchLayout(l.id)}
            className={`rounded-full border px-2.5 py-0.5 text-[13px] transition-colors ${
              layout === l.id ? "border-(--dump-accent) bg-(--dump-accent)/10 font-semibold text-(--dump-accent)" : "border-[var(--cp-border)] text-[var(--cp-text-muted)] hover:bg-[var(--cp-hover)]"
            }`}
          >
            {l.label}
          </button>
        ))}
      </div>
      {/* 확대·축소 버튼. 터치 기기엔 휠이 없다 */}
      <div className="absolute bottom-2 right-2 flex flex-col overflow-hidden rounded-lg border border-[var(--cp-border)] bg-[var(--cp-overlay)] backdrop-blur">
        <button type="button" onClick={() => zoomBy(1.28)} aria-label="확대" className="h-8 w-8 text-[16px] leading-none text-[var(--cp-text)] hover:bg-[var(--cp-hover)]">
          +
        </button>
        <button type="button" onClick={() => zoomBy(0.78)} aria-label="축소" className="h-8 w-8 border-t border-[var(--cp-border)] text-[16px] leading-none text-[var(--cp-text)] hover:bg-[var(--cp-hover)]">
          −
        </button>
      </div>
      <div className="pointer-events-none absolute bottom-2 left-2 max-w-[calc(100%-4rem)] rounded bg-[var(--cp-overlay)] px-2 py-1 text-[13px] text-[var(--cp-text-dim)]">
        지식 {graph.nodes.length}개 · 연결 {graph.edges.length}개 · {LAYOUTS.find((l) => l.id === layout)?.help}{" "}
        {flat ? (
          <>
            <span className="pointer-coarse:hidden">드래그로 이동, 휠로 확대,</span>
            <span className="pointer-fine:hidden">손가락으로 옮기고 +/−로 확대,</span> 동그라미를 누르면 상세
          </>
        ) : (
          <>
            <span className="pointer-coarse:hidden">드래그로 회전, 휠로 확대,</span>
            <span className="pointer-fine:hidden">손가락으로 돌리고 +/−로 확대,</span> 동그라미를 누르면 상세 (가만두면 천천히 자동 회전)
          </>
        )}
      </div>
    </div>
  )
}
