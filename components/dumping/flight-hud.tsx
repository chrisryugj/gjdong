"use client"

// 자유 비행 안내판(25라운드). 보이는 지도 아래 가운데. 키 안내 + 누르는 동안 움직이는 화면 단추(키보드가 낯선 사용자) + 나가기.
// 단추는 누르고 있는 동안만 움직인다(손을 떼거나 단추 밖으로 나가면 멈춘다)
import type { PointerEvent as ReactPointerEvent } from "react"
import { Ico } from "./icons"
import type { FlightKey } from "./map-flight"

interface Props {
  onPress: (k: FlightKey, on: boolean) => void
  onExit: () => void
  inset: { left: number; right: number; bottom: number }
}

const KBD = "inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-[5px] border border-[var(--cp-border-strong)] bg-[var(--cp-surface)] px-1 font-mono text-[12px] font-semibold text-[var(--cp-text-strong)]"

export default function FlightHud({ onPress, onExit, inset }: Props) {
  const hold = (k: FlightKey) => ({
    onPointerDown: (e: ReactPointerEvent<HTMLButtonElement>) => {
      e.currentTarget.setPointerCapture(e.pointerId)
      onPress(k, true)
    },
    onPointerUp: () => onPress(k, false),
    onPointerCancel: () => onPress(k, false),
    onLostPointerCapture: () => onPress(k, false),
  })
  const pad = (k: FlightKey, label: string, rot: number) => (
    <button
      type="button"
      aria-label={label}
      title={label}
      {...hold(k)}
      className="flex h-8 w-8 touch-none select-none items-center justify-center rounded-lg border border-[var(--cp-border)] bg-[var(--cp-surface)]/70 text-[var(--cp-text-strong)] hover:bg-[var(--cp-hover)] active:bg-(--dump-accent) active:text-white"
    >
      <Ico name="arrow" size={14} style={{ transform: `rotate(${rot}deg)` }} />
    </button>
  )
  const lift = (k: FlightKey, label: string) => (
    <button
      type="button"
      {...hold(k)}
      className="h-8 touch-none select-none rounded-lg border border-[var(--cp-border)] bg-[var(--cp-surface)]/70 px-2.5 text-[12.5px] font-semibold text-[var(--cp-text-strong)] hover:bg-[var(--cp-hover)] active:bg-(--dump-accent) active:text-white"
    >
      {label}
    </button>
  )
  return (
    <div className="pointer-events-none absolute z-[1030] flex justify-center" style={{ left: inset.left, right: inset.right, bottom: inset.bottom + 12 }}>
      <div className="dump-fl lg-shell pointer-events-auto relative flex items-center gap-4 rounded-2xl px-4 py-3" role="group" aria-label="자유 비행 조작">
        <div className="grid grid-cols-3 gap-1">
          <span />
          {pad("w", "앞으로", -90)}
          <span />
          {pad("a", "왼쪽으로 돌기", 180)}
          {pad("s", "뒤로", 90)}
          {pad("d", "오른쪽으로 돌기", 0)}
        </div>
        <div className="flex flex-col gap-1">
          {lift("q", "오르기")}
          {lift("e", "내리기")}
        </div>
        <div className="hidden text-[12.5px] leading-[1.75] text-[var(--cp-text-muted)] lg:block">
          <p className="font-semibold text-[var(--cp-text-strong)]">자유 비행</p>
          <p className="flex items-center gap-1 whitespace-nowrap">
            <kbd className={KBD}>W</kbd>
            <kbd className={KBD}>S</kbd> 앞뒤 · <kbd className={KBD}>A</kbd>
            <kbd className={KBD}>D</kbd> 돌기 · <kbd className={KBD}>Q</kbd>
            <kbd className={KBD}>E</kbd> 오르내리기
          </p>
          <p className="whitespace-nowrap">
            끌어서 둘러보기 · <kbd className={KBD}>Shift</kbd> 빠르게
          </p>
        </div>
        <button
          type="button"
          onClick={onExit}
          className="flex items-center gap-1.5 self-stretch rounded-xl bg-[var(--dump-ink)] px-3.5 text-[13px] font-semibold text-[var(--dump-paper)] hover:opacity-90"
        >
          나가기 <span className="font-mono text-[12px] opacity-70">Esc</span>
        </button>
      </div>
    </div>
  )
}
