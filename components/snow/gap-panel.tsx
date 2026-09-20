"use client"

import type { SnowMapData } from "@/lib/snow/types"
import { buildChecklist, buildFindings, gapSummary, segName, segOwner, segType, type Finding, type SegLike } from "@/lib/snow/facts"
import { SectionHead } from "@/components/dumping/section-head"
import { NumRow, StatBand, Table } from "./ui"

// 공백 탭(첫 화면). 주장은 자원 목록이 아니라 "눈 오기 전에 어디가 비었는가": 취약구간 중 열선·자재 없는 곳, 열선 없는 동
// 3라운드(보고받는 사람 관점): 구가 손댈 수 있는 구간(구 관리 47)과 서울시 관리 결빙구간 9를 갈라 말한다. 공백 7곳 중 6곳이 시 관리 간선이라 한 수로 묶으면 구청장이 할 일이 안 보였다
// 규격(dumping 정책 탭): 머리기사 › 부제 › 수치 4칸(헤어라인) › 표(번호·구간·동·열선·자재·소관, 행 30px) › 발견 번호 행. 상자 0
// 문장 규칙: 합니다체, 한 문장 사실 하나, 비유 동사 0, 괄호는 단위·기준일에만

interface Props {
  data: SnowMapData | null
  onFocus: (f: Finding["focus"] | null, label?: string) => void
  onSelectSegment: (heatIds: number[] | null, layer: "weak" | "ice", path: [number, number][], label?: string, detail?: string) => void
  onOpenMethods: () => void
}

const COLS = [
  { k: "번호", w: "24px", dim: true },
  { k: "구간", w: "minmax(0,1fr)" },
  { k: "동", w: "52px", dim: true },
  { k: "열선", w: "50px", align: "right" as const },
  { k: "자재", w: "40px", align: "right" as const },
  { k: "소관", w: "22px", dim: true },
]

export default function GapPanel({ data, onFocus, onSelectSegment, onOpenMethods }: Props) {
  if (!data) return <div className="p-4"><div className="dump-skel h-24 rounded-xl" /></div>
  const g = gapSummary(data)
  const findings = buildFindings(data)
  const checks = buildChecklist(data)
  const rows = g.noHeatList.map((s, i) => ({ s, i: i + 1 }))
  const first = rows.slice(0, 9)
  const rest = rows.slice(9)
  const cell = ({ s, i }: { s: SegLike; i: number }, k: string) => {
    switch (k) {
      case "번호":
        return <span className={s.gap ? "font-semibold text-(--dump-accent)" : ""}>{String(i).padStart(2, "0")}</span>
      case "구간":
        return (
          <>
            <span className="font-semibold text-[var(--cp-text-strong)]">{segName(s)}</span>
            <span className="ml-1.5 text-[12.5px] text-[var(--cp-text-dim)]">{segType(s)}</span>
          </>
        )
      case "동":
        return s.d ? s.d.replace(/동$/, "") : "미판정"
      case "열선":
        return s.near.heat == null ? "없음" : `${s.near.heat.toLocaleString("ko-KR")}m`
      case "자재":
        return s.materialsNear ? `${s.materialsNear}` : <span className="font-semibold text-(--dump-accent)">0</span>
      case "소관":
        return segOwner(s)
      default:
        return null
    }
  }
  const pick = ({ s }: { s: SegLike }) => onSelectSegment(s.heatIds, s.src, s.path, segName(s), `${segType(s)} · ${s.d ?? "동 미판정"} · 열선 ${s.near.heat == null ? "없음" : `${s.near.heat.toLocaleString("ko-KR")}m`} · 자재 ${s.materialsNear ? `${s.materialsNear}개소` : "없음"} · ${segOwner(s)} 소관`)

  return (
    <div className="px-4 pb-4 pt-3">
      <p className="dump-headline text-[21px] leading-[1.42] text-[var(--cp-text-strong)]">
        구 관리 취약구간 {g.gu.total}곳 중 {g.gu.noHeat}곳에 열선이 없습니다.
      </p>
      <p className="mt-1.5 text-[14px] leading-snug text-[var(--cp-text-muted)]">
        비치 자재도 없는 곳은 {g.gu.none}곳{g.gu.noneNames.length ? `(${g.gu.noneNames.join("·")})` : ""}입니다. 서울시 관리 결빙구간 {g.si.total}곳 중 {g.si.none}곳은 열선도 자재도 없습니다.
      </p>
      <StatBand
        items={[
          { k: "구 관리 열선 없음", v: String(g.gu.noHeat), u: `/${g.gu.total}` },
          { k: "구 관리 자재도 없음", v: String(g.gu.none), u: "곳", accent: true },
          { k: "시 관리 둘 다 없음", v: String(g.si.none), u: `/${g.si.total}` },
          { k: "열선 없는 동", v: String(g.noHeatDongs.length), u: "/15" },
        ]}
      />

      <SectionHead n="01" sub={`구 관리 ${g.gu.total}곳 = 행안부 적설취약구간 ${data.weak.length}곳 + 구가 관리하는 결빙구간 ${g.gu.total - data.weak.length}곳. 시 관리 결빙구간 ${g.si.total}곳. ${data.gaps.heatNearM}m 안 열선, ${data.gaps.materialNearM}m 안 자재 기준. 자재도 없는 구간부터, 구 소관부터`}>
        열선 없는 구간 {g.noHeat}곳
      </SectionHead>
      <Table cols={COLS} rows={first} cell={cell} rowKey={(r) => `${r.s.src}-${"i" in r.s ? r.s.i : r.s.id}`} onRow={pick} />
      {rest.length > 0 && (
        <details className="mt-1.5">
          <summary className="cursor-pointer text-[13px] text-(--dump-accent)">나머지 {rest.length}곳</summary>
          <div className="mt-1">
            <Table cols={COLS} rows={rest} cell={cell} rowKey={(r) => `${r.s.src}-${"i" in r.s ? r.s.i : r.s.id}`} onRow={pick} />
          </div>
        </details>
      )}
      <p className="mt-1.5 text-[12.5px] leading-snug text-[var(--cp-text-dim)]">열선 = 가장 가까운 열선까지 거리 · 자재 = {data.gaps.materialNearM}m 안 비치 자재 개소 · 소관 = 관리청(구·시)</p>

      <SectionHead n="02" sub="데이터가 가리키는 후보와 소관. 조치 여부와 순서는 담당 부서가 정합니다. 행을 누르면 지도">
        눈 오기 전 점검 후보 {checks.length}
      </SectionHead>
      <div>
        {checks.map((c, i) => (
          <NumRow key={c.id} n={i + 1} big={String(c.n)} unit={c.owner === "구" ? "구 소관" : c.owner === "시" ? "시 소관" : "동 단위"} title={c.title} body={c.body} accent={c.owner === "구"} onClick={() => onFocus(c.focus ?? null, c.title.split(/[:은는]/)[0])} />
        ))}
      </div>

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
