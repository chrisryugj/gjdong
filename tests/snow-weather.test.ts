import { test } from "node:test"
import assert from "node:assert"
import { weatherFx, weatherLabel, WEATHER_PREVIEW } from "../lib/snow/weather"

// 지도 날씨: 예보 WMO 코드 → 효과. 기상청 경로(0·2·3·61·68·71)와 Open-Meteo 경로(45·48·51~67·80~82·85·86·95~99) 둘 다
test("WMO 코드 → 눈·비·안개·없음", () => {
  assert.deepStrictEqual(weatherFx(0), { kind: "none", level: 0 })
  assert.deepStrictEqual(weatherFx(3), { kind: "none", level: 0 })
  assert.strictEqual(weatherFx(71).kind, "snow")
  assert.strictEqual(weatherFx(68).kind, "snow")
  assert.strictEqual(weatherFx(86).level, 0.9)
  assert.strictEqual(weatherFx(71, 3).level, 1)
  assert.strictEqual(weatherFx(61).kind, "rain")
  assert.strictEqual(weatherFx(51).level, 0.35)
  assert.strictEqual(weatherFx(95).level, 0.9)
  assert.strictEqual(weatherFx(45).kind, "fog")
  assert.deepStrictEqual(weatherFx(null), { kind: "none", level: 0 })
})

test("라벨과 미리보기 순환(실황 › 눈 › 비 › 안개)", () => {
  assert.strictEqual(weatherLabel(0), "맑음")
  assert.strictEqual(weatherLabel(71), "눈")
  assert.strictEqual(weatherLabel(999), "관측 없음")
  assert.deepStrictEqual(
    WEATHER_PREVIEW.map((w) => w.id),
    ["live", "snow", "rain", "fog"],
  )
  assert.strictEqual(WEATHER_PREVIEW[0].fx, null)
})
