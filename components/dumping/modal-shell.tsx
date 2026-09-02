"use client"

import { useEffect, useId, useRef } from "react"

// /dumping 모달 공용 셸 — 다섯 모달이 제각각 들고 있던 ESC·배경 클릭·닫기 버튼을 한 곳으로.
// 접근성: role=dialog + aria-modal, 제목 연결(aria-labelledby), 열릴 때 포커스 이동·Tab 가둠·닫히면 복귀,
// 뒤 페이지 스크롤 잠금. 배경 클릭은 mousedown·mouseup이 모두 배경일 때만 닫는다(본문 드래그 선택이 밖에서 끝나도 안 닫힘).

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

const SIZE = { md: "max-w-lg", lg: "max-w-xl", xl: "max-w-3xl" } as const

interface ModalShellProps {
  onClose: () => void
  children: React.ReactNode
  title?: string // 텍스트 제목 — 배지 등이 붙는 모달은 header 슬롯을 쓴다
  sub?: string
  header?: React.ReactNode // 커스텀 제목 영역 (닫기 버튼은 셸이 붙인다)
  footer?: React.ReactNode // 고정 푸터 (지도에서 보기 등)
  size?: keyof typeof SIZE
  id?: string // 인쇄 규칙 등 외부 선택자용 (패널 요소에 붙는다)
  zIndex?: number
}

export default function ModalShell({
  onClose,
  children,
  title,
  sub,
  header,
  footer,
  size = "lg",
  id,
  zIndex = 2000,
}: ModalShellProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  const downOnBackdrop = useRef(false)
  const titleId = useId()

  useEffect(() => {
    const panel = panelRef.current
    if (!panel) return
    const restoreTo = document.activeElement as HTMLElement | null
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    // 첫 포커스는 패널 자체 — 닫기 버튼에 주면 스크린리더가 제목보다 "닫기"를 먼저 읽는다
    panel.focus({ preventScroll: true })

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation()
        onClose()
        return
      }
      if (e.key !== "Tab") return
      const items = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => el.offsetParent !== null)
      if (items.length === 0) {
        e.preventDefault()
        return
      }
      const first = items[0]
      const last = items[items.length - 1]
      const current = document.activeElement
      if (e.shiftKey && (current === first || current === panel)) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && current === last) {
        e.preventDefault()
        first.focus()
      }
    }
    document.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("keydown", onKey)
      document.body.style.overflow = prevOverflow
      restoreTo?.focus?.({ preventScroll: true })
    }
  }, [onClose])

  return (
    <div
      className="fixed inset-0 flex items-center justify-center bg-black/40 p-4 animate-in fade-in duration-150"
      style={{ zIndex }}
      onMouseDown={(e) => {
        downOnBackdrop.current = e.target === e.currentTarget
      }}
      onMouseUp={(e) => {
        if (downOnBackdrop.current && e.target === e.currentTarget) onClose()
        downOnBackdrop.current = false
      }}
    >
      <div
        ref={panelRef}
        id={id}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        // --cp-panel은 라이트 테마에서 비치는 틴트 — 떠 있는 모달은 불투명 흰색이어야 한다
        className={`flex max-h-[88dvh] w-full ${SIZE[size]} flex-col overflow-hidden rounded-2xl border border-[var(--cp-border)] bg-white shadow-2xl outline-none animate-in fade-in zoom-in-95 duration-200`}
      >
        <header className="flex items-start justify-between gap-3 border-b border-[var(--cp-border)] px-5 py-3.5">
          <div id={titleId} className="min-w-0">
            {header ?? (
              <>
                <h2 className="text-[17px] font-bold leading-snug text-[var(--cp-text-strong)]">{title}</h2>
                {sub && <p className="mt-0.5 text-[13px] text-[var(--cp-text-dim)]">{sub}</p>}
              </>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[var(--cp-border)] text-[16px] text-[var(--cp-text-muted)] hover:bg-[var(--cp-hover)] hover:text-[var(--cp-text-strong)] print:hidden"
          >
            ✕
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="border-t border-[var(--cp-border)] px-5 py-3 print:hidden">{footer}</div>}
      </div>
    </div>
  )
}
