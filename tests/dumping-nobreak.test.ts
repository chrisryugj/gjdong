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

test("nbParen은 긴 괄호(10자 초과)를 묶지 않는다. 묶은 덩어리가 줄보다 길면 글자 중간에서 쪼개졌다", () => {
  assert.strictEqual(nbParen("다국어 배출안내(화양동 외국인 19.4%)"), "다국어 배출안내(\u2060화양동 외국인 19.4%\u2060)")
  assert.strictEqual(nbParen("자원배분 논리 (통계 효과 근거 아님)", 12), "자원배분 논리 (\u2060통계\u00a0효과\u00a0근거\u00a0아님\u2060)")
})
