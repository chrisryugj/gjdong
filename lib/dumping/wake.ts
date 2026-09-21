// 호출어("지니"·"지니야") 상태기계. use-voice.ts의 인식기 콜백이 결과마다 이 함수를 부른다.
// 순수 함수라 tests/dumping-wake.test.ts가 지킨다. 브라우저 인식기는 한 구간(segment)에 대해 중간 결과를 여러 번,
// 최종 결과를 한 번 준다. 호출어만 부른 구간은 중간 결과에서 이미 깨운 뒤 최종 결과("지니야")가 따라오므로,
// 그 최종 결과를 빈 질문으로 제출해 idle로 돌아가면 다음 구간의 질문을 놓친다(11라운드 실사고: 두 번째부터 반응 없음).

export const WAKE_WORD = "지니" // 버튼·라벨
export const WAKE_CALL = "지니야" // 안내 문구("지니야 하고 부르면")
// ASR이 받아쓰는 변형("지니 야", "지니님", "진이야", "찌니야"). 띄어쓰기는 매칭 때 무시한다. 긴 것부터.
// "지니"는 "많아지니까"·"빠지니"처럼 서술어 끝에도 흔히 나오므로 앞뒤가 문장 처음·끝이나 띄어쓰기·문장부호일 때만 호출어로 본다
const WAKE_VARIANTS = ["지니야", "지니님", "지니아", "진이야", "찌니야", "찌니", "지니"]
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

const strip = (s: string) => s.replace(/^[\s,.!?]+/, "").trim()

export function wakeStep(state: WakeState, text: string, isFinal: boolean): WakeStep {
  if (state !== "awake") {
    const m = WAKE_RE.exec(text)
    if (!m) return { kind: "ignore" }
    const rest = strip(text.slice(m.index + m[0].length))
    if (isFinal) return rest.length >= MIN_QUESTION ? { kind: "submit", text: rest } : { kind: "wake", heard: "" }
    return { kind: "wake", heard: rest }
  }
  const q = strip(text.replace(WAKE_RE, ""))
  if (isFinal) return q.length >= MIN_QUESTION ? { kind: "submit", text: q } : { kind: "hold" }
  return { kind: "hear", heard: q }
}
