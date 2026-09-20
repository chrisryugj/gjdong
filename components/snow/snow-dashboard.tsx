"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import type { LayerId, OntoGraph, SnowForecast, SnowMapData } from "@/lib/snow/types"
import { inSnowSeason, MOBILIZED, stageForSnow, type StageId } from "@/lib/snow/stage"
import { buildChecklist, gapSummary, heatTopDongs, segOwner, totals, type Finding } from "@/lib/snow/facts"
import SnowMap, { type CameraCue, type StageView } from "./snow-map"
import OntoGraphView from "./onto-graph"
import GapPanel from "./gap-panel"
import StagePanel from "./stage-panel"
import ResourcePanel from "./resource-panel"
import OntoPanel from "./onto-panel"
import LawPanel from "./law-panel"
import MethodsModal from "./methods-modal"
import { boundsOf, type ColMetric, dongBounds, type FlyStop, heatPaths, segMid } from "./map-geo"
import { ALL_LAYERS, DEFAULT_VIEW, LayerPanel, Legend, type MapView } from "./map-controls"
import { Ico } from "@/components/dumping/icons"
import ThemeSwitch, { useTheme } from "@/components/dumping/theme"
import LiquidGlass from "@/components/dumping/liquid-glass"
import LiquidTabs from "@/components/dumping/liquid-tabs"
import { useSplitPane } from "@/components/crowd/hooks/use-split-pane"
import { useSidebarWidth } from "@/components/dumping/use-sidebar-width"

// 광진 제설 상황판(/snow). 첫 화면의 주장은 자원 목록이 아니라 공백: 취약구간 중 열선·자재 없는 곳, 열선 없는 동.
// 탭: 공백(결론·발견) · 대응 단계(예보·특보 › 단계 › 시한 › 동원) · 자원 현황(4종·동별 기둥·서울 비교) · 근거 그래프 · 법령·책임
// 다크(겨울 밤 상황실)가 기본. 라이트는 인쇄용 보조. 왼쪽 카드는 거의 불투명(.snow-page .lg-inner)
// 3라운드(2026-09-20): 테마 저장 키 snow-theme(/dumping의 dump-theme와 분리. 그쪽을 라이트로 쓰면 여기까지 라이트로 뜨던 실사고), 자동 회전·초점 고리·시연 중 카드 접기·격상 진행바, 급경사 칩
// 4라운드(2026-09-21): 시연 6장면(경사 추정·점검 후보 드론 비행 추가), 대응 단계 탭은 단계 동원 목록(MOBILIZED)대로 자원 층을 켜고 2단계부터 제설차, 법령 탭은 관리청별 색(ownerView), 모바일(768 미만)은 평면 기본, 동별 순위 입체 숫자는 장면 2에서만

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
const RESOURCE_LAYERS: LayerId[] = ["heat", "salt", "cacl", "sand"]

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
  const [focusPoint, setFocusPoint] = useState<[number, number] | null>(null) // 땅 위 맥동 고리
  const [focusDetail, setFocusDetail] = useState<string | null>(null) // 칩 둘째 줄(구간 요약. 목록에서 눈을 떼도 맥락이 남게)
  const [orbit, setOrbit] = useState(false) // 자동 회전(시연 장면 1·5). 지도를 만지면 꺼진다
  const [fly, setFly] = useState<FlyStop[] | null>(null) // 드론 비행(시연 장면 6). 지도를 만지면 꺼진다
  const [demoProgress, setDemoProgress] = useState<{ key: number; ms: number; at: number } | null>(null) // 장면 3 자동 격상 진행선
  const [remain, setRemain] = useState(0)
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
  // 테마 선택을 /snow 전용 키에 저장(ThemeSwitch는 dump-theme에 쓴다. 수정 0). 첫 페인트는 app/snow/page.tsx 인라인 스크립트가 같은 키를 읽는다
  useEffect(() => {
    const save = () => {
      try {
        localStorage.setItem("snow-theme", document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark")
      } catch {
        // 사생활 모드
      }
    }
    const mo = new MutationObserver(save)
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] })
    return () => mo.disconnect()
  }, [])
  // 모바일(768 미만)은 평면 기본(4라운드 결정: 3D 핀이 작은 화면에서 점으로 뭉개진다). 첫 마운트에 한 번
  useEffect(() => {
    if (!window.matchMedia("(min-width: 768px)").matches) setView((v) => ({ ...v, tilt: false }))
  }, [])
  // 격상 진행선 남은 시간
  useEffect(() => {
    if (!demoProgress) return
    const tick = () => setRemain(Math.max(0, demoProgress.ms - (performance.now() - demoProgress.at)))
    tick()
    const id = window.setInterval(tick, 200)
    return () => window.clearInterval(id)
  }, [demoProgress])

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
  // 대응 단계 탭: 지도 자원 층을 그 단계가 동원하는 목록(MOBILIZED, 그래프 mobilizes와 같은 목록)대로 켠다. 단계가 바뀌면 지도도 바뀐다(냉독: 탭을 바꿔도 지도가 그대로였다). 시연은 장면이 직접 정한다
  const stageId = stage.id
  useEffect(() => {
    if (tab !== "stage" || demo !== null) return
    const mob = MOBILIZED[stageId]
    setView((v) => ({ ...v, layers: [...v.layers.filter((l) => !RESOURCE_LAYERS.includes(l)), ...RESOURCE_LAYERS.filter((r) => mob.includes(`lev-${r}`))] }))
  }, [tab, stageId, demo])
  const stageNote = stageView == null ? null : stageView === "calm" || stageView === "stage-0" ? "열선·살포기만 가동, 자재는 대기(흐림)" : stageView === "stage-1" ? "비치 자재 점등" : stageView === "stage-2" ? "제설함 확대·점등 · 제설차가 결빙구간 왕복" : "열선 없는 동 외곽 강조 · 제설차 왕복"

  const cue = (c: Omit<CameraCue, "seq">) => setCameraCue((p) => ({ ...c, seq: (p?.seq ?? 0) + 1 }))
  const resetAll = () => {
    setTab("gap")
    setView({ ...DEFAULT_VIEW, tilt: isMd })
    setColMetric(null)
    setSelectedDong(null)
    setSelectedNode(null)
    setFocusHeat(null)
    setFocusLabel(null)
    setFocusDetail(null)
    setFocusPoint(null)
    setOrbit(false)
    setFly(null)
    setLayersOpen(false)
    setResetSeq((v) => v + 1)
  }
  // 탭을 바꾸면 초점·카메라를 구 전체로(냉독: 확대된 채 탭이 바뀌어 "지도가 그대로"였다)
  const switchTab = (t: Tab) => {
    if (t === tab) return
    setTab(t)
    setLayersOpen(false)
    if (t !== "resources") setColMetric(null)
    if (t === "resources" && colMetric == null) setColMetric("materials")
    setFocusHeat(null)
    setFocusLabel(null)
    setFocusDetail(null)
    setFocusPoint(null)
    setSelectedDong(null)
    setOrbit(false)
    setFly(null)
    setResetSeq((v) => v + 1)
  }
  const onFinding = (f: Finding["focus"] | null, label?: string) => {
    if (!data || !f) return
    setFocusHeat(f.heat ?? null)
    setFocusLabel(label ?? null)
    setFocusDetail(null)
    setOrbit(false)
    if (f.layer) setView((v) => ({ ...v, layers: v.layers.includes(f.layer!) ? v.layers : [...v.layers, f.layer!] }))
    if (f.dong) {
      setSelectedDong(f.dong)
      const d = data.dongs.find((x) => x.d === f.dong)
      setFocusPoint(d ? d.center : null)
    } else {
      setFocusPoint(null)
      setSelectedDong(null)
      if (f.layer === "weak") {
        const b = boundsOf(data.weak.filter((w) => !w.heatCovered).map((w) => w.path))
        if (b) cue({ bounds: b, maxZoom: 15.2 })
      } else if (f.layer === "ice") {
        const b = boundsOf(data.ice.filter((s) => !s.heatCovered).map((s) => (s.method === "points" ? [s.a, s.b] : s.path)))
        if (b) cue({ bounds: b, maxZoom: 14.6 })
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
  const onSegment = (heatIds: number[] | null, layer: "weak" | "ice", pathIdx?: [number, number][], label?: string, detail?: string) => {
    setFocusHeat(heatIds && heatIds.length ? heatIds : null)
    setFocusLabel(label ?? null)
    setFocusDetail(detail ?? null)
    setFocusPoint(pathIdx && pathIdx.length ? segMid(pathIdx) : null)
    setOrbit(false)
    setSelectedDong(null)
    setView((v) => ({ ...v, layers: v.layers.includes(layer) ? v.layers : [...v.layers, layer] }))
    if (pathIdx) {
      const b = boundsOf([pathIdx])
      if (b) cue({ bounds: b, maxZoom: 16.2, pitch: 50 })
    }
    setMapCollapsed(false)
  }

  // 드론 비행 경유지 = 점검 후보마다 대표 지점 하나(시연 장면 6 · 레이어 패널 "드론 비행")
  const flyStops = useMemo<FlyStop[]>(() => {
    if (!data) return []
    const g = gapSummary(data)
    const noHeatWeak = data.weak.filter((w) => !w.heatCovered)
    const ll = (p: [number, number]): [number, number] => [p[1], p[0]]
    const stopFor = (id: string): [number, number] | null => {
      if (id === "c-material") {
        const w = data.weak.find((x) => x.gap)
        return w ? ll(segMid(w.path)) : null
      }
      if (id === "c-slope") {
        const w = noHeatWeak.find((x) => data.slopes.some((sl) => sl.weakNear.includes(x.i)))
        return w ? ll(segMid(w.path)) : null
      }
      if (id === "c-seoul") {
        const s = data.ice.map((x, i) => ({ ...x, src: "ice" as const, n: i + 1 })).find((x) => segOwner(x) === "시" && x.gap)
        return s ? ll(s.method === "points" ? s.a : segMid(s.path)) : null
      }
      if (id === "c-dong") {
        const d = data.dongs.find((x) => x.d === g.noHeatDongs[0])
        return d ? ll(d.center) : null
      }
      const sc = data.schools.find((x) => !x.heatNear.length && x.weakNear.length) ?? data.schools.find((x) => !x.heatNear.length)
      return sc ? [sc.lng, sc.lat] : null
    }
    return buildChecklist(data)
      .map((c, i) => ({ rank: i + 1, label: `${c.short} · ${c.dept}`, lnglat: stopFor(c.id) }))
      .filter((x): x is FlyStop => !!x.lnglat)
  }, [data])
  // ─── 시연 6장면(수치는 facts 파생). 4라운드: 5 지형 경사(경사면·화살) · 6 점검 후보 드론 비행 ───
  const scenes = useMemo<Scene[]>(() => {
    if (!data) return []
    const g = gapSummary(data)
    const t = totals(data)
    const top = heatTopDongs(data)
    const checks = buildChecklist(data)
    const later = (ms: number, fn: () => void) => demoTimers.current.push(window.setTimeout(fn, ms))
    const noHeatWeak = data.weak.filter((w) => !w.heatCovered)
    // 경사 장면: 자막이 말하는 가장 가파른 구간(slopes[0])이 있는 동 주변(냉독: 자막은 용마산로30길인데 카메라는 다른 동)
    const steepest = data.slopes[0]
    const slopeBox = boundsOf(data.slopes.filter((s) => s.d === steepest?.d).map((s) => s.coords))
    return [
      {
        title: "공백",
        caption: `적설취약구간 ${t.weak}곳 중 ${g.weakNoHeat}곳에 ${data.gaps.heatNearM}m 안 열선이 없습니다. 비치 자재도 없는 곳은 ${g.gu.none}곳입니다. 진홍 벽과 번호가 열선 없는 구간, 회색 선이 열선 있는 구간입니다.`,
        note: `서울시 관리 결빙구간 ${g.si.total}곳 중 ${g.si.none}곳은 열선도 자재도 없음(시 소관) · 행안부 적설취약구간 ${t.weak}곳 · 상습결빙구간 ${t.ice}곳 · 자원 기준일 ${data.asof.sand.slice(0, 7)}부터 ${data.asof.cacl.slice(0, 7)}까지`,
        apply: () => {
          setTab("gap")
          setDemoStage(null)
          setFocusHeat(null)
          setFocusPoint(null)
          setSelectedDong(null)
          setColMetric(null)
          setDemoProgress(null)
          // 열선은 끈다: "열선이 없다"는 장면에 열선 핀이 지도를 덮으면 말과 그림이 반대(냉독 지적). 진한 진홍 선 = 열선 없는 구간
          setView({ layers: ["weak", "ice"], tilt: true })
          const b = boundsOf(noHeatWeak.map((w) => w.path))
          cue({ bounds: b ?? undefined, maxZoom: 14.4, pitch: 55, bearing: -18, duration: 2200 })
          setOrbit(true)
        },
      },
      {
        title: "열선",
        caption: `열선 ${t.heatSeg}구간 중 ${top.reduce((s, d) => s + d.heatSeg, 0)}구간이 ${top.map((d) => d.d).join("·")}에 있습니다. 동별 기둥 높이가 구간 수입니다.`,
        note: `서울시 집계 2026-05 · 1차로 기준 ${t.heatM.toLocaleString("ko-KR")}m · 2025년 설치 ${t.heat2025}구간 · 확대하면 노란 점이 흐르는 선으로 바뀝니다`,
        apply: () => {
          setTab("resources")
          setDemoStage(null)
          setFocusHeat(null)
          setFocusPoint(null)
          setSelectedDong(null)
          setColMetric(null)
          setOrbit(false)
          setDemoProgress(null)
          setView({ layers: ["heat"], tilt: true })
          const b = boundsOf(heatPaths(data).filter((p) => p.length > 1))
          cue({ bounds: b ?? undefined, maxZoom: 14.9, pitch: 58, bearing: 12, duration: 2400 })
          // 도착 즈음 동별 열선 기둥이 솟는다(snow-map riseColumns)
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
          setFocusPoint(null)
          setSelectedDong(null)
          setColMetric(null)
          setOrbit(false)
          // 보강 단계는 열선만. 1단계에서 자재 3종이 켜지며 3D 핀이 솟는다(점등). 진행선은 3단계 도착까지
          setView({ layers: ["heat", "ice"], tilt: true })
          setDemoProgress({ key: Date.now(), ms: 7400, at: performance.now() })
          cue({ maxZoom: 13.6, pitch: 50, bearing: -18, duration: 1800 })
          later(2400, () => {
            setSimCm(3)
            setDemoStage("stage-1")
            setView({ layers: ["heat", "ice", "salt", "cacl", "sand"], tilt: true })
            setDemoCaption(`예보 적설 3cm이면 1단계입니다. 자원 6종을 동원하고 비치 자재 ${t.materials.toLocaleString("ko-KR")}개소가 켜집니다.`)
          })
          later(4800, () => {
            setSimCm(5)
            setDemoStage("stage-2")
            setDemoCaption(`예보 적설 5cm이면 2단계입니다. 자원 8종을 동원합니다. 간선도로 제설함 ${t.salt}개소가 커지고 제설 장비 ${data.ops.unimog + data.ops.dump15t}대가 결빙구간을 왕복합니다.`)
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
          setFocusPoint(null)
          setSelectedDong(null)
          setColMetric("materials")
          setDemoProgress(null)
          setView({ layers: ["heat", "salt", "cacl", "sand", "weak"], tilt: true })
          const b = boundsOf(g.noHeatDongs.map((d) => dongBounds(data, d)).filter((x): x is NonNullable<typeof x> => !!x).map((b) => [[b[0][1], b[0][0]], [b[1][1], b[1][0]]] as [number, number][]))
          // 방위는 다른 장면과 같게(-18). 장면마다 방향이 돌면 "어디 보는지" 재학습 비용(냉독 지적). 회전은 장면 1만
          cue({ bounds: b ?? undefined, maxZoom: 14.6, pitch: 55, bearing: -18, duration: 2400 })
        },
      },
      {
        title: "지형 경사",
        caption: `지형 고도로 추정한 급경사 이면도로 ${t.slopes}구간 ${g.slopeKm}km 중 ${g.slopeNoHeat}구간에 열선이 없습니다. 보라 경사면이 높이차, 화살이 오르막 방향입니다.`,
        note: `가장 가파른 곳 ${steepest?.name ?? ""} ${steepest?.grade ?? ""}%(높이차 ${steepest?.rise ?? ""}m) · 100m 창 8~20% · 고가·제방 옆 제외 · 행안부 취약구간 ${data.gaps.weakOnSlope}곳이 겹침 · 추정치`,
        apply: () => {
          setTab("gap")
          setDemoStage(null)
          setColMetric(null)
          setFocusHeat(null)
          setFocusPoint(null)
          setSelectedDong(null)
          setDemoProgress(null)
          setView({ layers: ["slope", "weak"], tilt: true })
          cue({ bounds: slopeBox ?? undefined, maxZoom: 15.2, pitch: 55, bearing: -18, duration: 2600 })
          setOrbit(true)
        },
      },
      {
        title: "점검 후보",
        caption: `눈 오기 전 점검 후보 ${checks.length}곳을 차례로 봅니다: ${checks.map((c) => c.short).join(" · ")}.`,
        note: `부서·기한·규모·완료 기준은 공백 탭 01에 · 눈이 14시에 그치면 건축물관리자는 18시까지 보도와 이면도로를 치웁니다(조례 제5조) · 근거 그래프 판단 ${graph?.nodes.filter((n) => n.type === "Claim").length ?? 0}개가 관측에 연결돼 있습니다`,
        apply: () => {
          setTab("gap")
          setDemoStage(null)
          setColMetric(null)
          setFocusHeat(null)
          setFocusPoint(null)
          setSelectedDong(null)
          setOrbit(false)
          setDemoProgress(null)
          setView({ layers: ["heat", "weak", "ice", "school"], tilt: true })
          setFly(flyStops)
        },
      },
    ]
  }, [data, graph, flyStops])

  useEffect(() => {
    if (demo === null || !scenes[demo]) return
    for (const t of demoTimers.current) window.clearTimeout(t)
    demoTimers.current = []
    setDemoCaption(null)
    setFly(null)
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
    setDemoProgress(null)
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
  // 시연 중에는 왼쪽 카드를 제목만 남기고 접는다(냉독 S2-10). 지도가 그 자리를 쓴다
  const demoOn = demo !== null && isXl
  const fitPadding: { tl: [number, number]; br: [number, number] } = isMd
    ? demoOn
      ? { tl: [24, 76 + 8 + 64], br: [16 + RIGHT_W + 24, 140] }
      : { tl: [16 + sideW + 56, 76 + 8], br: [16 + RIGHT_W + 24, 24] }
    : { tl: [8, 104 + 8], br: [8, typeof window !== "undefined" ? Math.max(8, window.innerHeight * 0.48 + 8) : 8] }
  const counts: Partial<Record<LayerId, string>> = data
    ? { weak: `${data.weak.length}곳`, ice: `${data.ice.length}곳`, slope: `${data.slopes.length}구간`, school: `${data.schools.length}교`, heat: `${data.heat.length}구간`, salt: `${data.salt.length}`, cacl: `${data.cacl.length}`, sand: `${data.sand.length}` }
    : {}
  const slopeOn = view.layers.includes("slope") && rightPane === "map" && !!data
  const layerPanel = (
    <LayerPanel
      view={view}
      onChange={setView}
      dark={dark}
      counts={counts}
      controls={{
        orbit,
        fly: !!fly,
        demo: demo !== null,
        demoAvailable: isXl && !!data,
        onOrbit: setOrbit,
        onFly: (v) => setFly(v && flyStops.length ? flyStops : null),
        onDemo: (v) => (v ? setDemo(0) : endDemo()),
      }}
    />
  )
  const legend = <Legend dark={dark} tilt={view.tilt} ownerView={tab === "law"} stageLabel={stageView ? (stageView === "calm" ? "평시" : stageView === "stage-0" ? "보강" : stageView.replace("stage-", "") + "단계") : ""} stageNote={stageNote} />

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
            focusPoint={focusPoint}
            tilt={view.tilt}
            orbit={orbit}
            ownerView={tab === "law"}
            rankDigits={demo === 1}
            trucks={stageView === "stage-2" || stageView === "stage-3"}
            fly={fly}
            theme={theme}
            resetSeq={resetSeq}
            cameraCue={cameraCue}
            fitPadding={fitPadding}
            onSelectDong={(d) => setSelectedDong(d)}
            onOrbitStop={() => {
              setOrbit(false)
              setFly(null)
            }}
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
              <h1 className="whitespace-nowrap text-[15px] font-extrabold leading-none tracking-[-0.015em] text-[var(--cp-text-strong)]">{isMd ? "광진 제설 상황판" : "광진 제설"}</h1>
              {/* 상태 한 줄(보고받는 사람이 먼저 묻는 것): 대책기간 안이면 단계·적설·특보, 밖이면 데이터 규모 */}
              <span className="dump-kicker mt-1 hidden truncate text-[10px] text-[var(--cp-text-dim)] md:block">
                {inSeason && fc ? `${stage.label} · 24시간 적설 ${fc.snow24}cm · ${fc.warning?.level === "warning" ? "대설경보" : fc.warning?.level === "advisory" ? "대설주의보" : "특보 없음"}` : data ? `열선 ${data.heat.length}구간 · 자재 ${(data.salt.length + data.cacl.length + data.sand.length).toLocaleString("ko-KR")}개소 · 취약구간 ${data.weak.length + data.ice.length}곳` : "겨울철 제설대책"}
              </span>
            </span>
          </button>
          <div className="pointer-events-auto ml-auto flex shrink-0 items-center gap-2">
            {rightPane === "map" && (
              <button onClick={() => setLayersOpen((v) => !v)} aria-expanded={layersOpen} className={`dump-fl lg-shell relative rounded-full px-3.5 py-2 text-[13px] font-semibold md:hidden ${layersOpen ? "text-(--dump-accent)" : "text-[var(--cp-text-strong)]"}`}>
                레이어
              </button>
            )}
            {isXl && data && (
              <button
                type="button"
                onClick={() => (demo === null ? setDemo(0) : endDemo())}
                aria-pressed={demo !== null}
                title="시연 모드: 6장면. 방향키로 이동, Esc로 나가기"
                className={`dump-fl lg-shell relative flex items-center gap-1.5 rounded-full px-3.5 py-2 text-[13px] font-semibold transition-colors hover:text-(--dump-accent) ${demo !== null ? "!bg-[var(--dump-ink)] !text-[var(--dump-paper)]" : "text-[var(--cp-text-strong)]"}`}
              >
                <Ico name="monitor" size={14} />
                {demo !== null ? "시연 끝" : "시연"}
              </button>
            )}
            {data && (
              <button onClick={() => setMethods(true)} className="dump-fl lg-shell group relative rounded-full px-3.5 py-2 text-[13px] font-semibold text-[var(--cp-text-strong)] transition-colors hover:text-(--dump-accent)">
                {isMd ? "데이터·방법" : "데이터"}
                <Ico name="arrow" size={13} className="ml-1 hidden transition-transform group-hover:translate-x-0.5 md:inline-block" />
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
      <aside className={`dump-fl lg-shell absolute inset-x-0 bottom-0 top-[var(--dump-sheet-top)] z-[1050] flex flex-col rounded-t-2xl p-[6px] md:inset-x-auto md:left-4 ${TOP} md:w-[var(--dump-side-w,440px)] md:rounded-2xl ${demoOn ? "md:bottom-auto" : "md:bottom-4"}`}>
        <div className="lg-inner flex min-h-0 flex-1 flex-col overflow-hidden rounded-t-[11px] md:rounded-[11px]">
          {demoOn && scenes[demo] && (
            <div className="px-4 py-3">
              <span className="dump-kicker block text-[10px] text-[var(--cp-text-dim)]">시연 중 · {TABS.find((t) => t.id === tab)?.label}</span>
              <p className="mt-1 text-[14px] leading-snug text-[var(--cp-text-muted)]">카드는 시연이 끝나면 돌아옵니다. Esc 또는 끝 버튼으로 마칩니다.</p>
            </div>
          )}
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
          <div key={tab} className={`min-h-0 flex-1 overflow-y-auto [scrollbar-width:thin] ${demoOn ? "hidden" : ""}`}>
            {tab === "gap" && <GapPanel data={data} activeLabel={focusLabel} onFocus={onFinding} onSelectSegment={onSegment} onOpenMethods={() => setMethods(true)} />}
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
            {tab === "law" && <LawPanel data={data} dark={dark} />}
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

      {/* 지도 위 칩: 지금 보는 곳(구간·발견 카드 클릭 뒤. 누르면 구 전체로) · 급경사 추정 수치(레이어를 켜면). 카드 오른쪽 위 한 줄 */}
      {rightPane === "map" && demo === null && (focusLabel || selectedDong || slopeOn) && (
        <div className="pointer-events-none absolute z-[1046] flex flex-wrap items-center gap-2 md:top-[76px]" style={{ left: isMd ? "calc(16px + var(--dump-side-w, 440px) + 16px)" : 12, top: isMd ? undefined : 108, right: isMd ? RIGHT_W + 32 : 12 }}>
          {(focusLabel || selectedDong) && (
            <button
              onClick={() => {
                setFocusLabel(null)
                setFocusHeat(null)
                setFocusPoint(null)
                setSelectedDong(null)
                setResetSeq((v) => v + 1)
              }}
              className="dump-fl lg-shell lg-dense pointer-events-auto flex items-center gap-2 rounded-full px-3.5 py-1.5 text-[13px] text-[var(--cp-text-strong)]"
            >
              <span className="dump-kicker text-[10px] text-[var(--cp-text-dim)]">지금 보는 곳</span>
              <span className="font-semibold">{focusLabel ?? selectedDong}</span>
              {focusDetail && <span className="text-[12.5px] text-[var(--cp-text-muted)]">{focusDetail}</span>}
              <span aria-hidden className="text-[var(--cp-text-dim)]">✕</span>
            </button>
          )}
          {slopeOn && data && (
            <button onClick={() => setView((v) => ({ ...v, layers: v.layers.filter((l) => l !== "slope") }))} className="dump-fl lg-shell lg-dense pointer-events-auto flex items-center gap-2 rounded-full px-3.5 py-1.5 text-[13px] text-[var(--cp-text-strong)]" title="급경사 추정 레이어 끄기">
              <i className="h-1 w-4 shrink-0 rounded-full" style={{ background: dark ? "#b48ee8" : "#6d4fb3" }} aria-hidden />
              <span className="dump-kicker text-[10px] text-[var(--cp-text-dim)]">지형 추정</span>
              <span className="font-semibold">
                경사 {data.slopes.length}구간 중 열선 없음 {data.gaps.slopeNoHeat}
              </span>
              <span aria-hidden className="text-[var(--cp-text-dim)]">✕</span>
            </button>
          )}
        </div>
      )}
      {/* 오른쪽 열: 레이어 패널 › 범례. 900px 높이에서 둘이 열을 넘치면(4라운드 보기 그룹·범례 두 줄) 열 안에서 스크롤. 바닥 140px는 줌 버튼 자리 */}
      {rightPane === "map" && (
        <div className={`pointer-events-none absolute bottom-[108px] right-4 ${TOP} z-[1050] hidden flex-col gap-2 overflow-y-auto [scrollbar-width:none] md:flex`} style={{ width: RIGHT_W }}>
          <div className="dump-fl lg-shell lg-dense pointer-events-auto relative shrink-0 rounded-2xl">{layerPanel}</div>
          <div className="dump-fl lg-shell lg-dense pointer-events-auto relative mt-auto shrink-0 rounded-2xl">{legend}</div>
        </div>
      )}

      {/* 시연 캡션(xl 이상) */}
      {rightPane === "map" && demo !== null && scenes[demo] && (
        <div className="dump-fl lg-shell lg-dense absolute z-[1045] hidden rounded-2xl xl:block" style={{ left: 16, right: RIGHT_W + 32, bottom: 20 }} aria-live="polite">
          {demoProgress && (
            <div className="absolute inset-x-5 top-0 h-[2px] overflow-hidden rounded-full bg-[var(--cp-track)]" aria-hidden>
              <i key={demoProgress.key} className="snow-progress block h-full rounded-full bg-(--dump-accent)" style={{ animationDuration: `${demoProgress.ms}ms` }} />
            </div>
          )}
          <div className="flex items-start gap-4 px-5 py-3.5">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="dump-kicker text-[10.5px] text-[var(--cp-text-dim)]">
                  시연 {demo + 1} / {scenes.length} · {scenes[demo].title}
                  {demoProgress && remain > 0 && ` · 자동 격상 ${Math.ceil(remain / 1000)}초`}
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
