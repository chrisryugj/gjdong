"use client"

import Link from "next/link"
import { Moon, RefreshCw, Sun, TriangleAlert } from "lucide-react"
import { LEVEL_COLORS, type CrowdDisaster } from "@/lib/crowd/seoul-rtd"
import { formatClock, LEVEL_ORDER } from "@/components/crowd/shared"
import { LangSwitcher, useLang } from "@/components/crowd/lang-context"
import { trDisaster } from "@/lib/crowd/i18n"

interface CrowdHeaderProps {
  spotCount: number
  levelCounts: Record<string, number>
  updatedAt: string | null
  light: boolean
  disaster: CrowdDisaster[]
  disasterOpen: boolean
  onRefresh: () => void
  onToggleTheme: () => void
  onToggleDisaster: () => void
}

export default function CrowdHeader({
  spotCount,
  levelCounts,
  updatedAt,
  light,
  disaster,
  disasterOpen,
  onRefresh,
  onToggleTheme,
  onToggleDisaster,
}: CrowdHeaderProps) {
  const { lang, t, level } = useLang()
  return (
    <>
      {/* ── 헤더 */}
      <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-[var(--cp-border)] px-4 md:px-5">
        <div className="flex min-w-0 items-baseline gap-3">
          <h1
            className={`shrink-0 text-xl text-[var(--cp-text-strong)] md:text-2xl ${
              lang === "ko" ? "[font-family:Joseon100Years,serif]" : "font-semibold tracking-tight"
            }`}
          >
            {t.title}
          </h1>
          <p className="hidden truncate text-[12px] text-[var(--cp-text-dim)] sm:block">
            {t.subtitle(spotCount > 0 ? spotCount : 121)}
          </p>
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
            {updatedAt && (
              <span className="hidden font-mono text-[12px] tabular-nums text-[var(--cp-text-dim)] min-[400px]:inline">
                {t.updatedAt(formatClock(updatedAt))}
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
            <span className="min-w-0 flex-1 truncate text-[12px] leading-5 text-[var(--cp-text)]">
              <b className="text-amber-500">
                {trDisaster(disaster[0].type, lang)} {trDisaster(disaster[0].step, lang)}
              </b>{" "}
              {disaster[0].content}
              {disaster.length > 1 && (
                <span className="text-[var(--cp-text-dim)]">{t.moreCount(disaster.length - 1)}</span>
              )}
            </span>
          )}
        </button>
      )}
    </>
  )
}
