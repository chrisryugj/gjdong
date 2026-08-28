"use client"

import { useEffect, useState } from "react"
import type { DumpingMapData, MapMode, OntoGraph } from "@/lib/dumping/types"
import DumpingMap from "./dumping-map"
import OntologyGraph from "./ontology-graph"
import FindingsPanel from "./findings-panel"
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

export default function DumpingDashboard() {
  const [auth, setAuth] = useState<AuthState>("checking")
  const [pw, setPw] = useState("")
  const [pwError, setPwError] = useState<string | null>(null)
  const [pwBusy, setPwBusy] = useState(false)

  const [tab, setTab] = useState<Tab>("findings")
  const [mapData, setMapData] = useState<DumpingMapData | null>(null)
  const [graph, setGraph] = useState<OntoGraph | null>(null)
  const [mode, setMode] = useState<MapMode>("overlay")
  const [selectedDong, setSelectedDong] = useState<string | null>(null)
  const [selectedNode, setSelectedNode] = useState<string | null>(null)

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

  // 온톨로지 탭이 아닐 때 노드를 고르면(예: Q&A 참고) 그래프 탭으로 넘어가게 하진 않는다 — 단순 유지
  const rightPane = tab === "onto" ? "graph" : "map"

  if (auth !== "open") {
    return (
      <div className="crowd-page flex h-dvh items-center justify-center bg-[var(--cp-bg)] px-4 text-[var(--cp-text)]">
        {auth === "checking" ? (
          <p className="text-sm text-[var(--cp-text-dim)]">확인 중…</p>
        ) : (
          <form
            onSubmit={submitPw}
            className="w-full max-w-xs rounded-2xl border border-[var(--cp-border)] bg-[var(--cp-panel)] p-6"
          >
            <h1 className="text-base font-bold text-[var(--cp-text-strong)]">무단투기 상황판</h1>
            <p className="mt-1 text-[12px] leading-relaxed text-[var(--cp-text-dim)]">
              내부 검토용 대시보드입니다. 비밀번호를 입력하세요.
            </p>
            <input
              type="password"
              value={pw}
              onChange={(e) => setPw(e.target.value)}
              autoFocus
              inputMode="numeric"
              placeholder="비밀번호"
              className="mt-4 w-full rounded-lg border border-[var(--cp-border)] bg-[var(--cp-bg)] px-3 py-2 text-[14px] text-[var(--cp-text)] placeholder:text-[var(--cp-text-faint)] focus:border-[var(--cp-border-active)] focus:outline-none"
            />
            {pwError && <p className="mt-2 text-[12px] text-red-400">{pwError}</p>}
            <button
              type="submit"
              disabled={pwBusy || !pw}
              className="mt-3 w-full rounded-lg bg-[#39a189] py-2 text-[13px] font-semibold text-[#04110d] disabled:opacity-40"
            >
              {pwBusy ? "확인 중…" : "들어가기"}
            </button>
          </form>
        )}
      </div>
    )
  }

  return (
    <div className="crowd-page flex h-dvh flex-col bg-[var(--cp-bg)] text-[var(--cp-text)]">
      {/* 헤더 */}
      <header className="flex shrink-0 items-center gap-3 border-b border-[var(--cp-border)] px-3 py-2">
        <div className="min-w-0">
          <h1 className="truncate text-[15px] font-bold text-[var(--cp-text-strong)]">무단투기 상황판</h1>
          <p className="truncate text-[11px] text-[var(--cp-text-dim)]">
            광진구 발생구조 분석 · 100m 격자 1,062 · 2024.1~2026.8
          </p>
        </div>
        <div className="ml-auto hidden items-center gap-4 sm:flex">
          {[
            { k: "민원", v: "3,462건" },
            { k: "과태료", v: "3,247건" },
            { k: "온톨로지", v: "59노드·76관계" },
          ].map((s) => (
            <div key={s.k} className="text-right">
              <p className="text-[10px] text-[var(--cp-text-dim)]">{s.k}</p>
              <p className="font-mono text-[12px] font-semibold text-[var(--cp-text-strong)]">{s.v}</p>
            </div>
          ))}
        </div>
      </header>

      {/* 본문 스플릿 — 모바일: 위 지도/그래프 + 아래 패널, 데스크톱: 좌 패널 고정폭 + 우 지도 */}
      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <div className="relative h-[38dvh] shrink-0 md:order-last md:h-auto md:flex-1">
          {rightPane === "map" ? (
            <>
              <DumpingMap data={mapData} mode={mode} selectedDong={selectedDong} />
              {/* 지도 모드 칩 */}
              <div className="absolute left-2 top-2 z-[1000] flex flex-wrap gap-1">
                {(Object.keys(MODE_LABEL) as MapMode[]).map((m) => (
                  <button
                    key={m}
                    onClick={() => setMode(m)}
                    className={`rounded-full border px-2.5 py-1 text-[11px] backdrop-blur transition-colors ${
                      mode === m
                        ? "border-[#39a189] bg-[#39a189]/20 text-[var(--cp-text-strong)]"
                        : "border-[var(--cp-border)] bg-[var(--cp-overlay)] text-[var(--cp-text-muted)] hover:bg-[var(--cp-hover)]"
                    }`}
                  >
                    {MODE_LABEL[m]}
                  </button>
                ))}
              </div>
              {/* 범례 */}
              <div className="pointer-events-none absolute bottom-2 left-2 z-[1000] flex items-center gap-1.5 rounded bg-[var(--cp-overlay)] px-2 py-1 text-[10px] text-[var(--cp-text-dim)] backdrop-blur">
                <span>적음</span>
                <span className="flex">
                  {["#1b2422", "#1f3b35", "#265448", "#2f7566", "#39a189", "#57ceb0"].map((c) => (
                    <i key={c} className="h-2.5 w-3.5" style={{ background: c }} />
                  ))}
                </span>
                <span>많음</span>
                {mode === "overlay" && (
                  <span className="ml-1 inline-flex items-center gap-1">
                    <i className="h-2 w-2 rounded-full border border-[#e0776c] bg-[#e0776c]/30" /> 민원
                  </span>
                )}
                <span className="ml-1">칸=100m</span>
              </div>
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
                className={`rounded-t-lg px-3.5 py-2 text-[13px] font-medium transition-colors ${
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
              <FindingsPanel data={mapData} selectedDong={selectedDong} onSelectDong={setSelectedDong} />
            )}
            {tab === "onto" && <OntoPanel graph={graph} selectedId={selectedNode} onSelect={setSelectedNode} />}
            {tab === "qa" && <QaChat onAuthExpired={() => setAuth("locked")} />}
          </div>
        </aside>
      </div>
    </div>
  )
}
