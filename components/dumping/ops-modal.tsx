"use client"

import { useEffect } from "react"
import type { DumpingMapData } from "@/lib/dumping/types"

// 운영·전망 탭 상세 모달 — 지도로 표현할 수 없는 지표는 여기서 표·차트·해설로 자세히 보여준다.
// 셸(ModalShell)과 공용 조각(KRW·ForecastChart)은 methods-modal·ops-panel이 함께 쓴다.

export type OpsModalId = "funnel" | "channels" | "forecast" | "fines" | "sla" | "permits"

export const KRW = (n: number) => `${(n / 10000).toLocaleString(undefined, { maximumFractionDigits: 0 })}만원`

export function ModalShell({
  title,
  sub,
  onClose,
  children,
}: {
  title: string
  sub?: string
  onClose: () => void
  children: React.ReactNode
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose()
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onClose])
  return (
    <div
      className="fixed inset-0 z-[1100] flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[88dvh] w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-[var(--cp-border)] bg-white shadow-xl"
      >
        <header className="flex items-start justify-between gap-3 border-b border-[var(--cp-border)] px-5 py-3.5">
          <div className="min-w-0">
            <h2 className="text-[17px] font-bold text-[var(--cp-text-strong)]">{title}</h2>
            {sub && <p className="mt-0.5 text-[13px] text-[var(--cp-text-dim)]">{sub}</p>}
          </div>
          <button
            onClick={onClose}
            aria-label="닫기"
            className="shrink-0 rounded-full px-2.5 py-1 text-[15px] text-[var(--cp-text-dim)] hover:bg-[var(--cp-hover)]"
          >
            ✕
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
      </div>
    </div>
  )
}

// 소제목·해설·표 공용 스타일 — 모달 안 가독성 통일
export function H({ children }: { children: React.ReactNode }) {
  return <h3 className="mb-1.5 mt-4 text-[13px] font-semibold tracking-wide text-[var(--cp-text-dim)] first:mt-0">{children}</h3>
}

function Note({ children }: { children: React.ReactNode }) {
  return <p className="mt-2 text-[12.5px] leading-relaxed text-[var(--cp-text-faint)]">{children}</p>
}

function Callout({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-2 rounded-lg bg-[#0c6155]/10 px-3 py-2 text-[14px] font-semibold leading-relaxed text-[#0a4a41]">
      {children}
    </p>
  )
}

function Table({ head, rows }: { head: string[]; rows: (string | number)[][] }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-[var(--cp-border)]">
      <table className="w-full text-[13px]">
        <thead>
          <tr className="border-b border-[var(--cp-border)] bg-[var(--cp-hover)] text-left">
            {head.map((h, i) => (
              <th key={h} className={`px-2.5 py-1.5 font-semibold text-[var(--cp-text-muted)] ${i > 0 ? "text-right" : ""}`}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, ri) => (
            <tr key={ri} className="border-b border-[var(--cp-border-faint)] last:border-b-0">
              {r.map((c, ci) => (
                <td
                  key={ci}
                  className={`px-2.5 py-1.5 ${ci > 0 ? "text-right font-mono text-[var(--cp-text)]" : "text-[var(--cp-text-strong)]"}`}
                >
                  {typeof c === "number" ? c.toLocaleString() : c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// 월별 시계열 + 전망 밴드 SVG — 패널(소형)·모달(대형) 공용
export function ForecastChart({ data, tall }: { data: DumpingMapData; tall?: boolean }) {
  const f = data.decision.forecast
  const hist = Object.entries(f.series)
  const all = [...hist.map(([m, v]) => ({ m, v })), ...f.fc.map((p) => ({ m: p.m, v: p.yhat }))]
  const maxV = Math.max(...all.map((p) => p.v), ...f.fc.map((p) => p.hi))
  const W = 320
  const H = tall ? 130 : 80
  const x = (i: number) => (i / (all.length - 1)) * (W - 8) + 4
  const y = (v: number) => H - 14 - (v / maxV) * (H - 22)
  const histPts = hist.map(([, v], i) => `${x(i)},${y(v)}`).join(" ")
  const fcPts = f.fc.map((p, i) => `${x(hist.length + i)},${y(p.yhat)}`).join(" ")
  const bridge = `${x(hist.length - 1)},${y(hist[hist.length - 1][1])}`
  const band = [
    ...f.fc.map((p, i) => `${x(hist.length + i)},${y(p.hi)}`),
    ...[...f.fc].reverse().map((p, i) => `${x(hist.length + f.fc.length - 1 - i)},${y(p.lo)}`),
  ].join(" ")
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
      <polygon points={band} fill="#0c6155" opacity="0.12" />
      <polyline points={histPts} fill="none" stroke="var(--cp-text-muted)" strokeWidth="1.4" />
      <polyline points={`${bridge} ${fcPts}`} fill="none" stroke="#0c6155" strokeWidth="1.8" strokeDasharray="4 3" />
      {/* 실적/전망 경계 — 라벨 대신 세로 점선 (가운데 라벨은 우측 끝 라벨과 겹침) */}
      <line
        x1={x(hist.length - 1)}
        x2={x(hist.length - 1)}
        y1={4}
        y2={H - 12}
        stroke="var(--cp-text-faint)"
        strokeWidth="1"
        strokeDasharray="2 2"
      />
      {[hist[0][0], f.fc[f.fc.length - 1].m].map((m, i) => (
        <text
          key={m + i}
          x={i === 0 ? 4 : W - 4}
          y={H - 2}
          textAnchor={i === 0 ? "start" : "end"}
          className="fill-[var(--cp-text-faint)] text-[9px]"
        >
          {m}
        </text>
      ))}
    </svg>
  )
}

// 품목 2계열 월별 추이 — 생활쓰레기 계열 vs 차량 담배꽁초 (두 현상이 다르게 움직이는지 육안 확인)
function CategoryTrendChart({ data }: { data: DumpingMapData }) {
  const cm = data.decision.fines.categoryMonthly
  // 2022~2023년은 이월 부과 소수 건뿐이라 축을 왜곡한다 — 본 관측창(2024.1~)만 그린다
  const months = [...new Set(Object.values(cm).flatMap((m) => Object.keys(m)))]
    .filter((m) => m >= "2024-01")
    .sort()
  const cig = months.map((m) => cm["담배꽁초(차량)"]?.[m] ?? 0)
  const life = months.map((m) =>
    Object.entries(cm)
      .filter(([cat]) => cat !== "담배꽁초(차량)")
      .reduce((s, [, mm]) => s + (mm[m] ?? 0), 0),
  )
  const W = 320
  const HH = 110
  const maxV = Math.max(...life, ...cig, 1)
  const x = (i: number) => (i / (months.length - 1)) * (W - 8) + 4
  const y = (v: number) => HH - 14 - (v / maxV) * (HH - 22)
  const line = (vs: number[]) => vs.map((v, i) => `${x(i)},${y(v)}`).join(" ")
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${HH}`} className="w-full">
        <polyline points={line(life)} fill="none" stroke="#0c6155" strokeWidth="1.8" />
        <polyline points={line(cig)} fill="none" stroke="#b45309" strokeWidth="1.8" />
        {[months[0], months[months.length - 1]].map((m, i) => (
          <text
            key={m}
            x={i === 0 ? 4 : W - 4}
            y={HH - 2}
            textAnchor={i === 0 ? "start" : "end"}
            className="fill-[var(--cp-text-faint)] text-[9px]"
          >
            {m}
          </text>
        ))}
      </svg>
      <p className="mt-1 flex gap-4 text-[12px] text-[var(--cp-text-dim)]">
        <span><i className="mr-1 inline-block h-0.5 w-4 bg-[#0c6155] align-middle" />생활쓰레기 계열(음식물·봉투·이동·시간외 등)</span>
        <span><i className="mr-1 inline-block h-0.5 w-4 bg-[#b45309] align-middle" />담배꽁초(차량)</span>
      </p>
    </div>
  )
}

export default function OpsModal({
  id,
  data,
  onClose,
}: {
  id: OpsModalId | null
  data: DumpingMapData | null
  onClose: () => void
}) {
  if (!id || !data) return null
  const d = data.decision
  const f = d.fines

  if (id === "funnel") {
    const MEANING: Record<string, string> = {
      "납부 완료": "완납, 사전통지 단계 자진납부 종결, 초과 납부 포함",
      체납: "납기가 지나도록 내지 않은 건",
      "감면·감액": "이의 인정, 생계 곤란 등으로 깎아주거나 전액 면제한 건",
      "진행 중": "부과 직후이거나 정리 보류 상태",
    }
    return (
      <ModalShell title="과태료 처분·징수 상세" sub={`부과 ${f.totalN.toLocaleString()}건 · ${KRW(f.totalAmount)} (2024.1~2026.8 위반분)`} onClose={onClose}>
        <H>단계별 현황</H>
        <Table
          head={["단계", "건수", "금액", ""]}
          rows={Object.entries(f.funnel).map(([g, v]) => [g, v.n, KRW(v.amount), MEANING[g] ?? ""])}
        />
        <Callout>
          징수율 {f.collectionRatePct}%. 부과한 과태료는 대부분 실제로 걷히고 있다. 단속의 집행력은
          문제가 아니다.
        </Callout>
        <H>읽는 법</H>
        <p className="text-[14px] leading-relaxed text-[var(--cp-text-muted)]">
          징수율은 감면·진행 건을 뺀 나머지 중 납부 완료 비율이다. 체납 {f.arrearsN}건{" "}
          {KRW(f.arrearsAmount)}은 금액 자체보다 상습 체납과 상습 투기 지점이 겹치는지가 다음 분석
          과제다(현 데이터에는 체납자 위치가 없다).
        </p>
        <Note>금액은 과세금액 합산이며 가산금은 포함하지 않은 근사치다. 원천: 청소과 과태료 부과내역(세무 총괄과세 조회).</Note>
      </ModalShell>
    )
  }

  if (id === "channels") {
    const years = [...new Set(Object.values(d.channels.yearly).flatMap((y) => Object.keys(y)))].sort()
    const get = (ch: string, y: string) => d.channels.yearly[ch]?.[y] ?? 0
    return (
      <ModalShell title="민원 채널 구조" sub="같은 발생이라도 신고 창구가 다르면 통계가 다르게 보인다" onClose={onClose}>
        <H>연도별 접수 (건)</H>
        <Table
          head={["연도", "앱", "120", "직접·전화", "합계"]}
          rows={years.map((y) => [
            y === years[years.length - 1] ? `${y} (1~8월)` : y,
            get("app", y),
            get("c120", y),
            get("direct", y),
            get("app", y) + get("c120", y) + get("direct", y),
          ])}
        />
        <Callout>
          민원 총건수가 2.10배로 뛴 동안 앱 접수만 2.97배로 늘었고 120·직접은 1.10배로 거의
          그대로다. 늘어난 건 무단투기가 아니라 신고의 편리함이다.
        </Callout>
        <H>그래서 어떻게 쓰나</H>
        <p className="text-[14px] leading-relaxed text-[var(--cp-text-muted)]">
          연도 비교나 성과 평가는 앱을 뺀 채널고정(120·직접) 수치로 한다. 신고 성향과 무관한 과태료
          부과(단속 실측)도 같은 1.1배 수준이라 이 해석을 뒷받침한다.
        </p>
        <Note>앱 = 서울스마트불편신고. 채널은 민원 제목의 접수 경로 표기로 분류했다.</Note>
      </ModalShell>
    )
  }

  if (id === "forecast") {
    return (
      <ModalShell title="민원 접수 전망" sub="운영 참고용. 인력·순찰 배치 계획을 위한 행정수요 전망" onClose={onClose}>
        <ForecastChart data={data} tall />
        <H>향후 6개월 전망 (80% 구간)</H>
        <Table
          head={["월", "예상 접수", "적으면", "많으면"]}
          rows={d.forecast.fc.map((p) => [p.m, `${p.yhat}건`, `${p.lo}건`, `${p.hi}건`])}
        />
        <H>어떻게 계산했나</H>
        <p className="text-[14px] leading-relaxed text-[var(--cp-text-muted)]">
          지난 31개월의 월별 접수에서 수준·추세·계절 반복(여름에 많고 겨울에 적은 패턴)을 학습하는
          홀트윈터스 계절 모형을 썼다. 직전 8개월을 한 달씩 가려놓고 맞혀보는 백테스트에서 평균
          오차는 {d.forecast.backtest.mapePct}%였다.
        </p>
        <Callout>
          이 수치는 신고 접수량(앱 보급 추세 포함) 전망이다. 무단투기 발생량의 예측이 아니고, 대책
          효과를 계산하는 용도로도 쓸 수 없다.
        </Callout>
      </ModalShell>
    )
  }

  if (id === "fines") {
    const cigN = f.categories.find((c) => c.cat === "담배꽁초(차량)")?.n ?? 0
    return (
      <ModalShell title="품목별 적발 상세" sub={`과태료 ${f.totalN.toLocaleString()}건의 과세대상 분류`} onClose={onClose}>
        <H>품목별 건수·금액</H>
        <Table
          head={["품목", "건수", "비중", "부과액"]}
          rows={f.categories.map((c) => [
            c.cat,
            c.n,
            `${Math.round((c.n / f.totalN) * 100)}%`,
            KRW(c.amount),
          ])}
        />
        <H>월별 추이 · 두 현상은 따로 움직인다</H>
        <CategoryTrendChart data={data} />
        <Callout>
          담배꽁초(차량) {Math.round((cigN / f.totalN) * 100)}%는 주행 중 도로에서 벌어지는 일이라
          무관리주거·배출환경을 겨냥하는 생활쓰레기 대책과 원인도 처방도 다르다. 지표를 합쳐서
          관리하면 어느 쪽 성과도 읽을 수 없다.
        </Callout>
        <Note>
          분류는 과세대상 문구의 키워드 규칙(담배, 대형, 시간외, 규격봉투, 음식물, 이동배출 순)으로
          했고, 격자 회귀가 설명하는 본체는 생활쓰레기 계열이다.
        </Note>
      </ModalShell>
    )
  }

  if (id === "sla") {
    const years = Object.entries(d.sla.byYear)
    return (
      <ModalShell title="민원 처리 속도 상세" sub="접수부터 행정 종결까지 걸린 시간" onClose={onClose}>
        <H>연도별 처리 시간</H>
        <Table
          head={["연도", "절반은 이내", "느린 10%", "3일 내 처리", "표본"]}
          rows={years.map(([y, s]) => [
            y === "2026" ? "2026 (1~8월)" : y,
            `${s.medianH}시간`,
            `${s.p90H}시간`,
            `${s.within3dPct}%`,
            `${s.n.toLocaleString()}건`,
          ])}
        />
        <H>읽는 법</H>
        <p className="text-[14px] leading-relaxed text-[var(--cp-text-muted)]">
          "절반은 이내"(중앙값)는 보통의 민원이 처리되는 속도, "느린 10%"는 밀릴 때의 속도다. 2025년에
          크게 좋아졌다가 2026년 들어 느린 쪽 꼬리가 다시 길어졌는데, 앱 민원 급증과 같은 시기다.
          처리 물량이 인력을 앞지르기 시작했다는 신호로 읽을 수 있다.
        </p>
        <Note>{d.sla.note}. 주민이 체감하는 "현장 수거까지 걸린 시간"을 재려면 배차·작업 기록이 필요하다(필요 데이터 명세 참조).</Note>
      </ModalShell>
    )
  }

  // permits — 구조 전망 상세
  const pm = d.permits
  if (!pm) return null
  return (
    <ModalShell title="구조 전망 상세" sub={pm.window} onClose={onClose}>
      <H>법정동별 신축 파이프라인</H>
      <Table
        head={["법정동", "진행중 전체", "소형 공동주택", "세대수", "단독·다가구"]}
        rows={pm.byDong.map((r) => [r.dong, r.inProgress, r.smallAptPermits, r.smallAptUnits, r.detached])}
      />
      <H>왜 무단투기 대시보드에 건축 허가가 나오나</H>
      <p className="text-[14px] leading-relaxed text-[var(--cp-text-muted)]">
        이 분석의 최강 예측변수는 "관리주체 없는 주거"다. 세대수 150세대 미만 공동주택은
        공동주택관리법상 의무관리 대상이 아니라 관리사무소·경비·공동 배출장이 없는 경우가 많다.
        지금 허가받아 지어지는 소형 주택 {pm.guTotal.smallAptUnits12m.toLocaleString()}세대는 2~3년 안에
        같은 성격의 주거 스톡으로 편입된다.
      </p>
      <Callout>
        준공·입주 시점에 맞춰 배출안내 동봉과 공동배출 협의를 미리 거는 것이, 늘어나는 위험 지역을
        뒤쫓는 대신 앞지르는 방법이다.
      </Callout>
      <Note>
        "진행중"은 허가는 났으나 사용승인 전인 건(허가 5년 경과 미착공 제외). 출처: 국토교통부
        건축HUB 인허가({pm.asof} 실측). 법정동 기준이라 지도의 행정동 경계와 1:1로 겹치지 않아 지도
        표시 대신 표로 제공한다. 인과 예측이 아니라 주거 구조 변화의 방향을 읽는 전망이다.
      </Note>
    </ModalShell>
  )
}
