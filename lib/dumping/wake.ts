// 호출어("지니"·"지니야") 상태기계. use-voice.ts의 인식기 콜백이 결과마다 이 함수를 부른다.
// 순수 함수라 tests/dumping-wake.test.ts가 지킨다. 브라우저 인식기는 한 구간(segment)에 대해 중간 결과를 여러 번,
// 최종 결과를 한 번 준다. 호출어만 부른 구간은 중간 결과에서 이미 깨운 뒤 최종 결과("지니야")가 따라오므로,
// 그 최종 결과를 빈 질문으로 제출해 idle로 돌아가면 다음 구간의 질문을 놓친다(11라운드 실사고: 두 번째부터 반응 없음).

export const WAKE_WORD = "지니" // 버튼·라벨
export const WAKE_CALL = "지니야" // 안내 문구("지니야 하고 부르면")
// ASR이 받아쓰는 변형("지니 야", "지니님", "진이야", "찌니야"). 띄어쓰기는 매칭 때 무시한다. 긴 것부터.
// "지니"는 "많아지니까"·"빠지니"처럼 서술어 끝에도 흔히 나오므로 앞뒤가 문장 처음·끝이나 띄어쓰기·문장부호일 때만 호출어로 본다
// 2026-09-22 감도 보강: 실사용에서 "지니여"·"지니예"·"진희야"·"지니이"로 받아쓴 경우가 있어 추가. 인식기 대안(maxAlternatives)도 전부 본다(use-voice)
const WAKE_VARIANTS = ["지니야", "지니여", "지니예", "지니님", "지니아", "지니이", "진이야", "진희야", "찌니야", "찌니아", "찌니", "지니", "진이"]
const EDGE = "[\\s,.!?]"
export const WAKE_RE = new RegExp(`(?:^|${EDGE})(?:${WAKE_VARIANTS.map((w) => w.split("").join("\\s*")).join("|")})(?=$|${EDGE})`)
export const MIN_QUESTION = 2

export type WakeState = "off" | "idle" | "awake"
export type WakeStep =
  | { kind: "ignore" } // idle인데 호출어 없음
  | { kind: "wake"; heard: string } // 깨움(알림음). 호출어 뒤에 붙은 말은 heard
  | { kind: "hear"; heard: string } // awake 상태의 중간 결과
  | { kind: "hold" } // awake 유지. 호출어만 부른 구간의 최종 결과
  | { kind: "submit"; text: string }
  | { kind: "stop" } // "지니야 그만"처럼 멈춤 말. 질문으로 보내지 않고 읽기만 멈추고 대기로

const strip = (s: string) => s.replace(/^[\s,.!?]+/, "").trim()
// 22라운드: "지니야 그만"의 "그만"(2자)이 질문으로 제출돼 새 답을 만들고 다시 읽었다(코드리뷰). 이 말들만 오면 멈춤
const STOP_RE = /^(그만|멈춰|정지|조용|됐어|스톱)(해|해요|하세요|요|해줘|해 줘)?[\s.!?]*$/
// 마지막 호출어 뒤의 말. 읽는 도중 끼어들면 스피커에서 되받은 앞말("…앱 신고 지니야 어디가 제일 많아")이 같은 구간에 붙어 온다(22라운드 코드리뷰)
function afterLastWake(text: string): string | null {
  let last: RegExpExecArray | null = null
  for (const m of text.matchAll(new RegExp(WAKE_RE.source, "g"))) last = m as RegExpExecArray
  return last ? strip(text.slice((last.index ?? 0) + last[0].length)) : null
}

export function wakeStep(state: WakeState, text: string, isFinal: boolean): WakeStep {
  if (state !== "awake") {
    const rest = afterLastWake(text)
    if (rest === null) return { kind: "ignore" }
    if (isFinal) return STOP_RE.test(rest) ? { kind: "stop" } : rest.length >= MIN_QUESTION ? { kind: "submit", text: rest } : { kind: "wake", heard: "" }
    return { kind: "wake", heard: rest }
  }
  const q = afterLastWake(text) ?? strip(text)
  if (isFinal) return STOP_RE.test(q) ? { kind: "stop" } : q.length >= MIN_QUESTION ? { kind: "submit", text: q } : { kind: "hold" }
  return { kind: "hear", heard: q }
}
