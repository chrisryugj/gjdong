import type { DumpingMapData, OntoGraph, VizAction } from "@/lib/dumping/types"
import { channelGrowth, finesCensorNote, fmtRatio, partialYearSuffix, regressionBetas, summarize } from "@/lib/dumping/facts"
import type { ChartKind } from "./qa-chart"

// 물어보기 탭의 준비된 질의응답(시드). 문장은 여기, 숫자는 map.json·graph.json에서 읽는다(데이터가 갱신되면 문장도 따라온다).
// 청소차 제원처럼 export에 없는 수치만 README 정본을 그대로 적었다. 배율은 facts.channelGrowth가 연환산해 준다.
// 화면 문장은 존댓말, 도입부 없이 답부터(챗봇 말투 금지). 변수 이름은 "다가구·단독 밀집" 하나.

export interface Seed {
  q: string
  hint: string // 접힌 상태에서 보이는 한 줄 결론. 훑어보기용
  answer: string // 미리 작성된 답(검증 수치 기반). API 호출 없음
  viz?: VizAction
  vizNote?: string
  chart?: ChartKind
}

const n = (v: number) => v.toLocaleString()
const signed = (v: number) => `${v > 0 ? "+" : "−"}${Math.abs(v).toFixed(3)}`
const pText = (p: number) => (p < 0.001 ? "p<0.001" : `p=${p.toFixed(3)}`)

// 순서 = 관리자 독서 순서: 현황 판단 → 원인 → 액션. 첫 항목만 기본 펼침(qa-chat DEFAULT_OPEN).
export function buildSeeds(data: DumpingMapData, graph: OntoGraph): Seed[] {
  const { period } = summarize(data)
  const years = Object.keys(data.yearly.complaints)
    .filter((y) => Number(y) >= 2024)
    .sort()
  const yr = (y: string) => `${y}년${partialYearSuffix(period, y)}`
  const comp = years.map((y) => `${yr(y)} ${n(data.yearly.complaints[y] ?? 0)}건`).join(", ")
  const enf = years.map((y) => `${yr(y)} ${n(data.yearly.enforcement[y] ?? 0)}건`).join(", ")
  const [y0, y1] = years // 2024, 2025. 완결된 두 해의 과태료 비교
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

신고 민원 기준으로는 약한 양의 연관이 있습니다(β ${signed(r2.v2_100_complaints.coef.clothbin_n.beta)}, ${pText(r2.v2_100_complaints.coef.clothbin_n.p)}). 수거함 주변이 눈에 잘 띄어 신고가 늘었을 수도 있고 실제 배출이 더 많은데 단속이 못 잡는 것일 수도 있습니다. 지금 자료로는 가를 수 없어서 수거함 밀집 격자 시범 정비를 사전등록 설계로 해 보는 것을 검토 항목으로 남겼습니다.`,
          viz: { mode: "comp", layers: ["clothBins"] },
          vizNote: "지도에 의류수거함(청록 점)을 민원 분포 위에 표시했습니다.",
        },
        {
          q: "100m 격자로 나누는 게 말이 되나?",
          hint: `200m로 합쳐도 판정 유지 ${Object.values(r2.gridSensitivity.v2).filter(Boolean).length}/${Object.keys(r2.gridSensitivity.v2).length}`,
          answer: `됩니다. 자료마다 칸에 넣는 방식이 다르고 칸 크기를 바꿔도 결론이 같았습니다.

- 민원·과태료는 건별 주소를 좌표로 바꿔 그 점이 속한 칸에 셉니다. 건축물대장은 대지 지번 좌표로, 도로·건물은 OSM 선·면을 칸 경계로 잘라 넣습니다
- 인구는 서울시 250m 격자 생활인구(면적 비례 배분)와 SGIS 100m 격자 상주인구(2024 등록센서스) 두 가지를 노출 변수로 넣었습니다
- 칸을 200m로 네 배 키워 다시 적합하면 다가구·단독 밀집 β ${signed(r2.v2_200.coef.unmanaged_units.beta)}, 골목 비율 β ${signed(r2.v2_200.coef.alley_ratio.beta)}로 방향과 유의성이 그대로입니다(R² ${r2.v2_100.r2}→${r2.v2_200.r2})

격자는 통계청 좌표계(EPSG:5179)에 맞춰 SGIS 인구격자·서울시 250m 격자와 좌표로 바로 이어집니다.`,
          viz: { mode: "overlay" },
          vizNote: "지도의 칸 하나가 100m입니다. 칸 위에 마우스를 올리면 그 칸의 민원·과태료·다가구·단독·생활인구가 보입니다.",
        },
        ...(r2.exposure
          ? [
              {
                q: "등록인구를 넣으면 결론이 바뀌나?",
                hint: "상주인구도 넣었습니다. 바뀌지 않습니다",
                answer: `바뀌지 않습니다. 국가데이터처 SGIS 100m 격자 총인구(2024 등록센서스)를 같은 칸에 붙여 회귀에 넣었습니다. 상주인구만 넣으면 β ${signed(r2.exposure.compare.resident_only.resident_pop.beta)}(${pText(r2.exposure.compare.resident_only.resident_pop.p)}), 생활인구와 같이 넣으면 β ${signed(r2.exposure.compare.both.resident_pop.beta)}(${pText(r2.exposure.compare.both.resident_pop.p)})로 사는 사람 수 자체는 연관이 없었습니다. 다가구·단독 밀집은 β ${signed(r2.exposure.compare.both.unmanaged.beta)}로 그대로입니다.

머무는 사람(생활인구)과 사는 사람(상주인구)은 상관이 ${r2.exposure.corrLivingResident.toFixed(2)}밖에 안 돼 서로 다른 정보를 담고 있고 같이 넣어도 공선성 문제(VIF 최대 ${Math.max(...Object.values(r2.exposure.vif)).toFixed(1)})는 없습니다. 인구 영향을 걷어냈다고 단정할 수는 없습니다. 이 자료로 말할 수 있는 것은 두 종류 인구 노출을 넣어도 결론이 같다는 데까지입니다. 격자 통계에는 셀당 최대 ±7명의 비밀보호 노이즈가 들어 있습니다.`,
                viz: { mode: "lp" as const },
                vizNote: "지도 바탕은 생활인구입니다. 상주인구는 회귀 변수로만 썼습니다.",
              },
            ]
          : []),
        ...(r2.proxyCheck
          ? [
              {
                q: "다세대·연립도 관리주체가 없는데, 왜 다가구만 문제인가?",
                hint: "K-apt로 나눠 보니 연관은 다가구·단독에만 있었습니다",
                answer: `건축물대장 "공동주택" ${n(r2.proxyCheck.crossCheck.aptHhTotal)}세대 가운데 관리주체가 실제로 있는 K-apt 등록 단지는 ${n(r2.proxyCheck.crossCheck.managedTotal)}세대(${Math.round((r2.proxyCheck.crossCheck.managedShareOfAptHh ?? 0) * 100)}%)뿐이었습니다. 나머지는 관리사무소 없는 다세대·연립·소형 공동주택입니다.

주거를 세 갈래(다가구·일반단독 / K-apt 미등록 공동주택 / K-apt 등록)로 나눠 같은 모형을 돌리면 다가구·일반단독만 β ${signed(r2.proxyCheck.split.unmanaged_units.beta)}(${pText(r2.proxyCheck.split.unmanaged_units.p)})로 남고 관리사무소가 없는 다세대·연립은 β ${signed(r2.proxyCheck.split.apt_nokapt.beta)}(${pText(r2.proxyCheck.split.apt_nokapt.p)})로 연관이 없습니다. 그래서 "관리주체가 없어서"라는 설명은 너무 넓습니다. 이 자료가 뒷받침하는 범위는 다가구·단독주택 밀집까지입니다. 왜 다가구인지(세입자 구조인지 배출 장소 구조인지)는 이 자료로 가를 수 없습니다.${r2.proxyCheck.apiSensitivity ? ` 국토교통부 기본정보 API의 단지별 세대수로 바꿔 끼워도 다가구·일반단독 β ${signed(r2.proxyCheck.apiSensitivity.unmanaged_units.beta)}로 같은 답입니다.` : ""}`,
                viz: { mode: "unm" as const },
                vizNote: "지도에 다가구·단독 밀집을 표시했습니다. 밀집 칸이 진하게 보입니다.",
              },
            ]
          : []),
        {
          q: "다른 구도 앱 때문에 민원이 늘었나?",
          hint: "서울 전체 앱 청소 신고가 해마다 증가",
          answer: `그렇습니다. 서울시 스마트불편신고 청소 분야 접수는 ${Object.entries(sx.smartReport.cleaningByYear).filter(([y]) => y >= "2022" && y < period.lastYear).map(([y, v]) => `${y}년 ${v.toLocaleString()}건`).join(", ")}으로 서울 전체에서 늘고 있습니다(서울 열린데이터광장).

광진의 민원 증가가 앱 보급 효과라는 해석은 서울시 전체에서도 성립합니다. 25개 구가 같은 착시를 겪고 있으니 앱을 뺀 채널고정 지표로 성과를 재는 원칙은 서울시 전체에 제안할 수 있습니다. 상습격자 수도 앱을 빼면 ${k.criticalCellsNow}곳에서 ${k.criticalCellsNowNoApp}곳으로 줄어듭니다.`,
        },
      ]
    : []

  return [
    {
      q: "작년보다 나빠졌나?",
      hint: "숫자는 늘었지만 대부분 앱 신고 확산 효과",
      answer: `민원 숫자만 보면 늘었지만 실제로 나빠졌다고 보기는 어렵습니다.

- 민원 접수: ${comp}
- 과태료 부과는 ${y0}년 ${n(enf0)}건에서 ${y1}년 ${n(enf1)}건으로 ${enf1 < enf0 ? "오히려 줄었습니다" : "늘었습니다"}. 신고와 독립인 순찰(수시) 적발만 봐도 같은 기준으로 ${fmtRatio(g.finesPatrol)}입니다

민원 증가분의 대부분은 스마트폰 앱 보급으로 신고가 쉬워진 효과입니다(${g.basis}하면 앱 신고만 ${fmtRatio(g.app)}, 전화·직접 신고는 ${fmtRatio(g.fixed)}). 그래서 연도별 민원 건수는 성과 지표로 쓰지 않습니다. 다만 과태료의 ${100 - g.patrolSharePct}%도 신고를 받아 나간 것이라 신고와 독립인 실측으로 볼 수 없고 앱 이용자 수 자료가 없어 발생 증가를 배제하지는 못합니다.`,
      chart: "yearly",
      viz: { mode: "comp" },
      vizNote: "지도를 민원 분포로 전환했습니다. 민원 수치에는 앱 보급에 따른 신고 편향이 섞여 있습니다.",
    },
    {
      q: "무단투기의 최강 예측변수는?",
      hint: `다가구·단독주택 밀집 (β ${unmText})`,
      answer: `다가구·단독주택이 몰린 정도입니다. 건축물대장의 다가구 가구수와 단독주택 동수를 합친 밀도가 높은 곳일수록 발생이 많습니다(표준화 β ${unmText}, 이 요인이 많은 곳일수록 발생도 많다는 뜻. ${unm ? pText(unm.p) : "p<0.001"}로 우연이 아님).

반대로 아파트 등 공동주택 세대수는 연관이 확인되지 않았습니다(β ${apt ? signed(apt.beta) : "−0.011"}, ${apt ? pText(apt.p) : "p=0.708"}). 다만 K-apt로 나눠 보면 관리사무소가 없는 다세대·연립도 연관이 없습니다. 관리주체가 없어서가 아니라 다가구·단독이라서입니다. 왜 다가구인지(세입자 구조인지 배출 장소 구조인지)는 이 자료로 가를 수 없습니다.`,
      chart: "beta",
      viz: { mode: "unm" },
      vizNote: `지도를 다가구·단독 밀집(β ${unmText})으로 전환했습니다.`,
    },
    {
      q: "CCTV는 어디에 놓아야 하나?",
      hint: "증설 근거는 철회 · 재배치는 합리적",
      answer: `CCTV를 늘려서 무단투기를 줄일 수 있다는 근거는 없습니다. 초기 분석의 감소 효과는 비교 방법 오류(평균회귀)로 확인되어 철회됐습니다. 공정하게 다시 잰 결과 효과가 확인되지 않았습니다(대칭 DID ${signed(didSym)}, p${didP}).

다만 발생이 전혀 없는 곳의 카메라를 발생 이력이 많은 곳으로 옮기는 재배치는 예산 0원이라 자원 배분 논리로는 합리적입니다. 지도에 표시된 재배치 후보 ${candidates}곳(빨간 번호)이 발생 이력 순 후보이며 오른쪽 목록에서 주소를 확인할 수 있습니다.`,
      chart: "did",
      viz: { mode: "enf", layers: ["cctvMobile"], candidates: true },
      vizNote: `지도에 이동식 CCTV 현 위치(보라 점)와 재배치 후보 ${candidates}곳(빨간 번호)을 표시했습니다. 지도 오른쪽 목록에서 후보지 주소를 볼 수 있습니다.`,
    },
    {
      q: "빠뜨린 대책은 없나?",
      hint: "사람을 겨냥하는 대책이 비어 있었습니다",
      answer: `있습니다. 사람을 겨냥하는 대책이 통째로 비어 있었습니다.

발생과 연관된 요인(청년 밀집, 외국인 비율, 1인세대)을 겨냥하는 개입수단이 근거 그래프에 하나도 없었습니다. 그래프를 맞춰 보는 것만으로 잡히는 빈칸이고, 여기서 신규 대책 3건이 나왔습니다.

- 다국어 배출안내(${topFrn.d}은 외국인 비율 ${topFrn.frn}%)
- 전입·임대차 시점 배출안내(1인세대 진입 경로)
- 수거 시간대 조정(무예산)

주의: 네 요인은 같은 동네에 함께 몰려 있어 어느 하나를 원인으로 지목할 수는 없습니다.`,
      chart: "beta",
      viz: { mode: "unm" },
      vizNote: "지도를 다가구·단독 밀집으로 전환했습니다. 사람 겨냥 대책의 공백이 드러난 요인 축입니다.",
    },
    {
      q: "으슥한 골목에 많이 버리지 않나?",
      hint: "반대입니다. 생활동선 위에서 발생합니다",
      answer: `아닙니다. 데이터는 반대였습니다.

골목이 많은 격자일수록(β ${alley ? signed(alley.beta) : "−0.222"}), 큰길에서 멀수록(β ${arterial ? signed(arterial.beta) : "−0.139"}) 발생이 오히려 적었습니다. 사람 눈을 피해 으슥한 곳에 버린다는 은폐 가설은 이 자료에서 뒷받침되지 않았습니다.

무단투기는 숨어서 하는 행위가 아니라 생활동선 위, 배출 관리가 없는 곳에서 일어납니다. 단속이나 CCTV를 으슥한 곳 위주로 배치하는 논리는 데이터와 어긋납니다.`,
      chart: "beta",
      viz: { mode: "overlay" },
      vizNote: "지도를 원인+결과 겹쳐보기로 전환했습니다. 발생이 생활동선 위에 있는지 직접 확인할 수 있습니다.",
    },
    {
      q: "재활용정거장은 효과가 있었나?",
      hint: "지금 데이터로는 판정 불가",
      answer: `효과를 측정할 수 없었습니다. 재활용정거장은 2024년이 마지막 신규 설치라 제대로 비교할 대상(아직 설치 안 된 곳)이 없고 철거 기록도 ${n(data.infra.recycling.length)}곳 중 3곳뿐이라 전후 비교가 불가능합니다.

초기 계산에서 ${signed(recDid)}건(p=${recP.toFixed(3)})이라는 수치가 나왔지만 평균회귀 편향이 남아 있어 판정 불가로 처리했습니다. 효과가 없다는 말이 아닙니다. 지금 데이터로는 알 수 없습니다.`,
      viz: { mode: "comp", layers: ["recycling"] },
      vizNote: "지도에 재활용정거장(초록)을 민원 분포 위에 표시했습니다.",
    },
    {
      q: "청소차는 어디를 청소하나?",
      hint: "집중관리 10.6km · 일반 28.7km",
      answer: `청소차는 총 17대(물청소 5, 노면 7, 분진흡입 5)이고 도로 등급별로 나눠 순회합니다.

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
- 더운 날(25도 이상)은 ${hot.compPerDay}건으로 가장 많고 비 오는 날엔 단속 적발이 ${rain["무강수"].enfPerDay}건에서 ${rain["비(1mm+)"].enfPerDay}건으로 줄어듭니다(폭우 땐 ${rain["폭우(10mm+)"].enfPerDay}건)

주의: 민원은 발견·신고 시점, 과태료는 단속 적발 시점 기준이라 투기 행위 시각 그 자체는 아닙니다. 날씨가 원인이라기보다 야외 활동·신고·단속 여건이 함께 움직이는 연관입니다.`,
      chart: "seasons",
    },
    {
      q: "작년과 올해 연도별 추이는?",
      hint: enf1 < enf0 ? "민원은 늘고 단속은 줄었습니다" : "민원과 단속이 함께 늘었습니다",
      answer: `민원 접수는 늘고 있고 단속(과태료)은 ${enf1 < enf0 ? "줄어드는" : "늘어나는"} 흐름입니다.

- 민원: ${comp}
- 과태료: ${enf}

${period.lastYear}년은 ${lastMonths}개월 집계인데도 민원이 작년 연간치를 ${(data.yearly.complaints[period.lastYear] ?? 0) > (data.yearly.complaints[y1] ?? 0) ? "이미 넘었지만" : "따라잡고 있지만"}, 이 증가분의 대부분은 앱 신고 확산(연환산 앱만 ${fmtRatio(g.app)}) 때문입니다. 과태료는 ${enf1 < enf0 ? "줄고 있어" : "함께 늘고 있어"}(순찰 적발만 봐도 ${fmtRatio(g.finesPatrol)}), 상황이 악화됐다고 단정할 수 없습니다. ${finesCensorNote(data)}. 월별 흐름은 아래 차트에 있습니다.`,
      chart: "monthly",
    },
    ...seoulSeeds,
  ]
}
