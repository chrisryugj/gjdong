"use client"

import type { LayerId } from "@/lib/snow/types"
import { RESOURCES, RISK } from "@/lib/snow/labels"
import { Ico } from "@/components/dumping/icons"

// 오른쪽 열: 레이어 토글(취약 층 · 자원 층) · 입체 보기 · 범례(스와치). 동별 기둥 지표 선택은 자원 현황 탭 한 곳에만 둔다(중복 제거)

export interface MapView {
  layers: LayerId[]
  tilt: boolean
}
export const DEFAULT_VIEW: MapView = { layers: ["heat", "salt", "cacl", "sand", "weak", "ice", "school"], tilt: true }
export const ALL_LAYERS: LayerId[] = ["weak", "ice", "slope", "school", "heat", "salt", "cacl", "sand"]

const RISK_ROWS: { id: LayerId; label: string; note: string; swatch: "line" | "dash" | "dot" | "ring" }[] = [
  { id: "weak", label: RISK.weak.label, note: "행안부 47곳", swatch: "line" },
  { id: "ice", label: RISK.ice.label, note: "행안부 9곳 · 간선", swatch: "dash" },
  { id: "slope", label: RISK.slope.label, note: "지형 추정", swatch: "dot" },
  { id: "school", label: RISK.school.label, note: "21교", swatch: "ring" },
]

export function LayerPanel({ view, onChange, dark, counts }: { view: MapView; onChange: (v: MapView) => void; dark: boolean; counts?: Partial<Record<LayerId, string>> }) {
  const toggle = (id: LayerId) => onChange({ ...view, layers: view.layers.includes(id) ? view.layers.filter((x) => x !== id) : [...view.layers, id] })
  const risk = dark ? RISK.weak.color : RISK.weak.colorLight
  const ink = dark ? "#ece7dc" : "#14201c"
  return (
    <div className="p-1.5">
      <div className="dump-kicker px-1.5 pb-1 text-[10px] text-[var(--cp-text-dim)]">취약 층</div>
      <ul className="space-y-px">
        {RISK_ROWS.map((r) => {
          const on = view.layers.includes(r.id)
          return (
            <li key={r.id}>
              <button onClick={() => toggle(r.id)} aria-pressed={on} className={`flex w-full items-center gap-2 rounded-lg px-1.5 py-1 text-left text-[13.5px] hover:bg-[var(--cp-hover)] ${on ? "text-[var(--cp-text-strong)]" : "text-[var(--cp-text-faint)]"}`}>
                <Swatch kind={r.swatch} color={r.id === "school" ? ink : risk} on={on} />
                <span className="flex-1">{r.label}</span>
                <span className="text-[12px] text-[var(--cp-text-faint)]">{counts?.[r.id] ?? r.note}</span>
              </button>
            </li>
          )
        })}
      </ul>
      <div className="dump-kicker mt-2 px-1.5 pb-1 text-[10px] text-[var(--cp-text-dim)]">자원 층</div>
      <ul className="space-y-px">
        {RESOURCES.map((r) => {
          const on = view.layers.includes(r.id)
          const color = dark ? r.color : r.colorLight
          return (
            <li key={r.id}>
              <button onClick={() => toggle(r.id)} aria-pressed={on} className={`flex w-full items-center gap-2 rounded-lg px-1.5 py-1 text-left text-[13.5px] hover:bg-[var(--cp-hover)] ${on ? "text-[var(--cp-text-strong)]" : "text-[var(--cp-text-faint)]"}`}>
                <Swatch kind={r.id === "heat" ? "glow" : r.id === "sand" ? "ring" : "fill"} color={color} on={on} />
                <span className="flex-1">{r.id === "sand" ? "모래주머니(2022)" : r.label}</span>
                <span className="text-[12px] text-[var(--cp-text-faint)]">{counts?.[r.id] ?? ""}</span>
              </button>
            </li>
          )
        })}
      </ul>
      <button onClick={() => onChange({ ...view, tilt: !view.tilt })} aria-pressed={view.tilt} className={`mt-2 flex w-full items-center gap-2 rounded-lg px-1.5 py-1 text-left text-[13.5px] hover:bg-[var(--cp-hover)] ${view.tilt ? "text-(--dump-accent)" : "text-[var(--cp-text-muted)]"}`}>
        <Ico name="tilt" size={14} />
        입체 보기
      </button>
    </div>
  )
}

function Swatch({ kind, color, on }: { kind: "line" | "dash" | "dot" | "ring" | "fill" | "glow"; color: string; on: boolean }) {
  const o = on ? 1 : 0.35
  if (kind === "fill") return <i className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: color, opacity: o }} />
  if (kind === "ring") return <i className="h-2.5 w-2.5 shrink-0 rounded-full border-2 bg-transparent" style={{ borderColor: color, opacity: o }} />
  if (kind === "glow") return <i className="h-1 w-4 shrink-0 rounded-full" style={{ background: color, boxShadow: `0 0 6px ${color}`, opacity: o }} />
  return (
    <svg width={16} height={10} aria-hidden style={{ opacity: o }} className="shrink-0">
      <line x1={1} y1={5} x2={15} y2={5} stroke={color} strokeWidth={kind === "dot" ? 1.5 : 3} strokeLinecap="round" strokeDasharray={kind === "dash" ? "5 2" : kind === "dot" ? "1.5 2.5" : undefined} />
    </svg>
  )
}

export function Legend({ dark, stageLabel, stageNote }: { dark: boolean; stageLabel: string; stageNote: string | null }) {
  const risk = dark ? RISK.weak.color : RISK.weak.colorLight
  const heat = dark ? RESOURCES[0].color : RESOURCES[0].colorLight
  return (
    <div className="px-3 py-2 text-[12.5px] leading-snug text-[var(--cp-text-dim)]">
      <div className="dump-kicker mb-1 text-[10px]">범례</div>
      <ul className="space-y-[3px]">
        <li className="flex items-center gap-2"><Swatch kind="glow" color={heat} on /> 열선(흐름 = 발열)</li>
        <li className="flex items-center gap-2"><Swatch kind="line" color={risk} on /> 취약구간 · 진하면 열선 없음</li>
        <li className="flex items-center gap-2"><Swatch kind="dot" color={risk} on /> 급경사 추정</li>
        <li className="flex items-center gap-2"><Swatch kind="fill" color={dark ? RESOURCES[1].color : RESOURCES[1].colorLight} on /> 제설함 · <Swatch kind="fill" color={dark ? RESOURCES[2].color : RESOURCES[2].colorLight} on /> 염화칼슘함</li>
        <li className="flex items-center gap-2"><Swatch kind="ring" color={dark ? RESOURCES[3].color : RESOURCES[3].colorLight} on /> 모래주머니 · <Swatch kind="ring" color={dark ? "#ece7dc" : "#14201c"} on /> 초등학교</li>
      </ul>
      {stageNote && (
        <p className="mt-1.5 text-[var(--cp-text)]">
          {stageLabel}: {stageNote}
        </p>
      )}
    </div>
  )
}
