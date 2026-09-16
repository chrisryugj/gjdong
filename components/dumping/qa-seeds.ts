import type { DumpingMapData, OntoGraph, VizAction } from "@/lib/dumping/types"
import { appStep, channelGrowth, collinearRange, finesCensorNote, fmtRatio, partialYearSuffix, regressionBetas, sampleSizes, summarize, tallyInfra, ym } from "@/lib/dumping/facts"
import { proposalRows } from "./lever-view"
import type { ChartKind } from "./qa-chart"

// 물어보기 탭의 준비된 질의응답(시드). 문장은 여기, 숫자는 map.json·graph.json에서 읽는다(데이터가 갱신되면 문장도 따라온다).
// 청소차 제원처럼 export에 없는 수치만 README 정본을 그대로 적었다. 배율은 facts.channelGrowth가 연환산해 준다.
// 10라운드(2026-09-15): 생성 답과 같은 규격. answer = 1부(말로 하는 답, 2~4문장·통계 용어 없음·존댓말 평문),
// detail = 2부("- 수치: / - 근거: / - 한계: / - 다음 행동:" 불릿, 각 45자 안팎). hint는 1부 첫 문장과 같다.
// core = 결재 자리에서 먼저 보이는 6개(현황·원인·예산·효과 시점·CCTV·빠진 대책). 나머지는 "더 보기".
// 민원·과태료는 "기록"이지 "실제 발생"이 아니다. 변수 이름은 "다가구·단독 밀집" 하나.

export interface Seed {
  q: string
  hint: string // 접힌 상태에서 보이는 한 줄 결론. 1부 첫 문장
  answer: string // 1부. 음성으로 읽고 크게 보인다
  detail: string // 2부. 화면 아래 작게. "- 수치: …" 꼴
  core?: boolean // 기본 노출
  viz?: VizAction
  vizNote?: string
  chart?: ChartKind
}

const n = (v: number) => v.toLocaleString()
const signed = (v: number) => `${v > 0 ? "+" : "−"}${Math.abs(v).toFixed(3)}`
const pText = (p: number) => (p < 0.001 ? "p<0.001" : `p=${p.toFixed(3)}`)
const lines = (...ls: (string | null | false | undefined)[]) => ls.filter(Boolean).map((l) => `- ${l}`).join("\n")

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
  const step = appStep(data)
  const { gridN } = sampleSizes(data, graph)
  const asof = data.decision.asof
  const k = data.decision.kpi

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
  const cctvRows = data.meta?.geocode?.cctvMobile?.rows ?? data.infra.cctvMobile.length
  // 재활용정거장 운영·철거 수는 레버 라벨("재활용정거장(운영 606·철거 334)")에서. 없으면 README 정본
  const recLabel = String(graph.nodes.find((x) => x.id === "lev-recycling")?.label ?? "")
  const recM = /운영 ([\d,]+)·철거 ([\d,]+)/.exec(recLabel)
  const recOp = recM?.[1] ?? "606"
  const recRemoved = recM?.[2] ?? "334"
  const recRows = data.meta?.geocode?.recycling?.rows ?? data.infra.recycling.length
  const recSpots = tallyInfra(data.infra.recycling).records.length

  const rows = proposalRows(graph)
  const byCost = (label: string) => rows.filter((r) => r.cost === label).map((r) => r.name)
  const free = byCost("추가 예산 없음")
  const low = byCost("저비용")
  const budget = byCost("예산 필요")

  const topFrn = [...data.dong].sort((a, b) => b.frn - a.frn)[0]
  const S = data.env.seasons
  const summerWinter = (S["여름"].compPerDay / S["겨울"].compPerDay).toFixed(1)
  const rain = data.env.rain
  const r2 = data.decision.regressionV2
  const sx = data.decision.seoul
  const col = collinearRange(graph)

  const seoulSeeds: Seed[] = r2 && sx
    ? [
        {
          q: "의류수거함 옆에서 무단투기가 많이 생기지 않나?",
          hint: "단속 자료로는 그렇지 않습니다.",
          answer: `단속 자료로는 그렇지 않습니다. 광진구 의류수거함 ${n(data.infra.clothBins.length)}곳을 격자에 넣어 보니 과태료 적발과의 연관은 확인되지 않았고, 신고 민원과만 약한 연관이 있었습니다. 눈에 잘 띄어 신고가 느는 것인지 실제 배출이 많은 것인지는 이 자료로 구분할 수 없습니다.`,
          detail: lines(
            `수치: 과태료 β ${signed(r2.v2_100.coef.clothbin_n.beta)}(${pText(r2.v2_100.coef.clothbin_n.p)}), 민원 β ${signed(r2.v2_100_complaints.coef.clothbin_n.beta)}(${pText(r2.v2_100_complaints.coef.clothbin_n.p)})`,
            `근거: 공공데이터포털 의류수거함 위치, 카드 "통념 검증"`,
            `한계: 신고 편향인지 단속 미포착인지 구분 불가`,
            `다음 행동: 수거함 밀집 격자 시범을 조치 대장에 등록한 뒤 판정`,
          ),
          viz: { mode: "comp", layers: ["clothBins"] },
          vizNote: "지도에 의류수거함(청록 점)을 민원 분포 위에 표시했습니다.",
        },
        {
          q: "100m 격자로 나누는 것이 타당한가?",
          hint: "칸을 200m로 키워도 결론이 같았습니다.",
          answer: `칸을 200m로 키워도 결론이 같았습니다. 다가구·단독 밀집과 골목 비율의 방향과 유의성이 그대로였고, 자료마다 칸에 넣는 방식은 달라도 같은 좌표계에 맞춰 결합했습니다. 격자 크기는 분석 단위이지 결론의 원인이 아닙니다.`,
          detail: lines(
            `수치: 200m 재적합 다가구·단독 β ${signed(r2.v2_200.coef.unmanaged_units.beta)}, 골목 β ${signed(r2.v2_200.coef.alley_ratio.beta)}`,
            `수치: 판정 유지 ${Object.values(r2.gridSensitivity.v2).filter(Boolean).length}/${Object.keys(r2.gridSensitivity.v2).length} 변수, R² ${r2.v2_100.r2}→${r2.v2_200.r2}`,
            `근거: 카드 "격자 검증", 통계청 EPSG:5179 격자`,
            r2.exposure
              ? `한계: 200m에서는 공동주택 세대수가 β ${signed(r2.exposure.v3_200.coef.apt_hh.beta)}로 유의해지는 예외`
              : `한계: 50m 검증은 주소 정밀도 한계로 하지 않음`,
          ),
          viz: { mode: "overlay" },
          vizNote: "지도의 칸 하나가 100m입니다. 칸 위에 마우스를 올리면 그 칸의 민원·과태료·다가구·단독·생활인구가 보입니다.",
        },
        ...(r2.exposure
          ? [
              {
                q: "등록인구를 넣으면 결론이 바뀌나?",
                hint: "상주인구를 넣어도 바뀌지 않습니다.",
                answer: `상주인구를 넣어도 바뀌지 않습니다. 국가데이터처 100m 격자 상주인구를 생활인구와 따로, 그리고 같이 넣어도 다가구·단독 밀집의 연관은 그대로였고 상주인구 자체는 연관이 확인되지 않았습니다. 다만 인구 영향을 다 뺐다고 단정할 수는 없습니다.`,
                detail: lines(
                  `수치: 상주인구 β ${signed(r2.exposure.compare.both.resident_pop.beta)}(${pText(r2.exposure.compare.both.resident_pop.p)}), 다가구·단독 β ${signed(r2.exposure.compare.both.unmanaged.beta)} 유지`,
                  `수치: 생활인구·상주인구 상관 ${r2.exposure.corrLivingResident.toFixed(2)}, 두 노출 변수 VIF 최대 ${Math.max(...Object.values(r2.exposure.vif)).toFixed(1)}`,
                  `근거: 국가데이터처 SGIS 격자 인구, 서울 열린데이터광장 생활인구, 카드 "노출 통제"`,
                  `한계: 격자 인구는 셀당 최대 ±7명 비밀보호 노이즈`,
                ),
                viz: { mode: "lp" as const },
                vizNote: "지도 바탕은 생활인구입니다. 상주인구는 회귀 변수로만 썼습니다.",
              },
            ]
          : []),
        ...(r2.proxyCheck
          ? [
              {
                q: "다세대·연립도 관리주체가 없는데, 왜 다가구만 문제인가?",
                hint: "K-apt로 나눠 보니 연관은 다가구·단독에만 있었습니다.",
                answer: `K-apt로 나눠 보니 연관은 다가구·단독에만 있었습니다. 건축물대장 공동주택 세대 가운데 관리주체가 확인된 K-apt 등록은 ${Math.round((r2.proxyCheck.crossCheck.managedShareOfAptHh ?? 0) * 100)}퍼센트뿐이었고, 관리사무소가 없는 다세대·연립은 연관이 확인되지 않았습니다. 그래서 관리주체 부재 일반이 아니라 다가구·단독 밀집으로 좁혀 말합니다.`,
                detail: lines(
                  `수치: 다가구·일반단독 β ${signed(r2.proxyCheck.split.unmanaged_units.beta)}(${pText(r2.proxyCheck.split.unmanaged_units.p)}), 다세대·연립 β ${signed(r2.proxyCheck.split.apt_nokapt.beta)}(${pText(r2.proxyCheck.split.apt_nokapt.p)})`,
                  `수치: K-apt 등록 ${n(r2.proxyCheck.crossCheck.managedTotal)}세대 / 대장 공동주택 ${n(r2.proxyCheck.crossCheck.aptHhTotal)}세대`,
                  `근거: 국토교통부 K-apt·건축물대장, 카드 "대리변수 검증"`,
                  `한계: 왜 다가구인지(세입자 구조·배출 장소)는 이 자료로 구분 불가`,
                ),
                viz: { mode: "unm" as const },
                vizNote: "지도에 다가구·단독 밀집을 표시했습니다. 밀집 칸이 진하게 보입니다.",
              },
            ]
          : []),
        ...(r2.itemSplit
          ? [
              {
                q: "차량 담배꽁초를 빼고 생활쓰레기만 분석해도 같은 결론인가?",
                hint: "같습니다.",
                answer: `같습니다. 위치가 확인된 과태료를 생활쓰레기와 차량 담배꽁초로 나눠 따로 분석해도 생활쓰레기에서 다가구·단독 밀집의 연관은 유지되고, 차량 담배꽁초에서는 연관이 확인되지 않았습니다. 골목보다 큰길에서 많다는 결과는 차량 담배꽁초 쪽 이야기입니다.`,
                detail: lines(
                  `수치: 생활쓰레기 ${n(r2.itemSplit.counts.life)}건 다가구·단독 β ${signed(r2.itemSplit.life.coef.unmanaged_units.beta)}, 차량 담배꽁초 ${n(r2.itemSplit.counts.cigVehicle)}건 β ${signed(r2.itemSplit.cigVehicle.coef.unmanaged_units.beta)}(${pText(r2.itemSplit.cigVehicle.coef.unmanaged_units.p)})`,
                  `수치: 차량 담배꽁초 모형 골목 β ${signed(r2.itemSplit.cigVehicle.coef.alley_ratio.beta)}, 간선 이격 β ${signed(r2.itemSplit.cigVehicle.coef.dist_arterial.beta)}`,
                  `근거: 과태료 부과 내역 품목 분류, 카드 "품목 분리"`,
                  `한계: 차량 담배꽁초는 ${n(r2.itemSplit.counts.cellsCig)}칸뿐이라 계수 구간이 넓음`,
                ),
                viz: { mode: "enf" as const },
                vizNote: "지도를 과태료 분포로 전환했습니다. 품목별 지도 바탕은 아직 없습니다.",
              },
            ]
          : []),
        {
          q: "다른 구도 앱 때문에 민원이 늘었나?",
          hint: "서울 전체에서도 앱 청소 신고가 해마다 늘고 있습니다.",
          answer: `서울 전체에서도 앱 청소 신고가 해마다 늘고 있습니다. 다만 25개 구의 무단투기 발생이나 과태료를 직접 비교한 자료는 없어 광진이 더 심한지, 다른 구도 같은 이유로 늘었는지는 알 수 없습니다.`,
          detail: lines(
            `수치: 서울 앱 청소 신고 ${Object.entries(sx.smartReport.cleaningByYear).filter(([y]) => y >= "2023" && y < period.lastYear).map(([y, v]) => `${y}년 ${v.toLocaleString()}`).join(", ")}건`,
            `수치: 집중관리 상습격자 앱 포함 ${k.criticalCellsNow}곳, 앱 제외 ${k.criticalCellsNowNoApp}곳`,
            `근거: 서울 열린데이터광장 스마트 불편신고 분야별 현황`,
            `한계: 자치구 간 무단투기 비교 자료 없음. 원인은 구별 확인 필요`,
          ),
        },
      ]
    : []

  return [
    {
      q: "작년보다 나빠졌나?",
      core: true,
      hint: "민원은 늘었지만 발생이 늘었다고 단정할 수는 없습니다.",
      answer: `민원은 늘었지만 발생이 늘었다고 단정할 수는 없습니다. 늘어난 신고는 앱 창구에 몰려 있고, 앱을 뺀 신고는 ${fmtRatio(g.fixed)}, 순찰 적발은 ${fmtRatio(g.finesPatrol)}입니다. 다만 앱 이용자 수 자료가 없어 발생 증가를 배제하지는 못합니다.`,
      detail: lines(
        `수치: 민원 ${comp}`,
        `수치: 과태료 ${y0}년 ${n(enf0)}건→${y1}년 ${n(enf1)}건, 앱 신고 ${fmtRatio(g.app)}(${g.baseYear}년 대비 연환산)`,
        `근거: 민원 접수 내역·과태료 부과 내역, 카드 "신고 채널 분해"`,
        step ? `한계: 앱 신고가 ${ym(step.month)}에 ${n(step.from)}→${n(step.to)}건으로 뛴 이유는 미확인` : `한계: 과태료의 ${100 - g.patrolSharePct}%가 신고 유래라 발생 실측이 아님`,
      ),
      chart: "yearly",
      viz: { mode: "comp" },
      vizNote: "지도를 민원 분포로 전환했습니다. 민원 수치에는 앱 신고 증가가 섞여 있습니다.",
    },
    {
      q: "적발과 가장 강하게 연관된 조건은?",
      core: true,
      hint: "다가구·단독주택이 몰린 정도입니다.",
      answer: `다가구·단독주택이 몰린 정도입니다. 건축물대장의 다가구 가구와 단독주택 동을 합친 밀도가 높은 칸일수록 과태료 적발 기록이 많았습니다. 아파트 세대수는 연관이 확인되지 않았고, 왜 다가구인지는 이 자료로 알 수 없습니다.`,
      detail: lines(
        `수치: 표준화 β ${unmText}(많을수록 적발 많음), 격자 ${n(gridN)}칸, ${unm ? pText(unm.p) : "p<0.001"}`,
        `수치: 공동주택 세대수 β ${apt ? signed(apt.beta) : "−0.011"}(${apt ? pText(apt.p) : "p=0.708"}) 연관 미확인`,
        `근거: 건축물대장·과태료 부과 내역, 카드 "가장 강한 연관"`,
        `한계: 다세대·연립도 연관 미확인. 관리주체 부재로 넓히지 않음`,
      ),
      chart: "beta",
      viz: { mode: "unm" },
      vizNote: `지도를 다가구·단독 밀집(β ${unmText})으로 전환했습니다.`,
    },
    {
      q: "예산은 얼마나 드나?",
      core: true,
      hint: "총예산은 아직 산정하지 않았습니다.",
      answer: `총예산은 아직 산정하지 않았습니다. 추가 예산 없이 시범할 수 있는 것이 ${free.length}건, 저비용이 ${low.length}건, 설치비 산정이 필요한 것이 ${budget.length}건입니다. 추가 예산이 없어도 직원 시간과 이전 비용은 따로 듭니다.`,
      detail: lines(
        `수치: 추가 예산 없음 ${free.join(", ") || "없음"}`,
        `수치: 저비용 ${low.join(", ") || "없음"}, 예산 필요 ${budget.join(", ") || "없음"}`,
        `근거: 정책 제안 탭 제안 6건, 결재용 한 장`,
        `한계: 설치비·인력 시간은 시범 동을 정한 뒤 산정`,
      ),
    },
    {
      q: "대책 효과는 언제 확인되나?",
      core: true,
      hint: "시행 다음 분기 말에 처음 확인합니다.",
      answer: `시행 다음 분기 말에 처음 확인합니다. 조치 대장에 등록하고 시행하면 집중관리 상습격자 지표가 분기마다 갱신되므로 그 시점에 판정합니다. 계절 영향을 빼려면 전년 같은 분기와 비교합니다.`,
      detail: lines(
        `수치: 집중관리 상습격자 ${k.criticalCellsNow}곳, 앱 제외 ${k.criticalCellsNowNoApp}곳(${asof} 기준)`,
        `근거: 조치 대장 원칙, 운영·전망 탭 성과지표`,
        `한계: 몇 건 줄어들지는 미리 계산하지 않음. 시범 뒤 실측으로만`,
        `다음 행동: 시범 동·대조군을 조치 대장에 먼저 등록`,
      ),
    },
    {
      q: "CCTV는 어디에 놓아야 하나?",
      core: true,
      hint: "늘려서 줄인다는 근거는 확인되지 않았습니다.",
      answer: `늘려서 줄인다는 근거는 확인되지 않았습니다. 초기에 보였던 감소 효과는 비교 방법 오류로 철회됐습니다. 다만 적발 기록이 없는 자리의 카메라를 잦은 자리로 옮기는 재배치 후보 ${candidates}곳은 추가 예산 없이 검토할 수 있습니다.`,
      detail: lines(
        `수치: 대칭 DID ${signed(didSym)}(p${didP}), 이벤트 스터디 전 시점 비유의`,
        `수치: 재배치 후보 ${candidates}곳(지도 빨간 번호), 이동식 CCTV 장부 ${n(cctvRows)}대`,
        `근거: CCTV 현황·과태료 부과 내역, 카드 "효과 철회"`,
        `한계: 재배치도 조치 대장 등록 뒤 평가. 이전·설치 인력 별도`,
      ),
      chart: "did",
      viz: { mode: "enf", layers: ["cctvMobile"], candidates: true },
      vizNote: `지도에 이동식 CCTV 현 위치(보라 점)와 재배치 후보 ${candidates}곳(빨간 번호)을 표시했습니다. 지도 오른쪽 목록에서 후보지 주소를 볼 수 있습니다.`,
    },
    {
      q: "빠뜨린 대책은 없나?",
      core: true,
      hint: "이번에 모은 정책 목록에는 그 골목 주민에게 배출 안내를 전하는 대책이 연결돼 있지 않았습니다.",
      answer: `이번에 모은 정책 목록에는 그 골목 주민에게 배출 안내를 전하는 대책이 연결돼 있지 않았습니다. 그래서 다국어 안내, 전입 시점 안내, 수거 시간대 조정 세 가지를 검토 대책으로 올렸습니다. 기존 사업에 이미 있는지는 담당 부서 대조가 먼저입니다.`,
      detail: lines(
        `수치: ${topFrn.d} 외국인 ${topFrn.frn}%. 청년·1인세대·다가구와 겹침(상관 ${col})`,
        `근거: 근거 그래프 역량 질문 1, 카드 "대책 공백"`,
        `한계: 네 요인이 겹쳐 어느 하나를 원인으로 지목 불가`,
        `다음 행동: 기존 안내 사업 대조 뒤 시범 동 등록`,
      ),
      chart: "beta",
      viz: { mode: "unm" },
      vizNote: "지도를 다가구·단독 밀집으로 전환했습니다. 청년·외국인·1인세대가 같이 몰린 요인 축입니다.",
    },
    {
      q: "으슥한 골목에 많이 버리지 않나?",
      hint: "이 자료에서는 뒷받침되지 않았습니다.",
      answer: `이 자료에서는 뒷받침되지 않았습니다. 전체 과태료로 보면 골목이 많고 큰길에서 먼 칸일수록 적발이 오히려 적었습니다. 그 큰길 쪽 결과는 주로 차량 담배꽁초에서 나오고, 생활쓰레기만 보면 골목과 큰길의 차이가 작습니다.`,
      detail: lines(
        `수치: 전체 과태료 골목 β ${alley ? signed(alley.beta) : "−0.222"}, 간선 이격 β ${arterial ? signed(arterial.beta) : "−0.139"}`,
        r2?.itemSplit ? `수치: 생활쓰레기만 골목 β ${signed(r2.itemSplit.life.coef.alley_ratio.beta)}, 간선 이격 β ${signed(r2.itemSplit.life.coef.dist_arterial.beta)}` : null,
        `근거: 과태료 부과 내역·OSM 도로, 카드 "가설 불일치"`,
        `한계: 뒤집어 증명한 것은 아님. 배치는 도로 형태보다 적발 이력으로`,
      ),
      chart: "beta",
      viz: { mode: "overlay" },
      vizNote: "지도를 다가구·단독 바탕에 과태료 원 겹쳐보기로 전환했습니다.",
    },
    {
      q: "재활용정거장은 효과가 있었나?",
      hint: "지금 자료로는 판정할 수 없습니다.",
      answer: `지금 자료로는 판정할 수 없습니다. 2024년이 마지막 신규 설치라 비교할 대상이 없고, 철거·미사용 ${recRemoved}곳 가운데 철거 날짜가 기록된 곳은 3곳뿐이라 전후 비교도 되지 않습니다. 효과가 없다는 뜻은 아닙니다.`,
      detail: lines(
        `수치: 장부 ${n(recRows)}건(운영 ${recOp}·철거·미사용 ${recRemoved}), 지도 ${n(recSpots)}곳`,
        `수치: 초기 계산 ${signed(recDid)}건(p=${recP.toFixed(3)})은 평균회귀 편향으로 판정 불가`,
        `근거: 재활용정거장 설치현황, 정책 제안 탭 기존 수단 검증`,
        `한계: 설치·철거 시점 자료가 확보되면 다시 판정`,
      ),
      viz: { mode: "comp", layers: ["recycling"] },
      vizNote: "지도에 재활용정거장(초록)을 민원 분포 위에 표시했습니다.",
    },
    {
      q: "청소차는 어디를 청소하나?",
      hint: "청소차 17대가 도로 등급별로 나눠 돕니다.",
      answer: `청소차 17대가 도로 등급별로 나눠 돕니다. 집중관리도로 10.6km는 천호대로와 아차산로로 겨울철 하루 4회 이상, 일반관리도로 28.7km는 14개 도로로 이틀에 1회 이상입니다. 골목 단위 수거 경로는 자료가 없어 격자 분석에 넣지 못했습니다.`,
      detail: lines(
        `수치: 물청소 5·노면 7·분진흡입 5대, 관리노선 39.3km`,
        `수치: 광진 클린데이 월 1회(4~11월), ${data.dong.length}개 동 동시`,
        `근거: 광진구 청소과 도로청소 종합계획(2026)`,
        `한계: 수거 시각·GPS 미확보. 수거 시간대 조정 시범의 전제 자료`,
      ),
      viz: { routes: true },
      vizNote:
        "지도에 청소차 관리노선을 표시했습니다. 주황 굵은 선=집중관리도로(천호대로·아차산로), 회색 선=일반관리도로 14개. 도로명 기준 표시입니다.",
    },
    {
      q: "계절이나 날씨에 따라 달라지나?",
      hint: "여름과 더운 날에 뚜렷하게 많습니다.",
      answer: `여름과 더운 날에 뚜렷하게 많습니다. 하루 평균 민원이 여름 ${S["여름"].compPerDay}건으로 겨울 ${S["겨울"].compPerDay}건의 ${summerWinter}배이고, 비 오는 날에는 단속 적발이 줄어듭니다. 민원은 발견 시각, 과태료는 단속 시각이라 투기 시각 자체는 아닙니다.`,
      detail: lines(
        `수치: 계절별 일평균 민원 봄 ${S["봄"].compPerDay}·여름 ${S["여름"].compPerDay}·가을 ${S["가을"].compPerDay}·겨울 ${S["겨울"].compPerDay}건`,
        `수치: 적발 무강수 ${rain["무강수"].enfPerDay}건→비 ${rain["비(1mm+)"].enfPerDay}건→폭우 ${rain["폭우(10mm+)"].enfPerDay}건/일`,
        `근거: 민원·과태료 내역, Open-Meteo 일별 관측`,
        `한계: 야외 활동·신고·단속 여건이 함께 움직이는 연관`,
      ),
      chart: "seasons",
      viz: { weather: "hot" as const },
      vizNote: "지도에 더운 날(일평균 25도 이상)에 접수된 민원을 하루당으로 환산한 원으로 표시했습니다. 툴바 '날씨별'에서 온화·추움·비와 견줄 수 있습니다. 접수일 기준이라 투기 시각은 아닙니다.",
    },
    {
      q: "월별로는 어떻게 움직였나?",
      hint: `민원은 늘고 과태료는 ${enf1 < enf0 ? "줄어드는" : "늘어나는"} 흐름입니다.`,
      answer: `민원은 늘고 과태료는 ${enf1 < enf0 ? "줄어드는" : "늘어나는"} 흐름입니다. ${period.lastYear}년은 ${lastMonths}개월 집계인데도 민원이 작년 연간치를 ${(data.yearly.complaints[period.lastYear] ?? 0) > (data.yearly.complaints[y1] ?? 0) ? "이미 넘었고" : "따라잡고 있고"}, ${step ? `앱 신고는 ${ym(step.month)}에 한 달 만에 ${n(step.from)}건에서 ${n(step.to)}건으로 뛰었습니다.` : "늘어난 부분은 앱 신고입니다."} 과태료는 최근 두세 달이 부과 지연으로 적게 잡힙니다.`,
      detail: lines(
        `수치: 민원 ${comp}`,
        `수치: 과태료 ${enf}`,
        `근거: 민원 접수 내역·과태료 부과 내역(위반일시 기준)`,
        `한계: ${finesCensorNote(data)}`,
      ),
      chart: "monthly",
    },
    ...seoulSeeds,
  ]
}
