"use client"

import { useCallback, useEffect, useState } from "react"
import type {
  BaseMode,
  CircleId,
  DumpingMapData,
  InfraLayerId,
  InterventionEntry,
  MapMode,
  OntoGraph,
  VizAction,
} from "@/lib/dumping/types"
import DumpingMap, { BASE_DEF, CIRCLE_DEF, INFRA_STYLE, type CandidateFocus } from "./dumping-map"
import OntologyGraph from "./ontology-graph"
import FindingsPanel from "./findings-panel"
import FindingModal from "./finding-modal"
import type { Finding } from "./findings-data"
import OntoPanel from "./onto-panel"
import OpsPanel from "./ops-panel"
import BriefingModal from "./briefing-modal"
import QaChat from "./qa-chat"
import { useSplitPane } from "@/components/crowd/hooks/use-split-pane"

type Tab = "findings" | "ops" | "onto" | "qa"
type AuthState = "checking" | "locked" | "open"

const BASE_LABEL: Record<BaseMode, string> = {
  unm: "무관리주거",
  comp: "민원",
  enf: "과태료",
}

// VizAction(발견 카드·예시 질문)의 기존 mode를 바탕+원 조합으로 해석
const MODE_MAP: Record<MapMode, { base: BaseMode; circles: CircleId[] }> = {
  overlay: { base: "unm", circles: ["comp"] },
  unm: { base: "unm", circles: [] },
  comp: { base: "comp", circles: [] },
  enf: { base: "enf", circles: [] },
}

// 선택된 바탕이 뭘 보여주는지 — 칩 아래 한 줄 설명 (원 중첩 시 조합 설명 덧붙음)
const BASE_DESC: Record<BaseMode, string> = {
  unm: "바탕색은 관리주체 없는 주거(다가구·단독) 밀도. 아파트는 발생과 무관해(β −0.011) 레이어가 없고, 색이 옅은 주거지가 사실상 유관리 지역입니다.",
  comp: "바탕색은 주민 신고 민원 건수. 앱 보급에 따른 신고 편향이 섞여 실제 발생보다 부풀 수 있습니다.",
  enf: "바탕색은 단속 과태료 부과 건수. 신고 여부와 무관해 실제 발생에 가장 가깝습니다.",
}

const TABS: { id: Tab; label: string }[] = [
  { id: "findings", label: "발견" },
  { id: "ops", label: "운영·전망" },
  { id: "onto", label: "온톨로지" },
  { id: "qa", label: "질의응답" },
]

const INFRA_IDS = Object.keys(INFRA_STYLE) as InfraLayerId[]

export default function DumpingDashboard() {
  const [auth, setAuth] = useState<AuthState>("checking")
  const [pw, setPw] = useState("")
  const [pwError, setPwError] = useState<string | null>(null)
  const [pwBusy, setPwBusy] = useState(false)

  const [tab, setTab] = useState<Tab>("findings")
  const [mapData, setMapData] = useState<DumpingMapData | null>(null)
  const [graph, setGraph] = useState<OntoGraph | null>(null)
  const [interventions, setInterventions] = useState<InterventionEntry[] | null>(null)
  const [briefingDong, setBriefingDong] = useState<string | null>(null)
  const [baseMode, setBaseMode] = useState<BaseMode>("unm")
  const [circles, setCircles] = useState<CircleId[]>(["comp"]) // 기본 = 원인 바탕 + 민원 원
  const [layers, setLayers] = useState<InfraLayerId[]>([])
  const [showCandidates, setShowCandidates] = useState(false)
  const [showRoutes, setShowRoutes] = useState(false)
  const [selectedDong, setSelectedDong] = useState<string | null>(null)
  const [selectedNode, setSelectedNode] = useState<string | null>(null)
  const [openFinding, setOpenFinding] = useState<Finding | null>(null)
  const [activeFinding, setActiveFinding] = useState<Finding | null>(null) // 지도에 반영 중인 발견
  const [focusCandidate, setFocusCandidate] = useState<CandidateFocus | null>(null)
  const [resetSeq, setResetSeq] = useState(0)
  const split = useSplitPane() // 모바일: 지도/패널 분할 핸들 (crowd 패턴 재사용)

  // 좌상단 배너 클릭 → 첫 화면 상태로 초기화
  const resetAll = () => {
    setTab("findings")
    setBaseMode("unm")
    setCircles(["comp"])
    setLayers([])
    setShowCandidates(false)
    setShowRoutes(false)
    setSelectedDong(null)
    setSelectedNode(null)
    setOpenFinding(null)
    setActiveFinding(null)
    setFocusCandidate(null)
    setBriefingDong(null)
    setResetSeq((v) => v + 1)
  }

  useEffect(() => {
    fetch("/api/dumping/auth")
      .then((r) => r.json())
      .then((d) => setAuth(d?.ok ? "open" : "locked"))
      .catch(() => setAuth("locked"))
  }, [])

  useEffect(() => {
    if (auth !== "open") return
    fetch("/dumping/map.json")
      .then((r) => r.json())
      .then(setMapData)
      .catch(() => {})
    fetch("/dumping/graph.json")
      .then((r) => r.json())
      .then(setGraph)
      .catch(() => {})
    fetch("/dumping/interventions.json")
      .then((r) => r.json())
      // 예시 항목(registeredAt 빈값)은 목록에서 제외 — 스키마 안내용으로만 파일에 남는다
      .then((d) => setInterventions((d?.entries ?? []).filter((e: InterventionEntry) => e.registeredAt)))
      .catch(() => setInterventions(null))
  }, [auth])

  const applyViz = useCallback((viz: VizAction) => {
    if (viz.mode) {
      setBaseMode(MODE_MAP[viz.mode].base)
      setCircles(MODE_MAP[viz.mode].circles)
    }
    if (viz.layers) setLayers(viz.layers)
    if (viz.candidates !== undefined) setShowCandidates(viz.candidates)
    if (viz.routes !== undefined) setShowRoutes(viz.routes)
    // 동이 선택된 채로 두면 격자가 그 동만 남고 줌도 안 풀려 "반영이 무시된 것처럼" 보인다
    // → viz가 동을 명시하지 않으면 선택을 해제하고 구 전체 뷰로 복귀
    setSelectedDong(viz.dong !== undefined ? viz.dong : null)
  }, [])

  const submitPw = async (e: React.FormEvent) => {
    e.preventDefault()
    if (pwBusy) return
    setPwBusy(true)
    setPwError(null)
    try {
      const res = await fetch("/api/dumping/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: pw }),
      })
      const data = await res.json().catch(() => null)
      if (res.ok && data?.ok) {
        setAuth("open")
        setPw("")
      } else {
        setPwError(data?.error ?? "인증에 실패했습니다")
      }
    } catch {
      setPwError("네트워크 오류")
    } finally {
      setPwBusy(false)
    }
  }

  const rightPane = tab === "onto" ? "graph" : "map"

  if (auth !== "open") {
    return (
      <div className="crowd-page crowd-light flex h-dvh items-center justify-center bg-[var(--cp-bg)] px-4 text-[var(--cp-text)]">
        {auth === "checking" ? (
          <p className="text-base text-[var(--cp-text-dim)]">확인 중…</p>
        ) : (
          <form
            onSubmit={submitPw}
            className="w-full max-w-xs rounded-2xl border border-[var(--cp-border)] bg-[var(--cp-panel)] p-6 shadow-sm"
          >
            <h1 className="text-lg font-bold text-[var(--cp-text-strong)]">무단투기 상황판</h1>
            <p className="mt-1 text-[14px] leading-relaxed text-[var(--cp-text-dim)]">
              내부 검토용 대시보드입니다. 비밀번호를 입력하세요.
            </p>
            <input
              type="password"
              value={pw}
              onChange={(e) => setPw(e.target.value)}
              autoFocus
              inputMode="numeric"
              placeholder="비밀번호"
              className="mt-4 w-full rounded-lg border border-[var(--cp-border)] bg-[var(--cp-bg)] px-3 py-2 text-[16px] text-[var(--cp-text)] placeholder:text-[var(--cp-text-faint)] focus:border-[var(--cp-border-active)] focus:outline-none"
            />
            {pwError && <p className="mt-2 text-[14px] text-red-600">{pwError}</p>}
            <button
              type="submit"
              disabled={pwBusy || !pw}
              className="mt-3 w-full rounded-lg bg-[#0c6155] py-2 text-[15px] font-semibold text-white disabled:opacity-40"
            >
              {pwBusy ? "확인 중…" : "들어가기"}
            </button>
          </form>
        )}
      </div>
    )
  }

  return (
    <div className="crowd-page crowd-light flex h-dvh flex-col bg-[var(--cp-bg)] text-[var(--cp-text)]">
      {/* 헤더 */}
      <header className="flex shrink-0 items-center gap-3 border-b border-[var(--cp-border)] px-3 py-2">
        <button onClick={resetAll} className="min-w-0 text-left" title="첫 화면으로 돌아가기">
          <h1 className="truncate text-[17px] font-bold text-[var(--cp-text-strong)]">무단투기 상황판</h1>
          <p className="truncate text-[13px] text-[var(--cp-text-dim)]">
            광진구 발생구조 분석 · 100m 격자 1,062 · 2024.1~2026.8
          </p>
        </button>
        <div className="ml-auto hidden items-center gap-4 sm:flex">
          {[
            { k: "민원", v: "3,462건" },
            { k: "과태료", v: "3,247건" },
            { k: "지식그래프", v: "지식 59 · 연결 76" },
          ].map((s) => (
            <div key={s.k} className="text-right">
              <p className="text-[12px] text-[var(--cp-text-dim)]">{s.k}</p>
              <p className="font-mono text-[14px] font-semibold text-[var(--cp-text-strong)]">{s.v}</p>
            </div>
          ))}
        </div>
      </header>

      {/* 본문 스플릿 — 모바일: 위 지도/그래프 + 아래 패널, 데스크톱: 좌 패널 고정폭 + 우 지도 */}
      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <div
          ref={split.mapBoxRef}
          style={split.mapH != null ? ({ "--dump-map-h": `${split.mapH}px` } as React.CSSProperties) : undefined}
          className="relative h-[var(--dump-map-h,38dvh)] shrink-0 md:order-last md:h-auto md:flex-1"
        >
          {rightPane === "map" ? (
            <>
              <DumpingMap
                data={mapData}
                base={baseMode}
                circles={circles}
                selectedDong={selectedDong}
                layers={layers}
                showCandidates={showCandidates}
                focusCandidate={focusCandidate}
                showRoutes={showRoutes}
                resetSeq={resetSeq}
              />
              {/* 발견 카드에서 적용한 시각화 배너 */}
              {activeFinding && (
                <div className="absolute left-1/2 top-2 z-[1010] flex max-w-[80%] -translate-x-1/2 items-center gap-2 rounded-full border border-[#0c6155]/40 bg-white/95 py-1.5 pl-3.5 pr-2 shadow-md backdrop-blur">
                  <span className="truncate text-[14px] font-medium text-[#0c6155]">
                    {activeFinding.title} · 지도에 반영 중
                  </span>
                  <button
                    onClick={() => setActiveFinding(null)}
                    aria-label="시각화 해제"
                    className="rounded-full bg-[#0c6155]/10 px-2 py-0.5 text-[13px] text-[#0c6155] hover:bg-[#0c6155]/20"
                  >
                    ✕
                  </button>
                </div>
              )}
              {/* 지도 모드 + 인프라 레이어 칩 */}
              <div className="absolute left-2 top-2 z-[1000] flex max-w-[calc(100%-1rem)] flex-col gap-1.5 md:max-w-[calc(100%-6rem)]">
                <div className="flex flex-nowrap items-center gap-1 overflow-x-auto pb-0.5 md:flex-wrap md:overflow-visible">
                  <span className="shrink-0 pl-1 text-[12px] font-medium text-[var(--cp-text-dim)]">바탕</span>
                  {(Object.keys(BASE_LABEL) as BaseMode[]).map((m) => (
                    <button
                      key={m}
                      onClick={() => {
                        setBaseMode(m)
                        // 자기 자신을 원으로 또 겹치는 건 무의미 — 자동 해제
                        setCircles((cs) => cs.filter((c) => c !== m))
                      }}
                      className={`shrink-0 whitespace-nowrap rounded-full border px-2.5 py-1 text-[13px] backdrop-blur transition-colors ${
                        baseMode === m
                          ? "border-[#0c6155] bg-[#0c6155]/15 font-medium text-[#0c6155]"
                          : "border-[var(--cp-border)] bg-[var(--cp-overlay)] text-[var(--cp-text-muted)] hover:bg-[var(--cp-hover)]"
                      }`}
                    >
                      {BASE_LABEL[m]}
                    </button>
                  ))}
                  <span className="mx-1 h-4 w-px shrink-0 bg-[var(--cp-border)]" />
                  <span className="shrink-0 text-[12px] font-medium text-[var(--cp-text-dim)]">원 겹치기</span>
                  {(Object.keys(CIRCLE_DEF) as CircleId[]).map((c) => {
                    const on = circles.includes(c)
                    const sameAsBase = baseMode === c
                    return (
                      <button
                        key={c}
                        disabled={sameAsBase}
                        title={sameAsBase ? "바탕과 같은 지표는 겹칠 필요가 없습니다" : undefined}
                        onClick={() => setCircles((cs) => (on ? cs.filter((x) => x !== c) : [...cs, c]))}
                        className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1 text-[13px] backdrop-blur transition-colors disabled:opacity-35 ${
                          on
                            ? "bg-[var(--cp-overlay)] font-medium"
                            : "border-[var(--cp-border)] bg-[var(--cp-overlay)] text-[var(--cp-text-muted)] hover:bg-[var(--cp-hover)]"
                        }`}
                        style={on ? { borderColor: CIRCLE_DEF[c].color, color: CIRCLE_DEF[c].color } : undefined}
                      >
                        <i
                          className="h-2.5 w-2.5 rounded-full border-2"
                          style={{ borderColor: CIRCLE_DEF[c].color, background: `${CIRCLE_DEF[c].color}30` }}
                        />
                        {CIRCLE_DEF[c].label} 원
                      </button>
                    )
                  })}
                </div>
                <div className="flex flex-nowrap gap-1 overflow-x-auto pb-0.5 md:flex-wrap md:overflow-visible">
                  {INFRA_IDS.map((id) => {
                    const on = layers.includes(id)
                    return (
                      <button
                        key={id}
                        onClick={() =>
                          setLayers((ls) => (on ? ls.filter((l) => l !== id) : [...ls, id]))
                        }
                        className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1 text-[13px] backdrop-blur transition-colors ${
                          on
                            ? "border-[var(--cp-border-active)] bg-[var(--cp-overlay)] font-medium text-[var(--cp-text-strong)]"
                            : "border-[var(--cp-border)] bg-[var(--cp-overlay)] text-[var(--cp-text-muted)] hover:bg-[var(--cp-hover)]"
                        }`}
                      >
                        <i
                          className="h-2 w-2 rounded-full"
                          style={{ background: INFRA_STYLE[id].color, opacity: on ? 1 : 0.4 }}
                        />
                        {INFRA_STYLE[id].label}
                        {mapData ? ` ${mapData.infra[id].length}` : ""}
                      </button>
                    )
                  })}
                  <button
                    onClick={() => setShowRoutes((v) => !v)}
                    className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1 text-[13px] backdrop-blur transition-colors ${
                      showRoutes
                        ? "border-[#d97706] bg-[#d97706]/10 font-medium text-[#92500a]"
                        : "border-[var(--cp-border)] bg-[var(--cp-overlay)] text-[var(--cp-text-muted)] hover:bg-[var(--cp-hover)]"
                    }`}
                  >
                    <i className="h-0.5 w-3.5 rounded-full bg-[#d97706]" />
                    청소차 노선
                  </button>
                  <button
                    onClick={() => setShowCandidates((v) => !v)}
                    className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1 text-[13px] backdrop-blur transition-colors ${
                      showCandidates
                        ? "border-red-500 bg-red-500/10 font-medium text-red-600"
                        : "border-[var(--cp-border)] bg-[var(--cp-overlay)] text-[var(--cp-text-muted)] hover:bg-[var(--cp-hover)]"
                    }`}
                  >
                    <i className="h-2 w-2 rounded-full border border-dashed border-red-500" />
                    재배치 후보 20
                  </button>
                </div>
                {/* 현재 모드 설명 */}
                <p className="max-w-md rounded-lg bg-[var(--cp-overlay)] px-2.5 py-1.5 text-[12.5px] leading-snug text-[var(--cp-text-muted)] backdrop-blur">
                  {BASE_DESC[baseMode]}
                  {circles.length > 0 &&
                    ` 그 위의 ${circles.map((c) => `${CIRCLE_DEF[c].label} 원(${c === "comp" ? "빨강" : "보라"})`).join("과 ")}은 바탕과 겹쳐 보며 비교하는 결과 지표입니다.`}
                </p>
              </div>
              {/* 범례 — 모드별 팔레트 반영 */}
              <div className="pointer-events-none absolute bottom-2 left-2 z-[1000] flex items-center gap-1.5 rounded bg-[var(--cp-overlay)] px-2 py-1 text-[13px] text-[var(--cp-text)] backdrop-blur">
                <span className="font-medium">{BASE_DEF[baseMode].legend}</span>
                <span>적음</span>
                <span className="flex">
                  {BASE_DEF[baseMode].pal.map((c) => (
                    <i key={c} className="h-3 w-4" style={{ background: c }} />
                  ))}
                </span>
                <span>많음</span>
                {circles.map((c) => (
                  <span key={c} className="ml-1 inline-flex items-center gap-1">
                    <i
                      className="h-2.5 w-2.5 rounded-full border"
                      style={{ borderColor: CIRCLE_DEF[c].color, background: `${CIRCLE_DEF[c].color}30` }}
                    />
                    {CIRCLE_DEF[c].label} 원
                  </span>
                ))}
                <span className="ml-1">칸=100m</span>
              </div>
              {/* 재배치 후보 주소 목록 */}
              {showCandidates && mapData && (
                <div className="absolute bottom-10 right-2 z-[1000] w-64 max-w-[75%] overflow-hidden md:bottom-auto md:top-2 md:w-72 rounded-xl border border-[var(--cp-border)] bg-white/95 shadow-md backdrop-blur">
                  <p className="border-b border-[var(--cp-border)] px-3 py-2 text-[13px] font-semibold text-[var(--cp-text-strong)]">
                    이동식 CCTV 재배치 후보 20곳
                    <span className="block text-[11px] font-normal text-[var(--cp-text-dim)]">
                      발생이력 순 · 자원배분 논리 (통계 효과 근거 아님)
                    </span>
                  </p>
                  <div className="max-h-[22dvh] overflow-y-auto md:max-h-[42dvh]">
                    {mapData.cctvCandidates.map((c, i) => (
                      <button
                        key={i}
                        onClick={() => setFocusCandidate({ seq: Date.now(), latlng: [c[0], c[1]] })}
                        className={`flex w-full items-start gap-2 border-b border-[var(--cp-border-faint)] px-3 py-2 text-left last:border-b-0 hover:bg-[var(--cp-hover)] ${
                          i < 3 ? "bg-red-50" : ""
                        }`}
                      >
                        <span
                          className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white ${
                            i < 3 ? "bg-red-600 ring-2 ring-red-300" : "bg-red-400"
                          }`}
                        >
                          {i + 1}
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate text-[13px] font-medium text-[var(--cp-text-strong)]">
                            {c[5] || `${c[4]} (주소 미상)`}
                          </span>
                          <span className="block text-[12px] text-[var(--cp-text-dim)]">
                            {c[4]} · 민원 {c[2]} · 과태료 {c[3]}
                          </span>
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : (
            <OntologyGraph graph={graph} selectedId={selectedNode} onSelect={setSelectedNode} />
          )}
        </div>

        <aside className="flex min-h-0 flex-1 flex-col border-t border-[var(--cp-border)] md:w-[420px] md:flex-none md:border-r md:border-t-0 xl:w-[480px]">
          {/* 모바일 분할 핸들 — 드래그로 지도/패널 비율 조절, 더블탭 = 기본 복귀 */}
          <div
            role="separator"
            aria-orientation="horizontal"
            aria-label="패널 크기 조절"
            onPointerDown={split.onSplitDown}
            onPointerMove={split.onSplitMove}
            onPointerUp={split.onSplitUp}
            onPointerCancel={split.onSplitUp}
            onDoubleClick={split.resetSplit}
            className="flex h-6 shrink-0 cursor-row-resize touch-none items-center justify-center md:hidden"
          >
            <span className="h-1.5 w-10 rounded-full bg-[var(--cp-border-strong)]" />
          </div>
          <nav className="flex shrink-0 gap-1 border-b border-[var(--cp-border)] px-2 pt-2">
            {TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`rounded-t-lg px-3.5 py-2 text-[15px] font-medium transition-colors ${
                  tab === t.id
                    ? "border border-b-0 border-[var(--cp-border)] bg-[var(--cp-panel)] text-[var(--cp-text-strong)]"
                    : "text-[var(--cp-text-dim)] hover:text-[var(--cp-text)]"
                }`}
              >
                {t.label}
              </button>
            ))}
          </nav>
          <div className={`min-h-0 flex-1 ${tab === "qa" ? "" : "overflow-y-auto"}`}>
            {tab === "findings" && (
              <FindingsPanel
                data={mapData}
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
                onFocus={(latlng) => setFocusCandidate({ seq: Date.now(), latlng })}
              />
            )}
            {tab === "onto" && <OntoPanel graph={graph} selectedId={selectedNode} onSelect={setSelectedNode} />}
            {tab === "qa" && <QaChat onAuthExpired={() => setAuth("locked")} onViz={applyViz} data={mapData} />}
          </div>
        </aside>
      </div>

      {/* 초기 분석 고지 푸터 */}
      <footer className="shrink-0 border-t border-[var(--cp-border)] bg-[var(--cp-bg)] px-3 py-1.5 text-center text-[12px] leading-snug text-[var(--cp-text-dim)]">
        이 상황판은 확보된 행정데이터와 기본 변수로 수행한 초기 분석입니다. 실제 정책 적용 전에는
        현장 여건과 추가 변수(청소 노선·수거 시간 등)를 반영한 정밀 분석을 권장합니다.
      </footer>

      <BriefingModal dong={briefingDong} data={mapData} onClose={() => setBriefingDong(null)} />

      <FindingModal
        finding={openFinding}
        onClose={() => setOpenFinding(null)}
        onApplyViz={(f) => {
          if (f.viz) applyViz(f.viz)
          setActiveFinding(f)
          setOpenFinding(null)
          setTab("findings") // 지도 페인이 보이는 탭으로
        }}
      />
    </div>
  )
}
