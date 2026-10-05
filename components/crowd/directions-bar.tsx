"use client"

import { Navigation } from "lucide-react"
import type { CrowdSpot } from "@/lib/crowd/seoul-rtd"
import { useLang } from "@/components/crowd/lang-context"

/** 길찾기 고정 액션바 — "가기로 결정"은 어느 스크롤 위치에서든 나오므로 항상 손에.
 *  390px에서 "Naver Map route"가 두 줄로 넘쳐 버튼 높이가 들쭉날쭉했다 → 한 줄 고정 + 넘치면 말줄임 (2026-10-05 m08) */
export default function DirectionsBar({ spot }: { spot: CrowdSpot }) {
  const { t } = useLang()
  return (
    <div className="flex shrink-0 gap-1.5 border-t border-[var(--cp-border)] bg-[var(--cp-bg)] px-3 py-2">
      <a
        href={`https://map.kakao.com/link/to/${encodeURIComponent(spot.name)},${spot.lat},${spot.lng}`}
        target="_blank"
        rel="noopener noreferrer"
        className="flex min-w-0 flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-md border border-[var(--cp-border-strong)] bg-[var(--cp-panel)] py-2 text-[13px] font-medium text-[var(--cp-text)] transition-colors hover:bg-[var(--cp-hover2)]"
      >
        <Navigation className="h-3.5 w-3.5 shrink-0 text-[#ffb100]" /> <span className="truncate">{t.kakaoDirections}</span>
      </a>
      <a
        href={`https://map.naver.com/p/directions/-/${spot.lng},${spot.lat},${encodeURIComponent(spot.name)}/-/transit`}
        target="_blank"
        rel="noopener noreferrer"
        className="flex min-w-0 flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-md border border-[var(--cp-border-strong)] bg-[var(--cp-panel)] py-2 text-[13px] font-medium text-[var(--cp-text)] transition-colors hover:bg-[var(--cp-hover2)]"
      >
        <Navigation className="h-3.5 w-3.5 shrink-0 text-[#03c75a]" /> <span className="truncate">{t.naverDirections}</span>
      </a>
      {/* 티맵은 웹 라우팅이 없어 앱 스킴 — 미설치/데스크톱은 무동작이라 앱 필요 표기 */}
      <a
        href={`tmap://route?goalname=${encodeURIComponent(spot.name)}&goaly=${spot.lat}&goalx=${spot.lng}`}
        title={t.tmapNeedsApp}
        className="flex min-w-0 flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-md border border-[var(--cp-border-strong)] bg-[var(--cp-panel)] py-2 text-[13px] font-medium text-[var(--cp-text)] transition-colors hover:bg-[var(--cp-hover2)]"
      >
        <Navigation className="h-3.5 w-3.5 shrink-0 text-[#4b2ea8]" /> <span className="truncate">{t.tmapDirections}</span>
      </a>
    </div>
  )
}
