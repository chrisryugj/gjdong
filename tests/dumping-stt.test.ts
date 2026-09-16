import { test } from "node:test"
import assert from "node:assert"
import { fixTranscript, normalizeTranscript, punctuateQuestion } from "../lib/dumping/stt"

// 음성 인식 뒷손질. 실측 오인식(수거→수고, 띄어쓰기, 동 이름)과 물음표 규칙
test("도메인 용어 오인식과 띄어쓰기를 바로잡는다", () => {
  assert.strictEqual(normalizeTranscript("수고 시간대 조정하면 효과 있어"), "수거 시간대 조정하면 효과 있어")
  assert.strictEqual(normalizeTranscript("수고하셨습니다"), "수고하셨습니다")
  assert.strictEqual(normalizeTranscript("무단 투기 민원이 왜 늘었어"), "무단투기 민원이 왜 늘었어")
  assert.strictEqual(normalizeTranscript("중곡 삼동 과 태료가 몇 건이야"), "중곡3동 과태료가 몇 건이야")
  assert.strictEqual(normalizeTranscript("자양 4 동 씨씨티비 재 배치"), "자양4동 CCTV 재배치")
  assert.strictEqual(normalizeTranscript("상습 격자 집중 관리 채널 고정 생활 인구  천 명당"), "상습격자 집중관리 채널고정 생활인구 천명당")
  assert.strictEqual(normalizeTranscript("일인 세대가 많은 동"), "1인세대가 많은 동")
})

test("질문이면 물음표, 명령이면 그대로", () => {
  assert.strictEqual(punctuateQuestion("민원이 왜 늘었어"), "민원이 왜 늘었어?")
  assert.strictEqual(punctuateQuestion("효과 있어"), "효과 있어?")
  assert.strictEqual(punctuateQuestion("예산이 얼마나 드나요"), "예산이 얼마나 드나요?")
  assert.strictEqual(punctuateQuestion("상습격자가 몇 곳인지 알려줘"), "상습격자가 몇 곳인지 알려줘")
  assert.strictEqual(punctuateQuestion("수거 시간대 조정 설명해 주세요"), "수거 시간대 조정 설명해 주세요")
  assert.strictEqual(punctuateQuestion("민원이 왜 늘었어?"), "민원이 왜 늘었어?")
  assert.strictEqual(punctuateQuestion("이동식 CCTV 효과는 철회됐습니다"), "이동식 CCTV 효과는 철회됐습니다")
})

test("둘을 합친 fixTranscript", () => {
  assert.strictEqual(fixTranscript("수고 시간대 조정하면 효과 있어"), "수거 시간대 조정하면 효과 있어?")
  assert.strictEqual(fixTranscript("중곡 삼동 무단 투기가 왜 많아"), "중곡3동 무단투기가 왜 많아?")
})
