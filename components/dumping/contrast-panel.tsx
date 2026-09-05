"use client"

import { useMemo, useState } from "react"
import type { DumpingMapData, OntoGraph } from "@/lib/dumping/types"
import { channelGrowth, collinearRange, fmtRatio, regressionBetas } from "@/lib/dumping/facts"
import ModalShell from "./modal-shell"
import QaChart, { chartTitle, type ChartKind } from "./qa-chart"

// 기존 해석 vs 이 분석. 통념이나 초기 분석이 말하던 것과 데이터가 말하는 것을 나란히 놓는다.
// 왼쪽은 흐리게(지운 결론), 오른쪽은 강조. 수치는 전부 map.json·graph.json에서 파생하고,
// export에 없는 철회 전 값(−0.772·41,633)만 README 정본을 적는다. 차트는 물어보기 탭과 같은 QaChart.

interface Pair {
  k: string // 한 줄 주제
  before: string // 통념·초기 분석
  beforeTag: "통념" | "이 팀의 초기 분석" | "원자료" // 냉독이 "초기 분석"을 외부 비판으로 읽어 주체를 밝혔다
  after: string // 이 분석
  chart?: ChartKind
}

function buildPairs(data: DumpingMapData, graph: OntoGraph): Pair[] {
  const g = channelGrowth(data)
  const b = regressionBetas(graph)
  const beta = (id: string) => b.find((x) => x.id === id)
  const s = (v?: number) => (v == null ? "미산출" : `${v > 0 ? "+" : "−"}${Math.abs(v).toFixed(3)}`)
  const cctv = graph.edges.find((e) => e.f === "lev-cctv-mobile" && e.rel === "lowers")?.props
  const didSym = Number(cctv?.did_symmetric ?? 0.221)
  const cov = graph.nodes.find((n) => n.id === "cov-did-cctv")?.props
  const didOld = Number(cov?.coefficient ?? -0.772)
  const pOld = Number(cov?.p_value ?? 0.0485)
  const unmUnits = /다가구·단독 ([\d,]+)/.exec(String(graph.nodes.find((x) => x.id === "ev-ledger")?.label ?? ""))?.[1] ?? "43,871"
  const rhoY = Number(graph.nodes.find((n) => n.id === "cov-youth")?.props.rho ?? 0.846)
  const r2 = data.decision.regressionV2
  const k = data.decision.kpi
  const extra: Pair[] = r2
    ? [
        {
          k: "인구 노출",
          beforeTag: "통념",
          before: "사람이 많이 오가는 곳이니 많이 생긴다. 인구를 넣으면 결론이 바뀔 것이다.",
          after: r2.exposure
            ? `생활인구(체류)와 상주인구(SGIS 등록센서스)를 같이 넣어도 다가구·단독 밀집 β ${s(r2.exposure.compare.both.unmanaged.beta)} 유지. 생활인구 β ${s(r2.exposure.compare.both.living_pop.beta)}, 상주인구 β ${s(r2.exposure.compare.both.resident_pop.beta)}(p=${r2.exposure.compare.both.resident_pop.p.toFixed(2)}).`
            : `서울시 250m 생활인구를 넣어도 다가구·단독 밀집 β ${s(r2.v2_100.coef.unmanaged_units.beta)} 그대로. 생활인구 자체는 β ${s(r2.v2_100.coef.living_pop.beta)}(p=${r2.v2_100.coef.living_pop.p.toFixed(3)}).`,
          chart: "beta",
        },
        ...(r2.proxyCheck
          ? [
              {
                k: "관리주체 대리변수",
                beforeTag: "이 팀의 초기 분석" as const,
                before: "건축물대장 공동주택은 관리주체가 있고 다가구·단독은 없다. 관리주체 부재가 발생을 설명한다.",
                after: `K-apt 등록 세대는 대장 공동주택의 ${Math.round((r2.proxyCheck.crossCheck.managedShareOfAptHh ?? 0) * 100)}%뿐. 세 갈래로 나누면 다가구·단독 β ${s(r2.proxyCheck.split.unmanaged_units.beta)}만 남고 관리사무소 없는 다세대·연립은 β ${s(r2.proxyCheck.split.apt_nokapt.beta)}로 연관 없음. 겨냥점은 다가구·단독 밀집.`,
              },
            ]
          : []),
        {
          k: "의류수거함",
          beforeTag: "통념",
          before: "의류수거함 옆이 무단투기 온상이다. 수거함부터 정비하자.",
          after: `수거함 ${data.infra.clothBins.length}곳을 격자에 얹어 보니 단속 적발과 연관 없음(β ${s(r2.v2_100.coef.clothbin_n.beta)}, p=${r2.v2_100.coef.clothbin_n.p.toFixed(2)}). 신고만 약간 더 들어온다(β ${s(r2.v2_100_complaints.coef.clothbin_n.beta)}).`,
        },
        {
          k: "격자 크기",
          beforeTag: "통념",
          before: "100m로 잘게 잘라서 그런 결과가 나온 것 아닌가.",
          after: `200m로 합쳐 다시 돌려도 다가구·단독 밀집 β ${s(r2.v2_200.coef.unmanaged_units.beta)}, 골목 β ${s(r2.v2_200.coef.alley_ratio.beta)}. 판정 유지 ${Object.values(r2.gridSensitivity.v2).filter(Boolean).length}/${Object.keys(r2.gridSensitivity.v2).length} 변수.`,
        },
        {
          k: "상습 지역 수",
          beforeTag: "이 팀의 초기 분석",
          before: `집중관리 상습격자 ${k.criticalCellsNow}곳. 신고편향과 무관한 성과지표.`,
          after: `앱 민원을 빼고 세면 ${k.criticalCellsNowNoApp}곳. 앱 보급이 KPI도 부풀린다. 앱 제외판을 성과 기준으로.`,
        },
      ]
    : []
  return [
    {
      k: "민원이 늘었다",
      beforeTag: "통념",
      before: `${g.baseYear}년보다 민원이 ${fmtRatio(g.total)}. 무단투기가 두 배로 나빠졌다.`,
      after: `앱 신고만 ${fmtRatio(g.app)}, 120·직접 신고는 ${fmtRatio(g.fixed)}. 과태료는 ${fmtRatio(g.fines)}, 신고와 독립인 순찰 적발만 봐도 ${fmtRatio(g.finesPatrol)}로 오히려 줄었다. 늘어난 건 신고 창구다.`,
      chart: "yearly",
    },
    {
      k: "과태료는 실측인가",
      beforeTag: "이 팀의 초기 분석",
      before: "과태료는 신고 성향과 상관없는 단속 실측이다.",
      after: `원자료 적발 경로를 보니 ${100 - g.patrolSharePct}%가 신고 유래. 신고와 독립인 건 순찰(수시) ${g.patrolSharePct}%뿐이고 그 계열도 ${fmtRatio(g.finesPatrol)}. 문구를 고쳤다.`,
    },
    {
      k: "CCTV 효과",
      beforeTag: "이 팀의 초기 분석",
      before: `발생 이력이 있는 곳에 설치하면 3개월 ${Math.abs(didOld).toFixed(2)}건 감소(p=${pOld.toFixed(3)}). 효과 있음.`,
      after: `비교 대상에 같은 조건을 걸자 그쪽도 줄었다. 대칭 설계 ${s(didSym)}(p>0.5). 효과 확인 안 됨, 주장 철회.`,
      chart: "did",
    },
    {
      k: "어디에 버리나",
      beforeTag: "통념",
      before: "사람 눈을 피해 으슥한 골목에 버린다. CCTV는 골목 안쪽에.",
      after: `골목 비율 β ${s(beta("cov-alley")?.beta)}, 큰길 이격 β ${s(beta("cov-arterial")?.beta)}. 오히려 생활동선 위에서 생긴다.`,
      chart: "beta",
    },
    {
      k: "누가 많이 버리나",
      beforeTag: "통념",
      before: "사람이 많은 곳(큰 아파트 단지)에서 많이 나온다.",
      after: `공동주택 세대수 β ${s(beta("cov-apt")?.beta)}(연관 미확인). 다가구·단독 밀집 β ${s(beta("cov-unmanaged")?.beta)}. 사람 수가 아니라 주거 구조다.`,
      chart: "beta",
    },
    {
      k: "대책의 방향",
      beforeTag: "통념",
      before: `청년·외국인·1인세대가 많이 버린다(ρ ${rhoY.toFixed(2)}). 사람을 계도하면 된다.`,
      after: `네 요인은 상관 ${collinearRange(graph)}로 한 덩어리라 누구를 지목할 수 없다. 겨냥할 것은 사람이 아니라 다가구·단독 골목의 배출 환경.`,
    },
    {
      k: "원자료 그대로",
      beforeTag: "원자료",
      before: "대장에 '다가구'라 적힌 건만 세면 다가구·단독 주거단위 41,633.",
      after: `'단독주택'으로 적혔지만 가구수 2 이상인 562동을 교차검증으로 찾아 ${unmUnits}(+5.4%). 계수 변화는 ±0.007.`,
    },
    ...extra,
  ]
}

export default function ContrastPanel({ data, graph }: { data: DumpingMapData; graph: OntoGraph }) {
  const pairs = useMemo(() => buildPairs(data, graph), [data, graph])
  const [chart, setChart] = useState<ChartKind | null>(null)
  return (
    <section>
      <h3 className="mb-2 text-sm font-semibold tracking-wide text-[var(--cp-text-dim)]">
        기존 해석 vs 이 분석 · 데이터가 뒤집은 것 {pairs.length}
      </h3>
      <div className="flex flex-col gap-1.5">
        {pairs.map((p) => (
          <div key={p.k} className="rounded-lg border border-[var(--cp-border)] bg-[var(--cp-panel)] p-2.5">
            <p className="mb-1.5 text-[12.5px] font-bold text-[var(--cp-text-strong)]">{p.k}</p>
            <div className="grid grid-cols-[1fr_auto_1fr] items-stretch gap-1.5">
              <div className="rounded-lg border border-dashed border-[var(--cp-border)] px-2 py-1.5">
                <span className="mb-0.5 inline-block rounded bg-[var(--cp-hover2)] px-1.5 py-0.5 text-[10.5px] font-semibold text-[var(--cp-text-dim)]">
                  {p.beforeTag}
                </span>
                <p className="text-[12.5px] leading-snug text-[var(--cp-text-muted)] line-through decoration-[var(--cp-border-strong)] decoration-1">
                  {p.before}
                </p>
              </div>
              <span className="self-center text-[14px] text-[var(--cp-text-faint)]" aria-hidden>
                →
              </span>
              <div className="rounded-lg bg-[#0c6155]/8 px-2 py-1.5">
                <span className="mb-0.5 inline-block rounded bg-[#0c6155] px-1.5 py-0.5 text-[10.5px] font-semibold text-white">이 분석</span>
                <p className="text-[12.5px] font-medium leading-snug text-[#0a4a41]">{p.after}</p>
              </div>
            </div>
            {p.chart && (
              <button
                onClick={() => setChart(p.chart!)}
                className="mt-1.5 text-[12px] font-medium text-[#0c6155] hover:underline"
              >
                차트로 보기 +
              </button>
            )}
          </div>
        ))}
      </div>
      {chart && (
        <ModalShell size="xl" zIndex={2100} title={chartTitle(chart, data)} onClose={() => setChart(null)}>
          <QaChart kind={chart} data={data} graph={graph} />
        </ModalShell>
      )}
    </section>
  )
}
