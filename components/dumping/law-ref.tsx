"use client"

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { LAW_ASOF, LAW_TEXTS, lawRefsIn } from "@/lib/dumping/law"

// 법령 인용 문구에 호버·포커스·탭으로 조문 원문을 띄운다. 원문은 lib/dumping/law.ts(법제처 실측)가 정본.
// 결재선이 "조례 9조"가 무슨 말인지 링크를 타지 않고 그 자리에서 읽게(12라운드)
// 18라운드: 팝오버를 페이지 루트로 포털해 화면 기준(fixed)으로 띄운다. 모달 본문(overflow-y: auto) 안의 absolute는 아래가 잘렸고,
// 모달 패널의 등장 애니메이션(transform)이 fixed의 기준 상자가 되어 패널 안에서 fixed도 어긋났다(실측: left가 패널 폭만큼 밀림).
// 호버는 살짝 늦게 닫혀 팝오버로 손을 옮길 수 있고, 클릭하면 고정되어 링크를 누를 수 있다(바깥 클릭·ESC·다시 클릭으로 해제)

const GAP = 6
const CLOSE_DELAY = 220

export function LawRef({ keys, up = false, children }: { keys: string[]; up?: boolean; children: React.ReactNode }) {
  const [hover, setHover] = useState(false)
  const [pinned, setPinned] = useState(false)
  const [pos, setPos] = useState<{ left: number; top: number; maxH: number; above: boolean } | null>(null)
  const btnRef = useRef<HTMLButtonElement>(null)
  const popRef = useRef<HTMLSpanElement>(null)
  const closeTimer = useRef<number | null>(null)
  const items = keys.map((k) => LAW_TEXTS[k]).filter(Boolean)
  const open = hover || pinned

  const enter = useCallback(() => {
    if (closeTimer.current) window.clearTimeout(closeTimer.current)
    setHover(true)
  }, [])
  const leave = useCallback(() => {
    if (closeTimer.current) window.clearTimeout(closeTimer.current)
    closeTimer.current = window.setTimeout(() => setHover(false), CLOSE_DELAY)
  }, [])

  // 자리 잡기: 글자 아래(공간이 없으면 위). 화면 안에 들어오게 좌우를 밀고 높이를 잘라 안에서 스크롤
  useLayoutEffect(() => {
    if (!open || !btnRef.current) return
    const r = btnRef.current.getBoundingClientRect()
    const vw = window.innerWidth
    const vh = window.innerHeight
    const width = Math.min(416, vw - 24)
    const below = vh - r.bottom - GAP - 12
    const aboveSpace = r.top - GAP - 12
    const above = up ? aboveSpace >= Math.min(below, 320) : below < 240 && aboveSpace > below
    const left = Math.max(12, Math.min(r.left, vw - width - 12))
    setPos({ left, top: above ? r.top - GAP : r.bottom + GAP, maxH: Math.max(160, above ? aboveSpace : below), above })
  }, [open, up])

  // 고정 상태: 바깥 클릭·ESC로 해제. ESC는 모달까지 닫히지 않게 캡처 단계에서 멈춘다
  useEffect(() => {
    if (!pinned) return
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node
      if (btnRef.current?.contains(t) || popRef.current?.contains(t)) return
      setPinned(false)
      setHover(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return
      e.stopPropagation()
      setPinned(false)
      setHover(false)
    }
    document.addEventListener("pointerdown", onDown)
    document.addEventListener("keydown", onKey, true)
    return () => {
      document.removeEventListener("pointerdown", onDown)
      document.removeEventListener("keydown", onKey, true)
    }
  }, [pinned])

  if (!items.length) return <>{children}</>
  return (
    <span className="inline" onMouseEnter={enter} onMouseLeave={leave}>
      <button
        ref={btnRef}
        type="button"
        onClick={() => setPinned((v) => !v)}
        onFocus={enter}
        onBlur={() => {
          if (!pinned) leave()
        }}
        aria-expanded={open}
        title={pinned ? "누르면 닫힘" : "누르면 고정"}
        className={`cursor-help rounded-sm text-[var(--cp-text-strong)] underline decoration-(--dump-accent)/60 decoration-dotted underline-offset-[3px] hover:decoration-solid ${
          pinned ? "bg-(--dump-accent)/12 decoration-solid" : ""
        }`}
      >
        {children}
      </button>
      {open &&
        pos &&
        createPortal(
        <span
          ref={popRef}
          role="tooltip"
          onMouseEnter={enter}
          onMouseLeave={leave}
          className="fixed z-[2200] flex flex-col rounded-lg border border-[var(--cp-border-strong)] bg-[var(--cp-panel)] p-3 text-left shadow-[0_18px_48px_rgba(28,26,21,0.22)]"
          style={{
            left: pos.left,
            width: Math.min(416, window.innerWidth - 24),
            maxHeight: pos.maxH,
            ...(pos.above ? { bottom: window.innerHeight - pos.top } : { top: pos.top }),
          }}
        >
          <span className="min-h-0 flex-1 overflow-y-auto pr-1 [scrollbar-width:thin]">
            {items.map((p) => (
              <span key={p.title} className="mb-2.5 block last:mb-0">
                <b className="block text-[13.5px] font-bold leading-snug text-[var(--cp-text-strong)]">{p.title}</b>
                <span className="mt-1 block whitespace-pre-line text-[13px] leading-relaxed text-[var(--cp-text-muted)]">{p.text}</span>
                <a href={p.url} target="_blank" rel="noreferrer" className="mt-1 inline-block text-[12.5px] font-semibold text-(--dump-accent) underline">
                  국가법령정보센터에서 원문 보기
                </a>
              </span>
            ))}
          </span>
          <span className="mt-2 block shrink-0 border-t border-[var(--cp-border)] pt-1.5 text-[11.5px] text-[var(--cp-text-faint)]">
            {LAW_ASOF} 법제처 API로 받은 현행 본문. 이후 개정 여부는 링크에서 확인{pinned ? " · 고정됨(바깥 클릭·ESC로 닫기)" : " · 누르면 고정"}
          </span>
        </span>,
        document.querySelector(".dump-page") ?? document.body,
        )}
    </span>
  )
}

// 문장 안의 인용 문구만 LawRef로 감싼다
export function linkLawRefs(text: string, up = false): React.ReactNode {
  return lawRefsIn(text).map((part, i) =>
    typeof part === "string" ? (
      part
    ) : (
      <LawRef key={i} keys={part.keys} up={up}>
        {part.text}
      </LawRef>
    ),
  )
}
