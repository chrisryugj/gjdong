"use client"

import { useMemo, useState } from "react"
import type { DumpingMapData } from "@/lib/dumping/types"
import { appStep, finesCensorNote } from "@/lib/dumping/facts"
import { CHANNEL_DEF } from "@/lib/dumping/labels"

// 지도 아래 월별 띠(2026-09-18, 지도 전면 디자인). 민원 접수·과태료 위반 두 지표를 탭으로 오가고,
// 막대에 마우스를 올리면(누르면 고정) 그 달의 건수·구성·전년 같은 달 대비가 뜬다.
// 민원은 앱 신고 계단 상승(facts.appStep) 이후 달을 액센트로, 과태료는 최근 3개월을 우측 절단(부과 지연) 표시로 흐리게.
// 운영·전망 탭의 전망 차트·채널 카드와 같은 원천(yearly.complaintsMonthly · channels.monthly · fines.monthly · fines.byRoute.monthly)

type Series = "comp" | "enf"
const SERIES: { id: Series; label: string; basis: string }[] = [
  { id: "comp", label: "민원 접수", basis: "접수일 기준" },
  { id: "enf", label: "과태료 위반", basis: "위반일 기준" },
]
const CENSOR_MONTHS = 3 // 과태료 우측 절단으로 보는 최근 달 수(finesCensorNote와 같은 말)

const fmt = (k: string) => `${k.slice(0, 4)}.${Number(k.slice(5, 7))}`
const prevYear = (k: string) => `${Number(k.slice(0, 4)) - 1}${k.slice(4)}`

export default function TimelineStrip({ data }: { data: DumpingMapData }) {
  const [series, setSeries] = useState<Series>("comp")
  const [hover, setHover] = useState<string | null>(null)
  const [pinned, setPinned] = useState<string | null>(null)

  // 두 지표가 같은 축을 쓴다. 과태료 월별에는 2022~2023 이월 한 자리 건수가 있어 민원 첫 달부터 자른다
  const keys = useMemo(() => Object.keys(data.yearly.complaintsMonthly).sort(), [data])
  const step = useMemo(() => appStep(data), [data])
  const values: Record<string, number> = series === "comp" ? data.yearly.complaintsMonthly : data.decision.fines.monthly
  // 구성. 민원은 신고 채널(앱·120·직접), 과태료는 적발 경로(신고·수시)
  const parts: { label: string; color: string; monthly: Record<string, number> }[] =
    series === "comp"
      ? (Object.keys(CHANNEL_DEF) as (keyof typeof CHANNEL_DEF)[]).map((c) => ({
          label: CHANNEL_DEF[c].label,
          color: CHANNEL_DEF[c].front,
          monthly: data.decision.channels.monthly[c] ?? {},
        }))
      : [
          { label: "신고 유래", color: "#d9480f", monthly: data.decision.fines.byRoute?.monthly?.["신고"] ?? {} },
          { label: "순찰 적발", color: "#8f2f08", monthly: data.decision.fines.byRoute?.monthly?.["수시"] ?? {} },
        ]
  if (keys.length < 2) return null
  const max = Math.max(1, ...keys.map((k) => values[k] ?? 0))
  const last = keys[keys.length - 1]
  const censorFrom = keys[Math.max(0, keys.length - CENSOR_MONTHS)]
  const sel = pinned ?? hover
  const selIdx = sel ? keys.indexOf(sel) : -1
  // 축 라벨은 1월과 첫·마지막 달만. 32개 달을 다 적으면 읽히지 않는다
  const axis = keys.filter((k, i) => k.endsWith("-01") || i === 0 || i === keys.length - 1)

  const switchSeries = (s: Series) => {
    setSeries(s)
    setPinned(null)
    setHover(null)
  }

  // 툴팁 내용. 건수·구성·전년 같은 달 대비
  const tip = (k: string) => {
    const v = values[k] ?? 0
    const py = prevYear(k)
    const pv = keys.includes(py) ? (values[py] ?? 0) : null
    const diff = pv != null && pv > 0 ? Math.round(((v - pv) / pv) * 100) : null
    const comp = parts.map((p) => ({ ...p, n: p.monthly[k] ?? 0 })).filter((p) => p.n > 0)
    const isLast = k === last && k === data.decision.asof.slice(0, 7)
    const censored = series === "enf" && k >= censorFrom
    return (
      <div className="w-56 text-[12px] leading-snug text-[var(--cp-text)]">
        <p className="flex items-baseline justify-between gap-2">
          <span className="font-mono text-[13px] font-bold text-[var(--cp-text-strong)]">{fmt(k)}</span>
          <span>
            <b className="font-mono text-[15px] font-bold text-[var(--cp-text-strong)]">{v.toLocaleString()}</b>건
            {isLast && <span className="text-[var(--cp-text-faint)]"> · 집계 중</span>}
          </span>
        </p>
        {comp.length > 0 && (
          <ul className="mt-1.5 flex flex-col gap-0.5">
            {comp.map((p) => (
              <li key={p.label} className="flex items-center gap-1.5 text-[var(--cp-text-muted)]">
                <i className="h-2 w-2 shrink-0 rounded-[2px]" style={{ background: p.color }} />
                <span className="flex-1">{p.label}</span>
                <span className="font-mono text-[var(--cp-text-strong)]">{p.n.toLocaleString()}</span>
                <span className="w-8 text-right font-mono text-[12px] text-[var(--cp-text-faint)]">{v ? Math.round((p.n / v) * 100) : 0}%</span>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-1.5 border-t border-[var(--cp-border-faint)] pt-1.5 text-[var(--cp-text-dim)]">
          {pv != null ? (
            <>
              전년 같은 달 {pv.toLocaleString()}건
              {diff != null && (
                <span className={`ml-1 font-mono font-semibold ${diff > 0 ? "text-(--dump-accent)" : diff < 0 ? "text-[#0b4f45]" : ""}`}>
                  {diff > 0 ? "+" : ""}
                  {diff}%
                </span>
              )}
            </>
          ) : (
            "전년 같은 달 자료 없음"
          )}
          {series === "comp" && step && k === step.month && (
            <span className="block text-(--dump-accent)">앱 신고가 {step.from}→{step.to}건으로 뛴 달. 원인은 확인 중</span>
          )}
          {censored && <span className="block text-[var(--cp-text-faint)]">부과 처리 지연으로 과소 집계될 수 있음</span>}
        </p>
      </div>
    )
  }

  return (
    <div className="relative px-4 pb-2 pt-2" onMouseLeave={() => setHover(null)}>
      <div className="flex items-center justify-between gap-3">
        {/* 지표 탭. 분절 알약, 선택은 잉크 바탕 */}
        <div role="tablist" aria-label="월별 지표" className="flex rounded-full border border-[var(--cp-border)] p-0.5">
          {SERIES.map((s) => (
            <button
              key={s.id}
              role="tab"
              aria-selected={series === s.id}
              onClick={() => switchSeries(s.id)}
              className={`rounded-full px-2.5 py-0.5 text-[12px] font-semibold transition-colors ${
                series === s.id ? "bg-[var(--dump-ink)] text-[var(--dump-paper)]" : "text-[var(--cp-text-dim)] hover:text-[var(--cp-text-strong)]"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
        <span className="min-w-0 truncate text-[12px] font-semibold text-[var(--cp-text-dim)]">
          <b className="font-mono text-[var(--cp-text-strong)]">{fmt(last)}</b> {(values[last] ?? 0).toLocaleString()}건 · {SERIES.find((s) => s.id === series)?.basis}
          {series === "comp" && step && (
            <>
              {" "}
              · 앱 신고 <span className="font-mono">{fmt(step.month)}</span> 계단 상승
            </>
          )}
          {series === "enf" && " · 최근 3개월은 과소 집계 가능"}
        </span>
      </div>
      <div
        className="mt-1.5 flex h-10 items-end gap-[3px]"
        role="img"
        aria-label={`월별 ${SERIES.find((s) => s.id === series)?.label} ${fmt(keys[0])}부터 ${fmt(last)}까지`}
        title={series === "enf" ? finesCensorNote(data) : undefined}
      >
        {keys.map((k) => {
          const v = values[k] ?? 0
          const on = k === sel
          const hi = series === "comp" ? (step ? k >= step.month : false) : k < censorFrom
          const censored = series === "enf" && k >= censorFrom
          return (
            <button
              key={k}
              type="button"
              aria-label={`${fmt(k)} ${v.toLocaleString()}건`}
              aria-pressed={pinned === k}
              onMouseEnter={() => setHover(k)}
              onFocus={() => setHover(k)}
              onClick={() => setPinned((p) => (p === k ? null : k))}
              className="group flex h-full min-w-0 flex-1 items-end"
            >
              <i
                className={`block w-full rounded-t-[2px] transition-colors ${
                  on ? "bg-[var(--dump-ink)]" : hi ? "bg-(--dump-accent)" : censored ? "bg-(--dump-accent)/35" : "bg-[var(--cp-border-strong)] group-hover:bg-[var(--cp-text-faint)]"
                }`}
                style={{ height: `${Math.max(4, (v / max) * 100)}%` }}
              />
            </button>
          )
        })}
      </div>
      <div className="mt-1 flex justify-between font-mono text-[12px] text-[var(--cp-text-faint)]">
        {axis.map((k) => (
          <span key={k}>{fmt(k)}</span>
        ))}
      </div>
      {/* 툴팁. 막대 위로 뜨고, 양 끝 막대는 안쪽으로 붙인다. 누르면 고정(다시 누르면 해제) */}
      {sel && selIdx >= 0 && (
        <div
          className="dump-fl pointer-events-none absolute bottom-[calc(100%-6px)] z-10 rounded-xl px-3 py-2.5"
          style={{
            left: `calc(16px + (100% - 32px) * ${((selIdx + 0.5) / keys.length).toFixed(4)})`,
            transform: selIdx < 4 ? "translateX(-10%)" : selIdx > keys.length - 5 ? "translateX(-90%)" : "translateX(-50%)",
          }}
        >
          {tip(sel)}
          {pinned === sel && <p className="mt-1 text-right text-[12px] text-[var(--cp-text-faint)]">고정됨 · 다시 누르면 해제</p>}
        </div>
      )}
    </div>
  )
}
