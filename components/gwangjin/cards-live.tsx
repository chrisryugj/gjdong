"use client"

// 실시간 축 카드 — 지하철·의료·혼잡도·강우/수위 + 공용 Card/NeedKey
// 데이터가 null이면 해당 원천의 키 미설정 — 발급 주소 카드로 강등 (KEY_GUIDES)

import { useState } from "react"
import Link from "next/link"
import { ExternalLink, KeyRound } from "lucide-react"
import { LEVEL_COLORS, textColor, type CrowdSpot } from "@/lib/crowd/seoul-rtd"
import { KEY_GUIDES, STATIONS, type NeedKey } from "@/lib/gwangjin/constants"
import type { RainInfo, RiverInfo } from "@/lib/gwangjin/env-safety"
import type { SubwayBoard } from "@/lib/gwangjin/subway"
import type { CareBundle } from "@/components/gwangjin/gwangjin-dashboard"

export function Card({ title, badge, children }: { title: string; badge?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-[var(--cp-border-faint)] bg-[var(--cp-panel)] p-3">
      <h2 className="mb-2 flex items-baseline gap-1.5 text-[13px] font-bold text-[var(--cp-text-strong)]">
        {title}
        {badge && <span className="text-[10px] font-normal text-[var(--cp-text-dim)]">{badge}</span>}
      </h2>
      {children}
    </section>
  )
}

/** 키 미설정 안내 — 발급/활용신청 페이지로 바로 보낸다 */
export function NeedKeyNote({ guide }: { guide: NeedKey }) {
  return (
    <div className="flex flex-col gap-1.5 rounded-lg border border-dashed border-[var(--cp-border)] p-2.5 text-[12px]">
      <div className="flex items-center gap-1.5 text-[var(--cp-text-muted)]">
        <KeyRound className="h-3.5 w-3.5 shrink-0" />
        <code className="font-mono text-[11px]">{guide.key}</code> 설정 필요
      </div>
      <a
        href={guide.url}
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center gap-1 text-sky-400 hover:underline"
      >
        {guide.label} <ExternalLink className="h-3 w-3" />
      </a>
      {guide.note && <p className="text-[11px] text-[var(--cp-text-dim)]">{guide.note}</p>}
    </div>
  )
}

export function Empty({ text }: { text: string }) {
  return <p className="py-2 text-center text-[12px] text-[var(--cp-text-dim)]">{text}</p>
}

// ── 지하철 ──────────────────────────────────────────────────────────────
export function SubwayCard({
  station,
  board,
  needsKey,
  onStation,
}: {
  station: string
  board: SubwayBoard | null
  needsKey: boolean
  onStation: (s: string) => void
}) {
  return (
    <Card title="지하철 도착" badge="30초 갱신">
      <div className="scrollbar-thin mb-2 flex gap-1 overflow-x-auto pb-1">
        {STATIONS.map((s) => (
          <button
            key={s.base}
            type="button"
            onClick={() => onStation(s.base)}
            className={`shrink-0 whitespace-nowrap rounded-full border px-2.5 py-1 text-[11px] transition-colors ${
              station === s.base
                ? "border-[var(--cp-border-active)] bg-[var(--cp-panel2)] text-[var(--cp-text-strong)]"
                : "border-[var(--cp-border)] text-[var(--cp-text-muted)] hover:bg-[var(--cp-hover)]"
            }`}
          >
            {s.base}
          </button>
        ))}
      </div>
      {needsKey ? (
        <NeedKeyNote guide={KEY_GUIDES.subway} />
      ) : !board ? (
        <Empty text="불러오는 중…" />
      ) : board.arrivals.length === 0 ? (
        <Empty text="도착 예정 열차가 없습니다" />
      ) : (
        <ul className="space-y-1">
          {board.arrivals.slice(0, 6).map((a, i) => (
            <li key={i} className="flex items-center gap-2 text-[12px]">
              <span
                className="w-9 shrink-0 rounded px-1 py-0.5 text-center text-[10px] font-bold text-white"
                style={{ backgroundColor: a.lineColor }}
              >
                {a.line.replace("호선", "")}호선
              </span>
              <span className="min-w-0 flex-1 truncate">{a.dest}</span>
              {a.last && <span className="shrink-0 text-[10px] text-amber-400">막차</span>}
              <span className="shrink-0 font-mono text-[11px] tabular-nums text-[var(--cp-text-muted)]">
                {a.sec > 0 ? `${Math.floor(a.sec / 60)}분 ${a.sec % 60}초` : a.msg}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

// ── 응급실 + 약국 ───────────────────────────────────────────────────────
export function CareCard({ care }: { care: CareBundle | null }) {
  const [tab, setTab] = useState<"er" | "pharm">("er")
  const er = care?.er
  const pharmacies = care?.pharmacies
  const openCount = (pharmacies ?? []).filter((p) => p.openNow).length
  return (
    <Card title="응급·약국" badge="응급실 실시간 병상">
      <div className="mb-2 flex gap-1">
        <TabBtn active={tab === "er"} onClick={() => setTab("er")}>
          응급실
        </TabBtn>
        <TabBtn active={tab === "pharm"} onClick={() => setTab("pharm")}>
          약국 {openCount > 0 && <b className="text-emerald-400">{openCount} 영업중</b>}
        </TabBtn>
      </div>
      {tab === "er" ? (
        er === null || er === undefined ? (
          care === null ? <Empty text="불러오는 중…" /> : <NeedKeyNote guide={KEY_GUIDES.egen} />
        ) : er.length === 0 ? (
          <Empty text="응답 없음 — 활용신청 승인 대기 중일 수 있어요" />
        ) : (
          <ul className="space-y-1.5">
            {er.map((h) => (
              <li key={h.name} className="text-[12px]">
                <div className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate font-medium text-[var(--cp-text-strong)]">{h.name}</span>
                  <a href={`tel:${h.tel}`} className="shrink-0 text-[11px] text-sky-400">
                    {h.tel}
                  </a>
                </div>
                <div className="mt-0.5 flex gap-2 text-[11px] text-[var(--cp-text-muted)]">
                  <BedStat label="응급" v={h.beds} />
                  <BedStat label="수술" v={h.surgery} />
                  <BedStat label="중환자" v={h.icu} />
                  <BedStat label="입원" v={h.ward} />
                  {h.pediatric && <span className="text-emerald-400">소아 가능</span>}
                </div>
              </li>
            ))}
          </ul>
        )
      ) : pharmacies === null || pharmacies === undefined ? (
        care === null ? <Empty text="불러오는 중…" /> : <NeedKeyNote guide={KEY_GUIDES.pharmacy} />
      ) : (
        <>
          <ul className="space-y-1">
            {(pharmacies ?? []).slice(0, 6).map((p) => (
              <li key={p.name + p.addr} className="flex items-center gap-2 text-[12px]">
                <span
                  className={`h-1.5 w-1.5 shrink-0 rounded-full ${p.openNow ? "bg-emerald-400" : "bg-[var(--cp-text-faint)]"}`}
                />
                <span className="min-w-0 flex-1 truncate">{p.name}</span>
                <span className="shrink-0 font-mono text-[10px] tabular-nums text-[var(--cp-text-dim)]">{p.hours}</span>
                <a href={`tel:${p.tel}`} className="shrink-0 text-[11px] text-sky-400">
                  전화
                </a>
              </li>
            ))}
          </ul>
          <p className="mt-1.5 text-[10px] text-[var(--cp-text-faint)]">신고 기반 운영시간 — 방문 전 전화 확인 권장</p>
        </>
      )}
    </Card>
  )
}

function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-2.5 py-1 text-[11px] transition-colors ${
        active
          ? "border-[var(--cp-border-active)] bg-[var(--cp-panel2)] text-[var(--cp-text-strong)]"
          : "border-[var(--cp-border)] text-[var(--cp-text-muted)] hover:bg-[var(--cp-hover)]"
      }`}
    >
      {children}
    </button>
  )
}

function BedStat({ label, v }: { label: string; v: number | null }) {
  if (v === null) return null
  return (
    <span>
      {label}{" "}
      <b className={v <= 0 ? "text-red-400" : v <= 3 ? "text-amber-400" : "text-emerald-400"}>
        {v <= 0 ? "포화" : v}
      </b>
    </span>
  )
}

// ── 명소 혼잡도 ─────────────────────────────────────────────────────────
export function SpotsCard({ spots, light }: { spots: CrowdSpot[]; light: boolean }) {
  return (
    <Card title="지금 혼잡도" badge="서울 실시간 도시데이터 · 5분">
      {spots.length === 0 ? (
        <Empty text="불러오는 중…" />
      ) : (
        <ul className="space-y-1">
          {spots.map((s) => (
            <li key={s.name}>
              <Link
                href={`/crowd?city=seoul&spot=${encodeURIComponent(s.name)}`}
                className="flex items-center gap-2 rounded-lg px-1.5 py-1 text-[12px] transition-colors hover:bg-[var(--cp-hover)]"
              >
                <span
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ backgroundColor: LEVEL_COLORS[s.level] ?? "#999" }}
                />
                <span className="min-w-0 flex-1 truncate">{s.name}</span>
                <span className="shrink-0 text-[11px] text-[var(--cp-text-dim)]">{s.category}</span>
                <b className="shrink-0 text-[11px]" style={{ color: textColor(LEVEL_COLORS[s.level] ?? "#999", light) }}>
                  {s.level}
                </b>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

// ── 강우 + 하천 수위 ────────────────────────────────────────────────────
export function RainCard({ rain, river, loaded }: { rain: RainInfo | null; river: RiverInfo | null; loaded: boolean }) {
  if (loaded && rain === null && river === null) {
    return (
      <Card title="비·하천">
        <NeedKeyNote guide={KEY_GUIDES.seoul} />
      </Card>
    )
  }
  const ratio = river ? Math.min(Math.max(river.ratio, 0), 1) : 0
  const riverColor = ratio >= 0.9 ? "#ff3939" : ratio >= 0.7 ? "#ff8040" : ratio >= 0.5 ? "#ffb100" : "#00d369"
  return (
    <Card title="비·하천" badge={rain?.station ? `${rain.station} 관측소 · 10분` : undefined}>
      {!loaded ? (
        <Empty text="불러오는 중…" />
      ) : (
        <div className="space-y-2.5 text-[12px]">
          <div className="flex items-center gap-3">
            <span className="text-[var(--cp-text-muted)]">강우</span>
            <span>
              10분 <b className="font-mono tabular-nums">{rain?.mm10.toFixed(1) ?? "0.0"}</b>mm
            </span>
            <span>
              1시간 <b className="font-mono tabular-nums">{rain?.mm60.toFixed(1) ?? "0.0"}</b>mm
            </span>
            {(rain?.mm60 ?? 0) === 0 && <span className="text-[var(--cp-text-dim)]">비 안 옴</span>}
          </div>
          {river && (
            <div>
              <div className="mb-1 flex items-baseline justify-between">
                <span className="text-[var(--cp-text-muted)]">
                  {river.river} {river.point} 수위 <span className="text-[10px]">(광진 최근접 지점)</span>
                </span>
                <span className="font-mono text-[11px] tabular-nums">
                  {river.level.toFixed(2)} / 홍수위 {river.planFlood.toFixed(2)}m
                </span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-[var(--cp-track)]">
                <div
                  className="h-full rounded-full transition-all"
                  style={{ width: `${Math.max(ratio * 100, 2)}%`, backgroundColor: riverColor }}
                />
              </div>
            </div>
          )}
        </div>
      )}
    </Card>
  )
}
