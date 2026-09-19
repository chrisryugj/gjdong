"use client"

import { useEffect, useRef, useState } from "react"
import type { DumpingMapData, OntoGraph } from "@/lib/dumping/types"
import { binRecoOverlap, channelGrowth, regressionBetas, sampleSizes, summarize, tallyInfra } from "@/lib/dumping/facts"
import ModalShell from "./modal-shell"
import { statMethods, StatMethodCard } from "./methods-stats"

// 데이터·분석 방법 안내. 두 섹션으로 구성.
// [쓰인 데이터] 구청 제공 자료와 직접 수집한 공개 데이터를 출처별로 구분해 보여준다.
// [분석 방법] 통계 모델·방법론 해설(methods-stats.tsx). 카드마다 질문 → 도식 → 쉽게 말하면 → 결과 수치 → 검증 → 한계 슬롯 고정.
// 정책 탭 "근거 경로"가 section을 지정해 연다. "reproduce"는 데이터 섹션 맨 아래 재현 문단으로 스크롤한다.
// 수치는 map.json·graph.json에서 뽑고(데이터 갱신 시 자동 반영), 거기 없는 것만 gwangjin-dumping/README.md 확정치를 인용한다.

interface Dataset {
  name: string
  scale: string // 규모·기간. 한눈에 크기 감 잡기용
  use: string // 이번 분석에서 어디에 썼는지
}

const n = (v: number) => v.toLocaleString()

// 해설서 원문(공개 레포). 여기서 다루지 않는 한계·검정 세부는 이리로. 정책 탭 근거 경로 "한계"는 이 모달로 온다
const EXPLAINER_URL = "https://github.com/chrisryugj/gjdong/blob/main/docs/dumping-stats-explainer.md"

// 구청 내부 행정자료 (청소과·동주민센터 제공)
const provided = (data: DumpingMapData): Dataset[] => {
  const s = summarize(data)
  // 인프라 원자료에는 완전히 같은 행이 섞여 있다. 표에 적는 규모는 지도 칩과 같은 기준(중복 뺀 기록)으로 센다
  const bins = tallyInfra(data.infra.bins)
  const recycling = tallyInfra(data.infra.recycling)
  const cctvFixed = tallyInfra(data.infra.cctvFixed)
  const cctvMobile = tallyInfra(data.infra.cctvMobile)
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
      // 10라운드: 같은 시설이 화면마다 다른 수(276/264, 940/857)로 보였다. 장부 원수와 지도 표시 수를 같이 적고 차이의 정의를 말한다
      name: "CCTV 현황 (고정·이동식)",
      scale: `고정 장부 ${data.infra.cctvFixed.length}개소(지도 ${cctvFixed.records.length}) · 이동식 장부 ${data.meta?.geocode?.cctvMobile?.rows ?? cctvMobile.rows}대(지도 ${cctvMobile.records.length}대)`,
      use: `배치 지도 레이어, 이동식 CCTV 효과 검증(DID)의 설치 정보. 지도 수가 적은 것은 중복 행과 위치 미확인분(이동식 ${data.meta?.geocode?.cctvMobile?.fallbackExcluded ?? 0}대)을 뺀 값`,
    },
    {
      name: "재활용정거장 설치현황",
      scale: `장부 ${n(data.meta?.geocode?.recycling?.rows ?? recycling.rows)}건(운영·철거 포함) · 지도 ${n(recycling.records.length)}곳`,
      use: "배치 지도 레이어. 지도 수가 적은 것은 같은 정거장이 두 번 적힌 중복 행을 뺀 값. 2024년이 마지막 신규 설치이고 철거 날짜가 기록된 건이 3건뿐이라 설치·철거 전후 비교(효과 판정)는 불가",
    },
    {
      name: "가로쓰레기통 설치현황",
      scale: `${bins.records.length}곳 · 원자료 ${bins.rows}행`,
      use: `배치 지도 레이어. 원자료 ${bins.rows}행은 같은 기록을 두 번씩 담은 것이고 설치장소는 ${bins.records.length}곳입니다. 지오코딩이 서로 다른 장소를 한 좌표로 묶어 지도 점은 ${bins.spots.length}개이며, 겹친 점은 누르면 몇 곳인지 펼쳐집니다`,
    },
    {
      name: "도로청소 종합계획 (2026)",
      scale: "청소차 17대 · 노선 39.3km",
      use: "청소차 관리노선 레이어(집중 10.6km·일반 28.7km), 운영 주기 정보",
    },
    {
      // 8라운드: 외부 산출물임을 표에 못 박는다. 이번 분석의 핫스팟·회귀와 독립이고 산출 방법은 미확인
      name: `가로쓰레기통 배치추천 (데이터팀, 외부 산출물)`,
      scale: data.binRecos ? `${data.binRecos.items.length}지점 · ${data.binRecos.asof}` : "미확보",
      use: (() => {
        const o = binRecoOverlap(data, data.binRecos?.items ?? [])
        return `지도 레이어(기본 꺼짐). 데이터팀이 따로 만든 격자 분석 결과이며 산출 방법은 이 화면에서 확인되지 않았습니다. 이번 분석의 집중관리 상습격자 ${data.decision.kpi.criticalCellsNow}곳과 겹치는 지점 ${o.inCritical}곳, 예측 핫스팟 20과 겹치는 지점 ${o.inHotspot}곳. 두 산출물은 독립이라 순위·근거를 섞어 읽지 않습니다`
      })(),
    },
  ]
}

// 공개 데이터에서 분석팀이 직접 수집
const collected = (data: DumpingMapData, topBeta: string, ledgerRows: number): Dataset[] => [
  {
    name: "건축물대장 표제부",
    scale: `${Number.isFinite(ledgerRows) ? n(ledgerRows) : "미산출"}동 · 국토부 건축HUB`,
    use: `다가구·단독 밀집(건축물대장 다가구 가구+일반단독 동) 계산. 계수가 가장 큰 예측변수(β ${topBeta})의 원천`,
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
    name: "지도 바탕·건물 입체·지형",
    scale: "OpenStreetMap(Protomaps 2026-09-18 추출) · Mapzen 지형 타일",
    use: "지도 바탕과 입체 보기의 건물 높이·아차산 지형. 분석 수치에는 쓰지 않음. 정적 파일로 자체 호스팅",
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
    name: "SGIS 100m 격자 총인구 (2024 등록센서스)",
    scale: `국가데이터처 SGIS · 광진 ${n(data.decision.regressionV2?.exposure ? data.decision.regressionV2.exposure.v3_100.n : 0)}칸 회귀 표본`,
    use: `상주인구 노출 변수(노출 = 그 칸에 사람이 얼마나 있는가. v3 회귀 β ${data.decision.regressionV2?.exposure ? signed(data.decision.regressionV2.exposure.compare.both.resident_pop.beta) : "미산출"}). 공식 1km 격자와 합산 대조해 같은 자료임을 확인`,
  },
  {
    name: "K-apt 관리비공개 의무단지 (필지·관리비)",
    scale: `국토교통부 K-apt · 광진 ${data.decision.regressionV2?.proxyCheck?.complexes ?? "미산출"}단지`,
    use: "관리주체 실측. 건축물대장 세대수와 필지번호로 조인해 다가구·단독 밀집 변수가 무엇을 재는지 검증(발견 탭 대리변수 검증 카드)",
  },
  {
    name: "건축 인허가 파이프라인",
    scale: `건축HUB · ${data.decision.permits?.window ?? "최근 12개월"}`,
    use: "구조 전망. 소형 공동주택·다가구 신축 흐름(관리 취약 주거의 증감 방향)",
  },
]

// 서울 열린데이터광장·공공데이터포털에서 직접 수집. 25개 구 어디서나 같은 원천으로 재현된다
const seoulOpen = (data: DumpingMapData): Dataset[] => {
  const sx = data.decision.seoul
  const r2 = data.decision.regressionV2
  if (!sx) return []
  return [
    { name: "행정동 생활인구 (내국인·장기체류 외국인)", scale: `OA-14991·14992 · ${sx.livingPopWindow} 월별`, use: "동별 체류 인구 대비 민원·과태료 기록 비율(발견 탭·브리핑). 등록인구가 놓치는 유동 인구 노출" },
    { name: "250M격자 생활인구 + 격자 SHP", scale: `OA-22784 · ${sx.livingPop250Month} 일별 31일`, use: `100m 격자 노출 변수(v2 회귀 β ${r2 ? (r2.v2_100.coef.living_pop.beta > 0 ? "+" : "") + r2.v2_100.coef.living_pop.beta : "미산출"}), 지도 바탕 "생활인구"` },
    { name: "광진구 의류수거함 위치", scale: `공공데이터포털 15109594 · ${tallyInfra(data.infra.clothBins).records.length}곳`, use: "\"수거함 옆에서 많이 생긴다\" 통념 검증(v2 회귀), 지도 레이어" },
    { name: "자치구 목적별 CCTV 설치현황", scale: `OA-2722 · ${sx.cctv.asof}`, use: "25개 구 무단투기 CCTV 비교(연계분), 운영 탭 서울 맥락" },
    { name: "스마트 불편신고 분야별 신고 현황", scale: `OA-12051 · 2012-08~ 월별`, use: "서울 전체 앱 청소 신고 추세. 앱 확산이 광진만의 현상이 아님을 확인" },
    { name: "가로쓰레기통 설치정보", scale: `OA-15069 · 2025-11`, use: `구청 장부(${data.meta?.binSites ?? "미산출"}개 위치) 교차검증` },
  ]
}

// 8라운드: 원천별 지오코딩 품질. 법정동 없는 결과(구 중심 폴백)는 격자에 넣지 않았다는 사실과 그 규모를 표로 보인다
const GEOCODE_KO: Record<string, string> = {
  complaints: "민원 접수 내역", enforcement: "과태료 부과 내역", ledger: "건축물대장 표제부",
  recycling: "재활용정거장", cctvMobile: "이동식 CCTV", bins: "가로쓰레기통",
}
const geocodeRows = (data: DumpingMapData): Dataset[] => {
  const q = data.meta?.geocode
  if (!q) return []
  return Object.entries(GEOCODE_KO)
    .filter(([k]) => q[k as keyof typeof q])
    .map(([k, name]) => {
      const s = q[k as "complaints"]!
      return {
        name,
        scale: `격자 부여 ${n(s.geocoded)} / ${n(s.rows)}`,
        use: `폴백 제외 ${n(s.fallbackExcluded)}건${s.failed ? ` · 미지오코딩 ${n(s.failed)}건` : ""}${s.outsideGrid ? ` · 격자 밖 ${n(s.outsideGrid)}건` : ""}${s.fallbackExcluded ? ". 제외분은 건수 집계에는 포함, 지도·순위·회귀에서만 제외" : ""}`,
      }
    })
}

const signed = (v: number) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toFixed(3)}`

export type MethodsSection = "data" | "methods" | "reproduce"

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
        <span className={`rounded px-1.5 py-0.5 text-[13.5px] font-bold ${badgeCls}`}>{badge}</span>
        <h3 className="text-[16px] font-bold text-[var(--cp-text-strong)]">{title}</h3>
      </div>
      <p className="mb-2.5 text-[14.5px] leading-relaxed text-[var(--cp-text-dim)]">{desc}</p>
      <div className="flex flex-col">
        {items.map((d) => (
          <div key={d.name} className="border-t border-[var(--cp-border-faint)] py-2 first:border-t-0">
            <p className="flex flex-wrap items-baseline gap-x-2 text-[15.5px]">
              <b className="text-[var(--cp-text-strong)]">{d.name}</b>
              <span className="font-mono text-[14px] text-[var(--cp-text-dim)]">{d.scale}</span>
            </p>
            <p className="mt-0.5 text-[15px] leading-relaxed text-[var(--cp-text-muted)]">{d.use}</p>
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
  initialSection = "data",
}: {
  open: boolean
  data: DumpingMapData | null
  graph: OntoGraph | null
  onClose: () => void
  initialSection?: MethodsSection
}) {
  const [section, setSection] = useState<"data" | "methods">(initialSection === "methods" ? "methods" : "data")
  const reproRef = useRef<HTMLParagraphElement>(null)
  useEffect(() => {
    setSection(initialSection === "methods" ? "methods" : "data")
  }, [initialSection, open])
  useEffect(() => {
    if (open && initialSection === "reproduce") reproRef.current?.scrollIntoView({ block: "center" })
  }, [open, initialSection])
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
      size="xl"
    >
      {/* 섹션 전환. 데이터 출처와 방법론을 나란히 확인 */}
      <div className="mb-3 flex gap-1 rounded-lg bg-[var(--cp-hover)] p-1">
        {(
          [
            { id: "data", label: "쓰인 데이터" },
            { id: "methods", label: "통계 방법" },
          ] as { id: "data" | "methods"; label: string }[]
        ).map((s) => (
          <button
            key={s.id}
            onClick={() => setSection(s.id)}
            className={`flex-1 rounded-md py-1.5 text-[15.5px] font-semibold transition-colors ${
              section === s.id
                ? "bg-[var(--cp-panel)] text-[var(--cp-text-strong)] shadow-sm"
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
            badgeCls="bg-[#c2410c]/12 text-[#c2410c]"
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
          {geocodeRows(data).length > 0 && (
            <DatasetGroup
              badge="품질"
              badgeCls="bg-[#8a530e]/12 text-[#8a530e]"
              title="지오코딩 품질과 폴백 제외"
              desc={`주소를 좌표로 바꿀 때 찾지 못한 결과는 법정동 없이 구 중심 한 점에 놓입니다. 그 결과를 격자에 넣지 않았습니다(2026-09-13 정정). ${data.meta?.geocode?.rule ?? ""}`}
              items={geocodeRows(data)}
            />
          )}
          <p
            ref={reproRef}
            className={`rounded-lg px-2.5 py-2 text-[14px] leading-relaxed ${
              initialSection === "reproduce" ? "border border-[#c2410c]/40 bg-[#c2410c]/5 text-[var(--cp-text)]" : "text-[var(--cp-text-faint)]"
            }`}
          >
            <b className="text-[var(--cp-text-strong)]">재현.</b> 원자료의 컬럼 사전과 입력·산출물·코드 파일 해시(SHA-256) {rp?.hashes ?? "미산출"}개는 재현 패키지(REPRODUCE)에 고정돼 있고,
            verify.py가 해시 대조와 핵심 수치 {rp?.numbers ?? "미산출"}개 재계산을 합니다. 회귀·DID·전망 오차의 재추정은 개별 스크립트로 가능하지만
            verify.py의 범위는 아닙니다. 원자료에 건별 민원·과태료 기록이 있어 재현 패키지는 비공개 저장소(gwangjin-dumping)에 있고,
            서울시·공공데이터포털 층은 위 목록의 원천에서 25개 구 어디서나 같은 방식으로 다시 만들 수 있습니다. 격자 집계 3종(지도 페이로드·격자별
            민원·격자별 시설)은 생성 코드가 없던 것을 2026-09-13에 복원해 재현 순서 안에서 다시 만들어집니다. 원자료부터 지도까지 전체를 깨끗한 환경에서
            처음부터 재생성하는 검증은 아직 하지 않았습니다.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {statMethods(data, graph).map((m, i) => (
            <StatMethodCard key={m.id} m={m} i={i} data={data} graph={graph} />
          ))}
          <p className="text-[14px] leading-relaxed text-[var(--cp-text-faint)]">
            상세 수식·검증 절차는 재현 패키지(비공개 저장소, 요청 시 열람)에 있습니다. 고정 산출물의 무결성은 해시로, 핵심 수치는 검증 스크립트 재계산으로 확인하며 모형 재추정은 각 스크립트로 합니다.
            한계·검정 세부는{" "}
            <a href={EXPLAINER_URL} target="_blank" rel="noreferrer" className="font-medium text-[#c2410c] hover:underline">
              통계 해설서(공개)
            </a>
            에 있습니다.
          </p>
        </div>
      )}
    </ModalShell>
  )
}
