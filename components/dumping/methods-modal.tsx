"use client"

import { useState } from "react"
import type { DumpingMapData, OntoGraph } from "@/lib/dumping/types"
import { channelGrowth, collinearRange, finesCensorNote, finesDirection, fmtRatio, graphSize, regressionBetas, sampleSizes, summarize } from "@/lib/dumping/facts"
import ModalShell from "./modal-shell"

// 데이터·분석 방법 안내 — 두 섹션으로 구성.
// [쓰인 데이터] 구청 제공 자료와 직접 수집한 공개 데이터를 출처별로 구분해 보여준다.
// [분석 방법] 통계 모델·방법론 해설 — 일반 직원도 읽을 수 있게 "쉽게 말하면"을 앞세운다.
// 수치는 map.json·graph.json에서 뽑고(데이터 갱신 시 자동 반영), 거기 없는 것만 gwangjin-dumping/README.md 확정치를 인용한다.

interface Dataset {
  name: string
  scale: string // 규모·기간 — 한눈에 크기 감 잡기용
  use: string // 이 분석에서 어디에 썼는지
}

const n = (v: number) => v.toLocaleString()

// 구청 내부 행정자료 (청소과·동주민센터 제공)
const provided = (data: DumpingMapData): Dataset[] => {
  const s = summarize(data)
  return [
    {
      name: "민원 접수 내역",
      scale: `${n(s.complaints)}건 · ${s.period.label}`,
      use: "발생 분포 지도, 신고 채널 분해, 처리 소요(SLA) 계산의 바탕",
    },
    {
      name: "과태료 부과 내역",
      scale: `${n(data.decision.fines.totalN)}건 · ${s.finesPeriod.label} 위반분`,
      use: `단속 적발 기록(적발 경로 신고 유래 ${100 - channelGrowth(data).patrolSharePct}% · 순찰 ${channelGrowth(data).patrolSharePct}%). 회귀분석의 결과지표, 품목 분해·징수 퍼널`,
    },
    {
      name: "CCTV 현황 (고정·이동식)",
      scale: `고정 ${data.infra.cctvFixed.length}개소 · 이동식 ${data.infra.cctvMobile.length}대`,
      use: "배치 지도 레이어, 이동식 CCTV 효과 검증(DID)의 설치 정보",
    },
    {
      name: "재활용정거장 설치현황",
      scale: `${n(data.infra.recycling.length)}곳`,
      use: "배치 지도 레이어. 설치·철거 변이가 없어 효과 판정은 불가",
    },
    {
      name: "가로쓰레기통 설치현황",
      scale: `${data.infra.bins.length}개`,
      use: "배치 지도 레이어",
    },
    {
      name: "도로청소 종합계획 (2026)",
      scale: "청소차 17대 · 노선 39.3km",
      use: "청소차 관리노선 레이어(집중 10.6km·일반 28.7km), 운영 주기 정보",
    },
  ]
}

// 공개 데이터에서 분석팀이 직접 수집
const collected = (data: DumpingMapData, topBeta: string, ledgerRows: number): Dataset[] => [
  {
    name: "건축물대장 표제부",
    scale: `${Number.isFinite(ledgerRows) ? n(ledgerRows) : "—"}동 · 국토부 건축HUB`,
    use: `무관리 주거단위 밀도 계산 — 최강 예측변수(β ${topBeta})의 원천`,
  },
  {
    name: "등록인구 (연령·동별)",
    scale: `KOSIS · ${data.dong.length}개 행정동 × 연도`,
    use: "천명당 환산, 청년 20-34·외국인 비율 요인",
  },
  {
    name: "주민등록 세대 구성",
    scale: "행정안전부 · 세대원수별",
    use: "1인세대 비율 요인",
  },
  {
    name: "건물·도로·상권(POI)",
    scale: "OpenStreetMap",
    use: "골목 비율·간선 이격거리 계산(은폐 가설 검정), 상권 통제 변수",
  },
  {
    name: "행정동 경계",
    scale: "행안부 KIKcd_H (admdongkor)",
    use: "동 경계 지도, 동별 집계의 기준",
  },
  {
    name: "날씨 일별 관측",
    scale: `Open-Meteo · ${summarize(data).period.label}`,
    use: "계절·기온·강수 요인 조인",
  },
  {
    name: "건축 인허가 파이프라인",
    scale: `건축HUB · ${data.decision.permits?.window ?? "최근 12개월"}`,
    use: "구조 전망 — 소형 공동주택·다가구 신축 흐름(관리 취약 주거의 증감 방향)",
  },
]

// 서울 열린데이터광장·공공데이터포털에서 직접 수집 — 25개 구 어디서나 같은 원천으로 재현된다
const seoulOpen = (data: DumpingMapData): Dataset[] => {
  const sx = data.decision.seoul
  const r2 = data.decision.regressionV2
  if (!sx) return []
  return [
    { name: "행정동 생활인구 (내국인·장기체류 외국인)", scale: `OA-14991·14992 · ${sx.livingPopWindow} 월별`, use: "동별 체류 인구 대비 발생률(발견 탭·브리핑). 등록인구가 놓치는 유동 인구 노출" },
    { name: "250M격자 생활인구 + 격자 SHP", scale: `OA-22784 · ${sx.livingPop250Month} 일별 31일`, use: `100m 격자 노출 변수(v2 회귀 β ${r2 ? (r2.v2_100.coef.living_pop.beta > 0 ? "+" : "") + r2.v2_100.coef.living_pop.beta : "—"}), 지도 바탕 "생활인구"` },
    { name: "광진구 의류수거함 위치", scale: `공공데이터포털 15109594 · ${data.infra.clothBins.length}곳`, use: "\"수거함 옆이 온상\" 통념 검증(v2 회귀), 지도 레이어" },
    { name: "자치구 목적별 CCTV 설치현황", scale: `OA-2722 · ${sx.cctv.asof}`, use: "25개 구 무단투기 CCTV 비교(연계분), 운영 탭 서울 맥락" },
    { name: "스마트 불편신고 분야별 신고 현황", scale: `OA-12051 · 2012-08~ 월별`, use: "서울 전체 앱 청소 신고 추세 — 앱 확산이 광진만의 현상이 아님을 확인" },
    { name: "가로쓰레기통 설치정보", scale: `OA-15069 · 2025-11`, use: `구청 장부(${data.meta?.binSites ?? "—"}개 위치) 교차검증` },
  ]
}

interface Method {
  name: string
  easy: string // 쉽게 말하면 — 비유 중심 한두 문장
  here: string // 이 분석에서 한 일과 결과
  caution?: string
}

const signed = (v: number) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toFixed(3)}`

const methods = (data: DumpingMapData, graph: OntoGraph | null): Method[] => {
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
  return [
    {
      name: "100m 격자 결합",
      easy: `구 전체를 100m 바둑판(회귀 표본 ${n(sz.gridN)}칸)으로 나누고, 민원·과태료·건축물대장·도로·생활인구를 모두 같은 칸 위에 얹었습니다. 서로 다른 자료를 한 지도에서 비교할 수 있게 만드는 기초 작업입니다.`,
      here: `자료마다 칸에 넣는 방식이 다릅니다. 민원 ${n(s.complaints)}건·과태료 ${n(data.decision.fines.totalN)}건은 건별 주소를 좌표로 바꿔 점이 속한 칸에, 건축물대장 ${Number.isFinite(sz.ledgerRows) ? n(sz.ledgerRows) : "—"}동은 대지 지번 좌표로, 도로·건물 형태는 OSM 선·면을 칸 경계로 잘라, 서울시 생활인구는 250m 격자를 면적 비례로 나눠 넣었습니다. 등록인구는 동 단위뿐이라 격자 회귀에는 들어가지 않고 동별 지표에만 씁니다.`,
      caution: `"100m로 나눠서 그런 결과가 나온 것 아니냐"는 물음에는 격자를 200m로 합쳐 다시 적합한 결과로 답합니다(격자 검증 카드). 판정 유지 ${data.decision.regressionV2 ? `${Object.values(data.decision.regressionV2.gridSensitivity.v2).filter(Boolean).length}/${Object.keys(data.decision.regressionV2.gridSensitivity.v2).length}` : "—"} 변수. 격자는 통계청 EPSG:5179 정렬이라 SGIS 인구격자·서울시 250m 격자와 좌표로 바로 이어집니다.`,
    },
    {
      name: "다중회귀 분석 (표준화 β)",
      easy: '여러 요인이 섞여 있을 때 각 요인의 영향을 갈라내는 계산입니다. "가게가 많아서인가, 관리가 없어서인가"를 한꺼번에 넣고 따로 재는 것이고, β는 그 영향의 크기입니다.',
      here: `격자 ${n(sz.gridN)}칸에서 과태료 건수를 종속변수로 놓고 분석해 보니, 관리주체 없는 주거 밀도가 β ${unm ? signed(unm.beta) : "+0.312"}로 가장 컸고 공동주택 세대수는 연관 확인 안 됨(p=${apt ? apt.p.toFixed(3) : "0.708"}), 골목 비율은 오히려 음수(${alley ? signed(alley.beta) : "−0.222"})였습니다.`,
      caution:
        `표준오차 계산을 세 가지(이분산 보정, 군집 보정, wild bootstrap)로 바꾸고 음이항 모형으로도 적합해 판정이 유지될 때만 채택했습니다. 기준 모형에 인구 변수는 없었고, v2 모형은 서울시 250m 생활인구를 노출 변수로 더했습니다(생활인구 β ${data.decision.regressionV2 ? (data.decision.regressionV2.v2_100.coef.living_pop.beta > 0 ? "+" : "") + data.decision.regressionV2.v2_100.coef.living_pop.beta : "—"}, 무관리주거는 그대로). 관리주체 없는 주거는 건축물대장 대리변수이고, 조건부 연관이지 인과를 증명한 것은 아닙니다.`,
    },
    {
      name: "이중차분(DID)과 이벤트 스터디",
      easy: "CCTV를 설치한 곳과 아직 설치하지 않은 곳을 전후로 비교해 효과를 재는 방법입니다. 여기에는 중요한 함정이 하나 있습니다. 원래 많이 발생하던 곳은 아무것도 하지 않아도 저절로 줄어드는 경향(평균회귀)이 있어서, 비교를 잘못 짜면 없는 효과가 있어 보입니다.",
      here: "초기 분석은 감소 효과가 있다고 봤지만, 비교 대상에 같은 조건을 걸어 다시 분석하니 그쪽도 똑같이 줄었습니다. 감소분이 평균회귀로 설명돼, 선택 규칙과 대조군 정의에 민감한 효과 주장을 철회했습니다. 설치 전후를 월 단위로 펼쳐 본 이벤트 스터디(관측 22,247행)에서도 유의한 시점은 없었습니다.",
      caution: "이 철회 경험이 조치 대장(개입 사전등록) 원칙의 근거입니다. 효과 평가는 실행 전에 설계부터 등록합니다.",
    },
    {
      name: "신고 채널 분해",
      easy: "민원이 늘었다고 해서 발생이 는 것은 아닙니다. 신고 창구(앱·120·직접)별로 나눠 보면 무엇이 늘었는지가 드러납니다.",
      here: `민원 ${fmtRatio(cg.total)} 증가를 나눠 보니 앱만 ${fmtRatio(cg.app)}였고 120·직접은 ${fmtRatio(cg.fixed)}였습니다. 과태료 부과는 ${fmtRatio(cg.fines)}로 오히려 ${finesDirection(cg)}고, 신고와 무관한 순찰(수시) 적발만 봐도 ${fmtRatio(cg.finesPatrol)}이니, 늘어난 부분은 대부분 앱 보급 효과로 봅니다.`,
      caution: `배율은 ${cg.basis}한 값입니다. 과태료의 ${100 - cg.patrolSharePct}%는 신고를 받아 나간 것이라 "신고와 무관한 실측"은 아닙니다. ${finesCensorNote(data)}.`,
    },
    {
      name: "핫스팟 점수와 백테스트",
      easy: `최근에 생긴 일일수록 가중치를 높여(90일이 지나면 절반) 격자마다 점수를 매기고, 점수가 높은 지역을 다음 분기 관리 대상으로 뽑습니다. 믿을 만한지는 과거 시점으로 돌아가 확인합니다. 작년 이맘때 이 방법으로 뽑았다면 실제로 맞았을지를 ${bt.windows.length}개 분기에 걸쳐 반복 채점했습니다.`,
      here: `상위 20곳 가운데 평균 ${bt.avgPrecision20 ?? "—"}%에서 다음 분기 실제 발생이 있었고, 구 전체 발생의 ${bt.avgCapture20 ?? "—"}%가 이 20곳 안에서 일어났습니다(아무 곳이나 20곳을 찍으면 ${bt.avgRandomCapture ?? "—"}%입니다).`,
    },
    {
      name: "홀트윈터스 수요 전망",
      easy: "월별 접수의 수준과 추세, 계절 반복(여름에 많고 겨울에 적은 흐름)을 학습해 다음 달을 내다보는 시계열 모형입니다.",
      here: `매달 그 이전 자료로만 모수를 고르고 다음 달을 맞히는 롤링 원점 검증(${fc.window})에서 평균 오차 ${fc.mapePct}%, 전년 동월로 찍는 기준모형은 ${fc.naiveMapePct ?? "—"}%였습니다. 80% 예측구간 적중률은 ${fc.coverage80Pct ?? "—"}%입니다. 인력과 순찰 배치를 위한 행정수요 전망으로만 씁니다.`,
      caution: `신고 접수량 전망이지 발생량 예측이 아닙니다. 모수 선택 구간과 평가 구간을 분리해 모수 선택에서 오는 낙관 편향은 제거했지만, 평가 표본이 ${fc.rows?.length ?? "—"}개월뿐이라 오차 추정 자체의 불확실성은 큽니다.`,
    },
    {
      name: "온톨로지 (지식그래프)",
      easy: '데이터셋·증거·주장·지표·대책을 점으로 놓고, 그 사이 관계(뒷받침한다, 겨냥한다)를 선으로 이은 지식 지도입니다. 표로는 확인할 수 없는 질문, 이를테면 "연관 요인 가운데 대책이 없는 것은?" 같은 물음을 기계적으로 던질 수 있습니다.',
      here: `${g ? `${g.nodes}개 지식과 ${g.edges}개 연결로` : "지식과 연결로"} 구성했습니다. 청년·외국인·1인세대 요인에 대응 수단이 없다는 빈칸이 여기서 드러나, 다국어 안내와 전입 시점 안내 등 신규 대책 세 가지가 나왔습니다.`,
    },
    {
      name: "검증 하네스와 한계 공개",
      easy: "결론을 내기 전에 통계의 전제 조건이 실제로 성립하는지 따로 검사하고, 어긋난 것은 숨기지 않고 적었습니다.",
      here: `잔차 정규성·등분산성·공간 독립성 위배를 확인해 보정 모형을 함께 돌렸고, 청년·외국인·1인세대·무관리주거가 상관 ${col}로 얽혀 있어 무엇이 진짜 요인인지 갈라낼 수 없다는 한계를 밝혀 두었습니다. 어느 하나를 원인으로 지목하는 해석은 피해야 합니다.`,
    },
  ]
}

type Section = "data" | "methods"

function DatasetGroup({
  badge,
  badgeCls,
  title,
  desc,
  items,
}: {
  badge: string
  badgeCls: string
  title: string
  desc: string
  items: Dataset[]
}) {
  return (
    <section className="rounded-xl border border-[var(--cp-border)] p-3">
      <div className="mb-1 flex items-center gap-2">
        <span className={`rounded px-1.5 py-0.5 text-[12px] font-bold ${badgeCls}`}>{badge}</span>
        <h3 className="text-[15px] font-bold text-[var(--cp-text-strong)]">{title}</h3>
      </div>
      <p className="mb-2.5 text-[13px] leading-relaxed text-[var(--cp-text-dim)]">{desc}</p>
      <div className="flex flex-col">
        {items.map((d) => (
          <div key={d.name} className="border-t border-[var(--cp-border-faint)] py-2 first:border-t-0">
            <p className="flex flex-wrap items-baseline gap-x-2 text-[14px]">
              <b className="text-[var(--cp-text-strong)]">{d.name}</b>
              <span className="font-mono text-[12.5px] text-[var(--cp-text-dim)]">{d.scale}</span>
            </p>
            <p className="mt-0.5 text-[13.5px] leading-relaxed text-[var(--cp-text-muted)]">{d.use}</p>
          </div>
        ))}
      </div>
    </section>
  )
}

export default function MethodsModal({
  open,
  data,
  graph,
  onClose,
}: {
  open: boolean
  data: DumpingMapData | null
  graph: OntoGraph | null
  onClose: () => void
}) {
  const [section, setSection] = useState<Section>("data")
  if (!open || !data) return null
  const betas = graph ? regressionBetas(graph) : []
  const topBeta = betas[0] ? signed(betas[0].beta) : "+0.312"
  const ledgerRows = graph ? sampleSizes(data, graph).ledgerRows : NaN
  const rp = data.meta?.reproduce
  return (
    <ModalShell
      title="데이터·분석 방법"
      sub="무엇을 근거로 어떻게 계산했는지, 통계를 모르는 분도 읽을 수 있게 정리했습니다"
      onClose={onClose}
    >
      {/* 섹션 전환 — 데이터 출처와 방법론을 나란히 확인 */}
      <div className="mb-3 flex gap-1 rounded-lg bg-[var(--cp-hover)] p-1">
        {(
          [
            { id: "data", label: "쓰인 데이터" },
            { id: "methods", label: "통계 방법" },
          ] as { id: Section; label: string }[]
        ).map((s) => (
          <button
            key={s.id}
            onClick={() => setSection(s.id)}
            className={`flex-1 rounded-md py-1.5 text-[14px] font-semibold transition-colors ${
              section === s.id
                ? "bg-white text-[var(--cp-text-strong)] shadow-sm"
                : "text-[var(--cp-text-dim)] hover:text-[var(--cp-text)]"
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      {section === "data" ? (
        <div className="flex flex-col gap-3">
          <DatasetGroup
            badge="구청 제공"
            badgeCls="bg-[#8a530e]/12 text-[#8a530e]"
            title={`구청 내부 행정자료 ${provided(data).length}종`}
            desc="청소과·동주민센터가 제공한 원자료. 외부에 공개되지 않은 내부 장부로, 개인정보는 삭제된 상태로 받았습니다."
            items={provided(data)}
          />
          <DatasetGroup
            badge="직접 수집"
            badgeCls="bg-[#0c6155]/12 text-[#0c6155]"
            title={`공개 데이터 직접 수집 ${collected(data, topBeta, ledgerRows).length}종`}
            desc="누구나 접근할 수 있는 공공 API·공개 지도에서 분석팀이 수집해 격자에 결합했습니다."
            items={collected(data, topBeta, ledgerRows)}
          />
          {seoulOpen(data).length > 0 && (
            <DatasetGroup
              badge="서울시"
              badgeCls="bg-[#1c4f96]/12 text-[#1c4f96]"
              title={`서울 열린데이터광장·공공데이터포털 ${seoulOpen(data).length}종`}
              desc="서울시가 공개한 원천으로, 25개 자치구 어디서나 같은 방식으로 재현할 수 있는 층입니다. 2026-09-05 수집."
              items={seoulOpen(data)}
            />
          )}
          <p className="text-[12.5px] leading-relaxed text-[var(--cp-text-faint)]">
            원자료의 컬럼 사전과 입력·산출물·코드 파일 해시(SHA-256) {rp?.hashes ?? "—"}개는 재현 패키지(REPRODUCE)에 고정돼 있으며,
            verify.py가 해시 대조와 핵심 수치 {rp?.numbers ?? "—"}개 재계산을 합니다. 회귀·DID·전망 오차의 재추정은 개별 스크립트로 가능하지만
            verify.py의 범위는 아닙니다.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {methods(data, graph).map((m, i) => (
            <section key={m.name} className="rounded-xl border border-[var(--cp-border)] p-3">
              <h3 className="flex items-baseline gap-2 text-[15px] font-bold text-[var(--cp-text-strong)]">
                <span className="font-mono text-[13px] text-[var(--cp-text-faint)]">
                  {String(i + 1).padStart(2, "0")}
                </span>
                {m.name}
              </h3>
              <p className="mt-1.5 text-[14px] leading-relaxed text-[var(--cp-text-muted)]">
                <b className="text-[#0a4a41]">쉽게 말하면</b> · {m.easy}
              </p>
              <p className="mt-1.5 text-[14px] leading-relaxed text-[var(--cp-text-muted)]">
                <b className="text-[var(--cp-text-strong)]">이 분석에서는</b> · {m.here}
              </p>
              {m.caution && (
                <p className="mt-1.5 rounded-lg bg-[#a8322a]/8 px-2.5 py-1.5 text-[13.5px] leading-relaxed text-[#7a2620]">
                  주의 · {m.caution}
                </p>
              )}
            </section>
          ))}
          <p className="text-[12.5px] leading-relaxed text-[var(--cp-text-faint)]">
            상세 수식·검증 절차는 내부 분석 저장소 gwangjin-dumping(비공개)의 README와 REPRODUCE/MODEL_SPEC.md에 있습니다.
            고정 산출물의 무결성은 해시로, 핵심 수치는 verify.py 재계산으로 확인하며, 모형 재추정은 각 스크립트로 합니다.
          </p>
        </div>
      )}
    </ModalShell>
  )
}
