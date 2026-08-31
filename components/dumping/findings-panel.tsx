"use client"

import type { DumpingMapData } from "@/lib/dumping/types"
import { FINDINGS, type Finding } from "./findings-data"

interface FindingsPanelProps {
  data: DumpingMapData | null
  selectedDong: string | null
  onSelectDong: (dong: string | null) => void
  onOpenFinding: (finding: Finding) => void
  onOpenBriefing: (dong: string) => void // 동별 원페이저(인쇄용) 모달
  activeTitle: string | null // 지도에 반영 중인 발견
}

export default function FindingsPanel({
  data,
  selectedDong,
  onSelectDong,
  onOpenFinding,
  onOpenBriefing,
  activeTitle,
}: FindingsPanelProps) {
  const dongs = data ? [...data.dong].sort((a, b) => b.cr - a.cr) : []
  const maxCr = dongs.length ? dongs[0].cr : 1
  const sel = data?.dong.find((d) => d.d === selectedDong) ?? null
  const ts = sel ? (data?.ts[sel.d] ?? []) : []
  const tsClean = ts.filter((v): v is number => v != null)

  return (
    <div className="flex flex-col gap-4 p-3">
      {/* 동별 랭킹 */}
      <section>
        <h3 className="mb-2 text-sm font-semibold tracking-wide text-[var(--cp-text-dim)]">
          동별 민원 (천명당 · 2024.1~2026.8) · 누르면 지도가 그 동에 맞춰집니다
        </h3>
        <div className="flex flex-col gap-1">
          {dongs.map((d, rank) => {
            const on = d.d === selectedDong
            const top3 = rank < 3
            return (
              <button
                key={d.d}
                onClick={() => onSelectDong(on ? null : d.d)}
                className={`flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-left transition-colors ${
                  on
                    ? "border-[var(--cp-border-active)] bg-[var(--cp-hover2)]"
                    : "border-transparent hover:bg-[var(--cp-hover)]"
                }`}
              >
                <span className="flex w-[5.5rem] shrink-0 items-center gap-1 text-[15px] font-medium text-[var(--cp-text)]">
                  {top3 && (
                    <i className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#a8322a] text-[12px] font-bold not-italic text-white">
                      {rank + 1}
                    </i>
                  )}
                  {d.d}
                </span>
                <span className="relative h-2.5 min-w-0 flex-1 overflow-hidden rounded-full bg-[var(--cp-track,rgba(100,116,139,.18))]">
                  <i
                    className="absolute inset-y-0 left-0 rounded-full bg-[#0c6155]"
                    style={{ width: `${(d.cr / maxCr) * 100}%` }}
                  />
                </span>
                <span
                  className={`w-10 shrink-0 text-right font-mono text-[14px] ${
                    top3 ? "font-bold text-[#a8322a]" : "text-[var(--cp-text-muted)]"
                  }`}
                >
                  {d.cr.toFixed(1)}
                </span>
              </button>
            )
          })}
        </div>

        {sel && (
          <div className="mt-2 rounded-xl border border-[var(--cp-border)] bg-[var(--cp-panel)] p-3">
            <div className="mb-2 flex items-baseline justify-between gap-2">
              <h4 className="text-sm font-semibold text-[var(--cp-text-strong)]">{sel.d}</h4>
              <div className="flex items-center gap-2.5">
                <button
                  onClick={() => onOpenBriefing(sel.d)}
                  className="rounded-md bg-[#0c6155] px-2 py-0.5 text-[13px] font-medium text-white"
                >
                  동 브리핑 인쇄
                </button>
                <button
                  onClick={() => onSelectDong(null)}
                  className="text-[13px] text-[var(--cp-text-dim)] hover:text-[var(--cp-text)]"
                >
                  선택 해제
                </button>
              </div>
            </div>
            <p className="mb-2 text-[13px] font-medium text-[var(--cp-text-muted)]">
              민원 발생률 15개 동 중{" "}
              <b className={dongs.findIndex((x) => x.d === sel.d) < 3 ? "text-[#a8322a]" : "text-[var(--cp-text-strong)]"}>
                {dongs.findIndex((x) => x.d === sel.d) + 1}위
              </b>
            </p>
            <dl className="grid grid-cols-3 gap-x-2 gap-y-2 text-center">
              {[
                { k: "민원", v: sel.cr.toFixed(1), u: `천명당 · ${sel.comp}건`, hi: sel.cr >= 15 },
                { k: "과태료", v: sel.er.toFixed(1), u: `천명당 · ${sel.enf}건`, hi: sel.er >= 15 },
                { k: "무관리주거", v: `${sel.unm}%`, u: `다가구 ${sel.mf.toLocaleString()}가구`, hi: sel.unm >= 50 },
                { k: "1인세대", v: `${sel.one}%`, u: `${sel.hh.toLocaleString()}세대 중`, hi: sel.one >= 60 },
                { k: "청년 20-34", v: `${sel.yth}%`, u: "2025년", hi: sel.yth >= 40 },
                { k: "외국인", v: `${sel.frn}%`, u: "2025년", hi: sel.frn >= 13 },
              ].map((f) => (
                <div key={f.k} className={f.hi ? "rounded-lg bg-[#a8322a]/8 py-1" : "py-1"}>
                  <dt className="text-[12px] text-[var(--cp-text-dim)]">
                    {f.k}
                    {f.hi && <b className="ml-1 text-[11px] text-[#a8322a]">높음</b>}
                  </dt>
                  <dd className={`font-mono text-[17px] font-semibold ${f.hi ? "text-[#a8322a]" : "text-[var(--cp-text-strong)]"}`}>
                    {f.v}
                  </dd>
                  <dd className="text-[12px] text-[var(--cp-text-faint)]">{f.u}</dd>
                </div>
              ))}
            </dl>
            {tsClean.length >= 2 && (
              <div className="mt-3">
                <p className="mb-1 text-[12px] text-[var(--cp-text-dim)]">
                  청년 20-34세 추이 2015→2025 ({tsClean[0]}% → {tsClean[tsClean.length - 1]}%)
                </p>
                <svg viewBox="0 0 200 36" className="h-9 w-full">
                  <polyline
                    fill="none"
                    stroke="#0c6155"
                    strokeWidth="1.6"
                    points={tsClean
                      .map((v, i) => {
                        const lo = Math.min(...tsClean)
                        const hi = Math.max(...tsClean)
                        const y = 32 - ((v - lo) / Math.max(hi - lo, 1)) * 28
                        return `${(i / (tsClean.length - 1)) * 196 + 2},${y}`
                      })
                      .join(" ")}
                  />
                </svg>
              </div>
            )}
          </div>
        )}
      </section>

      {/* 환경요인 — 계절·날씨·기온 일평균 (export env 집계) */}
      {data && (
        <section>
          <h3 className="mb-2 text-sm font-semibold tracking-wide text-[var(--cp-text-dim)]">
            계절·날씨 요인 (일평균, 2024.1~2026.8)
          </h3>
          <div className="rounded-xl border border-[var(--cp-border)] bg-[var(--cp-panel)] p-3">
            <div className="grid grid-cols-4 gap-1.5 text-center">
              {Object.entries(data.env.seasons).map(([k, v]) => {
                const max = Math.max(...Object.values(data.env.seasons).map((x) => x.compPerDay))
                const hi = v.compPerDay === max
                return (
                  <div key={k} className={`rounded-lg py-1.5 ${hi ? "bg-[#a8322a]/8" : ""}`}>
                    <p className="text-[12px] text-[var(--cp-text-dim)]">
                      {k}
                      {hi && <b className="ml-1 text-[11px] text-[#a8322a]">최다</b>}
                    </p>
                    <p className={`font-mono text-[16px] font-semibold ${hi ? "text-[#a8322a]" : "text-[var(--cp-text-strong)]"}`}>
                      {v.compPerDay}
                    </p>
                    <p className="text-[11px] text-[var(--cp-text-faint)]">민원/일</p>
                  </div>
                )
              })}
            </div>
            <p className="mt-2 rounded-lg bg-[#0c6155]/10 px-2.5 py-1.5 text-[13.5px] font-semibold leading-snug text-[#0a4a41]">
              여름·더운 날(25도+)에 민원이 겨울의 2배. 비 오는 날엔 단속 적발이
              {" "}{data.env.rain["무강수"]?.enfPerDay ?? "-"}→{data.env.rain["비(1mm+)"]?.enfPerDay ?? "-"}건/일로 줄어든다.
            </p>
            <p className="mt-1.5 text-[12px] leading-relaxed text-[var(--cp-text-faint)]">
              관찰된 상관이며 인과 아님. 과태료 시간대·요일(평일 오전 집중)은 단속 근무 패턴이 섞여
              있어 투기 시각으로 읽으면 안 된다. 자세한 수치는 물어보기 탭에서 질문할 것.
            </p>
          </div>
        </section>
      )}

      {/* 핵심 발견 — 카드 클릭 시 모달 상세 */}
      <section>
        <h3 className="mb-2 text-sm font-semibold tracking-wide text-[var(--cp-text-dim)]">
          핵심 발견 {FINDINGS.length} · 카드를 누르면 자세히 볼 수 있습니다
        </h3>
        <div className="flex flex-col gap-2">
          {FINDINGS.map((f) => {
            const active = f.title === activeTitle
            return (
              <button
                key={f.title}
                onClick={() => onOpenFinding(f)}
                className={`rounded-xl border p-3 text-left transition-all hover:shadow-md ${
                  active
                    ? "border-[#0c6155] bg-[#0c6155]/10 shadow-md ring-2 ring-[#0c6155]/30"
                    : f.accent
                      ? "border-[#0c6155]/50 bg-[#0c6155]/5"
                      : "border-[var(--cp-border)] bg-[var(--cp-panel)]"
                }`}
              >
                <span className="mb-1 mr-1.5 inline-block rounded bg-[var(--cp-hover2)] px-1.5 py-0.5 text-[12px] font-medium text-[var(--cp-text-muted)]">
                  {f.tag}
                </span>
                {active && (
                  <span className="mb-1 inline-block rounded bg-[#0c6155] px-1.5 py-0.5 text-[12px] font-semibold text-white">
                    ✓ 지도 반영 중
                  </span>
                )}
                <h4 className="text-[15px] font-semibold leading-snug text-[var(--cp-text-strong)]">{f.title}</h4>
                <p className="mt-1 text-[14px] leading-relaxed text-[var(--cp-text-muted)]">{f.body}</p>
                <p className="mt-2 rounded-lg bg-[#0c6155]/10 px-2.5 py-1.5 text-[14px] font-semibold leading-snug text-[#0a4a41]">
                  {f.takeaway}
                </p>
                <span className="mt-1.5 inline-block text-[13px] font-medium text-[#0c6155]">자세히 보기 →</span>
              </button>
            )
          })}
        </div>
        <p className="mt-2 text-[13px] leading-relaxed text-[var(--cp-text-faint)]">
          회귀계수는 통제 후 조건부 연관이며 인과 증명이 아니다. 상세 방법론·검증은 내부 분석
          저장소(gwangjin-dumping, 비공개)의 docs 참조.
        </p>
      </section>
    </div>
  )
}
