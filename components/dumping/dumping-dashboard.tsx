"use client"

import { useCallback, useEffect, useState } from "react"
import type { DumpingMapData, InterventionEntry, OntoGraph, VizAction } from "@/lib/dumping/types"
import DumpingMap, { type CandidateFocus } from "./dumping-map"
import { CandidateList, DEFAULT_VIEW, MapLayerPanel, MapLegend, MODE_MAP, type MapView } from "./map-controls"
import LoginGate from "./login-gate"
import OntologyGraph from "./ontology-graph"
import FindingsPanel from "./findings-panel"
import FindingModal from "./finding-modal"
import type { Finding } from "./findings-data"
import OntoPanel from "./onto-panel"
import OpsPanel from "./ops-panel"
import PolicyBoard from "./policy-board"
import BriefingModal from "./briefing-modal"
import MethodsModal, { type MethodsSection } from "./methods-modal"
import QaChat from "./qa-chat"
import TimelineStrip from "./timeline-strip"
import ThemeSwitch, { useTheme } from "./theme"
import { vizForLever, type LeverView } from "./lever-view"
import { useSplitPane } from "@/components/crowd/hooks/use-split-pane"
import { useSidebarWidth } from "./use-sidebar-width"
import DumpMark from "./dump-mark"

type Tab = "policy" | "qa" | "findings" | "ops" | "onto"
type AuthState = "checking" | "locked" | "open"
type LoadState = "loading" | "ready" | "error"

// 정책 제안이 첫 화면. 분석의 결론이자 행정이 바로 검토할 대목이다.
// 지식그래프 원자료를 훑는 근거 그래프는 맨 끝. 정책 판단에 먼저 필요한 화면이 아니다.
const TABS: { id: Tab; label: string }[] = [
  { id: "policy", label: "정책 제안" },
  { id: "qa", label: "물어보기" },
  { id: "findings", label: "발견" },
  { id: "ops", label: "운영·전망" },
  { id: "onto", label: "근거 그래프" },
]

const DATA_URL = (name: "map" | "graph" | "interventions" | "bin-recos") => `/api/dumping/data/${name}`

async function fetchJson<T>(url: string): Promise<T> {
  const r = await fetch(url)
  if (!r.ok) throw new Error(`${url} ${r.status}`)
  return r.json()
}

// 지도 전면 디자인(2026-09-18). 지도(또는 근거 그래프)가 화면 전체를 채우고 그 위에 유리 패널이 뜬다:
// 상단 띠(마크·탭·데이터·방법), 왼쪽 카드(탭 내용, 폭 드래그), 오른쪽 열(레이어·후보 목록·범례), 아래 띠(월별 민원, xl 이상).
// 모바일은 왼쪽 카드가 하단 시트가 된다(손잡이 드래그·지도 접기). 레이어·범례는 "레이어" 버튼으로 여는 덮개 패널
const TOP = "md:top-[76px]" // 상단 띠 아래 카드·열이 시작하는 높이
const RIGHT_W = 236 // 오른쪽 열 폭(px)
const SHEET_TOP_MOBILE = "44dvh" // 모바일 시트 기본 시작 높이

// 화면 폭 단계. 지도 맞춤 여백(카드·열이 가리는 만큼)을 계산하는 데만 쓴다
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

export default function DumpingDashboard() {
  const [auth, setAuth] = useState<AuthState>("checking")
  const [tab, setTab] = useState<Tab>("policy")
  const [mapData, setMapData] = useState<DumpingMapData | null>(null)
  const [graph, setGraph] = useState<OntoGraph | null>(null)
  const [interventions, setInterventions] = useState<InterventionEntry[] | null>(null)
  const [load, setLoad] = useState<LoadState>("loading")
  const [loadSeq, setLoadSeq] = useState(0) // 재시도 트리거
  const [briefingDong, setBriefingDong] = useState<string | null>(null)
  const [showCritical, setShowCritical] = useState(false) // 집중관리 상습격자 지도 강조
  const [showMethods, setShowMethods] = useState(false) // 분석 방법 안내 모달
  const [methodsSection, setMethodsSection] = useState<MethodsSection>("data") // 정책 탭 근거 경로가 지정한 섹션
  const [view, setView] = useState<MapView>(DEFAULT_VIEW)
  const [selectedDong, setSelectedDong] = useState<string | null>(null)
  const [selectedNode, setSelectedNode] = useState<string | null>(null)
  const [openFinding, setOpenFinding] = useState<Finding | null>(null)
  const [activeFinding, setActiveFinding] = useState<Finding | null>(null) // 지도에 반영 중인 발견
  const [activeLever, setActiveLever] = useState<LeverView | null>(null) // 지도에 반영 중인 정책 수단
  const [focusCandidate, setFocusCandidate] = useState<CandidateFocus | null>(null)
  const [resetSeq, setResetSeq] = useState(0)
  const split = useSplitPane() // 모바일: 시트 손잡이 드래그로 지도 높이(=시트 시작 높이) 조절
  const side = useSidebarWidth() // 데스크톱: 카드 폭. 경계선 드래그
  // 모바일 지도 접기. 시트가 상단 띠 바로 아래까지 올라온다. 지도를 바꾸는 동작(viz·핫스팟·상습격자)이 오면 다시 편다
  const [mapCollapsed, setMapCollapsed] = useState(false)
  const [layersOpen, setLayersOpen] = useState(false) // 모바일 레이어 덮개
  const theme = useTheme()
  const isMd = useBreakpoint("(min-width: 768px)")
  const isXl = useBreakpoint("(min-width: 1280px)")
  // 등장 애니메이션은 첫 진입 한 번만. 탭을 오갈 때마다 다시 떠오르면 반복 열람에 피로하다
  const [settled, setSettled] = useState(false)
  useEffect(() => {
    const t = window.setTimeout(() => setSettled(true), 1500)
    return () => window.clearTimeout(t)
  }, [])

  const clearActive = () => {
    setActiveFinding(null)
    setActiveLever(null)
  }

  // 좌상단 마크 클릭 → 첫 화면 상태로 초기화
  const resetAll = () => {
    setTab("policy")
    setView(DEFAULT_VIEW)
    setSelectedDong(null)
    setSelectedNode(null)
    setOpenFinding(null)
    clearActive()
    setFocusCandidate(null)
    setBriefingDong(null)
    setShowCritical(false)
    setShowMethods(false)
    setMethodsSection("data")
    setLayersOpen(false)
    setResetSeq((v) => v + 1)
  }

  const openMethods = (section: MethodsSection) => {
    setMethodsSection(section)
    setShowMethods(true)
  }

  // 탭을 옮기면 목록 클릭으로 찍은 펄스 라벨은 의미를 잃는다 (핫스팟 순위는 운영 탭에서만 보인다)
  const switchTab = (t: Tab) => {
    setTab(t)
    setFocusCandidate(null)
    setLayersOpen(false)
  }

  useEffect(() => {
    fetch("/api/dumping/auth")
      .then((r) => r.json())
      .then((d) => setAuth(d?.ok ? "open" : "locked"))
      .catch(() => setAuth("locked"))
  }, [])

  useEffect(() => {
    if (auth !== "open") return
    let alive = true
    setLoad("loading")
    Promise.all([
      fetchJson<DumpingMapData>(DATA_URL("map")),
      fetchJson<OntoGraph>(DATA_URL("graph")),
      // 조치 대장은 없어도 화면이 선다. 실패는 null(미확보)로만 표시
      fetchJson<{ entries?: InterventionEntry[] } | null>(DATA_URL("interventions")).catch(() => null),
      // 배치추천은 인증 라우트로만 받는다(클라이언트 번들에 평문으로 실리지 않게). 없어도 화면이 선다
      fetchJson<DumpingMapData["binRecos"]>(DATA_URL("bin-recos")).catch(() => undefined),
    ])
      .then(([map, g, iv, br]) => {
        if (!alive) return
        setMapData(br ? { ...map, binRecos: br } : map)
        setGraph(g)
        // 예시 항목(registeredAt 빈값)은 목록에서 제외. 스키마 안내용으로만 파일에 남는다
        setInterventions(iv ? (iv.entries ?? []).filter((e) => e.registeredAt) : null)
        setLoad("ready")
      })
      .catch(() => {
        if (alive) setLoad("error")
      })
    return () => {
      alive = false
    }
  }, [auth, loadSeq])

  // 자동 회전 중 지도를 만지면 회전을 끈다(지도가 부른다). 다른 상태는 건드리지 않는다. 로그인 게이트 분기보다 위(훅 순서)
  const stopOrbit = useCallback(() => setView((v) => (v.orbit || v.fly ? { ...v, orbit: false, fly: false } : v)), [])
  const applyViz = useCallback((viz: VizAction) => {
    setView((v) => ({
      ...v,
      ...(viz.mode ? MODE_MAP[viz.mode] : {}),
      ...(viz.layers ? { layers: viz.layers } : {}),
      ...(viz.candidates !== undefined ? { candidates: viz.candidates } : {}),
      ...(viz.binRecos !== undefined ? { binRecos: viz.binRecos } : {}),
      ...(viz.routes !== undefined ? { routes: viz.routes } : {}),
      // 날씨별 원은 바탕을 바꾸는 viz가 오면 끈다(둘이 겹치면 무슨 원인지 안 읽힌다). 명시하면 그대로
      ...(viz.weather !== undefined ? { weather: viz.weather } : viz.mode ? { weather: null } : {}),
      ...(viz.grid3d !== undefined ? { grid3d: viz.grid3d } : {}),
      // 기둥 높이는 기울여야 보인다(16라운드). 기둥을 켜는 viz는 입체 보기도 켠다
      ...(viz.grid3d ? { tilt: true } : {}),
    }))
    // 동이 선택된 채로 두면 격자가 그 동만 남고 줌도 안 풀려 "반영이 무시된 것처럼" 보인다
    // 그래서 viz가 동을 명시하지 않으면 선택을 해제하고 구 전체 뷰로 복귀
    setSelectedDong(viz.dong !== undefined ? viz.dong : null)
    setMapCollapsed(false) // 지도를 바꾸라는 뜻이니 모바일에서 접혀 있던 지도를 편다
  }, [])

  // 답변·칩이 지도를 바꾸면 이전 "반영 중" 배지는 사실이 아니다
  const applyVizFromQa = useCallback(
    (viz: VizAction) => {
      applyViz(viz)
      clearActive()
    },
    [applyViz],
  )

  // 정책 제안 모달에서 "지도에서 보기". 겨냥 지표가 가장 높은 동은 실측값에서 고른다
  const applyLeverViz = useCallback(
    (lv: LeverView) => {
      const viz = vizForLever(lv)
      if (!viz) return
      let dong: string | null = null
      if (viz.dongBy && mapData) {
        const top = [...mapData.dong].sort((a, b) => b[viz.dongBy!] - a[viz.dongBy!])[0]
        dong = top?.d ?? null
      }
      applyViz({
        mode: viz.mode,
        layers: viz.layers ?? [],
        candidates: viz.candidates ?? false,
        binRecos: false, // 정책 수단은 이 레이어를 겨냥하지 않는다. 이전 선택이 남지 않게 끈다
        routes: viz.routes ?? false,
        dong,
      })
      setActiveLever(lv)
      setActiveFinding(null)
    },
    [mapData, applyViz],
  )

  if (auth !== "open") {
    return <LoginGate checking={auth === "checking"} onOpen={() => setAuth("open")} />
  }

  const rightPane = tab === "onto" ? "graph" : "map"
  const active = activeLever
    ? { label: activeLever.node.label.split("(")[0].trim(), onClear: () => setActiveLever(null) }
    : activeFinding
      ? { label: activeFinding.title, onClear: () => setActiveFinding(null) }
      : null
  const onLayerChange = (next: MapView) => {
    setView(next)
    clearActive()
    setMapCollapsed(false)
  }
  // 모바일 시트 시작 높이 = 보이는 지도 높이. 접힘이면 상단 띠 바로 아래
  const sheetTop = mapCollapsed ? "104px" : split.mapH != null ? `${split.mapH}px` : SHEET_TOP_MOBILE
  // 구 전체 맞춤 여백. 데스크톱은 왼쪽 카드·오른쪽 열·(xl) 아래 띠가 가리는 만큼, 모바일은 상단 띠와 시트가 가리는 만큼
  const sideW = side.width ?? 440
  const fitPadding: { tl: [number, number]; br: [number, number] } = isMd
    ? { tl: [16 + sideW + 24, 76 + 8], br: [16 + RIGHT_W + 24, isXl ? 16 + 96 : 24] }
    : { tl: [8, 104 + 8], br: [8, typeof window !== "undefined" ? Math.max(8, window.innerHeight * 0.56 + 8) : 8] }

  const layerPanel = mapData ? <MapLayerPanel key={resetSeq} data={mapData} view={view} onChange={onLayerChange} active={active} /> : null
  const legend = <MapLegend data={mapData} view={view} selectedDong={selectedDong} />
  const candidates =
    view.candidates && mapData ? (
      <CandidateList
        data={mapData}
        onFocusCandidate={(f) => {
          setFocusCandidate(f)
          setLayersOpen(false)
          setMapCollapsed(false)
        }}
      />
    ) : null

  return (
    <div
      className={`crowd-page crowd-light dump-page relative h-dvh overflow-hidden bg-[var(--dump-ground)] tabular-nums text-[var(--cp-text)] ${
        settled ? "dump-anim-off" : ""
      } ${side.dragging ? "select-none" : ""}`}
      style={
        {
          "--dump-side-w": side.width != null ? `${side.width}px` : undefined,
          "--dump-sheet-top": sheetTop,
        } as React.CSSProperties
      }
    >
      {/* 전면: 지도 또는 근거 그래프. 유리 패널 뒤로 끝까지 깔린다 */}
      <div className={`absolute inset-0 ${side.dragging ? "pointer-events-none" : ""}`}>
        {rightPane === "map" ? (
          <DumpingMap
            data={mapData}
            base={view.base}
            circles={view.circles}
            selectedDong={selectedDong}
            layers={view.layers}
            showCandidates={view.candidates}
            showBinRecos={view.binRecos}
            showHotspots={tab === "ops"}
            showCritical={showCritical && (tab === "ops" || tab === "policy")}
            focusCandidate={focusCandidate}
            showRoutes={view.routes}
            showDongBars={view.dongBars}
            dongMode={view.dongMode}
            dongYear={view.dongYear}
            grid3d={view.grid3d}
            weather={view.weather}
            tilt={view.tilt}
            theme={theme}
            orbit={view.orbit}
            fly={view.fly}
            onOrbitStop={stopOrbit}
            resetSeq={resetSeq}
            fitPadding={fitPadding}
          />
        ) : (
          // 근거 그래프는 제 툴바(범례·배치·확대)를 갖고 있어 상단 띠·카드 밖 영역에만 그린다
          <div className="absolute inset-x-0 bottom-[calc(100%-var(--dump-sheet-top))] top-[104px] md:bottom-0 md:left-[calc(32px+var(--dump-side-w,440px))] md:right-0 md:top-[76px]">
            <OntologyGraph graph={graph} selectedId={selectedNode} onSelect={setSelectedNode} />
          </div>
        )}
      </div>
      {/* 모바일 손잡이 드래그의 기준 높이(보이는 지도 높이). 그리지 않는 측정용 상자 */}
      <div ref={split.mapBoxRef} aria-hidden className="pointer-events-none absolute inset-x-0 top-0 md:hidden" style={{ height: "var(--dump-sheet-top)" }} />

      {/* 상단 띠: 마크·이름·기준일(왼쪽), 탭(가운데), 데이터·방법(오른쪽). 처음 온 사람이 5초 안에 "무엇을 분석한 화면인지" 읽어야 한다 */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-[1100] flex flex-col gap-2 p-3 md:p-4">
        <div className="flex items-center gap-2">
          <button
            onClick={resetAll}
            title="첫 화면으로 돌아가기"
            className="dump-fl pointer-events-auto flex min-w-0 items-center gap-2.5 rounded-full py-1.5 pl-1.5 pr-4 text-left"
          >
            <DumpMark size={30} className="shrink-0" />
            <span className="min-w-0">
              <h1 className="truncate text-[15px] font-extrabold leading-none tracking-[-0.015em] text-[var(--cp-text-strong)]">클린광진 상황실</h1>
              <span className="dump-kicker mt-1 block truncate text-[9.5px] text-[var(--cp-text-dim)]">
                광진구 · 무단투기 100m 격자{mapData ? ` · ${mapData.decision.asof} 기준` : ""}
              </span>
            </span>
          </button>
          <div className="pointer-events-auto ml-auto flex shrink-0 items-center gap-2">
            {rightPane === "map" && (
              <button
                onClick={() => setLayersOpen((v) => !v)}
                aria-expanded={layersOpen}
                className={`dump-fl rounded-full px-3.5 py-2 text-[13px] font-semibold md:hidden ${layersOpen ? "text-(--dump-accent)" : "text-[var(--cp-text-strong)]"}`}
              >
                레이어
              </button>
            )}
            <button
              onClick={() => openMethods("data")}
              className="dump-fl group rounded-full px-3.5 py-2 text-[13px] font-semibold text-[var(--cp-text-strong)] transition-colors hover:text-(--dump-accent)"
            >
              데이터·방법
              <span className="ml-1 hidden transition-transform group-hover:translate-x-0.5 md:inline-block" aria-hidden>
                →
              </span>
            </button>
            {/* 라이트·다크(sunlight-fund 유리 스위치). 지도 바탕도 같이 바뀐다 */}
            <ThemeSwitch compact={!isXl} />
          </div>
        </div>
        {/* 탭 알약. 데스크톱은 상단 가운데, 모바일은 둘째 줄 가로 스크롤 */}
        <nav
          role="tablist"
          className="dump-fl pointer-events-auto flex max-w-full gap-0.5 self-start overflow-x-auto rounded-full p-1 [scrollbar-width:none] md:absolute md:left-1/2 md:top-4 md:-translate-x-1/2"
        >
          {TABS.map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => switchTab(t.id)}
              className={`dump-tab shrink-0 whitespace-nowrap px-3.5 py-1.5 text-[13.5px] font-semibold transition-colors ${
                tab === t.id ? "" : "text-[var(--cp-text-dim)] hover:text-[var(--cp-text-strong)]"
              }`}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </div>

      {load === "error" && (
        <div role="alert" className="absolute left-1/2 top-[68px] z-[1200] flex -translate-x-1/2 items-center gap-3 rounded-full bg-red-50 px-4 py-2 text-[13px] text-red-700 shadow md:top-[80px]">
          데이터를 불러오지 못했습니다. 네트워크를 확인하고 다시 시도해 주세요.
          <button onClick={() => setLoadSeq((v) => v + 1)} className="rounded-full border border-red-300 bg-white px-2.5 py-0.5 font-medium hover:bg-red-100">
            다시 시도
          </button>
        </div>
      )}

      {/* 왼쪽 카드(데스크톱) = 하단 시트(모바일). 탭 내용이 여기 산다. 폭은 CSS 변수(드래그) */}
      <aside
        className={`dump-fl absolute inset-x-0 bottom-0 top-[var(--dump-sheet-top)] z-[1050] flex flex-col rounded-t-2xl md:inset-x-auto md:bottom-4 md:left-4 ${TOP} md:w-[var(--dump-side-w,440px)] md:rounded-2xl`}
      >
        {/* 모바일 손잡이. 드래그로 지도/시트 비율, 더블탭 = 기본 복귀. 오른쪽에 지도 접기 */}
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
            <button
              onClick={() => setMapCollapsed((v) => !v)}
              className="mr-3 shrink-0 rounded-full border border-[var(--cp-border)] px-2.5 py-0.5 text-[12px] font-semibold text-(--dump-accent)"
            >
              {mapCollapsed ? "지도 펼치기" : "지도 접기"}
            </button>
          )}
        </div>
        {/* 물어보기는 항상 마운트. 탭을 오가도 대화가 남는다. 나머지는 탭마다 새 스크롤 컨테이너 */}
        <div className={tab === "qa" ? "flex min-h-0 flex-1 flex-col" : "hidden"}>
          <QaChat onAuthExpired={() => setAuth("locked")} onViz={applyVizFromQa} data={mapData} graph={graph} />
        </div>
        {tab !== "qa" && (
          <div key={tab} className="min-h-0 flex-1 overflow-y-auto [scrollbar-width:thin]">
            {tab === "findings" && (
              <FindingsPanel
                data={mapData}
                graph={graph}
                selectedDong={selectedDong}
                onSelectDong={(d) => {
                  setSelectedDong(d)
                  setMapCollapsed(false)
                }}
                onOpenFinding={setOpenFinding}
                onOpenBriefing={setBriefingDong}
                activeTitle={activeFinding?.title ?? null}
              />
            )}
            {tab === "ops" && (
              <OpsPanel
                data={mapData}
                interventions={interventions}
                onFocus={(latlng, label) => {
                  setFocusCandidate({ seq: Date.now(), latlng, label })
                  setMapCollapsed(false) // 모바일: 접힌 지도에 펄스를 찍으면 아무것도 안 보인다
                }}
                showCritical={showCritical}
                onToggleCritical={() => {
                  setShowCritical((v) => !v)
                  if (!showCritical) setMapCollapsed(false)
                }}
              />
            )}
            {tab === "policy" && (
              <PolicyBoard
                graph={graph}
                data={mapData}
                onShowMap={applyLeverViz}
                activeLeverId={activeLever?.node.id ?? null}
                criticalOn={showCritical}
                onToggleCritical={() => {
                  setShowCritical((v) => !v)
                  if (!showCritical) setMapCollapsed(false)
                }}
              />
            )}
            {tab === "onto" && <OntoPanel graph={graph} selectedId={selectedNode} onSelect={setSelectedNode} />}
          </div>
        )}
        {/* 카드 바닥: 물어보기로 가는 길(물어보기 탭 밖에서만) + 한계 고지. 결재를 유보하는 문장이 아니라 수치의 성격과 효과 판정 방법을 말한다 */}
        <div className="shrink-0 border-t border-[var(--cp-border)] px-3 py-2">
          {tab !== "qa" && (
            <button
              onClick={() => switchTab("qa")}
              className="mb-2 flex w-full items-center gap-3 rounded-full border border-[var(--cp-border-strong)] bg-[var(--cp-panel)] py-1 pl-4 pr-1 text-left text-[13.5px] font-semibold text-[var(--cp-text-dim)] transition-colors hover:border-[var(--cp-text-strong)] hover:text-[var(--cp-text-strong)]"
            >
              <span className="min-w-0 flex-1 truncate">김주임에게 물어보기</span>
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--dump-ink)]" aria-hidden>
                <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="#fff">
                  <path d="M8 1.5a2.5 2.5 0 0 0-2.5 2.5v4a2.5 2.5 0 0 0 5 0V4A2.5 2.5 0 0 0 8 1.5zM3.5 8a.75.75 0 0 1 1.5 0 3 3 0 0 0 6 0 .75.75 0 0 1 1.5 0 4.5 4.5 0 0 1-3.75 4.44V14h2a.75.75 0 0 1 0 1.5h-5.5a.75.75 0 0 1 0-1.5h2v-1.56A4.5 4.5 0 0 1 3.5 8z" />
                </svg>
              </span>
            </button>
          )}
          <p className="text-[11.5px] leading-snug text-[var(--cp-text-faint)]">
            <span className="dump-kicker mr-1.5 text-[9.5px]">한계 고지</span>
            수치는 {mapData?.decision.asof ?? ""} 기준 민원·과태료 기록의 집계이며 실제 발생량이 아닙니다.
            <span className="hidden md:inline"> 대책 효과는 조치 대장에 등록한 시범으로 판정하고, 청소차 수거 시각 자료가 확보되면 다시 분석합니다.</span>
          </p>
        </div>
      </aside>

      {/* 데스크톱 폭 조절 핸들. 카드 오른쪽 경계. 더블클릭 = 기본 폭 */}
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
        <span
          className={`absolute left-1/2 top-1/2 h-10 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full transition-colors ${
            side.dragging ? "bg-(--dump-accent)" : "bg-[var(--cp-border-strong)] opacity-0 group-hover:opacity-100"
          }`}
        />
      </div>

      {/* 오른쪽 열(데스크톱, 지도일 때): 레이어 패널 · 재배치 후보 목록 · 범례. 한 열이라 서로 겹칠 자리가 없다. 바닥은 줌 버튼 자리를 비운다 */}
      {rightPane === "map" && (
        <div
          className={`pointer-events-none absolute bottom-[140px] right-4 ${TOP} z-[1050] hidden flex-col gap-2.5 md:flex`}
          style={{ width: RIGHT_W }}
        >
          <div className="dump-fl pointer-events-auto flex min-h-0 shrink flex-col rounded-2xl p-1.5">{layerPanel}</div>
          {candidates && <div className="dump-fl pointer-events-auto flex min-h-0 shrink flex-col overflow-hidden rounded-2xl">{candidates}</div>}
          <div className="dump-fl pointer-events-auto mt-auto shrink-0 rounded-2xl">{legend}</div>
        </div>
      )}

      {/* 아래 띠(xl 이상): 월별 민원. 카드와 오른쪽 열 사이 */}
      {rightPane === "map" && mapData && (
        <div
          className="dump-fl absolute bottom-4 z-[1040] hidden rounded-2xl xl:block"
          style={{ left: "calc(16px + var(--dump-side-w, 440px) + 16px)", right: RIGHT_W + 32 }}
        >
          <TimelineStrip data={mapData} />
        </div>
      )}

      {/* 모바일 레이어 덮개: 레이어 패널 · 범례 · 후보 목록 */}
      {rightPane === "map" && layersOpen && (
        <div className="dump-fl absolute inset-x-3 top-[104px] z-[1150] flex max-h-[calc(100%-120px)] flex-col overflow-hidden rounded-2xl md:hidden">
          <div className="flex shrink-0 items-center justify-between border-b border-[var(--cp-border)] px-3 py-2">
            <span className="text-[13.5px] font-bold text-[var(--cp-text-strong)]">지도 레이어</span>
            <button onClick={() => setLayersOpen(false)} aria-label="닫기" className="rounded-full px-2 py-0.5 text-[14px] text-[var(--cp-text-dim)]">
              ✕
            </button>
          </div>
          <div className="min-h-0 overflow-y-auto p-1.5">
            {layerPanel}
            {candidates && <div className="mt-2 rounded-xl border border-[var(--cp-border)]">{candidates}</div>}
            <div className="mt-2 rounded-xl border border-[var(--cp-border)]">{legend}</div>
          </div>
        </div>
      )}

      <BriefingModal dong={briefingDong} data={mapData} graph={graph} onClose={() => setBriefingDong(null)} />
      <MethodsModal open={showMethods} data={mapData} graph={graph} initialSection={methodsSection} onClose={() => setShowMethods(false)} />

      <FindingModal
        finding={openFinding}
        onClose={() => setOpenFinding(null)}
        onApplyViz={(f) => {
          if (f.viz) applyViz(f.viz)
          setActiveFinding(f)
          setActiveLever(null)
          setOpenFinding(null)
          switchTab("findings") // 지도 페인이 보이는 탭으로
        }}
      />
    </div>
  )
}
