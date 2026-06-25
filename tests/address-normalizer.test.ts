import assert from "node:assert/strict"
import test from "node:test"
import { isLikelyCopiedMapSnippet, normalizeAddressInput } from "../lib/utils/address-normalizer"

test("normalizes address blocks copied from map UIs", () => {
  const raw = [
    "도로명 서울특별시 광진구 아차산로 400",
    "지번 서울특별시 광진구 자양동 870",
    "우편번호 05026",
    "복사",
  ].join("\n")

  assert.equal(isLikelyCopiedMapSnippet(raw), true)
  assert.equal(normalizeAddressInput(raw), "서울특별시 광진구 아차산로 400")
})

test("keeps plain multi-line address input out of copied-snippet detection", () => {
  const raw = ["광진구 아차산로 400", "자양동 870"].join("\n")

  assert.equal(isLikelyCopiedMapSnippet(raw), false)
  assert.equal(normalizeAddressInput(raw), "광진구 아차산로 400")
})

test("does not treat one labeled line as a copied map snippet", () => {
  const raw = ["도로명 서울특별시 광진구 아차산로 400", "경기도 성남시 분당구 판교역로 235"].join("\n")

  assert.equal(isLikelyCopiedMapSnippet(raw), false)
})

test("removes copy labels and zero-width characters from single-line input", () => {
  assert.equal(normalizeAddressInput("\u200B지번 자양동 870 복사"), "자양동 870")
})
