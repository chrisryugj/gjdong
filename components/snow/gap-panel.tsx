"use client"

import type { SnowMapData } from "@/lib/snow/types"
import { buildFindings, gapSummary, segKind, segName, type Finding } from "@/lib/snow/facts"
import { SectionHead } from "@/components/dumping/section-head"

// 공백 탭(첫 화면). 주장은 자원 목록이 아니라 "눈 오기 전에 어디가 비었는가": 취약구간 중 열선·자재 없는 곳, 열선 없는 동
// 문장 규칙: 합니다체, 한 문장 사실 하나, 비유 동사 0, 괄호는 단위·기준일에만

interface Props {
  data: SnowMapData | null
  onFocus: (f: Finding["focus"] | null, label?: string) => void
  onSelectSegment: (heatIds: number[] | null, layer: "weak" | "ice", path: [number, number][], label?: string) => void
  onOpenMethods: () => void
}

export default function GapPanel({ data, onFocus, onSelectSegment, onOpenMethods }: Props) {
  if (!data) return <div className="p-4"><div className="dump-skel h-24 rounded-xl" /></div>
  const g = gapSummary(data)
  const findings = buildFindings(data)
  const gapOnly = g.noHeatList.filter((s) => s.gap)
  const rest = g.noHeatList.filter((s) => !s.gap)

  return (
    <div className="px-4 pb-4 pt-3">
      <p className="dump-headline text-[21px] leading-[1.42] text-[var(--cp-text-strong)]">
        취약구간 {g.total}곳 중 {g.noHeat}곳에 열선이 없습니다.
      </p>
      <div className="mt-3 grid grid-cols-3 gap-2">
        <Tile k="열선·자재 없음" v={String(g.none)} u="곳" accent />
        <Tile k="열선 없는 동" v={String(g.noHeatDongs.length)} u="/15" />
        <Tile k="열선 없는 초등학교" v={String(g.schoolsNoHeat)} u={`/${data.schools.length}`} />
      </div>

      <SectionHead n="01" sub={`행안부 적설취약구간 ${data.weak.length}곳과 상습결빙구간 ${data.ice.length}곳. ${data.gaps.heatNearM}m 안 열선, ${data.gaps.materialNearM}m 안 자재 기준`}>
        열선 없는 구간 {g.noHeat}곳
      </SectionHead>
      <ol className="space-y-1">
        {gapOnly.map((s) => (
          <SegRow key={`${s.src}-${"i" in s ? s.i : s.id}`} name={segName(s)} kind={segKind(s)} d={s.d} near={s.near.heat} mat={s.materialsNear} gap onClick={() => onSelectSegment(s.heatIds, s.src, s.path, segName(s))} />
        ))}
        {rest.slice(0, 5).map((s) => (
          <SegRow key={`${s.src}-${"i" in s ? s.i : s.id}`} name={segName(s)} kind={segKind(s)} d={s.d} near={s.near.heat} mat={s.materialsNear} onClick={() => onSelectSegment(s.heatIds, s.src, s.path, segName(s))} />
        ))}
      </ol>
      {rest.length > 5 && (
        <details className="mt-1.5">
          <summary className="cursor-pointer text-[13px] text-(--dump-accent)">나머지 {rest.length - 5}곳</summary>
          <ol className="mt-1 space-y-1">
            {rest.slice(5).map((s) => (
              <SegRow key={`${s.src}-${"i" in s ? s.i : s.id}`} name={segName(s)} kind={segKind(s)} d={s.d} near={s.near.heat} mat={s.materialsNear} onClick={() => onSelectSegment(s.heatIds, s.src, s.path, segName(s))} />
            ))}
          </ol>
        </details>
      )}

      <SectionHead n="02" sub="데이터에서 계산한 사실. 카드를 누르면 지도가 그 자리를 표시합니다">
        발견 {findings.length}
      </SectionHead>
      <ul className="space-y-2">
        {findings.map((f) => (
          <li key={f.id}>
            <button onClick={() => onFocus(f.focus ?? null, f.kicker === "공백" || f.kind === "gap" ? f.title.split(" 중 ")[0] : f.kicker)} className="flex w-full items-start gap-3 rounded-xl border border-[var(--cp-border)] px-3 py-2.5 text-left hover:border-[var(--cp-border-strong)]">
              <span className="w-[68px] shrink-0">
                <span className={`block font-mono text-[22px] font-semibold leading-none ${f.kind === "gap" ? "text-(--dump-accent)" : "text-[var(--cp-text-strong)]"}`}>{f.n}</span>
                <span className="mt-0.5 block text-[12px] text-[var(--cp-text-dim)]">{f.unit}</span>
              </span>
              <span className="min-w-0">
                <span className="dump-kicker block text-[9.5px] text-[var(--cp-text-dim)]">{f.kicker}</span>
                <span className="block text-[15px] font-semibold leading-snug text-[var(--cp-text-strong)]">{f.title}</span>
                <span className="mt-0.5 block text-[13px] leading-snug text-[var(--cp-text-muted)]">{f.body}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>

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

function Tile({ k, v, u, accent = false }: { k: string; v: string; u: string; accent?: boolean }) {
  return (
    <div className="rounded-xl border border-[var(--cp-border)] px-3 py-2.5">
      <div className="dump-kicker text-[10px] text-[var(--cp-text-dim)]">{k}</div>
      <div className="mt-0.5 flex items-baseline gap-1">
        <span className={`font-mono text-[22px] font-semibold leading-none ${accent ? "text-(--dump-accent)" : "text-[var(--cp-text-strong)]"}`}>{v}</span>
        <span className="text-[12px] text-[var(--cp-text-dim)]">{u}</span>
      </div>
    </div>
  )
}

function SegRow({ name, kind, d, near, mat, gap = false, onClick }: { name: string; kind: string; d: string | null; near: number | null; mat: number; gap?: boolean; onClick: () => void }) {
  return (
    <li>
      <button onClick={onClick} className={`flex w-full items-baseline gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-[var(--cp-hover)] ${gap ? "border-l-2 border-(--dump-accent)" : "border-l-2 border-transparent"}`}>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[14.5px] font-semibold text-[var(--cp-text-strong)]">{name}</span>
          <span className="block text-[12.5px] text-[var(--cp-text-dim)]">
            {kind} · {d ?? "동 미판정"}
          </span>
        </span>
        <span className="shrink-0 text-right text-[12.5px] text-[var(--cp-text-muted)]">
          <span className="block">열선 {near == null ? "없음" : `${near.toLocaleString("ko-KR")}m`}</span>
          <span className={`block ${mat ? "" : "font-semibold text-(--dump-accent)"}`}>{mat ? `자재 ${mat}개소` : "자재 없음"}</span>
        </span>
      </button>
    </li>
  )
}
