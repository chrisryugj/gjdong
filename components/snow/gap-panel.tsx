"use client"

import type { SnowMapData } from "@/lib/snow/types"
import { buildChecklist, buildFindings, gapSummary, planHeatBudget, priorityText, segName, segOwner, segPriority, segType, type Finding, type SegLike } from "@/lib/snow/facts"
import { COST, eok, man } from "@/lib/snow/costs"
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
  { k: "지도 번호", w: "44px", dim: true },
  { k: "구간", w: "minmax(0,1fr)" },
  { k: "동", w: "52px", dim: true },
  { k: "열선까지", w: "58px", align: "right" as const },
  { k: "자재", w: "40px", align: "right" as const },
  { k: "소관", w: "22px", dim: true },
]

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
              <span className="font-semibold text-[var(--cp-text-strong)]">{segName(s)}</span>
              {s.src === "weak" && plannedIds.has(s.i) && <span className="ml-1.5 rounded bg-(--dump-accent)/12 px-1 text-[12px] font-semibold text-(--dump-accent)">신설</span>}
            </span>
            <span className="block truncate text-[12px] text-[var(--cp-text-dim)]">{priorityText(segPriority(s, data))}</span>
          </span>
        )
      case "동":
        return s.d ? s.d.replace(/동$/, "") : <span className="text-[var(--cp-text-faint)]">구 밖</span>
      case "열선까지":
        return s.near.heat == null ? "없음" : `${s.near.heat.toLocaleString("ko-KR")}m`
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
        비치 자재도 없는 곳은 {g.gu.none}곳{g.gu.noneNames.length ? `(${g.gu.noneNames.join("·")})` : ""}입니다. 서울시 관리 결빙구간 {g.si.total}곳 중 {g.si.none}곳은 열선도 자재도 없습니다.
      </p>
      <p className="mt-1 text-[12.5px] leading-snug text-[var(--cp-text-dim)]">구 보도자료의 취약지점 {data.ops.weakPoints}개소 목록은 비공개라 행안부 적설취약구간 {data.weak.length}곳을 씁니다.</p>
      <StatBand
        items={[
          { k: "열선 없음", v: String(g.weakNoHeat), u: `/${data.weak.length}` },
          { k: "구 관리 공백", v: String(g.gu.none), u: "곳", accent: true },
          { k: "시 관리 결빙 공백", v: String(g.si.none), u: `/${g.si.total}` },
          { k: "열선 없는 동", v: String(g.noHeatDongs.length), u: "/15" },
        ]}
      />

      <SectionHead n="01" sub={`번호가 우선순위(구 소관 행동 가능 › 시 요청 › 동 › 학교). 행동 · 부서 · 기한 · 규모 · 개략 비용 · 완료 기준. 부서와 규모는 데이터에 있는 것만, 비용은 공개 단가(열선 1차로 100m당 1억 · 제설함 ${man(COST.saltBoxWon)})로 개략 산정. 조치 여부와 순서는 담당 부서가 정합니다. 행을 누르면 지도`}>
        눈 오기 전 점검 후보 {checks.length}
      </SectionHead>
      <div>
        {checks.map((c, i) => (
          <NumRow key={c.id} n={i + 1} big={String(c.n)} unit={c.owner === "구" ? "구 소관" : c.owner === "시" ? "시 소관" : c.owner === "학교" ? "학교" : "동 단위"} title={c.title} meta={`${c.dept} · ${c.due} · ${c.scale} · 비용 ${c.cost} · 완료 기준: ${c.done}`} body={c.body} accent={c.owner === "구"} onClick={() => onFocus(c.focus ?? null, c.short)} />
        ))}
      </div>
      <button onClick={() => setPrint(true)} className="mt-2 rounded-full border border-[var(--cp-border)] px-3.5 py-1.5 text-[13px] font-semibold text-(--dump-accent) hover:bg-[var(--cp-hover)]">
        결재용 한 장
      </button>
      {print && <CheckPrint data={data} onClose={() => setPrint(false)} />}

      <SectionHead n="02" sub={`행안부 적설취약구간 ${data.weak.length}곳(구 관리)과 상습결빙구간 ${data.ice.length}곳(시 관리 ${g.si.total}·구 관리 ${g.gu.total - data.weak.length}, 구 관리분은 열선 있음). ${data.gaps.heatNearM}m 안 열선, ${data.gaps.materialNearM}m 안 자재 기준. 공백 = 열선도 자재도 없음. 우선순위 점수 순(공백 3 · 경사 추정 %/10 · 초등학교 1.5 · 급경사 1 · 고갯길 0.5 · 구 소관 0.5), 둘째 줄이 근거`}>
        열선 없는 구간 {g.noHeat}곳(구 {g.gu.noHeat} · 시 {g.si.noHeat})
      </SectionHead>
      {/* 열선 예산 역산(의사결정자 관점 wow): 예산을 밀면 우선순위 순으로 신설 구간이 정해지고 지도 벽이 호박색으로 바뀐다 */}
      <div className="mb-2 rounded-lg bg-[var(--cp-panel2)] px-2.5 py-2">
        <div className="flex items-center gap-3">
          <span className="dump-kicker shrink-0 text-[10px] text-[var(--cp-text-dim)]">열선 예산 역산</span>
          <input type="range" min={0} max={30e8} step={5e7} value={budget} onChange={(e) => onBudget(Number(e.target.value))} aria-label="열선 신설 예산(원)" className="dump-range min-w-0 flex-1" />
          <span className="w-12 shrink-0 text-right font-mono text-[15px] font-semibold text-[var(--cp-text-strong)]">{budget ? eok(budget) : "0억"}</span>
        </div>
        <p className="mt-1 text-[12.5px] leading-snug text-[var(--cp-text-muted)]">
          {budget
            ? `${eok(budget)}이면 우선순위 상위 ${plan.planned.length}곳 ${plan.meters.toLocaleString("ko-KR")}m를 신설(개략 ${eok(plan.cost)})하고 열선 없는 구 관리 취약구간이 ${plan.total}곳에서 ${plan.remaining}곳으로 줍니다.${plan.next ? ` 한 곳 더(${plan.next.seg.name})는 ${eok(plan.next.cost)}이 더 듭니다.` : ""}`
            : `예산을 밀면 우선순위 순으로 열선 신설 구간이 정해집니다. 구 관리 ${plan.total}곳 전부는 개략 ${eok(planHeatBudget(data, Infinity).cost)}(2차로 가정, 100m당 1억).`}
        </p>
      </div>
      <Table cols={COLS} rows={first} cell={cell} rowH={44} rowKey={(r) => `${r.s.src}-${"i" in r.s ? r.s.i : r.s.id}`} onRow={pick} rowClass={(r) => (activeLabel && segName(r.s) === activeLabel ? "bg-[var(--cp-hover2)]" : "")} />
      {rest.length > 0 && (
        <details className="mt-1.5">
          <summary className="cursor-pointer text-[13px] text-(--dump-accent)">나머지 {rest.length}곳</summary>
          <div className="mt-1">
            <Table cols={COLS} rows={rest} cell={cell} rowH={44} rowKey={(r) => `${r.s.src}-${"i" in r.s ? r.s.i : r.s.id}`} onRow={pick} rowClass={(r) => (activeLabel && segName(r.s) === activeLabel ? "bg-[var(--cp-hover2)]" : "")} />
          </div>
        </details>
      )}
      <p className="mt-1.5 text-[12.5px] leading-snug text-[var(--cp-text-dim)]">열선까지 = 가장 가까운 열선까지 거리 · 자재 = {data.gaps.materialNearM}m 안 비치 자재 개소 · 소관 = 관리청(구·시) · 동 "구 밖" = 구 경계선 밖(강 위 램프)</p>

      <SectionHead n="03" sub="데이터에서 계산한 사실. 행을 누르면 지도가 그 자리를 표시합니다">
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
