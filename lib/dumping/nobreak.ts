// 화면 문자열의 괄호 안팎에 줄바꿈 금지 문자(U+2060 WORD JOINER)를 넣는다.
// 일부 브라우저가 word-break: keep-all에서도 "(" 바로 뒤에서 줄을 끊어 "2026년 (" / "1~8월)"처럼 갈라졌다(2026-09-18 실사용 보고. Chromium·WebKit·Safari 27 재현 불가).
// 렌더 직전에만 쓴다. 데이터·프롬프트·TTS 원문(answer-parts·facts)은 그대로.
export function nb(s: string): string {
  return s.replace(/\(/g, "(⁠").replace(/\)/g, "⁠)")
}
