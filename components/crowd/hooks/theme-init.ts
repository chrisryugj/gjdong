// 첫 페인트 전 인라인 스크립트(app/crowd/**·app/gwangjin/page.tsx). 서버 컴포넌트가 읽으므로 "use client" 모듈에 두지 않는다
// ("use client" 모듈의 문자열 export를 서버에서 쓰면 클라이언트 참조 프록시가 박힌다 — lib/dumping/init-scripts.ts 2026-09-22 실측).

/** localStorage 키 — use-persisted-prefs와 공유. 값 "dark" | "light", 없으면 시스템 설정 */
export const CROWD_THEME_KEY = "crowdTheme"

/** 저장값 우선, 없으면 prefers-color-scheme. 브라우저에서만 호출 */
export function initialCrowdLight(): boolean {
  try {
    const saved = localStorage.getItem(CROWD_THEME_KEY)
    if (saved === "dark") return false
    if (saved === "light") return true
  } catch {
    // 저장소 차단(사파리 프라이빗 등) — 시스템 설정으로
  }
  return !window.matchMedia("(prefers-color-scheme: dark)").matches
}

/** html[data-crowd-theme] — 대시보드 JS 도착 전 로딩 셸(.crowd-shell)이 이 값으로 다크를 고른다. 판정 규칙은 initialCrowdLight와 동일 */
export const CROWD_THEME_INIT_SCRIPT = `(function(){var d=document.documentElement,t;try{t=localStorage.getItem("${CROWD_THEME_KEY}")}catch(e){}if(t!=="dark"&&t!=="light")t=window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";d.setAttribute("data-crowd-theme",t)})();`
