"use client"

import { useCallback, useEffect, useRef, useState } from "react"

/** 모바일 지도/패널 분할 — 패널 상단 핸들 드래그로 지도 높이 조절 (null=자동 24/32dvh) */
export function useSplitPane() {
  const [mapH, setMapH] = useState<number | null>(null)
  const [splitDragging, setSplitDragging] = useState(false)
  const mapBoxRef = useRef<HTMLDivElement>(null)
  const splitDragRef = useRef<{ startY: number; startH: number } | null>(null)

  useEffect(() => {
    const storedMapH = Number(localStorage.getItem("crowdMapH"))
    if (storedMapH > 0) setMapH(Math.min(Math.max(storedMapH, 96), window.innerHeight * 0.7))
  }, [])

  // 분할 핸들 드래그 — 포인터 캡처로 핸들 밖까지 추적, 더블탭이면 자동 높이로 복귀
  const onSplitDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const h = mapBoxRef.current?.offsetHeight
    if (h == null) return
    splitDragRef.current = { startY: e.clientY, startH: h }
    setSplitDragging(true)
    e.currentTarget.setPointerCapture(e.pointerId)
  }, [])

  const onSplitMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const d = splitDragRef.current
    if (!d) return
    setMapH(Math.min(Math.max(d.startH + e.clientY - d.startY, 96), window.innerHeight * 0.7))
  }, [])

  const onSplitUp = useCallback(() => {
    if (!splitDragRef.current) return
    splitDragRef.current = null
    setSplitDragging(false)
    setMapH((h) => {
      if (h != null) localStorage.setItem("crowdMapH", String(Math.round(h)))
      return h
    })
  }, [])

  const resetSplit = useCallback(() => {
    splitDragRef.current = null
    setSplitDragging(false)
    setMapH(null)
    localStorage.removeItem("crowdMapH")
  }, [])

  return { mapH, splitDragging, mapBoxRef, onSplitDown, onSplitMove, onSplitUp, resetSplit }
}
