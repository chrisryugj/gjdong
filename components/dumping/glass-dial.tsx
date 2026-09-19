"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Ico } from "./icons"

// 유리 강도 다이얼(18라운드, sunlight-fund components/sun/glass-dial.tsx 이식). 0(불투명 종이) ~ 1.6(굴절·투명 최대). 기본 1.
// html의 --lg 변수 하나로 CSS(투명도·흐림·하이라이트)와 굴절 런타임(liquid-glass.tsx 변위 세기)이 같이 움직인다. localStorage("dump-glass")에 기억.

export const GLASS_KEY = "dump-glass"
export const GLASS_EVENT = "lg-intensity"

export function readGlass(): number {
  try {
    const raw = localStorage.getItem(GLASS_KEY)
    if (raw === null) return 1
    const v = Number(raw)
    return Number.isFinite(v) ? Math.max(0, Math.min(1.6, v)) : 1
  } catch {
    return 1
  }
}

export function applyGlass(v: number) {
  const k = Math.max(0, Math.min(1.6, v))
  document.documentElement.style.setProperty("--lg", String(k))
  document.documentElement.classList.toggle("lg-flat", k < 0.05)
  window.dispatchEvent(new CustomEvent(GLASS_EVENT, { detail: k }))
  try {
    localStorage.setItem(GLASS_KEY, String(k))
  } catch {
    // 사생활 모드 등
  }
}

export default function GlassDial({ compact = false }: { compact?: boolean }) {
  // 초기값은 저장값(브라우저에서만). 서버 렌더는 1
  const [v, setV] = useState(() => (typeof window === "undefined" ? 1 : readGlass()))
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  const idle = useRef<number | null>(null)
  useEffect(() => {
    document.documentElement.style.setProperty("--lg", String(v))
    document.documentElement.classList.toggle("lg-flat", v < 0.05)
  }, [])
  // 바깥 클릭·잠시 손 떼면 접힌다
  useEffect(() => {
    if (!open) return
    const onDoc = (e: PointerEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("pointerdown", onDoc)
    return () => document.removeEventListener("pointerdown", onDoc)
  }, [open])
  const armIdle = useCallback(() => {
    if (idle.current) window.clearTimeout(idle.current)
    idle.current = window.setTimeout(() => setOpen(false), 2600)
  }, [])
  const onChange = useCallback(
    (n: number) => {
      setV(n)
      applyGlass(n)
      armIdle()
    },
    [armIdle],
  )
  const label = v < 0.05 ? "끔" : v < 0.6 ? "옅게" : v <= 1.05 ? "유리" : v < 1.4 ? "맑게" : "최대"
  return (
    <div ref={box} className={`dump-fl lg-shell lg-dial relative rounded-full ${open ? "is-open" : ""} ${compact ? "is-compact" : ""}`} title="유리 강도 (굴절·투명도·흐림)">
      <button
        type="button"
        className="lg-dial-btn"
        aria-expanded={open}
        aria-label="유리 강도 조절"
        onClick={() => {
          setOpen((o) => !o)
          armIdle()
        }}
      >
        <Ico name="drop" size={16} />
      </button>
      <div className="lg-dial-body" aria-hidden={!open}>
        <input
          type="range"
          min={0}
          max={1.6}
          step={0.05}
          value={v}
          onChange={(e) => onChange(Number(e.target.value))}
          onPointerDown={armIdle}
          aria-label="유리 강도"
          className="dump-range dump-range-mini"
          style={{ width: compact ? 72 : 92 }}
          tabIndex={open ? 0 : -1}
        />
        {!compact && <span className="dump-kicker w-[26px] text-right !text-[10px]">{label}</span>}
      </div>
    </div>
  )
}
