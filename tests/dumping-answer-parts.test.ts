import assert from "node:assert/strict"
import { test } from "node:test"
import { ASK_ACCEPT, ASK_DONE, ASK_ERR, ASK_FEED0, completeSentences, endAsk, feedAsk, splitAnswer, ttsClean } from "../lib/dumping/answer-parts"

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
  assert.doesNotMatch(t, /[()β%·~[\]]/)
  assert.match(t, /베타/)
  assert.match(t, /연관이 뚜렷함/)
  assert.match(t, /9\.0퍼센트/)
  assert.match(t, /10에서 12건/)
  assert.doesNotMatch(t, /^- /m)
})

// 스트림 규약(독립 리뷰 F1): 완료 표식이 있어야 완성 답. 표식이 청크 경계에서 잘려도 잡는다

function run(chunks: string[]) {
  let s = ASK_FEED0
  let text = ""
  for (const c of chunks) {
    const r = feedAsk(s, c)
    s = r.s
    text += r.text
  }
  return { ...endAsk(s), text }
}

test("접수 표식 뒤 본문과 완료 표식: 본문만 화면에, done=true", () => {
  const r = run([ASK_ACCEPT, "민원은 ", "두 배가 됐습니다.", ASK_DONE])
  assert.equal(r.text, "민원은 두 배가 됐습니다.")
  assert.equal(r.accepted, true)
  assert.equal(r.done, true)
  assert.equal(r.err, null)
})

test("본문 뒤 표식 없이 닫히면 끊긴 답(done=false, err=null). 잘린 표식도 완료가 아니다", () => {
  const r = run([ASK_ACCEPT + "partial answer"])
  assert.equal(r.text, "partial answer")
  assert.equal(r.done, false)
  assert.equal(r.err, null)
  const cut = run([ASK_ACCEPT + "partial answer", "\0DO"])
  assert.equal(cut.text, "partial answer")
  assert.equal(cut.done, false)
  assert.equal(cut.err, null)
})

test("오류 표식은 어느 위치에서 잘려도 잡히고 메시지가 본문에 섞이지 않는다", () => {
  const frame = ASK_ERR + "retry"
  for (let i = 1; i < frame.length; i++) {
    const r = run([ASK_ACCEPT + "결론입니다. ", frame.slice(0, i), frame.slice(i)])
    assert.equal(r.text, "결론입니다. ", `split at ${i}`)
    assert.equal(r.err, "retry", `split at ${i}`)
    assert.equal(r.done, false)
  }
  // 본문 없이 오류만
  const r = run([ASK_ACCEPT, "\0E", "RR:답변 생성에 실패했습니다."])
  assert.equal(r.text, "")
  assert.equal(r.err, "답변 생성에 실패했습니다.")
})

test("완료 표식이 청크 경계에서 잘려도 완료로 본다. 완료 뒤 조각은 본문이 아니다", () => {
  const r = run([ASK_ACCEPT + "답.", "\0DO", "NE"])
  assert.equal(r.text, "답.")
  assert.equal(r.done, true)
  const r2 = run([ASK_ACCEPT + "답." + ASK_DONE.slice(0, 1), ASK_DONE.slice(1) + "tail"])
  assert.equal(r2.text, "답.")
  assert.equal(r2.done, true)
})

test("빈 청크와 접수 표식만 온 상태는 본문이 없다", () => {
  const r = run(["", ASK_ACCEPT, ""])
  assert.equal(r.text, "")
  assert.equal(r.accepted, true)
  assert.equal(r.done, false)
})
