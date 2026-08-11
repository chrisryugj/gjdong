"use client"

// 첫 3초 축 — 지금 상태 요약 스트립(대기·비·약국·응급병상) + 명소 혼잡 컴팩트 카드.
// 스트립은 "지금 나가도 되나"의 답을 스크롤 없이 준다. 상세는 아래 카드들이 담당.

import { LoaderCircle } from "lucide-react"
import type { CrowdSpot } from "@/lib/crowd/seoul-rtd"
import type { BaselineDelta } from "@/lib/crowd/heatmap-client"
import { LevelBadge } from "@/components/crowd/shared"
import { Card } from "@/components/gwangjin/cards-live"
import type { CareBundle, LiveBundle } from "@/components/gwangjin/use-gwangjin-life"

/** 대기질 등급 → 상태색 클래스 (서울시 CAI_GRD 문자 그대로) */
const AIR_TONE: Record<string, string> = {
  좋음: "gj-ok",
  보통: "",
  나쁨: "gj-warn",
  매우나쁨: "gj-bad",
}

function Tile({ label, value, tone, sub }: { label: string; value: string; tone?: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-[var(--cp-border-faint)] bg-[var(--cp-panel)] px-2.5 py-2">
      <p className="text-[10px] text-[var(--cp-text-dim)]">{label}</p>
      <p className={`truncate text-[13px] font-bold ${tone || "text-[var(--cp-text-strong)]"}`}>{value}</p>
      {sub && <p className="truncate text-[9px] text-[var(--cp-text-faint)]">{sub}</p>}
    </div>
  )
}

/** 지금 광진 요약 — 로딩 전엔 — 로, 키 미설정도 — 로 (발급 안내는 개별 카드가 한다) */
export function NowStrip({ live, care }: { live: LiveBundle | null; care: CareBundle | null }) {
  const air = live?.air
  const rain = live?.rain
  const mm60 = rain?.mm60 ?? 0
  const pharmacies = care?.pharmacies
  const openPharm = pharmacies ? pharmacies.filter((p) => p.openNow).length : null
  const er = care?.er
  // 가용 응급병상 합 — 병상 수를 안 주는 병원(null)은 합산에서 제외
  const beds = er ? er.reduce((a, h) => a + Math.max(h.beds ?? 0, 0), 0) : null
  return (
    <div className="grid grid-cols-4 gap-1.5">
      <Tile
        label="대기질"
        value={air?.grade || "—"}
        tone={AIR_TONE[air?.grade ?? ""]}
        sub={air?.pm25 != null ? `초미세 ${air.pm25}` : undefined}
      />
      <Tile
        label="비"
        value={live === null ? "—" : mm60 > 0 ? `${mm60.toFixed(1)}mm` : "안 옴"}
        tone={mm60 > 0 ? "gj-info" : (live?.forecast?.maxRainProb ?? 0) >= 60 ? "gj-warn" : undefined}
        sub={
          mm60 > 0
            ? "최근 1시간"
            : live?.forecast
              ? live.forecast.maxRainProb >= 30
                ? `12시간 내 ${live.forecast.maxRainProb}%`
                : "예보 맑음"
              : undefined
        }
      />
      <Tile
        label="문연 약국"
        value={openPharm === null ? "—" : `${openPharm}곳`}
        tone={openPharm ? "gj-ok" : undefined}
      />
      <Tile
        label="응급병상"
        value={beds === null ? "—" : beds > 0 ? String(beds) : "포화"}
        tone={beds === null ? undefined : beds > 0 ? "gj-ok" : "gj-bad"}
        sub={er?.length ? `${er.length}개 병원` : undefined}
      />
    </div>
  )
}

/** 명소 혼잡 컴팩트 — 6곳을 2열로, 클릭=기존 상세·hover=지도 마커 연동 */
export function SpotsCompactCard({
  spots,
  loading,
  error,
  light,
  baseline,
  onSelect,
  onHover,
  onRetry,
}: {
  spots: CrowdSpot[]
  loading: boolean
  error: boolean
  light: boolean
  baseline?: Record<string, BaselineDelta> | null
  onSelect: (name: string) => void
  onHover?: (name: string | null) => void
  onRetry: () => void
}) {
  return (
    <Card title="명소 혼잡" badge="실시간 · 5분 갱신">
      {error ? (
        <div className="py-2 text-center">
          <p className={`text-[12px] ${light ? "text-red-600" : "text-red-400"}`}>불러오지 못했어요</p>
          <button
            onClick={onRetry}
            className="mt-1.5 rounded-md border border-[var(--cp-border-strong)] px-3 py-1 text-[12px] text-[var(--cp-text)] transition-colors hover:bg-[var(--cp-hover2)]"
          >
            다시 시도
          </button>
        </div>
      ) : loading && spots.length === 0 ? (
        <div className="flex justify-center py-3">
          <LoaderCircle className="h-4 w-4 animate-spin text-[var(--cp-text-dim)]" />
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-x-2 gap-y-0.5">
          {spots.map((s) => (
            <button
              key={s.name}
              onClick={() => onSelect(s.name)}
              onMouseEnter={() => onHover?.(s.name)}
              onMouseLeave={() => onHover?.(null)}
              className="flex items-center justify-between gap-1.5 rounded-lg px-1.5 py-1.5 text-left transition-colors hover:bg-[var(--cp-hover)]"
            >
              <span className="min-w-0">
                <span className="block truncate text-[12px] text-[var(--cp-text)]">{s.name}</span>
                {baseline?.[s.name] === "below" && (
                  <span className={`block text-[9px] leading-tight ${light ? "text-emerald-700" : "text-emerald-400"}`}>
                    평소보다 한산
                  </span>
                )}
                {baseline?.[s.name] === "above" && (
                  <span className={`block text-[9px] leading-tight ${light ? "text-orange-700" : "text-orange-400"}`}>
                    평소보다 붐빔
                  </span>
                )}
              </span>
              <LevelBadge level={s.level} color={s.color} light={light} />
            </button>
          ))}
        </div>
      )}
    </Card>
  )
}
