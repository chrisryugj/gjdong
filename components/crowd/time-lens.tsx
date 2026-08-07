"use client"

import { Clock, LoaderCircle, X } from "lucide-react"
import { useLang } from "@/components/crowd/lang-context"
import { lensNowKst, type LensState } from "@/components/crowd/hooks/use-time-lens"

// 요일 표시는 월요일부터 — 배열 인덱스(0=일)와의 매핑은 히트맵 상세와 동일 규약
const DOW_ORDER = [1, 2, 3, 4, 5, 6, 0] as const

/**
 * 시간대 패턴 렌즈 컨트롤 — 지도 우상단 오버레이.
 * 접힘: 칩 1개. 펼침: 요일 칩 + 시간 슬라이더. 렌즈가 켜진 동안 지도는 평균 패턴 색으로 바뀐다.
 */
export default function TimeLens({
  lens,
  loading,
  onChange,
}: {
  lens: LensState | null
  loading: boolean
  onChange: (lens: LensState | null) => void
}) {
  const { t } = useLang()

  if (!lens) {
    return (
      <button
        onClick={() => onChange(lensNowKst())}
        title={t.lensNote}
        className="flex items-center gap-1.5 rounded-full border border-[var(--cp-border)] bg-[var(--cp-overlay)] px-3 py-1.5 text-[12px] text-[var(--cp-text)] backdrop-blur-sm transition-colors hover:border-[var(--cp-border-strong)] hover:text-[var(--cp-text-strong)]"
      >
        <Clock className="h-3.5 w-3.5" />
        {t.lensChip}
      </button>
    )
  }

  const dowLabel = t.dowLabels[DOW_ORDER.indexOf(lens.dow as (typeof DOW_ORDER)[number])]
  return (
    <div className="w-[240px] rounded-lg border border-[var(--cp-border-strong)] bg-[var(--cp-overlay)] p-2.5 backdrop-blur-sm">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-[12px] font-medium text-[var(--cp-text-strong)]">
          <Clock className="h-3.5 w-3.5" />
          {dowLabel} {t.hourShort(lens.hour)} {t.avg}
          {loading && <LoaderCircle className="h-3 w-3 animate-spin text-[var(--cp-text-dim)]" />}
        </span>
        <button
          onClick={() => onChange(null)}
          className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[12px] text-[var(--cp-text-muted)] transition-colors hover:bg-[var(--cp-hover)] hover:text-[var(--cp-text-strong)]"
        >
          <X className="h-3 w-3" />
          {t.lensExit}
        </button>
      </div>
      <div className="mb-1.5 flex gap-1">
        {DOW_ORDER.map((d, i) => (
          <button
            key={d}
            onClick={() => onChange({ ...lens, dow: d })}
            aria-pressed={lens.dow === d}
            className={`min-w-0 flex-1 rounded py-1 text-[11px] transition-colors ${
              lens.dow === d
                ? "bg-[var(--cp-panel2)] font-semibold text-[var(--cp-text-strong)] ring-1 ring-[var(--cp-border-active)]"
                : "text-[var(--cp-text-muted)] hover:bg-[var(--cp-hover)]"
            }`}
          >
            {t.dowLabels[i]}
          </button>
        ))}
      </div>
      <input
        type="range"
        min={0}
        max={23}
        value={lens.hour}
        onChange={(e) => onChange({ ...lens, hour: Number(e.target.value) })}
        aria-label={t.lensChip}
        className="crowd-lens-slider w-full"
      />
      <p className="mt-1 text-[10px] leading-snug text-[var(--cp-text-faint)]">{t.lensNote}</p>
    </div>
  )
}
