"use client"

// 지도 좌상단 가로 스크롤 레이어 칩 바 (구글맵 카테고리 칩 패턴, 한국어 고정·광진 전용)
// 마커와 같은 아이콘·색을 쓰고 개수를 병기 — 꺼진 레이어도 "몇 개가 있는지" 보여 켤 이유를 만든다.
// 테마 그룹(이동 | 안전·의료 | 생활) 사이에 구분선 — 칩 8개를 훑는 눈의 리듬을 만든다.
import { BookOpen, Bike, BusFront, CarFront, Cross, HeartPulse, PersonStanding, Pill, Snowflake, SquareParking, TrainFront, Zap } from "lucide-react"
import type { LifeLayerKind } from "@/components/gwangjin/use-gwangjin-life"
import { LIFE_KIND_COLOR } from "@/components/gwangjin/life-icons"

// null = 그룹 구분선
const LAYER_DEFS: Array<{ kind: LifeLayerKind; label: string; Icon: typeof Bike } | null> = [
  { kind: "traffic", label: "교통", Icon: CarFront },
  { kind: "station", label: "지하철", Icon: TrainFront },
  { kind: "bus", label: "버스", Icon: BusFront },
  { kind: "bike", label: "따릉이", Icon: Bike },
  { kind: "ev", label: "충전소", Icon: Zap },
  { kind: "parking", label: "주차장", Icon: SquareParking },
  null,
  { kind: "er", label: "응급실", Icon: Cross },
  { kind: "pharm", label: "약국", Icon: Pill },
  { kind: "aed", label: "AED", Icon: HeartPulse },
  { kind: "shelter", label: "쉼터", Icon: Snowflake },
  { kind: "senior", label: "경로당", Icon: PersonStanding },
  null,
  { kind: "library", label: "도서관", Icon: BookOpen },
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
    <div className="scrollbar-thin flex items-center gap-1 overflow-x-auto pb-0.5 [mask-image:linear-gradient(to_right,#000_calc(100%-20px),transparent)]">
      {LAYER_DEFS.map((def, i) => {
        if (def === null) return <span key={`sep-${i}`} className="h-3.5 w-px shrink-0 bg-[var(--cp-border-strong)] opacity-60" />
        const { kind, label, Icon } = def
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
