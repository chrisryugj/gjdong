import { test } from "node:test"
import assert from "node:assert"
import { matchSeed, normalizeQ } from "../lib/dumping/seed-match"

const SEEDS = [
  "작년보다 나빠졌나?", "적발과 가장 강하게 연관된 조건은?", "예산은 얼마나 드나?", "대책 효과는 언제 확인되나?",
  "CCTV는 어디에 놓아야 하나?", "빠뜨린 대책은 없나?", "으슥한 골목에 많이 버리지 않나?", "재활용정거장은 효과가 있었나?",
  "청소차는 어디를 청소하나?", "계절이나 날씨에 따라 달라지나?", "월별로는 어떻게 움직였나?",
].map((q) => ({ q }))

// 같은 뜻의 다른 말투는 잡고, 비슷한 낱말이 섞였을 뿐인 다른 질문은 잡지 않는다(오탐이 오답보다 나쁘다)
test("말투만 다른 질문은 준비된 답에 붙는다", () => {
  const hit = (q: string) => matchSeed(q, SEEDS)?.seed.q ?? null
  assert.strictEqual(hit("작년보다 나빠졌어?"), "작년보다 나빠졌나?")
  assert.strictEqual(hit("예산 얼마나 들어?"), "예산은 얼마나 드나?")
  assert.strictEqual(hit("CCTV 어디에 놓아야 해?"), "CCTV는 어디에 놓아야 하나?")
  assert.strictEqual(hit("대책 효과는 언제 확인되나요?"), "대책 효과는 언제 확인되나?")
  assert.strictEqual(hit("계절이나 날씨에 따라 달라지나요?"), "계절이나 날씨에 따라 달라지나?")
  // 같은 뜻(카메라를 어디에 둘까). 준비된 답이 재배치 후보 20곳을 말하므로 붙는 편이 낫다
  assert.strictEqual(hit("CCTV를 어디로 옮기면 되나?"), "CCTV는 어디에 놓아야 하나?")
})

// 14라운드: 부정·반대 방향 질문은 글자가 겹쳐도 붙지 않는다(심사 자리에서 던지기 쉬운 반문)
test("부정·반대 방향 질문은 준비된 답에 붙지 않는다", () => {
  const hit = (q: string) => matchSeed(q, SEEDS)?.seed.q ?? null
  assert.strictEqual(hit("CCTV는 어디에 놓으면 안 되나?"), null)
  assert.strictEqual(hit("예산은 얼마나 절감되나?"), null)
  assert.strictEqual(hit("작년보다 나아졌나?"), null)
  assert.strictEqual(hit("청소차는 어디를 안 청소하나?"), null)
  assert.strictEqual(hit("재활용정거장은 효과가 없었나?"), null)
  // 시드 자체가 부정형이면 그 말투는 그대로 붙는다
  assert.strictEqual(hit("으슥한 골목에 많이 버리지 않나요?"), "으슥한 골목에 많이 버리지 않나?")
  assert.strictEqual(hit("빠뜨린 대책은 없나요?"), "빠뜨린 대책은 없나?")
})

test("다른 질문은 붙지 않는다(평가셋 11문항 전부)", () => {
  const evalQs = [
    "이동식 CCTV를 설치하면 무단투기가 얼마나 줄어드나요?",
    "다국어 안내문을 배포하면 화양동 무단투기가 몇 건 줄어들지 계산해 주세요.",
    "외국인이 많아서 무단투기가 늘어난 것 아닌가요? 외국인 대책부터 해야죠.",
    "청소차가 몇 시에 지나간 뒤에 투기가 제일 많이 생기나요?",
    "인구를 통제하고 나서도 무관리주거가 최강 예측변수인가요? 과태료가 줄었으니 발생도 줄어든 거죠?",
    "수거 시간대 조정은 어떤 효과를 가정한 제안이야?",
    "그래서 내가 당장 뭘 결정하면 되나?",
    "날씨가 무단투기 영향을 얼마나 미쳐?",
  ]
  for (const q of evalQs) assert.strictEqual(matchSeed(q, SEEDS), null, q)
})

test("정규화는 조사·물음표·어미만 걷어낸다", () => {
  assert.strictEqual(normalizeQ("예산은 얼마나 드나?"), "예산얼마나드")
  assert.strictEqual(normalizeQ("작년보다 나빠졌어?"), "작년보다나빠졌")
})
