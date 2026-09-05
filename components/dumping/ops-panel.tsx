"use client"

import { useState } from "react"
import type { DumpingMapData, InterventionEntry } from "@/lib/dumping/types"
import { partialYearSuffix, summarize } from "@/lib/dumping/facts"
import OpsModal, { ForecastChart, KRW, type OpsModalId } from "./ops-modal"

// 운영·전망 탭 — KPI 보드 · 예측 핫스팟 · 수요 전망 · 품목 분해 · 처분 퍼널 · 처리 SLA · 구조 전망 · 조치 대장.
// 지도로 보여줄 수 있는 것(핫스팟·상습격자)은 클릭하면 지도에, 나머지는 중앙 상세 모달로 연다.
// 전부 관측·운영 지표다. 발생의 인과 추정이 아니며, 전망은 행정수요(신고 접수량) 전망이다.

interface OpsPanelProps {
  data: DumpingMapData | null
  interventions: InterventionEntry[] | null
  onFocus: (latlng: [number, number], label: string) => void
  showCritical: boolean // 집중관리 상습격자 지도 강조 레이어 상태 (지도와 동기)
  onToggleCritical: () => void
}

function SectionTitle({ n, children }: { n?: string; children: React.ReactNode }) {
  return (
    <h3 className={`mb-2 flex items-baseline gap-2 text-sm font-semibold tracking-wide text-[var(--cp-text-dim)] ${n && n !== "01" ? "border-t border-[var(--cp-border)] pt-3" : ""}`}>
      {n && <span className="font-mono text-[11px] font-normal text-[var(--cp-text-faint)]">{n}</span>}
      <span>{children}</span>
    </h3>
  )
}

// 모달로 여는 카드 공용 래퍼 — "자세히" 어포던스를 우상단에 고정
function DetailCard({
  onOpen,
  children,
  className,
}: {
  onOpen: () => void
  children: React.ReactNode
  className?: string
}) {
  return (
    <button
      onClick={onOpen}
      className={`relative w-full rounded-lg border border-[var(--cp-border)] bg-[var(--cp-panel)] p-3 text-left transition-colors hover:border-[#0c6155]/60 ${className ?? ""}`}
    >
      <span className="absolute right-3 top-2.5 text-[12px] font-medium text-[#0c6155]">자세히 →</span>
      {children}
    </button>
  )
}

const STATUS_KO: Record<InterventionEntry["status"], { label: string; cls: string }> = {
  registered: { label: "등록", cls: "bg-[#0c6155]/10 text-[#0c6155]" },
  active: { label: "실행 중", cls: "bg-amber-100 text-amber-800" },
  evaluated: { label: "평가 완료", cls: "bg-slate-200 text-slate-700" },
  abandoned: { label: "중단", cls: "bg-slate-100 text-slate-500" },
}

export default function OpsPanel({ data, interventions, onFocus, showCritical, onToggleCritical }: OpsPanelProps) {
  const [modal, setModal] = useState<OpsModalId | null>(null)
  if (!data) return <p className="p-4 text-sm text-[var(--cp-text-dim)]">불러오는 중…</p>
  const d = data.decision
  const q = d.kpi.persistentQuarterly
  // 기준일(asof)은 분기 진행 중 시점이라, 직전 "분기말" 값은 배열의 마지막 항목
  const prevCritical = q.length >= 1 ? q[q.length - 1].critical : null
  // 채널고정(앱 제외) 민원 연도별 — 앱 보급 편향을 제거한 발생 근사
  const fixedYearly: Record<string, number> = {}
  for (const ch of ["c120", "direct"]) {
    for (const [yr, n] of Object.entries(d.channels.yearly[ch] ?? {})) {
      fixedYearly[yr] = (fixedYearly[yr] ?? 0) + n
    }
  }
  const bt = d.hotspots.backtest
  const maxCat = d.fines.categories[0]?.n ?? 1
  const cigShare = Math.round(
    ((d.fines.categories.find((c) => c.cat === "담배꽁초(차량)")?.n ?? 0) / d.fines.totalN) * 100,
  )
  const nextFc = d.forecast.fc[0]
  // 전망 첫 달이 집계 중인 달(월별 마지막 키)이면 "다음 달"이 아니라 "이번 달" — 접수 중인 건수를 같이 보인다
  const fcSoFar = data.yearly.complaintsMonthly[nextFc.m]
  const funnelOrder = ["납부 완료", "체납", "감면·감액", "진행 중"]
  const slaYears = Object.entries(d.sla.byYear)
  const { period } = summarize(data)
  // SLA 요약 문장 — 완결된 두 해의 중앙값 변화 + 마지막 해의 상위 10% 방향. 숫자는 표와 같은 원천
  const [slaA, slaB, slaLast] = [slaYears[0], slaYears[1], slaYears[slaYears.length - 1]]
  const slaPrev = slaYears[slaYears.length - 2]

  return (
    <div className="flex flex-col gap-4 p-3">
      {/* KPI 보드 — 신고편향에 오염되지 않는 성과지표. 민원 총건수로 성과 평가 금지 */}
      <section>
        <SectionTitle n="01">성과지표 (신고편향에 덜 민감 · {d.asof} 기준)</SectionTitle>
        <div className="grid grid-cols-3 gap-1.5 text-center">
          <button
            onClick={onToggleCritical}
            className={`rounded-lg border px-1 py-2 transition-colors ${
              showCritical
                ? "border-[#a8322a] bg-[#a8322a]/8 ring-2 ring-[#a8322a]/25"
                : "border-[var(--cp-border)] bg-[var(--cp-panel)] hover:bg-[var(--cp-hover)]"
            }`}
          >
            <p className="text-[12px] text-[var(--cp-text-dim)]">집중관리 상습격자</p>
            <p className="font-mono text-[20px] font-bold text-[#a8322a]">{d.kpi.criticalCellsNow}</p>
            <p className="text-[11px] text-[var(--cp-text-faint)]">
              {d.kpi.thresholds?.months ?? 12}개월 {d.kpi.thresholds?.critical ?? 10}건+ {prevCritical != null && ` · 전분기 ${prevCritical}`}
            </p>
            <p className="text-[11px] font-medium text-[var(--cp-text-muted)]">앱 제외 {d.kpi.criticalCellsNowNoApp}곳</p>
            <p className="mt-0.5 text-[11px] font-semibold text-[#a8322a]">
              {showCritical ? "지도 표시 중 · 눌러서 끄기" : "누르면 지도에 표시"}
            </p>
          </button>
          <button
            onClick={() => setModal("funnel")}
            className="rounded-lg border border-[var(--cp-border)] bg-[var(--cp-panel)] px-1 py-2 hover:bg-[var(--cp-hover)]"
          >
            <p className="text-[12px] text-[var(--cp-text-dim)]">과태료 징수율</p>
            <p className="font-mono text-[20px] font-bold text-[var(--cp-text-strong)]">
              {d.fines.collectionRatePct}%
            </p>
            <p className="text-[11px] text-[var(--cp-text-faint)]">
              체납 {d.fines.arrearsN}건 {KRW(d.fines.arrearsAmount)}
            </p>
            <p className="mt-0.5 text-[11px] font-medium text-[#0c6155]">자세히 →</p>
          </button>
          <button
            onClick={() => setModal("channels")}
            className="rounded-lg border border-[var(--cp-border)] bg-[var(--cp-panel)] px-1 py-2 hover:bg-[var(--cp-hover)]"
          >
            <p className="text-[12px] text-[var(--cp-text-dim)]">채널고정 민원</p>
            <p className="font-mono text-[20px] font-bold text-[var(--cp-text-strong)]">
              {Object.values(fixedYearly).slice(-1)[0] ?? "-"}
            </p>
            <p className="text-[11px] text-[var(--cp-text-faint)]">
              {Object.entries(fixedYearly)
                .map(([yr, n]) => `${yr.slice(2)}년 ${n}`)
                .join(" · ")}
            </p>
            <p className="mt-0.5 text-[11px] font-medium text-[#0c6155]">자세히 →</p>
          </button>
        </div>
        <p className="mt-1.5 text-[12px] leading-relaxed text-[var(--cp-text-faint)]">
          민원 총건수에는 앱 보급 편향이 섞여 있어 성과지표로 쓰지 않습니다. 연도 비교는
          채널고정(120·직접)과 상습격자 수로 합니다. 상습격자 수는 앱 민원을 포함하면 {d.kpi.criticalCellsNow}곳,
          빼면 {d.kpi.criticalCellsNowNoApp}곳입니다. 앱을 뺀 수치를 성과 판단의 기준으로 두세요.
          {period.lastMonth < 12 && ` 채널고정 ${period.lastYear}년 수치는 ${period.lastMonth}월까지의 부분 집계입니다.`}
        </p>
      </section>

      {/* 예측 핫스팟 — 목록 클릭 시 지도 이동 + 펄스 표시. 탭이 열려 있는 동안 순위 배지 상시 표시 */}
      <section>
        <SectionTitle n="02">다음 분기 예측 핫스팟 20 · 누르면 지도에서 위치 표시</SectionTitle>
        <p className="mb-1.5 rounded-lg bg-[#0c6155]/10 px-2.5 py-1.5 text-[13px] font-medium leading-snug text-[#0a4a41]">
          지난 {bt.windows.length}개 분기 백테스트: 상위 20곳 중 평균 {bt.avgPrecision20}%에서 다음
          분기 실제 발생. 전체 발생의 {bt.avgCapture20}%를 20곳이 포착 (무작위 기대 {bt.avgRandomCapture}%).
        </p>
        <div className="max-h-72 overflow-y-auto rounded-lg border border-[var(--cp-border)] bg-[var(--cp-panel)]">
          {d.hotspots.top.map((h, i) => (
            <button
              key={i}
              onClick={() => onFocus([h[0], h[1]], `예측 핫스팟 ${i + 1}위 · ${h[6] || h[5]}`)}
              className="flex w-full items-start gap-2 border-b border-[var(--cp-border-faint)] px-3 py-2 text-left last:border-b-0 hover:bg-[var(--cp-hover)]"
            >
              <span
                className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-[11px] font-bold text-white ${
                  i < 3 ? "bg-[#a8322a]" : "bg-[#7c2d5e]"
                }`}
              >
                {i + 1}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-medium text-[var(--cp-text-strong)]">
                  {h[6] || `${h[5]} (주소 미상)`}
                </span>
                <span className="block text-[12px] text-[var(--cp-text-dim)]">
                  {h[5]} · 최근 180일 민원 {h[3]} · 과태료 {h[4]}
                </span>
              </span>
              {h[7] === 0 && (
                <span className="mt-0.5 shrink-0 rounded bg-[#8a530e]/12 px-1.5 py-0.5 text-[11px] font-medium text-amber-800">
                  CCTV 없음
                </span>
              )}
            </button>
          ))}
        </div>
        <p className="mt-1 text-[12px] text-[var(--cp-text-faint)]">
          점수는 {d.hotspots.method}입니다. 행정수요 예측이지 발생의 인과를 예측하는 것은 아닙니다.
        </p>
      </section>

      {/* 수요 전망 */}
      <section>
        <SectionTitle n="03">민원 접수 전망 (운영 참고)</SectionTitle>
        <DetailCard onOpen={() => setModal("forecast")}>
          <p className="mb-1 text-[14px] text-[var(--cp-text-muted)]">
            {fcSoFar != null ? "이번 달" : "다음 달"}({nextFc.m}) 예상 접수{" "}
            <b className="font-mono text-[16px] text-[var(--cp-text-strong)]">{nextFc.yhat}건</b>
            <span className="ml-1 font-mono text-[13px] text-[var(--cp-text-dim)]">
              (80% 구간 {nextFc.lo}~{nextFc.hi})
            </span>
            {fcSoFar != null && (
              <span className="block font-mono text-[12px] text-[var(--cp-text-dim)]">
                {d.asof.slice(5).replace("-", "/")}까지 {fcSoFar}건 접수
              </span>
            )}
          </p>
          <ForecastChart data={data} />
          <p className="mt-1 text-[12px] leading-relaxed text-[var(--cp-text-faint)]">
            홀트윈터스 계절 모형이며, 롤링 원점 백테스트 오차는 {d.forecast.backtest.mapePct}%입니다(전년 동월로
            찍는 기준모형 {d.forecast.backtest.naiveMapePct ?? "—"}%, 80% 구간 적중 {d.forecast.backtest.coverage80Pct ?? "—"}%).
            신고 접수량(앱 보급 추세 포함) 전망이라 인력과 순찰 배치 참고용이고, 발생 예측은 아닙니다.
          </p>
        </DetailCard>
      </section>

      {/* 품목 분해 */}
      <section>
        <SectionTitle n="04">무엇을 버리다 적발됐나 (과태료 {d.fines.totalN.toLocaleString()}건)</SectionTitle>
        <DetailCard onOpen={() => setModal("fines")}>
          <div className="mt-3 flex flex-col gap-2">
            {/* 수치가 길어(1,285건 · 7,169만원) 우측 고정폭 컬럼이 좁은 화면에서 줄바꿈으로 무너진다
                — 라벨+수치 한 줄, 막대는 아래 전체폭으로 적층 */}
            {d.fines.categories.map((c) => (
              <div key={c.cat}>
                <div className="flex items-baseline justify-between gap-2">
                  <span className="min-w-0 truncate text-[13px] text-[var(--cp-text)]">{c.cat}</span>
                  <span className="shrink-0 whitespace-nowrap font-mono text-[12px] text-[var(--cp-text-muted)]">
                    {c.n.toLocaleString()}건 · {KRW(c.amount)}
                  </span>
                </div>
                <span className="relative mt-0.5 block h-2 overflow-hidden rounded-full bg-[var(--cp-track,rgba(100,116,139,.18))]">
                  <i
                    className="absolute inset-y-0 left-0 rounded-full bg-[#0c6155]"
                    style={{ width: `${(c.n / maxCat) * 100}%` }}
                  />
                </span>
              </div>
            ))}
          </div>
          <p className="mt-2 border-l-2 border-[#0c6155] pl-2.5 text-[13.5px] font-medium leading-snug text-[var(--cp-text-strong)]">
            담배꽁초(차량) {cigShare}%는 주거 구조와 무관한 도로 현상입니다. 생활쓰레기 대책과 나눠
            관리해야 합니다.
          </p>
        </DetailCard>
      </section>

      {/* 처분 퍼널 */}
      <section>
        <SectionTitle n="05">과태료는 걷히고 있나 (부과 {KRW(d.fines.totalAmount)})</SectionTitle>
        <DetailCard onOpen={() => setModal("funnel")}>
          <div className="mt-3 grid grid-cols-4 gap-1.5 text-center">
            {funnelOrder.map((g) => {
              const v = d.fines.funnel[g]
              if (!v) return null
              const bad = g === "체납"
              return (
                <div
                  key={g}
                  className={`rounded-lg border px-1 py-2 ${
                    bad ? "border-[#a8322a]/40 bg-[#a8322a]/5" : "border-[var(--cp-border-faint)]"
                  }`}
                >
                  <p className="text-[12px] text-[var(--cp-text-dim)]">{g}</p>
                  <p className={`font-mono text-[16px] font-semibold ${bad ? "text-[#a8322a]" : "text-[var(--cp-text-strong)]"}`}>
                    {v.n.toLocaleString()}
                  </p>
                  <p className="whitespace-nowrap text-[11px] text-[var(--cp-text-faint)]">{KRW(v.amount)}</p>
                </div>
              )
            })}
          </div>
          <p className="mt-1.5 text-[12px] text-[var(--cp-text-faint)]">
            금액은 과세금액 합산(가산금 미포함 근사). 징수율 {d.fines.collectionRatePct}%는 감면·진행
            건 제외 기준.
          </p>
        </DetailCard>
      </section>

      {/* 처리 SLA */}
      <section>
        <SectionTitle n="06">민원 처리 속도 (접수 → 행정 종결)</SectionTitle>
        <DetailCard onOpen={() => setModal("sla")}>
          <div className="mt-3 grid grid-cols-3 gap-1.5 text-center">
            {slaYears.map(([yr, s]) => {
              const worst = s.p90H === Math.max(...slaYears.map(([, x]) => x.p90H))
              return (
                <div key={yr} className={`rounded-lg py-1.5 ${worst ? "bg-[#a8322a]/8" : ""}`}>
                  <p className="text-[12px] text-[var(--cp-text-dim)]">
                    {yr}년{worst && <b className="ml-1 text-[11px] text-[#a8322a]">주의</b>}
                  </p>
                  <p className="font-mono text-[15px] font-semibold text-[var(--cp-text-strong)]">
                    {s.medianH}시간
                  </p>
                  <p className="text-[11px] text-[var(--cp-text-faint)]">
                    상위10% {s.p90H}시간 · 3일내 {s.within3dPct}%
                  </p>
                </div>
              )
            })}
          </div>
          <p className="mt-1.5 text-[12px] leading-relaxed text-[var(--cp-text-faint)]">
            {slaA && slaB && (
              <>
                중앙값은 {slaA[0]}년 {slaA[1].medianH}시간에서 {slaB[0]}년 {slaB[1].medianH}시간으로{" "}
                {slaB[1].medianH < slaA[1].medianH ? "개선" : "악화"}.{" "}
              </>
            )}
            {slaLast && slaPrev && (
              <>
                {slaLast[0]}년{partialYearSuffix(period, slaLast[0])}은 앱 민원 급증과 함께 상위 10% 처리가{" "}
                {slaLast[1].p90H > slaPrev[1].p90H ? "다시 느려졌습니다" : "빨라졌습니다"}.
              </>
            )}
          </p>
        </DetailCard>
      </section>

      {/* 구조 전망 — 관리 취약 신축 공급 파이프라인 (법정동 기준이라 지도 대신 모달 상세) */}
      {d.permits && (
        <section>
          <SectionTitle n="07">구조 전망 · 관리 취약 신축이 어디로 들어오나</SectionTitle>
          <DetailCard onOpen={() => setModal("permits")}>
            <p className="mt-3 text-[14px] leading-relaxed text-[var(--cp-text-muted)]">
              최근 12개월 신축 허가(사용승인 전) 중 소형 공동주택(150세대 미만, 의무관리 기준 미달){" "}
              <b className="font-mono text-[var(--cp-text-strong)]">
                {d.permits.guTotal.smallAptPermits12m}건 · {d.permits.guTotal.smallAptUnits12m.toLocaleString()}세대
              </b>
              , 단독·다가구 {d.permits.guTotal.detachedPermits12m}건.
            </p>
            <div className="mt-2 flex flex-col gap-1">
              {d.permits.byDong.filter((r) => r.smallAptUnits > 0).map((r) => {
                const max = d.permits!.byDong[0].smallAptUnits || 1
                return (
                  <div key={r.dong} className="flex items-center gap-2">
                    <span className="w-14 shrink-0 text-[13px] text-[var(--cp-text)]">{r.dong}</span>
                    <span className="relative h-2.5 min-w-0 flex-1 overflow-hidden rounded-full bg-[var(--cp-track,rgba(100,116,139,.18))]">
                      <i
                        className="absolute inset-y-0 left-0 rounded-full bg-[#b45309]"
                        style={{ width: `${(r.smallAptUnits / max) * 100}%` }}
                      />
                    </span>
                    <span className="shrink-0 whitespace-nowrap text-right font-mono text-[12px] text-[var(--cp-text-muted)]">
                      {r.smallAptPermits}건 · {r.smallAptUnits}세대
                    </span>
                  </div>
                )
              })}
            </div>
            <p className="mt-2 border-l-2 border-[#0c6155] pl-2.5 text-[13.5px] font-medium leading-snug text-[var(--cp-text-strong)]">
              가장 강한 예측변수(관리주체 없는 주거)와 같은 성격의 소형 주거가{" "}
              {d.permits.byDong.slice(0, 3).map((r) => r.dong.replace(/동$/, "")).join("·")}에
              몰려 공급되고 있습니다. 준공 시점부터 배출안내와 공동배출 협의를 미리 적용할 후보
              지역입니다.
            </p>
          </DetailCard>
        </section>
      )}

      {/* 서울시 맥락 — 25개 구 비교·서울 전체 앱 추세 */}
      {d.seoul && (
        <section>
          <SectionTitle n="08">서울시 안에서 광진은 어디쯤인가 (열린데이터광장)</SectionTitle>
          <DetailCard onOpen={() => setModal("seoul")}>
            <div className="mt-3 grid grid-cols-3 gap-1.5 text-center">
              <div className="rounded-lg border border-[var(--cp-border-faint)] px-1 py-2">
                <p className="text-[12px] text-[var(--cp-text-dim)]">무단투기 CCTV</p>
                <p className="font-mono text-[16px] font-semibold text-[var(--cp-text-strong)]">{d.seoul.cctv.gwangjin.dumping}대</p>
                <p className="text-[11px] text-[var(--cp-text-faint)]">연계 25구 중 {d.seoul.cctv.gwangjin.dumpingRank}위</p>
              </div>
              <div className="rounded-lg border border-[var(--cp-border-faint)] px-1 py-2">
                <p className="text-[12px] text-[var(--cp-text-dim)]">서울 앱 청소신고</p>
                <p className="font-mono text-[16px] font-semibold text-[var(--cp-text-strong)]">
                  {(() => {
                    const ys = Object.keys(d.seoul!.smartReport.cleaningByYear).sort()
                    const full = ys.filter((y) => y < period.lastYear)
                    const a = d.seoul!.smartReport.cleaningByYear[full[full.length - 2]] ?? 0
                    const b = d.seoul!.smartReport.cleaningByYear[full[full.length - 1]] ?? 0
                    return a ? `${(b / a).toFixed(2)}배` : "—"
                  })()}
                </p>
                <p className="text-[11px] text-[var(--cp-text-faint)]">최근 완결 2개년</p>
              </div>
              <div className="rounded-lg border border-[var(--cp-border-faint)] px-1 py-2">
                <p className="text-[12px] text-[var(--cp-text-dim)]">가로쓰레기통</p>
                <p className="font-mono text-[16px] font-semibold text-[var(--cp-text-strong)]">{d.seoul.streetBins.gwangjin202511.sites}곳</p>
                <p className="text-[11px] text-[var(--cp-text-faint)]">서울시 원천 · 구청 장부와 일치</p>
              </div>
            </div>
            <p className="mt-2 text-[12px] leading-relaxed text-[var(--cp-text-faint)]">
              앱 신고 확산은 서울 전체 현상입니다. 25개 구가 같은 착시에 노출돼 있어 채널고정 지표는 서울시 차원의
              제안이 됩니다.
            </p>
          </DetailCard>
        </section>
      )}

      {/* 조치 대장 */}
      <section>
        <SectionTitle n="09">조치 대장 (개입 사전등록부)</SectionTitle>
        <div className="rounded-lg border border-[var(--cp-border)] bg-[var(--cp-panel)] p-3">
          <p className="mb-2 text-[13px] leading-relaxed text-[var(--cp-text-muted)]">
            새 개입(재배치·수거시간 조정·안내 등)은 <b>실행 전에</b> 대상·기간·비교 대상·판정 기준을
            등록하고, 평가는 등록한 설계 그대로만 합니다. CCTV 효과 철회(평균회귀 오염)를 되풀이하지
            않기 위한 장치입니다.
          </p>
          {interventions === null ? (
            <p className="text-[13px] text-[var(--cp-text-dim)]">대장을 불러오지 못했습니다.</p>
          ) : interventions.length === 0 ? (
            <p className="text-[13px] text-[var(--cp-text-dim)]">등록된 조치가 없습니다.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {interventions.map((it) => (
                <div key={it.id} className="rounded-lg border border-[var(--cp-border-faint)] px-2.5 py-2">
                  <div className="flex items-center gap-2">
                    {/* 대장 JSON에 새 상태가 들어와도 화면이 깨지지 않게 — 모르는 값은 원문 그대로 */}
                    <span
                      className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ${STATUS_KO[it.status]?.cls ?? "bg-slate-100 text-slate-500"}`}
                    >
                      {STATUS_KO[it.status]?.label ?? it.status}
                    </span>
                    <span className="truncate text-[13px] font-medium text-[var(--cp-text-strong)]">
                      {it.title}
                    </span>
                    <span className="ml-auto shrink-0 font-mono text-[11px] text-[var(--cp-text-faint)]">
                      {it.id}
                    </span>
                  </div>
                  <p className="mt-1 text-[12px] leading-relaxed text-[var(--cp-text-dim)]">
                    지표 {it.successMetric} · 평가 {it.evalWindowDays}일 · 대조군 {it.control || "미정(평가 불가)"}
                  </p>
                  {it.result && (
                    <p className="mt-1 rounded bg-[var(--cp-hover)] px-2 py-1 text-[12px] text-[var(--cp-text)]">
                      평가: {it.result}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
          <p className="mt-2 text-[12px] text-[var(--cp-text-faint)]">
            등록·갱신은 저장소 <span className="font-mono">data/dumping/interventions.json</span> 편집
            후 재배포.
          </p>
        </div>
      </section>

      <OpsModal id={modal} data={data} onClose={() => setModal(null)} />
    </div>
  )
}
