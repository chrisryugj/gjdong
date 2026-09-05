import { test } from "node:test"
import assert from "node:assert"
import { normalizeHistory } from "../lib/dumping/history"

const u = (text: string) => ({ role: "user" as const, text })
const m = (text: string) => ({ role: "model" as const, text })

test("보통 길이의 이력은 전부 유지된다. 후속 질문이 앞 대화를 잃지 않는다", () => {
  const h = normalizeHistory([u("중곡1동은 왜 높나?"), m("다가구·단독 밀집이 높습니다."), u("그 동은?"), m("1인세대 57.7%")])
  assert.strictEqual(h.length, 4)
})

test("user/model 교대·첫 턴 user·마지막 user 제거", () => {
  const h = normalizeHistory([m("인사"), u("a"), u("b"), m("x"), u("이번 질문")])
  assert.deepStrictEqual(h, [u("b"), m("x")])
})

test("글자 상한을 넘으면 앞부분만 버리고, 잘린 뒤 첫 턴이 model이면 그것도 버린다", () => {
  const long = "가".repeat(60)
  const h = normalizeHistory([u("q1"), m(long), u("q2"), m(long), u("q3"), m("short")], 130)
  // 뒤에서부터 short(5)+q3(2)+long(60)+q2(2)=69 … +long(60)=129 … +q1(2)=131>130 → q1 앞에서 컷 → 첫 턴 model(long) 제거
  assert.deepStrictEqual(h, [u("q2"), m(long), u("q3"), m("short")])
})
