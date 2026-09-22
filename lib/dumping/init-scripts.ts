// 첫 페인트 전에 <head> 없이 인라인으로 실행되는 스크립트(app/dumping/page.tsx). 서버 컴포넌트가 읽으므로 "use client" 모듈에 두지 않는다.
// "use client" 모듈의 문자열 export를 서버에서 연산하면 클라이언트 참조 프록시가 되어 스크립트 자리에 오류 문자열이 박힌다(2026-09-22 배포 실측).
// 저장 키는 theme.tsx·font-scale.tsx가 여기서 가져다 쓴다.

export const THEME_KEY = "dump-theme"
export const FONT_SCALE_KEY = "dump-font-scale"

/** html[data-theme]. 기본 라이트(종이). 시스템 설정은 따르지 않는다(시연은 종이 기본) */
export const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem("${THEME_KEY}");document.documentElement.setAttribute("data-theme",t==="dark"?"dark":"light")}catch(e){document.documentElement.setAttribute("data-theme","light")}})();`

/** html[data-fontscale]. 보통(없음)·1.15·1.3 */
export const FONT_SCALE_INIT_SCRIPT = `(function(){try{var s=localStorage.getItem("${FONT_SCALE_KEY}");if(s==="1.15"||s==="1.3")document.documentElement.setAttribute("data-fontscale",s)}catch(e){}})();`
