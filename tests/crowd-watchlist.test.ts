import assert from "node:assert/strict"
import test from "node:test"
import { parseSpotsParam, serializeSpotsParam, WATCH_MAX, watchStorageKey } from "../lib/crowd/watchlist"

test("parseSpotsParam: 공백 정리·중복 제거·상한 컷", () => {
  assert.deepEqual(parseSpotsParam("명동 관광특구, 광화문·덕수궁 ,명동 관광특구"), ["명동 관광특구", "광화문·덕수궁"])
  assert.deepEqual(parseSpotsParam(null), [])
  assert.deepEqual(parseSpotsParam(""), [])
  assert.deepEqual(parseSpotsParam(",,,"), [])
  const many = Array.from({ length: 20 }, (_, i) => `지점${i}`).join(",")
  assert.equal(parseSpotsParam(many).length, WATCH_MAX)
})

test("serializeSpotsParam ↔ parseSpotsParam 왕복", () => {
  const names = ["어린이대공원", "건대입구역", "뚝섬한강공원"]
  assert.deepEqual(parseSpotsParam(serializeSpotsParam(names)), names)
})

test("watchStorageKey: 도시별 분리", () => {
  assert.notEqual(watchStorageKey("seoul"), watchStorageKey("busan"))
})
