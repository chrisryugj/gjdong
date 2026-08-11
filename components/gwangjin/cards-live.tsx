"use client"

// 실시간 축 카드 — 지하철·의료·혼잡도·강우/수위 + 공용 Card/NeedKey
// 데이터가 null이면 해당 원천의 키 미설정 — 발급 주소 카드로 강등 (KEY_GUIDES)

import { useState } from "react"
import { CloudRain, Cross, ExternalLink, KeyRound, TrainFront } from "lucide-react"
import { KEY_GUIDES, STATIONS, type NeedKey } from "@/lib/gwangjin/constants"
import { LINE_COLOR_BY_NUM } from "@/components/gwangjin/life-icons"
import type { RainInfo, RiverInfo } from "@/lib/gwangjin/env-safety"
import type { SubwayBoard } from "@/lib/gwangjin/subway"
import type { Pharmacy } from "@/lib/gwangjin/emergency"
import type { CareBundle } from "@/components/gwangjin/use-gwangjin-life"

export function Card({
  icon,
  title,
  badge,
  children,
}: {
  icon?: React.ReactNode
  title: string
  badge?: string
  children: React.ReactNode
}) {
  return (
    <section className="rounded-xl border border-[var(--cp-border-faint)] bg-[var(--cp-panel)] p-3">
      <h2 className="mb-2 flex items-center gap-1.5 text-[13px] font-bold text-[var(--cp-text-strong)]">
        {icon && <span className="flex h-4 w-4 items-center justify-center text-[var(--cp-text-muted)]">{icon}</span>}
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
        className="gj-info inline-flex items-center gap-1 hover:underline"
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
    <Card icon={<TrainFront className="h-3.5 w-3.5" />} title="지하철 도착" badge="30초 갱신">
      <div className="scrollbar-thin mb-2 flex gap-1 overflow-x-auto pb-1">
        {STATIONS.map((s) => (
          <button
            key={s.base}
            type="button"
            onClick={() => onStation(s.base)}
            className={`flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full border px-2.5 py-1 text-[11px] transition-colors ${
              station === s.base
                ? "border-[var(--cp-border-active)] bg-[var(--cp-panel2)] font-medium text-[var(--cp-text-strong)]"
                : "border-[var(--cp-border)] text-[var(--cp-text-muted)] hover:bg-[var(--cp-hover)]"
            }`}
          >
            {/* 역 칩에도 노선색 점 — 지도 마커와 같은 시각 언어 */}
            <span className="flex">
              {s.lines.map((l) => (
                <span
                  key={l}
                  className="-ml-0.5 h-2 w-2 rounded-full border border-[var(--cp-bg)] first:ml-0"
                  style={{ background: LINE_COLOR_BY_NUM[l] ?? "#475569" }}
                />
              ))}
            </span>
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
        <ul className="space-y-1.5">
          {board.arrivals.slice(0, 6).map((a, i) => {
            // "장암행 - 어린이대공원(세종대)방면" → 방면이 승강장 선택 기준이라 주인공, 행선은 보조
            const [terminus, direction] = a.dest.split(" - ")
            const soon = a.sec > 0 && a.sec <= 180
            return (
              <li key={i} className="flex items-center gap-2 text-[12px]">
                <span
                  className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-extrabold text-white"
                  style={{ backgroundColor: a.lineColor }}
                >
                  {a.line.replace("호선", "")}
                </span>
                <span className="min-w-0 flex-1 truncate">
                  <span className="text-[var(--cp-text-strong)]">{direction ?? terminus}</span>
                  <span className="ml-1.5 text-[10px] text-[var(--cp-text-dim)]">{direction ? terminus : ""}</span>
                </span>
                {a.last && <span className="gj-warn shrink-0 text-[10px] font-medium">막차</span>}
                <span
                  className={`shrink-0 font-mono text-[11px] tabular-nums ${
                    a.sec === 0 ? "gj-ok font-bold" : soon ? "gj-warn font-medium" : "text-[var(--cp-text-muted)]"
                  }`}
                >
                  {a.sec > 0 ? `${Math.floor(a.sec / 60)}분 ${a.sec % 60}초` : a.msg}
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </Card>
  )
}

// ── 응급실 + 약국 ───────────────────────────────────────────────────────
export function CareCard({ care }: { care: CareBundle | null }) {
  const [tab, setTab] = useState<"er" | "pharm">("er")
  const [showAllPharm, setShowAllPharm] = useState(false)
  const [pharmQuery, setPharmQuery] = useState("")
  const er = care?.er
  const pharmacies = care?.pharmacies
  const openCount = (pharmacies ?? []).filter((p) => p.openNow).length
  return (
    <Card icon={<Cross className="h-3.5 w-3.5" />} title="응급·약국" badge="응급실 실시간 병상">
      <div className="mb-2 flex gap-1">
        <TabBtn active={tab === "er"} onClick={() => setTab("er")}>
          응급실
        </TabBtn>
        <TabBtn active={tab === "pharm"} onClick={() => setTab("pharm")}>
          약국 {openCount > 0 && <b className="gj-ok">{openCount} 영업중</b>}
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
                  <a href={`tel:${h.tel}`} className="gj-info shrink-0 text-[11px]">
                    {h.tel}
                  </a>
                </div>
                <div className="mt-0.5 flex gap-2 text-[11px] text-[var(--cp-text-muted)]">
                  <BedStat label="응급" v={h.beds} />
                  <BedStat label="수술" v={h.surgery} />
                  <BedStat label="중환자" v={h.icu} />
                  <BedStat label="입원" v={h.ward} />
                  {h.pediatric && (
                    <span className="gj-ok rounded-full border border-current px-1.5 text-[10px] leading-4">
                      소아 가능
                    </span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )
      ) : pharmacies === null || pharmacies === undefined ? (
        care === null ? <Empty text="불러오는 중…" /> : <NeedKeyNote guide={KEY_GUIDES.pharmacy} />
      ) : (
        <PharmacyList
          pharmacies={pharmacies}
          showAll={showAllPharm}
          query={pharmQuery}
          onToggleAll={() => setShowAllPharm((v) => !v)}
          onQuery={setPharmQuery}
        />
      )}
    </Card>
  )
}

/** 약국 목록 — 기본 6곳(영업중·심야 우선 정렬순), 전체 보기 = 검색 인풋 + 스크롤 리스트 */
function PharmacyList({
  pharmacies,
  showAll,
  query,
  onToggleAll,
  onQuery,
}: {
  pharmacies: Pharmacy[]
  showAll: boolean
  query: string
  onToggleAll: () => void
  onQuery: (q: string) => void
}) {
  const q = query.trim()
  const filtered = q
    ? pharmacies.filter((p) => p.name.includes(q) || p.addr.includes(q))
    : pharmacies
  const visible = showAll ? filtered : filtered.slice(0, 6)
  return (
    <>
      {showAll && (
        <input
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          placeholder="약국명·주소·동으로 검색 (예: 자양동)"
          className="mb-1.5 w-full rounded-lg border border-[var(--cp-border)] bg-[var(--cp-bg)] px-2.5 py-1.5 text-[12px] text-[var(--cp-text)] placeholder:text-[var(--cp-text-faint)] focus:border-[var(--cp-border-active)] focus:outline-none"
        />
      )}
      <ul className={`space-y-1 ${showAll ? "max-h-64 overflow-y-auto pr-1" : ""}`}>
        {visible.map((p) => (
          <li key={p.name + p.addr} className="flex items-center gap-2 text-[12px]">
            <span
              className={`h-1.5 w-1.5 shrink-0 rounded-full ${p.openNow ? "bg-emerald-500" : "bg-[var(--cp-text-faint)]"}`}
              title={p.openNow ? "영업 중" : "영업 종료"}
            />
            <span className="min-w-0 flex-1">
              <span className="block truncate">
                {p.name}
                {p.lateNight && <span className="gj-info ml-1 text-[10px]">심야</span>}
              </span>
              {showAll && <span className="block truncate text-[10px] text-[var(--cp-text-dim)]">{p.addr}</span>}
            </span>
            <span className="shrink-0 font-mono text-[10px] tabular-nums text-[var(--cp-text-dim)]">{p.hours}</span>
            <a href={`tel:${p.tel}`} className="gj-info shrink-0 text-[11px]">
              전화
            </a>
          </li>
        ))}
        {visible.length === 0 && <Empty text={`"${q}" 검색 결과 없음`} />}
      </ul>
      <button
        type="button"
        onClick={onToggleAll}
        className="mt-1.5 w-full rounded-lg border border-[var(--cp-border)] py-1 text-[11px] text-[var(--cp-text-muted)] transition-colors hover:bg-[var(--cp-hover)]"
      >
        {showAll ? "접기" : `전체 ${pharmacies.length}곳 보기·검색`}
      </button>
      <p className="mt-1.5 text-[10px] text-[var(--cp-text-faint)]">신고 기반 운영시간 — 방문 전 전화 확인 권장</p>
    </>
  )
}

export function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
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
      {label} <b className={v <= 0 ? "gj-bad" : v <= 3 ? "gj-warn" : "gj-ok"}>{v <= 0 ? "포화" : v}</b>
    </span>
  )
}

// ── 강우 + 하천 수위 ────────────────────────────────────────────────────
export function RainCard({ rain, river, loaded }: { rain: RainInfo | null; river: RiverInfo | null; loaded: boolean }) {
  if (loaded && rain === null && river === null) {
    return (
      <Card icon={<CloudRain className="h-3.5 w-3.5" />} title="비·하천">
        <NeedKeyNote guide={KEY_GUIDES.seoul} />
      </Card>
    )
  }
  const ratio = river ? Math.min(Math.max(river.ratio, 0), 1) : 0
  const riverColor = ratio >= 0.9 ? "#ff3939" : ratio >= 0.7 ? "#ff8040" : ratio >= 0.5 ? "#ffb100" : "#00d369"
  return (
    <Card
      icon={<CloudRain className="h-3.5 w-3.5" />}
      title="비·하천"
      badge={rain?.station ? `${rain.station} 관측소 · 10분` : undefined}
    >
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
