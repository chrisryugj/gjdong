import { test } from "node:test"
import assert from "node:assert"
import { wakeStep } from "../lib/dumping/wake"

// 호출어 상태기계. 한 구간의 중간 결과 여러 번 + 최종 결과 한 번이라는 인식기 동작을 그대로 흉내 낸다
test("호출어와 질문을 한 번에 말하면 최종 결과에서 제출한다", () => {
  assert.deepStrictEqual(wakeStep("idle", "김주임", false), { kind: "wake", heard: "" })
  assert.deepStrictEqual(wakeStep("awake", "김주임 민원이", false), { kind: "hear", heard: "민원이" })
  assert.deepStrictEqual(wakeStep("awake", "김주임 민원이 왜 늘었어", true), { kind: "submit", text: "민원이 왜 늘었어" })
})

test("호출어만 부른 뒤 쉬었다 물어도 두 번째 구간에서 제출한다 (빈 최종 결과로 idle로 돌아가지 않는다)", () => {
  assert.deepStrictEqual(wakeStep("idle", "김 주임", false), { kind: "wake", heard: "" })
  assert.deepStrictEqual(wakeStep("awake", "김 주임", true), { kind: "hold" })
  assert.deepStrictEqual(wakeStep("awake", "수거 시간대", false), { kind: "hear", heard: "수거 시간대" })
  assert.deepStrictEqual(wakeStep("awake", "수거 시간대 조정 효과 있어", true), { kind: "submit", text: "수거 시간대 조정 효과 있어" })
})

test("idle에서 호출어 없는 말은 무시하고, 최종 결과에 호출어+질문이 한꺼번에 오면 바로 제출한다", () => {
  assert.deepStrictEqual(wakeStep("idle", "민원이 왜 늘었어", true), { kind: "ignore" })
  assert.deepStrictEqual(wakeStep("idle", "김주임님, 상습격자 몇 곳이야", true), { kind: "submit", text: "상습격자 몇 곳이야" })
  assert.deepStrictEqual(wakeStep("idle", "김주임", true), { kind: "wake", heard: "" })
})
