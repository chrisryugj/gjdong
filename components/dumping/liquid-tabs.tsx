"use client"

import { useLayoutEffect, useRef, useState } from "react"

// 액체 탭(18라운드, sunlight-fund liquid-tabs 이식): 잉크 캡슐 하나가 선택된 탭 자리로 스프링처럼 흘러간다. 선택된 버튼은 투명, 캡슐이 그 뒤를 채운다.
// 여기서는 화면 전환(정책·물어보기·발견…)이라 role=tablist/tab 그대로. 스타일은 globals.css .lq-tabs

export interface TabItem<T extends string> {
  id: T
  label: string
}

export default function LiquidTabs<T extends string>({ items, value, onChange, className = "" }: { items: TabItem<T>[]; value: T; onChange: (v: T) => void; className?: string }) {
  const wrap = useRef<HTMLElement>(null)
  const [ink, setInk] = useState<{ x: number; y: number; w: number; h: number } | null>(null)
  useLayoutEffect(() => {
    const el = wrap.current
    if (!el) return
    const measure = () => {
      const btn = el.querySelector<HTMLButtonElement>(`[data-tab="${value}"]`)
      if (!btn) return
      setInk({ x: btn.offsetLeft, y: btn.offsetTop, w: btn.offsetWidth, h: btn.offsetHeight })
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [value, items])
  return (
    <nav ref={wrap} role="tablist" className={`lq-tabs ${className}`}>
      <span className="lq-ink" style={ink ? { transform: `translate(${ink.x}px, ${ink.y}px)`, width: ink.w, height: ink.h, opacity: 1 } : { opacity: 0 }} aria-hidden />
      {items.map((t) => (
        <button
          key={t.id}
          role="tab"
          data-tab={t.id}
          aria-selected={value === t.id}
          onClick={() => onChange(t.id)}
          className={`dump-tab shrink-0 whitespace-nowrap px-3.5 py-1.5 text-[13.5px] font-semibold transition-colors ${
            value === t.id ? "text-[var(--dump-paper)]" : "text-[var(--cp-text-dim)] hover:text-[var(--cp-text-strong)]"
          }`}
        >
          {t.label}
        </button>
      ))}
    </nav>
  )
}
