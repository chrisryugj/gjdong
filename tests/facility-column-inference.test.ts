import assert from "node:assert/strict"
import test from "node:test"
import { parseFacilityTable, parseFacilityText } from "../lib/facility-column-inference"

test("parses serial, name, address, admin-dong columns in any order", () => {
  const parsed = parseFacilityTable([
    ["연번", "시설명", "주소", "행정동"],
    [1, "자양보건지소", "광진구 아차산로 400", "자양2동"],
  ])

  assert.equal(parsed.rows.length, 1)
  assert.deepEqual(parsed.rows[0], {
    address: "광진구 아차산로 400",
    name: "자양보건지소",
    category: "자양2동",
    serialNo: "1",
    filters: { 행정동: "자양2동" },
  })
})

test("uses facility type as category and keeps admin-dong as an extra filter", () => {
  const parsed = parseFacilityTable([
    ["시설명", "시설구분", "주소", "행정동"],
    ["구의어린이집", "어린이집", "광진구 구의동 123", "구의1동"],
  ])

  assert.equal(parsed.rows[0].address, "광진구 구의동 123")
  assert.equal(parsed.rows[0].name, "구의어린이집")
  assert.equal(parsed.rows[0].category, "어린이집")
  assert.deepEqual(parsed.rows[0].filters, { 시설구분: "어린이집", 행정동: "구의1동" })
})

test("ignores serial columns when address appears before name and category", () => {
  const parsed = parseFacilityTable([
    ["연번", "주소", "시설명", "시설구분"],
    [1, "광진구 능동로 209", "세종대학교", "교육시설"],
  ])

  assert.deepEqual(parsed.rows[0], {
    address: "광진구 능동로 209",
    name: "세종대학교",
    category: "교육시설",
    serialNo: "1",
    filters: { 시설구분: "교육시설" },
  })
})

test("parses pasted tabular text with headers", () => {
  const parsed = parseFacilityText(
    [
      "연번\t주소\t시설명\t시설구분",
      "1\t광진구 광나루로 350\t광나루안전체험관\t공공시설",
      "2\t광진구 아차산로 400\t자양보건지소\t보건소",
    ].join("\n"),
  )

  assert.equal(parsed.mapping.hasHeader, true)
  assert.equal(parsed.rows.length, 2)
  assert.equal(parsed.rows.some((row) => row.address === "주소" || row.name === "시설명"), false)
  assert.equal(parsed.rows[0].address, "광진구 광나루로 350")
  assert.equal(parsed.rows[0].name, "광나루안전체험관")
  assert.equal(parsed.rows[0].category, "공공시설")
  assert.equal(parsed.rows[0].serialNo, "1")
  assert.equal(parsed.rows[1].address, "광진구 아차산로 400")
  assert.equal(parsed.rows[1].name, "자양보건지소")
  assert.equal(parsed.rows[1].category, "보건소")
  assert.equal(parsed.rows[1].serialNo, "2")
})

test("leaves serial empty when no serial column exists", () => {
  const parsed = parseFacilityTable([
    ["시설명", "시설구분", "주소"],
    ["자양보건지소", "보건소", "광진구 아차산로 400"],
  ])

  assert.equal(parsed.mapping.serialIndex, -1)
  assert.equal(parsed.rows[0].serialNo, undefined)
})
