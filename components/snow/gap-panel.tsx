"use client"

import type { SnowMapData } from "@/lib/snow/types"
import { buildChecklist, buildFindings, gapSummary, planHeatBudget, priorityText, segName, segOwner, segPriority, segType, type Finding, type SegLike } from "@/lib/snow/facts"
import { eok, heatCost } from "@/lib/snow/costs"
import { useState } from "react"
import { SectionHead } from "@/components/dumping/section-head"
import { NumRow, StatBand, Table } from "./ui"
import CheckPrint from "./check-print"

// 공백 탭(첫 화면). 주장은 자원 목록이 아니라 "눈 오기 전에 어디가 비었는가": 취약구간 중 열선·자재 없는 곳, 열선 없는 동
// 3라운드(보고받는 사람 관점): 구가 손댈 수 있는 구간(구 관리 47)과 서울시 관리 결빙구간 9를 갈라 말한다. 공백 7곳 중 6곳이 시 관리 간선이라 한 수로 묶으면 구청장이 할 일이 안 보였다
// 규격(dumping 정책 탭): 머리기사 › 부제 › 수치 4칸(헤어라인) › 01 점검 후보(행동·부서·기한·규모·완료 기준. 4라운드 냉독 3회 모두 "첫 화면 밖"이라 표 위로) › 02 표(번호·구간·동·열선·자재·소관, 행 30px) › 03 발견 번호 행. 상자 0
// 문장 규칙: 합니다체, 한 문장 사실 하나, 비유 동사 0, 괄호는 단위·기준일에만

interface Props {
  data: SnowMapData | null
  activeLabel?: string | null // 지도가 보고 있는 구간(행 강조)
  budget: number // 열선 예산 역산(원). 0이면 끔
  onBudget: (won: number) => void
  onFocus: (f: Finding["focus"] | null, label?: string) => void
  onSelectSegment: (heatIds: number[] | null, layer: "weak" | "ice", path: [number, number][], label?: string, detail?: string) => void
  onOpenMethods: () => void
}

// 번호 = 지도 배지와 같은 번호(적설취약구간 i · 결빙 n). 표 행번호와 지도 번호가 따로 놀던 것(냉독 지적)
const COLS = [
  { k: "지도 번호", w: "40px", dim: true },
  { k: "구간", w: "minmax(0,1fr)" },
  { k: "동", w: "44px", dim: true },
  { k: "열선까지", w: "54px", align: "right" as const },
  { k: "자재", w: "32px", align: "right" as const },
  { k: "소관", w: "20px", dim: true },
]
// 예산 역산이 켜지면 "열선까지" 자리에 구간별 신설 개략 비용(길이 × 2차로 × 1억/100m)을 보여 준다(냉독 4차: 10억 계산을 행에서 검증 못 했다)
const COLS_BUDGET = COLS.map((c) => (c.k === "열선까지" ? { ...c, k: "신설 비용", w: "54px" } : c))

export default function GapPanel({ data, activeLabel, budget, onBudget, onFocus, onSelectSegment, onOpenMethods }: Props) {
  const [print, setPrint] = useState(false)
  if (!data) return <div className="p-4"><div className="dump-skel h-24 rounded-xl" /></div>
  const g = gapSummary(data)
  const findings = buildFindings(data)
  const checks = buildChecklist(data)
  const plan = planHeatBudget(data, budget)
  const plannedIds = new Set(plan.planned.map((w) => w.i))
  const rows = g.noHeatList.map((s) => ({ s }))
  const first = rows.slice(0, 9)
  const rest = rows.slice(9)
  const cell = ({ s }: { s: SegLike }, k: string) => {
    switch (k) {
      case "지도 번호":
        return <span className={s.gap ? "font-semibold text-(--dump-accent)" : ""}>{s.src === "weak" ? s.i : `결빙 ${s.n}`}</span>
      case "구간":
        return (
          <span className="block leading-tight">
            <span className="block truncate">
              {s.src === "weak" && plannedIds.has(s.i) && <span className="mr-1.5 rounded bg-(--dump-accent)/12 px-1 text-[12px] font-semibold text-(--dump-accent)">신설</span>}
              <span className="font-semibold text-[var(--cp-text-strong)]">{segName(s)}</span>
            </span>
            <span className="block truncate text-[12px] text-[var(--cp-text-dim)]">{priorityText(segPriority(s, data))}</span>
          </span>
        )
      case "동":
        return s.d ? s.d.replace(/동$/, "") : <span className="text-[var(--cp-text-faint)]">구 밖</span>
      case "열선까지":
        return s.near.heat == null ? "없음" : `${s.near.heat.toLocaleString("ko-KR")}m`
      case "신설 비용":
        return s.src === "weak" ? <span title={`${Math.round(s.pathM)}m × 2차로 × 100만원/m`} className={plannedIds.has(s.i) ? "font-semibold text-(--dump-accent)" : ""}>{eok(heatCost(s.pathM).high)}</span> : <span className="text-[var(--cp-text-faint)]">시</span>
      case "자재":
        return s.materialsNear ? `${s.materialsNear}` : <span className="font-semibold text-(--dump-accent)">0</span>
      case "소관":
        return segOwner(s) === "시" ? <span className="rounded bg-[var(--cp-track)] px-1 text-[12px]">시</span> : "구"
      default:
        return null
    }
  }
  const pick = ({ s }: { s: SegLike }) => onSelectSegment(s.heatIds, s.src, s.path, segName(s), `${segType(s)} · ${s.d ?? "구 경계선 밖"} · 가장 가까운 열선 ${s.near.heat == null ? "없음" : `${s.near.heat.toLocaleString("ko-KR")}m`} · ${data.gaps.materialNearM}m 안 자재 ${s.materialsNear ? `${s.materialsNear}개소` : "없음"} · ${segOwner(s)} 소관 · 우선 근거 ${priorityText(segPriority(s, data))}`)

  return (
    <div className="px-4 pb-4 pt-3">
      <p className="dump-headline text-[21px] leading-[1.42] text-[var(--cp-text-strong)]">
        적설취약구간 {data.weak.length}곳 중 {g.weakNoHeat}곳에 열선이 없습니다.
      </p>
      <p className="mt-1.5 text-[14px] leading-snug text-[var(--cp-text-muted)]">
        자재도 없는 곳은 {g.gu.none}곳{g.gu.noneNames.length ? `(${g.gu.noneNames.join("·")})` : ""}, 서울시 관리 결빙구간은 {g.si.total}곳 중 {g.si.none}곳이 둘 다 없습니다.
      </p>
      <StatBand
        items={[
          { k: "열선 없음", v: String(g.weakNoHeat), u: `/${data.weak.length}` },
          { k: "구 관리 공백", v: String(g.gu.none), u: "곳", accent: true },
          { k: "시 관리 결빙 공백", v: String(g.si.none), u: `/${g.si.total}` },
          { k: "열선 없는 동", v: String(g.noHeatDongs.length), u: "/15" },
        ]}
      />

      {/* 후보 5: dumping 제안 행 규격(제목 한 줄 + 흐린 한 줄 + 오른쪽 배지). 근거·완료 기준·필요한 결정은 요약 한 장에 */}
      <SectionHead n="01" sub="번호가 우선순위입니다. 구가 바로 할 수 있는 것부터, 기한은 대책기간 시작(11월 15일) 전. 누르면 지도, 자세한 것은 요약 한 장">
        눈 오기 전 점검 후보 {checks.length}
      </SectionHead>
      <div>
        {checks.map((c, i) => (
          <button key={c.id} onClick={() => onFocus(c.focus ?? null, c.short)} className="group flex w-full items-start gap-3 border-t border-[var(--cp-border-faint)] py-2.5 text-left first:border-t-0 hover:bg-[var(--cp-hover)]">
            <span className="dump-idx mt-[2px] w-5 shrink-0 text-[15px] text-(--dump-accent)">{i + 1}</span>
            <span className="min-w-0 flex-1">
              <span className="block text-[15px] font-semibold leading-snug text-[var(--cp-text-strong)] group-hover:text-(--dump-accent)">{c.title}</span>
              <span className="mt-1 line-clamp-2 text-[13px] leading-snug text-[var(--cp-text-dim)]">
                {c.dept} · {c.scale} · {c.costShort}
              </span>
            </span>
            <span className={`mt-[2px] shrink-0 rounded px-1.5 py-0.5 text-[12px] font-semibold ${/결정/.test(c.request) ? "bg-(--dump-accent)/12 text-(--dump-accent)" : "bg-[var(--cp-track)] text-[var(--cp-text-dim)]"}`}>{/결정/.test(c.request) ? "결정 필요" : c.owner === "시" ? "시 요청" : "부서 지시"}</span>
          </button>
        ))}
      </div>
      <button onClick={() => setPrint(true)} className="mt-2 rounded-full border border-[var(--cp-border)] px-3.5 py-1.5 text-[13px] font-semibold text-(--dump-accent) hover:bg-[var(--cp-hover)]">
        보고 요약 한 장
      </button>
      {print && <CheckPrint data={data} onClose={() => setPrint(false)} />}

      <SectionHead n="02" sub="우선순위 순. 둘째 줄이 근거, 기준과 가중치는 데이터·방법에. 누르면 지도">
        열선 없는 구간 {g.noHeat}곳(구 {g.gu.noHeat} · 시 {g.si.noHeat})
      </SectionHead>
      {/* 열선 예산 역산: 예산을 밀면 우선순위 순으로 신설 구간이 정해지고 지도 벽이 호박색으로 바뀐다. 산식은 데이터·방법 */}
      <div className="mb-2 rounded-lg bg-[var(--cp-panel2)] px-2.5 py-2">
        <div className="flex items-center gap-3">
          <span className="dump-kicker shrink-0 text-[10px] text-[var(--cp-text-dim)]">열선 예산 역산</span>
          <input type="range" min={0} max={30e8} step={5e7} value={budget} onChange={(e) => onBudget(Number(e.target.value))} aria-label="열선 신설 예산(원)" title="구간 길이 × 2차로 × 1차로 100m당 1억. 우선순위 순으로 쌓습니다" className="dump-range min-w-0 flex-1" />
          <span className="w-12 shrink-0 text-right font-mono text-[15px] font-semibold text-[var(--cp-text-strong)]">{budget ? eok(budget) : "0억"}</span>
        </div>
        <p className="mt-1 text-[12.5px] leading-snug text-[var(--cp-text-muted)]">
          {budget
            ? `${eok(budget)}이면 1~${plan.planned.length}위 ${plan.meters.toLocaleString("ko-KR")}m 신설(개략 ${eok(plan.planned.reduce((s, w) => s + Math.round(heatCost(w.pathM).high / 1e7) * 1e7, 0))}), 열선 없는 구간 ${plan.total}곳이 ${plan.remaining}곳으로.${plan.next ? ` 다음 ${plan.next.seg.name}(지도 ${plan.next.seg.i})은 ${eok(plan.next.cost)} 더.` : ""}`
            : `예산을 밀면 우선순위 순으로 신설 구간이 정해집니다. 13곳 전부는 개략 ${eok(planHeatBudget(data, Infinity).cost)}(2차로 가정).`}
        </p>
      </div>
      <Table cols={budget ? COLS_BUDGET : COLS} rows={first} cell={cell} rowH={44} rowKey={(r) => `${r.s.src}-${"i" in r.s ? r.s.i : r.s.id}`} onRow={pick} rowClass={(r) => (activeLabel && segName(r.s) === activeLabel ? "bg-[var(--cp-hover2)]" : "")} />
      {rest.length > 0 && (
        <details className="mt-1.5">
          <summary className="cursor-pointer text-[13px] text-(--dump-accent)">나머지 {rest.length}곳</summary>
          <div className="mt-1">
            <Table cols={budget ? COLS_BUDGET : COLS} rows={rest} cell={cell} rowH={44} rowKey={(r) => `${r.s.src}-${"i" in r.s ? r.s.i : r.s.id}`} onRow={pick} rowClass={(r) => (activeLabel && segName(r.s) === activeLabel ? "bg-[var(--cp-hover2)]" : "")} />
          </div>
        </details>
      )}
      <p className="mt-1.5 text-[12.5px] leading-snug text-[var(--cp-text-dim)]">자재는 {data.gaps.materialNearM}m 안 개소, 동 "구 밖"은 강 위 램프.</p>

      <SectionHead n="03" sub="데이터에서 계산한 사실. 누르면 지도">
        발견 {findings.length}
      </SectionHead>
      <div>
        {findings.map((f, i) => (
          <NumRow key={f.id} n={i + 1} big={f.n} unit={f.unit} title={f.title} body={f.body} accent={f.kind === "gap"} onClick={() => onFocus(f.focus ?? null, f.kind === "gap" ? f.title.split(" 중 ")[0] : f.kicker)} />
        ))}
      </div>

      <p className="mt-4 text-[13px] leading-snug text-[var(--cp-text-dim)]">
        거리 기준과 데이터 기준일은{" "}
        <button onClick={onOpenMethods} className="font-semibold text-(--dump-accent) underline-offset-2 hover:underline">
          데이터·방법
        </button>
        에 있습니다.
      </p>
    </div>
  )
}
