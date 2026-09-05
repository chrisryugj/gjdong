"use client"

import { useCallback, useEffect, useState } from "react"
import type { DumpingMapData, InterventionEntry, OntoGraph, VizAction } from "@/lib/dumping/types"
import { summarize } from "@/lib/dumping/facts"
import DumpingMap, { type CandidateFocus } from "./dumping-map"
import MapControls, { DEFAULT_VIEW, MODE_MAP, type MapView } from "./map-controls"
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
import { vizForLever, type LeverView } from "./lever-view"
import { useSplitPane } from "@/components/crowd/hooks/use-split-pane"

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

const DATA_URL = (name: "map" | "graph" | "interventions") => `/api/dumping/data/${name}`

async function fetchJson<T>(url: string): Promise<T> {
  const r = await fetch(url)
  if (!r.ok) throw new Error(`${url} ${r.status}`)
  return r.json()
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
  const split = useSplitPane({ mapBelow: true }) // 모바일: 패널이 위, 지도가 아래. 핸들은 패널 바닥(crowd 패턴 재사용)

  const clearActive = () => {
    setActiveFinding(null)
    setActiveLever(null)
  }

  // 좌상단 배너 클릭 → 첫 화면 상태로 초기화
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
    ])
      .then(([map, g, iv]) => {
        if (!alive) return
        setMapData(map)
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

  const applyViz = useCallback((viz: VizAction) => {
    setView((v) => ({
      ...v,
      ...(viz.mode ? MODE_MAP[viz.mode] : {}),
      ...(viz.layers ? { layers: viz.layers } : {}),
      ...(viz.candidates !== undefined ? { candidates: viz.candidates } : {}),
      ...(viz.routes !== undefined ? { routes: viz.routes } : {}),
    }))
    // 동이 선택된 채로 두면 격자가 그 동만 남고 줌도 안 풀려 "반영이 무시된 것처럼" 보인다
    // 그래서 viz가 동을 명시하지 않으면 선택을 해제하고 구 전체 뷰로 복귀
    setSelectedDong(viz.dong !== undefined ? viz.dong : null)
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
  const stats = mapData ? summarize(mapData) : null
  const active = activeLever
    ? { label: activeLever.node.label.split("(")[0].trim(), onClear: () => setActiveLever(null) }
    : activeFinding
      ? { label: activeFinding.title, onClear: () => setActiveFinding(null) }
      : null

  return (
    <div className="crowd-page crowd-light flex h-dvh flex-col bg-[var(--cp-bg)] tabular-nums text-[var(--cp-text)]">
      {/* 헤더 */}
      <header className="flex shrink-0 items-center gap-3 border-b border-[var(--cp-border)] px-3 py-2">
        <button onClick={resetAll} className="min-w-0 text-left" title="첫 화면으로 돌아가기">
          <h1 className="truncate text-[17px] font-bold text-[var(--cp-text-strong)]">클린광진 상황실</h1>
          <p className="truncate text-[13px] text-[var(--cp-text-dim)]">
            무단투기가 왜 어디에서 생기는지 · 물어보시면 데이터로 답합니다
          </p>
        </button>
        <div className="ml-auto flex items-center gap-4">
          {/* 기간·민원·과태료만. 그래프 규모(노드·엣지)는 근거 그래프 탭 안으로 옮겼다(결재선에게 뜻이 없다) */}
          {[
            { k: `민원 ${stats?.period.label ?? ""}`.trim(), v: stats ? `${stats.complaints.toLocaleString()}건` : "미산출" },
            { k: `과태료 ${stats?.finesPeriod.label ?? ""}`.trim(), v: stats ? `${stats.enforcement.toLocaleString()}건` : "미산출" },
          ].map((s) => (
            <div key={s.k} className="hidden text-right sm:block">
              <p className="text-[12px] text-[var(--cp-text-dim)]">{s.k}</p>
              <p className="font-mono text-[14px] font-semibold text-[var(--cp-text-strong)]">{s.v}</p>
            </div>
          ))}
          <button
            onClick={() => openMethods("data")}
            className="shrink-0 rounded-lg border border-[var(--cp-border)] px-2.5 py-1.5 text-[13px] font-medium text-[var(--cp-text-muted)] hover:bg-[var(--cp-hover)]"
          >
            데이터·방법
          </button>
        </div>
      </header>

      {load === "error" && (
        <div role="alert" className="flex shrink-0 items-center gap-3 bg-red-50 px-3 py-2 text-[13px] text-red-700">
          데이터를 불러오지 못했습니다. 네트워크를 확인하고 다시 시도해 주세요.
          <button
            onClick={() => setLoadSeq((v) => v + 1)}
            className="rounded-md border border-red-300 bg-white px-2 py-0.5 font-medium hover:bg-red-100"
          >
            다시 시도
          </button>
        </div>
      )}

      {/* 본문 스플릿. 모바일: 위 패널 + 아래 지도/그래프(결론이 지도보다 먼저), 데스크톱: 좌 패널 고정폭 + 우 지도 */}
      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <div
          ref={split.mapBoxRef}
          style={split.mapH != null ? ({ "--dump-map-h": `${split.mapH}px` } as React.CSSProperties) : undefined}
          className="relative order-last h-[var(--dump-map-h,42dvh)] shrink-0 md:h-auto md:flex-1"
        >
          {rightPane === "map" ? (
            <>
              <DumpingMap
                data={mapData}
                base={view.base}
                circles={view.circles}
                selectedDong={selectedDong}
                layers={view.layers}
                showCandidates={view.candidates}
                showHotspots={tab === "ops"}
                showCritical={showCritical && tab === "ops"}
                focusCandidate={focusCandidate}
                showRoutes={view.routes}
                resetSeq={resetSeq}
              />
              <MapControls
                key={resetSeq}
                data={mapData}
                view={view}
                onChange={(next) => {
                  setView(next)
                  clearActive()
                }}
                active={active}
                onFocusCandidate={setFocusCandidate}
                selectedDong={selectedDong}
              />
            </>
          ) : (
            <OntologyGraph graph={graph} selectedId={selectedNode} onSelect={setSelectedNode} />
          )}
        </div>

        <aside className="flex min-h-0 flex-1 flex-col border-b border-[var(--cp-border)] md:w-[420px] md:flex-none md:border-b-0 md:border-r xl:w-[480px]">
          <nav
            role="tablist"
            className="flex shrink-0 gap-1 overflow-x-auto border-b border-[var(--cp-border)] px-2 pt-2 [scrollbar-width:none]"
          >
            {TABS.map((t) => (
              <button
                key={t.id}
                role="tab"
                aria-selected={tab === t.id}
                onClick={() => switchTab(t.id)}
                className={`shrink-0 whitespace-nowrap rounded-t-lg px-2.5 py-2 text-[14px] font-medium transition-colors md:px-3.5 md:text-[15px] ${
                  tab === t.id
                    ? "border border-b-0 border-[var(--cp-border)] bg-[var(--cp-panel)] text-[var(--cp-text-strong)]"
                    : "text-[var(--cp-text-dim)] hover:text-[var(--cp-text)]"
                }`}
              >
                {t.label}
              </button>
            ))}
          </nav>
          {/* 물어보기는 항상 마운트. 탭을 오가도 대화가 남는다. 나머지는 탭마다 새 스크롤 컨테이너 */}
          <div className={tab === "qa" ? "flex min-h-0 flex-1 flex-col" : "hidden"}>
            <QaChat onAuthExpired={() => setAuth("locked")} onViz={applyVizFromQa} data={mapData} graph={graph} />
          </div>
          {tab !== "qa" && (
            <div key={tab} className="min-h-0 flex-1 overflow-y-auto">
              {tab === "findings" && (
                <FindingsPanel
                  data={mapData}
                  graph={graph}
                  selectedDong={selectedDong}
                  onSelectDong={setSelectedDong}
                  onOpenFinding={setOpenFinding}
                  onOpenBriefing={setBriefingDong}
                  activeTitle={activeFinding?.title ?? null}
                />
              )}
              {tab === "ops" && (
                <OpsPanel
                  data={mapData}
                  interventions={interventions}
                  onFocus={(latlng, label) => setFocusCandidate({ seq: Date.now(), latlng, label })}
                  showCritical={showCritical}
                  onToggleCritical={() => setShowCritical((v) => !v)}
                />
              )}
              {tab === "policy" && (
                <PolicyBoard
                  graph={graph}
                  data={mapData}
                  onShowMap={applyLeverViz}
                  activeLeverId={activeLever?.node.id ?? null}
                  onOpenMethods={openMethods}
                  onGoFindings={() => switchTab("findings")}
                />
              )}
              {tab === "onto" && <OntoPanel graph={graph} selectedId={selectedNode} onSelect={setSelectedNode} />}
            </div>
          )}
          {/* 모바일 분할 핸들(패널 바닥). 드래그로 지도/패널 비율 조절, 더블탭 = 기본 복귀 */}
          <div
            role="separator"
            aria-orientation="horizontal"
            aria-label="지도 크기 조절"
            onPointerDown={split.onSplitDown}
            onPointerMove={split.onSplitMove}
            onPointerUp={split.onSplitUp}
            onPointerCancel={split.onSplitUp}
            onDoubleClick={split.resetSplit}
            className="flex h-6 shrink-0 cursor-row-resize touch-none items-center justify-center md:hidden"
          >
            <span className="h-1.5 w-10 rounded-full bg-[var(--cp-border-strong)]" />
          </div>
        </aside>
      </div>

      {/* 초기 분석 고지 푸터. 모바일은 첫 문장만 (지도·패널 공간이 우선) */}
      <footer className="shrink-0 border-t border-[var(--cp-border)] bg-[var(--cp-bg)] px-3 py-1.5 text-center text-[12px] leading-snug text-[var(--cp-text-dim)]">
        이 상황판은 지금까지 확보한 행정데이터와 기본 변수로 수행한 초기 분석입니다.{" "}
        <span className="hidden md:inline">
          실제로 정책에 적용하시기 전에는 현장 여건과 추가 변수(청소 노선·수거 시간 등)를 반영한 정밀 분석을
          거치시길 권해 드립니다.
        </span>
      </footer>

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
