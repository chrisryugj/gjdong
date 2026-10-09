"use client"

import { useEffect, useRef } from "react"
import { precipOf, tintOf, type SkyWeather } from "@/lib/dumping/map-weather"

// 빗줄기·눈송이·안개 덮개(23라운드, 지도 날씨). 지도 캔버스가 아니라 그 위 2D 캔버스에 그린다:
// 지도를 매 프레임 다시 그리면 위에 뜬 유리 패널 굴절도 매 프레임 다시 계산돼 회전 fps가 반이 됐다(19라운드 실측).
// 그래서 카드·열이 가리지 않는 지도 영역(inset)에만 깔고 가장자리는 서서히 지운다. 움직임 줄이기면 멈춘 한 장, 탭이 숨으면 쉰다
interface Props {
  sky: SkyWeather
  dark: boolean
  inset: { top: number; left: number; right: number; bottom: number }
}

const EDGE = 48 // 가장자리 흐림 폭(px)

export default function WeatherOverlay({ sky, dark, inset }: Props) {
  const ref = useRef<HTMLCanvasElement>(null)
  const p = precipOf(sky)
  useEffect(() => {
    const cv = ref.current
    if (!cv || (p.kind !== "rain" && p.kind !== "snow")) return
    const ctx = cv.getContext("2d")
    if (!ctx) return
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches
    let w = 0
    let h = 0
    let dpr = 1
    // 캔버스 크기는 바뀔 때만 다시 준다(같은 값이라도 대입하면 지워져 움직임 줄이기의 멈춘 한 장이 사라졌다)
    const resize = () => {
      dpr = Math.min(2, window.devicePixelRatio || 1)
      w = cv.clientWidth
      h = cv.clientHeight
      const cw = Math.max(1, Math.round(w * dpr))
      const ch = Math.max(1, Math.round(h * dpr))
      if (cv.width === cw && cv.height === ch) return false
      cv.width = cw
      cv.height = ch
      return true
    }
    resize()
    const ro = new ResizeObserver(() => {
      if (resize() && reduce) draw(performance.now())
    })
    const n = p.count
    const rain = p.kind === "rain"
    // 입자: 자리·빠르기·크기(가까운 것일수록 크고 빠르다 = 깊이감)·흔들림 위상
    const xs = new Float32Array(n)
    const ys = new Float32Array(n)
    const ks = new Float32Array(n)
    const ph = new Float32Array(n)
    for (let i = 0; i < n; i++) {
      xs[i] = Math.random() * Math.max(1, w)
      ys[i] = Math.random() * Math.max(1, h)
      ks[i] = Math.random()
      ph[i] = Math.random() * Math.PI * 2
    }
    const color = rain ? (dark ? "rgba(176,196,222,0.55)" : "rgba(92,116,148,0.55)") : dark ? "rgba(225,234,245,0.85)" : "rgba(255,255,255,0.92)"
    const rim = dark ? "rgba(20,28,36,0.25)" : "rgba(120,134,150,0.35)"
    let raf = 0
    let last = performance.now()
    const draw = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, w, h)
      if (rain) {
        ctx.strokeStyle = color
        ctx.lineCap = "round"
        ctx.lineWidth = 1.3
        ctx.beginPath()
        for (let i = 0; i < n; i++) {
          const v = 760 + ks[i] * 520
          const len = 11 + ks[i] * 15
          ys[i] += v * dt
          xs[i] -= v * 0.2 * dt
          if (ys[i] > h + len) {
            ys[i] = -len - Math.random() * 40
            xs[i] = Math.random() * (w + 80)
          }
          if (xs[i] < -20) xs[i] += w + 40
          ctx.moveTo(xs[i], ys[i])
          ctx.lineTo(xs[i] + len * 0.2, ys[i] - len)
        }
        ctx.stroke()
      } else {
        for (let i = 0; i < n; i++) {
          const r = 1.1 + ks[i] * 2.3
          ys[i] += (28 + ks[i] * 52) * dt
          xs[i] += Math.sin(now / 1100 + ph[i]) * (0.25 + ks[i] * 0.35)
          if (ys[i] > h + 4) {
            ys[i] = -4
            xs[i] = Math.random() * w
          }
          ctx.beginPath()
          ctx.arc(xs[i], ys[i], r, 0, Math.PI * 2)
          ctx.fillStyle = color
          ctx.fill()
          // 흰 종이 위에서도 보이게 큰 눈송이만 옅은 테두리
          if (r > 2.4) {
            ctx.lineWidth = 0.6
            ctx.strokeStyle = rim
            ctx.stroke()
          }
        }
      }
      if (!reduce && !document.hidden) raf = requestAnimationFrame(draw)
    }
    raf = requestAnimationFrame(draw)
    ro.observe(cv)
    const onVis = () => {
      if (document.hidden || reduce) return
      cancelAnimationFrame(raf)
      last = performance.now()
      raf = requestAnimationFrame(draw)
    }
    document.addEventListener("visibilitychange", onVis)
    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      document.removeEventListener("visibilitychange", onVis)
    }
  }, [p.kind, p.count, dark])

  const tint = tintOf(sky, dark)
  // 지도 전체 옅은 색조(흐림·비·눈). 움직이지 않으니 유리 패널 밑에 깔려도 굴절을 다시 계산하지 않는다
  const tintLayer = tint ? <div aria-hidden className="pointer-events-none absolute inset-0 transition-colors duration-700" style={{ background: tint }} /> : null
  if (!p.kind) return tintLayer
  if (p.kind === "fog") {
    // 안개는 움직이지 않는 덮개 한 장(가장자리일수록 짙다). 지도 하늘 안개(MapLibre sky)와 같이 쓴다
    const a = Math.min(1, sky.level + 0.25)
    const c = dark ? "150,164,180" : "238,241,243"
    return (
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 transition-opacity duration-700"
        style={{ background: `radial-gradient(ellipse at 55% 55%, rgba(${c},${0.18 * a}) 0%, rgba(${c},${0.55 * a}) 62%, rgba(${c},${0.82 * a}) 100%)` }}
      />
    )
  }
  const mask = `linear-gradient(to right, transparent, #000 ${EDGE}px, #000 calc(100% - ${EDGE}px), transparent), linear-gradient(to bottom, transparent, #000 ${EDGE}px, #000 calc(100% - ${EDGE}px), transparent)`
  return (
    <>
      {tintLayer}
      <canvas
      ref={ref}
      aria-hidden
      className="pointer-events-none absolute"
      style={{ left: inset.left, top: inset.top, right: inset.right, bottom: inset.bottom, width: `calc(100% - ${inset.left + inset.right}px)`, height: `calc(100% - ${inset.top + inset.bottom}px)`, maskImage: mask, WebkitMaskImage: mask, maskComposite: "intersect", WebkitMaskComposite: "source-in" }}
      />
    </>
  )
}
