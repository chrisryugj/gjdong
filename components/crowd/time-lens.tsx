"use client"

import { Clock, LoaderCircle, X } from "lucide-react"
import { useLang } from "@/components/crowd/lang-context"
import { lensNowKst, type LensState } from "@/components/crowd/hooks/use-time-lens"

// 요일 표시는 월요일부터 — 배열 인덱스(0=일)와의 매핑은 히트맵 상세와 동일 규약
const DOW_ORDER = [1, 2, 3, 4, 5, 6, 0] as const
// 슬라이더 눈금 — 몇 시인지 드래그해 봐야 알던 것(2026-10-05 리뷰)
const HOUR_TICKS = [0, 6, 12, 18] as const
// 슬라이더 엄지 지름(px) — 눈금 위치 계산과 CSS가 같은 값을 쓴다
const THUMB = 18

/**
 * 시간대 패턴 렌즈 컨트롤 — 지도 오버레이 (PC 우상단, 모바일은 지도 하단 전체 폭 컴팩트).
 * 접힘: 칩 1개. 펼침: 요일 칩 + 시간 슬라이더. 렌즈가 켜진 동안 지도는 평균 패턴 색으로 바뀌고,
 * "실시간 아님" 띠는 대시보드가 지도 상단에 따로 띄운다.
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
    <div className="w-full rounded-lg border border-[var(--cp-border-strong)] bg-[var(--cp-overlay)] px-2.5 pb-1.5 pt-2 backdrop-blur-sm md:w-[240px] md:p-2.5">
      {/* 제목 줄은 PC만 — 모바일은 지도 상단 띠가 같은 말을 해서 지도 가림을 줄인다(240×122가 지도 390×270을 덮었다) */}
      <div className="mb-1.5 hidden items-center justify-between gap-2 md:flex">
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
      <div className="mb-1 flex items-center gap-1">
        {DOW_ORDER.map((d, i) => (
          <button
            key={d}
            onClick={() => onChange({ ...lens, dow: d })}
            aria-pressed={lens.dow === d}
            // 모바일 히트 세로 44px — 시각 칩은 32px, 의사요소가 위아래 6px씩 (실측 28×25)
            className={`relative h-8 min-w-0 flex-1 rounded text-[12px] transition-colors max-md:after:absolute max-md:after:inset-x-0 max-md:after:-inset-y-1.5 md:h-auto md:py-1 md:text-[11px] ${
              lens.dow === d
                ? "bg-[var(--cp-panel2)] font-semibold text-[var(--cp-text-strong)] ring-1 ring-[var(--cp-border-active)]"
                : "text-[var(--cp-text-muted)] hover:bg-[var(--cp-hover)]"
            }`}
          >
            {t.dowLabels[i]}
          </button>
        ))}
        {/* 모바일 종료 — 아이콘만 (제목 줄이 없으므로) */}
        <button
          onClick={() => onChange(null)}
          aria-label={t.lensExit}
          title={t.lensExit}
          className="relative ml-1 flex h-8 w-9 shrink-0 items-center justify-center rounded text-[var(--cp-text-muted)] transition-colors after:absolute after:inset-x-0 after:-inset-y-1.5 hover:bg-[var(--cp-hover)] hover:text-[var(--cp-text-strong)] md:hidden"
        >
          {loading ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}
        </button>
      </div>
      {/* 트랙 4px → 입력 높이 28px(투명) + 가운데 4px 띠, 엄지 18px — 탭이 트랙을 자꾸 놓쳤다 (실측 히트 14px) */}
      <input
        type="range"
        min={0}
        max={23}
        value={lens.hour}
        onChange={(e) => onChange({ ...lens, hour: Number(e.target.value) })}
        aria-label={t.lensChip}
        aria-valuetext={`${dowLabel} ${t.hourShort(lens.hour)}`}
        className="crowd-lens-slider relative block w-full !h-7 ![background:linear-gradient(var(--cp-track),var(--cp-track))_center/100%_4px_no-repeat] [&::-moz-range-thumb]:!h-[18px] [&::-moz-range-thumb]:!w-[18px] [&::-webkit-slider-thumb]:!h-[18px] [&::-webkit-slider-thumb]:!w-[18px]"
      />
      <div aria-hidden className="relative h-3.5">
        {HOUR_TICKS.map((h) => (
          <span
            key={h}
            className="absolute top-0 -translate-x-1/2 font-mono text-[10px] leading-none tabular-nums text-[var(--cp-text-dim)]"
            style={{ left: `calc(${THUMB / 2}px + (100% - ${THUMB}px) * ${h / 23})` }}
          >
            {t.hourShort(h)}
          </span>
        ))}
      </div>
    </div>
  )
}
