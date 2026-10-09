// /dumping 입체 지도 비행(25라운드, 2026-10-10). 첫 화면 진입 비행과 자유 비행. dumping-map.tsx 가 부른다(그 파일이 1,100줄을 넘어 나눴다).
// 진입 비행(사용자: "초기화면 wow 를 고민해 봐, 자유비행은 어떤가" → 결론으로 내려앉는 짧은 비행 + 자유 비행은 버튼, 사용자 채택):
//   커튼이 걷히면 보이는 구 전체에서 다가구·단독 골목으로 내려앉고(가는 동안 다가구 초록이 골목에서 번진다), 골목에서 과태료 빛기둥이 둘레로 솟은 뒤
//   구 전체로 물러나 결론 카드와 겹친다. 9초 남짓. 세션마다 한 번, 움직임 줄이기 설정·좁은 화면이면 하지 않는다(대시보드가 정한다).
//   출발 구도를 커튼 뒤에 미리 깔지 않는다: 그래프 탭에 다녀와 지도를 다시 만들면 그 구도에 서 버렸고, 커튼이 걷히기 전 조작으로 비행이 취소되면 그 자리에 남았다
//   누르기·휠·키 등 조작이 하나라도 오면 그 자리에서 멈추고 결론(초록·빛기둥)을 바로 세운다.
// 자유 비행: 드론 높이로 내려가 W·S(↑↓) 앞뒤, A·D(←→) 돌기, Q·E 오르내리기, 끌어서 둘러보기, Shift 빠르게, Esc 나가기.
//   지도 기본 끌기·회전·키보드·상자 확대는 그동안 끄고, 기울기 상한을 82도로 올렸다가 나갈 때 되돌린다. 속도는 높이에 비례(줌 17에서 초속 40m).
//   키는 e.code(자판 자리)로 읽는다: 한글 자판에서 Shift 를 누르면 ㅈ·ㅂ·ㄷ 이 ㅉ·ㅃ·ㄸ 이 돼 e.key 로는 떼기를 놓쳐 드론이 멈추지 않았다(fresh 검증)
import * as maplibregl from "maplibre-gl"
import type { Map as MlMap, PaddingOptions } from "maplibre-gl"

/** start 비행 시작(지도가 준비돼 실제로 날기 시작) · green 다가구 초록 · beams 과태료 빛기둥 · end 끝(조작으로 멈춘 것 포함) */
export type IntroEvent = "start" | "green" | "beams" | "end"
export interface CameraPose {
  center: [number, number]
  zoom: number
  pitch: number
  bearing: number
}

const inOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)
const STOP_ON = ["wheel", "dragstart"] as const

/** 진입 비행을 시작한다. 단계마다 on(start·green·beams·end). 돌려준 함수는 조용히 멈춘다(end 를 부르지 않는다: 다른 조작이 지도를 넘겨받았을 때).
 * 멈춤은 지도 상자의 누르기(캡처, 확대·나침반 단추 포함: 캔버스 밖이라 지도 mousedown 으로는 못 잡아 다음 예약 이동이 단추 확대를 덮었다)·휠·끌기·키 */
export function runIntro(map: MlMap, alley: [number, number] | null, final: CameraPose, on: (e: IntroEvent) => void): () => void {
  let alive = true
  const timers: number[] = []
  const at = (ms: number, fn: () => void) => timers.push(window.setTimeout(() => alive && fn(), ms))
  const detach = () => {
    alive = false
    for (const t of timers) window.clearTimeout(t)
    for (const e of STOP_ON) map.off(e, interrupt)
    box.removeEventListener("pointerdown", interrupt, true)
    window.removeEventListener("keydown", interrupt)
  }
  const finish = () => {
    if (!alive) return
    detach()
    on("end")
  }
  function interrupt() {
    map.stop()
    finish()
  }
  const box = map.getContainer()
  for (const e of STOP_ON) map.on(e, interrupt)
  box.addEventListener("pointerdown", interrupt, true)
  window.addEventListener("keydown", interrupt)
  on("start")
  const fb = final.bearing
  if (alley) {
    map.flyTo({ center: alley, zoom: 16.1, pitch: 63, bearing: fb + 32, duration: 3600, curve: 1.25, easing: inOut, essential: true })
    at(1400, () => on("green"))
    at(3500, () => on("beams"))
    at(3650, () => map.easeTo({ bearing: fb + 44, duration: 1500, easing: (t) => t, essential: true }))
    at(5150, () => map.easeTo({ ...final, duration: 3400, easing: inOut, essential: true }))
    at(8700, finish)
  } else {
    on("green")
    map.easeTo({ ...final, duration: 4000, easing: inOut, essential: true })
    at(2000, () => on("beams"))
    at(4300, finish)
  }
  return () => {
    if (!alive) return
    detach()
    map.stop()
  }
}

export type FlightKey = "w" | "s" | "a" | "d" | "q" | "e"
/** 자판 자리(e.code) → 조작. 한글·영문 자판 모두 같은 자리 */
const CODE_OF: Record<string, FlightKey | "shift"> = {
  KeyW: "w", ArrowUp: "w", KeyS: "s", ArrowDown: "s", KeyA: "a", ArrowLeft: "a", KeyD: "d", ArrowRight: "d",
  KeyQ: "q", PageUp: "q", KeyE: "e", PageDown: "e", ShiftLeft: "shift", ShiftRight: "shift",
}
const MAX_PITCH = 68 // 지도 기본(dumping-map maxPitch)
const FLIGHT_PITCH = 82
const ZOOM_RANGE: [number, number] = [14.6, 18.4]

/** 자유 비행. start() 로 드론 높이로 내려가 조작을 받고, stop() 으로 지도 기본 조작을 되돌린다 */
export class FreeFlight {
  private readonly keys = new Set<FlightKey | "shift">()
  private readonly vel = { f: 0, turn: 0, up: 0 }
  private raf = 0
  private last = 0
  private drag: { x: number; y: number; id: number } | null = null
  private running = false
  /** 드론 높이로 내려가는 easeTo 가 끝나는 때(그 전엔 조작을 쉰다: jumpTo 가 진행 중인 이동을 끊는다. maplibre 6 지도엔 isEasing 이 없다) */
  private readyAt = 0
  private pitchTimer = 0

  constructor(
    private readonly map: MlMap,
    private readonly onExit: () => void,
    /** 지금 보이는 지도 영역(카드를 숨긴 여백). 내려가는 easeTo 에 같이 실어야 대시보드의 여백 easeTo 를 끊지 않는다 */
    private readonly padding: () => PaddingOptions,
  ) {}

  start() {
    const m = this.map
    if (this.running) return
    this.running = true
    window.clearTimeout(this.pitchTimer)
    m.dragPan.disable()
    m.dragRotate.disable()
    m.keyboard.disable()
    m.boxZoom.disable()
    m.setMaxPitch(FLIGHT_PITCH)
    m.easeTo({ zoom: Math.min(ZOOM_RANGE[1], Math.max(m.getZoom(), 16.9)), pitch: 76, padding: this.padding(), duration: 1100, essential: true })
    this.readyAt = performance.now() + 1150
    window.addEventListener("keydown", this.onDown)
    window.addEventListener("keyup", this.onUp)
    window.addEventListener("blur", this.clear)
    m.getCanvasContainer().addEventListener("pointerdown", this.onPointerDown)
    m.getCanvasContainer().addEventListener("contextmenu", this.noMenu)
    window.addEventListener("pointermove", this.onPointerMove)
    window.addEventListener("pointerup", this.onPointerUp)
    this.last = performance.now()
    this.raf = requestAnimationFrame(this.step)
  }

  stop() {
    if (!this.running) return
    this.running = false
    cancelAnimationFrame(this.raf)
    const m = this.map
    window.removeEventListener("keydown", this.onDown)
    window.removeEventListener("keyup", this.onUp)
    window.removeEventListener("blur", this.clear)
    m.getCanvasContainer().removeEventListener("pointerdown", this.onPointerDown)
    m.getCanvasContainer().removeEventListener("contextmenu", this.noMenu)
    window.removeEventListener("pointermove", this.onPointerMove)
    window.removeEventListener("pointerup", this.onPointerUp)
    m.dragPan.enable()
    m.dragRotate.enable()
    m.keyboard.enable()
    m.boxZoom.enable()
    if (m.getPitch() > MAX_PITCH) m.easeTo({ pitch: 60, duration: 700 })
    this.pitchTimer = window.setTimeout(() => m.setMaxPitch(MAX_PITCH), 760)
    this.clear()
  }

  /** 화면 단추(누르는 동안) */
  press(k: FlightKey, on: boolean) {
    if (on) this.keys.add(k)
    else this.keys.delete(k)
  }

  private clear = () => {
    this.keys.clear()
    this.drag = null
  }

  // 오른쪽 끌기로 둘러볼 때 브라우저 메뉴가 뜨지 않게(dragRotate 를 끄면 maplibre 가 막던 것도 꺼진다)
  private noMenu = (e: Event) => e.preventDefault()

  private onDown = (e: KeyboardEvent) => {
    const t = e.target as HTMLElement | null
    if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return
    if (e.key === "Escape") {
      e.preventDefault()
      this.onExit()
      return
    }
    const k = CODE_OF[e.code]
    if (!k) return
    this.keys.add(k)
    e.preventDefault()
  }

  private onUp = (e: KeyboardEvent) => {
    const k = CODE_OF[e.code]
    if (k) this.keys.delete(k)
  }

  private onPointerDown = (e: PointerEvent) => {
    if (e.button !== 0 && e.button !== 2) return
    this.drag = { x: e.clientX, y: e.clientY, id: e.pointerId }
  }

  private onPointerMove = (e: PointerEvent) => {
    const d = this.drag
    if (!d || e.pointerId !== d.id || performance.now() < this.readyAt) return
    const m = this.map
    const dx = e.clientX - d.x
    const dy = e.clientY - d.y
    d.x = e.clientX
    d.y = e.clientY
    m.jumpTo({ bearing: m.getBearing() + dx * 0.22, pitch: Math.min(FLIGHT_PITCH, Math.max(30, m.getPitch() - dy * 0.18)) })
  }

  private onPointerUp = (e: PointerEvent) => {
    if (this.drag?.id === e.pointerId) this.drag = null
  }

  private step = (t: number) => {
    if (!this.running) return
    const dt = Math.min(0.05, (t - this.last) / 1000)
    this.last = t
    const k = this.keys
    const want = {
      f: (k.has("w") ? 1 : 0) - (k.has("s") ? 1 : 0),
      turn: (k.has("d") ? 1 : 0) - (k.has("a") ? 1 : 0),
      up: (k.has("q") ? 1 : 0) - (k.has("e") ? 1 : 0),
    }
    const a = Math.min(1, dt * 6)
    const v = this.vel
    v.f += (want.f - v.f) * a
    v.turn += (want.turn - v.turn) * a
    v.up += (want.up - v.up) * a
    const m = this.map
    if ((Math.abs(v.f) > 0.002 || Math.abs(v.turn) > 0.002 || Math.abs(v.up) > 0.002) && t >= this.readyAt) {
      const zoom = m.getZoom()
      const bearing = m.getBearing() + v.turn * 55 * dt
      const speed = 40 * Math.pow(2, 17 - zoom) * (k.has("shift") ? 2.6 : 1)
      const dist = v.f * speed * dt
      const c = maplibregl.MercatorCoordinate.fromLngLat(m.getCenter())
      const per = c.meterInMercatorCoordinateUnits()
      const r = (bearing * Math.PI) / 180
      const next = new maplibregl.MercatorCoordinate(c.x + Math.sin(r) * dist * per, c.y - Math.cos(r) * dist * per)
      m.jumpTo({ center: next.toLngLat(), bearing, zoom: Math.min(ZOOM_RANGE[1], Math.max(ZOOM_RANGE[0], zoom - v.up * 0.8 * dt)) })
    }
    this.raf = requestAnimationFrame(this.step)
  }
}
