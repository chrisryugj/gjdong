"use client"

import { useCallback, useEffect, useState } from "react"
import type {
  DumpingMapData,
  InfraLayerId,
  MapMode,
  OntoGraph,
  VizAction,
} from "@/lib/dumping/types"
import DumpingMap, { INFRA_STYLE, MODE_DEF, type CandidateFocus } from "./dumping-map"
import OntologyGraph from "./ontology-graph"
import FindingsPanel from "./findings-panel"
import FindingModal from "./finding-modal"
import type { Finding } from "./findings-data"
import OntoPanel from "./onto-panel"
import QaChat from "./qa-chat"

type Tab = "findings" | "onto" | "qa"
type AuthState = "checking" | "locked" | "open"

const MODE_LABEL: Record<MapMode, string> = {
  overlay: "원인+결과",
  unm: "무관리주거",
  comp: "민원",
  enf: "과태료",
}

const TABS: { id: Tab; label: string }[] = [
  { id: "findings", label: "발견" },
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
  const [mode, setMode] = useState<MapMode>("overlay")
  const [layers, setLayers] = useState<InfraLayerId[]>([])
  const [showCandidates, setShowCandidates] = useState(false)
  const [selectedDong, setSelectedDong] = useState<string | null>(null)
  const [selectedNode, setSelectedNode] = useState<string | null>(null)
  const [openFinding, setOpenFinding] = useState<Finding | null>(null)
  const [activeFinding, setActiveFinding] = useState<Finding | null>(null) // 지도에 반영 중인 발견
  const [focusCandidate, setFocusCandidate] = useState<CandidateFocus | null>(null)
  const [resetSeq, setResetSeq] = useState(0)

  // 좌상단 배너 클릭 → 첫 화면 상태로 초기화
  const resetAll = () => {
    setTab("findings")
    setMode("overlay")
    setLayers([])
    setShowCandidates(false)
    setSelectedDong(null)
    setSelectedNode(null)
    setOpenFinding(null)
    setActiveFinding(null)
    setFocusCandidate(null)
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
  }, [auth])

  const applyViz = useCallback((viz: VizAction) => {
    if (viz.mode) setMode(viz.mode)
    if (viz.layers) setLayers(viz.layers)
    if (viz.candidates !== undefined) setShowCandidates(viz.candidates)
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
        <div className="relative h-[38dvh] shrink-0 md:order-last md:h-auto md:flex-1">
          {rightPane === "map" ? (
            <>
              <DumpingMap
                data={mapData}
                mode={mode}
                selectedDong={selectedDong}
                layers={layers}
                showCandidates={showCandidates}
                focusCandidate={focusCandidate}
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
                <div className="flex flex-nowrap gap-1 overflow-x-auto pb-0.5 md:flex-wrap md:overflow-visible">
                  {(Object.keys(MODE_LABEL) as MapMode[]).map((m) => (
                    <button
                      key={m}
                      onClick={() => setMode(m)}
                      className={`shrink-0 whitespace-nowrap rounded-full border px-2.5 py-1 text-[13px] backdrop-blur transition-colors ${
                        mode === m
                          ? "border-[#0c6155] bg-[#0c6155]/15 font-medium text-[#0c6155]"
                          : "border-[var(--cp-border)] bg-[var(--cp-overlay)] text-[var(--cp-text-muted)] hover:bg-[var(--cp-hover)]"
                      }`}
                    >
                      {MODE_LABEL[m]}
                    </button>
                  ))}
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
              </div>
              {/* 범례 — 모드별 팔레트 반영 */}
              <div className="pointer-events-none absolute bottom-2 left-2 z-[1000] flex items-center gap-1.5 rounded bg-[var(--cp-overlay)] px-2 py-1 text-[13px] text-[var(--cp-text)] backdrop-blur">
                <span className="font-medium">{MODE_DEF[mode].legend}</span>
                <span>적음</span>
                <span className="flex">
                  {MODE_DEF[mode].pal.map((c) => (
                    <i key={c} className="h-3 w-4" style={{ background: c }} />
                  ))}
                </span>
                <span>많음</span>
                {mode === "overlay" && (
                  <span className="ml-1 inline-flex items-center gap-1">
                    <i className="h-2.5 w-2.5 rounded-full border border-[#a8322a] bg-[#a8322a]/25" /> 민원(빨간 원)
                  </span>
                )}
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
                activeTitle={activeFinding?.title ?? null}
              />
            )}
            {tab === "onto" && <OntoPanel graph={graph} selectedId={selectedNode} onSelect={setSelectedNode} />}
            {tab === "qa" && <QaChat onAuthExpired={() => setAuth("locked")} onViz={applyViz} />}
          </div>
        </aside>
      </div>

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
