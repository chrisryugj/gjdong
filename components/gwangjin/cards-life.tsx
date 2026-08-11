"use client"

// 생활 축 카드 — 행사·생활인구·주차·상권 (따릉이·EV·쉼터는 지도 레이어로 이동, 2026-08-10)
// null = 키 미설정(NeedKeyNote), 빈 배열 = 원천 응답 없음/해당 없음

import { useEffect, useState } from "react"
import { CalendarDays, CreditCard, ExternalLink, SquareParking, Ticket, Users } from "lucide-react"
import { DONG_CODES, KEY_GUIDES } from "@/lib/gwangjin/constants"
import type { CmrclInfo, ParkingLot } from "@/lib/gwangjin/env-safety"
import type { DongPattern, GjEvent } from "@/lib/gwangjin/life"
import type { ReserveItem } from "@/lib/gwangjin/reserve"
import { Card, Empty, NeedKeyNote, TabBtn } from "@/components/gwangjin/cards-live"

// ── 문화행사 ────────────────────────────────────────────────────────────
export function EventsCard({ events, loaded }: { events: GjEvent[] | null; loaded: boolean }) {
  return (
    <Card icon={<CalendarDays className="h-3.5 w-3.5" />} title="진행 중 행사" badge="광진 명소 주변 · 오늘">
      {!loaded ? (
        <Empty text="불러오는 중…" />
      ) : events === null ? (
        <NeedKeyNote guide={KEY_GUIDES.seoul} />
      ) : events.length === 0 ? (
        <Empty text="오늘 진행 중인 행사가 없어요" />
      ) : (
        <ul className="space-y-1.5">
          {events.slice(0, 5).map((e) => (
            <li key={e.title} className="text-[12px]">
              {e.link ? (
                <a href={e.link} target="_blank" rel="noreferrer" className="group flex items-start gap-1">
                  <span className="min-w-0 flex-1 group-hover:underline">{e.title}</span>
                  <ExternalLink className="mt-0.5 h-3 w-3 shrink-0 text-[var(--cp-text-dim)]" />
                </a>
              ) : (
                <span>{e.title}</span>
              )}
              <div className="text-[10px] text-[var(--cp-text-dim)]">
                {e.place}
                {e.fee && <span className="gj-ok"> · {e.fee}</span>}
                {e.date && <span> · {e.date}</span>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

// ── 동별 생활인구 패턴 ───────────────────────────────────────────────────
export function PopCard() {
  const [dong, setDong] = useState(DONG_CODES[0].code)
  const [pattern, setPattern] = useState<DongPattern | null>(null)
  const [needsKey, setNeedsKey] = useState(false)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
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
  }, [dong])

  const max = Math.max(...(pattern?.hours ?? [1]), 1)
  const date = pattern?.date ? `${pattern.date.slice(4, 6)}/${pattern.date.slice(6, 8)} 기준` : ""

  return (
    <Card icon={<Users className="h-3.5 w-3.5" />} title="우리 동네 시간대 패턴" badge={`생활인구 · 일배치${date ? ` · ${date}` : ""}`}>
      <select
        value={dong}
        onChange={(e) => setDong(e.target.value)}
        className="mb-2 w-full rounded-lg border border-[var(--cp-border)] bg-[var(--cp-bg)] px-2 py-1.5 text-[12px] text-[var(--cp-text)]"
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
        <Empty text="불러오는 중…" />
      ) : pattern.hours.length === 0 ? (
        <Empty text="최근 적재분을 찾지 못했어요" />
      ) : (
        <>
          <div className="flex h-16 items-end gap-[2px]">
            {pattern.hours.map((v, h) => (
              <div
                key={h}
                title={`${h}시 ${Math.round(v).toLocaleString()}명`}
                className="flex-1 rounded-t-sm bg-sky-500/70"
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
            피크 {pattern.hours.indexOf(max)}시 · 약 {Math.round(max / 1000).toLocaleString()}천 명
          </p>
        </>
      )}
    </Card>
  )
}

// ── 공영주차 ────────────────────────────────────────────────────────────
export function ParkingCard({ parking, loaded }: { parking: ParkingLot[] | null; loaded: boolean }) {
  return (
    <Card icon={<SquareParking className="h-3.5 w-3.5" />} title="공영주차" badge="실시간 연계분">
      {!loaded ? (
        <Empty text="불러오는 중…" />
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
      <p className="mt-1.5 text-[10px] text-[var(--cp-text-faint)]">
        서울시 실시간 연계는 광진구 내 시영 1곳뿐 — 구영 주차장은 미연계
      </p>
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

export function ReserveCard({ items, loaded }: { items: ReserveItem[] | null; loaded: boolean }) {
  const [kind, setKind] = useState<(typeof RESERVE_KINDS)[number]>("전체")
  const [showAll, setShowAll] = useState(false)
  const filtered = (items ?? []).filter((r) => kind === "전체" || r.kind === kind)
  const visible = showAll ? filtered : filtered.slice(0, 5)
  return (
    <Card
      icon={<Ticket className="h-3.5 w-3.5" />}
      title="공공시설 예약"
      badge={items?.length ? `접수중 ${items.length}건 · 서울시 통합예약` : "서울시 통합예약"}
    >
      {!loaded ? (
        <Empty text="불러오는 중…" />
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
              className="mt-1.5 w-full rounded-lg border border-[var(--cp-border)] py-1 text-[11px] text-[var(--cp-text-muted)] transition-colors hover:bg-[var(--cp-hover)]"
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
export function CmrclCard({ cmrcl, loaded }: { cmrcl: CmrclInfo[] | null; loaded: boolean }) {
  const [areaIdx, setAreaIdx] = useState(0)
  const cur = cmrcl?.[Math.min(areaIdx, (cmrcl?.length ?? 1) - 1)]
  return (
    <Card icon={<CreditCard className="h-3.5 w-3.5" />} title="역세권 상권 소비" badge="신한카드 · 최근 30분">
      {!loaded ? (
        <Empty text="불러오는 중…" />
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

