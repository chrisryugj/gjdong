import assert from "node:assert/strict"
import { test } from "node:test"
import { completeSentences, splitAnswer, ttsClean } from "../lib/dumping/answer-parts"

// 답변 2부 분리·문장 단위 낭독·TTS 정리. 프롬프트 형식과 화면·음성이 같은 규칙을 쓰는지 핀으로 박는다.

test("구분줄 [부연] 앞은 본답, 뒤는 부연", () => {
  const r = splitAnswer("민원은 두 배가 됐습니다. 앱 신고가 늘어서입니다.\n[부연]\n- 앱 2.10배, 120·직접 1.11배\n- 과태료 0.53배")
  assert.equal(r.spoken, "민원은 두 배가 됐습니다. 앱 신고가 늘어서입니다.")
  assert.equal(r.detail, "- 앱 2.10배, 120·직접 1.11배\n- 과태료 0.53배")
  assert.equal(r.split, true)
})

test("구분줄이 아직 없으면(스트리밍 중) 전부 본답이고 split=false", () => {
  const r = splitAnswer("민원은 두 배가 됐")
  assert.equal(r.spoken, "민원은 두 배가 됐")
  assert.equal(r.detail, "")
  assert.equal(r.split, false)
})

test("불릿이 붙은 구분줄(- [부연])과 뒤 공백도 잡는다", () => {
  const r = splitAnswer("결론입니다.\n- [부연] \n근거")
  assert.equal(r.spoken, "결론입니다.")
  assert.equal(r.detail, "근거")
})

test("완성 문장만 골라내고 숫자 안의 점은 끊지 않는다", () => {
  const [s, n] = completeSentences("앱 신고는 2.10배입니다. 과태료는 줄었")
  assert.deepEqual(s, ["앱 신고는 2.10배입니다."])
  assert.equal(n, "앱 신고는 2.10배입니다.".length)
  const [s2] = completeSentences("첫째. 둘째!\n셋째?")
  assert.deepEqual(s2, ["첫째.", "둘째!"]) // 마지막은 뒤에 공백이 없어 미완성 취급
})

test("ttsClean은 괄호 풀이·β·p값·가운뎃점을 말로 바꾼다", () => {
  const t = ttsClean("다가구·단독 밀집(건축물대장 기준) β +0.306, p<0.001, 오차 9.0%·10~12건\n[부연]\n- 항목")
  assert.doesNotMatch(t, /[()β%·~\[\]]/)
  assert.match(t, /베타/)
  assert.match(t, /통계적으로 매우 유의/)
  assert.match(t, /9\.0퍼센트/)
  assert.match(t, /10에서 12건/)
  assert.doesNotMatch(t, /^- /m)
})
