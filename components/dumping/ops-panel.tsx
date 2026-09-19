"use client"

import { useState } from "react"
import type { DumpingMapData, InterventionEntry } from "@/lib/dumping/types"
import { partialYearSuffix, summarize } from "@/lib/dumping/facts"
import { SectionHead } from "./section-head"
import { nb } from "@/lib/dumping/nobreak"
import OpsModal, { ForecastChart, KRW, type OpsModalId } from "./ops-modal"

// 운영·전망 탭. KPI 보드 · 예측 핫스팟 · 수요 전망 · 품목 분해 · 처분 퍼널 · 처리 SLA · 구조 전망 · 조치 대장.
// 지도로 보여줄 수 있는 것(핫스팟·상습격자)은 클릭하면 지도에, 나머지는 중앙 상세 모달로 연다.
// 전부 관측·운영 지표다. 발생의 인과 추정이 아니며, 전망은 행정수요(신고 접수량) 전망이다.

interface OpsPanelProps {
  data: DumpingMapData | null
  interventions: InterventionEntry[] | null
  onFocus: (latlng: [number, number], label: string) => void
  showCritical: boolean // 집중관리 상습격자 지도 강조 레이어 상태 (지도와 동기)
  onToggleCritical: () => void
}

// 모달로 여는 카드 공용 래퍼. "자세히" 어포던스를 우상단에 고정
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
      className={`dump-rise relative w-full rounded-lg border border-[var(--cp-border)] bg-[var(--cp-panel)] p-3 text-left transition-colors hover:border-[#c2410c]/60 ${className ?? ""}`}
    >
      <span className="absolute right-3 top-2.5 text-[13.5px] font-medium text-[#c2410c]">자세히 →</span>
      {children}
    </button>
  )
}

const STATUS_KO: Record<InterventionEntry["status"], { label: string; cls: string }> = {
  registered: { label: "등록", cls: "bg-[#c2410c]/10 text-[#c2410c]" },
  active: { label: "실행 중", cls: "bg-amber-100 text-amber-800" },
  evaluated: { label: "평가 완료", cls: "bg-slate-200 text-slate-700" },
  abandoned: { label: "중단", cls: "bg-slate-100 text-slate-500" },
}

export default function OpsPanel({ data, interventions, onFocus, showCritical, onToggleCritical }: OpsPanelProps) {
  const [modal, setModal] = useState<OpsModalId | null>(null)
  if (!data) return <p className="p-4 text-[15px] text-[var(--cp-text-dim)]">불러오는 중…</p>
  const d = data.decision
  const q = d.kpi.persistentQuarterly
  // 기준일(asof)은 분기 진행 중 시점이라, 직전 "분기말" 값은 배열의 마지막 항목
  const prevCritical = q.length >= 1 ? q[q.length - 1].critical : null
  // 14라운드: 타일의 큰 숫자는 성과 판단 기준인 앱 제외 수. 전분기도 같은 기준으로 비교
  const prevCriticalNoApp = q.length >= 1 ? (q[q.length - 1].criticalNoApp ?? null) : null
  // 채널고정(앱 제외) 민원 연도별. 앱 보급 편향을 제거한 발생 근사
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
  // 전망 첫 달이 집계 중인 달(월별 마지막 키)이면 "다음 달"이 아니라 "이번 달". 접수 중인 건수를 같이 보인다
  const fcSoFar = data.yearly.complaintsMonthly[nextFc.m]
  const funnelOrder = ["납부 완료", "체납", "감면·감액", "진행 중"]
  const slaYears = Object.entries(d.sla.byYear)
  const { period } = summarize(data)
  // SLA 요약 문장. 완결된 두 해의 중앙값 변화 + 마지막 해의 상위 10% 방향. 숫자는 표와 같은 원천
  const [slaA, slaB, slaLast] = [slaYears[0], slaYears[1], slaYears[slaYears.length - 1]]
  const slaPrev = slaYears[slaYears.length - 2]

  return (
    <div className="flex flex-col gap-4 p-3">
      {/* KPI 보드. 신고편향에 오염되지 않는 성과지표. 민원 총건수로 성과 평가 금지 */}
      <section>
        <SectionHead n="01" first sub={`신고편향에 덜 민감한 지표 · ${d.asof} 기준`}>성과지표</SectionHead>
        {/* 세 줄 목록(2026-09-18). 카드 폭 440px에 세 칸을 나란히 두면 라벨이 세 줄로 깨졌다. 왼쪽 이름·풀이, 오른쪽 큰 숫자·동작 */}
        <div className="flex flex-col overflow-hidden rounded-xl border border-[var(--cp-border)] bg-[var(--cp-panel)]">
          {(
            [
              {
                key: "critical",
                label: "집중관리 상습격자",
                tag: "앱 제외",
                value: String(d.kpi.criticalCellsNowNoApp),
                unit: "곳",
                sub: `${d.kpi.thresholds?.months ?? 12}개월 ${d.kpi.thresholds?.critical ?? 10}건 이상 칸${prevCriticalNoApp != null ? ` · 전분기 ${prevCriticalNoApp}` : ""} · 앱 포함 ${d.kpi.criticalCellsNow}곳(지도)${prevCritical != null ? ` · 전분기 ${prevCritical}` : ""}`,
                action: showCritical ? "지도 표시 중 · 끄기" : "지도에 표시",
                onClick: onToggleCritical,
                on: showCritical,
                red: true,
              },
              {
                key: "collection",
                label: "과태료 징수율",
                tag: null,
                value: `${d.fines.collectionRatePct}`,
                unit: "%",
                sub: `체납 ${d.fines.arrearsN}건 ${KRW(d.fines.arrearsAmount)}`,
                action: "자세히",
                onClick: () => setModal("funnel"),
                on: false,
                red: false,
              },
              {
                key: "fixed",
                label: "채널고정 민원",
                tag: "120·직접",
                value: String(Object.values(fixedYearly).slice(-1)[0] ?? "-"),
                unit: "건",
                sub: Object.entries(fixedYearly)
                  .map(([yr, n]) => `${yr}년 ${n}`)
                  .join(" · ") + (period.lastMonth < 12 ? ` · ${period.lastYear}년은 ${period.lastMonth}월까지` : ""),
                action: "자세히",
                onClick: () => setModal("channels"),
                on: false,
                red: false,
              },
            ] as const
          ).map((k) => (
            <button
              key={k.key}
              onClick={k.onClick}
              aria-pressed={k.key === "critical" ? k.on : undefined}
              className={`flex items-center gap-3 border-t border-[var(--cp-border)] px-3.5 py-3 text-left transition-colors first:border-t-0 hover:bg-[var(--cp-hover)] ${k.on ? "bg-[#a8322a]/6" : ""}`}
            >
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-baseline gap-x-1.5 text-[14.5px] font-semibold text-[var(--cp-text-strong)]">
                  {k.label}
                  {k.tag && <span className="text-[12px] font-medium text-[var(--cp-text-dim)]">{k.tag}</span>}
                </span>
                <span className="mt-0.5 block text-[12.5px] leading-snug text-[var(--cp-text-dim)]">{nb(k.sub)}</span>
              </span>
              <span className="shrink-0 text-right">
                <span className={`dump-meta-v block text-[24px] leading-none ${k.red ? "text-[#a8322a]" : "text-[var(--cp-text-strong)]"}`}>
                  {k.value}
                  <span className="ml-0.5 font-sans text-[12px] font-medium text-[var(--cp-text-dim)]">{k.unit}</span>
                </span>
                <span className="mt-1 block text-[12.5px] font-semibold text-[#c2410c]">{k.action} →</span>
              </span>
            </button>
          ))}
        </div>
        <p className="mt-2 text-[13px] leading-relaxed text-[var(--cp-text-faint)]">
          민원 총건수는 앱 보급 편향이 섞여 성과지표로 쓰지 않습니다. 성과 판단은 앱을 뺀 상습격자 수와 채널고정 민원으로 합니다.
        </p>
      </section>

      {/* 예측 핫스팟. 목록 클릭 시 지도 이동 + 펄스 표시. 탭이 열려 있는 동안 순위 배지 상시 표시 */}
      <section>
        <SectionHead n="02" sub="순위 = 최근 기록일수록 크게(90일마다 절반) 더한 점수. 최근에 기록이 몰린 칸이 위로 옵니다 · 누르면 지도에서 기둥으로 표시">다음 분기 예측 핫스팟 20</SectionHead>
        {/* 백테스트 요약은 문단 대신 수치 3칸(2026-09-18: 여섯 줄 문단은 읽히지 않았다) */}
        <div className="mb-2 grid grid-cols-3 gap-1.5 rounded-lg bg-[#c2410c]/8 px-3 py-2">
          {[
            { k: "적중률", v: `${bt.avgPrecision20}%`, s: "20곳 중 다음 분기 기록" },
            { k: "포착률", v: `${bt.avgCapture20}%`, s: `무작위 기대 ${bt.avgRandomCapture}%` },
            // 단순 집계(누적·최근 90일·반감기 동일가중) 3종으로 뽑아도 같은 수준이라는 고지. 범위 하나로 보인다
            {
              k: "단순 집계로 뽑아도",
              v: (() => {
                const vs = Object.values(bt.baselines ?? {}).map((b) => b.avgCapture20).filter((x): x is number => typeof x === "number")
                return vs.length ? `${Math.min(...vs)}~${Math.max(...vs)}%` : "미산출"
              })(),
              s: `우리 점수 ${bt.avgCapture20}%와 같은 수준`,
            },
          ].map((x) => (
            <div key={x.k} className="min-w-0">
              <p className="truncate text-[12px] text-[#9a3412]/80">{x.k}</p>
              <p className="dump-meta-v text-[18px] leading-tight text-[#9a3412]">{x.v}</p>
              <p className="text-[11.5px] leading-snug text-[#9a3412]/70">{x.s}</p>
            </div>
          ))}
        </div>
        <p className="mb-1.5 text-[12.5px] text-[var(--cp-text-faint)]">지난 {bt.windows.length}개 분기마다 그 시점으로 돌아가 뽑은 20곳을 채점한 값입니다.</p>
        <div className="max-h-72 overflow-y-auto rounded-lg border border-[var(--cp-border)] bg-[var(--cp-panel)]">
          {d.hotspots.top.map((h, i) => (
            <button
              key={i}
              onClick={() => onFocus([h[0], h[1]], `예측 핫스팟 ${i + 1}위 · ${h[6] || h[5]}`)}
              className="flex w-full items-start gap-2 border-b border-[var(--cp-border-faint)] px-3 py-2 text-left last:border-b-0 hover:bg-[var(--cp-hover)]"
            >
              <span
                className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-[12.5px] font-bold text-white ${
                  i < 3 ? "bg-[#a8322a]" : "bg-[#7c2d5e]"
                }`}
              >
                {i + 1}
              </span>
              <span className="min-w-0 flex-1">
                {/* 배지는 첫 줄 끝에. 오른쪽 열로 빼 두면 아래 두 줄까지 폭이 줄어 세 줄로 깨진다(2026-09-18) */}
                <span className="flex items-center gap-1.5">
                  <span className="min-w-0 flex-1 truncate text-[14.5px] font-medium text-[var(--cp-text-strong)]">
                    {h[6] || `${h[5]} (대표 주소 없음, 격자 중심)`}
                  </span>
                  {h[12] === 1 && (
                    <span className="shrink-0 rounded bg-[#a8322a]/10 px-1.5 py-0.5 text-[11.5px] font-medium text-[#a8322a]">집중관리</span>
                  )}
                  {h[7] === 0 && (
                    <span className="shrink-0 rounded bg-[#8a530e]/12 px-1.5 py-0.5 text-[11.5px] font-medium text-amber-800">CCTV 없음</span>
                  )}
                </span>
                <span className="block text-[13px] text-[var(--cp-text-dim)]">
                  {h[5]} · 180일 민원 {h[3]} · 과태료 {h[4]}
                </span>
                {/* 12라운드: 왜 이 칸인가. 최근 90일 vs 이전 90일, 12개월 누계, 마지막 기록. 한 줄 안에 */}
                <span className="block text-[12.5px] text-[var(--cp-text-faint)]">
                  최근 90일 {h[9]}건{h[9] > h[10] ? "↑" : h[9] < h[10] ? "↓" : "="}이전 {h[10]}건 · 12개월 {h[8]}건{h[11] >= 0 ? ` · 마지막 ${h[11]}일 전` : ""}
                </span>
              </span>
            </button>
          ))}
        </div>
        <p className="mt-1 text-[13.5px] text-[var(--cp-text-faint)]">
          점수는 {d.hotspots.method}입니다. 행정수요 예측이지 발생의 인과를 예측하는 것은 아닙니다.
        </p>
      </section>

      {/* 수요 전망 */}
      <section>
        <SectionHead n="03" sub="운영 참고용 행정수요 전망">민원 접수 전망</SectionHead>
        <DetailCard onOpen={() => setModal("forecast")}>
          <div className="mb-1 flex items-end gap-3 pr-16">
            <span className="min-w-0">
              <span className="block text-[13px] text-[var(--cp-text-dim)]">
                {fcSoFar != null ? "집계 중인 달" : "다음 달"} {nextFc.m} 예상 접수
              </span>
              <span className="dump-meta-v block text-[24px] leading-none text-[var(--cp-text-strong)]">
                {nextFc.yhat}
                <span className="ml-0.5 font-sans text-[12px] font-medium text-[var(--cp-text-dim)]">건</span>
              </span>
            </span>
            <span className="min-w-0 pb-0.5 text-[12.5px] leading-snug text-[var(--cp-text-dim)]">
              80% 구간 {nextFc.lo}~{nextFc.hi}건
              {fcSoFar != null && (
                <>
                  <br />
                  {d.asof.slice(5).replace("-", "/")}까지 {fcSoFar}건 접수
                </>
              )}
            </span>
          </div>
          <ForecastChart data={data} />
          <p className="mt-1 text-[12.5px] leading-relaxed text-[var(--cp-text-faint)]">
            홀트윈터스 계절 모형 · 백테스트 오차 {d.forecast.backtest.mapePct}%(기준모형 {d.forecast.backtest.naiveMapePct ?? "미산출"}%) · 80% 구간 적중 {d.forecast.backtest.coverage80Pct ?? "미산출"}%(독립 검증 전).
            신고 접수량 전망이라 인력·순찰 배치 참고용이며 발생 예측은 아닙니다.
          </p>
        </DetailCard>
      </section>

      {/* 품목 분해 */}
      <section>
        <SectionHead n="04" sub={`과태료 ${d.fines.totalN.toLocaleString()}건 품목 분해`}>무엇을 버리다 적발됐나</SectionHead>
        <DetailCard onOpen={() => setModal("fines")}>
          <div className="mt-3 flex flex-col gap-2">
            {/* 수치가 길어(1,285건 · 7,169만원) 우측 고정폭 컬럼이 좁은 화면에서 줄바꿈으로 무너진다
               . 라벨+수치 한 줄, 막대는 아래 전체폭으로 적층 */}
            {d.fines.categories.map((c) => (
              <div key={c.cat}>
                <div className="flex items-baseline justify-between gap-2">
                  <span className="min-w-0 truncate text-[14.5px] text-[var(--cp-text)]">{c.cat}</span>
                  <span className="shrink-0 whitespace-nowrap font-mono text-[13.5px] text-[var(--cp-text-muted)]">
                    {c.n.toLocaleString()}건 · {KRW(c.amount)}
                  </span>
                </div>
                <span className="relative mt-0.5 block h-2 overflow-hidden rounded-full bg-[var(--cp-track,rgba(100,116,139,.18))]">
                  <i
                    className="absolute inset-y-0 left-0 rounded-full bg-[#c2410c]"
                    style={{ width: `${(c.n / maxCat) * 100}%` }}
                  />
                </span>
              </div>
            ))}
          </div>
          <p className="mt-2 border-l-2 border-[#c2410c] pl-2.5 text-[15px] font-medium leading-snug text-[var(--cp-text-strong)]">
            담배꽁초(차량) {cigShare}%는 주거 구조와 연관이 확인되지 않은 도로 현상입니다. 생활쓰레기 대책과 나눠
            관리해야 합니다.
          </p>
        </DetailCard>
      </section>

      {/* 처분 퍼널 */}
      <section>
        <SectionHead n="05" sub={`부과 ${KRW(d.fines.totalAmount)}`}>과태료는 징수되고 있나</SectionHead>
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
                  <p className="text-[13.5px] text-[var(--cp-text-dim)]">{g}</p>
                  <p className={`font-mono text-[17px] font-semibold ${bad ? "text-[#a8322a]" : "text-[var(--cp-text-strong)]"}`}>
                    {v.n.toLocaleString()}
                  </p>
                  <p className="whitespace-nowrap text-[12.5px] text-[var(--cp-text-faint)]">{KRW(v.amount)}</p>
                </div>
              )
            })}
          </div>
          <p className="mt-1.5 text-[13.5px] text-[var(--cp-text-faint)]">
            금액은 과세금액 합산(가산금 미포함 근사). 징수율 {d.fines.collectionRatePct}%는 감면·진행
            건 제외 기준.
          </p>
        </DetailCard>
      </section>

      {/* 처리 SLA */}
      <section>
        <SectionHead n="06" sub="접수에서 행정 종결까지">민원 처리 속도</SectionHead>
        <DetailCard onOpen={() => setModal("sla")}>
          <div className="mt-3 grid grid-cols-3 gap-1.5 text-center">
            {slaYears.map(([yr, s]) => {
              const worst = s.p90H === Math.max(...slaYears.map(([, x]) => x.p90H))
              return (
                <div key={yr} className={`rounded-lg py-1.5 ${worst ? "bg-[#a8322a]/8" : ""}`}>
                  <p className="text-[13.5px] text-[var(--cp-text-dim)]">
                    {yr}년{worst && <b className="ml-1 text-[12.5px] text-[#a8322a]">주의</b>}
                  </p>
                  <p className="font-mono text-[16px] font-semibold text-[var(--cp-text-strong)]">
                    {s.medianH}시간
                  </p>
                  <p className="text-[12.5px] text-[var(--cp-text-faint)]">
                    상위10% {s.p90H}시간 · 3일내 {s.within3dPct}%
                  </p>
                </div>
              )
            })}
          </div>
          <p className="mt-1.5 text-[13.5px] leading-relaxed text-[var(--cp-text-faint)]">
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

      {/* 구조 전망. 관리 취약 신축 공급 파이프라인 (법정동 기준이라 지도 대신 모달 상세) */}
      {d.permits && (
        <section>
          <SectionHead n="07" sub="관리 취약 신축이 어디로 들어오나">구조 전망</SectionHead>
          <DetailCard onOpen={() => setModal("permits")}>
            {/* 수치 세 칸 먼저. 문장 안에 숫자를 섞어 두면 줄바꿈에서 읽히지 않는다 */}
            <div className="mt-3 grid grid-cols-3 gap-1.5 text-center">
              {[
                { k: "소형 공동주택 허가", v: `${d.permits.guTotal.smallAptPermits12m}건`, s: "150세대 미만" },
                { k: "그 세대수", v: `${d.permits.guTotal.smallAptUnits12m.toLocaleString()}세대`, s: "의무관리 기준 미달" },
                { k: "단독·다가구 허가", v: `${d.permits.guTotal.detachedPermits12m}건`, s: "같은 기간" },
              ].map((t) => (
                <div key={t.k} className="rounded-lg border border-[var(--cp-border-faint)] px-1 py-2">
                  <p className="text-[13.5px] text-[var(--cp-text-dim)]">{t.k}</p>
                  <p className="font-mono text-[17px] font-semibold text-[var(--cp-text-strong)]">{t.v}</p>
                  <p className="text-[12.5px] text-[var(--cp-text-faint)]">{t.s}</p>
                </div>
              ))}
            </div>
            <p className="mt-2.5 text-[13px] text-[var(--cp-text-dim)]">최근 12개월 신축 허가(사용승인 전) · 법정동 기준 · 막대는 소형 공동주택 세대수</p>
            <div className="mt-1.5 flex flex-col gap-1">
              {d.permits.byDong.filter((r) => r.smallAptUnits > 0).map((r) => {
                const max = d.permits!.byDong[0].smallAptUnits || 1
                return (
                  <div key={r.dong} className="flex items-center gap-2">
                    <span className="w-14 shrink-0 text-[14.5px] text-[var(--cp-text)]">{r.dong}</span>
                    <span className="relative h-2.5 min-w-0 flex-1 overflow-hidden rounded-full bg-[var(--cp-track,rgba(100,116,139,.18))]">
                      <i
                        className="absolute inset-y-0 left-0 rounded-full bg-[#b45309]"
                        style={{ width: `${(r.smallAptUnits / max) * 100}%` }}
                      />
                    </span>
                    {/* 건수·세대수를 열로 맞춘다. 한 덩어리 문자열이면 자릿수가 달라 끝만 맞고 가운데가 흔들린다 */}
                    <span className="w-9 shrink-0 text-right font-mono text-[13.5px] tabular-nums text-[var(--cp-text-muted)]">{r.smallAptPermits}건</span>
                    <span className="w-[4.6rem] shrink-0 text-right font-mono text-[13.5px] tabular-nums text-[var(--cp-text-muted)]">
                      {r.smallAptUnits.toLocaleString()}세대
                    </span>
                  </div>
                )
              })}
            </div>
            <p className="mt-2 border-l-2 border-[#c2410c] pl-2.5 text-[15px] font-medium leading-snug text-[var(--cp-text-strong)]">
              의무관리 미달 소형 주거가 {d.permits.byDong.slice(0, 3).map((r) => r.dong.replace(/동$/, "")).join("·")}에 몰립니다. 발생 예고는 아니고, 준공 때부터 배출안내·공동배출 협의를 미리 적용할 후보 지역입니다.
            </p>
          </DetailCard>
        </section>
      )}

      {/* 서울시 맥락. 25개 구 비교·서울 전체 앱 추세 */}
      {d.seoul && (
        <section>
          <SectionHead n="08" sub="서울 열린데이터광장 공개 자료로 25개 구와 견줌">서울시 안에서 광진은 어디쯤인가</SectionHead>
          <DetailCard onOpen={() => setModal("seoul")}>
            <div className="mt-3 grid grid-cols-3 gap-1.5 text-center">
              <div className="rounded-lg border border-[var(--cp-border-faint)] px-1 py-2">
                <p className="text-[13.5px] text-[var(--cp-text-dim)]">무단투기 CCTV</p>
                <p className="font-mono text-[17px] font-semibold text-[var(--cp-text-strong)]">{d.seoul.cctv.gwangjin.dumping}대</p>
                <p className="text-[12.5px] text-[var(--cp-text-faint)]">보고 {d.seoul.cctv.reportingGus}개 구 중 {d.seoul.cctv.gwangjin.dumpingRank}위</p>
              </div>
              <div className="rounded-lg border border-[var(--cp-border-faint)] px-1 py-2">
                <p className="text-[13.5px] text-[var(--cp-text-dim)]">서울 앱 청소신고</p>
                <p className="font-mono text-[17px] font-semibold text-[var(--cp-text-strong)]">
                  {(() => {
                    const ys = Object.keys(d.seoul!.smartReport.cleaningByYear).sort()
                    const full = ys.filter((y) => y < period.lastYear)
                    const a = d.seoul!.smartReport.cleaningByYear[full[full.length - 2]] ?? 0
                    const b = d.seoul!.smartReport.cleaningByYear[full[full.length - 1]] ?? 0
                    return a ? `${(b / a).toFixed(2)}배` : "미산출"
                  })()}
                </p>
                <p className="text-[12.5px] text-[var(--cp-text-faint)]">최근 완결 2개년</p>
              </div>
              <div className="rounded-lg border border-[var(--cp-border-faint)] px-1 py-2">
                <p className="text-[13.5px] text-[var(--cp-text-dim)]">가로쓰레기통</p>
                <p className="font-mono text-[17px] font-semibold text-[var(--cp-text-strong)]">{d.seoul.streetBins.gwangjin202511.sites}곳</p>
                <p className="text-[12.5px] text-[var(--cp-text-faint)]">서울시 원천 · 구청 장부와 일치</p>
              </div>
            </div>
            <p className="mt-2 text-[13.5px] leading-relaxed text-[var(--cp-text-faint)]">
              앱 청소 신고 증가는 서울 전체에서도 보입니다. 채널고정 지표는 서울시 차원에서도 쓸 수 있고, 자치구별 증가 원인은 별도 확인이 필요합니다.
            </p>
          </DetailCard>
        </section>
      )}

      {/* 조치 대장 */}
      <section>
        <SectionHead n="09" sub="개입 사전등록부">조치 대장</SectionHead>
        <div className="rounded-lg border border-[var(--cp-border)] bg-[var(--cp-panel)] p-3">
          <p className="mb-2 text-[14.5px] leading-relaxed text-[var(--cp-text-muted)]">
            새 개입은 <b>실행 전에</b> 대상·기간·비교 대상·판정 기준을 등록하고, 등록한 설계대로만 평가합니다. CCTV 효과 철회를 되풀이하지 않기 위한 장치입니다.
          </p>
          {interventions === null ? (
            <p className="text-[14.5px] text-[var(--cp-text-dim)]">대장을 불러오지 못했습니다.</p>
          ) : interventions.length === 0 ? (
            <p className="text-[14.5px] text-[var(--cp-text-dim)]">등록된 조치가 없습니다.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {interventions.map((it) => (
                <div key={it.id} className="rounded-lg border border-[var(--cp-border-faint)] px-2.5 py-2">
                  <div className="flex items-center gap-2">
                    {/* 대장 JSON에 새 상태가 들어와도 화면이 깨지지 않게. 모르는 값은 원문 그대로 */}
                    <span
                      className={`rounded px-1.5 py-0.5 text-[12.5px] font-semibold ${STATUS_KO[it.status]?.cls ?? "bg-slate-100 text-slate-500"}`}
                    >
                      {STATUS_KO[it.status]?.label ?? it.status}
                    </span>
                    <span className="truncate text-[14.5px] font-medium text-[var(--cp-text-strong)]">
                      {it.title}
                    </span>
                    <span className="ml-auto shrink-0 font-mono text-[12.5px] text-[var(--cp-text-faint)]">
                      {it.id}
                    </span>
                  </div>
                  <p className="mt-1 text-[13.5px] leading-relaxed text-[var(--cp-text-dim)]">
                    지표 {it.successMetric} · 평가 {it.evalWindowDays}일 · 대조군 {it.control || "미정(평가 불가)"}
                  </p>
                  {it.result && (
                    <p className="mt-1 rounded bg-[var(--cp-hover)] px-2 py-1 text-[13.5px] text-[var(--cp-text)]">
                      평가: {it.result}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
          <p className="mt-2 text-[13.5px] text-[var(--cp-text-faint)]">
            등록·갱신 담당은 청소과 상황실 관리자입니다. 등록 요청은 담당자에게 전달합니다. 등록 방법은 관리자 문서에 있습니다.
          </p>
        </div>
      </section>

      <OpsModal id={modal} data={data} onClose={() => setModal(null)} />
    </div>
  )
}
