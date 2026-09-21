"use client"

// /snow 로딩 진행(5라운드 2026-09-21). 사파리 실측: 문서는 0.1초에 오지만 지도 타일(DEM 47장·벡터 20장 5MB)이 13초 넘게 직렬로 내려오는 동안 화면이 빈 지도라 "멈춘 것"으로 보였다.
// 단계를 글로 보인다: 화면 › 데이터 › 지도 바탕 › 타일 n/m. 지도가 idle이 되면 사라진다(snow-dashboard). 스크립트 단계(client.tsx dynamic loading)는 대시보드 밖이라 전체 화면 판이다
import SnowMark from "./snow-mark"

export type LoadPhase = "script" | "data" | "style" | "tiles" | "ready"
export interface LoadState {
  phase: LoadPhase
  loaded: number
  total: number
}
export const LOAD_START: LoadState = { phase: "data", loaded: 0, total: 0 }

// 진행률(%): 화면 0~10 · 데이터 10~25 · 바탕 25~40 · 타일 40~100(받은 장수 비율)
export function loadPct(s: LoadState): number {
  if (s.phase === "script") return 6
  if (s.phase === "data") return 14
  if (s.phase === "style") return 30
  if (s.phase === "ready") return 100
  const f = s.total > 0 ? Math.min(1, s.loaded / s.total) : 0
  return Math.round(40 + 60 * f)
}
export function loadLabel(s: LoadState): string {
  if (s.phase === "script") return "화면 불러오는 중"
  if (s.phase === "data") return "데이터 불러오는 중"
  if (s.phase === "style") return "지도 바탕 준비 중"
  if (s.phase === "ready") return "준비 끝"
  return s.total > 0 ? `지도 타일 ${Math.min(s.loaded, s.total)}/${s.total}` : "지도 타일 불러오는 중"
}

export function LoadCard({ state, hiding = false }: { state: LoadState; hiding?: boolean }) {
  const pct = loadPct(state)
  return (
    <div role="status" aria-live="polite" aria-label={`${loadLabel(state)} ${pct}%`} className={`dump-fl lg-shell lg-dense pointer-events-none flex w-[272px] items-center gap-3 rounded-2xl px-4 py-3 transition-opacity duration-500 ${hiding ? "opacity-0" : "opacity-100"}`}>
      <SnowMark size={30} />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <span className="truncate text-[13px] font-semibold text-[var(--cp-text-strong)]">{loadLabel(state)}</span>
          <span className="dump-kicker shrink-0 font-mono text-[10.5px] text-[var(--cp-text-dim)]">{pct}%</span>
        </div>
        <div className="mt-2 h-[3px] overflow-hidden rounded-full bg-[var(--cp-track)]" aria-hidden>
          <i className="block h-full rounded-full bg-(--dump-accent) transition-[width] duration-300 ease-out" style={{ width: `${pct}%` }} />
        </div>
      </div>
    </div>
  )
}

// 로딩 커튼(6라운드, dumping 19라운드 이식): 지도 영역만 종이로 덮고 4단계(자료·지도 바탕·타일 n/m·입체 핀)를 실제 이벤트로 체크한다. 첫 로드 한 번.
// 유리 패널 아래(z 1030)라 왼쪽 카드·탭은 그대로 읽힌다. 걷힌 뒤 결론이 단계로 등장한다(snow-dashboard: 열선 없는 구간 진홍 벽이 솟는다)
export function LoadCurtain({ state, iconsReady, out }: { state: LoadState; iconsReady: boolean; out: boolean }) {
  const stage = state.phase === "ready" ? (iconsReady ? 4 : 3) : state.phase === "tiles" ? 2 : state.phase === "style" ? 1 : 0
  const steps = ["취약구간·자원 자료", "지도 바탕", "지도 타일", "입체 핀 3D"]
  // 진행률: 단계마다 25%, 03 단계 안은 타일 도착 비율로 채운다
  const frac = stage === 2 && state.total > 0 ? Math.min(1, state.loaded / state.total) : 0
  const pct = Math.round(Math.max(6, Math.min(100, (stage / 4) * 100 + frac * 25)))
  return (
    <div className={`dump-curtain absolute inset-0 z-[1030] ${out ? "out" : ""}`} aria-live="polite" aria-busy={!out}>
      <div className="dump-curtain-box">
        <SnowMark size={44} />
        <p className="dump-kicker mt-4 text-[10.5px] text-[var(--cp-text-dim)]">광진 제설 상황실 · 준비 중</p>
        <h2 className="mt-1 text-[22px] font-extrabold leading-tight tracking-[-0.02em] text-[var(--cp-text-strong)]">적설취약구간과 제설 자원을 불러옵니다</h2>
        <ol className="mt-5 flex flex-col gap-2">
          {steps.map((label, i) => {
            const st = stage > i ? "done" : stage === i ? "now" : "wait"
            const tail = i === 2 && st === "now" && state.total > 0 ? ` ${Math.min(state.loaded, state.total)}/${state.total}` : ""
            return (
              <li key={label} className={`dump-curtain-step ${st}`}>
                <span className="dump-curtain-n">{String(i + 1).padStart(2, "0")}</span>
                <span className="flex-1">
                  {label}
                  {tail && <span className="font-mono text-[12.5px] font-normal text-[var(--cp-text-dim)]">{tail}</span>}
                </span>
                <span className="dump-curtain-mark" aria-hidden>
                  {st === "done" ? "✓" : st === "now" ? "·" : ""}
                </span>
              </li>
            )
          })}
        </ol>
        <div className="mt-5 flex items-center gap-3">
          <div className="dump-curtain-bar flex-1" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
            <span style={{ width: `${pct}%` }} />
          </div>
          <span className="dump-kicker w-9 text-right font-mono text-[10.5px] text-[var(--cp-text-dim)]">{pct}%</span>
        </div>
      </div>
    </div>
  )
}

// 대시보드 청크가 오기 전(client.tsx dynamic loading): 테마 변수가 필요해 페이지 클래스를 그대로 두른다. 첫 페인트 색은 app/snow/page.tsx 인라인 스크립트의 data-theme
export default function SnowLoadingScreen() {
  return (
    <div className="crowd-page crowd-light dump-page snow-page flex h-dvh items-center justify-center bg-[var(--dump-ground)]">
      <LoadCard state={{ phase: "script", loaded: 0, total: 0 }} />
    </div>
  )
}
