import assert from "node:assert/strict"
import test from "node:test"
import { LANGS, trHour, trLevelMessages, trRange, UI } from "../lib/crowd/i18n"
import { SPOT_T } from "../lib/crowd/i18n-spots"

// i18n 분할(barrel) 후 사전 무결성 — 키셋 대칭과 번역 누락을 잡는다.

test("UI 사전: 4개 언어 키셋이 완전히 대칭이다", () => {
  const koKeys = Object.keys(UI.ko).sort()
  for (const { code } of LANGS) {
    assert.deepEqual(Object.keys(UI[code]).sort(), koKeys, `${code} 키셋이 ko와 다름`)
  }
})

test("명소명 사전: 전 항목이 [en, ja, zh] 3값 모두 비어있지 않다", () => {
  for (const [name, tuple] of Object.entries(SPOT_T)) {
    assert.equal(tuple.length, 3, `${name}: 3값이 아님`)
    tuple.forEach((v, i) => assert.ok(v.trim().length > 0, `${name}[${i}] 빈 번역`))
  }
  assert.ok(Object.keys(SPOT_T).length >= 200, "명소명 사전이 서울121+제주66+부산26+강원18+인천8보다 작다")
})

test('trHour: "현재"·"N시"·비정형 입력', () => {
  assert.equal(trHour("현재", "en"), "Now")
  assert.equal(trHour("18시", "en"), "18:00")
  assert.equal(trHour("18시", "ja"), "18時")
  assert.equal(trHour("18시", "zh"), "18时")
  assert.equal(trHour("현재", "ko"), "현재")
  assert.equal(trHour("이상한값", "en"), "이상한값") // 비정형은 원문 통과
})

test('trRange: "14,000~16,000명" 현지화', () => {
  assert.equal(trRange("14,000~16,000명", "ko"), "14,000~16,000명")
  assert.equal(trRange("14,000~16,000명", "en"), "14,000–16,000 people")
  assert.equal(trRange("14,000~16,000명", "ja"), "14,000–16,000人")
  assert.equal(trRange("", "en"), "")
})

test("trLevelMessages: ko는 원문 통과, 비ko는 단계별 캔드 문장 1개 (0단계=정보 없음 포함)", () => {
  const orig = ["원문 문장입니다."]
  assert.deepEqual(trLevelMessages(orig, 4, "ko"), orig)
  assert.equal(trLevelMessages(orig, 4, "en").length, 1)
  assert.equal(trLevelMessages(orig, 0, "ja").length, 1) // 등급 없음도 안내문이 사라지면 안 된다
  for (let lv = 0; lv <= 4; lv++) {
    for (const lang of ["en", "ja", "zh"] as const) {
      assert.ok(trLevelMessages(orig, lv, lang)[0].length > 0, `lv=${lv} ${lang} 캔드 문장 누락`)
    }
  }
})
