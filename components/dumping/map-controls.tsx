"use client"

import { useState } from "react"
import type { BaseMode, CircleId, DumpingMapData, InfraLayerId, MapMode, VizAction, WeatherKey } from "@/lib/dumping/types"
import { BIN_RECO_COLOR, BIN_RECO_LABEL, BASE_DEF, CIRCLE_DEF, COMP_COLOR, ENF_COLOR, INFRA_STYLE, REAL_BUILDING, ZERO_CELL, greyRamp, type CandidateFocus } from "./map-geo"
import { tallyInfra } from "@/lib/dumping/facts"
import { Ico } from "./icons"
import { useTheme } from "./theme"

// 지도 위에 무엇을 그릴지. 칩·발견 카드·정책 수단·질문 답변이 전부 이 한 덩어리를 바꾼다
// 지도 모드 상수는 lib/dumping/labels.ts(순환 import 회피). 여기서는 다시 내보내기만
export { CHANNEL_DEF, DONG_MODE_LABEL, WEATHER_DEF, type DongMode } from "@/lib/dumping/labels"
import { CHANNEL_DEF, DONG_MODE_LABEL, WEATHER_DEF, type DongMode } from "@/lib/dumping/labels"

export interface MapView {
  base: BaseMode
  circles: CircleId[]
  layers: InfraLayerId[]
  candidates: boolean
  binRecos: boolean
  routes: boolean
  dongBars: boolean // 동별 민원·과태료 3D 막대(시연용 비교 뷰)
  dongMode: DongMode // 12라운드: 합계 · 채널 스택 · 연도별
  dongYear: string | null // 연도 모드에서 고른 해
  grid3d: boolean // 격자 기둥(원 지표 건수, 5건 이상 칸)
  weather: WeatherKey | null // 날씨별 원. 켜면 보통 원 대신 그 조건의 민원(하루당 환산)
  tilt: boolean // 16라운드: 입체 보기(기울기·건물 3D·지형). 끄면 위에서 본 평면
  orbit: boolean // 자동 회전(시연용). 지도를 만지면 꺼진다
  fly: boolean // 17라운드: 드론 비행(시연용). 구 전체 → 핫스팟 5곳 → 구 전체를 천천히. 지도를 만지면 꺼진다
}

// 10라운드: 기본 원은 과태료. 회귀 판정의 결과지표가 과태료라 민원 원을 겹치면 화면의 겹침이 회귀 증거처럼 읽혔다(검토서 6절)
export const DEFAULT_VIEW: MapView = {
  base: "unm",
  circles: ["enf"],
  layers: [],
  candidates: false,
  binRecos: false,
  routes: false,
  dongBars: false,
  dongMode: "total",
  dongYear: null,
  grid3d: false,
  weather: null,
  tilt: true,
  orbit: false,
  fly: false,
}

const BASE_LABEL: Record<BaseMode, string> = {
  none: "없음",
  unm: "다가구·단독",
  comp: "민원",
  enf: "과태료",
  lp: "생활인구",
}

// 바탕 한 줄 뜻. 범례 첫 줄에 항상 보인다. 통계 낱말 없이
const BASE_MEANING: Record<BaseMode, string> = {
  none: "격자를 칠하지 않습니다. 건물은 층수로 짐작한 실사 색(1~2층 단독 · 3~4층 다가구 · 5~9층 근생·빌라 · 10층+ 아파트 · 20층+ 고층)",
  unm: "색이 진할수록 다가구·단독주택이 많은 칸(적발 기록과 같이 움직이는 조건. 판정은 과태료 기준)",
  comp: "색이 진할수록 주민 신고 민원이 많은 칸(앱 신고 편향 포함)",
  enf: "색이 진할수록 과태료를 많이 부과한 칸(회귀 판정의 결과지표)",
  lp: "색이 진할수록 생활인구가 많은 칸(서울시 250m 격자)",
}

// 도움말을 펼쳤을 때 보이는 긴 설명. 수치는 데이터에서
const baseDesc = (m: BaseMode, data: DumpingMapData | null): string => {
  switch (m) {
    case "none":
      return "바탕 지표 없이 원·기둥·시설만 봅니다. 건물 색은 GIS건물통합정보의 지상층수를 유형으로 읽은 것이라 실제 용도와 다를 수 있습니다."
    case "unm":
      return "바탕색은 다가구·단독 밀집(건축물대장 다가구 가구+일반단독 동)의 밀도입니다. 아파트 세대수는 연관이 확인되지 않아 따로 레이어를 두지 않았습니다."
    case "comp":
      return "바탕색은 주민이 신고한 민원 건수입니다. 앱 보급에 따른 신고 편향이 섞여 있어 실제 발생보다 부풀어 보일 수 있습니다."
    case "enf":
      return "바탕색은 단속으로 부과한 과태료 건수입니다. 대부분 신고를 받아 적발한 것이고 순찰·근무 패턴도 섞여 있어, 발생 그 자체는 아닙니다."
    case "lp":
      return `바탕색은 서울시 250m 격자 생활인구(${data?.decision.seoul?.livingPop250Month ?? "2026-07"} 시간·일 평균)를 100m 칸에 면적 비례로 나눈 값입니다. 생활인구가 많은 곳인지, 즉 노출을 보는 바탕입니다.`
  }
}

const INFRA_IDS = Object.keys(INFRA_STYLE) as InfraLayerId[]

// VizAction(발견 카드·예시 질문)의 기존 mode를 바탕+원 조합으로 해석
export const MODE_MAP: Record<MapMode, { base: BaseMode; circles: CircleId[] }> = {
  overlay: { base: "unm", circles: ["enf"] },
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
  if (viz.weather) parts.push(`${WEATHER_DEF[viz.weather].label} 민원 원(하루당 환산)`)
  if (viz.grid3d) parts.push("격자 기둥")
  if (viz.dong) parts.push(`${viz.dong} 확대`)
  return parts.join(" · ")
}

// ─── 공용 스타일. 떠 있는 패널 안의 줄(row) 단위 토글 ───
const ROW = "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-[7px] text-left text-[13.5px] transition-colors hover:bg-[var(--cp-hover)] disabled:opacity-35"
const ROW_ON = "bg-[var(--cp-hover)] font-semibold text-[var(--cp-text-strong)]"
const ROW_OFF = "text-[var(--cp-text-muted)]"
const GROUP = "dump-kicker px-2.5 pb-1 pt-3 text-[10.5px] text-[var(--cp-text-faint)] first:pt-1"
const CHIP_SM = "inline-flex h-7 shrink-0 items-center gap-1 whitespace-nowrap rounded-full border px-2 text-[12.5px] transition-colors"
const CHIP_OFF = "border-[var(--cp-border)] bg-[var(--cp-panel)] text-[var(--cp-text-muted)] hover:bg-[var(--cp-hover)]"
const CHIP_ON = "border-(--dump-accent) bg-(--dump-accent)/10 font-semibold text-(--dump-accent)"

// 줄 왼쪽 표식. 바탕은 네모, 원은 동그라미, 시설은 점
function Swatch({ kind, color, on }: { kind: "square" | "circle" | "dot" | "line"; color: string; on: boolean }) {
  if (kind === "line") return <i className="h-0.5 w-3.5 shrink-0 rounded-full" style={{ background: color, opacity: on ? 1 : 0.45 }} />
  const shape = kind === "square" ? "rounded-[3px]" : "rounded-full"
  const size = kind === "dot" ? "h-2.5 w-2.5" : "h-3 w-3"
  return (
    <i
      className={`${size} shrink-0 border-[1.5px] ${shape}`}
      style={on ? { borderColor: color, background: color } : { borderColor: color, background: `${color}22`, opacity: 0.75 }}
    />
  )
}

// ─── 레이어 패널. 지도 오른쪽에 떠 있는 세로 목록. 바탕 · 원 겹치기 · 보기 · 시설(2026-09-18, 지도 전면 디자인) ───
// 예전 툴바(지도 위쪽 띠)와 같은 상태(MapView)를 같은 방식으로 바꾼다. 칩 두 줄이 지도 높이를 먹던 문제가 사라진다
interface LayerPanelProps {
  data: DumpingMapData | null
  view: MapView
  onChange: (next: MapView) => void // 사용자가 줄을 만졌을 때. 부모는 "반영 중" 배지를 내린다
  active: { label: string; onClear: () => void } | null // 지도에 반영 중인 발견·정책 수단
}

export function MapLayerPanel({ data, view, onChange, active }: LayerPanelProps) {
  // 동별 막대 연도 버튼. 민원 연도(접수) 기준. 과태료 위반 연도에는 2022·2023 이월 키(구 전체 한 자리 건수)가 있어 합치면 빈 막대 칩이 생긴다
  const dongYears = data ? Array.from(new Set(data.dong.flatMap((d) => Object.keys(d.yr?.complaints ?? {})))).sort() : []
  const patch = (p: Partial<MapView>) => onChange({ ...view, ...p })

  return (
    <div className="flex min-h-0 flex-col">
      {active && (
        <div className="mb-1 flex items-center gap-2 rounded-lg border border-(--dump-accent)/35 bg-(--dump-accent)/8 py-1.5 pl-2.5 pr-1.5">
          <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-(--dump-accent)">{active.label} · 반영 중</span>
          <button
            onClick={active.onClear}
            aria-label="지도 반영 해제"
            className="shrink-0 rounded-full bg-(--dump-accent)/10 px-2 py-0.5 text-[12.5px] text-(--dump-accent) hover:bg-(--dump-accent)/20"
          >
            ✕
          </button>
        </div>
      )}
      {/* 목록이 열 높이를 넘으면 스크롤. 바닥을 살짝 흐려 더 있음을 알린다 */}
      <div className="min-h-0 overflow-y-auto pb-3 pr-0.5 [scrollbar-width:thin] [mask-image:linear-gradient(to_bottom,#000_calc(100%-18px),transparent)]">
        <p className={GROUP}>바탕</p>
        {(Object.keys(BASE_LABEL) as BaseMode[]).map((m) => {
          const on = view.base === m
          return (
            <button
              key={m}
              role="radio"
              aria-checked={on}
              // 자기 자신을 원으로 또 겹치는 건 무의미. 자동 해제
              onClick={() => patch({ base: m, circles: view.circles.filter((c) => c !== m) })}
              className={`${ROW} ${on ? ROW_ON : ROW_OFF}`}
            >
              {m === "none" ? (
                <i className="h-3 w-3 shrink-0 rounded-[3px] border-[1.5px] border-dashed border-[var(--cp-text-faint)]" style={{ opacity: on ? 1 : 0.7 }} />
              ) : (
                <Swatch kind="square" color={BASE_DEF[m].pal[4]} on={on} />
              )}
              <span className="min-w-0 flex-1">{BASE_LABEL[m]}</span>
            </button>
          )
        })}

        <p className={GROUP}>원 겹치기</p>
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
              className={`${ROW} ${on ? ROW_ON : ROW_OFF}`}
            >
              <Swatch kind="circle" color={CIRCLE_DEF[c].color} on={on} />
              <span className="min-w-0 flex-1">{CIRCLE_DEF[c].label} 원</span>
            </button>
          )
        })}

        <p className={GROUP}>보기</p>
        {/* 16라운드: 입체 보기(기울기·OSM 건물·아차산 지형). 기둥은 입체에서만 높이가 보인다 */}
        <button
          aria-pressed={view.tilt}
          title="지도를 기울여 건물·지형·기둥을 입체로 봅니다. 끄면 위에서 본 평면 격자"
          onClick={() => patch({ tilt: !view.tilt, orbit: false, fly: false })}
          className={`${ROW} ${view.tilt ? ROW_ON : ROW_OFF}`}
        >
          <Ico name="tilt" size={15} />
          <span className="min-w-0 flex-1">입체 보기</span>
        </button>
        {view.tilt && (
          <button
            aria-pressed={view.orbit}
            title="구 전체를 천천히 돌려 봅니다(시연용). 지도를 만지면 멈춥니다"
            onClick={() => patch({ orbit: !view.orbit, fly: false })}
            className={`${ROW} ${view.orbit ? ROW_ON : ROW_OFF}`}
          >
            <Ico name="orbit" size={15} />
            <span className="min-w-0 flex-1">자동 회전</span>
          </button>
        )}
        {view.tilt && (
          <button
            aria-pressed={view.fly}
            title="구 전체를 내려다보다 예측 핫스팟 상위 5곳을 낮게 천천히 돌아봅니다(시연용). 지도를 만지면 멈춥니다"
            onClick={() => patch({ fly: !view.fly, orbit: false })}
            className={`${ROW} ${view.fly ? ROW_ON : ROW_OFF}`}
          >
            <Ico name="drone" size={15} />
            <span className="min-w-0 flex-1">드론 비행</span>
          </button>
        )}
        <button
          aria-pressed={view.dongBars}
          title="행정동 15곳의 민원·과태료 건수를 입체 막대로 비교합니다"
          onClick={() => patch({ dongBars: !view.dongBars })}
          className={`${ROW} ${view.dongBars ? ROW_ON : ROW_OFF}`}
        >
          <Ico name="bars" size={15} />
          <span className="min-w-0 flex-1">동별 막대</span>
        </button>
        {/* 12라운드: 동별 막대 모드. 합계 · 채널 스택(앱·120·직접) · 연도별 */}
        {view.dongBars && (
          <div className="flex flex-wrap items-center gap-1 px-2.5 pb-2 pt-0.5">
            {(Object.keys(DONG_MODE_LABEL) as DongMode[]).map((m) => (
              <button
                key={m}
                aria-pressed={view.dongMode === m}
                onClick={() => patch({ dongMode: m, dongYear: m === "year" ? (view.dongYear ?? dongYears[dongYears.length - 1] ?? null) : view.dongYear })}
                className={`${CHIP_SM} ${view.dongMode === m ? CHIP_ON : CHIP_OFF}`}
              >
                {DONG_MODE_LABEL[m]}
              </button>
            ))}
            {view.dongMode === "year" &&
              dongYears.map((y) => (
                <button
                  key={y}
                  aria-pressed={view.dongYear === y}
                  onClick={() => patch({ dongYear: y })}
                  className={`${CHIP_SM} font-mono ${view.dongYear === y ? CHIP_ON : CHIP_OFF}`}
                >
                  {y}
                </button>
              ))}
            {/* 막대 색 범례 */}
            <span className="flex w-full flex-wrap items-center gap-x-2 gap-y-0.5 pt-1 text-[12px] text-[var(--cp-text-dim)]">
              {view.dongMode === "channel" ? (
                (Object.keys(CHANNEL_DEF) as (keyof typeof CHANNEL_DEF)[]).map((c) => (
                  <span key={c} className="flex items-center gap-1">
                    <i className="h-2.5 w-2.5 rounded-[2px]" style={{ background: CHANNEL_DEF[c].front }} />
                    {CHANNEL_DEF[c].label}
                  </span>
                ))
              ) : (
                <span className="flex items-center gap-1">
                  <i className="h-2.5 w-2.5 rounded-[2px]" style={{ background: COMP_COLOR }} />민원
                </span>
              )}
              <span className="flex items-center gap-1">
                <i className="h-2.5 w-2.5 rounded-[2px]" style={{ background: ENF_COLOR }} />과태료
              </span>
            </span>
          </div>
        )}
        <button
          aria-pressed={view.grid3d}
          title="칸마다 원 지표(민원·과태료) 건수를 기둥으로 세웁니다. 5건 이상 칸만. 켜면 입체 보기로 바뀝니다"
          // 기둥 높이는 기울여야 보인다. 켜는 순간 입체 보기로
          onClick={() => patch({ grid3d: !view.grid3d, ...(!view.grid3d ? { tilt: true } : {}) })}
          className={`${ROW} ${view.grid3d ? ROW_ON : ROW_OFF}`}
        >
          <Ico name="columns" size={15} />
          <span className="min-w-0 flex-1">격자 기둥</span>
        </button>
        <button
          aria-pressed={!!view.weather}
          title="그 날씨 조건에 접수된 민원을 하루당 환산해 원으로 보입니다(접수일 기준)"
          onClick={() => patch({ weather: view.weather ? null : "hot" })}
          className={`${ROW} ${view.weather ? ROW_ON : ROW_OFF}`}
        >
          <Swatch kind="circle" color={view.weather ? WEATHER_DEF[view.weather].color : "#9aa5a1"} on={!!view.weather} />
          <span className="min-w-0 flex-1">날씨별 민원 원</span>
        </button>
        {view.weather && (
          <div className="flex flex-wrap items-center gap-1 px-2.5 pb-2 pt-0.5">
            {(Object.keys(WEATHER_DEF) as WeatherKey[]).map((w) => (
              <button
                key={w}
                aria-pressed={view.weather === w}
                title={WEATHER_DEF[w].label}
                onClick={() => patch({ weather: w })}
                className={`${CHIP_SM} ${view.weather === w ? "bg-[var(--cp-panel)] font-semibold" : CHIP_OFF}`}
                style={view.weather === w ? { borderColor: WEATHER_DEF[w].color, color: WEATHER_DEF[w].color } : undefined}
              >
                {WEATHER_DEF[w].short}
              </button>
            ))}
          </div>
        )}

        <p className={GROUP}>시설</p>
        {INFRA_IDS.map((id) => {
          const on = view.layers.includes(id)
          return (
            <button
              key={id}
              aria-pressed={on}
              onClick={() => patch({ layers: on ? view.layers.filter((l) => l !== id) : [...view.layers, id] })}
              className={`${ROW} ${on ? ROW_ON : ROW_OFF}`}
            >
              <Swatch kind="dot" color={INFRA_STYLE[id].color} on={on} />
              <span className="min-w-0 flex-1">{INFRA_STYLE[id].label}</span>
              {/* 원자료 행이 아니라 중복을 뺀 기록 수. 가로쓰레기통은 128행이 실은 64곳이다 */}
              {data && <span className="font-mono text-[12px] text-[var(--cp-text-faint)]">{tallyInfra(data.infra[id]).records.length}</span>}
            </button>
          )
        })}
        <button aria-pressed={view.routes} onClick={() => patch({ routes: !view.routes })} className={`${ROW} ${view.routes ? ROW_ON : ROW_OFF}`}>
          <Ico name="truck" size={15} className={view.routes ? "text-(--dump-accent)" : ""} />
          <span className="min-w-0 flex-1">청소차 노선</span>
        </button>
        <button
          aria-pressed={view.candidates}
          onClick={() => patch({ candidates: !view.candidates })}
          className={`${ROW} ${view.candidates ? ROW_ON : ROW_OFF}`}
        >
          <Ico name="pin" size={15} className={view.candidates ? "text-(--dump-accent)" : ""} />
          <span className="min-w-0 flex-1">CCTV 재배치 후보</span>
          <span className="font-mono text-[12px] text-[var(--cp-text-faint)]">{data ? data.cctvCandidates.length : 20}</span>
        </button>
        <button
          aria-pressed={view.binRecos}
          onClick={() => patch({ binRecos: !view.binRecos })}
          className={`${ROW} ${view.binRecos ? ROW_ON : ROW_OFF}`}
          title="외부 산출물(데이터팀 격자 분석). 이 화면의 핫스팟·상습격자·회귀와 독립이며 산출 방법은 확인되지 않았습니다. 겹침 정도는 데이터·방법 참고"
        >
          <Ico name="ring" size={15} style={{ color: BIN_RECO_COLOR, opacity: view.binRecos ? 1 : 0.7 }} />
          {/* 바로 위 가로쓰레기통 줄에 이어지니 "배치추천(데이터팀)"만. 전체 이름은 범례·툴팁(BIN_RECO_LABEL) */}
          <span className="min-w-0 flex-1 [word-break:keep-all]">배치추천(데이터팀)</span>
          {data?.binRecos && <span className="font-mono text-[12px] text-[var(--cp-text-faint)]">{data.binRecos.items.length}</span>}
        </button>
      </div>
    </div>
  )
}

// ─── 범례. 지도 우하단 작은 카드. 첫 5초에 지도가 무슨 그림인지 여기서 읽힌다: 바탕 뜻·원 뜻·빈 칸 뜻 ───
interface LegendProps {
  data: DumpingMapData | null
  view: MapView
  selectedDong?: string | null // 격자 대체 표를 선택 동으로 좁힌다
}

export function MapLegend({ data, view, selectedDong = null }: LegendProps) {
  const [showHelp, setShowHelp] = useState(false)
  const [showTable, setShowTable] = useState(false)
  const theme = useTheme()
  // 바탕 없음이면 데이터 램프 대신 건물 층수 색 띠(테마별). 표는 다가구·단독 기준으로 남긴다
  const none = view.base === "none"
  const def = BASE_DEF[view.base === "none" ? "unm" : view.base]
  const grey = view.candidates && !selectedDong && !none // 후보 표시 중: 바탕 램프가 회색 단계(dumping-map greyMode)

  return (
    <div className="text-[12.5px] leading-snug text-[var(--cp-text)]">
      <div className="flex flex-col gap-1.5 px-3 py-2.5">
        <div className="flex items-center gap-2">
          <span className="dump-kicker text-[10.5px] text-[var(--cp-text-faint)]">{none ? "바탕 없음 · 건물 층수" : `${def.legend} · 100m`}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="flex overflow-hidden rounded-[3px]">
            {(none ? [...REAL_BUILDING[theme]] : grey ? greyRamp(theme, def.pal.length) : def.pal).map((c: string) => (
              <i key={c} className="h-2.5 w-5" style={{ background: c }} />
            ))}
          </span>
          <span className="font-mono text-[11px] leading-none text-[var(--cp-text-dim)]">
            {none ? "1~2 · 3~4 · 5~9 · 10~19 · 20+ 층" : `${def.stops[1]}+ … ${def.stops[def.stops.length - 1]}+ ${def.unit}`}
          </span>
        </div>
        <p className="text-[var(--cp-text-muted)]">
          {BASE_MEANING[view.base]}
          {view.tilt && !none && !grey && " 입체에서는 건물도 제 칸 색으로 칠함"}
          {grey && " 후보를 표시하는 동안은 회색 단계(진할수록 기록 많음). 핀 = 재배치 후보(기록이 많은데 이동식 CCTV가 없는 칸): 상위 3 벽돌색·바닥 고리, 나머지 앰버. 보라 = 현 이동식 CCTV"}
        </p>
        {(showHelp || view.weather || view.grid3d) && (
          <>
        {view.weather ? (
          <p className="flex items-center gap-1.5">
            <i
              className="h-3 w-3 shrink-0 rounded-full border"
              style={{ borderColor: WEATHER_DEF[view.weather].color, background: `${WEATHER_DEF[view.weather].color}30` }}
            />
            <span>
              원은 {WEATHER_DEF[view.weather].label}에 접수된 민원을 하루당으로 환산한 값, 클수록 많음. 접수일 기준이라 투기 시각은 아님
              {data?.env.weatherDays && ` · 그 조건 ${data.env.weatherDays[view.weather]}일`}
            </span>
          </p>
        ) : (
          view.circles.map((c) => (
            <p key={c} className="flex items-center gap-1.5">
              <i
                className="h-3 w-3 shrink-0 rounded-full border"
                style={{ borderColor: CIRCLE_DEF[c].color, background: `${CIRCLE_DEF[c].color}30` }}
              />
              <span>
                {view.tilt && !view.grid3d
                  ? `${c === "comp" ? "청회" : "앰버"} 원기둥은 ${CIRCLE_DEF[c].label} 건수, 높고 굵을수록 많음(칸 가운데)`
                  : `${c === "comp" ? "청회" : "앰버"} 원은 ${CIRCLE_DEF[c].label} 건수, 클수록·진할수록 많음(원은 제 칸 안)`}
              </span>
            </p>
          ))
        )}
        {view.grid3d && (
          <p className="text-[var(--cp-text-muted)]">
            기둥은 칸의 {(view.circles.length ? view.circles : ["enf" as CircleId]).map((c) => CIRCLE_DEF[c].label).join("·")} 건수, 높을수록 많음. 색은 원과 같음(민원 청회·과태료 앰버). 5건 이상 칸만, 확대하면 값도 보임
          </p>
        )}
        <p className="flex items-center gap-1.5 text-[var(--cp-text-muted)]">
          <i className="h-3 w-3 shrink-0 rounded-sm border" style={{ borderColor: ZERO_CELL, background: `${ZERO_CELL}20` }} />
          <span>옅은 칸은 {def.legend} 0. 흰 바탕은 민원·과태료·다가구 모두 0인 곳</span>
        </p>
          </>
        )}
        <div className="mt-0.5 flex items-center gap-3 text-[12px] text-[var(--cp-text-dim)]">
          <button onClick={() => setShowHelp((v) => !v)} aria-expanded={showHelp} className="font-medium text-(--dump-accent) hover:underline">
            {showHelp ? "설명 접기" : "자세한 설명"}
          </button>
          {data && (
            <button onClick={() => setShowTable((v) => !v)} aria-expanded={showTable} className="font-medium text-(--dump-accent) hover:underline">
              {showTable ? "표 닫기" : "상위 20칸 표"}
            </button>
          )}
        </div>
        {showHelp && (
          <p className="border-t border-[var(--cp-border-faint)] pt-1.5 text-[12.5px] leading-relaxed text-[var(--cp-text-muted)]">
            {baseDesc(view.base, data)}
            {view.circles.length > 0 &&
              ` 그 위에 겹친 ${view.circles.map((c) => `${CIRCLE_DEF[c].label} 원`).join("과 ")}은 바탕(조건 쪽)과 결과를 한 칸에서 비교하려고 올린 것입니다.`}
          </p>
        )}
      </div>
      {/* 격자 대체 표. 캔버스 격자는 키보드·스크린리더가 읽지 못한다. 현재 바탕 상위 20칸 */}
      {showTable && data && (
        <div className="max-h-[32dvh] overflow-y-auto border-t border-[var(--cp-border)] px-1 pb-1 text-[12.5px]">
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
  )
}

// ─── 재배치 후보 주소 목록. 레이어 패널 아래에 이어 붙는다 ───
export function CandidateList({ data, onFocusCandidate, onClose }: { data: DumpingMapData; onFocusCandidate: (f: CandidateFocus) => void; onClose: () => void }) {
  return (
    <div className="flex min-h-0 flex-col">
      <div className="flex shrink-0 items-start gap-2 border-b border-[var(--cp-border)] py-2 pl-3 pr-2">
        <p className="min-w-0 flex-1 text-[13.5px] font-semibold text-[var(--cp-text-strong)]">
          이동식 CCTV 재배치 후보 {data.cctvCandidates.length}곳
          <span className="block text-[12px] font-normal text-[var(--cp-text-dim)]">발생이력 순 · 자원배분 논리 (통계 효과 근거 아님)</span>
        </p>
        {/* 18라운드 후속: 들어왔다가 나갈 길이 없었다(유저 실측). 목록 닫기 = 후보 레이어 끄기 */}
        <button onClick={onClose} aria-label="후보 목록 닫기" className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[13px] text-[var(--cp-text-dim)] hover:bg-[var(--cp-hover)] hover:text-[var(--cp-text-strong)]">
          ✕
        </button>
      </div>
      <div className="min-h-0 overflow-y-auto">
        {data.cctvCandidates.map((c, i) => (
          <button
            key={i}
            onClick={() => onFocusCandidate({ seq: Date.now(), latlng: [c[0], c[1]], label: `재배치 후보 ${i + 1}위 · ${c[5] || c[4]}` })}
            className={`flex w-full items-start gap-2 border-b border-[var(--cp-border-faint)] px-3 py-2 text-left last:border-b-0 hover:bg-[var(--cp-hover)] ${
              i < 3 ? "bg-[#a8322a]/8" : ""
            }`}
          >
            {/* 상위 3 = 벽돌색(지도의 핀·고리·숫자와 같은 색, ops 핫스팟 1~3 문법), 나머지 = 앰버 테두리 */}
            <span
              className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full font-mono text-[11.5px] font-bold ${
                i < 3 ? "bg-[#a8322a] text-white ring-2 ring-white" : "border-[1.5px] border-(--dump-accent) bg-white text-(--dump-accent)"
              }`}
            >
              {i + 1}
            </span>
            <span className="min-w-0">
              <span className="block truncate text-[13.5px] font-medium text-[var(--cp-text-strong)]">{c[5] || `${c[4]} (주소 없음)`}</span>
              <span className="block text-[12.5px] text-[var(--cp-text-dim)]">
                {c[4]} · 민원 {c[2]} · 과태료 {c[3]} · 전 기간
              </span>
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}
