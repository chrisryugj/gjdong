import { test } from "node:test"
import assert from "node:assert"
import { nb, nbParen } from "../lib/dumping/nobreak"

test("nb는 괄호 안팎에 WORD JOINER만 넣는다", () => {
  assert.strictEqual(nb("2026년 (1~8월)"), "2026년 (⁠1~8월⁠)")
})

test("nbParen은 괄호 안 공백을 NBSP로 묶어 괄호 안에서 줄이 갈리지 않게 한다", () => {
  assert.strictEqual(nbParen("전입·임대차 시점 배출안내(1인세대 진입점)"), "전입·임대차 시점 배출안내(⁠1인세대 진입점⁠)")
  assert.strictEqual(nbParen("괄호 없음"), "괄호 없음")
})
