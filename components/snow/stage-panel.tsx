"use client"

import { useMemo, useState } from "react"
import type { OntoGraph, SnowForecast, SnowMapData } from "@/lib/snow/types"
import { fmtHM, ordinanceDeadline, STAGES, stageForSnow, type StageDef } from "@/lib/snow/stage"
import { fmt } from "@/lib/snow/facts"
import { SectionHead } from "@/components/dumping/section-head"

// 대응 단계 탭. ① 지금 예보(Open-Meteo 기상청 모델)로 서울시 단계를 판정 ② 적설 슬라이더로 단계·동원 자원을 시뮬레이션 ③ 조례 제5조 시한 계산
// 단계 → 동원 자원은 graph.json의 mobilizes 엣지가 정본. 자원 수치는 map.json(facts)

interface Props {
  data: SnowMapData | null
  graph: OntoGraph | null
  forecast: SnowForecast | null | "error"
  simCm: number
  onSimCm: (cm: number) => void
  stage: StageDef
  useForecast: boolean
  onUseForecast: (v: boolean) => void
}

const WMO: Record<number, string> = { 0: "맑음", 1: "대체로 맑음", 2: "구름 조금", 3: "흐림", 45: "안개", 48: "안개(서리)", 51: "이슬비", 53: "이슬비", 55: "이슬비", 61: "비", 63: "비", 65: "강한 비", 71: "눈", 73: "눈", 75: "강한 눈", 77: "싸락눈", 80: "소나기", 81: "소나기", 82: "강한 소나기", 85: "소낙눈", 86: "강한 소낙눈", 95: "뇌우" }

export default function StagePanel({ data, graph, forecast, simCm, onSimCm, stage, useForecast, onUseForecast }: Props) {
  const [endAt, setEndAt] = useState(() => {
    const d = new Date()
    d.setMinutes(0, 0, 0)
    return d
  })
  const mobilized = useMemo(() => {
    if (!graph) return []
    const ids = graph.edges.filter((e) => e.rel === "mobilizes" && e.f === stage.id).map((e) => e.t)
    const base = stage.id === "calm" ? graph.edges.filter((e) => e.rel === "mobilizes" && e.f === "stage-0").map((e) => e.t) : ids
    return base.map((id) => graph.nodes.find((n) => n.id === id)).filter((n): n is NonNullable<typeof n> => !!n)
  }, [graph, stage.id])
  const allLevers = graph?.nodes.filter((n) => n.type === "Lever") ?? []
  const idle = allLevers.filter((l) => !mobilized.some((m) => m.id === l.id))
  const fc = forecast && forecast !== "error" ? forecast : null
  const liveStage = fc ? stageForSnow(fc.snow24) : null
  const deadline = ordinanceDeadline(endAt, simCm)
  const endStr = `${endAt.getFullYear()}-${String(endAt.getMonth() + 1).padStart(2, "0")}-${String(endAt.getDate()).padStart(2, "0")}T${String(endAt.getHours()).padStart(2, "0")}:${String(endAt.getMinutes()).padStart(2, "0")}`

  return (
    <div className="px-4 pb-4 pt-3">
      {/* 결론 문장 */}
      <p className="dump-headline text-[21px] leading-[1.42] text-[var(--cp-text-strong)]">
        {stage.id === "calm" ? "지금 광진구는 평시 감시 상태입니다." : `예보 적설 ${simCm}cm이면 서울시 기준 ${stage.label}입니다.`}{" "}
        <span className="text-[var(--cp-text-muted)]">{stage.gist}.</span>
      </p>

      <SectionHead n="01" sub={fc ? `${fc.model} · ${new Date(fc.fetched).toLocaleString("ko-KR", { hour: "2-digit", minute: "2-digit" })} 갱신 · 광진구청 좌표` : "예보를 불러오는 중"}>
        지금 예보
      </SectionHead>
      {forecast === "error" ? (
        <p className="text-[13.5px] text-[var(--cp-text-dim)]">예보를 받지 못했습니다. 아래 슬라이더로 시나리오를 볼 수 있습니다.</p>
      ) : fc ? (
        <div className="grid grid-cols-3 gap-2">
          <Tile k="현재 기온" v={fc.now ? `${fc.now.temp.toFixed(1)}°` : "–"} s={fc.now ? (WMO[fc.now.code] ?? `WMO ${fc.now.code}`) : ""} />
          <Tile k="24시간 적설" v={`${fc.snow24}cm`} s={liveStage ? liveStage.label : ""} accent={fc.snow24 > 0} />
          <Tile k="24시간 최저" v={`${fc.minTemp24.toFixed(1)}°`} s={fc.minTemp24 <= 0 ? "결빙 조건" : "영상"} />
        </div>
      ) : (
        <div className="dump-skel h-16 rounded-xl" />
      )}
      <label className="mt-3 flex items-center gap-2 text-[13.5px] text-[var(--cp-text-muted)]">
        <input type="checkbox" checked={useForecast} onChange={(e) => onUseForecast(e.target.checked)} disabled={!fc} className="accent-(--dump-accent)" />
        예보 적설로 단계를 정한다 {fc && useForecast ? `(${fc.snow24}cm → ${liveStage?.label})` : "(끄면 아래 슬라이더)"}
      </label>

      <SectionHead n="02" sub="서울시 기준: 보강 1cm 미만 · 1단계 5cm 미만 · 2단계 5cm 이상 또는 대설주의보 · 3단계 10cm 이상 또는 대설경보. 특보는 이 화면이 받지 않는다">
        단계 시뮬레이션
      </SectionHead>
      <div className="flex items-center gap-3">
        <input
          type="range"
          min={0}
          max={15}
          step={0.5}
          value={simCm}
          disabled={useForecast}
          onChange={(e) => onSimCm(Number(e.target.value))}
          aria-label="예보 적설(cm)"
          className="dump-range flex-1"
        />
        <span className="w-16 text-right font-mono text-[17px] font-semibold text-[var(--cp-text-strong)]">{simCm}cm</span>
      </div>
      <ol className="mt-3 grid grid-cols-5 gap-1">
        {STAGES.map((s) => {
          const on = s.order <= stage.order
          const cur = s.id === stage.id
          return (
            <li key={s.id} className={`rounded-lg border px-1.5 py-1.5 text-center ${cur ? "border-(--dump-accent) bg-(--dump-accent)/10" : on ? "border-[var(--cp-border-strong)]" : "border-[var(--cp-border)] opacity-55"}`}>
              <div className={`text-[12.5px] font-bold ${cur ? "text-(--dump-accent)" : "text-[var(--cp-text-strong)]"}`}>{s.label}</div>
              <div className="mt-0.5 text-[10.5px] leading-tight text-[var(--cp-text-dim)]">{s.cond.replace("적설 ", "").replace(" 예보", "")}</div>
            </li>
          )
        })}
      </ol>

      <SectionHead n="03" sub={`${stage.label}에서 동원하는 자원 ${mobilized.length}종. 지도에서 동원 자원은 진하게, 나머지는 흐리게`}>
        동원 자원
      </SectionHead>
      <ul className="space-y-1.5">
        {mobilized.map((n) => (
          <li key={n.id} className="flex items-baseline gap-2 border-l-2 border-(--dump-accent) pl-2.5">
            <span className="text-[14.5px] font-semibold text-[var(--cp-text-strong)]">{n.label}</span>
            <span className="text-[12.5px] text-[var(--cp-text-dim)]">{leverCount(n.id, data, n.props)}</span>
          </li>
        ))}
      </ul>
      {idle.length > 0 && (
        <p className="mt-2 text-[12.5px] text-[var(--cp-text-faint)]">
          대기: {idle.map((n) => n.label).join(" · ")}
        </p>
      )}

      <SectionHead n="04" sub="광진구 건축물관리자의 제설·제빙에 관한 조례 제5조. 주간·야간 시각은 조례에 없어 07~19시를 주간으로 둔다(가정)">
        조례 시한 계산
      </SectionHead>
      <label className="flex items-center gap-2 text-[13.5px] text-[var(--cp-text-muted)]">
        눈 그친 시각
        <input
          type="datetime-local"
          value={endStr}
          onChange={(e) => {
            const d = new Date(e.target.value)
            if (!Number.isNaN(d.getTime())) setEndAt(d)
          }}
          className="rounded-md border border-[var(--cp-border)] bg-[var(--cp-panel)] px-2 py-1 text-[13.5px] text-[var(--cp-text-strong)]"
        />
      </label>
      <p className="mt-2 text-[15px] leading-relaxed text-[var(--cp-text-strong)]">
        1일 적설 <b>{simCm}cm</b>이면 <b className="text-(--dump-accent)">{fmtHM(deadline.due)}</b>까지 보도·이면도로를 치워야 한다.
        <span className="block text-[13px] text-[var(--cp-text-dim)]">{deadline.text}</span>
      </p>

      {data && (
        <p className="mt-5 border-t border-[var(--cp-border)] pt-3 text-[12px] leading-relaxed text-[var(--cp-text-faint)]">
          대책기간 {data.ops.period.from} ~ {data.ops.period.to}. 인력·장비·살포기 수치는 보도자료({data.ops.source.split(" · ")[0]}) 전사이며 개소 위치는 공개돼 있지 않다.
        </p>
      )}
    </div>
  )
}

function Tile({ k, v, s, accent = false }: { k: string; v: string; s: string; accent?: boolean }) {
  return (
    <div className="rounded-xl border border-[var(--cp-border)] px-3 py-2.5">
      <div className="dump-kicker text-[10px] text-[var(--cp-text-dim)]">{k}</div>
      <div className={`mt-0.5 font-mono text-[22px] font-semibold leading-none ${accent ? "text-(--dump-accent)" : "text-[var(--cp-text-strong)]"}`}>{v}</div>
      <div className="mt-1 text-[11.5px] text-[var(--cp-text-dim)]">{s}</div>
    </div>
  )
}

function leverCount(id: string, data: SnowMapData | null, props: Record<string, string | number>): string {
  if (!data) return ""
  switch (id) {
    case "lev-heat":
      return `${data.heat.length}구간 ${fmt(data.heat.reduce((s, h) => s + h.m, 0))}m`
    case "lev-salt":
      return `${data.salt.length}개소`
    case "lev-cacl":
      return `${data.cacl.length}개소`
    case "lev-sand":
      return `${data.sand.length}지점 ${fmt(data.sand.reduce((s, x) => s + x.qty, 0))}포`
    case "lev-sprayer":
      return `${data.ops.sprayers}대 (보도)`
    case "lev-fleet":
      return `유니목 ${data.ops.unimog} · 15t 덤프 ${data.ops.dump15t} (보도)`
    case "lev-staff":
      return `${fmt(data.ops.staff)}명 · 실무반 ${data.ops.squads} (보도)`
    default:
      return String(props.kind ?? "")
  }
}
