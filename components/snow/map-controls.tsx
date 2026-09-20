"use client"

import type { ResourceId } from "@/lib/snow/types"
import { RESOURCES } from "@/lib/snow/labels"
import { Ico } from "@/components/dumping/icons"

// 오른쪽 열: 자원 레이어 토글 · 동별 기둥 지표 · 입체 보기 · 범례

export interface MapView {
  layers: ResourceId[]
  colMetric: ResourceId | "all" | null
  tilt: boolean
}
export const DEFAULT_VIEW: MapView = { layers: ["heat", "salt", "cacl", "sand"], colMetric: "all", tilt: true }

export function LayerPanel({ view, onChange, emphasis }: { view: MapView; onChange: (v: MapView) => void; emphasis: ResourceId[] | null }) {
  const toggle = (id: ResourceId) => onChange({ ...view, layers: view.layers.includes(id) ? view.layers.filter((x) => x !== id) : [...view.layers, id] })
  return (
    <div className="p-1.5">
      <div className="dump-kicker px-1.5 pb-1 text-[9.5px] text-[var(--cp-text-dim)]">자원 레이어</div>
      <ul className="space-y-px">
        {RESOURCES.map((r) => {
          const on = view.layers.includes(r.id)
          const dim = emphasis ? !emphasis.includes(r.id) : false
          return (
            <li key={r.id}>
              <button onClick={() => toggle(r.id)} aria-pressed={on} className={`flex w-full items-center gap-2 rounded-lg px-1.5 py-1 text-left text-[13px] hover:bg-[var(--cp-hover)] ${on ? "text-[var(--cp-text-strong)]" : "text-[var(--cp-text-faint)]"}`}>
                <i className={`h-2.5 w-2.5 shrink-0 ${r.id === "heat" ? "h-1 w-3.5 rounded-full" : r.id === "sand" ? "rounded-full border-2 bg-transparent" : "rounded-full"}`} style={r.id === "sand" ? { borderColor: r.color, opacity: on ? 1 : 0.35 } : { background: r.color, opacity: on ? 1 : 0.35 }} />
                <span className="flex-1">{r.label}</span>
                {dim && on && <span className="text-[10.5px] text-[var(--cp-text-faint)]">대기</span>}
              </button>
            </li>
          )
        })}
      </ul>
      <div className="dump-kicker mt-2 px-1.5 pb-1 text-[9.5px] text-[var(--cp-text-dim)]">동별 기둥</div>
      <div className="flex flex-wrap gap-1 px-1.5">
        {([null, "all", ...RESOURCES.map((r) => r.id)] as (ResourceId | "all" | null)[]).map((m) => (
          <button key={String(m)} onClick={() => onChange({ ...view, colMetric: m })} aria-pressed={view.colMetric === m} className={`rounded-full border px-2 py-px text-[11.5px] ${view.colMetric === m ? "border-(--dump-accent) bg-(--dump-accent)/10 font-semibold text-(--dump-accent)" : "border-[var(--cp-border)] text-[var(--cp-text-muted)]"}`}>
            {m === null ? "없음" : m === "all" ? "합계" : RESOURCES.find((r) => r.id === m)?.label.replace("보관함", "함")}
          </button>
        ))}
      </div>
      <button onClick={() => onChange({ ...view, tilt: !view.tilt })} aria-pressed={view.tilt} className={`mt-2 flex w-full items-center gap-2 rounded-lg px-1.5 py-1 text-left text-[13px] hover:bg-[var(--cp-hover)] ${view.tilt ? "text-(--dump-accent)" : "text-[var(--cp-text-muted)]"}`}>
        <Ico name="tilt" size={14} />
        입체 보기
      </button>
    </div>
  )
}

export function Legend({ emphasis, stageLabel }: { emphasis: ResourceId[] | null; stageLabel: string }) {
  return (
    <div className="px-3 py-2 text-[12px] leading-snug text-[var(--cp-text-dim)]">
      <div className="dump-kicker mb-1 text-[9.5px]">범례</div>
      <p>선은 열선 구간(기점·종점 직선 근사, 굵기는 차로 수). 원은 비치 자재. 기둥은 동별 자원 수(구 최댓값 대비).</p>
      {emphasis && <p className="mt-1 text-[var(--cp-text)]">{stageLabel}: 동원 자원은 진하게, 대기 자원은 흐리게.</p>}
    </div>
  )
}
