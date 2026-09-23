// 화면 문자열의 괄호 안팎에 줄바꿈 금지 문자(U+2060 WORD JOINER)를 넣는다.
// 일부 브라우저가 word-break: keep-all에서도 "(" 바로 뒤에서 줄을 끊어 "2026년 (" / "1~8월)"처럼 갈라졌다(2026-09-18 실사용 보고. Chromium·WebKit·Safari 27 재현 불가).
// 렌더 직전에만 쓴다. 데이터·프롬프트·TTS 원문(answer-parts·facts)은 그대로.
export function nb(s: string): string {
  return s.replace(/\(/g, "(⁠").replace(/\)/g, "⁠)")
}

// 제목용. 괄호 안은 한 덩어리로 묶어(공백 → NBSP) 괄호 안에서 줄이 갈리지 않게 하고, 줄이 넘치면 "(" 앞에서만 꺾인다.
// 정책 제안 이름이 20px로 커진 뒤 "(1인세대 / 진입점)"처럼 괄호 안이 갈렸다(2026-09-22). 본문 문장에는 쓰지 않는다(긴 괄호가 넘친다).
// 괄호 안이 max자보다 길면 묶지 않는다(nb만): 묶은 덩어리가 한 줄보다 길면 overflow-wrap이 글자 중간에서 쪼갰다
// ("(화양동 외국인 19.4" / "%)", 20px에 글자 크기 1.3 또는 폰 폭, 22라운드 코드리뷰)
export function nbParen(s: string, max = 10): string {
  return s.replace(/\(([^)]*)\)/g, (_, inner: string) => `(⁠${inner.length <= max ? inner.replace(/ /g, " ") : inner}⁠)`)
}
