import { test } from "node:test"
import assert from "node:assert"
import { LAW_TEXTS, lawRefsIn } from "../lib/dumping/law"

// 법령 인용 문구 탐지. 담당 상세 문장을 그대로 넣어 세 인용이 잡히고, 조 번호 없는 "조례·시행규칙"은 안 잡힌다
test("담당 상세 문장에서 폐기물관리법 15조·조례 8·10조·조례 9조를 찾는다", () => {
  const s = "청소과: 배출 장소·시간과 보관 방법은 구청장이 정함(폐기물관리법 15조, 구 폐기물관리 조례 8·10조), 관리주체 지정도 조례·시행규칙 사항. 건축과: 조례 9조의 준공 전 보관시설 의무가 공동주택에만 있어"
  const cites = lawRefsIn(s).filter((p) => typeof p !== "string")
  assert.deepStrictEqual(
    cites.map((c) => [c.text, c.keys]),
    [
      ["폐기물관리법 15조", ["law-15"]],
      ["구 폐기물관리 조례 8·10조", ["ord-8", "ord-10"]],
      ["조례 9조", ["ord-9"]],
    ],
  )
  // 조각을 이어 붙이면 원문 그대로
  assert.strictEqual(lawRefsIn(s).map((p) => (typeof p === "string" ? p : p.text)).join(""), s)
})

test("원문 4건은 제목·본문·공개 주소를 갖고, 조례 9조는 공동주택·준공 전 문구를 담는다", () => {
  for (const [k, p] of Object.entries(LAW_TEXTS)) {
    assert.ok(p.title && p.text.length > 50 && p.url.startsWith("https://www.law.go.kr/"), k)
  }
  assert.match(LAW_TEXTS["ord-9"].text, /공동주택의 생활폐기물 배출자/)
  assert.match(LAW_TEXTS["ord-9"].text, /준공 전/)
  assert.match(LAW_TEXTS["law-15"].text, /조례로 정하는 바에 따라/)
})
