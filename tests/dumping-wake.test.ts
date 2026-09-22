import { test } from "node:test"
import assert from "node:assert"
import { wakeStep } from "../lib/dumping/wake"

// 호출어 상태기계. 한 구간의 중간 결과 여러 번 + 최종 결과 한 번이라는 인식기 동작을 그대로 흉내 낸다
test("호출어와 질문을 한 번에 말하면 최종 결과에서 제출한다", () => {
  assert.deepStrictEqual(wakeStep("idle", "지니야", false), { kind: "wake", heard: "" })
  assert.deepStrictEqual(wakeStep("awake", "지니야 민원이", false), { kind: "hear", heard: "민원이" })
  assert.deepStrictEqual(wakeStep("awake", "지니야 민원이 왜 늘었어", true), { kind: "submit", text: "민원이 왜 늘었어" })
})

test("호출어만 부른 뒤 쉬었다 물어도 두 번째 구간에서 제출한다 (빈 최종 결과로 idle로 돌아가지 않는다)", () => {
  assert.deepStrictEqual(wakeStep("idle", "지니 야", false), { kind: "wake", heard: "" })
  assert.deepStrictEqual(wakeStep("awake", "지니 야", true), { kind: "hold" })
  assert.deepStrictEqual(wakeStep("awake", "수거 시간대", false), { kind: "hear", heard: "수거 시간대" })
  assert.deepStrictEqual(wakeStep("awake", "수거 시간대 조정 효과 있어", true), { kind: "submit", text: "수거 시간대 조정 효과 있어" })
})

test("idle에서 호출어 없는 말은 무시하고, 최종 결과에 호출어+질문이 한꺼번에 오면 바로 제출한다", () => {
  assert.deepStrictEqual(wakeStep("idle", "민원이 왜 늘었어", true), { kind: "ignore" })
  assert.deepStrictEqual(wakeStep("idle", "지니님, 상습격자 몇 곳이야", true), { kind: "submit", text: "상습격자 몇 곳이야" })
  assert.deepStrictEqual(wakeStep("idle", "지니", true), { kind: "wake", heard: "" })
})

test("\"지니\"와 \"지니야\" 둘 다 호출어다. 받아쓰기 변형(진이야·찌니야)도 잡는다", () => {
  assert.deepStrictEqual(wakeStep("idle", "지니 민원이 왜 늘었어", true), { kind: "submit", text: "민원이 왜 늘었어" })
  assert.deepStrictEqual(wakeStep("idle", "진이야 상습격자 몇 곳이야", true), { kind: "submit", text: "상습격자 몇 곳이야" })
  assert.deepStrictEqual(wakeStep("idle", "찌니야", false), { kind: "wake", heard: "" })
  assert.deepStrictEqual(wakeStep("idle", "지니야?", true), { kind: "wake", heard: "" })
})

test("서술어 끝의 \"-지니\"(많아지니까·빠지니)는 호출어가 아니다", () => {
  assert.deepStrictEqual(wakeStep("idle", "민원이 많아지니까 어떻게 해", true), { kind: "ignore" })
  assert.deepStrictEqual(wakeStep("idle", "과태료가 빠지니 이상해", true), { kind: "ignore" })
  assert.deepStrictEqual(wakeStep("idle", "사진이야", true), { kind: "ignore" })
  // 깨어 있는 동안 질문 속 "-지니"도 지우지 않는다
  assert.deepStrictEqual(wakeStep("awake", "민원이 많아지니까 어떻게 해", true), { kind: "submit", text: "민원이 많아지니까 어떻게 해" })
})

test("2026-09-22 감도 보강 변형(지니여·지니예·진희야·지니이)도 호출어다. \"사진이야\"는 여전히 아니다", () => {
  assert.deepStrictEqual(wakeStep("idle", "지니여 상습격자 몇 곳이야", true), { kind: "submit", text: "상습격자 몇 곳이야" })
  assert.deepStrictEqual(wakeStep("idle", "진희야", false), { kind: "wake", heard: "" })
  assert.deepStrictEqual(wakeStep("idle", "지니이 민원 왜 늘었어", true), { kind: "submit", text: "민원 왜 늘었어" })
  assert.deepStrictEqual(wakeStep("idle", "사진이야", true), { kind: "ignore" })
})
