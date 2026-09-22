"use client"

import { useCallback, useSyncExternalStore } from "react"

// 글자 크기 단계(2026-09-22, "범례·레이어 글자가 너무 작다" 의견). 카드·레이어·범례·모달 안 UI를 통째로 확대한다.
// 화면 문구가 전부 px라 font-size로는 못 키우고, 콘텐츠 상자에 CSS zoom(--dump-ui-zoom)을 준다(.dump-zoom, globals.css).
// 지도·상단 띠는 그대로. html[data-fontscale]가 진실, localStorage("dump-font-scale")에 기억. 첫 페인트 전 FONT_SCALE_INIT_SCRIPT가 붙인다.
export const FONT_SCALE_KEY = "dump-font-scale"
export const FONT_SCALES = ["1", "1.15", "1.3"] as const
export type FontScale = (typeof FONT_SCALES)[number]
const LABEL: Record<FontScale, string> = { "1": "보통", "1.15": "크게", "1.3": "더 크게" }

export const FONT_SCALE_INIT_SCRIPT = `(function(){try{var s=localStorage.getItem("${FONT_SCALE_KEY}");if(s==="1.15"||s==="1.3")document.documentElement.setAttribute("data-fontscale",s)}catch(e){}})();`

function current(): FontScale {
  if (typeof document === "undefined") return "1"
  const v = document.documentElement.getAttribute("data-fontscale")
  return v === "1.15" || v === "1.3" ? v : "1"
}
function subscribe(cb: () => void) {
  const mo = new MutationObserver(cb)
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-fontscale"] })
  return () => mo.disconnect()
}

/** 상단 띠 알약. 누를수록 보통 → 크게 → 더 크게 → 보통 */
export default function FontScaleButton({ compact = false }: { compact?: boolean }) {
  const scale = useSyncExternalStore(subscribe, current, () => "1" as FontScale)
  const cycle = useCallback(() => {
    const next = FONT_SCALES[(FONT_SCALES.indexOf(scale) + 1) % FONT_SCALES.length]
    if (next === "1") document.documentElement.removeAttribute("data-fontscale")
    else document.documentElement.setAttribute("data-fontscale", next)
    try {
      localStorage.setItem(FONT_SCALE_KEY, next)
    } catch {
      // 사생활 모드 등
    }
  }, [scale])
  return (
    <button
      type="button"
      onClick={cycle}
      aria-label={`글자 크기: ${LABEL[scale]}. 누르면 바꿉니다`}
      title={`글자 크기 · ${LABEL[scale]}`}
      className={`dump-fl lg-shell relative flex items-center gap-1 rounded-full px-3 py-2 text-[13px] font-semibold transition-colors hover:text-(--dump-accent) ${
        scale !== "1" ? "text-(--dump-accent)" : "text-[var(--cp-text-strong)]"
      }`}
    >
      <span aria-hidden className="leading-none">
        <span className="text-[11px]">가</span>
        <span className="text-[16px]">가</span>
      </span>
      {!compact && <span>{LABEL[scale]}</span>}
    </button>
  )
}
