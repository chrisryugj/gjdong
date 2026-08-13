"use client"

// 생활 축 카드 — 행사·생활인구·주차·상권 (따릉이·EV·쉼터는 지도 레이어로 이동, 2026-08-10)
// null = 키 미설정(NeedKeyNote), 빈 배열 = 원천 응답 없음/해당 없음

import { useEffect, useState } from "react"
import { CalendarDays, CreditCard, ExternalLink, SquareParking, Ticket, Users } from "lucide-react"
import { DONG_CODES, KEY_GUIDES } from "@/lib/gwangjin/constants"
import type { CmrclInfo, ParkingLot } from "@/lib/gwangjin/env-safety"
import type { DongPattern, GjEvent } from "@/lib/gwangjin/life"
import type { ReserveItem } from "@/lib/gwangjin/reserve"
import { Card, Empty, NeedKeyNote, Skeleton, TabBtn, type Collapse } from "@/components/gwangjin/cards-live"

// ── 문화행사 ────────────────────────────────────────────────────────────
/** "[광진문화재단] 제목" → 주최는 칩으로 분리 — 대괄호 프리픽스가 제목 스캔을 막는다 */
function splitHost(title: string): { host: string; name: string } {
  const m = title.match(/^\[([^\]]+)\]\s*(.+)$/)
  return m ? { host: m[1], name: m[2] } : { host: "", name: title }
}

/** "2026-08-01~2026-11-01" → "8.1~11.1" (올해 아니면 26.8.1 꼴) — 좁은 행에서 기간이 한눈에 */
function shortRange(range: string): string {
  const year = new Date().getFullYear()
  const one = (iso: string) => {
    const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/)
    if (!m) return iso
    const [, y, mo, d] = m
    return `${Number(y) === year ? "" : `${y.slice(2)}.`}${Number(mo)}.${Number(d)}`
  }
  return range.split("~").map(one).join("~")
}

export function EventsCard({ events, loaded, collapsed, onToggle }: { events: GjEvent[] | null; loaded: boolean } & Collapse) {
  const summary = !loaded
    ? undefined
    : events === null
      ? "키 설정 필요"
      : events.length === 0
        ? "오늘 없음"
        : `진행 중 ${events.length}건`
  return (
    <Card
      id="gj-events"
      icon={<CalendarDays className="h-3.5 w-3.5" />}
      title="진행 중 행사"
      badge="광진 명소 주변 · 오늘"
      summary={summary}
      collapsed={collapsed}
      onToggle={onToggle}
    >
      {!loaded ? (
        <Skeleton rows={3} />
      ) : events === null ? (
        <NeedKeyNote guide={KEY_GUIDES.seoul} />
      ) : events.length === 0 ? (
        <Empty text="오늘 진행 중인 행사가 없어요" />
      ) : (
        <ul className="space-y-1.5">
          {events.slice(0, 5).map((e) => {
            const { host, name } = splitHost(e.title)
            const title = (
              <>
                {host && (
                  <span className="mr-1 inline-block max-w-[45%] shrink-0 truncate rounded border border-[var(--cp-border)] px-1 align-[1px] text-[9px] leading-4 text-[var(--cp-text-dim)]">
                    {host}
                  </span>
                )}
                {name}
              </>
            )
            return (
              <li key={e.title} className="text-[12px]">
                {e.link ? (
                  <a href={e.link} target="_blank" rel="noreferrer" className="group flex items-start gap-1">
                    <span className="min-w-0 flex-1 group-hover:underline">{title}</span>
                    <ExternalLink className="mt-0.5 h-3 w-3 shrink-0 text-[var(--cp-text-dim)]" />
                  </a>
                ) : (
                  <span>{title}</span>
                )}
                <div className="text-[10px] text-[var(--cp-text-dim)]">
                  {e.place}
                  {e.fee && <span className="gj-ok"> · {e.fee}</span>}
                  {e.date && <span> · {shortRange(e.date)}</span>}
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </Card>
  )
}

// ── 동별 생활인구 패턴 ───────────────────────────────────────────────────
export function PopCard({ collapsed, onToggle }: Collapse = {}) {
  const [dong, setDong] = useState(DONG_CODES[0].code)
  const [pattern, setPattern] = useState<DongPattern | null>(null)
  const [needsKey, setNeedsKey] = useState(false)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    // 접힌 동안엔 조회하지 않는다 — 펼치는 순간 로드 (일배치 데이터라 서버 캐시가 받는다)
    if (collapsed) return
    let alive = true
    setLoading(true)
    fetch(`/api/gwangjin/pop?dong=${dong}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => {
        if (!alive) return
        if (json?.needKey) setNeedsKey(true)
        else setPattern(json)
        setLoading(false)
      })
      .catch(() => alive && setLoading(false))
    return () => {
      alive = false
    }
  }, [dong, collapsed])

  const max = Math.max(...(pattern?.hours ?? [1]), 1)
  const date = pattern?.date ? `${pattern.date.slice(4, 6)}/${pattern.date.slice(6, 8)} 기준` : ""
  const nowHour = new Date().getHours()
  const dongName = DONG_CODES.find((d) => d.code === dong)?.name ?? ""
  const peak = pattern && pattern.hours.length > 0 ? pattern.hours.indexOf(max) : null

  return (
    <Card
      id="gj-pop"
      icon={<Users className="h-3.5 w-3.5" />}
      title="우리 동네 시간대 패턴"
      badge={`생활인구 · 일배치${date ? ` · ${date}` : ""}`}
      summary={peak !== null ? `${dongName} 피크 ${peak}시` : `${dongName} 24시간 리듬`}
      collapsed={collapsed}
      onToggle={onToggle}
    >
      <select
        value={dong}
        onChange={(e) => setDong(e.target.value)}
        className="gj-focus mb-2 w-full rounded-lg border border-[var(--cp-border)] bg-[var(--cp-bg)] px-2 py-1.5 text-[12px] text-[var(--cp-text)]"
      >
        {DONG_CODES.map((d) => (
          <option key={d.code} value={d.code}>
            {d.name}
          </option>
        ))}
      </select>
      {needsKey ? (
        <NeedKeyNote guide={KEY_GUIDES.seoul} />
      ) : loading || !pattern ? (
        <Skeleton rows={3} />
      ) : pattern.hours.length === 0 ? (
        <Empty text="최근 적재분을 찾지 못했어요" />
      ) : (
        <>
          <div className="flex h-16 items-end gap-[2px]">
            {pattern.hours.map((v, h) => (
              <div
                key={h}
                title={`${h}시 ${Math.round(v).toLocaleString()}명${h === nowHour ? " (지금)" : ""}`}
                className={`flex-1 rounded-t-sm ${h === nowHour ? "bg-sky-400" : "bg-sky-500/45"}`}
                style={{ height: `${Math.max((v / max) * 100, 3)}%` }}
              />
            ))}
          </div>
          <div className="mt-0.5 flex justify-between font-mono text-[9px] tabular-nums text-[var(--cp-text-faint)]">
            <span>0시</span>
            <span>6시</span>
            <span>12시</span>
            <span>18시</span>
            <span>23시</span>
          </div>
          <p className="mt-1 text-[10px] text-[var(--cp-text-faint)]">
            피크 {pattern.hours.indexOf(max)}시 · 약 {Math.round(max / 1000).toLocaleString()}천 명 ·{" "}
            <span className="text-sky-400">■</span> 지금 {nowHour}시
          </p>
        </>
      )}
    </Card>
  )
}

// ── 공영주차 ────────────────────────────────────────────────────────────
// 실시간 연계(서울시 API)는 광진 시영 1곳뿐 — 구영 전체 위치·요금은 표준데이터 레이어가 담당
export function ParkingCard({
  parking,
  loaded,
  stdCount,
  collapsed,
  onToggle,
}: {
  parking: ParkingLot[] | null
  loaded: boolean
  /** 표준데이터 공영주차장 수 — null=활용신청 전(안내 노출) */
  stdCount: number | null
} & Collapse) {
  const availSum = (parking ?? []).reduce((a, p) => a + p.available, 0)
  const summary = !loaded
    ? undefined
    : [
        parking === null ? "키 설정 필요" : parking.length === 0 ? "실시간 없음" : `실시간 ${availSum}면 여유`,
        stdCount ? `구영 ${stdCount}곳 지도에` : null,
      ]
        .filter(Boolean)
        .join(" · ")
  return (
    <Card
      id="gj-parking"
      icon={<SquareParking className="h-3.5 w-3.5" />}
      title="공영주차"
      badge="실시간 연계분"
      summary={summary}
      collapsed={collapsed}
      onToggle={onToggle}
    >
      {!loaded ? (
        <Skeleton rows={2} />
      ) : parking === null ? (
        <NeedKeyNote guide={KEY_GUIDES.seoul} />
      ) : parking.length === 0 ? (
        <Empty text="실시간 연계 주차장 없음" />
      ) : (
        <ul className="space-y-1.5">
          {parking.map((p) => (
            <li key={p.name} className="text-[12px]">
              <div className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate">{p.name}</span>
                <span className="shrink-0 font-mono text-[11px] tabular-nums">
                  <b className={p.available === 0 ? "gj-bad" : "gj-ok"}>{p.available}</b> / {p.total}면
                </span>
              </div>
              <div className="text-[10px] text-[var(--cp-text-dim)]">{p.addr}</div>
            </li>
          ))}
        </ul>
      )}
      {loaded && stdCount === null ? (
        <div className="mt-2">
          <NeedKeyNote guide={KEY_GUIDES.parkingStd} />
        </div>
      ) : (
        <p className="mt-1.5 text-[10px] text-[var(--cp-text-faint)]">
          {stdCount
            ? `실시간은 시영 1곳뿐 — 구영 포함 ${stdCount}곳 위치·요금은 지도 '주차장' 레이어에서`
            : "서울시 실시간 연계는 광진구 내 시영 1곳뿐 — 구영 주차장은 미연계"}
        </p>
      )}
    </Card>
  )
}

// ── 공공시설 예약 ───────────────────────────────────────────────────────
// 서울시 공공서비스예약 중 광진 접수중분 — 뚝섬 코트·아차산 숲 프로그램·어대공 동물학교 등
const RESERVE_KINDS = ["전체", "체육", "문화", "교육"] as const

/** "2026-08-18" → D-7 (7일 이내만 임박 표시, 지났거나 멀면 ~MM/DD) */
function dday(rcptEnd: string): { text: string; soon: boolean } {
  if (!rcptEnd) return { text: "", soon: false }
  const end = new Date(`${rcptEnd}T23:59:59+09:00`).getTime()
  const days = Math.ceil((end - Date.now()) / 86_400_000)
  if (days >= 0 && days <= 7) return { text: days === 0 ? "오늘 마감" : `D-${days}`, soon: true }
  return { text: `~${rcptEnd.slice(5).replace("-", "/")}`, soon: false }
}

export function ReserveCard({ items, loaded, collapsed, onToggle }: { items: ReserveItem[] | null; loaded: boolean } & Collapse) {
  const [kind, setKind] = useState<(typeof RESERVE_KINDS)[number]>("전체")
  const [showAll, setShowAll] = useState(false)
  const filtered = (items ?? []).filter((r) => kind === "전체" || r.kind === kind)
  const visible = showAll ? filtered : filtered.slice(0, 5)
  // 접힘 요약 — 마감임박(D-7 이내)이 있으면 그게 펼칠 이유
  const soonCount = (items ?? []).filter((r) => dday(r.rcptEnd).soon).length
  const summary = !loaded
    ? undefined
    : items === null
      ? "키 설정 필요"
      : items.length === 0
        ? "접수중 없음"
        : `접수중 ${items.length}건${soonCount ? ` · 임박 ${soonCount}` : ""}`
  return (
    <Card
      id="gj-reserve"
      icon={<Ticket className="h-3.5 w-3.5" />}
      title="공공시설 예약"
      badge={items?.length ? `접수중 ${items.length}건 · 서울시 통합예약` : "서울시 통합예약"}
      summary={summary}
      collapsed={collapsed}
      onToggle={onToggle}
    >
      {!loaded ? (
        <Skeleton rows={3} />
      ) : items === null ? (
        <NeedKeyNote guide={KEY_GUIDES.seoul} />
      ) : items.length === 0 ? (
        <Empty text="지금 접수중인 광진 시설이 없어요" />
      ) : (
        <>
          <div className="mb-2 flex gap-1">
            {RESERVE_KINDS.map((k) => {
              const n = k === "전체" ? items.length : items.filter((r) => r.kind === k).length
              if (k !== "전체" && n === 0) return null
              return (
                <TabBtn key={k} active={kind === k} onClick={() => setKind(k)}>
                  {k} <span className="font-mono text-[10px] tabular-nums opacity-70">{n}</span>
                </TabBtn>
              )
            })}
          </div>
          <ul className={`space-y-1.5 ${showAll ? "max-h-64 overflow-y-auto pr-1" : ""}`}>
            {visible.map((r) => {
              const d = dday(r.rcptEnd)
              return (
                <li key={r.kind + r.name} className="text-[12px]">
                  <a
                    href={r.url || undefined}
                    target="_blank"
                    rel="noreferrer"
                    className="group flex items-center gap-1.5"
                  >
                    <span className="shrink-0 rounded border border-[var(--cp-border)] px-1 text-[9px] leading-4 text-[var(--cp-text-dim)]">
                      {r.cls || r.kind}
                    </span>
                    <span className="min-w-0 flex-1 truncate group-hover:underline">{r.name}</span>
                    {d.text && (
                      <span className={`shrink-0 font-mono text-[10px] tabular-nums ${d.soon ? "gj-warn font-medium" : "text-[var(--cp-text-dim)]"}`}>
                        {d.text}
                      </span>
                    )}
                    <ExternalLink className="h-3 w-3 shrink-0 text-[var(--cp-text-dim)]" />
                  </a>
                  <div className="truncate text-[10px] text-[var(--cp-text-dim)]">
                    {r.place}
                    {r.payAt && <span className={r.payAt === "무료" ? "gj-ok" : ""}> · {r.payAt}</span>}
                  </div>
                </li>
              )
            })}
          </ul>
          {filtered.length > 5 && (
            <button
              type="button"
              onClick={() => setShowAll((v) => !v)}
              className="gj-press gj-focus mt-1.5 min-h-8 w-full rounded-lg border border-[var(--cp-border)] py-1 text-[11px] text-[var(--cp-text-muted)] hover:bg-[var(--cp-hover)]"
            >
              {showAll ? "접기" : `전체 ${filtered.length}건 보기`}
            </button>
          )}
        </>
      )}
    </Card>
  )
}

// ── 역세권 상권 ─────────────────────────────────────────────────────────
// cmrcl 지원 지점은 건대입구역·군자역 2곳 (공원·산은 원천 미지원 — constants.CMRCL_AREAS 실측 주석)
export function CmrclCard({ cmrcl, loaded, collapsed, onToggle }: { cmrcl: CmrclInfo[] | null; loaded: boolean } & Collapse) {
  const [areaIdx, setAreaIdx] = useState(0)
  const cur = cmrcl?.[Math.min(areaIdx, (cmrcl?.length ?? 1) - 1)]
  const summary = !loaded
    ? undefined
    : cmrcl === null
      ? "키 설정 필요"
      : cur
        ? `${cur.area} ${cur.level} · ${cur.payments.toLocaleString()}건`
        : "응답 없음"
  return (
    <Card
      id="gj-cmrcl"
      icon={<CreditCard className="h-3.5 w-3.5" />}
      title="역세권 상권 소비"
      badge="신한카드 · 최근 30분"
      summary={summary}
      collapsed={collapsed}
      onToggle={onToggle}
    >
      {!loaded ? (
        <Skeleton rows={2} />
      ) : cmrcl === null ? (
        <NeedKeyNote guide={KEY_GUIDES.seoul} />
      ) : cmrcl.length === 0 || !cur ? (
        <Empty text="상권 응답 없음" />
      ) : (
        <>
          {cmrcl.length > 1 && (
            <div className="mb-2 flex gap-1">
              {cmrcl.map((c, i) => (
                <TabBtn key={c.area} active={i === Math.min(areaIdx, cmrcl.length - 1)} onClick={() => setAreaIdx(i)}>
                  {c.area}
                </TabBtn>
              ))}
            </div>
          )}
          <p className="text-[12px]">
            지금 {cur.area} 상권은 <b className="text-[var(--cp-text-strong)]">{cur.level}</b> — 30분 결제{" "}
            <b className="font-mono tabular-nums">{cur.payments.toLocaleString()}</b>건
          </p>
          {cur.categories.length > 0 && (
            <ul className="mt-1.5 flex flex-wrap gap-1">
              {cur.categories.slice(0, 6).map((c) => (
                <li
                  key={c.name}
                  className="rounded-full border border-[var(--cp-border)] px-2 py-0.5 text-[10px] text-[var(--cp-text-muted)]"
                >
                  {c.name} <b>{c.level}</b>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </Card>
  )
}

