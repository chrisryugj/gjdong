// 브라우저 음성 인식(ko-KR) 결과 뒷손질. 인식기 자체는 못 고치니 자주 틀리는 도메인 용어와 띄어쓰기를 바로잡고,
// 질문이면 물음표를 붙인다. 순수 함수라 tests/dumping-stt.test.ts가 지킨다.
// 규칙은 실측 오인식에서만 추가한다(수거→수고, 무단 투기, 중곡 삼동). 일반 문장을 바꾸는 규칙은 넣지 않는다.

const KO_DIGIT: Record<string, string> = { 일: "1", 이: "2", 삼: "3", 사: "4", 1: "1", 2: "2", 3: "3", 4: "4" }

const TERM_RULES: [RegExp, string | ((...m: string[]) => string)][] = [
  // 오인식. "수고하세요"류만 남기고 "수고"는 이 대시보드에서 언제나 "수거"
  [/수고(?!\s*(하|했|해|많|스|롭))/g, "수거"],
  [/(과\s*태\s*[료로요]|가태료|과태로)/g, "과태료"],
  [/(씨씨\s*티\s*비|시시\s*티\s*비|c\s*c\s*t\s*v)/gi, "CCTV"],
  [/핫\s*스[팟폿]/g, "핫스팟"],
  [/(피\s*값|p\s*밸류)/g, "p값"],
  [/디\s*아이\s*디/g, "DID"],
  // 띄어쓰기. 화면 용어와 같은 붙여쓰기로
  [/무단\s+투기/g, "무단투기"],
  [/다\s+가구/g, "다가구"],
  [/상습\s+격자/g, "상습격자"],
  [/채널\s+고정/g, "채널고정"],
  [/집중\s+관리/g, "집중관리"],
  [/재\s+배치/g, "재배치"],
  [/(생활|상주|등록)\s+인구/g, "$1인구"],
  [/(일|1)\s*인\s*세대/g, "1인세대"],
  [/천\s+명당/g, "천명당"],
  [/동\s*주민\s*센터/g, "동주민센터"],
  [/청소\s+과(?=[가는를이의에\s]|$)/g, "청소과"],
  [/건축\s+과(?=[가는를이의에\s]|$)/g, "건축과"],
  // 행정동. "중곡 삼동"·"자양 4 동" → "중곡3동"·"자양4동"
  [/(중곡|구의|자양)\s*([일이삼사1-4])\s*동/g, (_m, a, d) => `${a}${KO_DIGIT[d]}동`],
]

export function normalizeTranscript(text: string): string {
  let t = text.replace(/\s+/g, " ").trim()
  for (const [re, to] of TERM_RULES) t = typeof to === "string" ? t.replace(re, to) : t.replace(re, to as (...a: string[]) => string)
  return t
}

// 명령("알려줘", "설명해 주세요")은 그대로. 의문사가 있거나 의문 어미로 끝나면 물음표
const IMPERATIVE_END = /(줘|주세요|주십시오|해\s?봐|보자|바랍니다|하세요|해라|볼래|주라|해줄래|줄래)$/
const QUESTION_WORD = /(뭐|무엇|왜|어디|언제|누구|누가|어떻게|얼마|몇|어느|무슨|어떤|맞나|맞아|맞지|되나|될까|할까|인가|일까)/
const QUESTION_END = /(까|나|니|냐|죠|지|나요|가요|까요|은지|는지|을지|ㄹ지|인가|건가|건지|거야|있어|없어|있나|없나|돼|되나|맞아|어때|어떤가)$/

export function punctuateQuestion(text: string): string {
  const t = text.trim().replace(/[.!?。]+$/, "")
  if (!t) return t
  if (IMPERATIVE_END.test(t)) return t
  if (QUESTION_WORD.test(t) || QUESTION_END.test(t)) return `${t}?`
  return t
}

export function fixTranscript(text: string): string {
  return punctuateQuestion(normalizeTranscript(text))
}
