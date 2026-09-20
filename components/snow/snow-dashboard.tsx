"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import type { LayerId, OntoGraph, SnowForecast, SnowMapData } from "@/lib/snow/types"
import { inSnowSeason, stageForSnow, type StageId } from "@/lib/snow/stage"
import { buildFindings, gapSummary, heatTopDongs, totals, type Finding } from "@/lib/snow/facts"
import SnowMap, { type CameraCue, type StageView } from "./snow-map"
import OntoGraphView from "./onto-graph"
import GapPanel from "./gap-panel"
import StagePanel from "./stage-panel"
import ResourcePanel from "./resource-panel"
import OntoPanel from "./onto-panel"
import LawPanel from "./law-panel"
import MethodsModal from "./methods-modal"
import { boundsOf, type ColMetric, dongBounds, heatPaths } from "./map-geo"
import { ALL_LAYERS, DEFAULT_VIEW, LayerPanel, Legend, type MapView } from "./map-controls"
import ThemeSwitch, { useTheme } from "@/components/dumping/theme"
import LiquidGlass from "@/components/dumping/liquid-glass"
import LiquidTabs from "@/components/dumping/liquid-tabs"
import { useSplitPane } from "@/components/crowd/hooks/use-split-pane"
import { useSidebarWidth } from "@/components/dumping/use-sidebar-width"

// 광진 제설 상황판(/snow). 첫 화면의 주장은 자원 목록이 아니라 공백: 취약구간 중 열선·자재 없는 곳, 열선 없는 동.
// 탭: 공백(결론·발견) · 대응 단계(예보·특보 › 단계 › 시한 › 동원) · 자원 현황(4종·동별 기둥·서울 비교) · 근거 그래프 · 법령·책임
// 다크(겨울 밤 상황실)가 기본. 라이트는 인쇄용 보조. 왼쪽 카드는 거의 불투명(.snow-page .lg-inner)

type Tab = "gap" | "stage" | "resources" | "onto" | "law"
const TABS: { id: Tab; label: string }[] = [
  { id: "gap", label: "공백" },
  { id: "stage", label: "대응 단계" },
  { id: "resources", label: "자원 현황" },
  { id: "onto", label: "근거 그래프" },
  { id: "law", label: "법령·책임" },
]
// 390px 폭에서 다섯 탭이 한 줄에 들어가게 짧은 이름
const TABS_SHORT: { id: Tab; label: string }[] = [
  { id: "gap", label: "공백" },
  { id: "stage", label: "단계" },
  { id: "resources", label: "자원" },
  { id: "onto", label: "근거" },
  { id: "law", label: "법령" },
]
const TOP = "md:top-[76px]"
const RIGHT_W = 236
const SHEET_TOP_MOBILE = "52dvh"

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

interface Scene {
  title: string
  caption: string
  note: string
  apply: () => void
}

export default function SnowDashboard() {
  const [tab, setTab] = useState<Tab>("gap")
  const [data, setData] = useState<SnowMapData | null>(null)
  const [graph, setGraph] = useState<OntoGraph | null>(null)
  const [forecast, setForecast] = useState<SnowForecast | null | "error">(null)
  const [loadErr, setLoadErr] = useState(false)
  const inSeason = useMemo(() => inSnowSeason(new Date()), [])
  const [simCm, setSimCm] = useState(5)
  const [useForecast, setUseForecast] = useState(inSeason)
  const [view, setView] = useState<MapView>(DEFAULT_VIEW)
  const [colMetric, setColMetric] = useState<ColMetric | null>(null)
  const [selectedDong, setSelectedDong] = useState<string | null>(null)
  const [selectedNode, setSelectedNode] = useState<string | null>(null)
  const [focusHeat, setFocusHeat] = useState<number[] | null>(null)
  const [focusLabel, setFocusLabel] = useState<string | null>(null) // 지도가 어디를 보고 있는지(구간·발견 카드 클릭 뒤) 지도 위 칩
  const [cameraCue, setCameraCue] = useState<CameraCue | null>(null)
  const [resetSeq, setResetSeq] = useState(0)
  const [mapCollapsed, setMapCollapsed] = useState(false)
  const [layersOpen, setLayersOpen] = useState(false)
  const [methods, setMethods] = useState(false)
  const [demo, setDemo] = useState<number | null>(null)
  const [demoStage, setDemoStage] = useState<StageId | null>(null)
  const [demoCaption, setDemoCaption] = useState<string | null>(null) // 장면 안에서 단계가 격상될 때 캡션도 같이 바뀐다
  const demoTimers = useRef<number[]>([])
  const split = useSplitPane()
  const side = useSidebarWidth()
  const theme = useTheme()
  const dark = theme === "dark"
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

  // 단계 판정: 대책기간 안에서 예보를 쓰면 24시간 적설 + 특보, 아니면 슬라이더
  const fc = forecast && forecast !== "error" ? forecast : null
  const effectiveCm = useForecast && fc ? fc.snow24 : simCm
  const stage = stageForSnow(effectiveCm, useForecast && fc ? (fc.warning?.level ?? "none") : "none")
  // 지도 단계 상태: 대응 단계 탭·시연에서만. 공백 탭은 단계 무관(자재 전부 점등)
  const stageView: StageView = demoStage ?? (tab === "stage" ? stage.id : null)
  const stageNote = stageView == null ? null : stageView === "calm" || stageView === "stage-0" ? "열선·살포기만 가동, 자재는 대기(흐림)" : stageView === "stage-1" ? "비치 자재 점등" : stageView === "stage-2" ? "제설함 확대(간선 살포)" : "열선 없는 동 외곽 강조"

  const cue = (c: Omit<CameraCue, "seq">) => setCameraCue((p) => ({ ...c, seq: (p?.seq ?? 0) + 1 }))
  const resetAll = () => {
    setTab("gap")
    setView(DEFAULT_VIEW)
    setColMetric(null)
    setSelectedDong(null)
    setSelectedNode(null)
    setFocusHeat(null)
    setFocusLabel(null)
    setLayersOpen(false)
    setResetSeq((v) => v + 1)
  }
  const switchTab = (t: Tab) => {
    setTab(t)
    setLayersOpen(false)
    if (t !== "resources") setColMetric(null)
    if (t === "resources" && colMetric == null) setColMetric("materials")
  }
  const onFinding = (f: Finding["focus"] | null, label?: string) => {
    if (!data || !f) return
    setFocusHeat(f.heat ?? null)
    setFocusLabel(label ?? null)
    if (f.layer) setView((v) => ({ ...v, layers: v.layers.includes(f.layer!) ? v.layers : [...v.layers, f.layer!] }))
    if (f.dong) {
      setSelectedDong(f.dong)
    } else {
      setSelectedDong(null)
      if (f.layer === "weak") {
        const b = boundsOf(data.weak.filter((w) => !w.heatCovered).map((w) => w.path))
        if (b) cue({ bounds: b, maxZoom: 15.2 })
      } else if (f.layer === "school") {
        const b = boundsOf(data.schools.filter((s) => !s.heatNear.length).map((s) => [[s.lat, s.lng]] as [number, number][]))
        if (b) cue({ bounds: b, maxZoom: 14.6 })
      } else if (f.layer === "slope") {
        const b = boundsOf(data.slopes.filter((s) => !s.heatIds.length).map((s) => s.coords))
        if (b) cue({ bounds: b, maxZoom: 14.8 })
      } else setResetSeq((v) => v + 1)
    }
    setMapCollapsed(false)
  }
  const onSegment = (heatIds: number[] | null, layer: "weak" | "ice", pathIdx?: [number, number][], label?: string) => {
    setFocusHeat(heatIds && heatIds.length ? heatIds : null)
    setFocusLabel(label ?? null)
    setSelectedDong(null)
    setView((v) => ({ ...v, layers: v.layers.includes(layer) ? v.layers : [...v.layers, layer] }))
    if (pathIdx) {
      const b = boundsOf([pathIdx])
      if (b) cue({ bounds: b, maxZoom: 16.2, pitch: 50 })
    }
    setMapCollapsed(false)
  }

  // ─── 시연 5장면(수치는 facts 파생) ───
  const scenes = useMemo<Scene[]>(() => {
    if (!data) return []
    const g = gapSummary(data)
    const t = totals(data)
    const top = heatTopDongs(data)
    const findings = buildFindings(data)
    const later = (ms: number, fn: () => void) => demoTimers.current.push(window.setTimeout(fn, ms))
    const noHeatWeak = data.weak.filter((w) => !w.heatCovered)
    return [
      {
        title: "공백",
        caption: `취약구간 ${g.total}곳 중 ${g.noHeat}곳에 ${data.gaps.heatNearM}m 안 열선이 없습니다. 그중 ${g.none}곳은 비치 자재도 없습니다.`,
        note: `행안부 적설취약구간 ${t.weak}곳 · 상습결빙구간 ${t.ice}곳 · 광진구 자원 4종 기준일 ${data.asof.sand.slice(0, 7)}부터 ${data.asof.cacl.slice(0, 7)}까지`,
        apply: () => {
          setTab("gap")
          setDemoStage(null)
          setFocusHeat(null)
          setSelectedDong(null)
          setColMetric(null)
          setView({ layers: ["weak", "ice", "heat"], tilt: true })
          const b = boundsOf(noHeatWeak.map((w) => w.path))
          cue({ bounds: b ?? undefined, maxZoom: 14.4, pitch: 55, bearing: -18, duration: 2200 })
        },
      },
      {
        title: "열선",
        caption: `열선 ${t.heatSeg}구간 중 ${top.reduce((s, d) => s + d.heatSeg, 0)}구간이 ${top.map((d) => d.d).join("·")}에 있습니다. 밤 지도에서 흐르는 선이 열선입니다.`,
        note: `서울시 집계 2026-05 · 1차로 기준 ${t.heatM.toLocaleString("ko-KR")}m · 2025년 설치 ${t.heat2025}구간`,
        apply: () => {
          setTab("resources")
          setDemoStage(null)
          setFocusHeat(null)
          setSelectedDong(null)
          setColMetric(null)
          setView({ layers: ["heat"], tilt: true })
          const b = boundsOf(heatPaths(data).filter((p) => p.length > 1))
          cue({ bounds: b ?? undefined, maxZoom: 14.9, pitch: 58, bearing: 12, duration: 2400 })
          later(2600, () => setColMetric("heat"))
        },
      },
      {
        title: "단계 격상",
        caption: `예보 적설 0.5cm이면 보강 단계입니다. 열선과 살포기만 가동하고 자재 ${t.materials.toLocaleString("ko-KR")}개소는 대기합니다.`,
        note: "서울시 기준(2026-02-01): 보강 1cm 미만 · 1단계 5cm 미만 · 2단계 5cm 이상 또는 대설주의보 · 3단계 10cm 이상 또는 대설경보",
        apply: () => {
          setTab("stage")
          setUseForecast(false)
          setSimCm(0.5)
          setDemoStage("stage-0")
          setDemoCaption(null)
          setFocusHeat(null)
          setSelectedDong(null)
          setColMetric(null)
          setView({ layers: ["heat", "salt", "cacl", "sand"], tilt: true })
          cue({ maxZoom: 13.6, pitch: 50, bearing: -18, duration: 1800 })
          later(2400, () => {
            setSimCm(3)
            setDemoStage("stage-1")
            setDemoCaption(`예보 적설 3cm이면 1단계입니다. 자원 6종을 동원하고 비치 자재 ${t.materials.toLocaleString("ko-KR")}개소가 켜집니다.`)
          })
          later(4800, () => {
            setSimCm(5)
            setDemoStage("stage-2")
            setDemoCaption(`예보 적설 5cm이면 2단계입니다. 자원 8종을 동원하고 간선도로 제설함 ${t.salt}개소를 확대 표시합니다.`)
          })
          later(7200, () => {
            setSimCm(12)
            setDemoStage("stage-3")
            setDemoCaption(`예보 적설 12cm이면 3단계입니다. 자원 9종을 총동원하고 열선 없는 동 ${g.noHeatDongs.length}곳 경계를 강조합니다.`)
          })
        },
      },
      {
        title: "열선 없는 동",
        caption: `${g.noHeatDongs.join("·")} ${g.noHeatDongs.length}곳은 열선 없이 비치 자재와 인력으로 첫 결빙에 대응합니다.`,
        note: `이 동들의 비치 자재 ${data.dongs.filter((d) => g.noHeatDongs.includes(d.d)).reduce((s, d) => s + d.salt + d.cacl + d.sand, 0)}개소 · 적설취약구간 ${data.dongs.filter((d) => g.noHeatDongs.includes(d.d)).reduce((s, d) => s + d.weak, 0)}곳`,
        apply: () => {
          setTab("resources")
          setDemoStage("stage-3")
          setFocusHeat(null)
          setSelectedDong(null)
          setColMetric("materials")
          setView({ layers: ["heat", "salt", "cacl", "sand", "weak"], tilt: true })
          const b = boundsOf(g.noHeatDongs.map((d) => dongBounds(data, d)).filter((x): x is NonNullable<typeof x> => !!x).map((b) => [[b[0][1], b[0][0]], [b[1][1], b[1][0]]] as [number, number][]))
          cue({ bounds: b ?? undefined, maxZoom: 14.6, pitch: 55, bearing: 24, duration: 2400 })
        },
      },
      {
        title: "조례 시한",
        caption: "눈이 14시에 그치면 건축물관리자는 18시까지 보도와 이면도로를 치워야 합니다. 조례 제5조입니다.",
        note: `${findings.find((f) => f.id === "f-update")?.title ?? ""} 근거 그래프 판단 ${graph?.nodes.filter((n) => n.type === "Claim").length ?? 0}개가 관측에 연결돼 있습니다.`,
        apply: () => {
          setTab("law")
          setDemoStage(null)
          setColMetric(null)
          setFocusHeat(null)
          setSelectedDong(null)
          setView({ layers: ["heat", "weak"], tilt: true })
          cue({ maxZoom: 13.4, pitch: 40, bearing: -18, duration: 2000 })
        },
      },
    ]
  }, [data, graph])

  useEffect(() => {
    if (demo === null || !scenes[demo]) return
    for (const t of demoTimers.current) window.clearTimeout(t)
    demoTimers.current = []
    setDemoCaption(null)
    scenes[demo].apply()
    return () => {
      for (const t of demoTimers.current) window.clearTimeout(t)
      demoTimers.current = []
    }
  }, [demo])
  const endDemo = () => {
    setDemo(null)
    setDemoStage(null)
    setDemoCaption(null)
    setUseForecast(inSeason)
    setSimCm(5)
    resetAll()
  }
  useEffect(() => {
    if (demo === null) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") endDemo()
      else if (e.key === "ArrowRight" || e.key === " ") {
        e.preventDefault()
        setDemo((d) => (d === null ? d : Math.min(scenes.length - 1, d + 1)))
      } else if (e.key === "ArrowLeft") setDemo((d) => (d === null ? d : Math.max(0, d - 1)))
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [demo, scenes.length])

  const rightPane = tab === "onto" ? "graph" : "map"
  const sideW = side.width ?? 440
  const sheetTop = mapCollapsed ? "104px" : split.mapH != null ? `${split.mapH}px` : SHEET_TOP_MOBILE
  const fitPadding: { tl: [number, number]; br: [number, number] } = isMd
    ? { tl: [16 + sideW + 24, 76 + 8], br: [16 + RIGHT_W + 24, 24] }
    : { tl: [8, 104 + 8], br: [8, typeof window !== "undefined" ? Math.max(8, window.innerHeight * 0.48 + 8) : 8] }
  const counts: Partial<Record<LayerId, string>> = data
    ? { weak: `${data.weak.length}곳`, ice: `${data.ice.length}곳`, slope: `${data.slopes.length}구간`, school: `${data.schools.length}교`, heat: `${data.heat.length}구간`, salt: `${data.salt.length}`, cacl: `${data.cacl.length}`, sand: `${data.sand.length}` }
    : {}
  const layerPanel = <LayerPanel view={view} onChange={setView} dark={dark} counts={counts} />
  const legend = <Legend dark={dark} stageLabel={stageView ? (stageView === "calm" ? "평시" : stageView === "stage-0" ? "보강" : stageView.replace("stage-", "") + "단계") : ""} stageNote={stageNote} />

  return (
    <div
      className={`crowd-page crowd-light dump-page snow-page relative h-dvh overflow-hidden bg-[var(--dump-ground)] tabular-nums text-[var(--cp-text)] ${settled ? "dump-anim-off" : ""} ${side.dragging ? "select-none" : ""}`}
      style={{ "--dump-side-w": side.width != null ? `${side.width}px` : undefined, "--dump-sheet-top": sheetTop } as React.CSSProperties}
    >
      <div className={`dumping-map absolute inset-0 ${side.dragging ? "pointer-events-none" : ""}`}>
        {rightPane === "map" ? (
          <SnowMap
            data={data}
            layers={view.layers.filter((l) => ALL_LAYERS.includes(l))}
            stageView={stageView}
            colMetric={colMetric}
            selectedDong={selectedDong}
            focusHeat={focusHeat}
            tilt={view.tilt}
            theme={theme}
            resetSeq={resetSeq}
            cameraCue={cameraCue}
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
              <h1 className="truncate text-[15px] font-extrabold leading-none tracking-[-0.015em] text-[var(--cp-text-strong)]">{isMd ? "광진 제설 상황판" : "광진 제설"}</h1>
              <span className="dump-kicker mt-1 block truncate text-[10px] text-[var(--cp-text-dim)]">{data ? `열선 ${data.heat.length}구간 · 자재 ${(data.salt.length + data.cacl.length + data.sand.length).toLocaleString("ko-KR")}개소 · 취약구간 ${data.weak.length + data.ice.length}곳` : "겨울철 제설대책"}</span>
            </span>
          </button>
          <div className="pointer-events-auto ml-auto flex shrink-0 items-center gap-2">
            {rightPane === "map" && (
              <button onClick={() => setLayersOpen((v) => !v)} aria-expanded={layersOpen} className={`dump-fl lg-shell relative rounded-full px-3.5 py-2 text-[13px] font-semibold md:hidden ${layersOpen ? "text-(--dump-accent)" : "text-[var(--cp-text-strong)]"}`}>
                레이어
              </button>
            )}
            {isXl && data && (
              <button onClick={() => (demo === null ? setDemo(0) : endDemo())} aria-pressed={demo !== null} className={`dump-fl lg-shell relative rounded-full px-3.5 py-2 text-[13px] font-semibold ${demo !== null ? "text-(--dump-accent)" : "text-[var(--cp-text-strong)]"}`}>
                {demo !== null ? "시연 끝" : "시연"}
              </button>
            )}
            {data && (
              <button onClick={() => setMethods(true)} className="dump-fl lg-shell relative rounded-full px-3.5 py-2 text-[13px] font-semibold text-[var(--cp-text-strong)]">
                데이터·방법
              </button>
            )}
            <ThemeSwitch compact={!isXl} />
          </div>
        </div>
        <LiquidTabs items={isMd ? TABS : TABS_SHORT} value={tab} onChange={switchTab} className="dump-fl lg-shell pointer-events-auto relative flex max-w-full gap-0.5 self-start overflow-x-auto rounded-full p-1 [scrollbar-width:none] md:absolute md:left-1/2 md:top-4 md:-translate-x-1/2" />
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
            {tab === "gap" && <GapPanel data={data} onFocus={onFinding} onSelectSegment={onSegment} onOpenMethods={() => setMethods(true)} />}
            {tab === "stage" && <StagePanel data={data} graph={graph} forecast={forecast} simCm={simCm} onSimCm={setSimCm} stage={stage} useForecast={useForecast} onUseForecast={setUseForecast} inSeason={inSeason} />}
            {tab === "resources" && (
              <ResourcePanel
                data={data}
                dark={dark}
                colMetric={colMetric}
                onColMetric={setColMetric}
                selectedDong={selectedDong}
                onSelectDong={(d) => {
                  setSelectedDong(d)
                  setMapCollapsed(false)
                }}
              />
            )}
            {tab === "onto" && <OntoPanel graph={graph} selectedId={selectedNode} onSelect={setSelectedNode} onOpenMethods={() => setMethods(true)} />}
            {tab === "law" && <LawPanel data={data} />}
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

      {/* 지도가 보고 있는 곳(구간·발견 카드 클릭 뒤). 누르면 구 전체로 */}
      {rightPane === "map" && (focusLabel || selectedDong) && demo === null && (
        <button
          onClick={() => {
            setFocusLabel(null)
            setFocusHeat(null)
            setSelectedDong(null)
            setResetSeq((v) => v + 1)
          }}
          className="dump-fl lg-shell lg-dense absolute z-[1046] flex items-center gap-2 rounded-full px-3.5 py-1.5 text-[13px] text-[var(--cp-text-strong)] md:top-[76px]"
          style={{ left: isMd ? "calc(16px + var(--dump-side-w, 440px) + 16px)" : 12, top: isMd ? undefined : 108 }}
        >
          <span className="dump-kicker text-[10px] text-[var(--cp-text-dim)]">지금 보는 곳</span>
          <span className="font-semibold">{focusLabel ?? selectedDong}</span>
          <span aria-hidden className="text-[var(--cp-text-dim)]">✕</span>
        </button>
      )}
      {rightPane === "map" && (
        <div className={`pointer-events-none absolute bottom-[140px] right-4 ${TOP} z-[1050] hidden flex-col gap-2.5 md:flex`} style={{ width: RIGHT_W }}>
          <div className="dump-fl lg-shell lg-dense pointer-events-auto relative rounded-2xl">{layerPanel}</div>
          <div className="dump-fl lg-shell lg-dense pointer-events-auto relative mt-auto rounded-2xl">{legend}</div>
        </div>
      )}

      {/* 시연 캡션(xl 이상) */}
      {rightPane === "map" && demo !== null && scenes[demo] && (
        <div className="dump-fl lg-shell lg-dense absolute z-[1045] hidden rounded-2xl xl:block" style={{ left: "calc(16px + var(--dump-side-w, 440px) + 16px)", right: RIGHT_W + 32, bottom: 20 }} aria-live="polite">
          <div className="flex items-start gap-4 px-5 py-3.5">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="dump-kicker text-[10.5px] text-[var(--cp-text-dim)]">
                  시연 {demo + 1} / {scenes.length} · {scenes[demo].title}
                </span>
                <span className="flex items-center gap-1" aria-hidden>
                  {scenes.map((_, k) => (
                    <i key={k} className={`h-1.5 rounded-full transition-all ${k === demo ? "w-4 bg-(--dump-accent)" : k < demo ? "w-1.5 bg-(--dump-accent)/55" : "w-1.5 bg-[var(--cp-border-strong)]"}`} />
                  ))}
                </span>
              </div>
              <p className="dump-headline mt-1 text-[19px] leading-[1.4] text-[var(--cp-text-strong)]">{demoCaption ?? scenes[demo].caption}</p>
              <p className="mt-1 text-[13px] leading-snug text-[var(--cp-text-dim)]">{scenes[demo].note}</p>
            </div>
            <div className="flex shrink-0 items-center gap-1 pt-1">
              <button onClick={() => setDemo(Math.max(0, demo - 1))} disabled={demo === 0} aria-label="이전 장면" className="h-8 w-8 rounded-full border border-[var(--cp-border)] text-[15px] text-[var(--cp-text-muted)] hover:bg-[var(--cp-hover)] disabled:opacity-35">
                ‹
              </button>
              <button onClick={() => setDemo(Math.min(scenes.length - 1, demo + 1))} disabled={demo === scenes.length - 1} aria-label="다음 장면" className="h-8 w-8 rounded-full border border-[var(--cp-border)] text-[15px] text-[var(--cp-text-muted)] hover:bg-[var(--cp-hover)] disabled:opacity-35">
                ›
              </button>
              <button onClick={endDemo} className="ml-1 h-8 rounded-full border border-[var(--cp-border)] px-3 text-[12.5px] font-semibold text-[var(--cp-text-muted)] hover:bg-[var(--cp-hover)]">
                끝
              </button>
            </div>
          </div>
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
      {methods && data && <MethodsModal data={data} graph={graph} onClose={() => setMethods(false)} />}
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
