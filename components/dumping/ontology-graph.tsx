"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import type { OntoGraph } from "@/lib/dumping/types"
import { relLabel } from "@/lib/dumping/labels"
import { DEFAULT_ZOOM, declutterLabels, labelVisible, projScale } from "./onto-view"
import { fitZoom, LAYOUTS, layerColumns, layoutFor, type LayoutId, type P3 } from "./onto-layouts"

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

  const switchLayout = (id: LayoutId) => {
    setLayout(id)
    setPan({ x: 0, y: 0 })
    // 평면 배치는 전체가 한 화면에 들어오는 줌으로 시작(층별 흐름은 폭이 넓다). 3D는 기본 줌
    const def = LAYOUTS.find((l) => l.id === id)
    if (graph && def?.flat) setView((v) => ({ ...v, k: fitZoom(layoutFor(id, graph, id === "radial" ? selectedId : null), W, H) }))
    else setView((v) => ({ ...v, k: DEFAULT_ZOOM }))
  }

  // 평면 배치에서 노드 선택 → 그 노드가 중앙에 오도록 이동 애니메이션
  useEffect(() => {
    if (!flat || !selectedId) return
    const p = pos.get(selectedId)
    if (!p) return
    const k = viewRef.current.k
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
  }, [flat, selectedId, pos])

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
      const r = flat ? p : rotate(p, view.yaw, view.pitch)
      const s = projScale(r.z, view.k)
      return { n, x: W / 2 + r.x * s + (flat ? pan.x : 0), y: H / 2 + r.y * s + (flat ? pan.y : 0), z: r.z, s }
    })
    .filter((p): p is NonNullable<typeof p> => p !== null)
    .sort((a, b) => b.z - a.z)
  const byId = new Map(projected.map((p) => [p.n.id, p]))

  // 라벨 겹침 제거. 앞쪽(z 작은) 노드부터 자리 선점, 포커스·이웃은 무조건 유지.
  // 박스 추정은 렌더와 같은 폰트 공식(한글 폭 ≈ 폰트 크기)으로 한다.
  const labelSet = declutterLabels(
    [...projected].reverse().flatMap(({ n, x, y, z, s }) => {
      const fon = focus === n.id || (focusSet?.has(n.id) ?? false)
      if (!labelVisible(z, view.k, fon)) return []
      const base = n.type === "KPI" || n.type === "Claim" ? 14 : n.type === "Lever" ? 12 : 10
      const nodeR = Math.max(3, base * s)
      const fs = flat ? 13.5 : 14.5 * Math.max(0.85, Math.min(1.3, s))
      return [{
        id: n.id,
        x,
        y: y - nodeR - 5 - fs / 2,
        w: shortLabel(n.label).length * fs * 0.92 + 8,
        h: fs + 8,
        keep: fon,
      }]
    }),
  )

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
                  y={-r - 5}
                  textAnchor="middle"
                  fontSize={isFocus ? 18 : flat ? 13.5 : 14.5 * Math.max(0.85, Math.min(1.3, s))}
                  fontWeight={isFocus ? 700 : 500}
                  fill={faded ? "var(--cp-text-faint)" : "var(--cp-text-strong)"}
                  style={{ paintOrder: "stroke", stroke: "var(--cp-bg)", strokeWidth: 4.5 }}
                >
                  {shortLabel(n.label)}
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
              layout === l.id ? "border-[#0c6155] bg-[#0c6155]/10 font-semibold text-[#0c6155]" : "border-[var(--cp-border)] text-[var(--cp-text-muted)] hover:bg-[var(--cp-hover)]"
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
