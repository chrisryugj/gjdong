"use client"

import type { LayerId } from "@/lib/snow/types"
import { OWNER_STYLE, RESOURCES, RISK } from "@/lib/snow/labels"
import type { WeatherMode } from "@/lib/snow/weather"
import { Ico } from "@/components/dumping/icons"

// 오른쪽 열: 레이어 토글(취약 층 · 자원 층) · 입체 보기 · 범례(스와치). 동별 기둥 지표 선택은 자원 현황 탭 한 곳에만 둔다(중복 제거)
// 4라운드: 행 안에서 줄이 꺾이지 않게(라벨 truncate·수치 nowrap). 범례는 한 줄에 기호 하나, 이름(진한 글자) + 뜻(흐린 글자). 236px 열에서 "·"만 홀로 떨어지던 줄바꿈을 없앴다

export interface MapView {
  layers: LayerId[]
  tilt: boolean
}
export const DEFAULT_VIEW: MapView = { layers: ["heat", "salt", "cacl", "sand", "weak", "ice", "school"], tilt: true }
export const ALL_LAYERS: LayerId[] = ["weak", "ice", "slope", "school", "heat", "salt", "cacl", "sand"]

const RISK_ROWS: { id: LayerId; label: string; note: string; swatch: "line" | "dash" | "arrow" | "ring" }[] = [
  { id: "weak", label: RISK.weak.label, note: "행안부 47곳", swatch: "line" },
  { id: "ice", label: RISK.ice.label, note: "행안부 9곳", swatch: "dash" },
  { id: "slope", label: RISK.slope.label, note: "추정", swatch: "arrow" },
  { id: "school", label: RISK.school.label, note: "21교", swatch: "ring" },
]
// 행별 색: 취약구간·결빙구간 진홍, 급경사 추정 보라(추정치), 학교 잉크. 값은 lib/snow/labels RISK가 정본
const rowColor = (id: LayerId, dark: boolean) => {
  if (id === "slope") return dark ? RISK.slope.color : RISK.slope.colorLight
  if (id === "school") return dark ? "#ece7dc" : "#14201c"
  return dark ? RISK.weak.color : RISK.weak.colorLight
}

// 보기 그룹(4라운드, dumping 레이어 패널과 같은 메뉴): 입체 보기 · 자동 회전 · 드론 비행(점검 후보 5곳) · 시연(xl). 자동 회전·드론은 입체에서만
const ROW = "flex w-full items-center gap-2 rounded-lg px-1.5 py-[3px] text-left text-[13.5px] transition-colors hover:bg-[var(--cp-hover)]"
const WEATHER_LABEL = { live: "실황", snow: "눈", rain: "비", fog: "안개" } as const
export interface ViewControls {
  orbit: boolean
  fly: boolean
  demo: boolean
  demoAvailable: boolean // xl 이상에서만 시연 캡션이 보인다
  onOrbit: (v: boolean) => void
  onFly: (v: boolean) => void
  onDemo: (v: boolean) => void
  weatherMode: WeatherMode // 지도 날씨: 실황 또는 미리보기
  weatherLive: string // 실황 문구(기온·날씨)
  onWeather: () => void // 누를 때마다 실황 › 눈 › 비 › 안개 순환
}
export function LayerPanel({ view, onChange, dark, counts, controls }: { view: MapView; onChange: (v: MapView) => void; dark: boolean; counts?: Partial<Record<LayerId, string>>; controls?: ViewControls }) {
  const toggle = (id: LayerId) => onChange({ ...view, layers: view.layers.includes(id) ? view.layers.filter((x) => x !== id) : [...view.layers, id] })
  return (
    <div className="p-1.5">
      <div className="dump-kicker px-1.5 pb-1 text-[10px] text-[var(--cp-text-dim)]">취약 정보</div>
      <ul className="space-y-px">
        {RISK_ROWS.map((r) => {
          const on = view.layers.includes(r.id)
          return (
            <li key={r.id}>
              <button onClick={() => toggle(r.id)} aria-pressed={on} className={`flex w-full items-center gap-2 rounded-lg px-1.5 py-[3px] text-left text-[13.5px] hover:bg-[var(--cp-hover)] ${on ? "font-semibold text-[var(--cp-text-strong)]" : "text-[var(--cp-text-faint)] line-through decoration-[var(--cp-border-strong)]"}`}>
                <Swatch kind={r.swatch} color={rowColor(r.id, dark)} on={on} />
                <span className="min-w-0 flex-1 truncate">{r.label}</span>
                <span className="shrink-0 whitespace-nowrap text-[12px] text-[var(--cp-text-faint)]">{counts?.[r.id] ?? r.note}</span>
              </button>
            </li>
          )
        })}
      </ul>
      <div className="dump-kicker mt-1.5 px-1.5 pb-0.5 text-[10px] text-[var(--cp-text-dim)]">자원 정보</div>
      <ul className="space-y-px">
        {RESOURCES.map((r) => {
          const on = view.layers.includes(r.id)
          const color = dark ? r.color : r.colorLight
          return (
            <li key={r.id}>
              <button onClick={() => toggle(r.id)} aria-pressed={on} className={`flex w-full items-center gap-2 rounded-lg px-1.5 py-[3px] text-left text-[13.5px] hover:bg-[var(--cp-hover)] ${on ? "font-semibold text-[var(--cp-text-strong)]" : "text-[var(--cp-text-faint)] line-through decoration-[var(--cp-border-strong)]"}`}>
                <Swatch kind={r.id === "heat" ? "glow" : r.id === "sand" ? "ring" : "fill"} color={color} on={on} />
                <span className="min-w-0 flex-1 truncate">{r.id === "sand" ? "모래주머니(2022)" : r.label}</span>
                <span className="shrink-0 whitespace-nowrap text-[12px] text-[var(--cp-text-faint)]">{counts?.[r.id] ?? ""}</span>
              </button>
            </li>
          )
        })}
      </ul>
      <div className="dump-kicker mt-1.5 px-1.5 pb-0.5 text-[10px] text-[var(--cp-text-dim)]">보기</div>
      {/* 2열 격자: 900px 높이에서 패널+범례가 열을 넘치던 것(줌 버튼을 덮음) → 보기 4줄을 2줄로 */}
      <div className="grid grid-cols-2 gap-x-1 gap-y-px">
        <button
          onClick={() => {
            controls?.onOrbit(false)
            controls?.onFly(false)
            onChange({ ...view, tilt: !view.tilt })
          }}
          aria-pressed={view.tilt}
          title="지도를 기울여 건물·핀·벽을 입체로 봅니다. 끄면 위에서 본 평면"
          className={`${ROW} ${view.tilt ? "font-semibold text-[var(--cp-text-strong)]" : "text-[var(--cp-text-muted)]"}`}
        >
          <Ico name="tilt" size={14} />
          <span className="min-w-0 flex-1 truncate">{view.tilt ? "입체" : "평면"}</span>
        </button>
        {controls && (
          <button
            onClick={() => {
              controls.onFly(false)
              if (!view.tilt) onChange({ ...view, tilt: true })
              controls.onOrbit(!controls.orbit)
            }}
            aria-pressed={controls.orbit}
            title="구 전체를 천천히 돌려 봅니다(입체). 지도를 만지면 멈춥니다"
            className={`${ROW} ${controls.orbit ? "font-semibold text-[var(--cp-text-strong)]" : "text-[var(--cp-text-muted)]"}`}
          >
            <Ico name="orbit" size={14} />
            <span className="min-w-0 flex-1 truncate">자동 회전</span>
          </button>
        )}
        {controls && (
          <button
            onClick={() => {
              controls.onOrbit(false)
              if (!view.tilt) onChange({ ...view, tilt: true })
              controls.onFly(!controls.fly)
            }}
            aria-pressed={controls.fly}
            title="구 전체를 내려다보다 눈 오기 전 점검 후보 5건의 대표 지점을 낮게 차례로 돌아봅니다(입체). 지도를 만지면 멈춥니다"
            className={`${ROW} ${controls.fly ? "font-semibold text-[var(--cp-text-strong)]" : "text-[var(--cp-text-muted)]"}`}
          >
            <Ico name="drone" size={14} />
            <span className="min-w-0 flex-1 truncate">드론 비행</span>
          </button>
        )}
        {controls && (
          <button
            onClick={controls.onWeather}
            aria-pressed={controls.weatherMode !== "live"}
            title={`지도 날씨. 실황은 기상청 단기예보(${controls.weatherLive}). 누르면 눈·비·안개 미리보기로 바뀝니다`}
            className={`${ROW} ${controls.weatherMode !== "live" ? "font-semibold text-[var(--cp-text-strong)]" : "text-[var(--cp-text-muted)]"}`}
          >
            <Ico name={controls.weatherMode === "snow" ? "drop" : controls.weatherMode === "rain" ? "drop" : controls.weatherMode === "fog" ? "layers" : "sun"} size={14} />
            <span className="min-w-0 flex-1 truncate">{controls.weatherMode === "live" ? "날씨 실황" : `날씨: ${WEATHER_LABEL[controls.weatherMode]}`}</span>
          </button>
        )}
        {controls?.demoAvailable && (
          <button
            onClick={() => controls.onDemo(!controls.demo)}
            aria-pressed={controls.demo}
            title="시연 모드: 6장면. 방향키로 이동, Esc로 나가기"
            className={`${ROW} ${controls.demo ? "font-semibold text-[var(--cp-text-strong)]" : "text-[var(--cp-text-muted)]"}`}
          >
            <Ico name="monitor" size={14} />
            <span className="min-w-0 flex-1 truncate">{controls.demo ? "시연 끝" : "시연 6장면"}</span>
          </button>
        )}
      </div>
    </div>
  )
}

type SwatchKind = "line" | "dash" | "arrow" | "ring" | "fill" | "glow" | "flag"
function Swatch({ kind, color, on, color2 }: { kind: SwatchKind; color: string; on: boolean; color2?: string }) {
  const o = on ? 1 : 0.35
  if (kind === "fill") return <i className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: color, opacity: o }} />
  if (kind === "ring") return <i className="h-2.5 w-2.5 shrink-0 rounded-full border-2 bg-transparent" style={{ borderColor: color, opacity: o }} />
  if (kind === "glow") return <i className="h-1 w-4 shrink-0 rounded-full" style={{ background: color, boxShadow: `0 0 6px ${color}`, opacity: o }} />
  if (kind === "flag")
    return (
      <svg width={16} height={12} aria-hidden style={{ opacity: o }} className="shrink-0">
        <line x1={4} y1={1} x2={4} y2={11.5} stroke={color} strokeWidth={1.4} />
        <path d="M4.7 1.5h8.5v5H4.7z" fill={color2 ?? color} />
      </svg>
    )
  if (kind === "arrow")
    return (
      <svg width={16} height={10} aria-hidden style={{ opacity: o }} className="shrink-0">
        <line x1={1} y1={5} x2={15} y2={5} stroke={color} strokeWidth={3.2} strokeLinecap="round" />
        <path d="M6.5 2.4 9.2 5 6.5 7.6M10.5 2.4 13.2 5l-2.7 2.6" fill="none" stroke={color2 ?? "#fff"} strokeWidth={1.3} />
      </svg>
    )
  return (
    <svg width={16} height={10} aria-hidden style={{ opacity: o }} className="shrink-0">
      <line x1={1} y1={5} x2={15} y2={5} stroke={color} strokeWidth={3} strokeLinecap="round" strokeDasharray={kind === "dash" ? "5 2" : undefined} />
    </svg>
  )
}

export function Legend({ dark, tilt = true, stageLabel, stageNote, ownerView = false, budgetOn = false }: { dark: boolean; tilt?: boolean; stageLabel: string; stageNote: string | null; ownerView?: boolean; budgetOn?: boolean }) {
  const risk = dark ? RISK.weak.color : RISK.weak.colorLight
  const slope = dark ? RISK.slope.color : RISK.slope.colorLight
  const arrow = dark ? "#0b1216" : "#fbf9f3"
  const heat = dark ? RESOURCES[0].color : RESOURCES[0].colorLight
  const ink = dark ? "#ece7dc" : "#14201c"
  const gu = dark ? OWNER_STYLE.gu.dark : OWNER_STYLE.gu.light
  const si = dark ? OWNER_STYLE.si.dark : OWNER_STYLE.si.light
  const siName = dark ? "흰색" : "검정"
  // 입체(기본)와 평면은 기호가 다르다(입체 = 벽·상자·원통·포대·깃발·입체 숫자, 평면 = 선·원·번호 배지). 냉독: 범례에 없는 기호가 지도의 주역이었다
  // inline=뜻이 짧아 이름 옆에, 아니면 둘째 줄에(한 줄에 이름·뜻을 억지로 넣으면 "= 있음"만 홀로 떨어졌다)
  const rows: { k: string; swatch: React.ReactNode; name: string; means: string; inline?: boolean }[] = [
    { k: "heat", swatch: <Swatch kind="glow" color={heat} on />, name: "도로열선", means: tilt ? "흐르는 선이 발열. 축소하면 노란 육각" : "흐르는 선이 발열. 축소하면 점" },
    ownerView
      ? { k: "weak", swatch: <Swatch kind="line" color={gu} on />, name: "적설취약구간", means: `하늘색이 ${OWNER_STYLE.gu.label}(47곳 전부)` }
      : { k: "weak", swatch: <Swatch kind="line" color={risk} on />, name: "적설취약구간", means: tilt ? "진홍 벽과 숫자는 열선 없음(번호는 표와 같음), 회색 선은 열선 있음" : "진홍 선과 번호 배지(확대 시)는 열선 없음, 회색은 열선 있음" },
    ownerView
      ? { k: "ice", swatch: <Swatch kind="dash" color={si} on />, name: "상습결빙구간", means: `${siName}이 ${OWNER_STYLE.si.label}, 하늘색이 구 관리. 빈 ${tilt ? "고리" : "원"}은 선형 미확인` }
      : { k: "ice", swatch: <Swatch kind="dash" color={risk} on />, name: "상습결빙구간", means: `진홍 점선${tilt ? "과 낮은 벽" : ""}은 열선 없음, 회색은 열선 있음. 빈 ${tilt ? "고리" : "원"}은 선형 미확인` },
    { k: "slope", swatch: <Swatch kind="arrow" color={slope} color2={arrow} on />, name: RISK.slope.label, means: tilt ? "확대하면 경사면 높이가 높이차, 화살이 오르막. 흐리면 열선 있음" : "화살이 오르막. 흐리면 열선 있음" },
    { k: "salt", swatch: <Swatch kind="fill" color={dark ? RESOURCES[1].color : RESOURCES[1].colorLight} on />, name: "제설함", means: tilt ? "상자 · 도로과" : "도로과", inline: true },
    { k: "cacl", swatch: <Swatch kind="fill" color={dark ? RESOURCES[2].color : RESOURCES[2].colorLight} on />, name: "염화칼슘보관함", means: tilt ? "원통 · 동주민센터" : "동주민센터", inline: true },
    { k: "sand", swatch: <Swatch kind="ring" color={dark ? RESOURCES[3].color : RESOURCES[3].colorLight} on />, name: "모래주머니", means: tilt ? "포대 · 2022년 기준" : "2022년 기준", inline: true },
    tilt
      ? { k: "school", swatch: <Swatch kind="flag" color={ink} color2={heat} on />, name: "초등학교", means: "깃대 핀. 노란 깃발은 열선 있음, 무채색 깃발과 진홍 받침은 열선 없음" }
      : { k: "school", swatch: <Swatch kind="ring" color={ink} on />, name: "초등학교", means: "원 테두리가 노랑이면 열선 있음, 진홍이면 없음" },
  ]
  return (
    <div className="px-3 py-2 text-[12.5px] leading-snug text-[var(--cp-text-dim)]">
      <div className="dump-kicker mb-1 text-[10px]">범례{ownerView ? " · 관리청" : ""}{tilt ? "" : " · 평면"}</div>
      {/* 단계 상태는 맨 위(맨 아래 두면 900px에서 잘려 3단계 흰 경계선 설명이 사라졌다. 냉독 4차) */}
      {stageNote && (
        <p className="mb-1.5 text-[12.5px] font-semibold text-[var(--cp-text)]">
          {stageLabel}: {stageNote}
        </p>
      )}
      <ul className="space-y-[2px]">
        {rows.map((r) => (
          <li key={r.k} className="grid grid-cols-[16px_minmax(0,1fr)] items-start gap-x-2 break-keep">
            <span className="flex h-[17px] items-center">{r.swatch}</span>
            <span>
              <span className="font-semibold text-[var(--cp-text)]">{r.name}</span>
              {r.inline ? <span> {r.means}</span> : <span className="block text-[12px] leading-[1.35]">{r.means}</span>}
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-1 text-[12px] leading-[1.35]">{ownerView ? "고리는 지금 보는 곳" : "하늘색 고리는 지금 보는 곳"}{tilt ? ", 기둥은 동별 자원" : ""}{budgetOn ? ". 호박색 벽은 예산 역산으로 신설이 정해진 구간" : ""}</p>
    </div>
  )
}
