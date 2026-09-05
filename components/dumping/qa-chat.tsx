"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import type { DumpingMapData, OntoGraph, VizAction } from "@/lib/dumping/types"
import { channelGrowth, fmtRatio, partialYearSuffix, regressionBetas, summarize } from "@/lib/dumping/facts"
import { vizDescription } from "./map-controls"
import ModalShell from "./modal-shell"
import QaChart, { chartTitle, type ChartKind } from "./qa-chart"

// 첫 화면(홈) — 지도 앱처럼 검색이 기본. 상단 검색바에 뭐든 물어보면
// /api/dumping/ask 평문 스트리밍으로 답이 검색바 바로 아래 내려온다(최신순).
// 그 아래 "핵심 질의응답" 아코디언: 상위 3개는 펼쳐진 채 시작, 나머지는 눌러서 확장.
// 답이 미리 준비된 항목은 API 호출 없이 즉시 열리고, 지도 반영은 명시적 버튼으로만 한다.
// 준비된 답의 숫자는 map.json·graph.json에서 읽는다 — 데이터가 갱신되면 문장도 따라온다.
// 청소차 제원처럼 export에 없는 수치만 README 정본을 그대로 적었다. 배율은 facts.channelGrowth가 연환산해 준다.

interface Seed {
  q: string
  hint: string // 접힌 상태에서 보이는 한 줄 결론 — 훑어보기용
  answer: string // 미리 작성된 답(검증 수치 기반) — API 호출 없음
  viz?: VizAction
  vizNote?: string
  chart?: ChartKind
}

const n = (v: number) => v.toLocaleString()
const signed = (v: number) => `${v > 0 ? "+" : "−"}${Math.abs(v).toFixed(3)}`
const pText = (p: number) => (p < 0.001 ? "p<0.001" : `p=${p.toFixed(3)}`)

// 순서 = 관리자 독서 순서: 현황 판단 → 원인 → 액션. 앞 3개가 기본 펼침.
function buildSeeds(data: DumpingMapData, graph: OntoGraph): Seed[] {
  const { period } = summarize(data)
  const years = Object.keys(data.yearly.complaints)
    .filter((y) => Number(y) >= 2024)
    .sort()
  const yr = (y: string) => `${y}년${partialYearSuffix(period, y)}`
  const comp = years.map((y) => `${yr(y)} ${n(data.yearly.complaints[y] ?? 0)}건`).join(", ")
  const enf = years.map((y) => `${yr(y)} ${n(data.yearly.enforcement[y] ?? 0)}건`).join(", ")
  const [y0, y1] = years // 2024, 2025 — 완결된 두 해의 과태료 비교
  const enf0 = data.yearly.enforcement[y0] ?? 0
  const enf1 = data.yearly.enforcement[y1] ?? 0
  const lastMonths = period.months - 12 * (years.length - 1) // 마지막 해의 집계 개월 수
  const g = channelGrowth(data)

  const betas = regressionBetas(graph)
  const beta = (id: string) => betas.find((b) => b.id === id)
  const unm = beta("cov-unmanaged")
  const apt = beta("cov-apt")
  const alley = beta("cov-alley")
  const arterial = beta("cov-arterial")
  const unmText = unm ? signed(unm.beta) : "+0.312"

  const cctvEdge = graph.edges.find((e) => e.f === "lev-cctv-mobile" && e.rel === "lowers")
  const didSym = Number(cctvEdge?.props?.did_symmetric ?? 0.221)
  const didP = String(cctvEdge?.props?.p ?? ">0.5")
  const recEdge = graph.edges.find((e) => e.f === "lev-recycling" && e.rel === "lowers")
  const recDid = Number(recEdge?.props?.did ?? 0.642)
  const recP = Number(recEdge?.props?.p ?? 0.056)
  const candidates = data.cctvCandidates.length

  const topFrn = [...data.dong].sort((a, b) => b.frn - a.frn)[0]
  const S = data.env.seasons
  const summerWinter = (S["여름"].compPerDay / S["겨울"].compPerDay).toFixed(1)
  const hot = data.env.temp["더움(25도+)"]
  const rain = data.env.rain
  const r2 = data.decision.regressionV2
  const sx = data.decision.seoul
  const k = data.decision.kpi
  const seoulSeeds: Seed[] = r2 && sx
    ? [
        {
          q: "의류수거함 옆이 무단투기 온상 아닌가?",
          hint: "단속 자료로는 아닙니다. 신고만 조금 더 들어옵니다",
          answer: `단속 적발 자료로는 그렇지 않습니다. 광진구 의류수거함 ${n(data.infra.clothBins.length)}곳(공공데이터포털)을 100m 격자에 얹어 회귀에 넣어 보니 과태료 적발과 연관이 없었습니다(β ${signed(r2.v2_100.coef.clothbin_n.beta)}, ${pText(r2.v2_100.coef.clothbin_n.p)}).

신고 민원 기준으로는 약한 양의 연관이 있습니다(β ${signed(r2.v2_100_complaints.coef.clothbin_n.beta)}, ${pText(r2.v2_100_complaints.coef.clothbin_n.p)}). 수거함 주변이 눈에 잘 띄어 신고가 늘었을 수도 있고 실제 배출이 더 많은데 단속이 못 잡는 것일 수도 있습니다. 지금 자료로는 가를 수 없어서, 수거함 밀집 격자 시범 정비를 사전등록 설계로 해 보는 것을 검토 항목으로 남겼습니다.`,
          viz: { mode: "comp", layers: ["clothBins"] },
          vizNote: "지도에 의류수거함(청록 점)을 민원 분포 위에 표시했습니다.",
        },
        {
          q: "100m 격자로 나누는 게 말이 되나?",
          hint: `200m로 합쳐도 판정 유지 ${Object.values(r2.gridSensitivity.v2).filter(Boolean).length}/${Object.keys(r2.gridSensitivity.v2).length}`,
          answer: `됩니다. 자료마다 칸에 넣는 방식이 다르고, 칸 크기를 바꿔도 결론이 같았습니다.

- 민원·과태료는 건별 주소를 좌표로 바꿔 그 점이 속한 칸에, 건축물대장은 대지 지번 좌표로, 도로·건물은 OSM 선·면을 칸 경계로 잘라 넣습니다
- 등록인구는 동 단위뿐이라 격자 회귀에 넣지 않았고, 대신 서울시 250m 격자 생활인구를 면적 비례로 나눠 노출 변수로 썼습니다
- 칸을 200m로 네 배 키워 다시 적합하면 관리주체 없는 주거 β ${signed(r2.v2_200.coef.unmanaged_units.beta)}, 골목 비율 β ${signed(r2.v2_200.coef.alley_ratio.beta)}로 방향과 유의성이 그대로입니다(R² ${r2.v2_100.r2}→${r2.v2_200.r2})

격자는 통계청 좌표계(EPSG:5179)에 맞춰 SGIS 인구격자·서울시 250m 격자와 좌표로 바로 이어집니다.`,
          viz: { mode: "overlay" },
          vizNote: "지도의 칸 하나가 100m입니다. 칸 위에 마우스를 올리면 그 칸의 민원·과태료·무관리주거·생활인구가 보입니다.",
        },
        {
          q: "다른 구도 앱 때문에 민원이 늘었나?",
          hint: "서울 전체 앱 청소 신고가 해마다 증가",
          answer: `그렇습니다. 서울시 스마트불편신고 청소 분야 접수는 ${Object.entries(sx.smartReport.cleaningByYear).filter(([y]) => y >= "2022" && y < period.lastYear).map(([y, v]) => `${y}년 ${v.toLocaleString()}건`).join(", ")}으로 서울 전체에서 늘고 있습니다(서울 열린데이터광장).

광진의 민원 증가가 앱 보급 효과라는 해석은 서울시 차원에서도 성립합니다. 25개 구가 같은 착시에 노출돼 있으니, 앱을 뺀 채널고정 지표로 성과를 재는 원칙은 서울시 전체에 제안할 수 있습니다. 상습격자 수도 앱을 빼면 ${k.criticalCellsNow}곳에서 ${k.criticalCellsNowNoApp}곳으로 줄어듭니다.`,
        },
      ]
    : []

  return [
    {
      q: "작년보다 나빠졌나?",
      hint: "숫자는 늘었지만 대부분 앱 신고 확산 효과",
      answer: `민원 숫자만 보면 늘었지만, 실제로 나빠졌다고 보기는 어렵습니다.

- 민원 접수: ${comp}
- 단속 실측인 과태료 부과는 ${y0}년 ${n(enf0)}건에서 ${y1}년 ${n(enf1)}건으로 ${enf1 < enf0 ? "오히려 줄었습니다" : "늘었습니다"}

민원 증가분의 대부분은 스마트폰 앱 보급으로 신고가 쉬워진 효과입니다(${g.basis}하면 앱 신고만 ${fmtRatio(g.app)}, 전화·직접 신고는 ${fmtRatio(g.fixed)}). 연도별 민원 건수로 성과를 평가하면 안 되는 이유입니다.`,
      chart: "yearly",
      viz: { mode: "comp" },
      vizNote: "지도를 민원 분포로 전환했습니다. 민원 수치는 신고 편향이 섞여 있음에 주의하세요.",
    },
    {
      q: "무단투기의 최강 예측변수는?",
      hint: `관리주체 없는 주거 밀도 (β ${unmText})`,
      answer: `관리주체 없는 주거단위 밀도입니다. 다가구·단독주택처럼 배출을 관리할 주체가 없는 주거가 몰린 곳일수록 발생이 많습니다(표준화 β ${unmText}, 이 요인이 많은 곳일수록 발생도 많다는 뜻. ${unm ? pText(unm.p) : "p<0.001"}로 우연이 아님).

반대로 아파트 등 공동주택 세대수는 연관이 확인되지 않았습니다(β ${apt ? signed(apt.beta) : "−0.011"}, ${apt ? pText(apt.p) : "p=0.708"}). 같은 인구라도 관리사무소·공동 배출장이 있으면 발생이 늘지 않습니다. 무단투기는 시민의식보다 배출 관리 구조의 문제라는 뜻입니다.`,
      chart: "beta",
      viz: { mode: "unm" },
      vizNote: `지도를 무관리주거 밀도(β ${unmText})로 전환했습니다.`,
    },
    {
      q: "CCTV는 어디에 놓아야 하나?",
      hint: "증설 근거는 철회 · 재배치는 합리적",
      answer: `CCTV를 늘려서 무단투기를 줄일 수 있다는 근거는 없습니다. 초기 분석의 감소 효과는 비교 방법 오류(평균회귀)로 확인되어 철회됐고, 공정하게 다시 잰 결과 효과가 확인되지 않았습니다(대칭 DID ${signed(didSym)}, p${didP}).

다만 발생이 전혀 없는 곳에 서 있는 카메라를 발생 이력이 많은 곳으로 옮기는 재배치는 예산 0원의 자원 배분 차원에서 합리적입니다. 지도에 표시된 재배치 후보 ${candidates}곳(빨간 번호)이 발생 이력 순 후보이며, 오른쪽 목록에서 주소를 확인할 수 있습니다.`,
      chart: "did",
      viz: { mode: "enf", layers: ["cctvMobile"], candidates: true },
      vizNote: `지도에 이동식 CCTV 현 위치(보라 점)와 재배치 후보 ${candidates}곳(빨간 번호)을 표시했습니다. 지도 오른쪽 목록에서 후보지 주소를 볼 수 있습니다.`,
    },
    {
      q: "빠뜨린 대책은 없나?",
      hint: "사람을 겨냥하는 대책이 비어 있었습니다",
      answer: `있습니다. 사람을 겨냥하는 대책이 통째로 비어 있었습니다.

발생과 연관된 요인(청년 밀집, 외국인 비율, 1인세대)을 겨냥하는 개입수단이 지식그래프에 하나도 없다는 것이 기계적으로 드러났고, 이 공백에서 신규 대책 3건이 나왔습니다.

- 다국어 배출안내(${topFrn.d}은 외국인 비율 ${topFrn.frn}%)
- 전입·임대차 시점 배출안내(1인세대 진입 경로)
- 수거 시간대 조정(무예산)

주의: 네 요인은 같은 동네에 함께 몰려 있어 어느 하나를 원인으로 지목할 수는 없습니다.`,
      chart: "beta",
      viz: { mode: "unm" },
      vizNote: "지도를 무관리주거 밀도로 전환했습니다. 사람 겨냥 대책의 공백이 드러난 요인 축입니다.",
    },
    {
      q: "으슥한 골목에 많이 버리지 않나?",
      hint: "반대입니다. 생활동선 위에서 발생합니다",
      answer: `아닙니다. 데이터는 반대를 가리킵니다.

골목이 많은 격자일수록(β ${alley ? signed(alley.beta) : "−0.222"}), 큰길에서 멀수록(β ${arterial ? signed(arterial.beta) : "−0.139"}) 발생이 오히려 적었습니다. "사람 눈을 피해 으슥한 곳에 버린다"는 은폐 가설은 이 자료에서 뒷받침되지 않았습니다.

무단투기는 숨어서 하는 행위가 아니라 생활동선 위, 배출 관리가 없는 곳에서 일어납니다. 단속이나 CCTV를 으슥한 곳 위주로 배치하는 논리는 데이터와 어긋납니다.`,
      chart: "beta",
      viz: { mode: "overlay" },
      vizNote: "지도를 원인+결과 겹쳐보기로 전환했습니다. 발생이 생활동선 위에 있는지 직접 확인해보세요.",
    },
    {
      q: "재활용정거장은 효과가 있었나?",
      hint: "지금 데이터로는 판정 불가",
      answer: `효과를 측정할 수 없었습니다. 재활용정거장은 2024년이 마지막 신규 설치라 제대로 비교할 대상(아직 설치 안 된 곳)이 없고, 철거 기록도 ${n(data.infra.recycling.length)}곳 중 3곳뿐이라 전후 비교가 불가능합니다.

초기 계산에서 ${signed(recDid)}건(p=${recP.toFixed(3)})이라는 수치가 나왔지만 평균회귀 편향이 남아 있어 판정 불가로 처리했습니다. 효과가 없다는 뜻이 아니라, 지금 데이터로는 알 수 없다는 뜻입니다.`,
      viz: { mode: "comp", layers: ["recycling"] },
      vizNote: "지도에 재활용정거장(초록)을 민원 분포 위에 표시했습니다.",
    },
    {
      q: "청소차는 어디를 청소하나?",
      hint: "집중관리 10.6km · 일반 28.7km",
      answer: `청소차는 총 17대(물청소 5, 노면 7, 분진흡입 5)이고, 도로 등급별로 나눠 순회합니다.

- 집중관리도로 10.6km: 천호대로·아차산로. 겨울철 하루 4회 이상, 평상시 하루 1회
- 일반관리도로 28.7km: 능동로·자양로·동일로 등 14개 도로. 평상시 이틀에 1회 이상
- 폭염특보 시 물청소 추가, 월 1회 클린데이(${data.dong.length}개 동 동시)

지도의 주황 굵은 선이 집중관리, 회색 선이 일반관리 노선입니다. 골목 단위의 세부 수거 경로(GPS)는 미확보라 격자 분석에는 반영되지 않았습니다.`,
      viz: { routes: true },
      vizNote:
        "지도에 청소차 관리노선을 표시했습니다. 주황 굵은 선=집중관리도로(천호대로·아차산로), 회색 선=일반관리도로 14개. 도로명 기준 표시입니다.",
    },
    {
      q: "계절이나 날씨에 따라 달라지나?",
      hint: `여름이 겨울의 ${summerWinter}배`,
      answer: `달라집니다. 여름과 더운 날에 뚜렷하게 많습니다.

- 계절별 일평균 민원: 여름 ${S["여름"].compPerDay}건, 봄 ${S["봄"].compPerDay}건, 가을 ${S["가을"].compPerDay}건, 겨울 ${S["겨울"].compPerDay}건. 여름이 겨울의 ${summerWinter}배입니다
- 더운 날(25도 이상)은 ${hot.compPerDay}건으로 가장 많고, 비 오는 날엔 단속 적발이 ${rain["무강수"].enfPerDay}건에서 ${rain["비(1mm+)"].enfPerDay}건으로 줄어듭니다(폭우 땐 ${rain["폭우(10mm+)"].enfPerDay}건)

주의: 민원은 발견·신고 시점, 과태료는 단속 적발 시점 기준이라 투기 행위 시각 그 자체는 아닙니다. 날씨가 원인이라기보다 야외 활동·신고·단속 여건이 함께 움직이는 연관으로 보는 것이 맞습니다.`,
      chart: "seasons",
    },
    {
      q: "작년과 올해 연도별 추이는?",
      hint: enf1 < enf0 ? "민원은 늘고 단속은 줄었습니다" : "민원과 단속이 함께 늘었습니다",
      answer: `민원 접수는 늘고 있고, 단속(과태료)은 ${enf1 < enf0 ? "줄어드는" : "늘어나는"} 흐름입니다.

- 민원: ${comp}
- 과태료: ${enf}

${period.lastYear}년은 ${lastMonths}개월 집계인데도 민원이 작년 연간치를 ${(data.yearly.complaints[period.lastYear] ?? 0) > (data.yearly.complaints[y1] ?? 0) ? "이미 넘었지만" : "따라잡고 있지만"}, 이 증가분의 대부분은 앱 신고 확산(연환산 앱만 ${fmtRatio(g.app)}) 때문입니다. 단속 적발 실측인 과태료는 ${enf1 < enf0 ? "줄고 있어" : "함께 늘고 있어"}, 상황이 악화됐다고 단정할 수 없습니다. 월별 흐름은 차트를 참고하세요.`,
      chart: "monthly",
    },
    ...seoulSeeds,
  ]
}

const DEFAULT_OPEN = 3 // 앞 N개는 펼쳐진 채 시작

// 답변은 두괄식(첫 문장 = 결론)이라 첫 문장만 굵게 강조한다
function renderAnswer(text: string) {
  if (!text) return null
  const m = text.match(/^[^.\n]{5,120}[.]\s*/)
  if (!m) return text
  return (
    <>
      <b className="text-[var(--cp-text-strong)]">{m[0]}</b>
      {text.slice(m[0].length)}
    </>
  )
}

interface Exchange {
  q: string
  a: string
  pending?: boolean
}

interface QaChatProps {
  onAuthExpired: () => void
  onViz: (viz: VizAction) => void
  data: DumpingMapData | null
  graph: OntoGraph | null
}

export default function QaChat({ onAuthExpired, onViz, data, graph }: QaChatProps) {
  const [exchanges, setExchanges] = useState<Exchange[]>([]) // 직접 입력 질문만 (시간순 보관, 표시는 최신순)
  const [input, setInput] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // 사용자가 만지기 전에는 앞 N개만 펼침 — 데이터가 늦게 와도 초기 상태가 어긋나지 않는다
  const [openSeeds, setOpenSeeds] = useState<Set<string> | null>(null)
  const [appliedSeed, setAppliedSeed] = useState<string | null>(null) // 지도에 반영 중인 항목
  const [bigChart, setBigChart] = useState<ChartKind | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const abortRef = useRef<AbortController | null>(null)

  const seeds = useMemo(() => (data && graph ? buildSeeds(data, graph) : []), [data, graph])

  // 탭을 떠나면 진행 중인 스트림을 끊는다 — 사라진 컴포넌트에 setState가 계속 날아오지 않게
  useEffect(() => () => abortRef.current?.abort(), [])

  const isOpen = (q: string, i: number) => (openSeeds ? openSeeds.has(q) : i < DEFAULT_OPEN)
  const toggleSeed = (q: string, i: number) => {
    setOpenSeeds((prev) => {
      const next = new Set(prev ?? seeds.slice(0, DEFAULT_OPEN).map((s) => s.q))
      if (isOpen(q, i)) next.delete(q)
      else next.add(q)
      return next
    })
  }

  const applySeedViz = (seed: Seed) => {
    if (!seed.viz) return
    onViz(seed.viz)
    setAppliedSeed(seed.q)
  }

  const askFree = async (question: string) => {
    const q = question.trim()
    if (!q || busy) return

    // 같은 질문을 다시 물으면 API 호출 없이 기존 답을 맨 위로 끌어올린다
    const cachedIdx = exchanges.findIndex((e) => e.q === q && !e.pending)
    if (cachedIdx >= 0) {
      setExchanges((xs) => {
        const next = xs.filter((_, i) => i !== cachedIdx)
        next.push(xs[cachedIdx])
        return next
      })
      setInput("")
      scrollRef.current?.scrollTo({ top: 0, behavior: "smooth" })
      return
    }

    setError(null)
    setInput("")
    setBusy(true)
    const history = exchanges
      .flatMap((e) => [
        { role: "user" as const, text: e.q },
        { role: "model" as const, text: e.a },
      ])
      .slice(-8)
    setExchanges((xs) => [...xs, { q, a: "", pending: true }])
    scrollRef.current?.scrollTo({ top: 0 })
    const controller = new AbortController()
    abortRef.current = controller
    try {
      const res = await fetch("/api/dumping/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q, history }),
        signal: controller.signal,
      })
      if (res.status === 401) {
        onAuthExpired()
        return
      }
      if (!res.ok || !res.body) {
        const err = await res.json().catch(() => null)
        throw new Error(err?.error ?? "답변 생성에 실패했습니다")
      }
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        const chunk = decoder.decode(value, { stream: true })
        setExchanges((xs) => {
          const next = [...xs]
          const last = next[next.length - 1]
          next[next.length - 1] = { ...last, a: last.a + chunk }
          return next
        })
      }
      setExchanges((xs) => {
        const next = [...xs]
        const last = next[next.length - 1]
        next[next.length - 1] = { ...last, a: last.a || "(빈 응답)", pending: false }
        return next
      })
    } catch (e) {
      if (!(e instanceof DOMException && e.name === "AbortError")) {
        setError(e instanceof Error ? e.message : "오류가 발생했습니다")
        setExchanges((xs) => (xs[xs.length - 1]?.pending ? xs.slice(0, -1) : xs))
      } else {
        // 중단: 받은 데까지 확정
        setExchanges((xs) => {
          const next = [...xs]
          const last = next[next.length - 1]
          if (last?.pending) next[next.length - 1] = { ...last, a: last.a || "(중단됨)", pending: false }
          return next
        })
      }
    } finally {
      setBusy(false)
      abortRef.current = null
    }
  }

  const results = [...exchanges].reverse() // 검색 결과처럼 최신 답이 맨 위

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* 검색바 — 지도 앱처럼 이곳이 시작점 */}
      <form
        onSubmit={(e) => {
          e.preventDefault()
          void askFree(input)
        }}
        className="shrink-0 border-b border-[var(--cp-border)] p-2.5"
      >
        <div className="flex items-center gap-1.5 rounded-full border border-[var(--cp-border)] bg-[var(--cp-panel)] py-1 pl-4 pr-1 shadow-sm transition-colors focus-within:border-[#0c6155]">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="무단투기에 대해 무엇이든 물어보세요"
            aria-label="질문"
            maxLength={500}
            className="min-w-0 flex-1 bg-transparent py-1.5 text-[15.5px] text-[var(--cp-text)] placeholder:text-[var(--cp-text-faint)] focus:outline-none"
          />
          {busy ? (
            <button
              type="button"
              onClick={() => abortRef.current?.abort()}
              className="shrink-0 rounded-full border border-[var(--cp-border)] px-3 py-1.5 text-[13.5px] text-[var(--cp-text-muted)] hover:bg-[var(--cp-hover)]"
            >
              중단
            </button>
          ) : (
            <button
              type="submit"
              disabled={!input.trim()}
              aria-label="질문하기"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#0c6155] text-white disabled:opacity-35"
            >
              <svg viewBox="0 0 20 20" className="h-[17px] w-[17px]" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="8.5" cy="8.5" r="5.5" />
                <path d="m13 13 4 4" strokeLinecap="round" />
              </svg>
            </button>
          )}
        </div>
        <p className="mt-1.5 px-2 text-[12.5px] leading-snug text-[var(--cp-text-faint)]">
          AI가 이 분석의 지식그래프와 수치만 근거로 답합니다. 아래 핵심 질문은 검증된 수치로 미리 준비된 답입니다.
        </p>
      </form>

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto p-3">
        {error && (
          <p
            role="alert"
            className="mb-2 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-[14px] text-red-600"
          >
            {error}
          </p>
        )}

        {/* 직접 질문 결과 — 검색바 바로 아래, 최신순 */}
        {results.length > 0 && (
          <section className="mb-4 flex flex-col gap-2" aria-live="polite">
            <h3 className="text-sm font-semibold tracking-wide text-[var(--cp-text-dim)]">내가 물어본 것</h3>
            {results.map((ex) => (
              <div key={ex.q} className="rounded-xl border border-[var(--cp-border)] bg-[var(--cp-panel)] p-3">
                <p className="mb-1.5 flex items-start gap-1.5 text-[15px] font-semibold leading-snug text-[var(--cp-text-strong)]">
                  <span className="mt-0.5 shrink-0 rounded bg-[#0c6155]/10 px-1.5 py-0.5 text-[11px] font-bold text-[#0c6155]">
                    Q
                  </span>
                  {ex.q}
                </p>
                <div className="whitespace-pre-wrap text-[15px] leading-relaxed text-[var(--cp-text)]">
                  {renderAnswer(ex.a) || (ex.pending ? "생각 중…" : "")}
                </div>
              </div>
            ))}
          </section>
        )}

        {/* 핵심 질의응답 아코디언 — 상위 3개 펼침, 나머지 접힘 */}
        <section>
          <h3 className="mb-2 text-sm font-semibold tracking-wide text-[var(--cp-text-dim)]">
            핵심 질의응답 {seeds.length > 0 ? seeds.length : ""} · 누르면 펼쳐집니다
          </h3>
          {seeds.length === 0 && <p className="text-[14px] text-[var(--cp-text-dim)]">데이터를 불러오는 중…</p>}
          <div className="flex flex-col gap-1.5">
            {seeds.map((s, i) => {
              const open = isOpen(s.q, i)
              const onMap = appliedSeed === s.q
              const vizDesc = s.viz ? vizDescription(s.viz) : ""
              return (
                <div
                  key={s.q}
                  className={`overflow-hidden rounded-xl border bg-[var(--cp-panel)] transition-colors ${
                    open ? "border-[var(--cp-border-active)]" : "border-[var(--cp-border)]"
                  }`}
                >
                  <button
                    onClick={() => toggleSeed(s.q, i)}
                    aria-expanded={open}
                    className="flex w-full items-center gap-2 px-3 py-2.5 text-left hover:bg-[var(--cp-hover)]"
                  >
                    <span
                      className={`shrink-0 text-[11px] text-[var(--cp-text-dim)] transition-transform ${open ? "rotate-90" : ""}`}
                      aria-hidden
                    >
                      ▶
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[15px] font-semibold leading-snug text-[var(--cp-text-strong)]">
                        {s.q}
                      </span>
                      {!open && <span className="block truncate text-[13px] text-[var(--cp-text-dim)]">{s.hint}</span>}
                    </span>
                    {onMap && (
                      <span className="shrink-0 rounded bg-[#0c6155] px-1.5 py-0.5 text-[11px] font-semibold text-white">
                        지도 반영 중
                      </span>
                    )}
                  </button>
                  {open && (
                    <div className="flex flex-col gap-2 border-t border-[var(--cp-border-faint)] px-3 pb-3 pt-2.5">
                      <div className="whitespace-pre-wrap text-[14.5px] leading-relaxed text-[var(--cp-text)]">
                        {renderAnswer(s.answer)}
                      </div>
                      {s.chart && data && (
                        <button
                          onClick={() => setBigChart(s.chart!)}
                          title="누르면 크게 볼 수 있습니다"
                          className="rounded-xl border border-[var(--cp-border)] bg-white p-2.5 text-left transition-shadow hover:shadow-md"
                        >
                          <span className="mb-1 flex items-baseline justify-between">
                            <b className="text-[13px] text-[var(--cp-text-strong)]">{chartTitle(s.chart, data)}</b>
                            <span className="text-[12px] text-[#0c6155]">크게 보기 +</span>
                          </span>
                          <QaChart kind={s.chart} data={data} graph={graph} />
                        </button>
                      )}
                      {s.viz && (
                        <>
                          {/* 누르기 전에 지도가 어떻게 바뀌는지 보여 준다 — 버튼 하나에 결론과 예고를 같이 */}
                          <button
                            onClick={() => applySeedViz(s)}
                            disabled={onMap}
                            title={vizDesc}
                            className={`flex flex-col items-center rounded-lg px-3 py-2 transition-colors ${
                              onMap ? "bg-[#0c6155]/10 text-[#0c6155]" : "bg-[#0c6155] text-white hover:bg-[#0a5449]"
                            }`}
                          >
                            <span className="text-[14px] font-semibold">{onMap ? "✓ 지도에 반영됨" : "지도에서 확인"}</span>
                            {!onMap && vizDesc && (
                              <span className="text-[12px] font-normal leading-snug opacity-85">{vizDesc}</span>
                            )}
                          </button>
                          {onMap && s.vizNote && (
                            <p className="rounded-lg border border-dashed border-[#0c6155]/40 bg-[#0c6155]/5 px-2.5 py-1.5 text-[13px] leading-snug text-[#0c6155]">
                              {s.vizNote}
                            </p>
                          )}
                        </>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
          <p className="mt-2 text-[12.5px] leading-relaxed text-[var(--cp-text-faint)]">
            준비된 답의 수치는 독립 검토를 거친 확정치입니다. 더 깊은 근거는 발견·데이터 탭에서 볼 수 있습니다.
          </p>
        </section>
      </div>

      {bigChart && data && (
        <ModalShell size="xl" zIndex={2100} title={chartTitle(bigChart, data)} onClose={() => setBigChart(null)}>
          <QaChart kind={bigChart} data={data} graph={graph} />
        </ModalShell>
      )}
    </div>
  )
}
