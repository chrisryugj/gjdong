"use client"

import type { DumpingMapData, OntoGraph } from "@/lib/dumping/types"
import { channelGrowth, collinearRange, finesCensorNote, fmtRatio, graphSize, regressionBetas, sampleSizes, summarize } from "@/lib/dumping/facts"

// 데이터·방법 모달 "통계 방법" 탭. 통계를 모르는 독자가 카드 하나를 위에서 아래로 읽으면 되게 슬롯을 고정한다.
//   어떤 질문에 답하나 → 도식 → 쉽게 말하면 → 이번 분석의 결과(수치 칸) → 믿어도 되나(검증 목록) → 조심할 것(한계 목록)
// 14라운드: 전에는 "주의"가 문장 여덟 개짜리 줄글이라 어디를 읽으라는지 몰랐다. 수치는 map.json·graph.json에서 뽑고,
// 거기 없는 것(초기 DID 철회 경위 등)만 README 정본 문장을 쓴다.

export interface StatMethod {
  id: string
  name: string
  question: string // 이 방법이 답하는 질문 한 줄
  easy: string // 쉽게 말하면. 비유 중심 한두 문장
  figure?: FigureId
  results: { k: string; v: string; note?: string }[] // 이번 분석에서 나온 수치
  checks: string[] // 믿어도 되나. 같은 결론이 유지된 검증
  cautions: string[] // 조심할 것. 결론을 좁히는 조건
  explainer?: string // 통계 해설서 절 앵커
}

type FigureId = "grid" | "regression" | "did" | "channel" | "backtest" | "forecast" | "graph"

const signed = (v: number) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toFixed(3)}`
const n = (v: number) => v.toLocaleString()
const pct = (v: number | null | undefined) => (v == null ? "미산출" : `${v}%`)

export function statMethods(data: DumpingMapData, graph: OntoGraph | null): StatMethod[] {
  const s = summarize(data)
  const betas = graph ? regressionBetas(graph) : []
  const beta = (id: string) => betas.find((b) => b.id === id)
  const unm = beta("cov-unmanaged")
  const apt = beta("cov-apt")
  const alley = beta("cov-alley")
  const bt = data.decision.hotspots.backtest
  const fc = data.decision.forecast.backtest
  const g = graph ? graphSize(graph) : null
  const cg = channelGrowth(data)
  const sz = graph ? sampleSizes(data, graph) : { gridN: data.grid.length, ledgerRows: NaN, dongN: data.dong.length }
  const col = graph ? collinearRange(graph) : "0.85~0.97"
  const r2 = data.decision.regressionV2
  const geo = data.meta?.geocode
  const gridHeld = r2 ? `${Object.values(r2.gridSensitivity.v2).filter(Boolean).length}/${Object.keys(r2.gridSensitivity.v2).length}` : "미산출"
  const lp = r2 ? signed(r2.v2_100.coef.living_pop.beta) : "미산출"
  const rp = r2?.exposure ? signed(r2.exposure.compare.both.resident_pop.beta) : "미산출"
  return [
    {
      id: "grid",
      name: "100m 격자 결합",
      question: "서로 다른 자료를 어떻게 한 지도에서 비교하나?",
      easy: `구 전체를 100m 바둑판으로 나누고 민원·과태료·건축물대장·도로·인구를 전부 같은 칸에 넣습니다. 그래야 "이 칸은 적발도 많고 다가구도 많다"가 성립합니다.`,
      figure: "grid",
      results: [
        { k: "회귀 표본", v: `${n(sz.gridN)}칸` },
        { k: "민원 칸 배정", v: geo?.complaints ? `${n(geo.complaints.geocoded)} / ${n(geo.complaints.rows)}건` : `${n(s.complaints)}건` },
        { k: "과태료 칸 배정", v: geo?.enforcement ? `${n(geo.enforcement.geocoded)} / ${n(geo.enforcement.rows)}건` : `${n(data.decision.fines.totalN)}건` },
        { k: "건축물대장", v: Number.isFinite(sz.ledgerRows) ? `${n(sz.ledgerRows)}동` : "미산출" },
      ],
      checks: [
        `칸을 200m로 합쳐 다시 계산해도 판정 유지 ${gridHeld} 변수(발견 탭 격자 검증 카드)`,
        "격자는 통계청 표준(EPSG:5179)이라 SGIS 인구 격자·서울시 250m 격자와 좌표가 맞물립니다",
      ],
      cautions: [
        "주소를 못 찾은 기록(구 중심 폴백)은 칸에 넣지 않았습니다. 건수 집계에는 포함, 지도·순위·회귀에서만 제외",
        "자료마다 넣는 방식이 다릅니다. 민원·과태료는 주소 좌표, 건축물대장은 지번 좌표, 도로·건물은 칸 경계로 자름, 생활인구는 250m 값을 면적 비례로 나눔",
      ],
      explainer: "#14-격자-크기-민감도-maup",
    },
    {
      id: "regression",
      name: "다중회귀 (표준화 β)",
      question: "여러 조건이 섞여 있을 때, 적발 기록과 가장 강하게 같이 움직이는 조건은?",
      easy: "가게가 많아서인지, 다가구가 많아서인지, 골목이 많아서인지를 한꺼번에 넣고 각각의 몫을 따로 계산합니다. β는 그 몫의 크기이고, 0보다 크면 그 조건이 클수록 적발 기록도 많다는 뜻입니다.",
      figure: "regression",
      results: [
        { k: "다가구·단독 밀집 β", v: unm ? signed(unm.beta) : "+0.312", note: "가장 큼 · p<0.001" },
        { k: "공동주택 세대수 β", v: apt ? signed(apt.beta) : "−0.011", note: `연관 확인 안 됨 · p=${apt ? apt.p.toFixed(3) : "0.708"}` },
        { k: "골목 비율 β", v: alley ? signed(alley.beta) : "−0.222", note: "오히려 음수" },
        { k: "설명력 R²", v: r2?.base100?.r2 != null ? String(r2.base100.r2) : "미산출", note: "기준 모형" },
      ],
      checks: [
        "표준오차를 세 방식(이분산 보정·행정동 군집·wild bootstrap)으로 바꿔도 판정 유지",
        "음이항 모형으로 다시 적합해도 유지",
        `생활인구(β ${lp})·상주인구(β ${rp}) 노출을 더해도 다가구·단독 β 유지`,
        "K-apt 등록 세대로 나누면 연관은 다가구·일반단독에만 있고 관리사무소 없는 다세대·연립은 확인 안 됨",
        "차량 담배꽁초를 뺀 생활쓰레기만으로 다시 적합해도 유지(발견 탭 품목 분리)",
      ],
      cautions: [
        "조건부 연관이지 인과 증명이 아닙니다. 왜 그 골목인지는 이 자료에 없습니다",
        "다가구·단독 밀집은 건축물대장 대리변수(다가구 가구 + 일반단독 동)입니다",
        "강건성 검정의 β(+0.315 등)는 2026-09-13 폴백 정정 전 표본 값이며 정정 후 재적합은 아직입니다(방향·유의성 동일)",
      ],
      explainer: "#1-표준화-β-베타",
    },
    {
      id: "did",
      name: "이중차분(DID)과 이벤트 스터디",
      question: "이동식 CCTV를 설치하면 정말 줄었나?",
      easy: "설치한 곳의 전후 변화에서, 설치하지 않은 비슷한 곳의 전후 변화를 뺍니다. 함정이 하나 있습니다. 원래 많던 곳은 아무것도 안 해도 저절로 줄어드는 경향(평균회귀)이 있어, 비교 대상을 잘못 고르면 없는 효과가 보입니다.",
      figure: "did",
      results: [
        { k: "초기 분석", v: "감소 효과 있음", note: "철회" },
        { k: "비교 대상에 같은 조건 적용", v: "비교 대상도 똑같이 줄었음", note: "감소분은 평균회귀" },
        { k: "이벤트 스터디", v: "유의한 시점 없음", note: "관측 22,247행" },
      ],
      checks: ["처치·대조에 같은 선택 규칙을 쓰는 대칭 설계로 다시 계산해도 효과 미확인(발견 탭 효과 철회 카드)"],
      cautions: ["이 철회가 조치 대장(개입 사전등록) 원칙의 근거입니다. 효과 평가는 실행 전에 설계부터 등록합니다"],
      explainer: "#9-이중차분did과-평균회귀-그리고-철회",
    },
    {
      id: "channel",
      name: "신고 채널 분해",
      question: `민원이 ${fmtRatio(cg.total)} 늘었는데, 투기가 는 건가 신고가 는 건가?`,
      easy: "민원을 신고 창구(앱·120·직접)로 나눠 봅니다. 앱만 늘고 다른 창구는 그대로면, 늘어난 것은 창구일 가능성이 큽니다.",
      figure: "channel",
      results: [
        { k: "민원 전체", v: fmtRatio(cg.total) },
        { k: "앱 신고", v: fmtRatio(cg.app) },
        { k: "120·직접 신고", v: fmtRatio(cg.fixed), note: "채널고정" },
        { k: "과태료 · 순찰 적발", v: `${fmtRatio(cg.fines)} · ${fmtRatio(cg.finesPatrol)}`, note: "오히려 감소" },
      ],
      checks: ["서울 전체 앱 청소 신고도 늘고 있어 광진만의 현상이 아닙니다(서울시 층)"],
      cautions: [
        `배율은 ${cg.basis}한 값`,
        "채널별 관측 증가분을 나눈 것이지 앱이 원인이라고 식별한 것은 아니고, 발생 증가를 배제하지도 못합니다",
        `과태료의 ${100 - cg.patrolSharePct}%는 신고를 받고 단속한 것이라 신고와 독립인 실측이 아닙니다`,
        finesCensorNote(data),
      ],
      explainer: "#6-신고-편향과-채널-분해",
    },
    {
      id: "backtest",
      name: "핫스팟 점수와 백테스트",
      question: "다음 분기에 관리할 20곳을 어떻게 고르고, 믿을 만한가?",
      easy: `최근 기록일수록 크게(90일마다 절반) 더해 칸마다 점수를 매기고 상위 20곳을 고릅니다. 믿을 만한지는 과거로 돌아가 "그때 이 방법으로 골랐다면 맞았을까"를 ${bt.windows.length}개 분기에서 채점합니다.`,
      figure: "backtest",
      results: [
        { k: "적중률", v: pct(bt.avgPrecision20), note: "20곳 중 다음 분기 기록 있는 비율" },
        { k: "포착률", v: pct(bt.avgCapture20), note: "전체 기록 중 20곳 몫" },
        { k: "무작위 20곳", v: pct(bt.avgRandomCapture) },
        ...(bt.baselines ? [{ k: "실무 기준모형", v: Object.values(bt.baselines).map((b) => `${b.label} ${pct(b.avgCapture20)}`).join(" · ") }] : []),
      ],
      checks: bt.baselines ? ["실무 기준모형 3종과 같은 창·같은 20곳으로 비교했습니다"] : [],
      cautions: [
        ...(bt.baselines ? ["기준모형과 동급이며 우열 미확정. 점수식이 낫다는 주장은 하지 않고, 매 분기 같은 규칙으로 골라 사후 채점한다는 점만 말합니다"] : []),
        "행정수요 예측이지 발생의 인과를 예측하는 것은 아닙니다",
      ],
      explainer: "#12-핫스팟-백테스트-적중률포착률",
    },
    {
      id: "forecast",
      name: "홀트윈터스 수요 전망",
      question: "다음 달 민원 접수는 몇 건쯤 올까?",
      easy: "월별 접수의 수준·추세·계절 반복(여름에 많고 겨울에 적은 흐름)을 학습해 다음 달을 내다보는 시계열 모형입니다.",
      figure: "forecast",
      results: [
        { k: "평균 오차", v: pct(fc.mapePct), note: `롤링 원점 1스텝 · ${fc.window}` },
        { k: "기준모형(전년 동월)", v: pct(fc.naiveMapePct) },
        { k: "80% 구간 적중", v: pct(fc.coverage80Pct), note: "독립 검증 전" },
      ],
      checks: ["매달 그 이전 자료로만 모수를 고르고 다음 달을 맞히는 방식이라 미래 정보를 쓰지 않습니다"],
      cautions: [
        "신고 접수량 전망이지 발생량 예측이 아닙니다(앱 보급 추세 포함). 인력·순찰 배치 참고용",
        `평가 표본이 ${fc.rows?.length ?? "미산출"}개월뿐이라 오차 추정의 불확실성이 큽니다. 2~6개월 앞 구간은 근사치`,
      ],
      explainer: "#11-롤링-원점-백테스트와-기준모형",
    },
    {
      id: "graph",
      name: "근거 그래프 (온톨로지)",
      question: "이 결론은 어느 자료에서 왔고, 대책이 빠진 요인은 없나?",
      easy: `데이터·증거·주장·지표·대책을 점으로 놓고 관계(뒷받침한다, 겨냥한다)를 선으로 연결한 지식 지도입니다. "겨냥하는 수단이 없는 요인은?"처럼 연결을 거쳐야 답이 나오는 질문을 코드에 정해 두고 화면에서 바로 계산합니다.`,
      figure: "graph",
      results: [
        { k: "지식 · 연결", v: g ? `${g.nodes}개 · ${g.edges}개` : "미산출" },
        { k: "찾아낸 공백", v: "청년·외국인·1인세대 요인에 연결된 수단 없음", note: "→ 검토 대책 3건" },
      ],
      checks: ["주장이 철회되거나 범위가 좁혀지면 이력을 기록하고 정오표 배지로 표시합니다"],
      cautions: ["사람이 정리한 관계 목록이라 빠진 연결은 공백으로 표시될 뿐, 실제 행정에 그 대책이 없다는 뜻은 아닙니다"],
      explainer: "#17-온톨로지-역량-질문",
    },
    {
      id: "checks",
      name: "전제 조건 검사와 한계 공개",
      question: "통계의 전제가 실제로 성립하나? 어긋난 것은?",
      easy: "결론을 내기 전에 통계의 전제 조건이 성립하는지 따로 검사하고, 어긋난 것은 숨기지 않고 적었습니다.",
      results: [],
      checks: [
        "잔차가 정규분포가 아니라 음이항·wild bootstrap 보정 모형도 같이 적합했고 판정 유지",
        "오차 크기가 칸마다 달라(이분산) 이분산 보정 표준오차(HC3)로 다시 봤고 판정 유지",
        "이웃 칸끼리 닮아(공간 자기상관) 공간 시차·공간 오차 모형으로도 봤고 다가구·단독 β 유지",
      ],
      cautions: [
        `청년·외국인·1인세대·다가구·단독 밀집이 상관 ${col}로 겹쳐 있어 무엇이 진짜 요인인지 구분되지 않습니다. 어느 하나를 원인으로 지목하는 해석은 피해야 합니다`,
      ],
      explainer: "#13-공간-자기상관과산포이분산",
    },
  ]
}

// ─── 도식. 숫자 없이 원리만. 폭 100%, 높이 96 고정 ───
const INK = "var(--cp-text-muted)"
const ACC = "var(--dump-accent)"
const WARN = "#a8322a"
// 글자에 바탕색 테두리(halo). 선·막대와 겹쳐도 읽힌다
const T = { fontSize: 11, fill: INK, paintOrder: "stroke", stroke: "var(--cp-bg)", strokeWidth: 3, strokeLinejoin: "round" } as const

function FigGrid() {
  return (
    <svg viewBox="0 0 360 96" className="h-24 w-full">
      {["민원", "과태료", "건축물대장", "도로·인구"].map((t, i) => (
        <g key={t} transform={`translate(${8 + i * 62},${12})`}>
          <rect width="54" height="18" rx="3" fill="none" stroke={INK} />
          <text x="27" y="13" textAnchor="middle" {...T}>{t}</text>
          <path d={`M27 18 L${140 - i * 62 + 27} 46`} stroke={INK} strokeWidth="0.8" fill="none" />
        </g>
      ))}
      <g transform="translate(140,48)">
        {[0, 1, 2, 3].flatMap((r) => [0, 1, 2, 3].map((c) => <rect key={`${r}${c}`} x={c * 12} y={r * 11} width="11" height="10" fill={r === 1 && c === 2 ? ACC : "none"} stroke={INK} strokeWidth="0.6" />))}
      </g>
      <text x="200" y="62" {...T}>같은 100m 칸에</text>
      <text x="200" y="76" {...T}>모두 넣는다</text>
      <text x="200" y="92" {...T} fill={ACC}>→ "이 칸은 적발도 다가구도 많다"</text>
    </svg>
  )
}

function FigRegression({ rows }: { rows: { label: string; beta: number }[] }) {
  const max = Math.max(0.05, ...rows.map((r) => Math.abs(r.beta)))
  return (
    <svg viewBox="0 0 360 96" className="h-24 w-full">
      <text x="4" y="12" {...T}>한꺼번에 넣고 각 조건의 몫(β)을 따로 계산한다</text>
      {/* 라벨은 왼쪽 칸(x≤112)에 고정, 0축은 x=200. 음수 막대는 왼쪽으로 뻗되 라벨 칸을 넘지 않는 배율(2026-09-18: 막대가 라벨을 덮던 것 수정) */}
      <line x1="200" y1="20" x2="200" y2="94" stroke={INK} strokeWidth="0.6" />
      {rows.slice(0, 4).map((r, i) => {
        const w = (Math.abs(r.beta) / max) * 110
        const y = 24 + i * 18
        const neg = r.beta < 0
        return (
          <g key={r.label}>
            <text x="112" y={y + 10} textAnchor="end" {...T}>{r.label.length > 11 ? `${r.label.slice(0, 10)}…` : r.label}</text>
            <rect x={neg ? 200 - Math.min(w, 80) : 200} y={y} width={neg ? Math.min(w, 80) : w} height="12" fill={neg ? WARN : ACC} opacity={i === 0 ? 1 : 0.55} />
            <text x={neg ? 204 : 204 + w} y={y + 10} {...T}>{signed(r.beta)}</text>
          </g>
        )
      })}
    </svg>
  )
}

function FigDid() {
  return (
    <svg viewBox="0 0 360 96" className="h-24 w-full">
      <line x1="30" y1="80" x2="330" y2="80" stroke={INK} strokeWidth="0.6" />
      <line x1="180" y1="18" x2="180" y2="80" stroke={INK} strokeWidth="0.6" strokeDasharray="3 3" />
      <text x="180" y="12" textAnchor="middle" {...T}>설치 시점</text>
      <path d="M40 30 L180 40 L320 62" stroke={WARN} strokeWidth="2" fill="none" />
      <path d="M40 34 L180 44 L320 64" stroke={INK} strokeWidth="2" fill="none" strokeDasharray="5 4" />
      <text x="40" y="22" {...T} fill={WARN}>설치한 곳</text>
      <text x="60" y="62" {...T}>비교 대상(설치 안 함)</text>
      <text x="150" y="92" {...T} fill={WARN}>둘 다 똑같이 줄었으니 효과가 아니라 평균회귀</text>
    </svg>
  )
}

function FigChannel({ cg }: { cg: ReturnType<typeof channelGrowth> }) {
  const rows = [
    { label: "앱 신고", v: cg.app, c: ACC },
    { label: "120·직접", v: cg.fixed, c: ACC },
    { label: "과태료", v: cg.fines, c: WARN },
    { label: "순찰 적발", v: cg.finesPatrol, c: WARN },
  ]
  const x0 = 90
  const scale = 70 // 1배 = 70px
  return (
    <svg viewBox="0 0 360 96" className="h-24 w-full">
      <line x1={x0 + scale} y1="6" x2={x0 + scale} y2="92" stroke={INK} strokeWidth="0.8" strokeDasharray="3 3" />
      <text x={x0 + scale + 3} y="12" {...T}>1배(2024년과 같음)</text>
      {rows.map((r, i) => {
        const y = 18 + i * 19
        return (
          <g key={r.label}>
            <text x={x0 - 6} y={y + 10} textAnchor="end" {...T}>{r.label}</text>
            <rect x={x0} y={y} width={Math.max(2, r.v * scale)} height="12" fill={r.c} opacity={0.7} />
            <text x={x0 + r.v * scale + 4} y={y + 10} {...T}>{fmtRatio(r.v)}</text>
          </g>
        )
      })}
    </svg>
  )
}

function FigBacktest({ windows, avg }: { windows: { cutoff: string; precision20: number }[]; avg: number | null }) {
  const w = windows.slice(-8)
  const bw = Math.min(34, 300 / Math.max(1, w.length))
  return (
    <svg viewBox="0 0 360 96" className="h-24 w-full">
      <text x="4" y="12" {...T}>분기마다 과거 시점으로 돌아가 고른 20곳의 적중률</text>
      <line x1="30" y1="86" x2="340" y2="86" stroke={INK} strokeWidth="0.6" />
      {/* 평균선은 막대·숫자보다 먼저 그려 숫자의 흰 테두리가 선을 덮게 */}
      {avg != null && <line x1="30" y1={86 - (avg / 100) * 60} x2="340" y2={86 - (avg / 100) * 60} stroke={WARN} strokeWidth="1" strokeDasharray="4 3" />}
      {w.map((x, i) => {
        const h = (x.precision20 / 100) * 60
        return (
          <g key={x.cutoff}>
            <rect x={34 + i * bw} y={86 - h} width={bw - 6} height={h} fill={ACC} opacity={0.65} />
            <text x={34 + i * bw + (bw - 6) / 2} y={82 - h} textAnchor="middle" {...T}>{x.precision20}</text>
            <text x={34 + i * bw + (bw - 6) / 2} y="95" textAnchor="middle" fontSize="9" fill={INK}>{x.cutoff.slice(2, 7)}</text>
          </g>
        )
      })}
      {avg != null && <text x="342" y={90 - (avg / 100) * 60} {...T} fill={WARN}>평균</text>}
    </svg>
  )
}

function FigForecast() {
  // 수준 + 추세 + 계절 = 전망(80% 구간). 원리만 그린다
  const wave = (y0: number, amp: number, slope: number) => Array.from({ length: 25 }, (_, i) => `${20 + i * 9},${y0 - slope * i - amp * Math.sin((i / 24) * Math.PI * 4)}`).join(" ")
  return (
    <svg viewBox="0 0 360 96" className="h-24 w-full">
      <polyline points={wave(60, 14, 0.4)} fill="none" stroke={INK} strokeWidth="1.6" />
      <line x1="236" y1="10" x2="236" y2="88" stroke={INK} strokeWidth="0.6" strokeDasharray="3 3" />
      <path d="M236 42 L340 26 L340 62 L236 60 Z" fill={ACC} opacity="0.15" />
      <path d="M236 51 L340 44" stroke={ACC} strokeWidth="1.8" fill="none" />
      <text x="24" y="14" {...T}>지난 접수는 수준, 추세, 계절 반복의 합</text>
      <text x="240" y="20" {...T} fill={ACC}>전망 · 옅은 띠는 80% 구간</text>
      <text x="238" y="86" {...T}>기준일</text>
    </svg>
  )
}

function FigGraph() {
  const chain = [
    { t: "데이터", c: "#2563eb" },
    { t: "증거", c: "#9333ea" },
    { t: "주장", c: "#d97706" },
    { t: "지표", c: "#dc2626" },
    { t: "수단", c: "#16a34a" },
  ]
  const rel = ["뒷받침", "뒷받침", "운영화", "겨냥"]
  return (
    <svg viewBox="0 0 360 96" className="h-24 w-full">
      {chain.map((c, i) => (
        <g key={c.t} transform={`translate(${36 + i * 72},44)`}>
          {i < chain.length - 1 && <line x1="10" y1="0" x2="62" y2="0" stroke={INK} strokeWidth="0.8" />}
          {i < chain.length - 1 && <text x="36" y="-5" textAnchor="middle" fontSize="9.5" fill={INK}>{rel[i]}</text>}
          <circle r="9" fill={c.c} />
          <text y="26" textAnchor="middle" {...T}>{c.t}</text>
        </g>
      ))}
      <text x="36" y="88" {...T}>요인마다 겨냥하는 수단이 연결돼 있는지 확인해 빠진 요인을 찾는다</text>
    </svg>
  )
}

function Figure({ id, data, graph }: { id: FigureId; data: DumpingMapData; graph: OntoGraph | null }) {
  switch (id) {
    case "grid":
      return <FigGrid />
    case "regression": {
      const rows = (graph ? regressionBetas(graph) : []).map((b) => ({ label: b.label, beta: b.beta })).sort((a, b) => Math.abs(b.beta) - Math.abs(a.beta))
      return <FigRegression rows={rows} />
    }
    case "did":
      return <FigDid />
    case "channel":
      return <FigChannel cg={channelGrowth(data)} />
    case "backtest":
      return <FigBacktest windows={data.decision.hotspots.backtest.windows} avg={data.decision.hotspots.backtest.avgPrecision20} />
    case "forecast":
      return <FigForecast />
    case "graph":
      return <FigGraph />
  }
}

const EXPLAINER_URL = "https://github.com/chrisryugj/gjdong/blob/main/docs/dumping-stats-explainer.md"

export function StatMethodCard({ m, i, data, graph }: { m: StatMethod; i: number; data: DumpingMapData; graph: OntoGraph | null }) {
  return (
    <section className="rounded-xl border border-[var(--cp-border)] p-3">
      <h3 className="flex items-baseline gap-2 text-[16px] font-bold text-[var(--cp-text-strong)]">
        <span className="font-mono text-[14.5px] text-[var(--cp-text-faint)]">{String(i + 1).padStart(2, "0")}</span>
        {m.name}
        {m.explainer && (
          <a href={`${EXPLAINER_URL}${m.explainer}`} target="_blank" rel="noreferrer" className="ml-auto text-[13px] font-medium text-(--dump-accent) hover:underline">
            해설서
          </a>
        )}
      </h3>
      <p className="mt-1 text-[15px] font-medium text-(--dump-accent-ink)">{m.question}</p>
      {m.figure && (
        <div className="mt-2 rounded-lg border border-[var(--cp-border-faint)] bg-[var(--cp-bg)] px-3 py-2">
          {/* 도식은 폭에 맞춰 커진다(최대 560px). 96px 고정 높이에선 글자가 11px로 작았다 */}
          <div className="mx-auto w-full max-w-[560px] [&_svg]:h-auto [&_svg]:w-full">
            <Figure id={m.figure} data={data} graph={graph} />
          </div>
        </div>
      )}
      <p className="mt-2 text-[15px] leading-relaxed text-[var(--cp-text-muted)]">
        <b className="text-[var(--cp-text-strong)]">쉽게 말하면</b> · {m.easy}
      </p>
      {m.results.length > 0 && (
        <div className="mt-2 grid grid-cols-2 gap-1.5 sm:grid-cols-4">
          {m.results.map((r) => (
            <div key={r.k} className="rounded-lg border border-[var(--cp-border-faint)] bg-[var(--cp-bg)] px-2 py-1.5">
              <p className="text-[12.5px] text-[var(--cp-text-dim)]">{r.k}</p>
              <p className="font-mono text-[15px] font-semibold leading-snug text-[var(--cp-text-strong)]">{r.v}</p>
              {r.note && <p className="text-[12px] text-[var(--cp-text-faint)]">{r.note}</p>}
            </div>
          ))}
        </div>
      )}
      <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-2">
        {m.checks.length > 0 && (
          <div className="rounded-lg bg-(--dump-accent)/6 px-2.5 py-2">
            <p className="text-[13.5px] font-bold text-(--dump-accent-ink)">믿어도 되나 · 같은 결론이 유지된 검증</p>
            <ul className="mt-1 flex flex-col gap-1 text-[14px] leading-snug text-[var(--cp-text)]">
              {m.checks.map((c) => (
                <li key={c} className="flex gap-1.5">
                  <span className="shrink-0 font-bold text-(--dump-accent)">✓</span>
                  <span>{c}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        {m.cautions.length > 0 && (
          <div className="rounded-lg bg-[#a8322a]/6 px-2.5 py-2">
            <p className="text-[13.5px] font-bold text-[#7a2620]">조심할 것 · 결론을 좁히는 조건</p>
            <ul className="mt-1 flex flex-col gap-1 text-[14px] leading-snug text-[var(--cp-text)]">
              {m.cautions.map((c) => (
                <li key={c} className="flex gap-1.5">
                  <span className="shrink-0 font-bold text-[#a8322a]">△</span>
                  <span>{c}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </section>
  )
}
