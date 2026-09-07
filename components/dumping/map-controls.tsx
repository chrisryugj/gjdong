"use client"

import { useState } from "react"
import type { BaseMode, CircleId, DumpingMapData, InfraLayerId, MapMode, VizAction } from "@/lib/dumping/types"
import { BIN_RECO_COLOR, BIN_RECO_LABEL, BASE_DEF, CIRCLE_DEF, INFRA_STYLE, ZERO_CELL, type CandidateFocus } from "./dumping-map"
import { BIN_RECOS } from "@/lib/dumping/bin-recos"
import { tallyInfra } from "@/lib/dumping/facts"

// 지도 위에 무엇을 그릴지. 칩·발견 카드·정책 수단·질문 답변이 전부 이 한 덩어리를 바꾼다
export interface MapView {
  base: BaseMode
  circles: CircleId[]
  layers: InfraLayerId[]
  candidates: boolean
  binRecos: boolean
  routes: boolean
}

export const DEFAULT_VIEW: MapView = { base: "unm", circles: ["comp"], layers: [], candidates: false, binRecos: false, routes: false }

const BASE_LABEL: Record<BaseMode, string> = {
  unm: "다가구·단독",
  comp: "민원",
  enf: "과태료",
  lp: "생활인구",
}

// 바탕 한 줄 뜻. 범례 첫 줄에 항상 보인다. 통계 낱말 없이
const BASE_MEANING: Record<BaseMode, string> = {
  unm: "색이 진할수록 다가구·단독주택이 많은 칸(원인 쪽)",
  comp: "색이 진할수록 주민 신고 민원이 많은 칸",
  enf: "색이 진할수록 과태료를 많이 부과한 칸",
  lp: "색이 진할수록 머무는 사람이 많은 칸(서울시 생활인구)",
}

// 도움말을 펼쳤을 때 보이는 긴 설명. 수치는 데이터에서
const baseDesc = (m: BaseMode, data: DumpingMapData | null): string => {
  switch (m) {
    case "unm":
      return "바탕색은 다가구·단독 밀집(건축물대장 다가구 가구+일반단독 동)의 밀도입니다. 아파트 세대수는 연관이 확인되지 않아 따로 레이어를 두지 않았습니다."
    case "comp":
      return "바탕색은 주민이 신고한 민원 건수입니다. 앱 보급에 따른 신고 편향이 섞여 있어 실제 발생보다 부풀어 보일 수 있습니다."
    case "enf":
      return "바탕색은 단속으로 부과한 과태료 건수입니다. 대부분 신고를 받아 적발한 것이고 순찰·근무 패턴도 섞여 있어, 발생 그 자체는 아닙니다."
    case "lp":
      return `바탕색은 서울시 250m 격자 생활인구(${data?.decision.seoul?.livingPop250Month ?? "2026-07"} 시간·일 평균)를 100m 칸에 면적 비례로 나눈 체류 인구입니다. 사람이 많이 머무는 곳인지, 즉 노출을 보는 바탕입니다.`
  }
}

const INFRA_IDS = Object.keys(INFRA_STYLE) as InfraLayerId[]

// VizAction(발견 카드·예시 질문)의 기존 mode를 바탕+원 조합으로 해석
export const MODE_MAP: Record<MapMode, { base: BaseMode; circles: CircleId[] }> = {
  overlay: { base: "unm", circles: ["comp"] },
  unm: { base: "unm", circles: [] },
  comp: { base: "comp", circles: [] },
  enf: { base: "enf", circles: [] },
  lp: { base: "lp", circles: ["enf"] },
}

// "지도에서 확인"을 누르기 전에 지도가 어떻게 바뀌는지 한 줄로. 칩·범례와 같은 낱말을 쓴다
export function vizDescription(viz: VizAction): string {
  const parts: string[] = []
  if (viz.mode) {
    const m = MODE_MAP[viz.mode]
    const circles = m.circles.map((c) => `${CIRCLE_DEF[c].label} 원`).join("·")
    parts.push(`바탕 ${BASE_LABEL[m.base]}${circles ? ` + ${circles}` : ""}`)
  }
  if (viz.layers?.length) parts.push(viz.layers.map((l) => INFRA_STYLE[l].label).join("·"))
  if (viz.candidates) parts.push("재배치 후보")
  if (viz.binRecos) parts.push(BIN_RECO_LABEL)
  if (viz.routes) parts.push("청소차 노선")
  if (viz.dong) parts.push(`${viz.dong} 확대`)
  return parts.join(" · ")
}

const CHIP =
  "inline-flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 text-[14px] transition-colors"
const CHIP_OFF = "border-[var(--cp-border)] bg-white text-[var(--cp-text-muted)] hover:bg-[var(--cp-hover)]"
const LABEL = "shrink-0 text-[13px] font-medium text-[var(--cp-text-dim)]"

// ─── 툴바. 지도 위가 아니라 지도 위쪽 띠에 둔다. 지도 위 오버레이끼리 겹치던 문제를 배치로 없앤다 ───
interface ToolbarProps {
  data: DumpingMapData | null
  view: MapView
  onChange: (next: MapView) => void // 사용자가 칩을 만졌을 때. 부모는 "반영 중" 배지를 내린다
  active: { label: string; onClear: () => void } | null // 지도에 반영 중인 발견·정책 수단
}

export function MapToolbar({ data, view, onChange, active }: ToolbarProps) {
  const [layersOpen, setLayersOpen] = useState(false)
  const patch = (p: Partial<MapView>) => onChange({ ...view, ...p })
  const layerCount =
    view.layers.length + (view.routes ? 1 : 0) + (view.candidates ? 1 : 0) + (view.binRecos ? 1 : 0)

  return (
    <div className="shrink-0 border-b border-[var(--cp-border)] bg-[var(--cp-bg)]">
      <div className="flex items-center gap-2 overflow-x-auto px-3 py-2 [scrollbar-width:none]">
        <span className={LABEL}>바탕</span>
        {/* 바탕은 하나만. 분절 컨트롤로 배타 선택임을 드러낸다 */}
        <span className="flex shrink-0 overflow-hidden rounded-full border border-[var(--cp-border)] bg-white">
          {(Object.keys(BASE_LABEL) as BaseMode[]).map((m) => (
            <button
              key={m}
              aria-pressed={view.base === m}
              // 자기 자신을 원으로 또 겹치는 건 무의미. 자동 해제
              onClick={() => patch({ base: m, circles: view.circles.filter((c) => c !== m) })}
              className={`h-8 whitespace-nowrap px-3 text-[14px] transition-colors ${
                view.base === m
                  ? "bg-[#0c6155] font-semibold text-white"
                  : "text-[var(--cp-text-muted)] hover:bg-[var(--cp-hover)]"
              }`}
            >
              {BASE_LABEL[m]}
            </button>
          ))}
        </span>
        <span className="mx-1 h-5 w-px shrink-0 bg-[var(--cp-border)]" />
        <span className={LABEL}>원 겹치기</span>
        {(Object.keys(CIRCLE_DEF) as CircleId[]).map((c) => {
          const on = view.circles.includes(c)
          const sameAsBase = view.base === c
          return (
            <button
              key={c}
              disabled={sameAsBase}
              aria-pressed={on}
              title={sameAsBase ? "바탕과 같은 지표는 겹칠 필요가 없습니다" : undefined}
              onClick={() => patch({ circles: on ? view.circles.filter((x) => x !== c) : [...view.circles, c] })}
              className={`${CHIP} disabled:opacity-35 ${on ? "bg-white font-semibold" : CHIP_OFF}`}
              style={on ? { borderColor: CIRCLE_DEF[c].color, color: CIRCLE_DEF[c].color } : undefined}
            >
              <i
                className="h-3 w-3 rounded-full border-2"
                style={{ borderColor: CIRCLE_DEF[c].color, background: `${CIRCLE_DEF[c].color}30` }}
              />
              {CIRCLE_DEF[c].label}
            </button>
          )
        })}
        <span className="mx-1 h-5 w-px shrink-0 bg-[var(--cp-border)]" />
        <button
          aria-expanded={layersOpen}
          onClick={() => setLayersOpen((v) => !v)}
          className={`${CHIP} ${layerCount > 0 ? "border-[var(--cp-border-active)] bg-white font-semibold text-[var(--cp-text-strong)]" : CHIP_OFF}`}
        >
          시설 레이어 {layerCount > 0 ? `${layerCount}개 표시 중` : ""} {layersOpen ? "▴" : "▾"}
        </button>
        {active && (
          <span className="ml-auto flex shrink-0 items-center gap-2 rounded-full border border-[#0c6155]/40 bg-[#0c6155]/8 py-1 pl-3 pr-1.5">
            <span className="max-w-[16rem] truncate text-[14px] font-medium text-[#0c6155]">{active.label} · 지도에 반영 중</span>
            <button
              onClick={active.onClear}
              aria-label="지도 반영 해제"
              className="shrink-0 rounded-full bg-[#0c6155]/10 px-2 py-0.5 text-[13px] text-[#0c6155] hover:bg-[#0c6155]/20"
            >
              ✕
            </button>
          </span>
        )}
      </div>
      {/* 시설 레이어 줄. 눌러서 연다. 상시 노출하면 칩 두 줄이 지도 높이를 먹는다 */}
      {layersOpen && (
        <div className="flex items-center gap-2 overflow-x-auto border-t border-[var(--cp-border-faint)] px-3 py-2 [scrollbar-width:none] md:flex-wrap md:overflow-visible">
          {INFRA_IDS.map((id) => {
            const on = view.layers.includes(id)
            return (
              <button
                key={id}
                aria-pressed={on}
                onClick={() => patch({ layers: on ? view.layers.filter((l) => l !== id) : [...view.layers, id] })}
                className={`${CHIP} ${
                  on ? "border-[var(--cp-border-active)] bg-white font-semibold text-[var(--cp-text-strong)]" : CHIP_OFF
                }`}
              >
                <i className="h-2.5 w-2.5 rounded-full" style={{ background: INFRA_STYLE[id].color, opacity: on ? 1 : 0.45 }} />
                {INFRA_STYLE[id].label}
                {/* 원자료 행이 아니라 중복을 뺀 기록 수. 가로쓰레기통은 128행이 실은 64곳이다 */}
                {data ? ` ${tallyInfra(data.infra[id]).records.length}` : ""}
              </button>
            )
          })}
          <button
            aria-pressed={view.routes}
            onClick={() => patch({ routes: !view.routes })}
            className={`${CHIP} ${view.routes ? "border-[#d97706] bg-[#d97706]/10 font-semibold text-[#92500a]" : CHIP_OFF}`}
          >
            <i className="h-0.5 w-4 rounded-full bg-[#d97706]" />
            청소차 노선
          </button>
          <button
            aria-pressed={view.candidates}
            onClick={() => patch({ candidates: !view.candidates })}
            className={`${CHIP} ${view.candidates ? "border-red-500 bg-red-500/10 font-semibold text-red-600" : CHIP_OFF}`}
          >
            <i className="h-2.5 w-2.5 rounded-full border border-dashed border-red-500" />
            CCTV 재배치 후보 {data ? data.cctvCandidates.length : 20}
          </button>
          <button
            aria-pressed={view.binRecos}
            onClick={() => patch({ binRecos: !view.binRecos })}
            className={`${CHIP} ${view.binRecos ? "bg-white font-semibold" : CHIP_OFF}`}
            style={view.binRecos ? { borderColor: BIN_RECO_COLOR, color: BIN_RECO_COLOR } : undefined}
          >
            <i className="h-2.5 w-2.5 rounded-full border border-dashed" style={{ borderColor: BIN_RECO_COLOR }} />
            {BIN_RECO_LABEL} {BIN_RECOS.items.length}
          </button>
        </div>
      )}
    </div>
  )
}

// ─── 지도 위 오버레이. 범례 카드(좌하단)와 재배치 후보 목록(우상단)뿐. 서로 겹칠 자리가 없다 ───
interface OverlayProps {
  data: DumpingMapData | null
  view: MapView
  onFocusCandidate: (f: CandidateFocus) => void
  selectedDong?: string | null // 격자 대체 표를 선택 동으로 좁힌다
}

export function MapOverlays({ data, view, onFocusCandidate, selectedDong = null }: OverlayProps) {
  const [showHelp, setShowHelp] = useState(false)
  const [showTable, setShowTable] = useState(false)
  const [legendOpen, setLegendOpen] = useState(false) // 모바일에서만 뜻이 있다. 데스크톱은 항상 펼침
  const def = BASE_DEF[view.base]

  return (
    <>
      {/* 범례 카드. 첫 5초에 지도가 무슨 그림인지 여기서 읽힌다: 바탕 뜻·원 뜻·빈 칸 뜻.
          모바일은 지도가 작아 색띠 한 줄만 두고 접는다 */}
      <div className="absolute bottom-3 left-3 z-[1000] w-[min(22rem,calc(100%-5.5rem))] rounded-xl border border-[var(--cp-border)] bg-white/95 text-[13.5px] leading-snug text-[var(--cp-text)] shadow-sm backdrop-blur print:hidden">
        <div className="flex flex-col gap-1.5 px-3 py-2.5">
          <div className="flex items-center gap-2">
            <span className="flex overflow-hidden rounded-sm">
              {def.pal.map((c) => (
                <i key={c} className="h-3.5 w-4" style={{ background: c }} />
              ))}
            </span>
            <span className="font-mono text-[11px] leading-none text-[var(--cp-text-dim)]">
              {def.stops[1]}+ … {def.stops[def.stops.length - 1]}+ {def.unit}
            </span>
            <button
              onClick={() => setLegendOpen((v) => !v)}
              aria-expanded={legendOpen}
              className="ml-auto text-[13px] font-medium text-[#0c6155] md:hidden"
            >
              {legendOpen ? "범례 접기" : "범례 뜻"}
            </button>
          </div>
          <div className={`${legendOpen ? "flex" : "hidden md:flex"} flex-col gap-1.5`}>
          <p>{BASE_MEANING[view.base]}</p>
          {view.circles.map((c) => (
            <p key={c} className="flex items-center gap-1.5">
              <i
                className="h-3 w-3 shrink-0 rounded-full border"
                style={{ borderColor: CIRCLE_DEF[c].color, background: `${CIRCLE_DEF[c].color}30` }}
              />
              <span>
                {c === "comp" ? "빨간" : "보라"} 원은 {CIRCLE_DEF[c].label} 건수, 클수록 많음
              </span>
            </p>
          ))}
          <p className="flex items-center gap-1.5 text-[var(--cp-text-muted)]">
            <i className="h-3 w-3 shrink-0 rounded-sm border" style={{ borderColor: ZERO_CELL, background: `${ZERO_CELL}20` }} />
            <span>옅은 칸은 {def.legend} 0. 흰 바탕은 민원·과태료·다가구 모두 0인 곳(한강·아차산·공원·아파트 단지)</span>
          </p>
          <div className="mt-0.5 flex items-center gap-3 text-[12.5px] text-[var(--cp-text-dim)]">
            <span>칸 하나 = 100m</span>
            <button onClick={() => setShowHelp((v) => !v)} aria-expanded={showHelp} className="font-medium text-[#0c6155] hover:underline">
              {showHelp ? "설명 접기" : "자세한 설명"}
            </button>
            {data && (
              <button onClick={() => setShowTable((v) => !v)} aria-expanded={showTable} className="font-medium text-[#0c6155] hover:underline">
                {showTable ? "표 닫기" : "상위 20칸 표"}
              </button>
            )}
          </div>
          {showHelp && (
            <p className="border-t border-[var(--cp-border-faint)] pt-1.5 text-[13px] leading-relaxed text-[var(--cp-text-muted)]">
              {baseDesc(view.base, data)}
              {view.circles.length > 0 &&
                ` 그 위에 겹친 ${view.circles.map((c) => `${CIRCLE_DEF[c].label} 원`).join("과 ")}은 바탕(원인 쪽)과 결과를 한 칸에서 견주려고 올린 것입니다.`}
            </p>
          )}
          </div>
        </div>
        {/* 격자 대체 표. 캔버스 격자는 키보드·스크린리더가 읽지 못한다. 현재 바탕 상위 20칸 */}
        {showTable && data && (
          <div className="max-h-[32dvh] overflow-y-auto border-t border-[var(--cp-border)] px-1 pb-1 text-[13px]">
            <table className="w-full">
              <caption className="sr-only">{def.legend} 상위 20개 100m 격자. 행정동, 값, 민원, 과태료 순</caption>
              <thead>
                <tr className="text-left text-[var(--cp-text-dim)]">
                  <th scope="col" className="px-1.5 py-1">순위</th>
                  <th scope="col" className="px-1.5 py-1">행정동</th>
                  <th scope="col" className="px-1.5 py-1 text-right">{def.legend}({def.unit})</th>
                  <th scope="col" className="px-1.5 py-1 text-right">민원</th>
                  <th scope="col" className="px-1.5 py-1 text-right">과태료</th>
                </tr>
              </thead>
              <tbody>
                {[...data.grid]
                  .filter((c) => selectedDong === null || c[7] === selectedDong)
                  .sort((a, b) => b[def.idx] - a[def.idx])
                  .slice(0, 20)
                  .map((c, i) => (
                    <tr key={`${c[0]}-${c[1]}`} className="border-t border-[var(--cp-border-faint)]">
                      <td className="px-1.5 py-1 font-mono">{i + 1}</td>
                      <td className="px-1.5 py-1">{c[7] || "광진구"}</td>
                      <td className="px-1.5 py-1 text-right font-mono">{c[def.idx].toLocaleString()}</td>
                      <td className="px-1.5 py-1 text-right font-mono">{c[4]}</td>
                      <td className="px-1.5 py-1 text-right font-mono">{c[5]}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 재배치 후보 주소 목록. 우상단. 줌 버튼(우하단)·범례(좌하단)와 자리가 다르다 */}
      {view.candidates && data && (
        <div className="absolute right-3 top-3 z-[1000] w-72 max-w-[75%] overflow-hidden rounded-xl border border-[var(--cp-border)] bg-white/95 shadow-md backdrop-blur md:w-80">
          <p className="border-b border-[var(--cp-border)] px-3 py-2 text-[14px] font-semibold text-[var(--cp-text-strong)]">
            이동식 CCTV 재배치 후보 {data.cctvCandidates.length}곳
            <span className="block text-[12.5px] font-normal text-[var(--cp-text-dim)]">
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
                  className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[12px] font-bold text-white ${
                    i < 3 ? "bg-red-600 ring-2 ring-red-300" : "bg-red-400"
                  }`}
                >
                  {i + 1}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-[14px] font-medium text-[var(--cp-text-strong)]">
                    {c[5] || `${c[4]} (주소 없음)`}
                  </span>
                  <span className="block text-[13px] text-[var(--cp-text-dim)]">
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
