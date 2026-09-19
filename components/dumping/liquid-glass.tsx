"use client"

import { useEffect } from "react"
import { GLASS_EVENT, readGlass } from "./glass-dial"

// Liquid Glass 런타임(18라운드, sunlight-fund components/sun/liquid-glass.tsx 이식). 유리 뒤 콘텐츠를 실제로 굴절시킨다(feDisplacementMap + backdrop-filter: url()).
// - `.lg-shell` 요소마다 크기·모서리에 맞는 변위 맵(캔버스)을 만들어 전용 SVG 필터를 붙인다. 가장자리로 갈수록 바깥으로 밀어 렌즈 림처럼 보인다.
// - 색수차: R·G·B를 조금씩 다른 세기로 굴절시켜 가장자리에 아주 옅은 색 번짐.
// - 스펙큘러: 포인터 위치를 --px/--py로 흘려 하이라이트가 손을 따라 움직인다.
// - backdrop-filter에 url() 필터를 못 그리는 브라우저(사파리 등)는 html.lg-on이 안 붙어 흐림 유리(CSS)로 폴백.

const MAX_MAP = 384 // 변위 맵 최대 변 길이(px). 더 크면 캔버스 비용만 는다
const BAND = 0.16 // 굴절 띠 폭 (짧은 변 대비)

function supportsUrlBackdrop(): boolean {
  if (typeof window === "undefined") return false
  const ua = navigator.userAgent
  const chromium = /Chrome\/\d+/.test(ua) && !/Edg\/|OPR\//.test(ua) ? true : /Edg\/|OPR\//.test(ua)
  const safari = /Safari\//.test(ua) && !/Chrome\//.test(ua)
  if (safari) return false // WebKit은 backdrop-filter: url() 미지원
  const ok = CSS.supports("backdrop-filter", "url(#x)") || CSS.supports("-webkit-backdrop-filter", "url(#x)")
  return ok && chromium
}

/** 둥근 사각형 가장자리 굴절 변위 맵. R=x변위, G=y변위 (128이 0) */
function buildMap(w: number, h: number, radius: number): string {
  const scale = Math.min(1, MAX_MAP / Math.max(w, h))
  const W = Math.max(8, Math.round(w * scale))
  const H = Math.max(8, Math.round(h * scale))
  const r = Math.min(radius * scale, W / 2, H / 2)
  const band = Math.max(6, Math.min(W, H) * BAND)
  const c = document.createElement("canvas")
  c.width = W
  c.height = H
  const ctx = c.getContext("2d")!
  const img = ctx.createImageData(W, H)
  const d = img.data
  const cx = W / 2
  const cy = H / 2
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      // 둥근 사각형의 부호 거리(안쪽 음수)
      const qx = Math.abs(x + 0.5 - cx) - (W / 2 - r)
      const qy = Math.abs(y + 0.5 - cy) - (H / 2 - r)
      const outside = Math.hypot(Math.max(qx, 0), Math.max(qy, 0))
      const inside = Math.min(Math.max(qx, qy), 0)
      const sd = outside + inside - r // <0 안쪽
      const depth = Math.max(0, Math.min(1, 1 + sd / band)) // 가장자리 1 → 띠 안쪽 0
      const mag = depth * depth
      // 바깥 방향 단위 벡터(둥근 모서리는 모서리 중심 기준)
      let nx = x + 0.5 - cx
      let ny = y + 0.5 - cy
      const ax = Math.abs(nx)
      const ay = Math.abs(ny)
      if (ax > W / 2 - r && ay > H / 2 - r) {
        nx = Math.sign(nx) * (ax - (W / 2 - r))
        ny = Math.sign(ny) * (ay - (H / 2 - r))
      } else if (ax / (W / 2) > ay / (H / 2)) ny = 0
      else nx = 0
      const len = Math.hypot(nx, ny) || 1
      const dx = (nx / len) * mag
      const dy = (ny / len) * mag
      const i = (y * W + x) * 4
      d[i] = Math.round(128 + dx * 127)
      d[i + 1] = Math.round(128 + dy * 127)
      d[i + 2] = 128
      d[i + 3] = 255
    }
  }
  ctx.putImageData(img, 0, 0)
  return c.toDataURL("image/png")
}

const SVG_NS = "http://www.w3.org/2000/svg"

function makeFilter(id: string, href: string, strength: number): SVGFilterElement {
  const f = document.createElementNS(SVG_NS, "filter")
  f.setAttribute("id", id)
  f.setAttribute("x", "0")
  f.setAttribute("y", "0")
  f.setAttribute("width", "100%")
  f.setAttribute("height", "100%")
  f.setAttribute("color-interpolation-filters", "sRGB")
  const img = document.createElementNS(SVG_NS, "feImage")
  img.setAttribute("href", href)
  img.setAttribute("preserveAspectRatio", "none")
  img.setAttribute("result", "map")
  f.appendChild(img)
  // 채널별 굴절 세기를 달리해 색수차
  const chans: [string, number, string][] = [
    ["R", strength * 1.06, "1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0"],
    ["G", strength, "0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0"],
    ["B", strength * 0.94, "0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0"],
  ]
  for (const [name, sc, matrix] of chans) {
    const dm = document.createElementNS(SVG_NS, "feDisplacementMap")
    dm.setAttribute("in", "SourceGraphic")
    dm.setAttribute("in2", "map")
    dm.setAttribute("scale", String(sc))
    dm.setAttribute("xChannelSelector", "R")
    dm.setAttribute("yChannelSelector", "G")
    dm.setAttribute("result", `d${name}`)
    f.appendChild(dm)
    const cm = document.createElementNS(SVG_NS, "feColorMatrix")
    cm.setAttribute("in", `d${name}`)
    cm.setAttribute("type", "matrix")
    cm.setAttribute("values", matrix)
    cm.setAttribute("result", `c${name}`)
    f.appendChild(cm)
  }
  const b1 = document.createElementNS(SVG_NS, "feBlend")
  b1.setAttribute("in", "cR")
  b1.setAttribute("in2", "cG")
  b1.setAttribute("mode", "screen")
  b1.setAttribute("result", "rg")
  f.appendChild(b1)
  const b2 = document.createElementNS(SVG_NS, "feBlend")
  b2.setAttribute("in", "rg")
  b2.setAttribute("in2", "cB")
  b2.setAttribute("mode", "screen")
  b2.setAttribute("result", "rgb")
  f.appendChild(b2)
  const blur = document.createElementNS(SVG_NS, "feGaussianBlur")
  blur.setAttribute("in", "rgb")
  blur.setAttribute("stdDeviation", "1.2")
  f.appendChild(blur)
  return f
}

export default function LiquidGlass() {
  useEffect(() => {
    if (!supportsUrlBackdrop()) return
    const root = document.documentElement
    root.classList.add("lg-on")

    // SVG defs 컨테이너
    const svg = document.createElementNS(SVG_NS, "svg")
    svg.setAttribute("width", "0")
    svg.setAttribute("height", "0")
    svg.setAttribute("aria-hidden", "true")
    svg.style.position = "fixed"
    svg.style.pointerEvents = "none"
    const defs = document.createElementNS(SVG_NS, "defs")
    svg.appendChild(defs)
    document.body.appendChild(svg)

    let seq = 0
    let intensity = readGlass()
    const known = new Map<Element, { id: string; w: number; h: number; base: number }>()
    const setScales = () => {
      for (const [, k] of known) {
        const f = defs.querySelector(`#${k.id}`)
        if (!f) continue
        const dms = f.querySelectorAll("feDisplacementMap")
        const mult = [1.06, 1, 0.94]
        dms.forEach((dm, i) => dm.setAttribute("scale", String(k.base * intensity * mult[i])))
      }
    }
    const onIntensity = (e: Event) => {
      intensity = Number((e as CustomEvent).detail)
      setScales()
    }
    window.addEventListener(GLASS_EVENT, onIntensity)
    const apply = (el: HTMLElement) => {
      const rect = el.getBoundingClientRect()
      const w = Math.round(rect.width)
      const h = Math.round(rect.height)
      if (w < 8 || h < 8) return
      const prev = known.get(el)
      if (prev && prev.w === w && prev.h === h) return
      const id = prev?.id ?? `lg-${++seq}`
      const radius = parseFloat(getComputedStyle(el).borderTopLeftRadius) || 24
      const strength = Number(el.dataset.lgStrength ?? (Math.min(w, h) < 60 ? 14 : 26))
      const href = buildMap(w, h, radius)
      const old = defs.querySelector(`#${id}`)
      const f = makeFilter(id, href, strength * intensity)
      if (old) defs.replaceChild(f, old)
      else defs.appendChild(f)
      known.set(el, { id, w, h, base: strength })
      const extra = el.dataset.lgExtra ?? "saturate(1.55) brightness(1.06)"
      el.style.setProperty("backdrop-filter", `url(#${id}) ${extra}`)
      el.style.setProperty("-webkit-backdrop-filter", `url(#${id}) ${extra}`)
    }
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) apply(e.target as HTMLElement)
    })
    const scan = () => {
      document.querySelectorAll<HTMLElement>(".lg-shell").forEach((el) => {
        if (!known.has(el)) {
          ro.observe(el)
          apply(el)
        }
      })
      for (const el of [...known.keys()]) {
        if (!el.isConnected) {
          ro.unobserve(el)
          const k = known.get(el)!
          defs.querySelector(`#${k.id}`)?.remove()
          known.delete(el)
        }
      }
    }
    scan()
    const mo = new MutationObserver(() => scan())
    mo.observe(document.body, { childList: true, subtree: true })

    // 스펙큘러: 포인터를 따라 하이라이트가 움직인다
    let raf = 0
    const onMove = (e: PointerEvent) => {
      if (raf) return
      raf = requestAnimationFrame(() => {
        raf = 0
        root.style.setProperty("--px", `${(e.clientX / window.innerWidth) * 100}%`)
        root.style.setProperty("--py", `${(e.clientY / window.innerHeight) * 100}%`)
      })
    }
    window.addEventListener("pointermove", onMove, { passive: true })
    return () => {
      window.removeEventListener(GLASS_EVENT, onIntensity)
      window.removeEventListener("pointermove", onMove)
      mo.disconnect()
      ro.disconnect()
      svg.remove()
      root.classList.remove("lg-on")
    }
  }, [])
  return null
}
