"use client"

import Link from "next/link"
import { Moon, RefreshCw, Sun, TriangleAlert } from "lucide-react"
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
  // 도시가 5개가 되면서 모바일 헤더 폭으로는 우측 갱신시각과 부딪혀 잘렸다.
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
              ? "bg-[var(--cp-hover2)] text-[var(--cp-text-strong)]"
              : "text-[var(--cp-text-dim)] hover:text-[var(--cp-text)]"
          }`}
        >
          {t.cityNames[id]}
        </button>
      ))}
    </div>
  )

  return (
    <>
      {/* ── 헤더 */}
      <header className="flex min-h-0 shrink-0 items-center justify-between gap-3 border-b border-[var(--cp-border)] px-4 py-1 md:min-h-14 md:py-0 md:px-5">
        {/* 제목은 min-w-0+truncate — 긴 외국어 제목이 우측 컨트롤과 겹치지 않게 말줄임.
            모바일은 wrap 허용 — 폭이 모자라면 도시 스위처가 둘째 줄로 내려가 제목이 살아남는다 */}
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-0.5 md:flex-nowrap">
          <h1
            className={`min-w-0 truncate text-[var(--cp-text-strong)] ${
              lang === "ko"
                ? "text-xl md:text-2xl [font-family:Joseon100Years,serif]"
                : "text-lg font-semibold tracking-tight sm:text-xl md:text-2xl"
            }`}
          >
            {title}
          </h1>
          {/* 도시 스위처 (선택 도시는 URL ?city=로 공유 가능) — 모바일은 헤더 아래 독립 행으로 */}
          <div className="hidden shrink-0 md:block">{citySwitcher}</div>
          <p className="hidden truncate text-[12px] text-[var(--cp-text-dim)] lg:block">{subtitle}</p>
        </div>

        <div className="flex shrink-0 items-center gap-3 md:gap-4">
          <div className="hidden items-center gap-3 md:flex">
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
            {/* 갱신 시각 — 라이브 점과 함께 모든 폭에서 노출 (좁으면 제목 줄이 wrap으로 양보) */}
            {updatedAt && (
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
            )}
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
            className="hidden border-l border-[var(--cp-border)] pl-3 text-[12px] text-[var(--cp-text-dim)] transition-colors hover:text-[var(--cp-text-strong)] sm:block md:pl-4"
          >
            {t.homeLink}
          </Link>
        </div>
      </header>

      {/* ── 도시 스위처 (모바일) — 헤더 안에서는 우측 갱신시각과 폭을 다투다 잘려서 독립 행으로 뺐다.
             5개가 좁은 폭에 안 들어가면 가로 스크롤하되, 스크롤 가능하다는 걸 알 수 있게 좌우 여백을 둔다 */}
      <div className="shrink-0 overflow-x-auto border-b border-[var(--cp-border)] px-4 py-1.5 md:hidden [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <div className="w-max">{citySwitcher}</div>
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
