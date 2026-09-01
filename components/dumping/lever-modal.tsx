"use client"

import { useEffect, useMemo } from "react"
import type { OntoGraph } from "@/lib/dumping/types"
import {
  costBadge,
  easyVerdict,
  evidenceFor,
  factorStats,
  FACTOR_SHORT,
  primaryStat,
  reasonSentences,
  STATUS_FALLBACK,
  STATUS_STYLE,
  vizForLever,
  type FactorStat,
  type LeverView,
} from "./lever-view"

// 제안이유 모달 — 정책 보드에서 사업 카드를 누르면 "왜 이걸 하자는 건가"를 보여준다.
// 통계 용어를 그대로 늘어놓지 않고, 쉬운 문장 + 그림(인과 흐름·요인 강도 막대)으로 설명한다.
// 내용은 전부 graph.json에서 파생 — 별도 원고를 두지 않는다.

const POS = "#a8322a" // 발생을 늘리는 방향
const NEG = "#1c4f96" // 발생을 줄이는 방향
const HI = "#0c6155" // 이 사업이 겨냥하는 요인

// 요인 강도 막대 한 줄 — beta는 0을 가운데 두고 좌우로, rho는 왼쪽에서 오른쪽으로
function StatRow({ s, max, highlight }: { s: FactorStat; max: number; highlight: boolean }) {
  const ratio = Math.min(1, Math.abs(s.value) / max)
  const signed = s.kind === "beta"
  const width = `${ratio * (signed ? 50 : 100)}%`
  const color = highlight ? HI : s.value < 0 ? NEG : POS
  return (
    <div className={`rounded-lg px-2 py-1.5 ${highlight ? "bg-[#0c6155]/8" : ""}`}>
      <div className="flex items-baseline gap-2">
        <span
          className={`min-w-0 flex-1 text-[13.5px] leading-snug ${
            highlight ? "font-bold text-[#0a4a41]" : "text-[var(--cp-text-muted)]"
          }`}
        >
          {s.easy}
          {highlight && (
            <span className="ml-1.5 whitespace-nowrap rounded bg-[#0c6155] px-1.5 py-0.5 text-[11px] font-bold text-white">
              이 사업이 겨냥
            </span>
          )}
        </span>
        <span className="shrink-0 font-mono text-[12px] text-[var(--cp-text-faint)]">
          {s.value > 0 ? "+" : ""}
          {s.value.toFixed(3)}
        </span>
      </div>
      <div className="relative mt-1 h-2.5 overflow-hidden rounded-full bg-[var(--cp-hover2)]">
        <i
          className="absolute top-0 h-full rounded-full transition-[width] duration-500"
          style={{
            width,
            background: color,
            left: signed ? (s.value >= 0 ? "50%" : undefined) : 0,
            right: signed && s.value < 0 ? "50%" : undefined,
          }}
        />
        {/* 0 기준선은 막대 위에 — 아래 깔면 긴 막대에 가려 좌우 의미가 안 읽힌다 */}
        {signed && (
          <i className="absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-white shadow-[0_0_0_0.5px_rgba(15,23,42,0.35)]" />
        )}
      </div>
    </div>
  )
}

function StatGroup({
  title,
  caption,
  stats,
  targeted,
}: {
  title: string
  caption: string
  stats: FactorStat[]
  targeted: Set<string>
}) {
  if (!stats.length) return null
  // 상관 ρ는 0~1 절대 척도라 1을 기준으로 그려야 "1에 가깝다"가 눈에 보인다.
  // 표준화 β는 절대 상한이 없어 그 그룹 안의 최대값을 기준으로 삼는다.
  const max = stats[0].kind === "rho" ? 1 : Math.max(...stats.map((s) => Math.abs(s.value)))
  const sorted = [...stats].sort((a, b) => Math.abs(b.value) - Math.abs(a.value))
  return (
    <div className="rounded-xl border border-[var(--cp-border)] p-2.5">
      <p className="px-1 text-[13.5px] font-bold text-[var(--cp-text-strong)]">{title}</p>
      <p className="mb-1.5 px-1 text-[12.5px] leading-relaxed text-[var(--cp-text-dim)]">{caption}</p>
      <div className="flex flex-col gap-0.5">
        {sorted.map((s) => (
          <StatRow key={`${s.kind}-${s.id}`} s={s} max={max} highlight={targeted.has(s.id)} />
        ))}
      </div>
    </div>
  )
}

// 인과 흐름 — [사업] → [겨냥 대상] → [무단투기 발생]. 좁은 화면에서는 세로로 쌓는다.
function FlowDiagram({ lever, target }: { lever: string; target: string | null }) {
  const box = (text: string, cls: string) => (
    <span className={`flex-1 rounded-lg px-2.5 py-2 text-center text-[13px] font-semibold leading-snug ${cls}`}>
      {text}
    </span>
  )
  const arrow = (caption: string) => (
    <span className="flex shrink-0 flex-row items-center justify-center gap-1 text-[11px] text-[var(--cp-text-faint)] sm:flex-col sm:gap-0">
      <span className="rotate-90 text-[15px] leading-none text-[var(--cp-text-dim)] sm:rotate-0">→</span>
      {caption}
    </span>
  )
  return (
    <div className="flex flex-col items-stretch gap-1 sm:flex-row sm:gap-1.5">
      {box(lever, "bg-[#0c6155] text-white")}
      {arrow("겨냥")}
      {box(target ?? "수거·단속 운영 방식", "bg-[#0c6155]/12 text-[#0a4a41]")}
      {arrow("줄임")}
      {box("무단투기 발생", "border border-[var(--cp-border-strong)] text-[var(--cp-text-strong)]")}
    </div>
  )
}

interface LeverModalProps {
  lever: LeverView | null
  graph: OntoGraph
  onClose: () => void
  onShowMap: (lever: LeverView) => void
}

export default function LeverModal({ lever, graph, onClose, onShowMap }: LeverModalProps) {
  useEffect(() => {
    if (!lever) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [lever, onClose])

  const stats = useMemo(() => factorStats(graph), [graph])
  const reasons = useMemo(() => (lever ? reasonSentences(lever, stats) : []), [lever, stats])
  const evidence = useMemo(() => (lever ? evidenceFor(lever, graph) : []), [lever, graph])
  const easy = useMemo(() => (lever ? easyVerdict(lever, graph) : null), [lever, graph])

  if (!lever) return null

  const proposal = lever.status === "제안"
  const status = STATUS_STYLE[lever.status] ?? { label: lever.status, cls: "bg-slate-400 text-white" }
  const cost = costBadge(lever.costNote, undefined)
  const targeted = new Set(lever.targets.map((t) => t.id))
  const top = primaryStat(lever, stats)
  const betas = stats.filter((s) => s.kind === "beta")
  const rhos = stats.filter((s) => s.kind === "rho")
  // 통계 효과 근거가 아니라 자원배분 논리로만 유지하는 제안 — 오독하면 안 되는 대목
  const caveat = lever.node.props.note != null ? String(lever.node.props.note) : null
  const viz = vizForLever(lever)

  return (
    <div
      className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/35 p-4 animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        // --cp-panel은 라이트 테마에서 비치는 틴트 — 떠 있는 모달은 불투명 흰색이어야 한다
        className="flex max-h-[86dvh] w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-[var(--cp-border)] bg-white shadow-2xl animate-in fade-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-[var(--cp-border)] px-5 py-3.5">
          <div className="min-w-0">
            <span className="mb-1 flex flex-wrap items-center gap-1.5">
              <span className={`rounded px-1.5 py-0.5 text-[11.5px] font-bold ${status.cls}`}>{status.label}</span>
              {cost && (
                <span className={`rounded px-1.5 py-0.5 text-[11.5px] font-semibold ${cost.cls}`}>{cost.label}</span>
              )}
            </span>
            <h3 className="text-[18.5px] font-bold leading-snug text-[var(--cp-text-strong)]">{lever.node.label}</h3>
          </div>
          <button
            onClick={onClose}
            aria-label="닫기"
            className="mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[var(--cp-border)] text-[16px] text-[var(--cp-text-muted)] hover:bg-[var(--cp-hover)] hover:text-[var(--cp-text-strong)]"
          >
            ✕
          </button>
        </div>

        <div className="min-h-0 overflow-y-auto px-5 py-4">
          <h4 className="mb-2 text-[12.5px] font-bold tracking-wide text-[var(--cp-text-dim)]">
            {proposal ? "이 사업을 제안하는 까닭" : "검증 결과"}
          </h4>

          {proposal ? (
            <>
              <div className="mb-3.5 rounded-xl bg-[#0c6155]/8 p-2.5">
                <FlowDiagram
                  lever={lever.node.label.split("(")[0].trim()}
                  target={top ? (FACTOR_SHORT[top.id] ?? top.easy) : null}
                />
              </div>
              <div className="mb-4 flex flex-col gap-2">
                {reasons.map((p, i) => (
                  <p
                    key={i}
                    className={
                      i === 0
                        ? "text-[16px] font-bold leading-[1.6] text-[#0a4a41]"
                        : "text-[15px] leading-[1.75] text-[var(--cp-text)]"
                    }
                  >
                    {p}
                  </p>
                ))}
              </div>
            </>
          ) : (
            <div className="mb-4">
              <p className="rounded-lg bg-[var(--cp-hover)] px-3 py-2.5 text-[15px] leading-[1.75] text-[var(--cp-text)]">
                {easy ?? lever.verdictNote ?? STATUS_FALLBACK[lever.status] ?? "판정 근거가 아직 기록되지 않았습니다."}
              </p>
              {/* 쉬운 말을 본문으로 올렸을 때만 원문을 아래에 남긴다 */}
              {easy && lever.verdictNote && (
                <p className="mt-1.5 px-1 text-[12px] leading-relaxed text-[var(--cp-text-faint)]">
                  분석 원문 · {lever.verdictNote}
                </p>
              )}
            </div>
          )}

          {caveat && (
            <p className="mb-4 rounded-lg bg-[#a8322a]/8 px-3 py-2 text-[14px] font-semibold leading-[1.7] text-[#7c2620]">
              유의해 주세요 · {caveat}
            </p>
          )}

          {evidence.length > 0 && (
            <div className="mb-4">
              <h4 className="mb-1.5 text-[12.5px] font-bold tracking-wide text-[var(--cp-text-dim)]">
                실제로 세어 본 숫자입니다
              </h4>
              <ul className="flex flex-col gap-1">
                {evidence.map((e, i) => (
                  <li
                    key={i}
                    className="rounded-lg border border-[var(--cp-border-faint)] bg-[var(--cp-bg)] px-2.5 py-1.5 text-[13.5px] leading-relaxed text-[var(--cp-text)]"
                  >
                    {e}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="mb-4 flex flex-col gap-2">
            <h4 className="text-[12.5px] font-bold tracking-wide text-[var(--cp-text-dim)]">
              무단투기를 키우는 조건과 이 사업이 겨냥하는 지점
            </h4>
            <StatGroup
              title="① 광진구를 100m 격자로 쪼개 견준 결과"
              caption="막대가 오른쪽으로 뻗으면 그 조건이 클수록 무단투기가 늘고, 왼쪽으로 뻗으면 줄어듭니다. 길수록 설명하는 힘이 큽니다."
              stats={betas}
              targeted={targeted}
            />
            <StatGroup
              title="② 행정동 15곳을 나란히 견준 결과"
              caption="동네 특성과 무단투기가 함께 움직이는 정도입니다. 막대가 끝까지 차면 완전히 붙어 다닌다는 뜻이고, 절반이면 절반쯤 같이 움직인다는 뜻입니다."
              stats={rhos}
              targeted={targeted}
            />
            <p className="px-1 text-[12.5px] leading-relaxed text-[var(--cp-text-faint)]">
              1인세대·청년·외국인·무관리주택은 같은 동네에 겹쳐 있어, 넷 가운데 무엇이 진짜 원인인지 갈라낼 수 없습니다.
              어느 쪽을 겨냥하더라도 결국 같은 지역에 닿습니다.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            {[
              { k: "드는 돈", v: lever.costNote },
              { k: "맡을 곳", v: lever.owner },
              { k: "효과 확인 방법", v: lever.verificationPlan },
            ]
              .filter((d) => d.v)
              .map((d) => (
                <div
                  key={d.k}
                  className="rounded-lg border border-[var(--cp-border-faint)] bg-[var(--cp-bg)] px-2.5 py-2"
                >
                  <p className="text-[12px] text-[var(--cp-text-dim)]">{d.k}</p>
                  <p className="text-[13.5px] font-semibold leading-snug text-[var(--cp-text-strong)]">{d.v}</p>
                </div>
              ))}
          </div>

          {lever.preRegistered && (
            <p className="mt-3 rounded-lg border border-dashed border-[var(--cp-border-strong)] px-3 py-2 text-[13px] leading-relaxed text-[var(--cp-text-muted)]">
              <b className="text-[var(--cp-text-strong)]">실행 전 등록 대상</b> · 어디에·얼마 동안·무엇과 견줘 판단할지를
              먼저 조치 대장에 적어 두고 시작합니다. 이동식 CCTV의 효과 주장이 비교 방법 오류로 철회된 뒤 만든 장치입니다.
            </p>
          )}
          {lever.ordinance && (
            <p className="mt-2 px-1 text-[12.5px] text-[var(--cp-text-faint)]">실행 근거 · {lever.ordinance}</p>
          )}
          {lever.rationale && (
            <p className="mt-2 px-1 font-mono text-[12px] leading-relaxed text-[var(--cp-text-faint)]">
              분석 메모 · {lever.rationale}
            </p>
          )}
        </div>

        {viz && (
          <div className="border-t border-[var(--cp-border)] px-5 py-3">
            <button
              onClick={() => onShowMap(lever)}
              className="w-full rounded-lg bg-[#0c6155] py-2.5 text-[15px] font-semibold text-white hover:bg-[#0a5449]"
            >
              {viz.label}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
