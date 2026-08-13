"use client"

// 첫 3초 축 — 한 줄 브리핑 + 지금 상태 타일(대기·비·약국·응급병상) + 명소 혼잡 컴팩트 카드.
// 타일은 "지금 나가도 되나"의 답을 스크롤 없이 주고, 탭하면 해당 상세 카드로 데려간다.
// 브리핑은 원천 데이터만으로 규칙 합성 — 추측·수식 없이 사실만 한 문장.

import { LoaderCircle, Activity } from "lucide-react"
import type { CrowdSpot } from "@/lib/crowd/seoul-rtd"
import type { BaselineDelta } from "@/lib/crowd/heatmap-client"
import { LevelBadge } from "@/components/crowd/shared"
import { Card } from "@/components/gwangjin/cards-live"
import type { CareBundle, LiveBundle } from "@/components/gwangjin/use-gwangjin-life"

/** 대기질 등급 → 상태 톤 (서울시 CAI_GRD 문자 그대로) */
const AIR_TONE: Record<string, Tone> = {
  좋음: "ok",
  나쁨: "warn",
  매우나쁨: "bad",
}

type Tone = "ok" | "warn" | "bad" | "info"

const TONE_TEXT: Record<Tone, string> = { ok: "gj-ok", warn: "gj-warn", bad: "gj-bad", info: "gj-info" }
const TONE_BG: Record<Tone, string> = { ok: "gj-bg-ok", warn: "gj-bg-warn", bad: "gj-bg-bad", info: "gj-bg-info" }

function Tile({
  label,
  value,
  tone,
  sub,
  loading,
  onTap,
}: {
  label: string
  value: string
  tone?: Tone
  sub?: string
  loading?: boolean
  onTap?: () => void
}) {
  const shell = `rounded-xl border px-2.5 py-2 text-left ${
    tone ? TONE_BG[tone] : "border-[var(--cp-border-faint)] bg-[var(--cp-panel)]"
  }`
  const body = (
    <>
      <p className="text-[10px] leading-tight text-[var(--cp-text-dim)]">{label}</p>
      {loading ? (
        <div className="gj-skel mt-1 h-4 w-3/4" />
      ) : (
        <p className={`truncate text-[15px] font-semibold leading-snug tabular-nums ${tone ? TONE_TEXT[tone] : "text-[var(--cp-text-strong)]"}`}>
          {value}
        </p>
      )}
      {sub && !loading && <p className="truncate text-[9px] text-[var(--cp-text-faint)]">{sub}</p>}
    </>
  )
  // 점프 대상이 있는 타일만 버튼 — 죽은 버튼(탭해도 아무 일 없음)을 만들지 않는다
  if (!onTap) return <div className={shell}>{body}</div>
  return (
    <button type="button" onClick={onTap} aria-label={`${label} ${value} — 자세히 보기`} className={`gj-press gj-focus ${shell} hover:bg-[var(--cp-hover)]`}>
      {body}
    </button>
  )
}

/** 원천 데이터만으로 지금 상황 한 문장 — 우선순위: 비 > 비 예보 > 대기 나쁨 > 심야 약국 > 한산 명소 */
function buildBrief(live: LiveBundle | null, care: CareBundle | null, spots: CrowdSpot[]): string | null {
  if (live === null && care === null) return null
  const mm60 = live?.rain?.mm60 ?? 0
  if (mm60 > 0) return `비가 와요 — 최근 1시간 ${mm60.toFixed(1)}mm, 우산 챙기세요`
  const prob = live?.forecast?.maxRainProb ?? 0
  if (prob >= 60) return `12시간 내 비 올 확률 ${prob}% — 우산 있으면 든든해요`
  const grade = live?.air?.grade
  if (grade === "나쁨" || grade === "매우나쁨") return `대기질 ${grade} — 실내 활동을 추천해요`
  const h = new Date().getHours()
  if (h >= 21 || h < 2) {
    const late = (care?.pharmacies ?? []).filter((p) => p.openNow).length
    if (late > 0) return `지금 문 연 약국 ${late}곳 — 아래 약국 탭에서 확인하세요`
  }
  const calm = spots.find((s) => s.levelNum > 0 && s.levelNum <= 1)
  if (calm) return `${calm.name} 지금 여유 — 나들이 좋은 시간이에요`
  const normal = spots.find((s) => s.levelNum === 2)
  if (normal) return `명소들은 대체로 보통 — 무난하게 다녀올 만해요`
  return null
}

/** 지금 광진 요약 — 타일 탭 = 해당 카드로 점프. 키 미설정도 — 로 (발급 안내는 개별 카드가 한다) */
export function NowStrip({
  live,
  care,
  spots,
  onJump,
}: {
  live: LiveBundle | null
  care: CareBundle | null
  spots: CrowdSpot[]
  /** 앵커 점프 — pharm/er은 CareCard 탭 전환까지 겸한다 (보드가 구현) */
  onJump?: (target: "rain" | "pharm" | "er") => void
}) {
  const air = live?.air
  const rain = live?.rain
  const mm60 = rain?.mm60 ?? 0
  const pharmacies = care?.pharmacies
  const openPharm = pharmacies ? pharmacies.filter((p) => p.openNow).length : null
  const er = care?.er
  // 가용 응급병상 합 — 병상 수를 안 주는 병원(null)은 합산에서 제외
  const beds = er ? er.reduce((a, h) => a + Math.max(h.beds ?? 0, 0), 0) : null
  const brief = buildBrief(live, care, spots)
  return (
    <div className="space-y-2">
      {brief && (
        <p className="flex items-center gap-1.5 px-0.5 text-[12px] leading-snug text-[var(--cp-text-muted)]">
          <Activity className="h-3 w-3 shrink-0 text-[var(--cp-text-dim)]" aria-hidden />
          <span className="min-w-0">{brief}</span>
        </p>
      )}
      <div className="grid grid-cols-4 gap-1.5">
        <Tile
          label="대기질"
          value={air?.grade || "—"}
          tone={AIR_TONE[air?.grade ?? ""]}
          sub={air?.pm25 != null ? `초미세 ${air.pm25}` : undefined}
          loading={live === null}
        />
        <Tile
          label="비"
          // 예보 경고(60%+)일 땐 확률이 주인공 — 주황색 "안 옴"은 모순으로 읽힌다
          value={
            live === null
              ? "—"
              : mm60 > 0
                ? `${mm60.toFixed(1)}mm`
                : (live.forecast?.maxRainProb ?? 0) >= 60
                  ? `${live.forecast!.maxRainProb}%`
                  : "안 옴"
          }
          tone={mm60 > 0 ? "info" : (live?.forecast?.maxRainProb ?? 0) >= 60 ? "warn" : undefined}
          sub={
            mm60 > 0
              ? "최근 1시간"
              : live?.forecast
                ? live.forecast.maxRainProb >= 60
                  ? "12시간 내 예보"
                  : live.forecast.maxRainProb >= 30
                    ? `12시간 내 ${live.forecast.maxRainProb}%`
                    : "예보 맑음"
                : undefined
          }
          loading={live === null}
          onTap={onJump ? () => onJump("rain") : undefined}
        />
        <Tile
          label="문연 약국"
          value={openPharm === null ? "—" : `${openPharm}곳`}
          tone={openPharm ? "ok" : undefined}
          loading={care === null}
          onTap={onJump ? () => onJump("pharm") : undefined}
        />
        <Tile
          label="응급병상"
          value={beds === null ? "—" : beds > 0 ? String(beds) : "포화"}
          tone={beds === null ? undefined : beds > 0 ? "ok" : "bad"}
          sub={er?.length ? `${er.length}개 병원` : undefined}
          loading={care === null}
          onTap={onJump ? () => onJump("er") : undefined}
        />
      </div>
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
    <Card id="gj-spots" title="명소 혼잡" badge="실시간 · 5분 갱신">
      {error ? (
        <div className="py-2 text-center">
          <p className={`text-[12px] ${light ? "text-red-600" : "text-red-400"}`}>불러오지 못했어요</p>
          <button
            onClick={onRetry}
            className="gj-press gj-focus mt-1.5 rounded-md border border-[var(--cp-border-strong)] px-3 py-1 text-[12px] text-[var(--cp-text)] hover:bg-[var(--cp-hover2)]"
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
              className="gj-press gj-focus flex min-h-9 items-center justify-between gap-1.5 rounded-lg px-1.5 py-1.5 text-left hover:bg-[var(--cp-hover)]"
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
