"use client"

import { useEffect, useMemo, useState } from "react"
import type { OntoGraph, ResourceId, SnowForecast, SnowMapData } from "@/lib/snow/types"
import { MOBILIZED, stageForSnow } from "@/lib/snow/stage"
import SnowMap from "./snow-map"
import OntoGraphView from "./onto-graph"
import StagePanel from "./stage-panel"
import ResourcePanel from "./resource-panel"
import OntoPanel from "./onto-panel"
import LawPanel from "./law-panel"
import { DEFAULT_VIEW, LayerPanel, Legend, type MapView } from "./map-controls"
import ThemeSwitch, { useTheme } from "@/components/dumping/theme"
import GlassDial from "@/components/dumping/glass-dial"
import LiquidGlass from "@/components/dumping/liquid-glass"
import LiquidTabs from "@/components/dumping/liquid-tabs"
import { useSplitPane } from "@/components/crowd/hooks/use-split-pane"
import { useSidebarWidth } from "@/components/dumping/use-sidebar-width"

// 제설 온톨로지 상황판(/snow). /dumping의 지도 전면 레이아웃(상단 띠·왼쪽 카드·오른쪽 열·모바일 시트)을 그대로 쓴다.
// 탭: 대응 단계(예보 → 단계 → 동원 자원 → 조례 시한) · 자원 현황(4종·동별·서울 비교) · 온톨로지(그래프·역량 질문·스키마) · 법령·책임

type Tab = "stage" | "resources" | "onto" | "law"
const TABS: { id: Tab; label: string }[] = [
  { id: "stage", label: "대응 단계" },
  { id: "resources", label: "자원 현황" },
  { id: "onto", label: "온톨로지" },
  { id: "law", label: "법령·책임" },
]
const TOP = "md:top-[76px]"
const RIGHT_W = 236
const SHEET_TOP_MOBILE = "44dvh"
// 자원 유형 id(graph Lever) → 지도 레이어 id
const LEVER_TO_LAYER: Record<string, ResourceId> = { "lev-heat": "heat", "lev-salt": "salt", "lev-cacl": "cacl", "lev-sand": "sand" }

function useBreakpoint(query: string): boolean {
  const [on, setOn] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia(query)
    const sync = () => setOn(mq.matches)
    sync()
    mq.addEventListener("change", sync)
    return () => mq.removeEventListener("change", sync)
  }, [query])
  return on
}

async function fetchJson<T>(url: string): Promise<T> {
  const r = await fetch(url)
  if (!r.ok) throw new Error(`${url} ${r.status}`)
  return r.json()
}

export default function SnowDashboard() {
  const [tab, setTab] = useState<Tab>("stage")
  const [data, setData] = useState<SnowMapData | null>(null)
  const [graph, setGraph] = useState<OntoGraph | null>(null)
  const [forecast, setForecast] = useState<SnowForecast | null | "error">(null)
  const [loadErr, setLoadErr] = useState(false)
  const [simCm, setSimCm] = useState(6)
  const [useForecast, setUseForecast] = useState(true)
  const [view, setView] = useState<MapView>(DEFAULT_VIEW)
  const [selectedDong, setSelectedDong] = useState<string | null>(null)
  const [selectedNode, setSelectedNode] = useState<string | null>(null)
  const [resetSeq, setResetSeq] = useState(0)
  const [mapCollapsed, setMapCollapsed] = useState(false)
  const [layersOpen, setLayersOpen] = useState(false)
  const split = useSplitPane()
  const side = useSidebarWidth()
  const theme = useTheme()
  const isMd = useBreakpoint("(min-width: 768px)")
  const isXl = useBreakpoint("(min-width: 1280px)")
  const [settled, setSettled] = useState(false)
  useEffect(() => {
    const t = window.setTimeout(() => setSettled(true), 1500)
    return () => window.clearTimeout(t)
  }, [])

  useEffect(() => {
    let alive = true
    Promise.all([fetchJson<SnowMapData>("/api/snow/data/map"), fetchJson<OntoGraph>("/api/snow/data/graph")])
      .then(([m, g]) => {
        if (!alive) return
        setData(m)
        setGraph(g)
      })
      .catch(() => alive && setLoadErr(true))
    fetchJson<SnowForecast>("/api/snow/forecast")
      .then((f) => alive && setForecast(f))
      .catch(() => alive && setForecast("error"))
    return () => {
      alive = false
    }
  }, [])

  // 단계 판정: 예보를 쓰면 24시간 적설, 아니면 슬라이더
  const fc = forecast && forecast !== "error" ? forecast : null
  const effectiveCm = useForecast && fc ? fc.snow24 : simCm
  const stage = stageForSnow(effectiveCm)
  // 지도 강조: 평시는 전부 보통. 단계가 서면 동원 자원만 진하게
  const emphasis = useMemo<ResourceId[] | null>(() => {
    if (stage.id === "calm") return null
    return MOBILIZED[stage.id].map((l) => LEVER_TO_LAYER[l]).filter((x): x is ResourceId => !!x)
  }, [stage.id])

  const resetAll = () => {
    setTab("stage")
    setView(DEFAULT_VIEW)
    setSelectedDong(null)
    setSelectedNode(null)
    setLayersOpen(false)
    setResetSeq((v) => v + 1)
  }
  const switchTab = (t: Tab) => {
    setTab(t)
    setLayersOpen(false)
  }

  const rightPane = tab === "onto" ? "graph" : "map"
  const sideW = side.width ?? 440
  const sheetTop = mapCollapsed ? "104px" : split.mapH != null ? `${split.mapH}px` : SHEET_TOP_MOBILE
  const fitPadding: { tl: [number, number]; br: [number, number] } = isMd
    ? { tl: [16 + sideW + 24, 76 + 8], br: [16 + RIGHT_W + 24, 24] }
    : { tl: [8, 104 + 8], br: [8, typeof window !== "undefined" ? Math.max(8, window.innerHeight * 0.56 + 8) : 8] }

  const layerPanel = <LayerPanel view={view} onChange={setView} emphasis={emphasis} />
  const legend = <Legend emphasis={emphasis} stageLabel={stage.label} />

  return (
    <div
      className={`crowd-page crowd-light dump-page snow-page relative h-dvh overflow-hidden bg-[var(--dump-ground)] tabular-nums text-[var(--cp-text)] ${settled ? "dump-anim-off" : ""} ${side.dragging ? "select-none" : ""}`}
      style={{ "--dump-side-w": side.width != null ? `${side.width}px` : undefined, "--dump-sheet-top": sheetTop } as React.CSSProperties}
    >
      <div className={`dumping-map absolute inset-0 ${side.dragging ? "pointer-events-none" : ""}`}>
        {rightPane === "map" ? (
          <SnowMap
            data={data}
            layers={view.layers}
            emphasis={emphasis}
            colMetric={view.colMetric}
            selectedDong={selectedDong}
            tilt={view.tilt}
            theme={theme}
            resetSeq={resetSeq}
            fitPadding={fitPadding}
            onSelectDong={(d) => setSelectedDong(d)}
          />
        ) : (
          <div className="absolute inset-x-0 bottom-[calc(100%-var(--dump-sheet-top))] top-[104px] md:bottom-0 md:left-[calc(32px+var(--dump-side-w,440px))] md:right-0 md:top-[76px]">
            <OntoGraphView graph={graph} selectedId={selectedNode} onSelect={setSelectedNode} />
          </div>
        )}
      </div>
      <div ref={split.mapBoxRef} aria-hidden className="pointer-events-none absolute inset-x-0 top-0 md:hidden" style={{ height: "var(--dump-sheet-top)" }} />

      {/* 상단 띠 */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-[1100] flex flex-col gap-2 p-3 md:p-4">
        <div className="flex items-center gap-2">
          <button onClick={resetAll} title="첫 화면으로" className="dump-fl lg-shell pointer-events-auto relative flex min-w-0 items-center gap-2.5 rounded-full py-1.5 pl-1.5 pr-4 text-left">
            <SnowMark size={30} />
            <span className="min-w-0">
              <h1 className="truncate text-[15px] font-extrabold leading-none tracking-[-0.015em] text-[var(--cp-text-strong)]">광진 제설 온톨로지</h1>
              <span className="dump-kicker mt-1 block truncate text-[9.5px] text-[var(--cp-text-dim)]">겨울철 제설대책 · 자원 {data ? data.heat.length + data.salt.length + data.cacl.length + data.sand.length : ""}지점 · {stage.label}</span>
            </span>
          </button>
          <div className="pointer-events-auto ml-auto flex shrink-0 items-center gap-2">
            {rightPane === "map" && (
              <button onClick={() => setLayersOpen((v) => !v)} aria-expanded={layersOpen} className={`dump-fl lg-shell relative rounded-full px-3.5 py-2 text-[13px] font-semibold md:hidden ${layersOpen ? "text-(--dump-accent)" : "text-[var(--cp-text-strong)]"}`}>
                레이어
              </button>
            )}
            {isMd && <GlassDial compact={!isXl} />}
            <ThemeSwitch compact={!isXl} />
          </div>
        </div>
        <LiquidTabs items={TABS} value={tab} onChange={switchTab} className="dump-fl lg-shell pointer-events-auto relative flex max-w-full gap-0.5 self-start overflow-x-auto rounded-full p-1 [scrollbar-width:none] md:absolute md:left-1/2 md:top-4 md:-translate-x-1/2" />
      </div>

      {loadErr && (
        <div role="alert" className="absolute left-1/2 top-[68px] z-[1200] -translate-x-1/2 rounded-full bg-red-50 px-4 py-2 text-[13px] text-red-700 shadow md:top-[80px]">
          데이터를 불러오지 못했습니다. 새로고침해 주세요.
        </div>
      )}

      {/* 왼쪽 카드 = 모바일 하단 시트 */}
      <aside className={`dump-fl lg-shell absolute inset-x-0 bottom-0 top-[var(--dump-sheet-top)] z-[1050] flex flex-col rounded-t-2xl p-[6px] md:inset-x-auto md:bottom-4 md:left-4 ${TOP} md:w-[var(--dump-side-w,440px)] md:rounded-2xl`}>
        <div className="lg-inner flex min-h-0 flex-1 flex-col overflow-hidden rounded-t-[11px] md:rounded-[11px]">
          <div className="flex h-8 shrink-0 items-center md:hidden">
            <div
              role="separator"
              aria-orientation="horizontal"
              aria-label="지도 크기 조절"
              onPointerDown={(e) => {
                setMapCollapsed(false)
                split.onSplitDown(e)
              }}
              onPointerMove={split.onSplitMove}
              onPointerUp={split.onSplitUp}
              onPointerCancel={split.onSplitUp}
              onDoubleClick={split.resetSplit}
              className="flex h-full min-w-0 flex-1 cursor-row-resize touch-none items-center justify-center"
            >
              <span className="dump-grip" />
            </div>
            {rightPane === "map" && (
              <button onClick={() => setMapCollapsed((v) => !v)} className="mr-3 shrink-0 rounded-full border border-[var(--cp-border)] px-2.5 py-0.5 text-[12px] font-semibold text-(--dump-accent)">
                {mapCollapsed ? "지도 펼치기" : "지도 접기"}
              </button>
            )}
          </div>
          <div key={tab} className="min-h-0 flex-1 overflow-y-auto [scrollbar-width:thin]">
            {tab === "stage" && <StagePanel data={data} graph={graph} forecast={forecast} simCm={simCm} onSimCm={setSimCm} stage={stage} useForecast={useForecast} onUseForecast={setUseForecast} />}
            {tab === "resources" && (
              <ResourcePanel
                data={data}
                colMetric={view.colMetric}
                onColMetric={(m) => setView((v) => ({ ...v, colMetric: m }))}
                selectedDong={selectedDong}
                onSelectDong={(d) => {
                  setSelectedDong(d)
                  setMapCollapsed(false)
                }}
              />
            )}
            {tab === "onto" && <OntoPanel graph={graph} selectedId={selectedNode} onSelect={setSelectedNode} />}
            {tab === "law" && <LawPanel data={data} />}
          </div>
          <div className="shrink-0 border-t border-[var(--cp-border)] px-3 py-2">
            <p className="text-[11.5px] leading-snug text-[var(--cp-text-faint)]">
              <span className="dump-kicker mr-1.5 text-[9.5px]">한계 고지</span>
              자원 위치는 공공데이터 4종(2022~2026 기준일 상이)이고, 열선 선형은 기점·종점 직선 근사입니다. 단계는 적설 예보만으로 판정하며 기상특보는 반영하지 않습니다.
            </p>
          </div>
        </div>
      </aside>

      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="카드 폭 조절"
        onPointerDown={side.onDown}
        onPointerMove={side.onMove}
        onPointerUp={side.onUp}
        onPointerCancel={side.onUp}
        onDoubleClick={side.reset}
        className={`group absolute bottom-4 ${TOP} z-[1060] hidden w-3 cursor-col-resize touch-none md:block`}
        style={{ left: "calc(16px + var(--dump-side-w, 440px) - 6px)" }}
      >
        <span className={`absolute left-1/2 top-1/2 h-10 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full transition-colors ${side.dragging ? "bg-(--dump-accent)" : "bg-[var(--cp-border-strong)] opacity-0 group-hover:opacity-100"}`} />
      </div>

      {rightPane === "map" && (
        <div className={`pointer-events-none absolute bottom-[140px] right-4 ${TOP} z-[1050] hidden flex-col gap-2.5 md:flex`} style={{ width: RIGHT_W }}>
          <div className="dump-fl lg-shell lg-dense pointer-events-auto relative rounded-2xl">{layerPanel}</div>
          <div className="dump-fl lg-shell lg-dense pointer-events-auto relative mt-auto rounded-2xl">{legend}</div>
        </div>
      )}

      {rightPane === "map" && layersOpen && (
        <div className="dump-fl lg-shell absolute inset-x-3 top-[104px] z-[1150] flex max-h-[calc(100%-120px)] flex-col overflow-hidden rounded-2xl md:hidden">
          <div className="flex shrink-0 items-center justify-between border-b border-[var(--cp-border)] px-3 py-2">
            <span className="text-[13.5px] font-bold text-[var(--cp-text-strong)]">지도 레이어</span>
            <button onClick={() => setLayersOpen(false)} aria-label="닫기" className="rounded-full px-2 py-0.5 text-[14px] text-[var(--cp-text-dim)]">✕</button>
          </div>
          <div className="min-h-0 overflow-y-auto p-1.5">
            {layerPanel}
            <div className="mt-2 rounded-xl border border-[var(--cp-border)]">{legend}</div>
          </div>
        </div>
      )}
      <LiquidGlass />
    </div>
  )
}

// 마크: 눈 결정 여섯 가지(획 하나짜리 기하). 액센트 색
function SnowMark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden className="shrink-0 rounded-full bg-[var(--dump-ink)] text-[var(--dump-paper)]">
      <g stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" fill="none">
        {[0, 60, 120].map((a) => (
          <g key={a} transform={`rotate(${a} 16 16)`}>
            <path d="M16 6v20M13 9.5 16 12l3-2.5M13 22.5 16 20l3 2.5" />
          </g>
        ))}
      </g>
    </svg>
  )
}
