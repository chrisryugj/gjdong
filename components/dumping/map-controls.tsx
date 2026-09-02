"use client"

import { useState } from "react"
import type { BaseMode, CircleId, DumpingMapData, InfraLayerId, MapMode, VizAction } from "@/lib/dumping/types"
import { BASE_DEF, CIRCLE_DEF, INFRA_STYLE, type CandidateFocus } from "./dumping-map"

// 지도 위에 무엇을 그릴지 — 칩·발견 카드·정책 수단·질문 답변이 전부 이 한 덩어리를 바꾼다
export interface MapView {
  base: BaseMode
  circles: CircleId[]
  layers: InfraLayerId[]
  candidates: boolean
  routes: boolean
}

export const DEFAULT_VIEW: MapView = { base: "unm", circles: ["comp"], layers: [], candidates: false, routes: false }

const BASE_LABEL: Record<BaseMode, string> = {
  unm: "무관리주거",
  comp: "민원",
  enf: "과태료",
}

// 선택된 바탕이 뭘 보여주는지 — 칩 아래 한 줄 설명 (원 중첩 시 조합 설명 덧붙음)
const BASE_DESC: Record<BaseMode, string> = {
  unm: "바탕색은 관리주체 없는 주거(다가구·단독)의 밀도입니다. 아파트는 발생과 무관해(β −0.011) 따로 레이어를 두지 않았고, 색이 옅은 주거지가 사실상 관리가 되고 있는 지역입니다.",
  comp: "바탕색은 주민이 신고한 민원 건수입니다. 앱 보급에 따른 신고 편향이 섞여 있어 실제 발생보다 부풀어 보일 수 있습니다.",
  enf: "바탕색은 단속으로 부과한 과태료 건수입니다. 신고 여부와 무관해 실제 발생에 가장 가깝습니다.",
}

const INFRA_IDS = Object.keys(INFRA_STYLE) as InfraLayerId[]

// VizAction(발견 카드·예시 질문)의 기존 mode를 바탕+원 조합으로 해석
export const MODE_MAP: Record<MapMode, { base: BaseMode; circles: CircleId[] }> = {
  overlay: { base: "unm", circles: ["comp"] },
  unm: { base: "unm", circles: [] },
  comp: { base: "comp", circles: [] },
  enf: { base: "enf", circles: [] },
}

// "지도에서 확인"을 누르기 전에 지도가 어떻게 바뀌는지 한 줄로 — 칩·범례와 같은 낱말을 쓴다
export function vizDescription(viz: VizAction): string {
  const parts: string[] = []
  if (viz.mode) {
    const m = MODE_MAP[viz.mode]
    const circles = m.circles.map((c) => `${CIRCLE_DEF[c].label} 원`).join("·")
    parts.push(`바탕 ${BASE_LABEL[m.base]}${circles ? ` + ${circles}` : ""}`)
  }
  if (viz.layers?.length) parts.push(viz.layers.map((l) => INFRA_STYLE[l].label).join("·"))
  if (viz.candidates) parts.push("재배치 후보")
  if (viz.routes) parts.push("청소차 노선")
  if (viz.dong) parts.push(`${viz.dong} 확대`)
  return parts.join(" · ")
}

const CHIP =
  "inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1 text-[13px] backdrop-blur transition-colors"
const CHIP_OFF = "border-[var(--cp-border)] bg-[var(--cp-overlay)] text-[var(--cp-text-muted)] hover:bg-[var(--cp-hover)]"

interface Props {
  data: DumpingMapData | null
  view: MapView
  onChange: (next: MapView) => void // 사용자가 칩을 만졌을 때 — 부모는 "반영 중" 배지를 내린다
  active: { label: string; onClear: () => void } | null // 지도에 반영 중인 발견·정책 수단
  onFocusCandidate: (f: CandidateFocus) => void
}

export default function MapControls({ data, view, onChange, active, onFocusCandidate }: Props) {
  const [showHelp, setShowHelp] = useState(false) // 지도 읽는 법 — 좁은 화면에서 지도를 덮지 않도록 기본 접힘
  const patch = (p: Partial<MapView>) => onChange({ ...view, ...p })

  return (
    <>
      <button
        onClick={() => setShowHelp((v) => !v)}
        aria-expanded={showHelp}
        className={`absolute right-2 top-2 z-[1001] whitespace-nowrap rounded-full border px-2.5 py-1 text-[13px] shadow-sm backdrop-blur transition-colors ${
          showHelp
            ? "border-[var(--cp-border-active)] bg-white/95 font-medium text-[var(--cp-text-strong)]"
            : "border-[var(--cp-border)] bg-white/90 text-[var(--cp-text-muted)] hover:bg-[var(--cp-hover)]"
        }`}
      >
        {showHelp ? "✕ 닫기" : "ⓘ 지도 읽는 법"}
      </button>

      {/* 후보 목록이 열리면 데스크톱에서 칩 줄이 그 아래로 들어가지 않도록 폭을 양보 */}
      <div
        className={`absolute left-2 top-2 z-[1000] flex max-w-[calc(100%-8rem)] flex-col gap-1.5 ${
          view.candidates ? "md:max-w-[calc(100%-20rem)]" : ""
        }`}
      >
        {active && (
          <span className="flex max-w-full items-center gap-2 self-start rounded-full border border-[#0c6155]/40 bg-white/95 py-1 pl-3 pr-1.5 shadow-sm backdrop-blur">
            <span className="truncate text-[13.5px] font-medium text-[#0c6155]">{active.label} · 지도에 반영 중</span>
            <button
              onClick={active.onClear}
              aria-label="지도 반영 해제"
              className="shrink-0 rounded-full bg-[#0c6155]/10 px-1.5 py-0.5 text-[12px] text-[#0c6155] hover:bg-[#0c6155]/20"
            >
              ✕
            </button>
          </span>
        )}
        <div className="flex flex-nowrap items-center gap-1 overflow-x-auto pb-0.5 md:flex-wrap md:overflow-visible">
          <span className="shrink-0 pl-1 text-[12px] font-medium text-[var(--cp-text-dim)]">바탕</span>
          {(Object.keys(BASE_LABEL) as BaseMode[]).map((m) => (
            <button
              key={m}
              aria-pressed={view.base === m}
              // 자기 자신을 원으로 또 겹치는 건 무의미 — 자동 해제
              onClick={() => patch({ base: m, circles: view.circles.filter((c) => c !== m) })}
              className={`${CHIP} ${
                view.base === m ? "border-[#0c6155] bg-[#0c6155]/15 font-medium text-[#0c6155]" : CHIP_OFF
              }`}
            >
              {BASE_LABEL[m]}
            </button>
          ))}
          <span className="mx-1 h-4 w-px shrink-0 bg-[var(--cp-border)]" />
          <span className="shrink-0 text-[12px] font-medium text-[var(--cp-text-dim)]">원 겹치기</span>
          {(Object.keys(CIRCLE_DEF) as CircleId[]).map((c) => {
            const on = view.circles.includes(c)
            const sameAsBase = view.base === c
            return (
              <button
                key={c}
                disabled={sameAsBase}
                aria-pressed={on}
                title={sameAsBase ? "바탕과 같은 지표는 겹칠 필요가 없습니다" : undefined}
                onClick={() =>
                  patch({ circles: on ? view.circles.filter((x) => x !== c) : [...view.circles, c] })
                }
                className={`${CHIP} disabled:opacity-35 ${on ? "bg-[var(--cp-overlay)] font-medium" : CHIP_OFF}`}
                style={on ? { borderColor: CIRCLE_DEF[c].color, color: CIRCLE_DEF[c].color } : undefined}
              >
                <i
                  className="h-2.5 w-2.5 rounded-full border-2"
                  style={{ borderColor: CIRCLE_DEF[c].color, background: `${CIRCLE_DEF[c].color}30` }}
                />
                {CIRCLE_DEF[c].label} 원
              </button>
            )
          })}
        </div>
        <div className="flex flex-nowrap gap-1 overflow-x-auto pb-0.5 md:flex-wrap md:overflow-visible">
          {INFRA_IDS.map((id) => {
            const on = view.layers.includes(id)
            return (
              <button
                key={id}
                aria-pressed={on}
                onClick={() => patch({ layers: on ? view.layers.filter((l) => l !== id) : [...view.layers, id] })}
                className={`${CHIP} ${
                  on
                    ? "border-[var(--cp-border-active)] bg-[var(--cp-overlay)] font-medium text-[var(--cp-text-strong)]"
                    : CHIP_OFF
                }`}
              >
                <i className="h-2 w-2 rounded-full" style={{ background: INFRA_STYLE[id].color, opacity: on ? 1 : 0.4 }} />
                {INFRA_STYLE[id].label}
                {data ? ` ${data.infra[id].length}` : ""}
              </button>
            )
          })}
          <button
            aria-pressed={view.routes}
            onClick={() => patch({ routes: !view.routes })}
            className={`${CHIP} ${view.routes ? "border-[#d97706] bg-[#d97706]/10 font-medium text-[#92500a]" : CHIP_OFF}`}
          >
            <i className="h-0.5 w-3.5 rounded-full bg-[#d97706]" />
            청소차 노선
          </button>
          <button
            aria-pressed={view.candidates}
            onClick={() => patch({ candidates: !view.candidates })}
            className={`${CHIP} ${view.candidates ? "border-red-500 bg-red-500/10 font-medium text-red-600" : CHIP_OFF}`}
          >
            <i className="h-2 w-2 rounded-full border border-dashed border-red-500" />
            재배치 후보 {data ? data.cctvCandidates.length : 20}
          </button>
        </div>
        {showHelp && (
          <p className="max-w-md rounded-lg border border-[var(--cp-border)] bg-[var(--cp-overlay)] px-2.5 py-1.5 text-[12.5px] leading-snug text-[var(--cp-text-muted)] shadow-sm backdrop-blur">
            {BASE_DESC[view.base]}
            {view.circles.length > 0 &&
              ` 그 위에 겹친 ${view.circles.map((c) => `${CIRCLE_DEF[c].label} 원(${c === "comp" ? "빨강" : "보라"})`).join("과 ")}은 바탕과 비교해 보시라고 올린 결과 지표입니다.`}
          </p>
        )}
      </div>

      {/* 범례 — 모드별 팔레트 반영 */}
      <div className="pointer-events-none absolute bottom-2 left-2 z-[1000] flex items-center gap-1.5 rounded bg-[var(--cp-overlay)] px-2 py-1 text-[13px] text-[var(--cp-text)] backdrop-blur">
        <span className="font-medium">{BASE_DEF[view.base].legend}</span>
        <span>적음</span>
        <span className="flex">
          {BASE_DEF[view.base].pal.map((c) => (
            <i key={c} className="h-3 w-4" style={{ background: c }} />
          ))}
        </span>
        <span>많음</span>
        {view.circles.map((c) => (
          <span key={c} className="ml-1 inline-flex items-center gap-1">
            <i
              className="h-2.5 w-2.5 rounded-full border"
              style={{ borderColor: CIRCLE_DEF[c].color, background: `${CIRCLE_DEF[c].color}30` }}
            />
            {CIRCLE_DEF[c].label} 원
          </span>
        ))}
        <span className="ml-1">칸=100m</span>
      </div>

      {/* 재배치 후보 주소 목록 — 데스크톱은 "지도 읽는 법" 버튼 아래(top-12)에 둬 겹치지 않는다 */}
      {view.candidates && data && (
        <div className="absolute bottom-10 right-2 z-[1000] w-64 max-w-[75%] overflow-hidden rounded-xl border border-[var(--cp-border)] bg-white/95 shadow-md backdrop-blur md:bottom-auto md:top-12 md:w-72">
          <p className="border-b border-[var(--cp-border)] px-3 py-2 text-[13px] font-semibold text-[var(--cp-text-strong)]">
            이동식 CCTV 재배치 후보 {data.cctvCandidates.length}곳
            <span className="block text-[11px] font-normal text-[var(--cp-text-dim)]">
              발생이력 순 · 자원배분 논리 (통계 효과 근거 아님)
            </span>
          </p>
          <div className="max-h-[22dvh] overflow-y-auto md:max-h-[42dvh]">
            {data.cctvCandidates.map((c, i) => (
              <button
                key={i}
                onClick={() =>
                  onFocusCandidate({ seq: Date.now(), latlng: [c[0], c[1]], label: `재배치 후보 ${i + 1}위 · ${c[5] || c[4]}` })
                }
                className={`flex w-full items-start gap-2 border-b border-[var(--cp-border-faint)] px-3 py-2 text-left last:border-b-0 hover:bg-[var(--cp-hover)] ${
                  i < 3 ? "bg-red-50" : ""
                }`}
              >
                <span
                  className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white ${
                    i < 3 ? "bg-red-600 ring-2 ring-red-300" : "bg-red-400"
                  }`}
                >
                  {i + 1}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-[13px] font-medium text-[var(--cp-text-strong)]">
                    {c[5] || `${c[4]} (주소 미상)`}
                  </span>
                  <span className="block text-[12px] text-[var(--cp-text-dim)]">
                    {c[4]} · 민원 {c[2]} · 과태료 {c[3]}
                  </span>
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </>
  )
}
