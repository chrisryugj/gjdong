"use client"

import { TrendingDown, TrendingUp, X } from "lucide-react"
import { textColor, type CrowdDetail, type CrowdSpot } from "@/lib/crowd/seoul-rtd"
import { useLang } from "@/components/crowd/lang-context"
import { trRange } from "@/lib/crowd/i18n"

/** 상황실 카드 1장 — 등급을 크게, 인원(서울)·추세·산출 근거를 한눈에 */
export default function OpsCard({
  spot,
  detail,
  trend,
  light,
  onOpen,
  onRemove,
}: {
  spot: CrowdSpot
  detail?: CrowdDetail
  /** 직전 폴링 스냅샷 대비 등급 변화 (1 상승 / -1 하락 / 0 유지) */
  trend: -1 | 0 | 1
  light: boolean
  onOpen: () => void
  onRemove: () => void
}) {
  const { lang, t, spot: trSpotName, level: trLv } = useLang()
  const now = detail && detail.nowIndex >= 0 ? detail.series[detail.nowIndex] : null
  const busy = spot.levelNum === 4

  return (
    <div
      className={`relative rounded-md border bg-[var(--cp-panel)] transition-colors ${
        busy ? "border-[#ff3939]/60" : "border-[var(--cp-border)]"
      }`}
    >
      <button onClick={onOpen} className="block w-full p-3 pr-8 text-left hover:bg-[var(--cp-hover)]">
        <p className="truncate text-[13px] font-medium text-[var(--cp-text)]">{trSpotName(spot.name)}</p>
        <div className="mt-1.5 flex items-center gap-1.5">
          <span
            className="rounded px-2 py-1 text-[15px] font-semibold leading-none"
            style={{ background: `${spot.color}1f`, color: textColor(spot.color, light) }}
          >
            {trLv(spot.level)}
          </span>
          {trend !== 0 &&
            (trend > 0 ? (
              <TrendingUp className="h-4 w-4 text-[#ff3939]" aria-label="↑" />
            ) : (
              <TrendingDown className="h-4 w-4 text-[#00d369]" aria-label="↓" />
            ))}
        </div>
        {now && now.people > 0 && (
          <p className="mt-1.5 font-mono text-[12px] tabular-nums text-[var(--cp-text-muted)]">
            {now.range ? trRange(now.range, lang) : t.approxPeople(now.people)}
          </p>
        )}
        {(spot.basis === "access" || spot.basis === "wait") && (
          <p className="mt-1 text-[11px] text-[var(--cp-text-faint)]">
            {spot.basis === "access" ? t.basisAccess : t.basisWait}
          </p>
        )}
      </button>
      <button
        onClick={onRemove}
        aria-label={t.opsRemove(trSpotName(spot.name))}
        className="absolute right-1.5 top-1.5 rounded p-1 text-[var(--cp-text-faint)] transition-colors hover:bg-[var(--cp-hover)] hover:text-[var(--cp-text-strong)]"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}
