"use client"

import { useState } from "react"
import { Sparkles, Star } from "lucide-react"
import { LEVEL_COLORS, textColor, type CrowdSpot } from "@/lib/crowd/seoul-rtd"
import type { BaselineDelta } from "@/lib/crowd/heatmap-client"
import { LevelBadge, LEVEL_ORDER, PRESETS, type PresetKey, type SortMode } from "@/components/crowd/shared"
import { useLang } from "@/components/crowd/lang-context"
import MbtiPanel from "@/components/crowd/mbti-picker"

interface SpotListPanelProps {
  filtered: CrowdSpot[]
  /** MBTI 재미 추천용 전체 목록 — 필터와 무관하게 전 지점에서 고른다 */
  allSpots: CrowdSpot[]
  /** 목적 프리셋은 서울 카테고리 조합이라 서울에서만 노출 (MBTI 추천도 동일 조건) */
  showPresets: boolean
  categories: string[]
  categoryFilter: Set<string>
  levelFilter: Set<string>
  levelCounts: Record<string, number>
  sort: SortMode
  preset: PresetKey | null
  favs: Set<string>
  favOnly: boolean
  light: boolean
  loading: boolean
  error: boolean
  /** 지금 vs 평소 (누적 히트맵 대비) — 히트맵 없는 도시·미로드는 null */
  baseline?: Record<string, BaselineDelta> | null
  /** 원천 자체가 응답하지 않는 실패 — 일반 재시도 안내 대신 원천 상태를 알린다 */
  originDown: boolean
  noSpotMatch: boolean
  onApplyPreset: (key: PresetKey) => void
  onToggleFavOnly: () => void
  onToggleLevel: (level: string) => void
  onToggleCategory: (c: string) => void
  onClearFilters: () => void
  onSort: (mode: SortMode) => void
  onSelect: (name: string) => void
  /** 행 hover ↔ 지도 마커 강조 (PC) */
  onHover?: (name: string | null) => void
  onToggleFav: (name: string) => void
  onRetry: () => void
  /** 목록 아래 추가 콘텐츠 (인천공항 실황 보드) — 같은 스크롤 영역에 이어 붙는다 */
  extra?: React.ReactNode
}

/** 프리셋·혼잡도·카테고리 필터 + 명소 목록 */
export default function SpotListPanel({
  filtered,
  allSpots,
  showPresets,
  categories,
  categoryFilter,
  levelFilter,
  levelCounts,
  sort,
  preset,
  favs,
  favOnly,
  light,
  loading,
  error,
  baseline,
  originDown,
  noSpotMatch,
  onApplyPreset,
  onToggleFavOnly,
  onToggleLevel,
  onToggleCategory,
  onClearFilters,
  onSort,
  onSelect,
  onHover,
  onToggleFav,
  onRetry,
  extra,
}: SpotListPanelProps) {
  const { t, spot: trSpotName, level: trLv, cat } = useLang()
  // MBTI 재미 추천 패널 (서울만) — 열림 상태만 여기서, 유형 선택은 패널 내부가 기억
  const [mbtiOpen, setMbtiOpen] = useState(false)
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* 프리셋 + 혼잡도 필터 한 줄 — 지금 가볼 만한 곳 고르기 (지도에도 반영) */}
      {/* 모바일은 가로 스크롤(PC는 줄바꿈) — 끝을 페이드로 흐려 "더 있다"를 알린다.
          페이드가 없으면 마지막 칩이 그냥 잘린 것처럼 보여 스크롤할 생각을 못 한다 */}
      <div className="scrollbar-thin flex shrink-0 items-center gap-1.5 overflow-x-auto border-b border-[var(--cp-border-faint)] px-3 py-1.5 [mask-image:linear-gradient(to_right,#000_calc(100%-28px),transparent)] md:[mask-image:none] md:flex-wrap md:overflow-visible md:py-2">
        {/* 즐겨찾기 모아보기 — 별을 하나라도 찍었을 때만 노출 */}
        {(favs.size > 0 || favOnly) && (
          <button
            onClick={onToggleFavOnly}
            aria-pressed={favOnly}
            className={`flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full border px-3 py-1.5 text-[12px] transition-colors ${
              favOnly
                ? `border-amber-400/60 bg-amber-400/10 font-medium ${light ? "text-amber-700" : "text-amber-400"}`
                : "border-[var(--cp-border)] text-[var(--cp-text-muted)] hover:border-[var(--cp-border-strong)] hover:text-[var(--cp-text)]"
            }`}
          >
            <Star className={`h-3 w-3 ${favOnly ? "fill-amber-400 text-amber-400" : ""}`} />
            {t.favorites}
            <span className="font-mono tabular-nums opacity-70">{favs.size}</span>
          </button>
        )}
        {/* MBTI 재미 추천 칩 — 프리셋과 같은 줄, 목적 프리셋과 구분되는 톤 */}
        {showPresets && (
          <button
            onClick={() => setMbtiOpen((v) => !v)}
            aria-pressed={mbtiOpen}
            className={`flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full border px-3 py-1.5 text-[12px] transition-colors ${
              mbtiOpen
                ? `border-violet-400/60 bg-violet-400/10 font-medium ${light ? "text-violet-700" : "text-violet-300"}`
                : "border-[var(--cp-border)] text-[var(--cp-text-muted)] hover:border-[var(--cp-border-strong)] hover:text-[var(--cp-text)]"
            }`}
          >
            <Sparkles className="h-3 w-3" />
            {t.mbtiChip}
          </button>
        )}
        {showPresets && PRESETS.map((p) => (
          <button
            key={p.key}
            onClick={() => onApplyPreset(p.key)}
            aria-pressed={preset === p.key}
            className={`shrink-0 whitespace-nowrap rounded-full border px-3 py-1.5 text-[12px] transition-colors ${
              preset === p.key
                ? "border-[var(--cp-border-active)] bg-[var(--cp-panel2)] font-medium text-[var(--cp-text-strong)]"
                : "border-[var(--cp-border)] text-[var(--cp-text-muted)] hover:border-[var(--cp-border-strong)] hover:text-[var(--cp-text)]"
            }`}
          >
            {t[p.tKey] as string}
          </button>
        ))}
        <span className="mx-0.5 h-4 w-px shrink-0 bg-[var(--cp-border)]" />
        {/* 혼잡도 칩은 모바일에서 맨 앞으로(order-first) — 프리셋 5개 뒤에 있으면 인파레이더의
            주 필터가 가로 스크롤 밖(x>400)으로 밀려 아예 안 보였다. PC는 DOM 순서 그대로 */}
        {LEVEL_ORDER.slice().reverse().map((level) => {
          const active = levelFilter.has(level)
          return (
            <button
              key={level}
              onClick={() => onToggleLevel(level)}
              aria-pressed={active}
              className="order-first shrink-0 whitespace-nowrap rounded-full border px-3 py-1.5 text-[12px] transition-colors md:order-none"
              style={
                active
                  ? { borderColor: LEVEL_COLORS[level], color: textColor(LEVEL_COLORS[level], light), background: `${LEVEL_COLORS[level]}1a` }
                  : { borderColor: "var(--cp-border)", color: "var(--cp-text-dim)" }
              }
            >
              <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full align-middle" style={{ background: LEVEL_COLORS[level] }} />
              {trLv(level)}
              <span className="ml-1 font-mono tabular-nums opacity-70">{levelCounts[level] ?? 0}</span>
            </button>
          )
        })}
        {(levelFilter.size > 0 || categoryFilter.size > 0 || favOnly) && (
          <button
            onClick={onClearFilters}
            className="shrink-0 px-1.5 py-1 text-[12px] text-[var(--cp-text-dim)] underline underline-offset-2 hover:text-[var(--cp-text-strong)]"
          >
            {t.clearFilters}
          </button>
        )}
      </div>
      {showPresets && mbtiOpen && (
        <MbtiPanel spots={allSpots} light={light} onSelect={onSelect} onClose={() => setMbtiOpen(false)} />
      )}
      {/* 카테고리 필터 (다중선택, 한 줄 가로 스크롤) + 정렬 고정 */}
      <div className="flex shrink-0 items-center gap-1.5 border-b border-[var(--cp-border)] px-3 py-1.5 md:py-2.5">
        <div className="scrollbar-thin flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto [mask-image:linear-gradient(to_right,#000_calc(100%-24px),transparent)] md:[mask-image:none] md:flex-wrap md:overflow-visible">
          {categories.map((c) => {
            const active = c === "전체" ? categoryFilter.size === 0 : categoryFilter.has(c)
            return (
              <button
                key={c}
                onClick={() => onToggleCategory(c)}
                aria-pressed={active}
                className={`shrink-0 whitespace-nowrap rounded-full border px-3 py-1.5 text-[12px] transition-colors ${
                  active
                    ? "border-[var(--cp-border-active)] bg-[var(--cp-panel2)] text-[var(--cp-text-strong)]"
                    : "border-[var(--cp-border)] text-[var(--cp-text-dim)] hover:border-[var(--cp-border-strong)] hover:text-[var(--cp-text)]"
                }`}
              >
                {cat(c)}
              </button>
            )
          })}
        </div>
        {/* 정렬 — 모바일은 select 하나로 압축. 3개 링크가 140px를 먹어 카테고리 칩이
            2개만 보이던 자리를 되돌려준다 (PC는 한눈에 보이는 3링크 유지) */}
        <select
          value={sort}
          onChange={(e) => onSort(e.target.value as SortMode)}
          aria-label={t.sortLabel}
          className="ml-0.5 shrink-0 rounded-full border border-[var(--cp-border)] bg-[var(--cp-panel)] py-1 pl-2 pr-1 text-[12px] text-[var(--cp-text-muted)] md:hidden"
        >
          <option value="busy">{t.sortBusy}</option>
          <option value="calm">{t.sortCalm}</option>
          <option value="name">{t.sortName}</option>
        </select>
        <div className="hidden shrink-0 items-center gap-1 border-l border-[var(--cp-border-faint)] pl-1.5 md:flex">
          {(
            [
              ["busy", t.sortBusy],
              ["calm", t.sortCalm],
              ["name", t.sortName],
            ] as Array<[SortMode, string]>
          ).map(([mode, label]) => (
            <button
              key={mode}
              onClick={() => onSort(mode)}
              aria-pressed={sort === mode}
              className={`whitespace-nowrap px-1 py-1 text-[12px] transition-colors ${
                sort === mode ? "text-[var(--cp-text-strong)] underline underline-offset-4" : "text-[var(--cp-text-faint)] hover:text-[var(--cp-text-muted)]"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* 목록 */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {error && (
          <div className="p-6 text-center">
            <p className={`text-[13px] ${light ? "text-red-600" : "text-red-400"}`}>
              {originDown ? t.errOriginDown : t.errLoad}
            </p>
            <button
              onClick={onRetry}
              className="mt-2 rounded-md border border-[var(--cp-border-strong)] px-3 py-1.5 text-[13px] text-[var(--cp-text)] transition-colors hover:bg-[var(--cp-hover2)]"
            >
              {t.retry}
            </button>
          </div>
        )}
        <ul>
          {filtered.map((spot, i) => (
            <li key={spot.name} className="relative">
              <button
                onClick={() => onSelect(spot.name)}
                onMouseEnter={() => onHover?.(spot.name)}
                onMouseLeave={() => onHover?.(null)}
                className="group flex w-full items-center gap-3 border-b border-[var(--cp-border-faint)] py-2.5 pl-4 pr-11 text-left transition-colors hover:bg-[var(--cp-hover)]"
              >
                <span className="w-6 shrink-0 font-mono text-[12px] tabular-nums text-[var(--cp-text-faint)]">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[14px] text-[var(--cp-text)] group-hover:text-[var(--cp-text-strong)]">
                    {trSpotName(spot.name)}
                  </p>
                  <p className="text-[12px] text-[var(--cp-text-dim)]">
                    {cat(spot.category)}
                    {/* 인천공항: 대기 분(운영 중)·운영시간(미운영)을 부제로 — 뱃지만으론 "몇 분?"이 안 보인다 */}
                    {spot.waitMin != null && (
                      <span>
                        {" · "}
                        {t.waitShort(spot.waitMin)}
                      </span>
                    )}
                    {spot.hours && (
                      <span className="text-[var(--cp-text-faint)]">
                        {" · "}
                        {t.gateHours(spot.hours)}
                      </span>
                    )}
                    {/* 인파 실측이 아닌 등급은 근거를 병기 — 서울·제주(ppl)는 붙지 않아 첫인상 불변 */}
                    {(spot.basis === "access" || spot.basis === "wait") && (
                      <span className="text-[var(--cp-text-faint)]">
                        {" · "}
                        {spot.basis === "access" ? t.basisAccess : t.basisWait}
                      </span>
                    )}
                    {/* 지금 vs 평소 — 평소와 다를 때만 (평소 수준은 소음이라 생략) */}
                    {baseline?.[spot.name] === "above" && (
                      <span className={light ? "text-orange-700" : "text-orange-400"}>
                        {" · "}
                        {t.baselineAbove}
                      </span>
                    )}
                    {baseline?.[spot.name] === "below" && (
                      <span className={light ? "text-emerald-700" : "text-emerald-400"}>
                        {" · "}
                        {t.baselineBelow}
                      </span>
                    )}
                  </p>
                </div>
                <LevelBadge level={spot.level} color={spot.color} light={light} />
              </button>
              <button
                onClick={() => onToggleFav(spot.name)}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-1.5 transition-colors hover:bg-[var(--cp-hover)]"
                aria-label={favs.has(spot.name) ? t.favOff(trSpotName(spot.name)) : t.favOn(trSpotName(spot.name))}
                title={t.favTitle}
              >
                <Star
                  className={`h-3.5 w-3.5 ${
                    favs.has(spot.name)
                      ? "fill-amber-400 text-amber-400"
                      : "text-[var(--cp-text-faint)] hover:text-[var(--cp-text-muted)]"
                  }`}
                />
              </button>
            </li>
          ))}
        </ul>
        {!loading && !error && filtered.length === 0 && !noSpotMatch && (
          <p className="p-6 text-center text-[13px] text-[var(--cp-text-dim)]">{t.emptyFiltered}</p>
        )}
        {noSpotMatch && (
          <p className="p-6 text-center text-[13px] text-[var(--cp-text-dim)]">{t.noSpotMatch}</p>
        )}
        {extra}
      </div>
    </div>
  )
}
