import type { DumpingMapData, OntoGraph, VizAction } from "@/lib/dumping/types"
import { channelGrowth, collinearRange, finesCensorNote, finesDirection, fmtKrw, fmtRatio, regressionBetas, sampleSizes } from "@/lib/dumping/facts"

// 핵심 발견 10장 — 문장은 여기, 숫자는 map.json·graph.json에서 파생한다.
// 예전엔 README 확정치를 손으로 옮겨 적었는데, 재수출 때 "과태료 1.1배"처럼 데이터와 어긋난 문장이 남았다.
// export에 없는 것(철회된 초기 DID −0.785, 검수에서 보정한 562동)만 README 정본을 그대로 적는다.

export interface Finding {
  tag: string
  title: string
  body: string
  takeaway: string // 한 줄 결론(의사결정 지향) — 카드·모달에서 하이라이트
  detail: string[] // 모달 상세 문단
  numbers?: { k: string; v: string }[]
  viz?: VizAction
  vizLabel?: string
  accent?: boolean
}

const n = (v: number) => v.toLocaleString()
const signed = (v: number) => `${v > 0 ? "+" : "−"}${Math.abs(v).toFixed(3)}`
const pText = (p: number) => (p < 0.001 ? "<0.001" : p.toFixed(3))

export function buildFindings(data: DumpingMapData, graph: OntoGraph): Finding[] {
  const betas = regressionBetas(graph)
  const beta = (id: string) => betas.find((b) => b.id === id)
  const unm = beta("cov-unmanaged")
  const apt = beta("cov-apt")
  const alley = beta("cov-alley")
  const arterial = beta("cov-arterial")
  const { gridN, dongN } = sampleSizes(data, graph)
  const col = collinearRange(graph)
  const rho = (id: string) => Number(graph.nodes.find((x) => x.id === id)?.props.rho ?? NaN)
  const rhoYouth = rho("cov-youth")
  const rhoForeign = rho("cov-foreign")
  // 무관리 주거단위 수는 증거 노드 요약에만 있다 — 없으면 README 정본
  const unmUnits = /관리주체 없는 단위 ([\d,]+)/.exec(String(graph.nodes.find((x) => x.id === "ev-ledger")?.label ?? ""))?.[1] ?? "43,871"
  const g = channelGrowth(data)
  const cctv = graph.edges.find((e) => e.f === "lev-cctv-mobile" && e.rel === "lowers")?.props
  const didSym = Number(cctv?.did_symmetric ?? 0.221)
  const didP = String(cctv?.p ?? ">0.5")
  const topFrn = [...data.dong].sort((a, b) => b.frn - a.frn)[0]
  const f = data.decision.fines
  const cat = (name: string) => f.categories.find((c) => c.cat === name)
  const food = cat("음식물 혼합배출")
  const cig = cat("담배꽁초(차량)")
  const bag = cat("규격봉투 미사용")
  const move = cat("장소위반(이동배출)")
  const late = cat("시간외 배출")
  const cigShare = cig ? Math.round((cig.n / f.totalN) * 100) : 0
  const fun = f.funnel
  const bt = data.decision.hotspots.backtest
  const pm = data.decision.permits
  const kpi = graph.nodes.find((x) => x.id === "kpi-recurrence")
  const recur = Math.round(Number(kpi?.props.current ?? 0.22) * 100)
  const r2 = data.decision.regressionV2
  const seoul = data.decision.seoul
  const k = data.decision.kpi
  const cleanYears = seoul ? Object.keys(seoul.smartReport.cleaningByYear).sort().filter((y) => y < g.lastYear) : []
  const seoulApp = seoul && cleanYears.length >= 2
    ? (seoul.smartReport.cleaningByYear[cleanYears[cleanYears.length - 1]] / seoul.smartReport.cleaningByYear[cleanYears[cleanYears.length - 3] ?? cleanYears[0]])
    : NaN

  const findings: Finding[] = [
    {
      tag: "최강 예측변수",
      title: "관리주체 없는 주거단위 밀도",
      body: `표준화 β ${unm ? signed(unm.beta) : "+0.312"}, p${unm ? pText(unm.p) : "<0.001"} (n=${n(gridN)}). 표준오차 3방식과 음이항 모형에서도 판정이 유지됐습니다. 배출을 관리할 주체가 없는 주거가 몰린 곳일수록 발생이 많습니다.`,
      detail: [
        "다가구주택 가구와 일반 단독주택을 합친 \"관리주체 없는 주거단위\"가 100m 격자 안에 많을수록 무단투기(과태료 기준)가 뚜렷하게 늘었습니다. 상권·도로 형태·시설 배치를 통제한 뒤에도 남는, 가장 강한 조건부 연관입니다.",
        "표준오차를 세 방식(HC3·행정동 군집·wild bootstrap)으로 바꾸고 음이항 모형으로 다시 적합해도 판정이 유지됐고, 자료 검수에서 누락됐던 562동(2,800가구)을 보정한 뒤에도 계수 변화는 ±0.007 안쪽이었습니다.",
        "해석: 무단투기는 시민의식의 문제라기보다 배출을 관리할 주체가 없는 주거 구조에서 비롯되는 일에 가깝습니다. 그렇다면 대책도 사람이 아니라 배출 환경(공동 배출시설·관리주체 지정)을 겨냥해야 합니다.",
        "주의: 이 β는 기준 모형 값이고, 생활인구·상주인구 노출을 더한 v3 모형에서도 유지됩니다(노출 통제 카드). \"관리주체 없는 주거\"는 건축물대장의 다가구 가구수와 단독주택 동수를 합친 대리변수인데, K-apt 등록 세대로 나눠 보면 연관은 다가구·단독에만 있고 관리주체 없는 다세대·연립은 아닙니다(대리변수 검증 카드).",
      ],
      numbers: [
        { k: "표준화 β", v: unm ? signed(unm.beta) : "+0.312" },
        { k: "p값", v: unm ? pText(unm.p) : "<0.001" },
        { k: "표본", v: `격자 ${n(gridN)}개` },
        { k: "무관리 주거단위", v: `${unmUnits}세대` },
      ],
      takeaway: "대책은 사람이 아니라 배출 환경(공동 배출시설·관리주체 지정)을 겨냥해야 합니다.",
      viz: { mode: "unm" },
      vizLabel: "지도에서 무관리주거 밀도 보기",
      accent: true,
    },
    {
      tag: "연관 미확인",
      title: "공동주택 세대수는 연관이 확인되지 않음",
      body: `β ${apt ? signed(apt.beta) : "−0.011"}, p=${apt ? pText(apt.p) : "0.708"}. 표준오차를 어떻게 잡아도 연관을 확인하지 못했습니다(같은 점추정에 표준오차만 바꾼 것이라 독립된 반복 증거는 아닙니다). 같은 세대수라도 아파트라면 발생이 늘지 않았습니다.`,
      detail: [
        `공동주택(아파트) 세대수는 무단투기 발생과의 연관을 통계적으로 확인하지 못했습니다(연관이 없다는 증명은 아닙니다. β ${apt ? signed(apt.beta) : "−0.011"}, p=${apt ? pText(apt.p) : "0.708"}). 같은 수의 사람이 살아도 관리사무소와 경비, 공동 배출장이 있는 주거에서는 발생이 늘지 않았습니다.`,
        `해석: 무관리 주거(${unm ? signed(unm.beta) : "+0.312"})와 정확히 대비되는 결과입니다. "사람이 많아서 버린다"는 통념은 이 자료에서 뒷받침되지 않고, "관리할 주체가 없어서 버려진다"는 설명이 힘을 얻습니다.`,
      ],
      numbers: [
        { k: "β", v: apt ? signed(apt.beta) : "−0.011" },
        { k: "p값", v: apt ? pText(apt.p) : "0.708" },
        { k: "판정", v: "표준오차 4방식 모두 비유의" },
      ],
      takeaway: "\"사람이 많아서 버린다\"는 통념 위에 정책을 세우면 안 됩니다.",
      viz: { mode: "overlay" },
      vizLabel: "지도에서 원인+결과 겹쳐보기",
    },
    {
      tag: "가설 불일치",
      title: "‘으슥한 곳에 버린다’는 자료와 어긋났습니다",
      body: `골목 비율 β ${alley ? signed(alley.beta) : "−0.222"}, 간선 이격거리 β ${arterial ? signed(arterial.beta) : "−0.139"}로 둘 다 반대 방향이었습니다. 오히려 생활동선 가까이에서 발생합니다.`,
      detail: [
        "\"사람 눈을 피해 으슥한 골목에 버릴 것\"이라는 은폐 가설을 검정해 보니 계수가 둘 다 음수였습니다. 골목이 많은 격자일수록, 또 간선도로에서 멀수록 오히려 발생이 적었습니다.",
        "해석: 무단투기는 숨어서 하는 행위가 아니라, 사람이 오가는 생활동선 위에서 배출 관리가 없는 곳에 벌어지는 일이라는 뜻입니다. CCTV를 \"으슥한 곳\"에 두는 배치 논리는 데이터와 어긋납니다.",
        "주의: 도로 위 차량 담배꽁초(28%)가 섞인 전체 과태료로 잰 계수입니다. 생활쓰레기만 따로 재면 크기가 달라질 수 있습니다.",
      ],
      numbers: [
        { k: "골목 비율 β", v: alley ? signed(alley.beta) : "−0.222" },
        { k: "간선 이격 β", v: arterial ? signed(arterial.beta) : "−0.139" },
        { k: "판정", v: "은폐 가설 뒷받침 안 됨" },
      ],
      takeaway: "CCTV와 단속은 으슥한 곳이 아니라 생활동선 위에 배치해야 합니다.",
      viz: { mode: "comp" },
      vizLabel: "지도에서 민원 분포 보기",
    },
    {
      tag: "착시 해명",
      title: `민원 ${fmtRatio(g.total)} 증가는 신고 편향`,
      body: `앱 신고가 ${fmtRatio(g.app)}로 늘어나는 동안 120·직접 신고는 ${fmtRatio(g.fixed)}였습니다. 늘어난 부분은 대부분 앱 보급 효과로, 발생 증가로 보기 어렵습니다.`,
      detail: [
        `${g.baseYear}년 대비 ${g.lastYear}년 민원이 ${fmtRatio(g.total)}로 늘어(${g.basis}), 무단투기가 두 배로 나빠졌다고 읽기 쉽습니다. 그런데 채널별로 나눠 보면 앱 신고만 ${fmtRatio(g.app)}로 늘었고 120·직접 신고는 ${fmtRatio(g.fixed)}로 거의 그대로였습니다.`,
        `해석: 과태료 부과는 같은 기준으로 ${fmtRatio(g.fines)}, 오히려 ${finesDirection(g)}습니다. 다만 과태료의 ${100 - g.patrolSharePct}%는 신고를 받아 나간 것이라 신고 성향과 무관하지 않습니다. 신고와 상관없는 순찰(수시) 적발만 따로 봐도 ${fmtRatio(g.finesPatrol)}로 줄었습니다. 늘어난 부분은 발생 증가보다 신고 채널의 변화로 설명되는 몫이 큽니다. 앱 이용자 수·중복 신고 자료가 없어 발생 증가를 완전히 배제하지는 못합니다. 연도별 민원 건수로 성과를 평가하면 안 되는 이유입니다.`,
        `주의: 과태료 감소가 발생 감소를 뜻하지도 않습니다. 단속 인력과 순찰 패턴이 섞인 수치이고, ${finesCensorNote(data)}. 발생 추세는 채널고정 민원과 상습격자 수로 함께 읽어야 합니다.`,
        ...(seoul
          ? [`서울시 스마트불편신고 청소 분야도 ${cleanYears[cleanYears.length - 3] ?? cleanYears[0]}년 대비 ${cleanYears[cleanYears.length - 1]}년 ${Number.isFinite(seoulApp) ? seoulApp.toFixed(2) : "—"}배로 늘었습니다(서울 열린데이터광장 OA-12051). 앱 확산은 광진만의 일이 아니라 25개 구 공통의 착시입니다. 집중관리 상습격자도 앱 민원을 포함하면 ${k.criticalCellsNow}곳, 빼면 ${k.criticalCellsNowNoApp}곳입니다.`]
          : []),
      ],
      numbers: [
        { k: "민원 전체", v: fmtRatio(g.total) },
        { k: "앱 신고", v: fmtRatio(g.app) },
        { k: "120·직접", v: fmtRatio(g.fixed) },
        { k: "과태료 전체", v: fmtRatio(g.fines) },
        { k: "순찰 적발만", v: fmtRatio(g.finesPatrol) },
      ],
      takeaway: "연도별 민원 건수로 성과를 평가하면 안 됩니다. 채널고정 민원과 순찰 적발 계열을 함께 보셔야 합니다.",
      viz: { mode: "comp" },
      vizLabel: "지도에서 민원 분포 보기",
    },
    {
      tag: "주장 철회",
      title: "이동식 CCTV 효과 확인 안 됨",
      body: `초기에 보였던 감소 효과는 평균회귀가 섞인 것으로 드러나 철회했습니다. 대칭 DID ${signed(didSym)}(p${didP}), 이벤트 스터디도 전 시점 비유의.`,
      detail: [
        "초기 분석에서는 사전 발생이 있던 격자에 설치하면 3개월간 0.77건이 줄어든다(p=0.049)고 봤습니다. 그런데 처치군에만 \"설치 전 발생>0\" 조건을 걸고 비교 대상은 거르지 않은 비대칭 설계였습니다.",
        `비교 대상에도 같은 조건을 걸자 그쪽도 0.98건 줄었습니다. 감소분이 평균회귀로 설명되는 셈이라, 선택 규칙과 대조군 정의에 민감한 효과 주장은 철회했습니다. 조건을 맞춘 DID는 ${signed(didSym)}(모든 검정 p${didP})이었고, 이벤트 스터디(처치 77·대조 667·관측 22,247행)에서도 설치 후 어느 시점 하나 유의하지 않았습니다.`,
        "해석: \"CCTV가 무단투기를 줄인다\"는 주장은 철회했습니다. 다만 발생이 전혀 없는 자리에 서 있는 카메라를 발생 이력이 있는 상습 격자로 옮기는 재배치는, 통계가 아니라 자원 배분 논리로는 여전히 타당합니다(예산 0원).",
      ],
      numbers: [
        { k: "비대칭 DID(철회)", v: "−0.785" },
        { k: "대칭 DID", v: `${signed(didSym)} (p${didP})` },
        { k: "이벤트 스터디", v: "전 시점 비유의" },
      ],
      takeaway: "CCTV를 늘려 감축을 기대하기는 어렵습니다. 기존 장비 재배치(예산 0원)만 검토 대상입니다.",
      viz: { mode: "enf", layers: ["cctvMobile"], candidates: true },
      vizLabel: "지도에서 CCTV·재배치 후보 보기",
    },
    {
      tag: "빈칸 발견",
      title: "사람을 겨냥하는 대책이 비어 있었습니다",
      body: "청년·외국인·1인세대 요인을 겨냥하는 수단이 온톨로지에 하나도 없었습니다. 이 공백을 확인하면서 새 대책 세 가지가 나왔습니다.",
      detail: [
        `온톨로지에 "발생과 연관된 요인 목록"과 "각 요인을 겨냥하는 개입수단"을 함께 넣고 맞춰 보면, 청년(ρ ${rhoYouth.toFixed(3)})·외국인(ρ ${rhoForeign.toFixed(2)})·1인세대 요인에 대응하는 수단이 하나도 없다는 사실이 기계적으로 드러납니다. 표만 봐서는 던질 수 없는 질문입니다.`,
        `이 공백에서 다국어 배출안내(${topFrn.d} 외국인 ${topFrn.frn}%), 전입·임대차 시점 배출안내(1인세대가 들어오는 길목), 수거 시간대 조정(무예산) 세 가지가 새 대책으로 나왔습니다.`,
        `주의: 청년·외국인·1인세대·무관리주거는 상관 ${col}로 얽혀 있어 개별 효과를 갈라낼 수 없습니다(행정동 n=${dongN}). 어느 하나를 원인으로 지목하는 해석은 피해야 합니다.`,
      ],
      numbers: [
        { k: "청년 상관 ρ", v: rhoYouth.toFixed(3) },
        { k: "외국인 상관 ρ", v: rhoForeign.toFixed(2) },
        { k: "신규 대책", v: "3건 도출" },
      ],
      takeaway: "다국어 배출안내·전입 시점 안내·수거 시간대 조정 세 가지를 신규 대책으로 검토해 주세요.",
      viz: { mode: "unm" },
      vizLabel: "지도에서 무관리주거 밀도 보기",
    },
    {
      tag: "품목 분해",
      title: `단속의 ${cigShare}%는 차량 담배꽁초로, 성격이 다릅니다`,
      body: `과태료 ${n(f.totalN)}건을 품목별로 나누면 ${food?.cat ?? "음식물 혼합배출"} ${n(food?.n ?? 0)}건 다음이 담배꽁초(차량) ${n(cig?.n ?? 0)}건입니다. 후자는 주거 구조와 무관한 도로 현상입니다.`,
      detail: [
        `과태료 과세대상 필드를 분류하면 음식물 혼합배출 ${n(food?.n ?? 0)}건(${fmtKrw(food?.amount ?? 0)}), 담배꽁초(차량) ${n(cig?.n ?? 0)}건(${fmtKrw(cig?.amount ?? 0)}), 규격봉투 미사용 ${n(bag?.n ?? 0)}건, 장소위반(이동배출) ${n(move?.n ?? 0)}건, 시간외 배출 ${n(late?.n ?? 0)}건 순입니다.`,
        "차량 담배꽁초는 주행 중 도로에서 벌어지는 일이라, 무관리주거와 배출환경을 겨냥하는 생활쓰레기 대책과는 원인도 대책도 완전히 다릅니다. 두 현상을 한 지표로 묶어 관리하면 어느 쪽 성과도 읽을 수 없습니다.",
        "생활쓰레기 계열(음식물·봉투·이동·시간외)이 격자 회귀가 설명하려던 본체이고, 담배꽁초(차량)는 간선도로 축에서 따로 관리할 대상(캠페인·차량단속 협조)입니다.",
      ],
      numbers: [
        { k: "음식물 혼합", v: `${n(food?.n ?? 0)}건` },
        { k: "담배꽁초(차량)", v: `${n(cig?.n ?? 0)}건 (${cigShare}%)` },
        { k: "규격봉투 미사용", v: `${n(bag?.n ?? 0)}건` },
      ],
      takeaway: "생활쓰레기 대책과 차량 담배꽁초 대책을 나누고, 지표도 따로 관리해 주세요.",
      viz: { mode: "enf" },
      vizLabel: "지도에서 과태료 분포 보기",
    },
    {
      tag: "처분 퍼널",
      title: `과태료 ${(f.totalAmount / 1e8).toFixed(1)}억, 징수율 ${f.collectionRatePct ?? "—"}%`,
      body: `부과 ${n(f.totalN)}건 가운데 납부 완료가 ${n(f.paidN)}건입니다. 체납은 ${n(f.arrearsN)}건 ${fmtKrw(f.arrearsAmount)}, 감면·감액은 ${n(fun["감면·감액"]?.n ?? 0)}건입니다. 확정 처분 건 기준 납부율은 높습니다.`,
      detail: [
        `부과 총액 ${fmtKrw(f.totalAmount)}(감액 반영 과세금액 기준, 가산금 미포함) 가운데 납부 완료가 ${n(f.paidN)}건 ${fmtKrw(f.paidAmount)}입니다. 감면·진행 건을 뺀 징수율은 ${f.collectionRatePct ?? "—"}%입니다.`,
        `체납 ${n(f.arrearsN)}건 ${fmtKrw(f.arrearsAmount)}은 금액보다 신호가 중요합니다. 상습 체납 지점과 상습 투기 지점이 겹치는지가 다음 분석 과제인데, 지금 데이터에는 체납자 위치가 담겨 있지 않습니다.`,
        "해석: 확정 처분 건 가운데 납부 완료 비율은 높습니다(금액 기준·가산금 포함 징수율과는 다릅니다). 문제는 단속이 발생을 줄인다는 증거가 없다는 쪽입니다(CCTV 철회 참조). 그렇다면 단속 강화보다 배출환경 개입이 먼저입니다.",
      ],
      numbers: [
        { k: "부과 총액", v: `${(f.totalAmount / 1e8).toFixed(2)}억원` },
        { k: "징수율", v: `${f.collectionRatePct ?? "—"}%` },
        { k: "체납", v: `${n(f.arrearsN)}건 · ${fmtKrw(f.arrearsAmount)}` },
      ],
      takeaway: "확정 처분의 납부율은 높습니다. 성과의 병목은 징수가 아니라 발생을 줄일 수단 쪽입니다.",
    },
    {
      tag: "예측 가능성",
      title: "다음 분기 핫스팟은 미리 알 수 있습니다",
      body: `최근성을 가중한 점수 상위 20개 격자를 지난 ${bt.windows.length}개 분기로 검증해 보면, 평균 ${bt.avgPrecision20 ?? "—"}%에서 다음 분기에 실제로 발생했습니다. 무작위보다 ${bt.avgCapture20 && bt.avgRandomCapture ? Math.round(bt.avgCapture20 / bt.avgRandomCapture) : "—"}배 높은 포착률입니다.`,
      detail: [
        `${data.decision.hotspots.method}으로 격자에 순위를 매긴 뒤, ${bt.windows.length}개 분기 시점마다 상위 20곳을 뽑아 이후 90일의 실제 발생과 맞춰 봤습니다.`,
        `상위 20곳 가운데 평균 ${bt.avgPrecision20 ?? "—"}%에서 다음 분기 실제 발생이 있었고, 구 전체 발생의 ${bt.avgCapture20 ?? "—"}%가 이 20곳 안에서 일어났습니다(무작위로 20곳을 고르면 ${bt.avgRandomCapture ?? "—"}%). 같은 자리에서 반복되는 성질(재발률 ${recur}%)이 강해, 복잡한 모형 없이도 예측이 성립합니다.`,
        "활용: 순찰·점검·재배치 대상을 고르는 자원 배분입니다. 인과를 예측하는 것이 아니므로, 개입 효과 판정은 반드시 조치 대장의 사전등록 설계로 하셔야 합니다.",
      ],
      numbers: [
        { k: "백테스트", v: `${bt.windows.length}개 분기 창` },
        { k: "상위 20 적중률", v: `${bt.avgPrecision20 ?? "—"}%` },
        { k: "포착률", v: `${bt.avgCapture20 ?? "—"}% vs 무작위 ${bt.avgRandomCapture ?? "—"}%` },
      ],
      takeaway: "순찰·점검 대상은 운영·전망 탭의 예측 핫스팟 20을 기본값으로 삼아 주세요.",
    },
  ]

  if (r2) {
    const ex = r2.exposure
    const px = r2.proxyCheck
    const lp = r2.v2_100.coef.living_pop
    const unm2 = r2.v2_100.coef.unmanaged_units
    const cb = r2.v2_100.coef.clothbin_n
    const cbc = r2.v2_100_complaints.coef.clothbin_n
    const held = Object.entries(r2.gridSensitivity.v2).filter(([, v]) => v).length
    const total = Object.keys(r2.gridSensitivity.v2).length
    const notHeld = Object.entries(r2.gridSensitivity.v2).filter(([, v]) => !v).map(([kk]) => kk)
    findings.push(
      {
        tag: "노출 통제",
        title: "사람이 많이 머무는 곳이라서가 아닙니다",
        body: `서울시 250m 격자 생활인구를 노출 변수로 넣어도 관리주체 없는 주거 β ${signed(unm2.beta)} 그대로. 생활인구 자체는 β ${signed(lp.beta)}(p=${pText(lp.p)})로 약한 연관입니다.`,
        detail: [
          `"인구가 통제되지 않았다"는 지적에 서울 열린데이터광장 250m 격자 생활인구(${seoul?.livingPop250Month ?? "2026-07"} 시간·일 평균)를 100m 칸에 면적 비례로 나눠 회귀에 넣었습니다(v2, n=${n(r2.v2_100.n)}).`,
          `체류 인구가 많은 칸일수록 적발이 조금 늘지만(β ${signed(lp.beta)}), 관리주체 없는 주거의 계수는 ${signed(unm2.beta)}로 바뀌지 않았습니다. 설명력은 R² ${r2.base100.r2}→${r2.v2_100.r2}입니다.`,
          "해석: 무단투기는 사람이 많이 오가는 만큼 생기는 현상이 아니라, 배출을 관리할 주체가 없는 주거가 몰린 곳에서 생기는 현상이라는 결론이 노출을 통제한 뒤에도 유지됩니다.",
          `주의: 생활인구는 등록인구가 아니라 통신 기반 체류 추정치이고, ${seoul?.livingPop250Month ?? "2026-07"} 한 달 평균입니다. 관측 기간 전체의 노출과 다를 수 있습니다.`,
          ...(ex
            ? [
                `사는 사람 수도 넣었습니다. 국가데이터처 SGIS 100m 격자 총인구(2024 등록센서스, 셀당 최대 ±7 노이즈)를 같은 칸에 붙여 생활인구와 따로, 그리고 같이 넣었습니다. 상주인구만 넣으면 β ${signed(ex.compare.resident_only.resident_pop.beta)}(p=${pText(ex.compare.resident_only.resident_pop.p)}), 둘 다 넣으면 상주인구 β ${signed(ex.compare.both.resident_pop.beta)}(p=${pText(ex.compare.both.resident_pop.p)})로 연관이 없고, 관리주체 없는 주거는 β ${signed(ex.compare.both.unmanaged.beta)}로 유지됩니다. 두 인구 변수의 상관은 ${ex.corrLivingResident.toFixed(2)}, VIF는 최대 ${Math.max(...Object.values(ex.vif)).toFixed(1)}이라 같이 넣어도 됩니다.`,
                `예외 하나는 적어 둡니다. 200m로 합친 뒤 두 인구를 같이 넣으면 공동주택 세대수가 β ${signed(ex.v3_200.coef.apt_hh.beta)}(p=${pText(ex.v3_200.coef.apt_hh.p)})로 유의해집니다. 100m에서는 아닙니다. 격자 크기에 따라 달라지는 변수가 하나 있다는 뜻이라, "아파트는 연관 없음"은 100m 기준 진술로 한정합니다.`,
              ]
            : []),
        ],
        numbers: [
          { k: "무관리주거 β(v2)", v: signed(unm2.beta) },
          { k: "생활인구 β", v: `${signed(lp.beta)} (p=${pText(lp.p)})` },
          ex ? { k: "상주인구 β(v3)", v: `${signed(ex.compare.both.resident_pop.beta)} (p=${pText(ex.compare.both.resident_pop.p)})` } : { k: "R²", v: `${r2.base100.r2} → ${r2.v2_100.r2}` },
        ],
        takeaway: "머무는 사람도 사는 사람도 넣어 봤습니다. 결론은 같습니다. 대책의 겨냥점은 사람 수가 아니라 주거 구조입니다.",
        viz: { mode: "lp" },
        vizLabel: "지도에서 생활인구 바탕에 과태료 겹쳐 보기",
      },
      {
        tag: "통념 검증",
        title: "의류수거함 옆이 온상이라는 말은 단속 자료와 맞지 않습니다",
        body: `광진구 의류수거함 ${n(data.infra.clothBins.length)}곳을 격자에 얹어 보니 단속 적발과는 연관이 없었습니다(β ${signed(cb.beta)}, p=${pText(cb.p)}). 신고 민원과는 약한 양의 연관(β ${signed(cbc.beta)}, p=${pText(cbc.p)})만 있습니다.`,
        detail: [
          `공공데이터포털의 광진구 의류수거함 위치(2026-03, ${n(data.infra.clothBins.length)}곳)를 100m 격자에 배정해 회귀 변수로 넣었습니다. 수거함이 몰린 칸이라고 과태료 적발이 더 많지는 않았습니다.`,
          `신고 민원 기준으로는 β ${signed(cbc.beta)}로 조금 더 들어옵니다. 수거함 주변이 눈에 잘 띄어 신고가 늘었을 수 있고, 실제 배출이 더 많은데 단속이 못 잡는 것일 수도 있습니다. 지금 자료로는 둘을 가를 수 없습니다.`,
          "해석: 통념을 데이터로 재 봤을 때 뒷받침되지 않으면 우선순위를 낮추는 것이 맞습니다. 다만 수거함 밀집 격자에서 시범 정비를 사전등록 설계로 해 보면 어느 쪽인지 판정할 수 있습니다.",
        ],
        numbers: [
          { k: "의류수거함", v: `${n(data.infra.clothBins.length)}곳` },
          { k: "과태료 β", v: `${signed(cb.beta)} (p=${pText(cb.p)})` },
          { k: "민원 β", v: `${signed(cbc.beta)} (p=${pText(cbc.p)})` },
        ],
        takeaway: "의류수거함 정비는 우선순위가 낮습니다. 하려면 시범 격자를 사전등록해 판정부터 하세요.",
        viz: { mode: "comp", layers: ["clothBins"] },
        vizLabel: "지도에서 의류수거함과 민원 분포 보기",
      },
      {
        tag: "격자 검증",
        title: "100m로 잘라서 나온 결과가 아닙니다",
        body: `격자를 200m로 네 배 키워 다시 적합해도 ${total}개 변수 중 ${held}개의 판정이 유지됐습니다. ${["unmanaged_units", "alley_ratio", "dist_arterial"].every((kk) => r2.gridSensitivity.v2[kk]) ? "관리주체 없는 주거·골목·간선 이격은 그대로이고, " : ""}${notHeld.length ? `경계에 걸린 것은 ${notHeld.map((kk) => (kk === "living_pop" ? "생활인구" : kk)).join("·")}뿐입니다` : "달라진 변수가 없습니다"}.`,
        detail: [
          "\"데이터가 100m 단위로 구분되느냐\"는 질문에 대한 답입니다. 민원·과태료는 건별 주소를 좌표로 바꿔 점으로 찍고, 건축물대장은 대지 지번으로 점을 찍어 그 점이 속한 칸에 셉니다. 도로·건물 형태는 OSM 선·면을 칸에 잘라 넣고, 생활인구는 서울시 250m 격자를 면적 비례로 나눕니다. 상주인구는 SGIS 100m 격자를 같은 칸에 그대로 붙입니다.",
          `칸을 100m에서 200m로 합쳐 같은 모형을 다시 돌리면(n=${n(r2.v2_200.n)}) 관리주체 없는 주거 β ${signed(r2.v2_200.coef.unmanaged_units.beta)}, 골목 비율 β ${signed(r2.v2_200.coef.alley_ratio.beta)}, 간선 이격 β ${signed(r2.v2_200.coef.dist_arterial.beta)}로 방향과 유의성이 유지됩니다. 설명력은 R² ${r2.v2_100.r2}→${r2.v2_200.r2}로 올라가는데, 칸이 커지면 점 하나가 경계 바깥 칸으로 떨어지는 잡음이 줄기 때문입니다.`,
          "주의: 100m 격자는 통계청 EPSG:5179 정렬이라 SGIS 인구격자와 좌표로 바로 이어집니다. 격자를 더 잘게(50m) 자르는 검증은 주소 정밀도 한계로 하지 않았습니다.",
        ],
        numbers: [
          { k: "판정 유지", v: `${held}/${total} 변수` },
          { k: "무관리주거 β(200m)", v: signed(r2.v2_200.coef.unmanaged_units.beta) },
          { k: "R² 100m→200m", v: `${r2.v2_100.r2} → ${r2.v2_200.r2}` },
        ],
        takeaway: "격자 크기를 바꿔도 결론이 같습니다. 100m는 분석 단위이지 결론의 원인이 아닙니다.",
        viz: { mode: "overlay" },
        vizLabel: "지도에서 100m 격자 보기",
      },
    )
    if (px) {
      const cc = px.crossCheck
      const sp = px.split
      const ac = cc.apiCompare
      const mand = (cc.mandatory ?? {}) as Record<string, number>
      const kinds = px.ledgerAptKinds.households
      findings.push({
        tag: "대리변수 검증",
        title: "관리주체가 없어서가 아니라, 다가구·단독주택이라서입니다",
        body: `건축물대장 "공동주택" ${n(cc.aptHhTotal)}세대 가운데 관리주체가 실제로 있는 K-apt 등록 단지는 ${n(cc.managedTotal)}세대(${Math.round((cc.managedShareOfAptHh ?? 0) * 100)}%)뿐이었습니다. 세 갈래로 나눠 다시 돌리면 다가구·일반단독 β ${signed(sp.unmanaged_units.beta)}는 그대로이고, 관리주체 없는 다세대·연립은 β ${signed(sp.apt_nokapt.beta)}(p=${pText(sp.apt_nokapt.p)})로 연관이 없습니다.`,
        detail: [
          `지금까지 "관리주체 있는 주거"로 세던 건축물대장 공동주택 세대에는 관리사무소가 없는 다세대 ${n(kinds["다세대"] ?? 0)}세대, 연립 ${n(kinds["연립"] ?? 0)}세대가 섞여 있었습니다. 심사에서 나온 "대리변수 아니냐"는 지적이 맞았습니다.`,
          `국토교통부 K-apt 관리비공개 의무단지 ${px.complexes}단지(${px.asof})의 필지번호를 건축물대장과 조인해 관리주체 실측 세대 ${n(cc.managedTotal)}를 얻었습니다. 공동주택 세대가 있는 ${n(cc.aptCells)}칸 중 K-apt 단지가 있는 칸은 ${n(cc.aptCellsWithKapt)}칸입니다.`,
          `주거를 세 갈래(다가구·일반단독 / K-apt 미등록 공동주택 / K-apt 등록 세대)로 나눠 같은 모형을 돌리면 다가구·일반단독만 β ${signed(sp.unmanaged_units.beta)}(p=${pText(sp.unmanaged_units.p)})로 남고, 나머지 둘은 각각 β ${signed(sp.apt_nokapt.beta)}, β ${signed(sp.managed_kapt.beta)}로 0에 가깝습니다. 무관리 정의를 K-apt 미등록 전체로 넓히면 β는 ${signed(px.compare.unmanaged_v4.beta)}로 묽어집니다.`,
          "해석: 발생과 같이 움직이는 것은 \"관리사무소 부재\" 일반이 아니라 다가구·단독주택 밀집입니다. 소유자 한 명이 여러 세입자에게 임대하는 구조, 배출 장소가 대문 앞 골목인 구조가 후보이지만 이 자료로는 어느 쪽인지 가를 수 없습니다. 대책의 겨냥점은 \"관리주체 없는 주거\"보다 \"다가구·단독 밀집 골목\"으로 좁혀야 합니다.",
          `주의: K-apt 등록에는 자발 등록 단지가 섞여 있고, ${px.unmatched}단지는 대장과 조인되지 않았습니다. 의무관리 기준은 300세대 이상, 150세대 이상이면서 승강기나 중앙난방이 있는 단지 등입니다.`,
          ...(ac && px.apiSensitivity
            ? [
                `외부 대조(4라운드): 국토교통부 공동주택 기본정보 API가 주는 단지별 세대수를 대장 조인값과 하나씩 맞춰 보니, 세대수가 있는 ${ac.complexesWithApi - ac.apiHouseholdsZero}단지 중 ${ac.exact}단지가 정확히 같고 ${ac.over5pct}단지가 5% 넘게 달랐습니다(최대 ${n(ac.maxAbsDiff ?? 0)}세대. 대장 세대수가 0인 오피스텔형이거나 필지가 나뉜 단지). 의무관리 기준을 채운 단지 ${mand.mandatory ?? 0}곳, 자발 등록 ${mand.voluntary ?? 0}곳입니다. API 세대수로 바꿔 끼워도 다가구·일반단독 β ${signed(px.apiSensitivity.unmanaged_units.beta)}, K-apt 등록 β ${signed(px.apiSensitivity.managed_kapt.beta)}로 결론이 같습니다.`,
              ]
            : []),
        ],
        numbers: [
          { k: "K-apt 등록 세대 비율", v: `${Math.round((cc.managedShareOfAptHh ?? 0) * 100)}% (${n(cc.managedTotal)}/${n(cc.aptHhTotal)})` },
          { k: "다가구·단독 β", v: `${signed(sp.unmanaged_units.beta)} (p=${pText(sp.unmanaged_units.p)})` },
          { k: "다세대·연립 β", v: `${signed(sp.apt_nokapt.beta)} (p=${pText(sp.apt_nokapt.p)})` },
        ],
        takeaway: "대리변수 지적은 맞았고, 결론은 더 좁아졌습니다. 겨냥점은 다가구·단독주택 밀집 골목입니다.",
        viz: { mode: "unm" },
        vizLabel: "지도에서 무관리 주거 밀도 보기",
      })
    }
  }

  if (pm) {
    const top3 = pm.byDong.slice(0, 3)
    findings.push({
      tag: "구조 전망",
      title: `관리가 취약한 주거 ${n(pm.guTotal.smallAptUnits12m)}세대가 지금 지어지고 있습니다`,
      body: `최근 12개월 신축 허가 가운데 소형 공동주택(150세대 미만, 의무관리 기준 미달)이 ${pm.guTotal.smallAptPermits12m}건 ${n(pm.guTotal.smallAptUnits12m)}세대입니다. ${top3.map((r) => r.dong.replace(/동$/, "")).join("·")}에 몰려 있습니다.`,
      detail: [
        `건축HUB 인허가 실측(${pm.asof} 조회) 결과, 사용승인 전 진행 중인 허가 ${n(pm.guTotal.inProgress)}건 가운데 최근 12개월 신축만 봐도 소형 공동주택 ${pm.guTotal.smallAptPermits12m}건 ${n(pm.guTotal.smallAptUnits12m)}세대에 단독·다가구 ${pm.guTotal.detachedPermits12m}건이 더해집니다. ${top3.map((r) => `${r.dong} ${n(r.smallAptUnits)}세대`).join(", ")} 순입니다.`,
        "이 소형 주택들은 공동주택관리법 의무관리 기준(150세대)에 못 미쳐 관리사무소와 경비, 공동 배출장이 없는 경우가 많습니다. 다만 대리변수 검증 카드에서 K-apt 미등록 공동주택(다세대·연립·소형)은 과태료와 연관이 없었으므로, 이 물량이 곧 발생 증가를 뜻하지는 않습니다. 겨냥점과 직접 닿는 것은 단독·다가구 허가 쪽입니다.",
        "활용: 준공과 입주 시점에 맞춰 배출안내를 동봉하거나 공동배출을 협의할 후보 지역을 미리 고를 수 있습니다. 인과 예측이 아니라 주거 구조가 어느 쪽으로 움직이는지를 읽는 전망입니다.",
      ],
      numbers: [
        { k: "소형 공동주택 허가", v: `${pm.guTotal.smallAptPermits12m}건 · ${n(pm.guTotal.smallAptUnits12m)}세대` },
        { k: "단독·다가구", v: `${pm.guTotal.detachedPermits12m}건` },
        { k: "집중 지역", v: top3.map((r) => r.dong.replace(/동$/, "")).join("·") },
      ],
      takeaway: "신축 준공 시점에 배출안내를 미리 넣으면 위험 물량이 늘기 전에 선제 대응할 수 있습니다.",
    })
  }

  return findings
}
