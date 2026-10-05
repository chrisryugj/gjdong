"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { flushSync } from "react-dom"
import Link from "next/link"
import { LayoutDashboard, Moon, RefreshCw, Sun, TriangleAlert } from "lucide-react"
import { LEVEL_COLORS, type CrowdDisaster } from "@/lib/crowd/seoul-rtd"
import { SWITCH_CITY_IDS, type CityId } from "@/lib/crowd/cities"
import { AutoMarquee, formatClock, LEVEL_ORDER } from "@/components/crowd/shared"
import { LangSwitcher, useLang } from "@/components/crowd/lang-context"
import { citySubtitle, trDisaster } from "@/lib/crowd/i18n"

interface CrowdHeaderProps {
  city: CityId
  spotCount: number
  levelCounts: Record<string, number>
  /** 목록 로딩 중 — 등급 숫자를 실값(0)처럼 보이지 않게 "–"로 */
  loading?: boolean
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
  /** 도시 고정 서피스(/gwangjin) — 도시 스위처를 숨긴다 */
  lockCity?: boolean
}

export default function CrowdHeader({
  city,
  spotCount,
  levelCounts,
  loading,
  updatedAt,
  light,
  disaster,
  disasterOpen,
  onCityChange,
  onRefresh,
  onToggleTheme,
  onToggleDisaster,
  onEnterOps,
  lockCity,
}: CrowdHeaderProps) {
  const { lang, t, level } = useLang()

  // 특보·재난문자가 여러 건이면 7초마다 한 건씩 교체 (아래에서 밀려 올라오는 슬라이드).
  // 펼친 동안은 전문이 다 보이므로 멈춘다. 인덱스는 계속 증가시키고 렌더에서 나머지연산 —
  // 폴링으로 건수가 줄어도 범위를 벗어나지 않는다
  const [alertIdx, setAlertIdx] = useState(0)
  useEffect(() => {
    if (disaster.length < 2 || disasterOpen) return
    const timer = setInterval(() => setAlertIdx((i) => i + 1), 7000)
    return () => clearInterval(timer)
  }, [disaster.length, disasterOpen])
  const alertPos = disaster.length > 0 ? alertIdx % disaster.length : 0
  const alertNow = disaster[alertPos]

  // 테마 전환 — 버튼 중심에서 퍼지는 원형 리빌 (View Transition API, lexdiff 레시피).
  // 미지원 브라우저·reduced-motion은 즉시 전환.
  const themeBtnRef = useRef<HTMLButtonElement>(null)
  const animatedToggleTheme = useCallback(() => {
    const btn = themeBtnRef.current
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    if (!btn || !document.startViewTransition || reduced) {
      onToggleTheme()
      return
    }
    document
      .startViewTransition(() => {
        flushSync(() => onToggleTheme())
      })
      .ready.then(() => {
        const { top, left, width, height } = btn.getBoundingClientRect()
        const x = left + width / 2
        const y = top + height / 2
        const maxRadius = Math.hypot(Math.max(left, window.innerWidth - left), Math.max(top, window.innerHeight - top))
        document.documentElement.animate(
          { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${maxRadius}px at ${x}px ${y}px)`] },
          { duration: 400, easing: "ease-in-out", pseudoElement: "::view-transition-new(root)" },
        )
      })
  }, [onToggleTheme])
  // 도시 전환 시 제목도 동기화 — 4개 언어 제목 속 현지화된 "서울"만 해당 도시명으로 치환.
  // 광진은 인파레이더가 아니라 생활상황판 서피스 — 브랜드부터 갈아끼운다
  const title =
    city === "gwangjin" ? t.gwangjinTitle : city === "seoul" ? t.title : t.title.replaceAll(t.cityNames.seoul, t.cityNames[city])
  // 목록 도착 전에는 도시별 기대 개수를 보여준다 (citySubtitle 기본값)
  const subtitle = citySubtitle(t, city, spotCount)
  // 도시 스위처 — 헤더 안(md↑)과 헤더 아래 독립 행(모바일) 두 곳에서 같은 것을 쓴다.
  // 선택 도시는 반전 대비(라이트=먹색 pill·다크=백색 pill)로 한눈에 — 배경색 은은한 구분은
  // 5개 pill 사이에서 잘 안 읽혔다.
  const citySwitcher = lockCity ? null : (
    <div
      role="group"
      aria-label={t.citySwitchLabel}
      className="flex items-center gap-0.5 rounded-full border border-[var(--cp-border)] bg-[var(--cp-panel)] p-0.5"
    >
      {SWITCH_CITY_IDS.map((id) => (
        <button
          key={id}
          onClick={() => onCityChange(id)}
          aria-pressed={city === id}
          // 모바일 히트 영역 — 시각 크기는 그대로, 의사요소로 세로 44px까지 (실측 41×22, 2026-10-05)
          className={`relative whitespace-nowrap rounded-full px-3 py-0.5 text-[12px] font-medium transition-colors max-md:after:absolute max-md:after:inset-x-0 max-md:after:-inset-y-[11px] md:px-2.5 md:py-1 ${
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
  // 로딩 중(updatedAt 없음)에도 자리는 남긴다 — 도착 순간 끼어들면 헤더 등급 숫자가 옆으로 밀렸다(CLS, 2026-10-05 실측)
  const liveClock = (
    <span
      className={`flex shrink-0 items-center gap-1.5 font-mono text-[12px] tabular-nums text-[var(--cp-text-dim)] ${updatedAt ? "" : "invisible"}`}
      title={t.autoRefresh}
      aria-hidden={updatedAt ? undefined : true}
    >
      <span className="relative flex h-1.5 w-1.5" aria-hidden>
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-sky-400 opacity-50" />
        <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-sky-500" />
      </span>
      {t.updatedAt(updatedAt ? formatClock(updatedAt) : "00:00")}
      <span className={`hidden text-[var(--cp-text-faint)] ${lang === "ko" ? "xl:inline" : "min-[1760px]:inline"}`}>· {t.autoRefresh}</span>
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
              긴 언어(영어 Incheon Airport)가 md 폭에서 우측 시계를 침범하지 않게 내부 스크롤로 양보.
              xl부터는 줄어드는 몫을 부제에 넘긴다 — 스크롤바가 숨어 있어 ko 1280에서 강원 반쪽·en 1280에서
              Seoul만 보이고 나머지 도시가 있는지조차 알 수 없었다(2026-10-05 실측) */}
          <div className="hidden min-w-0 overflow-x-auto md:block xl:shrink-0 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <div className="w-max">{citySwitcher}</div>
          </div>
          <p className="hidden min-w-0 truncate text-[12px] text-[var(--cp-text-dim)] xl:block">{subtitle}</p>
        </div>

        <div className="flex shrink-0 items-center gap-3 md:gap-4">
          {/* 등급 분포 — xl부터만 (md~lg 폭에서 제목을 짜부라뜨리던 주범.
              그 폭에선 목록 패널의 등급 필터 칩이 같은 숫자를 보여준다) */}
          {/* 외국어는 제목·스위처·시각 문구가 길어 1440에서도 스위처가 범례를 덮었다(2026-10-05 en 실측) → 2xl부터 */}
          <div className={`hidden items-center gap-3 ${lang === "ko" ? "xl:flex" : "2xl:flex"}`}>
            {LEVEL_ORDER.map((lv) => (
              <div key={lv} className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full" style={{ background: LEVEL_COLORS[lv] }} />
                <span className="text-[12px] text-[var(--cp-text-muted)]">{level(lv)}</span>
                <span className="min-w-[2ch] text-right font-mono text-[13px] tabular-nums text-[var(--cp-text)]">
                  {loading ? "–" : (levelCounts[lv] ?? 0)}
                </span>
              </div>
            ))}
          </div>

          {/* 모바일 아이콘은 44px 정사각 히트(-my-2로 헤더 높이 불변, 간격 0) — 실측 26×26이었다(2026-10-05) */}
          <div className="flex items-center border-l border-[var(--cp-border)] pl-1 md:gap-1.5 md:pl-4">
            {/* 갱신 시각 — md↑만 여기, 모바일은 도시 행 우측 (좁은 폭에서 제목과 폭 다툼 금지) */}
            <div className="hidden md:contents">{liveClock}</div>
            <button
              onClick={onEnterOps}
              className="-my-2 flex h-11 w-11 items-center justify-center rounded text-[var(--cp-text-muted)] transition-colors hover:bg-[var(--cp-hover)] hover:text-[var(--cp-text-strong)] md:my-0 md:h-auto md:w-auto md:p-1.5"
              title={t.opsMode}
              aria-label={t.opsMode}
            >
              <LayoutDashboard className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={onRefresh}
              className="-my-2 flex h-11 w-11 items-center justify-center rounded text-[var(--cp-text-muted)] transition-colors hover:bg-[var(--cp-hover)] hover:text-[var(--cp-text-strong)] md:my-0 md:h-auto md:w-auto md:p-1.5"
              title={t.refresh}
              aria-label={t.refresh}
            >
              <RefreshCw className="h-3.5 w-3.5" />
            </button>
            <button
              ref={themeBtnRef}
              onClick={animatedToggleTheme}
              className="-my-2 flex h-11 w-11 items-center justify-center rounded text-[var(--cp-text-muted)] transition-colors hover:bg-[var(--cp-hover)] hover:text-[var(--cp-text-strong)] md:my-0 md:h-auto md:w-auto md:p-1.5"
              title={light ? t.darkMode : t.lightMode}
              aria-label={light ? t.darkMode : t.lightMode}
            >
              {light ? <Moon className="h-3.5 w-3.5" /> : <Sun className="h-3.5 w-3.5" />}
            </button>
            {/* 언어 버튼(lang-context 소유)은 모바일에서 의사요소로 세로 히트만 넓힌다 (실측 43×25) */}
            <div className="contents max-md:[&>div>button]:relative max-md:[&>div>button]:after:absolute max-md:[&>div>button]:after:inset-x-0 max-md:[&>div>button]:after:-inset-y-[10px]">
              <LangSwitcher />
            </div>
          </div>

          <Link
            href="/"
            // 프리페치 끔 — 뷰포트 진입만으로 "/" 청크·RSC를 받고, 그 페이지의 방문 카운터까지 올라갔다(2026-10-05 실측)
            prefetch={false}
            className="hidden border-l border-[var(--cp-border)] pl-3 text-[12px] text-[var(--cp-text-dim)] transition-colors hover:text-[var(--cp-text-strong)] sm:block md:hidden lg:block md:pl-4"
          >
            {t.homeLink}
          </Link>
        </div>
      </header>

      {/* ── 도시 행 (모바일) — 좌측 도시 스위처(넘치면 가로 스크롤) + 우측 라이브 갱신 시각.
             갱신 시각이 헤더 1행에 있으면 제목과 폭을 다투다 제목이 잘려서 여기로 내렸다 */}
      <div className="flex shrink-0 items-center gap-3 border-b border-[var(--cp-border)] px-4 py-1.5 md:hidden">
        {/* -my/py 11px: 가로 스크롤 상자가 도시 버튼 히트 의사요소(위아래 11px)를 잘라 28px에 묶였다.
            넓힌 여백이 헤더 아이콘 히트를 덮지 않게 상자는 클릭 통과, 버튼만 받는다 */}
        <div className="pointer-events-none -my-[11px] min-w-0 flex-1 overflow-x-auto py-[11px] [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden [&_button]:pointer-events-auto">
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
            /* 한 건씩 교체 노출 — 항목이 잘릴 만큼 길면 그 안에서 좌우 왕복 마퀴(푸터 출처와 동일 동작).
               우측 카운터는 몇 건 중 몇 번째인지 (숫자라 언어 무관) */
            <span className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden">
              <span key={alertPos} className="crowd-alert-slide block min-w-0 flex-1">
                <AutoMarquee className="text-[12px] leading-5 text-[var(--cp-text)]">
                  <b className="text-amber-500">
                    {trDisaster(alertNow.type, lang)} {trDisaster(alertNow.step, lang)}
                  </b>{" "}
                  {alertNow.content}
                </AutoMarquee>
              </span>
              {disaster.length > 1 && (
                <span className="shrink-0 font-mono text-[11px] tabular-nums text-[var(--cp-text-dim)]">
                  {alertPos + 1}/{disaster.length}
                </span>
              )}
            </span>
          )}
        </button>
      )}
    </>
  )
}
