"use client"

import { useCallback, useEffect, useRef, useState } from "react"

// 데스크톱 떠 있는 카드 폭. 지도가 전면이라 기본은 440px(2026-09-18), 경계선 드래그로 조절한다.
// 더블클릭이면 기본으로 복귀. localStorage에 남는다.
const KEY = "dumpSidebarW"
const MIN = 380

// 스토리지 차단 브라우저·sandbox iframe에서는 접근 자체가 던진다. 폭 기억은 편의라 조용히 건너뛴다
const readStored = (): number => {
  try {
    return Number(localStorage.getItem(KEY))
  } catch {
    return 0
  }
}
const writeStored = (w: number | null) => {
  try {
    if (w == null) localStorage.removeItem(KEY)
    else localStorage.setItem(KEY, String(w))
  } catch {
    // 무시
  }
}

export function defaultSidebarWidth(innerWidth: number): number {
  return Math.min(440, Math.round(innerWidth * 0.62))
}

function clamp(w: number, innerWidth: number): number {
  return Math.min(Math.max(w, MIN), Math.round(innerWidth * 0.62))
}

export function useSidebarWidth() {
  const [width, setWidth] = useState<number | null>(null) // null = CSS 기본값(서버 렌더 동안)
  const [dragging, setDragging] = useState(false)
  const drag = useRef<{ startX: number; startW: number } | null>(null)

  useEffect(() => {
    const stored = readStored()
    setWidth(clamp(stored > 0 ? stored : defaultSidebarWidth(window.innerWidth), window.innerWidth))
  }, [])

  const onDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      drag.current = { startX: e.clientX, startW: width ?? defaultSidebarWidth(window.innerWidth) }
      setDragging(true)
      e.currentTarget.setPointerCapture(e.pointerId)
    },
    [width],
  )
  const onMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current
    if (!d) return
    setWidth(clamp(d.startW + (e.clientX - d.startX), window.innerWidth))
  }, [])
  const onUp = useCallback(() => {
    if (!drag.current) return
    drag.current = null
    setDragging(false)
    setWidth((w) => {
      if (w != null) writeStored(w)
      return w
    })
  }, [])
  const reset = useCallback(() => {
    drag.current = null
    setDragging(false)
    writeStored(null)
    setWidth(defaultSidebarWidth(window.innerWidth))
  }, [])

  return { width, dragging, onDown, onMove, onUp, reset }
}
