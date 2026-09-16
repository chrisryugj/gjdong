"use client"

import { useMemo } from "react"
import type { DumpingMapData, OntoGraph } from "@/lib/dumping/types"
import { DONG_THRESHOLDS, summarize } from "@/lib/dumping/facts"
import { buildFindings, FINDING_GROUPS, type Finding } from "./findings-data"
import ContrastPanel from "./contrast-panel"
import { SectionHead } from "./section-head"

// 10라운드: 17장을 결론 5·검증 8·한계 4로 묶는다. 결론만 펼치고 나머지는 접어 결재라인이 3~5장만 읽어도 되게
const GROUP_SUB: Record<keyof typeof FINDING_GROUPS, string> = {
  결론: "적발 기록과 같이 움직이는 조건, 신고 채널, 철회한 효과 주장",
  검증: "결론을 흔들 수 있는 반론을 확인한 카드",
  "한계·전망": "자료 정정, 처리 지연, 신축 흐름",
}

// 태그에 낯선 낱말이 있으면 마우스를 올렸을 때 풀이. 모달의 "쉬운 풀이"와 같은 말
const TAG_HELP: Record<string, string> = {
  "노출 통제":
    "노출 = 그 칸에 사람이 얼마나 있는가(상주인구: 주민등록 거주자, 생활인구: 통신 기반 체류자). 사람이 많아서 생기는 것인지 가려내려고 회귀식에 넣은 변수",
}

interface FindingsPanelProps {
  data: DumpingMapData | null
  graph: OntoGraph | null
  selectedDong: string | null
  onSelectDong: (dong: string | null) => void
  onOpenFinding: (finding: Finding) => void
  onOpenBriefing: (dong: string) => void // 동별 원페이저(인쇄용) 모달
  activeTitle: string | null // 지도에 반영 중인 발견
}

export default function FindingsPanel({
  data,
  graph,
  selectedDong,
  onSelectDong,
  onOpenFinding,
  onOpenBriefing,
  activeTitle,
}: FindingsPanelProps) {
  const findings = useMemo(() => (data && graph ? buildFindings(data, graph) : []), [data, graph])
  const T = DONG_THRESHOLDS // 동 브리핑 권고와 같은 문턱. 여기서 강조되는 값이 브리핑에서 권고로 이어진다
  const dongs = data ? [...data.dong].sort((a, b) => b.cr - a.cr) : []
  const periodLabel = data ? summarize(data).period.label : ""
  const maxCr = dongs.length ? dongs[0].cr : 1
  const sel = data?.dong.find((d) => d.d === selectedDong) ?? null
  const ts = sel ? (data?.ts[sel.d] ?? []) : []
  const tsClean = ts.filter((v): v is number => v != null)

  return (
    <div className="flex flex-col gap-4 p-3">
      {/* 핵심 발견 카드가 먼저. 결론 그룹은 펼치고 검증·한계 그룹은 접는다 */}
      <section>
        <SectionHead n="01" first sub={`결론 ${FINDING_GROUPS.결론.length}장 먼저, 검증·한계는 접힘 · 카드를 누르면 자세히 볼 수 있습니다`}>
          핵심 발견 {findings.length}
        </SectionHead>
        {(Object.keys(FINDING_GROUPS) as (keyof typeof FINDING_GROUPS)[]).map((group) => {
          const tags = FINDING_GROUPS[group] as readonly string[]
          const cards = findings.filter((f) => tags.includes(f.tag))
          const list = (
            <div className="flex flex-col gap-2">
              {cards.map((f, i) => {
                const active = f.title === activeTitle
                return (
                  <button
                    key={f.title}
                    onClick={() => onOpenFinding(f)}
                    style={{ "--i": Math.min(i, 8) } as React.CSSProperties}
                    className={`dump-rise rounded-lg border p-3 text-left transition-all hover:border-[#0c6155]/60 ${
                      active
                        ? "border-[#0c6155] bg-[#0c6155]/10  ring-2 ring-[#0c6155]/30"
                        : f.accent
                          ? "border-[#0c6155]/50 bg-[#0c6155]/5"
                          : "border-[var(--cp-border)] bg-[var(--cp-panel)]"
                    }`}
                  >
                    <span className="mb-1.5 flex flex-wrap items-center gap-1.5">
                      <span
                        title={TAG_HELP[f.tag]}
                        className={`rounded bg-[var(--cp-hover2)] px-1.5 py-0.5 text-[12.5px] font-medium text-[var(--cp-text-muted)] ${
                          TAG_HELP[f.tag] ? "cursor-help underline decoration-dotted underline-offset-2" : ""
                        }`}
                      >
                        {f.tag}
                      </span>
                      {active && (
                        <span className="rounded bg-[#0c6155] px-1.5 py-0.5 text-[12.5px] font-semibold text-white">✓ 지도 반영 중</span>
                      )}
                    </span>
                    <h4 className="text-[16.5px] font-bold leading-snug text-[var(--cp-text-strong)]">{f.title}</h4>
                    {/* 한 줄 결론이 본문보다 먼저. 근거 수치 문장은 두 줄로 접고, 전문은 모달(수치 칸·상세)에 있다 */}
                    <p className="mt-2 border-l-[3px] border-[#0c6155] pl-2.5 text-[15px] font-semibold leading-snug text-[#0a4a41]">
                      {f.takeaway}
                    </p>
                    <p className="mt-2 line-clamp-2 text-[13.5px] leading-relaxed text-[var(--cp-text-dim)]">{f.body}</p>
                    <span className="mt-1.5 inline-block text-[13.5px] font-medium text-[#0c6155]">자세히 보기 →</span>
                  </button>
                )
              })}
            </div>
          )
          if (group === "결론") return <div key={group}>{list}</div>
          return (
            <details key={group} className="group mt-3 rounded-lg border border-[var(--cp-border)] bg-[var(--cp-panel)] px-3 py-2">
              <summary className="flex cursor-pointer list-none items-baseline gap-2 text-[15px] font-semibold text-[var(--cp-text-strong)] [&::-webkit-details-marker]:hidden">
                <span className="flex-1">
                  {group} {cards.length}장
                  <span className="ml-1.5 text-[13.5px] font-normal text-[var(--cp-text-dim)]">{GROUP_SUB[group]}</span>
                </span>
                <span className="text-[13px] font-medium text-[#0c6155] group-open:hidden">펼치기</span>
                <span className="hidden text-[13px] font-medium text-[var(--cp-text-dim)] group-open:inline">접기</span>
              </summary>
              <div className="mt-2">{list}</div>
            </details>
          )
        })}
        <p className="mt-2 text-[14.5px] leading-relaxed text-[var(--cp-text-faint)]">
          회귀계수는 다른 조건을 통제한 뒤의 조건부 연관이며, 인과를 증명한 것은 아닙니다. 자료와 방법은 위 데이터·방법에서 볼 수 있습니다.
        </p>
      </section>

      {/* 동별 랭킹 */}
      <section>
        <SectionHead n="02" sub={`천명당 · ${periodLabel} · 누르면 지도가 그 동에 맞춰집니다`}>
          동별 민원
        </SectionHead>
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
                <span className="flex w-[5.5rem] shrink-0 items-center gap-1 text-[16px] font-medium text-[var(--cp-text)]">
                  {top3 && (
                    <i className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#a8322a] text-[13.5px] font-bold not-italic text-white">
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
                  className={`w-10 shrink-0 text-right font-mono text-[15.5px] ${
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
          <div className="mt-2 rounded-lg border border-[var(--cp-border)] bg-[var(--cp-panel)] p-3">
            <div className="mb-2 flex items-baseline justify-between gap-2">
              <h4 className="text-[15px] font-semibold text-[var(--cp-text-strong)]">{sel.d}</h4>
              <div className="flex items-center gap-2.5">
                <button
                  onClick={() => onOpenBriefing(sel.d)}
                  className="rounded-md bg-[#0c6155] px-2 py-0.5 text-[14.5px] font-medium text-white"
                >
                  동 브리핑 인쇄
                </button>
                <button
                  onClick={() => onSelectDong(null)}
                  className="text-[14.5px] text-[var(--cp-text-dim)] hover:text-[var(--cp-text)]"
                >
                  선택 해제
                </button>
              </div>
            </div>
            <p className="mb-2 text-[14.5px] font-medium text-[var(--cp-text-muted)]">
              민원 발생률 15개 동 중{" "}
              <b className={dongs.findIndex((x) => x.d === sel.d) < 3 ? "text-[#a8322a]" : "text-[var(--cp-text-strong)]"}>
                {dongs.findIndex((x) => x.d === sel.d) + 1}위
              </b>
            </p>
            <dl className="grid grid-cols-3 gap-x-2 gap-y-2 text-center">
              {[
                { k: "민원", v: sel.cr.toFixed(1), u: `천명당 · ${sel.comp}건`, hi: sel.cr >= T.cr },
                { k: "과태료", v: sel.er.toFixed(1), u: `천명당 · ${sel.enf}건`, hi: sel.er >= T.er },
                { k: "다가구·단독", v: `${sel.unm}%`, u: `다가구 ${sel.mf.toLocaleString()}가구`, hi: sel.unm >= T.unm },
                { k: "1인세대", v: `${sel.one}%`, u: `${sel.hh.toLocaleString()}세대 중`, hi: sel.one >= T.one },
                { k: "청년 20-34", v: `${sel.yth}%`, u: "2025년", hi: sel.yth >= T.yth },
                { k: "외국인", v: `${sel.frn}%`, u: "2025년", hi: sel.frn >= T.frn },
              ].map((f) => (
                <div key={f.k} className={f.hi ? "rounded-lg bg-[#a8322a]/8 py-1" : "py-1"}>
                  <dt className="text-[13.5px] text-[var(--cp-text-dim)]">
                    {f.k}
                    {f.hi && <b className="ml-1 text-[12.5px] text-[#a8322a]">높음</b>}
                  </dt>
                  <dd className={`font-mono text-[18px] font-semibold ${f.hi ? "text-[#a8322a]" : "text-[var(--cp-text-strong)]"}`}>
                    {f.v}
                  </dd>
                  <dd className="text-[13.5px] text-[var(--cp-text-faint)]">{f.u}</dd>
                </div>
              ))}
            </dl>
            {sel.lp != null && (
              <p className="mt-2 text-[14px] leading-relaxed text-[var(--cp-text-dim)]">
                서울시 생활인구(체류 기준) {sel.lp.toLocaleString()}명 · 생활인구 천명당 민원 {sel.crl ?? "미산출"} · 과태료 {sel.erl ?? "미산출"}.
                등록인구 천명당({sel.cr.toFixed(1)}/{sel.er.toFixed(1)})과 견줘 사람이 머무는 만큼 생기는지 볼 수 있습니다.
              </p>
            )}
            {tsClean.length >= 2 && (
              <div className="mt-3">
                <p className="mb-1 text-[13.5px] text-[var(--cp-text-dim)]">
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

      {/* 환경요인. 계절·날씨·기온 일평균 (export env 집계) */}
      {data && (
        <section>
          <SectionHead n="03" sub={`일평균 · ${periodLabel}`}>
            계절·날씨 요인
          </SectionHead>
          <div className="rounded-lg border border-[var(--cp-border)] bg-[var(--cp-panel)] p-3">
            <div className="grid grid-cols-4 gap-1.5 text-center">
              {Object.entries(data.env.seasons).map(([k, v]) => {
                const max = Math.max(...Object.values(data.env.seasons).map((x) => x.compPerDay))
                const hi = v.compPerDay === max
                return (
                  <div key={k} className={`rounded-lg py-1.5 ${hi ? "bg-[#a8322a]/8" : ""}`}>
                    <p className="text-[13.5px] text-[var(--cp-text-dim)]">
                      {k}
                      {hi && <b className="ml-1 text-[12.5px] text-[#a8322a]">최다</b>}
                    </p>
                    <p className={`font-mono text-[17px] font-semibold ${hi ? "text-[#a8322a]" : "text-[var(--cp-text-strong)]"}`}>
                      {v.compPerDay}
                    </p>
                    <p className="text-[12.5px] text-[var(--cp-text-faint)]">민원/일</p>
                  </div>
                )
              })}
            </div>
            <p className="mt-2 border-l-2 border-[#0c6155] pl-2.5 text-[15px] font-medium leading-snug text-[var(--cp-text-strong)]">
              여름과 더운 날(25도 이상)에는 민원이 겨울의 {(data.env.seasons["여름"].compPerDay / Math.max(data.env.seasons["겨울"].compPerDay, 0.01)).toFixed(1)}배입니다. 비 오는 날에는 단속 적발이
              {" "}{data.env.rain["무강수"]?.enfPerDay ?? "-"}→{data.env.rain["비(1mm+)"]?.enfPerDay ?? "-"}건/일로 줄어듭니다.
            </p>
            <p className="mt-1.5 text-[13.5px] leading-relaxed text-[var(--cp-text-faint)]">
              관찰된 상관일 뿐 인과는 아닙니다. 과태료의 시간대와 요일(평일 오전 집중)에는 단속 근무 패턴이 섞여
              있어 투기가 일어난 시각으로 읽으시면 안 됩니다. 자세한 수치는 물어보기 탭에서 질문해 주세요.
            </p>
          </div>
        </section>
      )}

      {/* 기존 해석 vs 이 분석. 결론이 어디서 뒤집혔는지 보는 대비 보드. 카드 뒤에 접어 둔다 */}
      {data && graph && (
        <details className="rounded-lg border border-[var(--cp-border)] bg-[var(--cp-panel)] px-3 py-2">
          <summary className="flex cursor-pointer list-none items-baseline gap-2.5 text-[18px] font-bold text-[var(--cp-text-strong)] [&::-webkit-details-marker]:hidden">
            <span className="font-mono text-[15px] font-semibold text-[var(--cp-text-faint)]">04</span>
            <span className="flex-1">통념·초기 분석과 이 분석의 차이</span>
            <span className="text-[13px] font-medium text-[#0c6155]">펼치기</span>
          </summary>
          <div className="mt-2">
            <ContrastPanel data={data} graph={graph} />
          </div>
        </details>
      )}
    </div>
  )
}
