"use client"

import Link from "next/link"
import { Moon, RefreshCw, Sun, TriangleAlert } from "lucide-react"
import { LEVEL_COLORS, type CrowdDisaster } from "@/lib/crowd/seoul-rtd"
import { formatClock, LEVEL_ORDER } from "@/components/crowd/shared"

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
  return (
    <>
      {/* ── 헤더 */}
      <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-[var(--cp-border)] px-4 md:px-5">
        <div className="flex min-w-0 items-baseline gap-3">
          <h1 className="shrink-0 text-xl text-[var(--cp-text-strong)] [font-family:Joseon100Years,serif] md:text-2xl">
            서울 인파레이더
          </h1>
          <p className="hidden truncate text-[12px] text-[var(--cp-text-dim)] sm:block">
            실시간 인구밀집 상황판 · 서울 주요 명소 {spotCount > 0 ? spotCount : 121}곳
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-3 md:gap-4">
          <div className="hidden items-center gap-3 md:flex">
            {LEVEL_ORDER.map((level) => (
              <div key={level} className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full" style={{ background: LEVEL_COLORS[level] }} />
                <span className="text-[12px] text-[var(--cp-text-muted)]">{level}</span>
                <span className="font-mono text-[13px] tabular-nums text-[var(--cp-text)]">
                  {levelCounts[level] ?? 0}
                </span>
              </div>
            ))}
          </div>

          <div className="flex items-center gap-1.5 border-l border-[var(--cp-border)] pl-3 md:pl-4">
            {updatedAt && (
              <span className="font-mono text-[12px] tabular-nums text-[var(--cp-text-dim)]">
                {formatClock(updatedAt)} 기준
              </span>
            )}
            <button
              onClick={onRefresh}
              className="rounded p-1.5 text-[var(--cp-text-muted)] transition-colors hover:bg-[var(--cp-hover)] hover:text-[var(--cp-text-strong)]"
              title="새로고침"
              aria-label="새로고침"
            >
              <RefreshCw className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={onToggleTheme}
              className="rounded p-1.5 text-[var(--cp-text-muted)] transition-colors hover:bg-[var(--cp-hover)] hover:text-[var(--cp-text-strong)]"
              title={light ? "다크 모드" : "라이트 모드"}
              aria-label={light ? "다크 모드로 전환" : "라이트 모드로 전환"}
            >
              {light ? <Moon className="h-3.5 w-3.5" /> : <Sun className="h-3.5 w-3.5" />}
            </button>
          </div>

          <Link
            href="/"
            className="hidden border-l border-[var(--cp-border)] pl-3 text-[12px] text-[var(--cp-text-dim)] transition-colors hover:text-[var(--cp-text-strong)] sm:block md:pl-4"
          >
            표준주소실록 ↗
          </Link>
        </div>
      </header>

      {/* ── 재난문자 배너 (오늘 발송분 있을 때만, 탭하면 전체 펼침) */}
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
                    {d.type} {d.step}
                  </b>{" "}
                  {d.content}
                </span>
              ))}
            </span>
          ) : (
            <span className="min-w-0 flex-1 truncate text-[12px] leading-5 text-[var(--cp-text)]">
              <b className="text-amber-500">
                {disaster[0].type} {disaster[0].step}
              </b>{" "}
              {disaster[0].content}
              {disaster.length > 1 && <span className="text-[var(--cp-text-dim)]"> 외 {disaster.length - 1}건</span>}
            </span>
          )}
        </button>
      )}
    </>
  )
}
