"use client"

// 지도 우상단 생활 레이어 토글 — 이름표 토글과 같은 pill 스타일 (한국어 고정, 광진 전용)
import type { LifeLayerKind } from "@/components/gwangjin/use-gwangjin-life"

const LAYER_LABELS: Array<{ kind: LifeLayerKind; label: string }> = [
  { kind: "station", label: "🚇 지하철" },
  { kind: "er", label: "🏥 응급실" },
  { kind: "bike", label: "🚲 따릉이" },
  { kind: "ev", label: "⚡ EV충전" },
  { kind: "shelter", label: "❄ 쉼터" },
]

export default function LifeLayerChips({
  layers,
  onToggle,
}: {
  layers: Set<LifeLayerKind>
  onToggle: (kind: LifeLayerKind) => void
}) {
  return (
    <div className="flex flex-col items-end gap-1">
      {LAYER_LABELS.map(({ kind, label }) => {
        const on = layers.has(kind)
        return (
          <button
            key={kind}
            onClick={() => onToggle(kind)}
            aria-pressed={on}
            className={`flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] backdrop-blur-sm transition-colors ${
              on
                ? "border-[var(--cp-border-active)] bg-[var(--cp-overlay)] font-medium text-[var(--cp-text-strong)]"
                : "border-[var(--cp-border)] bg-[var(--cp-overlay)] text-[var(--cp-text-muted)] hover:border-[var(--cp-border-strong)] hover:text-[var(--cp-text)]"
            }`}
          >
            {label}
          </button>
        )
      })}
    </div>
  )
}
