"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { DumpingMapData, InterventionEntry, OntoGraph, VizAction } from "@/lib/dumping/types"
import DumpingMap, { type CameraCue, type CandidateFocus, type MapLoadStage } from "./dumping-map"
import { CandidateList, DEFAULT_VIEW, MapLayerPanel, MapLegend, MODE_MAP, type MapView } from "./map-controls"
import { dongAnchors } from "./map-geo"
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
import FontScaleButton from "./font-scale"
import GlassDial from "./glass-dial"
import LiquidGlass from "./liquid-glass"
import LiquidTabs from "./liquid-tabs"
import { deriveLevers, vizForLever, type LeverView } from "./lever-view"
import { useSplitPane } from "@/components/crowd/hooks/use-split-pane"
import { useSidebarWidth } from "./use-sidebar-width"
import { useSpeaker } from "./use-voice"
import { sentencesOf, ttsClean } from "@/lib/dumping/answer-parts"
import DumpMark from "./dump-mark"
import { Ico } from "./icons"
import { AUTH_EXPIRED, fetchBundle, resetDumpingData, startDumpingData, type Early } from "./data-early"
import { LOAD_NONE, LOAD_STEPS, loadStageOf } from "@/lib/dumping/load-stage"
import { liveWeatherKey } from "@/lib/dumping/labels"
import { NSDI_BUILDING_COUNT } from "@/lib/dumping/basemap-style"
import { weatherLabel } from "@/lib/snow/weather"
import type { SnowForecast } from "@/lib/snow/types"

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
// 390px 폭에서 다섯 탭이 한 줄에 들어가게 짧은 이름(/snow TABS_SHORT 규약)
const TABS_SHORT: { id: Tab; label: string }[] = [
  { id: "policy", label: "제안" },
  { id: "qa", label: "묻기" },
  { id: "findings", label: "발견" },
  { id: "ops", label: "운영" },
  { id: "onto", label: "근거" },
]

// 지도 전면 디자인(2026-09-18). 지도(또는 근거 그래프)가 화면 전체를 채우고 그 위에 유리 패널이 뜬다:
// 상단 띠(마크·탭·데이터·방법), 왼쪽 카드(탭 내용, 폭 드래그), 오른쪽 열(레이어·후보 목록·범례), 아래 띠(월별 민원, xl 이상).
// 모바일은 왼쪽 카드가 하단 시트가 된다(손잡이 드래그·지도 접기). 레이어·범례는 "레이어" 버튼으로 여는 덮개 패널
const TOP = "md:top-[76px]" // 상단 띠 아래 카드·열이 시작하는 높이
const RIGHT_W = 236 // 오른쪽 열 폭(px)
const SHEET_TOP_MOBILE = "44dvh" // 모바일 시트 기본 시작 높이
const DEMO_CAPTION_PAD = 160 // 시연 캡션 카드 높이 + 간격(px). 지도 맞춤 여백 바닥에 더한다

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
  // 첫 화면은 실사 건물만(base none·원 없음). 로딩 커튼이 걷힌 뒤 결론이 단계로 등장한다: 다가구·단독 초록 물듦 → 과태료 기둥 솟음(19라운드)
  const [view, setView] = useState<MapView>({ ...DEFAULT_VIEW, base: "none", circles: [] })
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
  const [demo, setDemo] = useState<number | null>(null) // 시연 모드(18라운드): 장면 번호. ←→ 키로 이동, Esc로 나감
  const [cameraCue, setCameraCue] = useState<CameraCue | null>(null) // 시연 장면의 카메라 이동
  // 시연 중 왼쪽 카드 숨김(19라운드): 지도만 크게. H 키·캡션 바 버튼으로 켜고 끈다. 카메라는 padSeq로 가려진 영역을 다시 재서 가운데를 옮긴다
  const [cardHidden, setCardHidden] = useState(false)
  const [padSeq, setPadSeq] = useState(0)
  const demoTimers = useRef<number[]>([]) // 장면 안에서 미뤄 둔 단계(카메라 도착 뒤 기둥이 솟는다)
  // 로딩 커튼(19라운드): 지도 영역만 종이로 덮고 4단계(자료·지도 바탕·건물 결합·시설 아이콘)를 실제 이벤트로 체크한다. 첫 로드 한 번.
  // 단계는 독립 플래그로 받고 앞에서부터 연속 완료 수가 진행 단계(lib/dumping/load-stage.ts): 아이콘이 첫 idle보다 먼저 와도 건물 결합을 완료로 덮지 않는다(독립 리뷰 F5)
  const [ready, setReady] = useState(LOAD_NONE)
  const loadStage = loadStageOf(ready) // 0 자료 요청 중 · 1 자료 · 2 지도 바탕 · 3 건물 결합(첫 idle) · 4 시설 아이콘
  const [curtain, setCurtain] = useState<"on" | "out" | "off">("on")
  const [tiles, setTiles] = useState({ loaded: 0, failed: 0, total: 0 }) // 03 단계 안의 타일 진행(/snow 방식). 실패는 따로 센다
  const revealTimers = useRef<number[]>([])
  // 결론 등장(초록·기둥) 전에 사용자가 지도를 바꾸거나 시연을 시작하면 등장 단계는 취소한다.
  // 시연 1~3장면은 {...DEFAULT_VIEW, circles: []}로 시작해 등장 가드 조건과 같아, 커튼 직후 시연을 누르면 1.8초 뒤 과태료 기둥이 장면을 덮었다(2026-09-23 실측)
  const revealCancelled = useRef(false)
  const curtainTimer = useRef<number | null>(null)
  const clearRevealTimers = useCallback(() => {
    revealTimers.current.forEach((t) => window.clearTimeout(t))
    revealTimers.current = []
  }, [])
  const cancelReveal = useCallback(() => {
    revealCancelled.current = true
    clearRevealTimers()
  }, [clearRevealTimers])
  const theme = useTheme()
  const isMd = useBreakpoint("(min-width: 768px)")
  const isXl = useBreakpoint("(min-width: 1280px)")
  // 등장 애니메이션은 첫 진입 한 번만. 탭을 오갈 때마다 다시 떠오르면 반복 열람에 피로하다
  const [settled, setSettled] = useState(false)
  useEffect(() => {
    const t = window.setTimeout(() => setSettled(true), 1500)
    return () => window.clearTimeout(t)
  }, [])
  // 모바일(768 미만)은 평면 기본(/snow 4라운드 결정 이식: 3D 핀·기둥이 작은 화면에서 점으로 뭉개진다). 첫 마운트에 한 번
  useEffect(() => {
    if (!window.matchMedia("(min-width: 768px)").matches) setView((v) => ({ ...v, tilt: false }))
  }, [])

  const clearActive = () => {
    setActiveFinding(null)
    setActiveLever(null)
  }

  // 좌상단 마크 클릭 → 첫 화면 상태로 초기화
  const resetAll = () => {
    cancelReveal()
    setTab("policy")
    setView({ ...DEFAULT_VIEW, tilt: isMd })
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

  // 인증 확인은 client.tsx가 청크와 같이 시작했다(data-early). 그 약속을 이어받고, 내려갈 때 비운다(독립 리뷰 F3: 재진입은 인증부터 새로)
  const early = useRef<Early | null>(null)
  useEffect(() => {
    let alive = true
    early.current = startDumpingData()
    early.current.auth.then((ok) => alive && setAuth(ok ? "open" : "locked"))
    return () => {
      alive = false
      early.current = null
      resetDumpingData()
    }
  }, [])

  useEffect(() => {
    if (auth !== "open") return
    let alive = true
    setLoad("loading")
    // 첫 로드는 인증 통과 직후 미리 받기 시작한 자료 4종(data-early)을 한 번만 쓴다. 재시도·재로그인은 새로 받는다
    const bundle = early.current?.data ?? fetchBundle()
    early.current = null
    bundle
      .then(({ map, graph: g, interventions: iv, binRecos: br }) => {
        if (!alive) return
        // 배치추천은 인증 라우트로만 받는다(클라이언트 번들에 평문으로 실리지 않게). 없어도 화면이 선다
        setMapData(br ? { ...map, binRecos: br } : map)
        setGraph(g)
        // 조치 대장은 없어도 화면이 선다(실패는 null = 미확보). 예시 항목(registeredAt 빈값)은 목록에서 제외. 스키마 안내용으로만 파일에 남는다
        setInterventions(iv ? (iv.entries ?? []).filter((e) => e.registeredAt) : null)
        setLoad("ready")
      })
      .catch((e: Error) => {
        if (!alive) return
        // 자료 API 401은 인증 만료(쿠키 만료·키 회전). 재시도가 아니라 로그인으로 돌아가야 복구된다(독립 리뷰 F4). 다시 로그인하면 새로 받는다
        if (e?.message === AUTH_EXPIRED) setAuth("locked")
        else setLoad("error")
      })
    return () => {
      alive = false
    }
  }, [auth, loadSeq])

  // 지금 날씨(/snow 이식): 기상청 단기예보 광진구 격자(/api/snow/forecast, 30분 캐시). 헤더 "지금 N° 날씨"와 날씨별 민원 원의 "지금 조건" 표시가 쓴다.
  // 눈·비 입자 효과는 안 그린다(16라운드 결정: 시간대 데이터가 없는 장식). 실황은 날씨별 원(그 조건에 접수된 민원)과 이어질 때만 데이터 뜻이 있다
  const [wx, setWx] = useState<{ temp: number; code: number } | null>(null)
  useEffect(() => {
    if (auth !== "open") return
    let alive = true
    fetch("/api/snow/forecast")
      .then((r) => (r.ok ? (r.json() as Promise<SnowForecast>) : null))
      .then((f) => {
        const now = f?.now ?? f?.hours?.[0] ?? null
        if (alive && now) setWx({ temp: now.temp, code: now.code })
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [auth])
  const liveWeather = wx ? liveWeatherKey(wx.temp, wx.code) : null

  // 커튼 단계: 자료가 오면 1, 지도가 map/idle/icons를 알리면 2·3·4. 4 또는 25초 상한(회장 네트워크가 느려도 시연을 막지 않게. 3Mbps 실측 map load 12초 초과)에서 걷힌다
  useEffect(() => {
    if (load === "ready") setReady((r) => (r.data ? r : { ...r, data: true }))
  }, [load])
  const onMapStage = useCallback((stage: MapLoadStage) => {
    setReady((r) => (r[stage] ? r : { ...r, [stage]: true }))
  }, [])
  // 걷힘 → 0.65초 페이드 → 결론 등장: 0.8초 뒤 다가구·단독 초록, 1.8초 뒤 과태료 기둥(riseColumns). 그 사이 사용자가 바탕·원을 바꿨으면 건드리지 않는다
  const curtainDone = useRef(false)
  const dismissCurtain = useCallback(() => {
    if (curtainDone.current) return
    curtainDone.current = true
    setCurtain("out")
    curtainTimer.current = window.setTimeout(() => setCurtain("off"), 650)
    if (revealCancelled.current) return
    const t = revealTimers.current
    t.push(window.setTimeout(() => setView((v) => (v.base === "none" && v.circles.length === 0 ? { ...v, base: DEFAULT_VIEW.base } : v)), 800))
    t.push(window.setTimeout(() => setView((v) => (v.base === DEFAULT_VIEW.base && v.circles.length === 0 ? { ...v, circles: DEFAULT_VIEW.circles } : v)), 1800))
  }, [])
  useEffect(() => {
    if (loadStage >= 4 || load === "error") dismissCurtain()
  }, [loadStage, load, dismissCurtain])
  useEffect(() => {
    if (auth !== "open") return
    const t = window.setTimeout(dismissCurtain, 25000)
    return () => window.clearTimeout(t)
  }, [auth, dismissCurtain])
  // 내려갈 때는 타이머만 지운다. 취소 플래그를 세우면 StrictMode 이중 마운트(개발)에서 결론 등장이 영영 안 일어났다
  useEffect(
    () => () => {
      clearRevealTimers()
      if (curtainTimer.current != null) window.clearTimeout(curtainTimer.current)
    },
    [clearRevealTimers],
  )

  // 자동 회전 중 지도를 만지면 회전을 끈다(지도가 부른다). 다른 상태는 건드리지 않는다. 로그인 게이트 분기보다 위(훅 순서)
  const stopOrbit = useCallback(() => setView((v) => (v.orbit || v.fly ? { ...v, orbit: false, fly: false } : v)), [])
  const applyViz = useCallback((viz: VizAction) => {
    cancelReveal()
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
  }, [cancelReveal])

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

  // ─── 시연 모드(18라운드, WoW): 결론 → 동별 기둥 → 상습격자 → 다음 분기 예측 → 정책 제안. 장면마다 지도 상태를 바꾸고 데이터 한 줄을 캡션으로.
  // 장면 문장은 전부 데이터에서(수치는 map.json·graph.json), 원고 따로 없음 ───
  const levers = useMemo(() => (graph ? deriveLevers(graph) : []), [graph])
  // 장면 규칙: 카메라가 먼저 움직이고(2.4초), 도착 즈음 데이터가 솟는다(1.6초 뒤). 도착 뒤엔 천천히 돈다(orbit). 정지 화면에서 레이어만 바뀌지 않게.
  // 21라운드(사용자: "너무 멀리서만 돈다"): 조망에서 데이터가 선 뒤 한 곳으로 내려가고(줌인), 다음 장면이 다시 조망으로 빠진다(줌아웃).
  // 순위가 있는 장면(상습격자·예측 핫스팟·재배치 후보)은 드론이 1위부터 5위까지 찾아간다(MapView.fly 종류)
  interface DemoScene {
    title: string
    caption: string
    note: string
    hotspots?: boolean // false면 이 장면에서는 예측 핫스팟 기둥·순위를 숨긴다(운영 탭 상시 표시의 예외)
    apply: () => void
  }
  const around = (pt: [number, number], pad = 0.0022): [[number, number], [number, number]] => [
    [pt[0] - pad, pt[1] - pad],
    [pt[0] + pad, pt[1] + pad],
  ]
  const scenes = useMemo((): DemoScene[] => {
    if (!mapData) return []
    const topDong = [...mapData.dong].sort((a, b) => b.comp - a.comp)[0]
    const kpi = mapData.decision.kpi
    const bt = mapData.decision.hotspots.backtest
    const cctv = levers.find((lv) => vizForLever(lv)?.candidates) ?? levers.find((lv) => vizForLever(lv)) ?? null
    // 결론 장면이 내려가는 골목: 다가구·단독 밀집 상위 10% 칸 가운데 과태료가 가장 많은 칸(건물 색과 앰버 기둥이 한 화면에).
    // 1위 동(화양동)은 다음 장면이 내려가므로 뺀다(두 장면이 같은 곳으로 가던 것, 사용자 지적) → 자양4동
    const unmSorted = mapData.grid.map((c) => c[6]).sort((a, b) => a - b)
    const unmHigh = unmSorted[Math.floor(unmSorted.length * 0.9)] ?? 0
    const alley = mapData.grid.filter((c) => c[6] >= unmHigh && c[7] !== topDong?.d).sort((a, b) => b[5] - a[5])[0]
    const alleyPt: [number, number] | null = alley ? [(alley[1] + alley[3]) / 2, (alley[0] + alley[2]) / 2] : null
    // 동별 비교가 내려가는 곳: 1위 동의 기둥(동주민센터 기준점)
    const topDongPt = topDong ? (dongAnchors(mapData).get(topDong.d) ?? null) : null
    const later = (ms: number, fn: () => void) => demoTimers.current.push(window.setTimeout(fn, ms))
    const cue = (c: Omit<CameraCue, "seq">) => setCameraCue({ seq: Date.now(), ...c })
    return [
      {
        title: "결론",
        caption: "단속에 잡히는 무단투기는 사람이 많은 곳보다 다가구·단독주택 골목에 더 많습니다.",
        note: `건물 색은 100m 칸의 다가구·단독 밀집(${mapData.grid.length.toLocaleString()}칸) · 앰버 원기둥은 과태료 건수 · 지도가 천천히 돕니다`,
        apply: () => {
          setTab("policy")
          setView({ ...DEFAULT_VIEW, circles: [], orbit: true })
          setSelectedDong(null)
          setShowCritical(false)
          setFocusCandidate(null)
          clearActive()
          // 첫 장면은 골목에서 연다: 조망에서 곧장 다가구·단독 골목(자양4동)으로 내려가 초록 건물(밀집)을 눈높이에서 보고,
          // 캡션을 읽을 즈음 구 전체로 물러나면서 앰버 과태료 기둥이 솟는다 = 초록 위에 과태료가 얹히는 순서가 결론 문장 그대로(줌인 → 줌아웃 리빌). 그 뒤 천천히 돈다
          if (alleyPt) cue({ bounds: around(alleyPt), maxZoom: 16.1, pitch: 64, bearingDelta: 35, duration: 4200 })
          else cue({ pitch: 55, bearingDelta: 30, duration: 2600 })
          later(9500, () => cue({ pitch: 55, bearingDelta: 40, duration: 5200 }))
          later(12000, () => setView((v) => ({ ...v, circles: DEFAULT_VIEW.circles })))
        },
      },
      {
        title: "동별 비교",
        caption: topDong ? `${topDong.d}이 민원 ${topDong.comp.toLocaleString()}건 · 과태료 ${topDong.enf.toLocaleString()}건으로 ${mapData.dong.length}개 동 가운데 1위입니다.` : "",
        note: "청회 기둥은 민원, 앰버 기둥은 과태료 · 1~3위는 꼭대기 배지 · 높이는 구 최댓값 대비 · 기둥에 마우스를 올리면 순위·천명당",
        apply: () => {
          setTab("policy")
          setView({ ...DEFAULT_VIEW, circles: [], orbit: true })
          setSelectedDong(null)
          setShowCritical(false)
          setFocusCandidate(null)
          clearActive()
          // 낮게 내려가 기둥이 서는 걸 올려다본다. 도착 즈음 기둥이 솟는다
          cue({ pitch: 63, bearingDelta: 40, duration: 2600 })
          later(1600, () => setView((v) => ({ ...v, dongBars: true, dongMode: "total" })))
          // 기둥이 선 뒤 1위 동(화양동)의 기둥으로 내려간다(줌인). 두 기둥 높이와 꼭대기 배지가 읽힌다
          if (topDongPt) later(5200, () => cue({ bounds: around(topDongPt, 0.004), maxZoom: 14.5, pitch: 60, bearingDelta: 35, duration: 4500 }))
        },
      },
      {
        title: "집중관리 상습격자",
        caption: `최근 12개월 10건 이상 상습격자는 ${kpi.criticalCellsNow}곳, 앱 신고를 빼도 ${kpi.criticalCellsNowNoApp}곳입니다.`,
        note: "벽돌색 기둥은 12개월 민원+과태료 건수 · 드론이 1위부터 5위까지 찾아갑니다 · 성과는 앱 편향에 덜 민감한 이 수로 판단",
        // 예측 핫스팟 기둥·순위는 다음 장면에서 솟는다. 20곳 중 15곳이 상습격자와 같은 칸이라 여기서 같이 보이면 3·4장면이 같은 그림으로 읽힌다(사용자 지적)
        hotspots: false,
        apply: () => {
          setTab("ops")
          setView({ ...DEFAULT_VIEW, circles: [], fly: "critical" })
          setSelectedDong(null)
          setShowCritical(false)
          setFocusCandidate(null)
          clearActive()
          // 드론이 조망으로 물러나는 동안 벽돌 기둥이 솟고, 이어 1위(중곡1동)부터 찾아간다
          later(1200, () => setShowCritical(true))
        },
      },
      {
        title: "다음 분기 예측",
        // 22라운드 심사 냉독: "20곳의 63.1%는 12.6곳이라 정수가 아니다" → 분기 평균임을 캡션에서 밝힌다
        caption: `예측 핫스팟 20곳 가운데 다음 분기에 실제 기록이 남은 비율은 지난 ${bt.windows.length}개 분기 평균 ${bt.avgPrecision20 ?? "-"}%였습니다. 상위 5곳을 드론으로 돌아봅니다.`,
        note: `지난 ${bt.windows.length}개 분기 되돌려 검증 · 무작위 포착 ${bt.avgRandomCapture ?? "-"}% 대비 ${bt.avgCapture20 ?? "-"}% · 기둥 높이는 예측 점수, 꼭대기 숫자는 순위(상위 3곳 진한 벽돌)`,
        apply: () => {
          setTab("ops")
          setView({ ...DEFAULT_VIEW, fly: "hotspots" })
          setSelectedDong(null)
          setShowCritical(false)
          setFocusCandidate(null)
          clearActive()
        },
      },
      {
        title: "정책 제안",
        caption: cctv ? `${cctv.node.label.split("(")[0].trim()} · 현 위치와 발생이력으로 고른 재배치 후보 ${mapData.cctvCandidates.length}곳을 1위부터 찾아갑니다.` : "정책 제안 6건",
        note: "핀 숫자는 후보 순위(발생이력 순, 자원배분 논리 · 상위 3 벽돌색·바닥 고리, 나머지 앰버) · 회색 진할수록 기록 많은 칸 · 보라 카메라는 이동식 CCTV 현 위치 · 효과는 조치 대장에 등록한 시범으로 판정",
        apply: () => {
          setTab("policy")
          setShowCritical(false)
          setFocusCandidate(null)
          if (cctv) applyLeverViz(cctv)
          // 후보 핀이 서면 드론이 1위(중곡1동 천호대로)부터 찾아간다
          setView((v) => ({ ...v, fly: "candidates", orbit: false }))
        },
      },
    ]
  }, [mapData, levers, applyLeverViz])

  useEffect(() => {
    if (demo === null || !scenes[demo]) return
    cancelReveal()
    for (const t of demoTimers.current) window.clearTimeout(t)
    demoTimers.current = []
    scenes[demo].apply()
    setMapCollapsed(false)
    return () => {
      for (const t of demoTimers.current) window.clearTimeout(t)
      demoTimers.current = []
    }
  }, [demo])

  const toggleCard = useCallback(() => {
    setCardHidden((h) => !h)
    setPadSeq((n) => n + 1)
  }, [])

  // 시연 음성 해설(/snow 이식). 장면이 바뀌면 캡션을 문장 단위로 읽는다: 물어보기와 같은 Gemini TTS 큐(서버가 없으면 브라우저 목소리). 시연이 끝나면 멈춘다
  const [voice, setVoice] = useState(false)
  const { speak, stop: stopSpeak, unlock: unlockSpeaker } = useSpeaker()
  useEffect(() => {
    stopSpeak()
    if (!voice || demo === null || !scenes[demo]) return
    for (const s of sentencesOf(ttsClean(scenes[demo].caption))) speak(s)
    return () => stopSpeak()
  }, [voice, demo, scenes, speak, stopSpeak])

  useEffect(() => {
    if (demo === null) return
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return
      if (document.querySelector('[role="dialog"]')) return
      if (e.key === "ArrowRight" || e.key === " ") {
        e.preventDefault()
        setDemo((d) => (d === null ? 0 : Math.min(scenes.length - 1, d + 1)))
      } else if (e.key === "ArrowLeft") {
        e.preventDefault()
        setDemo((d) => (d === null ? 0 : Math.max(0, d - 1)))
      } else if (e.key === "Escape") {
        setDemo(null)
        setView((v) => ({ ...v, fly: false, orbit: false }))
        setPadSeq((n) => n + 1)
      } else if (e.key === "h" || e.key === "H" || e.key === "ㅎ") {
        e.preventDefault()
        toggleCard()
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [demo, scenes.length, toggleCard])

  // 시연을 나가면 카드는 다시 보인다(지도 padding도 카드 폭만큼 되돌린다)
  useEffect(() => {
    if (demo !== null || !cardHidden) return
    setCardHidden(false)
    setPadSeq((n) => n + 1)
  }, [demo, cardHidden])

  const endDemo = () => {
    setDemo(null)
    setCameraCue(null)
    setView((v) => ({ ...v, fly: false, orbit: false }))
    setPadSeq((n) => n + 1) // 캡션 카드가 걷힌 만큼 보이는 영역 가운데로
  }

  if (auth !== "open") {
    return <LoginGate checking={auth === "checking"} onOpen={() => setAuth("open")} />
  }

  const rightPane = tab === "onto" ? "graph" : "map"
  // 반영 해제(✕) = 배지만 지우는 게 아니라 지도도 기본 상태로(후보·시설·노선·동 선택 해제). 들어왔다가 못 나가던 문제(18라운드 후속)
  const clearApplied = () => {
    clearActive()
    setView((v) => ({ ...DEFAULT_VIEW, tilt: v.tilt, orbit: v.orbit, fly: v.fly }))
    setSelectedDong(null)
    setFocusCandidate(null)
  }
  const active = activeLever
    ? { label: activeLever.node.label.split("(")[0].trim(), onClear: clearApplied }
    : activeFinding
      ? { label: activeFinding.title, onClear: clearApplied }
      : null
  const onLayerChange = (next: MapView) => {
    cancelReveal()
    setView(next)
    clearActive()
    setMapCollapsed(false)
  }
  // 모바일 시트 시작 높이 = 보이는 지도 높이. 접힘이면 상단 띠 바로 아래
  const sheetTop = mapCollapsed ? "104px" : split.mapH != null ? `${split.mapH}px` : SHEET_TOP_MOBILE
  // 구 전체 맞춤 여백. 데스크톱은 왼쪽 카드·오른쪽 열·(xl) 아래 띠가 가리는 만큼, 모바일은 상단 띠와 시트가 가리는 만큼
  const sideW = side.width ?? 440
  const hideCard = demo !== null && cardHidden // 시연 중에만. xl 미만에선 시연 자체가 없다
  const leftEdge = hideCard ? "16px" : "calc(16px + var(--dump-side-w, 440px) + 16px)" // 캡션 바·월별 띠의 왼쪽 끝
  // 시연 중(xl)에는 월별 띠 위 캡션 카드(약 140px + 간격)도 지도를 가린다. 조망으로 물러날 때 구 남쪽(자양동)이 캡션 뒤에 숨었다(22라운드 캡처)
  const fitPadding: { tl: [number, number]; br: [number, number] } = isMd
    ? { tl: [hideCard ? 24 : 16 + sideW + 24, 76 + 8], br: [16 + RIGHT_W + 24, isXl ? 16 + 96 + (demo !== null ? DEMO_CAPTION_PAD : 0) : 24] }
    : { tl: [8, 104 + 8], br: [8, typeof window !== "undefined" ? Math.max(8, window.innerHeight * 0.56 + 8) : 8] }

  const layerPanel = mapData ? <MapLayerPanel key={resetSeq} data={mapData} view={view} onChange={onLayerChange} active={active} liveWeather={liveWeather} /> : null
  const hotspotsOn = tab === "ops" && (demo === null || scenes[demo]?.hotspots !== false)
  const criticalOn = showCritical && (tab === "ops" || tab === "policy")
  // 지도는 다른 층(시설·후보·배치추천·핫스팟·상습격자)이 켜지면 원·원기둥을 숨긴다(dumping-map muted). 범례도 같은 조건으로 그 줄을 뺀다
  const circlesMuted = view.layers.length > 0 || view.candidates || view.binRecos || hotspotsOn || criticalOn
  const legend = <MapLegend data={mapData} view={view} selectedDong={selectedDong} circlesMuted={circlesMuted} />
  const candidates =
    view.candidates && mapData ? (
      <CandidateList
        data={mapData}
        onFocusCandidate={(f) => {
          setFocusCandidate(f)
          setLayersOpen(false)
          setMapCollapsed(false)
        }}
        onClose={() => {
          setView((v) => ({ ...v, candidates: false }))
          setFocusCandidate(null)
          if (activeLever) clearActive()
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
            onStage={onMapStage}
            onTiles={setTiles}
            data={mapData}
            base={view.base}
            circles={view.circles}
            selectedDong={selectedDong}
            layers={view.layers}
            showCandidates={view.candidates}
            showBinRecos={view.binRecos}
            showHotspots={hotspotsOn}
            showCritical={criticalOn}
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
            padSeq={padSeq}
            cameraCue={cameraCue}
          />
        ) : (
          // 근거 그래프는 제 툴바(범례·배치·확대)를 갖고 있어 상단 띠·카드 밖 영역에만 그린다
          <div className="absolute inset-x-0 bottom-[calc(100%-var(--dump-sheet-top))] top-[104px] md:bottom-0 md:left-[calc(32px+var(--dump-side-w,440px))] md:right-0 md:top-[76px]">
            <OntologyGraph graph={graph} selectedId={selectedNode} onSelect={setSelectedNode} />
          </div>
        )}
      </div>
      {/* 로딩 커튼(19라운드): 지도 영역만 종이로 덮고 준비 단계를 보인다. 유리 패널 아래(z 1030)라 결론 카드·탭은 그대로 읽힌다. 걷힌 뒤 결론이 단계로 등장 */}
      {curtain !== "off" && rightPane === "map" && (
        <div className={`dump-curtain absolute inset-0 z-[1030] ${curtain === "out" ? "out" : ""}`} aria-live="polite" aria-busy={curtain === "on"}>
          <div className="dump-curtain-box">
            <DumpMark size={44} />
            <p className="dump-kicker mt-4 text-[10.5px] text-[var(--cp-text-dim)]">클린광진 상황실 · 준비 중</p>
            <h2 className="mt-1 text-[22px] font-extrabold leading-tight tracking-[-0.02em] text-[var(--cp-text-strong)]">광진구 무단투기 100m 격자를 불러옵니다</h2>
            <ol className="mt-5 flex flex-col gap-2">
              {["민원·과태료·격자 자료", "지도 바탕", `건물 ${NSDI_BUILDING_COUNT.toLocaleString()}동 입체 결합`, "시설·청소차 3D"].map((label, i) => {
                const st = ready[LOAD_STEPS[i]] ? "done" : loadStage === i ? "now" : "wait"
                // 02(map load = 첫 화면 타일까지)·03(첫 idle)이 길다: 타일 도착 수를 같이 보인다. 실패한 타일은 도착에 섞지 않는다
                const tail =
                  (i === 1 || i === 2) && st === "now" && tiles.total > 0
                    ? ` · 지도 타일 ${tiles.loaded}/${tiles.total}${tiles.failed > 0 ? ` · 실패 ${tiles.failed}` : ""}`
                    : ""
                return (
                  <li key={label} className={`dump-curtain-step ${st}`}>
                    <span className="dump-curtain-n">{String(i + 1).padStart(2, "0")}</span>
                    <span className="flex-1">
                      {label}
                      {tail && <span className="font-mono text-[12.5px] font-normal text-[var(--cp-text-dim)]">{tail}</span>}
                    </span>
                    <span className="dump-curtain-mark" aria-hidden>
                      {st === "done" ? "✓" : st === "now" ? "…" : ""}
                    </span>
                  </li>
                )
              })}
            </ol>
            {(() => {
              // 진행률: 단계마다 25%, 02·03 단계 안은 타일 도착 비율로 채운다
              const frac = (loadStage === 1 || loadStage === 2) && tiles.total > 0 ? Math.min(1, (tiles.loaded + tiles.failed) / tiles.total) : 0
              const pct = Math.round(Math.max(6, Math.min(100, (loadStage / 4) * 100 + frac * 25)))
              return (
                <div className="mt-5 flex items-center gap-3">
                  <div className="dump-curtain-bar flex-1" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
                    <span style={{ width: `${pct}%` }} />
                  </div>
                  <span className="dump-kicker w-9 text-right font-mono text-[10.5px] text-[var(--cp-text-dim)]">{pct}%</span>
                </div>
              )
            })()}
          </div>
        </div>
      )}
      {/* 모바일 손잡이 드래그의 기준 높이(보이는 지도 높이). 그리지 않는 측정용 상자 */}
      <div ref={split.mapBoxRef} aria-hidden className="pointer-events-none absolute inset-x-0 top-0 md:hidden" style={{ height: "var(--dump-sheet-top)" }} />

      {/* 상단 띠: 마크·이름·기준일(왼쪽), 탭(가운데), 데이터·방법(오른쪽). 처음 온 사람이 5초 안에 "무엇을 분석한 화면인지" 읽어야 한다 */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-[1100] flex flex-col gap-2 p-3 md:p-4">
        <div className="flex items-center gap-2">
          <button
            onClick={resetAll}
            title="첫 화면으로 돌아가기"
            className="dump-fl lg-shell pointer-events-auto relative flex min-w-0 items-center gap-2.5 rounded-full py-1.5 pl-1.5 pr-4 text-left"
          >
            <DumpMark size={30} className="shrink-0" />
            <span className="min-w-0">
              <h1 className="truncate text-[15px] font-extrabold leading-none tracking-[-0.015em] text-[var(--cp-text-strong)]">클린광진 상황실</h1>
              {/* 상태 한 줄(/snow 규약): 기준일 뒤에 지금 날씨. 날씨별 원의 "지금 조건"과 같은 실황 */}
              <span className="dump-kicker mt-1 block truncate text-[9.5px] text-[var(--cp-text-dim)]">
                광진구 · 무단투기 100m 격자{mapData ? ` · ${mapData.decision.asof} 기준` : ""}
                {wx && isMd ? ` · 지금 ${Math.round(wx.temp)}° ${weatherLabel(wx.code)}` : ""}
              </span>
            </span>
          </button>
          <div className="pointer-events-auto ml-auto flex shrink-0 items-center gap-2">
            {/* 모바일은 390 한 줄에 제목이 남도록 레이어는 아이콘, "데이터·방법"은 "데이터", 글자 크기 버튼은 숨긴다(제목이 폭 0으로 사라졌다, 2026-09-23 실측) */}
            {rightPane === "map" && (
              <button
                onClick={() => setLayersOpen((v) => !v)}
                aria-expanded={layersOpen}
                aria-label="지도 레이어"
                title="지도 레이어"
                className={`dump-fl lg-shell relative flex h-9 w-9 items-center justify-center rounded-full md:hidden ${layersOpen ? "text-(--dump-accent)" : "text-[var(--cp-text-strong)]"}`}
              >
                <Ico name="layers" size={17} />
              </button>
            )}
            {isXl && mapData && (
              <button
                type="button"
                onClick={() => (demo === null ? setDemo(0) : endDemo())}
                aria-pressed={demo !== null}
                title="시연 모드: 5장면, ←→ 키로 이동, H 카드 숨김, Esc로 나가기"
                className={`dump-fl lg-shell relative flex items-center gap-1.5 rounded-full px-3.5 py-2 text-[13px] font-semibold transition-colors hover:text-(--dump-accent) ${
                  demo !== null ? "!bg-[var(--dump-ink)] !text-[var(--dump-paper)]" : "text-[var(--cp-text-strong)]"
                }`}
              >
                <Ico name="monitor" size={14} />
                {demo !== null ? "시연 끝" : "시연"}
              </button>
            )}
            <button
              onClick={() => openMethods("data")}
              className="dump-fl lg-shell group relative rounded-full px-3.5 py-2 text-[13px] font-semibold text-[var(--cp-text-strong)] transition-colors hover:text-(--dump-accent)"
            >
              <span className="md:hidden">데이터</span>
              <span className="hidden md:inline">데이터·방법</span>
              <Ico name="arrow" size={13} className="ml-1 hidden transition-transform group-hover:translate-x-0.5 md:inline-block" />
            </button>
            {/* 글자 크기(보통·크게·더 크게). 카드·레이어·범례·모달 콘텐츠를 zoom. 모바일은 브라우저 확대로 */}
            <div className="hidden md:block">
              <FontScaleButton compact={!isXl} />
            </div>
            {/* 유리 강도 다이얼 + 라이트·다크(sunlight-fund 유리 스위치·다이얼). 지도 바탕도 같이 바뀐다 */}
            {isMd && <GlassDial compact={!isXl} />}
            <ThemeSwitch compact={!isXl} />
          </div>
        </div>
        {/* 탭 알약(액체 탭: 잉크 캡슐이 흘러간다). 데스크톱은 상단 가운데, 모바일은 둘째 줄 가로 스크롤 */}
        <LiquidTabs
          items={isMd ? TABS : TABS_SHORT}
          value={tab}
          onChange={switchTab}
          className="dump-fl lg-shell pointer-events-auto relative flex max-w-full gap-0.5 self-start overflow-x-auto rounded-full p-1 [scrollbar-width:none] md:absolute md:left-1/2 md:top-4 md:-translate-x-1/2"
        />
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
        className={`dump-fl lg-shell absolute inset-x-0 bottom-0 top-[var(--dump-sheet-top)] z-[1050] flex flex-col rounded-t-2xl p-[6px] md:inset-x-auto md:bottom-4 md:left-4 ${TOP} md:w-[var(--dump-side-w,440px)] md:rounded-2xl`}
        style={hideCard ? { display: "none" } : undefined}
      >
       <div className="lg-inner dump-zoom flex min-h-0 flex-1 flex-col overflow-hidden rounded-t-[11px] md:rounded-[11px]">
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
              <span className="min-w-0 flex-1 truncate">지니에게 물어보기</span>
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--dump-ink)]" aria-hidden>
                <Ico name="mic" size={14} className="text-[var(--dump-paper)]" />
              </span>
            </button>
          )}
          <p className="text-[12px] leading-snug text-[var(--cp-text-faint)]">
            <span className="dump-kicker mr-1.5 text-[9.5px]">한계 고지</span>
            수치는 {mapData?.decision.asof ?? ""} 기준 민원·과태료 기록의 집계이며 실제 발생량이 아닙니다.
            <span className="hidden md:inline"> 대책 효과는 조치 대장에 등록한 시범으로 판정하고, 청소차 수거 시각 자료가 확보되면 다시 분석합니다.</span>
          </p>
        </div>
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
        style={{ left: "calc(16px + var(--dump-side-w, 440px) - 6px)", display: hideCard ? "none" : undefined }}
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
          <div className="dump-fl lg-shell lg-dense dump-zoom pointer-events-auto relative flex min-h-0 shrink flex-col rounded-2xl p-1.5">{layerPanel}</div>
          {candidates && <div className="dump-fl lg-shell lg-dense dump-zoom pointer-events-auto relative flex max-h-[38%] min-h-0 shrink flex-col overflow-hidden rounded-2xl">{candidates}</div>}
          <div className="dump-fl lg-shell lg-dense dump-zoom pointer-events-auto relative mt-auto shrink-0 rounded-2xl">{legend}</div>
        </div>
      )}

      {/* 시연 캡션(xl 이상): 장면 번호·제목·데이터 한 줄. 월별 띠 위 */}
      {rightPane === "map" && demo !== null && scenes[demo] && (
        <div
          className="dump-fl lg-shell lg-dense absolute z-[1045] hidden rounded-2xl xl:block"
          style={{ left: leftEdge, right: RIGHT_W + 32, bottom: 16 + 96 + 14 }}
          aria-live="polite"
        >
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
              <p className="dump-headline mt-1 text-[19px] leading-[1.4] text-[var(--cp-text-strong)]">{scenes[demo].caption}</p>
              <p className="mt-1 text-[12.5px] leading-snug text-[var(--cp-text-dim)]">{scenes[demo].note}</p>
            </div>
            <div className="flex shrink-0 items-center gap-1 pt-1">
              <button onClick={() => setDemo(Math.max(0, demo - 1))} disabled={demo === 0} aria-label="이전 장면" className="h-8 w-8 rounded-full border border-[var(--cp-border)] text-[15px] text-[var(--cp-text-muted)] hover:bg-[var(--cp-hover)] disabled:opacity-35">
                ←
              </button>
              <button onClick={() => setDemo(Math.min(scenes.length - 1, demo + 1))} disabled={demo === scenes.length - 1} aria-label="다음 장면" className="h-8 w-8 rounded-full border border-[var(--cp-border)] text-[15px] text-[var(--cp-text-muted)] hover:bg-[var(--cp-hover)] disabled:opacity-35">
                →
              </button>
              <button
                onClick={toggleCard}
                aria-pressed={cardHidden}
                title="왼쪽 카드 숨기기·보이기 (H)"
                className={`ml-1 h-8 rounded-full border border-[var(--cp-border)] px-3 text-[12.5px] font-semibold hover:bg-[var(--cp-hover)] ${cardHidden ? "text-(--dump-accent)" : "text-[var(--cp-text-muted)]"}`}
              >
                {cardHidden ? "카드 보기" : "카드 숨김"}
              </button>
              <button
                onClick={() => {
                  unlockSpeaker() // 사용자 제스처 안에서 오디오를 연다(자동재생 정책)
                  setVoice((v) => !v)
                }}
                aria-pressed={voice}
                title="장면 캡션을 읽습니다(물어보기와 같은 목소리)"
                className={`ml-1 flex h-8 items-center gap-1 rounded-full border px-3 text-[12.5px] font-semibold hover:bg-[var(--cp-hover)] ${voice ? "border-(--dump-accent) text-(--dump-accent)" : "border-[var(--cp-border)] text-[var(--cp-text-muted)]"}`}
              >
                <Ico name="speaker" size={13} />
                음성
              </button>
              <button onClick={endDemo} className="ml-1 h-8 rounded-full border border-[var(--cp-border)] px-3 text-[12.5px] font-semibold text-[var(--cp-text-muted)] hover:bg-[var(--cp-hover)]">
                끝
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 아래 띠(xl 이상): 월별 민원. 카드와 오른쪽 열 사이 */}
      {rightPane === "map" && mapData && (
        <div
          className="dump-fl lg-shell lg-dense absolute bottom-4 z-[1040] hidden rounded-2xl xl:block"
          style={{ left: leftEdge, right: RIGHT_W + 32 }}
        >
          <TimelineStrip data={mapData} />
        </div>
      )}

      {/* 모바일 레이어 덮개: 레이어 패널 · 범례 · 후보 목록 */}
      {rightPane === "map" && layersOpen && (
        <div className="dump-fl lg-shell dump-overlay-solid absolute inset-x-3 top-[104px] z-[1150] flex max-h-[calc(100%-120px)] flex-col overflow-hidden rounded-2xl md:hidden">
          <div className="flex shrink-0 items-center justify-between border-b border-[var(--cp-border)] px-3 py-2">
            <span className="text-[13.5px] font-bold text-[var(--cp-text-strong)]">지도 레이어</span>
            <button onClick={() => setLayersOpen(false)} aria-label="닫기" className="rounded-full px-2 py-0.5 text-[14px] text-[var(--cp-text-dim)]">
              ✕
            </button>
          </div>
          <div className="dump-zoom min-h-0 overflow-y-auto p-1.5">
            {layerPanel}
            {candidates && <div className="mt-2 rounded-xl border border-[var(--cp-border)]">{candidates}</div>}
            <div className="mt-2 rounded-xl border border-[var(--cp-border)]">{legend}</div>
          </div>
        </div>
      )}

      {/* Liquid Glass 굴절 런타임(크로미움만, 사파리는 흐림 유리 폴백). .lg-shell마다 변위 맵을 붙인다 */}
      <LiquidGlass />
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
