"use client"

import DumpMark from "./dump-mark"

// 대시보드 청크가 오기 전(client.tsx dynamic loading) 빈 화면 대신 마크 카드(/snow 5라운드 이식). 사파리에서 청크 수 초 동안 흰 화면이 "멈춤"으로 보였다.
// 테마 변수가 필요해 페이지 클래스를 그대로 두른다. 첫 페인트 색은 app/dumping/page.tsx 인라인 스크립트의 data-theme. 청크가 오면 로그인 게이트 또는 로딩 커튼(지도 영역)이 이어받는다
export default function DumpingLoadingScreen() {
  return (
    <div className="crowd-page crowd-light dump-page flex h-dvh items-center justify-center bg-[var(--dump-ground)]">
      <div role="status" aria-live="polite" aria-label="화면 불러오는 중" className="dump-fl lg-shell lg-dense pointer-events-none flex w-[272px] items-center gap-3 rounded-2xl px-4 py-3">
        <DumpMark size={30} />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <span className="truncate text-[13px] font-semibold text-[var(--cp-text-strong)]">화면 불러오는 중</span>
            <span className="dump-kicker shrink-0 font-mono text-[10.5px] text-[var(--cp-text-dim)]">클린광진 상황실</span>
          </div>
          <div className="mt-2 h-[3px] overflow-hidden rounded-full bg-[var(--cp-track)]" aria-hidden>
            <i className="block h-full w-[6%] rounded-full bg-(--dump-accent)" />
          </div>
        </div>
      </div>
    </div>
  )
}
