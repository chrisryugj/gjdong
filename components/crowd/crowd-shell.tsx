// 대시보드 JS가 도착하기 전 보이는 골격 — dynamic(ssr:false)의 loading으로 정적 HTML에 실린다.
// 없으면 HTML이 비어 모바일 FCP가 1.8초까지 밀렸다(2026-10-05 실측: 대시보드 청크 826ms 시작 → 렌더).
// 언어·도시를 모르는 시점이라 글자 없이 실제 배치(헤더 · 목록 왼쪽 440/500px · 지도)만 흉내 낸다.
// 테마는 app/crowd·app/gwangjin 의 하이드레이션 전 스크립트가 html[data-crowd-theme]에 남긴 값을 CSS가 읽는다.
export default function CrowdShell() {
  return (
    <div className="crowd-page crowd-shell flex h-dvh flex-col bg-[var(--cp-bg)]" aria-busy="true">
      <div className="flex h-11 shrink-0 items-center gap-3 border-b border-[var(--cp-border)] px-4 md:h-14 md:px-5">
        <div className="h-5 w-32 animate-pulse rounded bg-[var(--cp-panel2)]" />
        <div className="hidden h-6 w-64 animate-pulse rounded-full bg-[var(--cp-panel2)] md:block" />
      </div>
      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <div className="h-[34dvh] shrink-0 bg-[var(--cp-panel2)] md:h-auto md:flex-1" />
        <div className="flex min-h-0 flex-1 flex-col gap-2 border-t border-[var(--cp-border)] p-4 md:order-first md:w-[440px] md:flex-none md:border-r md:border-t-0 xl:w-[500px]">
          {Array.from({ length: 8 }, (_, i) => (
            <div key={i} className="h-11 animate-pulse rounded-md bg-[var(--cp-panel)]" />
          ))}
        </div>
      </div>
    </div>
  )
}
