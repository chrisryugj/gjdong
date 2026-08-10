"use client"

// 지도 좌상단 가로 스크롤 레이어 칩 바 (구글맵 카테고리 칩 패턴, 한국어 고정·광진 전용)
// 마커와 같은 아이콘·색을 쓰고 개수를 병기 — 꺼진 레이어도 "몇 개가 있는지" 보여 켤 이유를 만든다.
import { Bike, Cross, Snowflake, TrainFront, Zap } from "lucide-react"
import type { LifeLayerKind } from "@/components/gwangjin/use-gwangjin-life"
import { LIFE_KIND_COLOR } from "@/components/gwangjin/life-icons"

const LAYER_DEFS: Array<{ kind: LifeLayerKind; label: string; Icon: typeof Bike }> = [
  { kind: "station", label: "지하철", Icon: TrainFront },
  { kind: "er", label: "응급실", Icon: Cross },
  { kind: "bike", label: "따릉이", Icon: Bike },
  { kind: "ev", label: "충전소", Icon: Zap },
  { kind: "shelter", label: "쉼터", Icon: Snowflake },
]

export default function LifeLayerChips({
  layers,
  counts,
  onToggle,
}: {
  layers: Set<LifeLayerKind>
  counts: Record<LifeLayerKind, number | null>
  onToggle: (kind: LifeLayerKind) => void
}) {
  return (
    <div className="scrollbar-thin flex gap-1 overflow-x-auto pb-0.5 [mask-image:linear-gradient(to_right,#000_calc(100%-20px),transparent)]">
      {LAYER_DEFS.map(({ kind, label, Icon }) => {
        const on = layers.has(kind)
        const n = counts[kind]
        return (
          <button
            key={kind}
            onClick={() => onToggle(kind)}
            aria-pressed={on}
            className={`flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full border px-2.5 py-1 text-[11px] font-medium backdrop-blur-sm transition-colors ${
              on
                ? "border-transparent text-white shadow-sm"
                : "border-[var(--cp-border)] bg-[var(--cp-overlay)] text-[var(--cp-text-muted)] hover:border-[var(--cp-border-strong)] hover:text-[var(--cp-text)]"
            }`}
            style={on ? { background: LIFE_KIND_COLOR[kind] } : undefined}
          >
            <Icon className="h-3 w-3" />
            {label}
            {n != null && (
              <span className={`font-mono text-[10px] tabular-nums ${on ? "text-white/85" : "text-[var(--cp-text-dim)]"}`}>
                {n}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
