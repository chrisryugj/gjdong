"use client"

import { X } from "lucide-react"
import type { CrowdSpot } from "@/lib/crowd/seoul-rtd"
import { formatKm, LevelBadge, type AddressPin } from "@/components/crowd/shared"
import { useLang } from "@/components/crowd/lang-context"

interface NearestPanelProps {
  addressPin: AddressPin
  nearest: Array<{ spot: CrowdSpot; km: number }>
  recommendedName: string | null
  light: boolean
  onClear: () => void
  onSelect: (name: string) => void
}

/** 주소·내 위치 기준 근처 명소 목록 */
export default function NearestPanel({ addressPin, nearest, recommendedName, light, onClear, onSelect }: NearestPanelProps) {
  const { t, spot: trSpotName, cat } = useLang()
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-start justify-between gap-2 border-b border-[var(--cp-border)] px-4 py-3">
        <div className="min-w-0">
          <p className="text-[11px] uppercase tracking-wider text-[var(--cp-text-dim)]">{t.refPoint}</p>
          <p className="mt-0.5 truncate text-[14px] font-medium text-[var(--cp-text-strong)]">{addressPin.label}</p>
        </div>
        <button
          onClick={onClear}
          className="shrink-0 rounded p-1 text-[var(--cp-text-dim)] hover:bg-[var(--cp-hover)] hover:text-[var(--cp-text-strong)]"
          aria-label={t.clearAddress}
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <p className="px-4 pb-1 pt-3 text-[11px] uppercase tracking-wider text-[var(--cp-text-dim)]">
          {t.nearbyCrowds}
        </p>
        <ul>
          {nearest.map(({ spot, km }, i) => (
            <li key={spot.name}>
              <button
                onClick={() => onSelect(spot.name)}
                className="group flex w-full items-center gap-3 border-b border-[var(--cp-border-faint)] px-4 py-3 text-left transition-colors hover:bg-[var(--cp-hover)]"
              >
                <span className="w-4 shrink-0 font-mono text-[12px] tabular-nums text-[var(--cp-text-faint)]">
                  {i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[14px] text-[var(--cp-text)] group-hover:text-[var(--cp-text-strong)]">
                    {trSpotName(spot.name)}
                  </p>
                  <p className="text-[12px] text-[var(--cp-text-dim)]">
                    {cat(spot.category)} · <span className="font-mono tabular-nums">{formatKm(km)}</span>
                  </p>
                </div>
                {spot.name === recommendedName && (
                  <span
                    className={`shrink-0 rounded-full border border-emerald-500/40 px-1.5 py-0.5 text-[11px] font-medium ${light ? "text-emerald-700" : "text-emerald-500"}`}
                  >
                    {t.recommended}
                  </span>
                )}
                <LevelBadge level={spot.level} color={spot.color} light={light} />
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
