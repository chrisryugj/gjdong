"use client"

import { useMemo, useState } from "react"
import type { OntoGraph, SnowForecast, SnowMapData } from "@/lib/snow/types"
import { fmtHM, ordinanceDeadline, STAGES, stageForSnow, type StageDef } from "@/lib/snow/stage"
import { fmt } from "@/lib/snow/facts"
import { SectionHead } from "@/components/dumping/section-head"

// 대응 단계 탭. 01 예보·특보로 서울시 단계 판정(대책기간 밖이면 시나리오 기본) 02 조례 제5조 시한 03 동원 자원(위치 공개 4종 / 규모만 공개)
// 단계 › 동원 자원은 graph.json의 mobilizes 엣지가 정본. 자원 수치는 map.json(facts)
// 문장 규칙: 합니다체, 한 문장 사실 하나, 화살표·괄호 남발 금지

interface Props {
  data: SnowMapData | null
  graph: OntoGraph | null
  forecast: SnowForecast | null | "error"
  simCm: number
  onSimCm: (cm: number) => void
  stage: StageDef
  useForecast: boolean
  onUseForecast: (v: boolean) => void
  inSeason: boolean
}

const WMO: Record<number, string> = { 0: "맑음", 1: "대체로 맑음", 2: "구름 조금", 3: "흐림", 45: "안개", 48: "안개", 51: "이슬비", 53: "이슬비", 55: "이슬비", 61: "비", 63: "비", 65: "강한 비", 68: "비 또는 눈", 71: "눈", 73: "눈", 75: "강한 눈", 77: "싸락눈", 80: "소나기", 81: "소나기", 82: "강한 소나기", 85: "소낙눈", 86: "강한 소낙눈", 95: "뇌우" }

export default function StagePanel({ data, graph, forecast, simCm, onSimCm, stage, useForecast, onUseForecast, inSeason }: Props) {
  const [endAt, setEndAt] = useState(() => {
    const d = new Date()
    d.setMinutes(0, 0, 0)
    return d
  })
  const [dailyCm, setDailyCm] = useState(3)
  const mobilized = useMemo(() => {
    if (!graph) return []
    const key = stage.id === "calm" ? "stage-0" : stage.id
    const ids = graph.edges.filter((e) => e.rel === "mobilizes" && e.f === key).map((e) => e.t)
    return ids.map((id) => graph.nodes.find((n) => n.id === id)).filter((n): n is NonNullable<typeof n> => !!n)
  }, [graph, stage.id])
  const allLevers = graph?.nodes.filter((n) => n.type === "Lever") ?? []
  const idle = allLevers.filter((l) => !mobilized.some((m) => m.id === l.id))
  const fc = forecast && forecast !== "error" ? forecast : null
  const warn = fc?.warning?.level ?? "none"
  const liveStage = fc ? stageForSnow(fc.snow24, warn) : null
  const deadline = ordinanceDeadline(endAt, dailyCm)
  const endStr = `${endAt.getFullYear()}-${String(endAt.getMonth() + 1).padStart(2, "0")}-${String(endAt.getDate()).padStart(2, "0")}T${String(endAt.getHours()).padStart(2, "0")}:${String(endAt.getMinutes()).padStart(2, "0")}`
  const mapped = mobilized.filter((n) => ["lev-heat", "lev-salt", "lev-cacl", "lev-sand"].includes(n.id))
  const scaled = mobilized.filter((n) => !["lev-heat", "lev-salt", "lev-cacl", "lev-sand"].includes(n.id))
  const headline = useForecast && fc ? (fc.snow24 > 0 || warn !== "none" ? `예보 적설 ${fc.snow24}cm${warn !== "none" ? `와 ${warn === "warning" ? "대설경보" : "대설주의보"}` : ""}로 서울시 기준 ${stage.label}입니다.` : "예보 적설이 없어 평시입니다.") : `시나리오: 적설 ${simCm}cm 예보라면 서울시 기준 ${stage.label}입니다.`

  return (
    <div className="px-4 pb-4 pt-3">
      <p className="dump-headline text-[21px] leading-[1.42] text-[var(--cp-text-strong)]">{headline}</p>
      <p className="mt-1.5 text-[14px] leading-snug text-[var(--cp-text-muted)]">
        {stage.id === "calm" ? "열선과 살포기는 기온 조건으로 자동 가동합니다." : `자원 ${mobilized.length}종을 동원합니다. ${stage.gist}`}
      </p>

      <SectionHead n="01" sub={fc ? `${fc.model} · ${new Date(fc.fetched).toLocaleString("ko-KR", { hour: "2-digit", minute: "2-digit" })} 갱신 · 광진구청 격자` : forecast === "error" ? "예보를 받지 못했습니다" : "예보를 불러오는 중"}>
        {inSeason ? "지금 예보와 특보" : "시나리오"}
      </SectionHead>
      {!inSeason && (
        <p className="mb-2 text-[13.5px] leading-snug text-[var(--cp-text-muted)]">
          지금은 대책기간(11월 15일부터 3월 15일까지) 밖이라 실제 예보가 아니라 슬라이더 값으로 단계를 봅니다.
          {fc && fc.now && (
            <span className="text-[var(--cp-text-dim)]">
              {" "}
              실황 {fc.now.temp.toFixed(1)}° {WMO[fc.now.code] ?? ""}, 적설 없음.
            </span>
          )}
        </p>
      )}
      {inSeason && fc && (
        <div className="grid grid-cols-3 gap-2">
          <Tile k="현재 기온" v={fc.now ? `${fc.now.temp.toFixed(1)}°` : "실황 없음"} s={fc.now ? (WMO[fc.now.code] ?? "") : ""} />
          <Tile k="24시간 적설" v={`${fc.snow24}cm`} s={liveStage ? liveStage.label : ""} accent={fc.snow24 > 0} />
          <Tile k="특보" v={warn === "warning" ? "대설경보" : warn === "advisory" ? "대설주의보" : "없음"} s={fc.warning ? "기상청 서울" : "미수신"} accent={warn !== "none"} />
        </div>
      )}
      <div className="mt-3 flex items-center gap-3">
        <input type="range" min={0} max={15} step={0.5} value={simCm} disabled={useForecast} onChange={(e) => onSimCm(Number(e.target.value))} aria-label="예보 적설(cm)" className="dump-range flex-1" />
        <span className="w-16 text-right font-mono text-[17px] font-semibold text-[var(--cp-text-strong)]">{simCm}cm</span>
      </div>
      {inSeason && (
        <label className="mt-2 flex items-center gap-2 text-[13.5px] text-[var(--cp-text-muted)]">
          <input type="checkbox" checked={useForecast} onChange={(e) => onUseForecast(e.target.checked)} disabled={!fc} className="accent-(--dump-accent)" />
          예보와 특보로 단계를 정합니다
        </label>
      )}
      <ol className="mt-3 grid grid-cols-5 gap-1">
        {STAGES.map((s) => {
          const on = s.order <= stage.order
          const cur = s.id === stage.id
          return (
            <li key={s.id} className={`rounded-lg border px-1.5 py-1.5 text-center ${cur ? "border-(--dump-accent) bg-(--dump-accent)/10" : on ? "border-[var(--cp-border-strong)]" : "border-[var(--cp-border)] opacity-55"}`}>
              <div className={`text-[13px] font-bold ${cur ? "text-(--dump-accent)" : "text-[var(--cp-text-strong)]"}`}>{s.label}</div>
              <div className="mt-0.5 text-[12px] leading-tight text-[var(--cp-text-dim)]">{s.cond.replace("적설 ", "").replace(" 예보", "").replace(" 또는 대설주의보", "").replace(" 또는 대설경보", "")}</div>
            </li>
          )
        })}
      </ol>
      <p className="mt-2 text-[13px] leading-snug text-[var(--cp-text-dim)]">2단계는 대설주의보, 3단계는 대설경보로도 발령합니다. 출처 서울시 2026-02-01.</p>

      <SectionHead n="02" sub="광진구 건축물관리자의 제설·제빙에 관한 조례 제5조. 주간·야간 시각은 조례에 없어 07시부터 19시까지를 주간으로 가정합니다">
        조례 시한
      </SectionHead>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[13.5px] text-[var(--cp-text-muted)]">
        <label className="flex items-center gap-2">
          눈 그친 시각
          <input
            type="datetime-local"
            value={endStr}
            onChange={(e) => {
              const d = new Date(e.target.value)
              if (!Number.isNaN(d.getTime())) setEndAt(d)
            }}
            lang="ko-KR"
            className="rounded-md border border-[var(--cp-border)] bg-[var(--cp-panel)] px-2 py-1 text-[13.5px] text-[var(--cp-text-strong)] [color-scheme:dark]"
          />
        </label>
        <label className="flex items-center gap-2">
          1일 적설
          <input type="number" min={0} max={50} step={1} value={dailyCm} onChange={(e) => setDailyCm(Number(e.target.value))} className="w-16 rounded-md border border-[var(--cp-border)] bg-[var(--cp-panel)] px-2 py-1 text-right text-[13.5px] text-[var(--cp-text-strong)]" />
          cm
        </label>
      </div>
      <p className="mt-2 text-[15px] leading-relaxed text-[var(--cp-text-strong)]">
        눈이 {fmtHM(endAt)}에 그치면 건축물관리자는 <b className="text-(--dump-accent)">{fmtHM(deadline.due)}</b>까지 보도와 이면도로를 치워야 합니다.
      </p>
      <p className="text-[13px] text-[var(--cp-text-dim)]">{deadline.text}. 조례 제5조 제1항.</p>

      <SectionHead n="03" sub={`${stage.label}에서 동원하는 자원 ${mobilized.length}종`}>
        동원 자원
      </SectionHead>
      <div className="dump-kicker text-[10px] text-[var(--cp-text-dim)]">위치 공개 자원 · 지도에 표시</div>
      <ul className="mt-1 space-y-1.5">
        {mapped.map((n, i) => (
          <li key={n.id} className="flex items-baseline gap-2">
            <span className="dump-idx w-5 shrink-0 text-[12px] text-(--dump-accent)">{String(i + 1).padStart(2, "0")}</span>
            <span className="text-[14.5px] font-semibold text-[var(--cp-text-strong)]">{n.label}</span>
            <span className="text-[12.5px] text-[var(--cp-text-dim)]">{leverCount(n.id, data)}</span>
          </li>
        ))}
        {mapped.length === 0 && <li className="text-[13px] text-[var(--cp-text-dim)]">이 단계에서 지도 자원 동원 없음</li>}
      </ul>
      {scaled.length > 0 && (
        <>
          <div className="dump-kicker mt-3 text-[10px] text-[var(--cp-text-dim)]">규모만 공개 · 보도자료 {data?.ops.source.split(" · ")[0].replace("광진구 보도자료 ", "") ?? ""}</div>
          <ul className="mt-1 space-y-1.5">
            {scaled.map((n, i) => (
              <li key={n.id} className="flex items-baseline gap-2">
                <span className="dump-idx w-5 shrink-0 text-[12px] text-[var(--cp-text-faint)]">{String(mapped.length + i + 1).padStart(2, "0")}</span>
                <span className="text-[14.5px] font-semibold text-[var(--cp-text-strong)]">{n.label}</span>
                <span className="text-[12.5px] text-[var(--cp-text-dim)]">{leverCount(n.id, data)}</span>
              </li>
            ))}
          </ul>
        </>
      )}
      {idle.length > 0 && <p className="mt-2 text-[13px] text-[var(--cp-text-faint)]">대기: {idle.map((n) => n.label).join(" · ")}</p>}
    </div>
  )
}

function Tile({ k, v, s, accent = false }: { k: string; v: string; s: string; accent?: boolean }) {
  return (
    <div className="rounded-xl border border-[var(--cp-border)] px-3 py-2.5">
      <div className="dump-kicker text-[10px] text-[var(--cp-text-dim)]">{k}</div>
      <div className={`mt-0.5 font-mono text-[22px] font-semibold leading-none ${accent ? "text-(--dump-accent)" : "text-[var(--cp-text-strong)]"}`}>{v}</div>
      <div className="mt-1 text-[12px] text-[var(--cp-text-dim)]">{s}</div>
    </div>
  )
}

function leverCount(id: string, data: SnowMapData | null): string {
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
      return `${data.ops.sprayers}대`
    case "lev-fleet":
      return `유니목 ${data.ops.unimog}대 · 15톤 덤프 ${data.ops.dump15t}대`
    case "lev-staff":
      return `${fmt(data.ops.staff)}명 · 실무반 ${data.ops.squads}개`
    case "lev-owner":
      return "조례 제4조 범위"
    case "lev-civic":
      return "자율방재단·의용소방대"
    default:
      return ""
  }
}
