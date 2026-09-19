"use client"

import { useCallback, useRef, useState, useSyncExternalStore } from "react"
import { flushSync } from "react-dom"

// 17라운드(2026-09-19): 햇빛소득 시뮬레이터(sunlight-fund components/sun/theme.tsx)의 라이트·다크 스위치를 가져왔다.
// html[data-theme]가 진실, localStorage("dump-theme")에 기억. 기본은 라이트(종이). 시스템 설정은 따르지 않는다(시연은 종이 기본).
// 전환은 View Transition 원형 확산(손잡이 자리에서 번진다). 미지원·움직임 줄이기면 즉시 전환.
// 지도 바탕은 dumping-map이 useTheme()를 보고 스타일을 바꾼다(lib/dumping/basemap-style.ts dark 플레이버)

export type Theme = "light" | "dark"
const KEY = "dump-theme"

/** 첫 페인트 전에 실행되는 인라인 스크립트(app/dumping/page.tsx) — 깜빡임 방지 */
export const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem("${KEY}");document.documentElement.setAttribute("data-theme",t==="dark"?"dark":"light")}catch(e){document.documentElement.setAttribute("data-theme","light")}})();`

function current(): Theme {
  if (typeof document === "undefined") return "light"
  return document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light"
}
function subscribe(cb: () => void) {
  const mo = new MutationObserver(cb)
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] })
  return () => mo.disconnect()
}
/** 현재 테마를 구독한다(html 속성 변화 감지). 지도처럼 CSS 밖에서 색을 바꾸는 곳에서 쓴다 */
export function useTheme(): Theme {
  return useSyncExternalStore(subscribe, current, () => "light")
}

function SunIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M4.9 19.1l1.8-1.8M17.3 6.7l1.8-1.8" />
    </svg>
  )
}
function MoonIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M15.5 2.5a9.5 9.5 0 1 0 6 16.9A8 8 0 0 1 15.5 2.5Z" />
    </svg>
  )
}

/** Liquid Glass 스위치: 유리 알약 트랙 + 가장자리에 걸친 큰 유리 손잡이. 손잡이 안 아이콘이 빛난다 */
export default function ThemeSwitch({ compact = false }: { compact?: boolean }) {
  const theme = useTheme()
  const knob = useRef<HTMLSpanElement>(null)
  const [moving, setMoving] = useState(false)
  const dark = theme === "dark"

  const apply = useCallback((next: Theme) => {
    document.documentElement.setAttribute("data-theme", next)
    try {
      localStorage.setItem(KEY, next)
    } catch {
      // 사생활 모드 등
    }
  }, [])

  const toggle = useCallback(() => {
    const next: Theme = dark ? "light" : "dark"
    setMoving(true)
    window.setTimeout(() => setMoving(false), 520)
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches
    const doc = document as Document & { startViewTransition?: (cb: () => void) => { ready: Promise<void> } }
    if (!doc.startViewTransition || reduce) {
      apply(next)
      return
    }
    const r = knob.current?.getBoundingClientRect()
    const x = r ? r.left + r.width / 2 : window.innerWidth / 2
    const y = r ? r.top + r.height / 2 : 40
    const maxR = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y))
    doc.startViewTransition(() => flushSync(() => apply(next))).ready.then(() => {
      document.documentElement.animate(
        { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${maxR}px at ${x}px ${y}px)`] },
        { duration: 520, easing: "cubic-bezier(.2,.8,.2,1)", pseudoElement: "::view-transition-new(root)" },
      )
    })
  }, [dark, apply])

  return (
    <button
      type="button"
      role="switch"
      aria-checked={dark}
      aria-label={dark ? "라이트 모드로 전환" : "다크 모드로 전환"}
      title={dark ? "라이트 모드로 전환" : "다크 모드로 전환"}
      onClick={toggle}
      className={`lg-switch ${dark ? "is-dark" : ""} ${moving ? "is-moving" : ""} ${compact ? "is-compact" : ""}`}
    >
      <span className="lg-switch-track relative" aria-hidden>
        <span className="lg-switch-label">{dark ? "다크" : "라이트"}</span>
      </span>
      <span ref={knob} className="lg-switch-knob" aria-hidden>
        <span className="lg-switch-icon">{dark ? <MoonIcon /> : <SunIcon />}</span>
      </span>
    </button>
  )
}
