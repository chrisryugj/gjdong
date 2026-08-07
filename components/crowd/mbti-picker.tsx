"use client"

import { useEffect, useMemo, useState } from "react"
import { X } from "lucide-react"
import type { CrowdSpot } from "@/lib/crowd/seoul-rtd"
import { isMbti, MBTI_TYPES, recommendForMbti, type MbtiType } from "@/lib/crowd/mbti"
import { LevelBadge } from "@/components/crowd/shared"
import { useLang } from "@/components/crowd/lang-context"

/**
 * MBTI 추천 패널 — 시민 모드 재미요소 (서울만, 상황실·보고서와 무관).
 * 16유형 그리드 → 유형 선택 시 지금 인파를 반영한 상위 5곳. 칩(토글)은 SpotListPanel의 프리셋 행에 있다.
 * 면책 문구 상시 노출 — 등급 산출식과 무관한 오락 기능임을 명시한다.
 */
export default function MbtiPanel({
  spots,
  light,
  onSelect,
  onClose,
}: {
  spots: CrowdSpot[]
  light: boolean
  onSelect: (name: string) => void
  onClose: () => void
}) {
  const { t, spot: trSpotName } = useLang()
  const [type, setType] = useState<MbtiType | null>(null)

  // 재미 기능이지만 재방문 시 유형은 기억해준다
  useEffect(() => {
    const saved = localStorage.getItem("crowdMbti")
    if (isMbti(saved)) setType(saved)
  }, [])

  const picks = useMemo(() => (type ? recommendForMbti(spots, type) : []), [spots, type])

  const pick = (v: MbtiType) => {
    setType(v)
    localStorage.setItem("crowdMbti", v)
  }
  const clear = () => {
    setType(null)
    localStorage.removeItem("crowdMbti")
  }

  return (
    <div className="shrink-0 border-b border-[var(--cp-border)] px-3 py-2">
      <div className="flex items-center gap-2">
        <p className="text-[12px] font-medium text-[var(--cp-text-muted)]">{t.mbtiTitle}</p>
        <span className="flex-1" />
        {type && (
          <button onClick={clear} className="text-[11px] text-[var(--cp-text-dim)] underline underline-offset-2 hover:text-[var(--cp-text-strong)]">
            {t.mbtiClear}
          </button>
        )}
        <button onClick={onClose} aria-label={t.clearInput} className="p-1 text-[var(--cp-text-dim)] hover:text-[var(--cp-text-strong)]">
          <X className="h-3 w-3" />
        </button>
      </div>
      <div className="mt-1.5 grid grid-cols-8 gap-1 max-[420px]:grid-cols-4">
        {MBTI_TYPES.map((v) => (
          <button
            key={v}
            onClick={() => pick(v)}
            aria-pressed={type === v}
            className={`rounded border py-1 font-mono text-[11px] transition-colors ${
              type === v
                ? `border-violet-400/60 bg-violet-400/10 font-semibold ${light ? "text-violet-700" : "text-violet-300"}`
                : "border-[var(--cp-border)] text-[var(--cp-text-dim)] hover:border-[var(--cp-border-strong)] hover:text-[var(--cp-text)]"
            }`}
          >
            {v}
          </button>
        ))}
      </div>
      {type && picks.length > 0 && (
        <ul className="mt-1.5">
          {picks.map((s) => (
            <li key={s.name}>
              <button
                onClick={() => onSelect(s.name)}
                className="flex w-full items-center gap-2 rounded px-1 py-1 text-left transition-colors hover:bg-[var(--cp-hover)]"
              >
                <span className="min-w-0 flex-1 truncate text-[13px] text-[var(--cp-text)]">{trSpotName(s.name)}</span>
                <LevelBadge level={s.level} color={s.color} light={light} />
              </button>
            </li>
          ))}
        </ul>
      )}
      {/* 면책 — 재미 기능임을 상시 명시 (공공 방법론 문서와 혼동 방지) */}
      <p className="mt-1.5 text-[11px] text-[var(--cp-text-faint)]">{t.mbtiNote}</p>
    </div>
  )
}
