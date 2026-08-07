"use client"

import Link from "next/link"
import { LayoutDashboard, Moon, RefreshCw, Sun, TriangleAlert } from "lucide-react"
import { LEVEL_COLORS, type CrowdDisaster } from "@/lib/crowd/seoul-rtd"
import { CITY_IDS, type CityId } from "@/lib/crowd/cities"
import { AutoMarquee, formatClock, LEVEL_ORDER } from "@/components/crowd/shared"
import { LangSwitcher, useLang } from "@/components/crowd/lang-context"
import { trDisaster } from "@/lib/crowd/i18n"

interface CrowdHeaderProps {
  city: CityId
  spotCount: number
  levelCounts: Record<string, number>
  updatedAt: string | null
  light: boolean
  disaster: CrowdDisaster[]
  disasterOpen: boolean
  onCityChange: (city: CityId) => void
  onRefresh: () => void
  onToggleTheme: () => void
  onToggleDisaster: () => void
  /** 상황실 모드 진입 (행사·축제 안전 담당자용 다지점 모니터링) */
  onEnterOps: () => void
}

export default function CrowdHeader({
  city,
  spotCount,
  levelCounts,
  updatedAt,
  light,
  disaster,
  disasterOpen,
  onCityChange,
  onRefresh,
  onToggleTheme,
  onToggleDisaster,
  onEnterOps,
}: CrowdHeaderProps) {
  const { lang, t, level } = useLang()
  // 도시 전환 시 제목도 동기화 — 4개 언어 제목 속 현지화된 "서울"만 해당 도시명으로 치환
  const title = city === "seoul" ? t.title : t.title.replaceAll(t.cityNames.seoul, t.cityNames[city])
  // 도시별 부제 — 원천이 달라 세는 대상도 다르다(인파/접근·주차/출국장 대기).
  // 목록 도착 전에는 도시별 기대 개수를 보여준다.
  const SUBTITLE: Record<string, [(n: number) => string, number]> = {
    jeju: [t.subtitleJeju, 66],
    busan: [t.subtitleBusan, 26],
    gangwon: [t.subtitleGangwon, 18],
    incheon: [t.subtitleIncheon, 8],
    seoul: [t.subtitle, 121],
  }
  const [subtitleFn, fallbackCount] = SUBTITLE[city] ?? SUBTITLE.seoul
  const subtitle = subtitleFn(spotCount > 0 ? spotCount : fallbackCount)
  // 도시 스위처 — 헤더 안(md↑)과 헤더 아래 독립 행(모바일) 두 곳에서 같은 것을 쓴다.
  // 선택 도시는 반전 대비(라이트=먹색 pill·다크=백색 pill)로 한눈에 — 배경색 은은한 구분은
  // 5개 pill 사이에서 잘 안 읽혔다.
  const citySwitcher = (
    <div
      role="group"
      aria-label={t.citySwitchLabel}
      className="flex items-center gap-0.5 rounded-full border border-[var(--cp-border)] bg-[var(--cp-panel)] p-0.5"
    >
      {CITY_IDS.map((id) => (
        <button
          key={id}
          onClick={() => onCityChange(id)}
          aria-pressed={city === id}
          className={`whitespace-nowrap rounded-full px-2.5 py-0.5 text-[12px] font-medium transition-colors md:py-1 ${
            city === id
              ? "bg-[var(--cp-text-strong)] text-[var(--cp-bg)]"
              : "text-[var(--cp-text-dim)] hover:text-[var(--cp-text)]"
          }`}
        >
          {t.cityNames[id]}
        </button>
      ))}
    </div>
  )

  // 라이브 갱신 시각 — md↑는 헤더 우측, 모바일은 도시 행 우측(dateline)에 붙는다
  const liveClock = updatedAt && (
    <span
      className="flex shrink-0 items-center gap-1.5 font-mono text-[12px] tabular-nums text-[var(--cp-text-dim)]"
      title={t.autoRefresh}
    >
      <span className="relative flex h-1.5 w-1.5" aria-hidden>
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-sky-400 opacity-50" />
        <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-sky-500" />
      </span>
      {t.updatedAt(formatClock(updatedAt))}
      <span className="hidden text-[var(--cp-text-faint)] xl:inline">· {t.autoRefresh}</span>
    </span>
  )

  return (
    <>
      {/* ── 헤더 */}
      <header className="flex min-h-0 shrink-0 items-center justify-between gap-3 border-b border-[var(--cp-border)] px-4 py-1.5 md:min-h-14 md:py-0 md:px-5">
        {/* 제목은 min-w-0+truncate — 긴 외국어 제목이 우측 컨트롤과 겹치지 않게 말줄임.
            모바일 우측은 아이콘만(시각은 도시 행으로) — 제목이 한 줄을 온전히 가져간다 */}
        <div className="flex min-w-0 items-center gap-x-3">
          {/* md↑에선 제목은 성역 — 짤림은 부제(subtitle)가 대신 진다 */}
          <h1
            className={`min-w-0 truncate md:shrink-0 text-[var(--cp-text-strong)] ${
              lang === "ko"
                ? "text-xl md:text-2xl [font-family:Joseon100Years,serif]"
                : "text-lg font-semibold tracking-tight sm:text-xl md:text-2xl"
            }`}
          >
            {title}
          </h1>
          {/* 도시 스위처 (선택 도시는 URL ?city=로 공유 가능) — 모바일은 헤더 아래 독립 행으로.
              긴 언어(영어 Incheon Airport)가 md 폭에서 우측 시계를 침범하지 않게 내부 스크롤로 양보 */}
          <div className="hidden min-w-0 overflow-x-auto md:block [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <div className="w-max">{citySwitcher}</div>
          </div>
          <p className="hidden min-w-0 truncate text-[12px] text-[var(--cp-text-dim)] xl:block">{subtitle}</p>
        </div>

        <div className="flex shrink-0 items-center gap-3 md:gap-4">
          {/* 등급 분포 — xl부터만 (md~lg 폭에서 제목을 짜부라뜨리던 주범.
              그 폭에선 목록 패널의 등급 필터 칩이 같은 숫자를 보여준다) */}
          <div className="hidden items-center gap-3 xl:flex">
            {LEVEL_ORDER.map((lv) => (
              <div key={lv} className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full" style={{ background: LEVEL_COLORS[lv] }} />
                <span className="text-[12px] text-[var(--cp-text-muted)]">{level(lv)}</span>
                <span className="font-mono text-[13px] tabular-nums text-[var(--cp-text)]">
                  {levelCounts[lv] ?? 0}
                </span>
              </div>
            ))}
          </div>

          <div className="flex items-center gap-1.5 border-l border-[var(--cp-border)] pl-3 md:pl-4">
            {/* 갱신 시각 — md↑만 여기, 모바일은 도시 행 우측 (좁은 폭에서 제목과 폭 다툼 금지) */}
            <div className="hidden md:contents">{liveClock}</div>
            <button
              onClick={onEnterOps}
              className="rounded p-1.5 text-[var(--cp-text-muted)] transition-colors hover:bg-[var(--cp-hover)] hover:text-[var(--cp-text-strong)]"
              title={t.opsMode}
              aria-label={t.opsMode}
            >
              <LayoutDashboard className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={onRefresh}
              className="rounded p-1.5 text-[var(--cp-text-muted)] transition-colors hover:bg-[var(--cp-hover)] hover:text-[var(--cp-text-strong)]"
              title={t.refresh}
              aria-label={t.refresh}
            >
              <RefreshCw className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={onToggleTheme}
              className="rounded p-1.5 text-[var(--cp-text-muted)] transition-colors hover:bg-[var(--cp-hover)] hover:text-[var(--cp-text-strong)]"
              title={light ? t.darkMode : t.lightMode}
              aria-label={light ? t.darkMode : t.lightMode}
            >
              {light ? <Moon className="h-3.5 w-3.5" /> : <Sun className="h-3.5 w-3.5" />}
            </button>
            <LangSwitcher />
          </div>

          <Link
            href="/"
            className="hidden border-l border-[var(--cp-border)] pl-3 text-[12px] text-[var(--cp-text-dim)] transition-colors hover:text-[var(--cp-text-strong)] sm:block md:hidden lg:block md:pl-4"
          >
            {t.homeLink}
          </Link>
        </div>
      </header>

      {/* ── 도시 행 (모바일) — 좌측 도시 스위처(넘치면 가로 스크롤) + 우측 라이브 갱신 시각.
             갱신 시각이 헤더 1행에 있으면 제목과 폭을 다투다 제목이 잘려서 여기로 내렸다 */}
      <div className="flex shrink-0 items-center gap-3 border-b border-[var(--cp-border)] px-4 py-1.5 md:hidden">
        <div className="min-w-0 flex-1 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <div className="w-max">{citySwitcher}</div>
        </div>
        {liveClock}
      </div>

      {/* ── 재난문자 배너 (오늘 발송분 있을 때만, 탭하면 전체 펼침) — 본문은 원문 유지, 머리말만 번역 */}
      {disaster.length > 0 && (
        <button
          onClick={onToggleDisaster}
          aria-expanded={disasterOpen}
          className="flex shrink-0 items-start gap-2 border-b border-amber-500/30 bg-amber-500/10 px-4 py-1.5 text-left md:px-5"
        >
          <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />
          {disasterOpen ? (
            <span className="min-w-0 flex-1 space-y-1">
              {disaster.map((d, i) => (
                <span key={i} className="block text-[12px] leading-relaxed text-[var(--cp-text)]">
                  <b className="text-amber-500">
                    {trDisaster(d.type, lang)} {trDisaster(d.step, lang)}
                  </b>{" "}
                  {d.content}
                </span>
              ))}
            </span>
          ) : (
            /* 잘릴 만큼 길면 좌우 왕복 마퀴로 전문 노출 (푸터 출처와 동일 동작) */
            <AutoMarquee className="flex-1 text-[12px] leading-5 text-[var(--cp-text)]">
              <b className="text-amber-500">
                {trDisaster(disaster[0].type, lang)} {trDisaster(disaster[0].step, lang)}
              </b>{" "}
              {disaster[0].content}
              {disaster.length > 1 && (
                <span className="text-[var(--cp-text-dim)]">{t.moreCount(disaster.length - 1)}</span>
              )}
            </AutoMarquee>
          )}
        </button>
      )}
    </>
  )
}
