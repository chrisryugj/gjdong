"use client"

// 실시간 축 카드 — 지하철·의료·혼잡도·강우/수위 + 공용 Card/NeedKey
// 데이터가 null이면 해당 원천의 키 미설정 — 발급 주소 카드로 강등 (KEY_GUIDES)

import { useEffect, useState } from "react"
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
  id,
  children,
}: {
  icon?: React.ReactNode
  title: string
  badge?: string
  /** 섹션 네비·NowStrip 점프용 앵커 — 스크롤 컨테이너 상단 여백 포함 */
  id?: string
  children: React.ReactNode
}) {
  return (
    <section
      id={id}
      className="scroll-mt-12 rounded-2xl border border-[var(--cp-border-faint)] bg-[var(--cp-panel)] p-3 [box-shadow:var(--cp-card-shadow)]"
    >
      <h2 className="mb-2 flex items-center gap-1.5 text-[13px] font-bold text-[var(--cp-text-strong)]">
        {icon && <span className="flex h-4 w-4 items-center justify-center text-[var(--cp-text-muted)]">{icon}</span>}
        {title}
        {badge && (
          <span className="ml-auto shrink-0 pl-2 text-[10px] font-normal text-[var(--cp-text-dim)]">{badge}</span>
        )}
      </h2>
      {children}
    </section>
  )
}

/** 스켈레톤 로더 — 로딩 텍스트 대신 콘텐츠 모양의 자리를 잡아 레이아웃 점프를 줄인다 */
export function Skeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-2 py-0.5" aria-hidden>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="gj-skel h-3.5" style={{ width: `${100 - (i % 3) * 22}%` }} />
      ))}
    </div>
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
  fetchedAt,
  needsKey,
  onStation,
}: {
  station: string
  board: SubwayBoard | null
  /** 전광판 수신 시각(ms) — 30초 폴링 사이를 1초 카운트다운으로 메운다 */
  fetchedAt: number | null
  needsKey: boolean
  onStation: (s: string) => void
}) {
  // 실제 전광판처럼 초가 흘러야 "실시간" — 도착 목록이 있을 때만 1초 틱
  const [now, setNow] = useState(() => Date.now())
  const hasArrivals = (board?.arrivals.length ?? 0) > 0
  useEffect(() => {
    if (!hasArrivals) return
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [hasArrivals, fetchedAt])
  const elapsed = fetchedAt ? Math.max(Math.floor((now - fetchedAt) / 1000), 0) : 0

  return (
    <Card id="gj-subway" icon={<TrainFront className="h-3.5 w-3.5" />} title="지하철 도착" badge="실시간">
      <div className="scrollbar-thin mb-2 flex gap-1 overflow-x-auto pb-1">
        {STATIONS.map((s) => (
          <button
            key={s.base}
            type="button"
            onClick={() => onStation(s.base)}
            aria-pressed={station === s.base}
            className={`gj-press gj-focus flex min-h-7 shrink-0 items-center gap-1 whitespace-nowrap rounded-full border px-2.5 py-1 text-[11px] ${
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
        <Skeleton rows={4} />
      ) : board.arrivals.length === 0 ? (
        <Empty text="도착 예정 열차가 없습니다" />
      ) : (
        <ul className="space-y-1.5">
          {board.arrivals.slice(0, 6).map((a, i) => {
            // "장암행 - 어린이대공원(세종대)방면" → 방면이 승강장 선택 기준이라 주인공, 행선은 보조
            const [terminus, direction] = a.dest.split(" - ")
            // 수신 후 흐른 시간을 빼서 표시 — 0이 되면 "곧 도착" (다음 폴링이 실제 상태로 보정)
            const remain = a.sec > 0 ? Math.max(a.sec - elapsed, 0) : 0
            const arriving = a.sec === 0 || remain === 0
            const soon = !arriving && remain <= 180
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
                    arriving ? "gj-ok gj-pulse font-bold" : soon ? "gj-warn font-medium" : "text-[var(--cp-text-muted)]"
                  }`}
                >
                  {a.sec > 0 ? (remain > 0 ? `${Math.floor(remain / 60)}분 ${remain % 60}초` : "곧 도착") : a.msg}
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
export type CareTab = "er" | "pharm"

// 탭은 보드가 소유(컨트롤드) — NowStrip 타일 탭(약국→pharm)과 심야 기본 탭이 같은 상태를 쓴다
export function CareCard({ care, tab, onTab }: { care: CareBundle | null; tab: CareTab; onTab: (t: CareTab) => void }) {
  const [showAllPharm, setShowAllPharm] = useState(false)
  const [pharmQuery, setPharmQuery] = useState("")
  const er = care?.er
  const pharmacies = care?.pharmacies
  const openCount = (pharmacies ?? []).filter((p) => p.openNow).length
  return (
    <Card id="gj-care" icon={<Cross className="h-3.5 w-3.5" />} title="응급·약국" badge="응급실 실시간 병상">
      <div className="mb-2 flex gap-1">
        <TabBtn active={tab === "er"} onClick={() => onTab("er")}>
          응급실
        </TabBtn>
        <TabBtn active={tab === "pharm"} onClick={() => onTab("pharm")}>
          약국 {openCount > 0 && <b className="gj-ok">{openCount} 영업중</b>}
        </TabBtn>
      </div>
      {tab === "er" ? (
        er === null || er === undefined ? (
          care === null ? <Skeleton rows={4} /> : <NeedKeyNote guide={KEY_GUIDES.egen} />
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
        care === null ? <Skeleton rows={4} /> : <NeedKeyNote guide={KEY_GUIDES.pharmacy} />
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
        className="gj-press gj-focus mt-1.5 min-h-8 w-full rounded-lg border border-[var(--cp-border)] py-1 text-[11px] text-[var(--cp-text-muted)] hover:bg-[var(--cp-hover)]"
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
      aria-pressed={active}
      className={`gj-press gj-focus min-h-7 rounded-full border px-2.5 py-1 text-[11px] ${
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
      <Card id="gj-rain" icon={<CloudRain className="h-3.5 w-3.5" />} title="비·하천">
        <NeedKeyNote guide={KEY_GUIDES.seoul} />
      </Card>
    )
  }
  const ratio = river ? Math.min(Math.max(river.ratio, 0), 1) : 0
  const riverColor = ratio >= 0.9 ? "#ff3939" : ratio >= 0.7 ? "#ff8040" : ratio >= 0.5 ? "#ffb100" : "#00d369"
  return (
    <Card
      id="gj-rain"
      icon={<CloudRain className="h-3.5 w-3.5" />}
      title="비·하천"
      badge={rain?.station ? `${rain.station} 관측소 · 10분` : undefined}
    >
      {!loaded ? (
        <Skeleton rows={2} />
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
