import assert from "node:assert/strict"
import test from "node:test"
import { cityCopy } from "../lib/crowd/crowd-metadata"
import { CITY_IDS, SPOT_COUNTS } from "../lib/crowd/cities"
import { citySubtitle, META, UI } from "../lib/crowd/i18n"
import { JEJU_SPOTS } from "../lib/crowd/jeju"
import { BUSAN_SPOTS } from "../lib/crowd/busan"
import { GANGWON_SPOTS } from "../lib/crowd/gangwon"
import { INCHEON_SPOTS } from "../lib/crowd/incheon"

const LANGS = ["ko", "en", "ja", "zh"] as const

test("SPOT_COUNTS는 정적 목록 길이와 일치한다", () => {
  assert.equal(SPOT_COUNTS.jeju, JEJU_SPOTS.length)
  assert.equal(SPOT_COUNTS.busan, BUSAN_SPOTS.length)
  assert.equal(SPOT_COUNTS.gangwon, GANGWON_SPOTS.length)
  assert.equal(SPOT_COUNTS.incheon, INCHEON_SPOTS.length)
  // 서울은 런타임 원천(RTD) — 목록이 없어 실측값으로 고정
  assert.equal(SPOT_COUNTS.seoul, 121)
})

test("서울 문안은 기존 META 그대로 (회귀 방지)", () => {
  for (const lang of LANGS) {
    const c = cityCopy(lang, "seoul")
    assert.equal(c.title, META[lang].title)
    assert.equal(c.description, META[lang].description)
    assert.equal(c.ogTitle, META[lang].ogTitle)
    assert.equal(c.ogDescription, META[lang].ogDescription)
  }
})

test("비서울 문안에 서울 전용 사실이 새지 않는다", () => {
  // 도시명만 치환하던 옛 방식이 남기던 거짓말들 — 지점수·서울 한정 서비스·서울 지명
  const SEOUL_ONLY = ["121", "따릉이", "명동", "Myeongdong", "明洞", "bike share", "シェアサイクル", "共享单车"]
  for (const lang of LANGS) {
    for (const city of CITY_IDS.filter((c) => c !== "seoul")) {
      const blob = Object.values(cityCopy(lang, city)).join(" ")
      for (const bad of SEOUL_ONLY) {
        assert.ok(!blob.includes(bad), `${lang}/${city} 문안에 "${bad}" 잔존: ${blob}`)
      }
      const names = UI[lang].cityNames
      assert.ok(!blob.includes(names.seoul), `${lang}/${city} 문안에 서울 표기 잔존: ${blob}`)
      assert.ok(blob.includes(names[city]), `${lang}/${city} 문안에 도시명 없음: ${blob}`)
      assert.ok(blob.includes(String(SPOT_COUNTS[city])), `${lang}/${city} 문안에 지점 수 없음: ${blob}`)
    }
  }
})

test("비서울 설명은 헤더 부제와 같은 문장 (원천별 세는 대상 유지)", () => {
  for (const lang of LANGS) {
    for (const city of CITY_IDS.filter((c) => c !== "seoul")) {
      assert.equal(cityCopy(lang, city).description, citySubtitle(UI[lang], city))
    }
  }
})

test("브랜드명(홈 화면 이름)은 도시를 따른다", () => {
  assert.equal(cityCopy("ko", "busan").brand, "부산 인파레이더")
  assert.equal(cityCopy("en", "busan").brand, "Busan Crowd Radar")
  assert.equal(cityCopy("en", "incheon").brand, "Incheon Airport Crowd Radar")
  assert.equal(cityCopy("ko", "seoul").brand, "서울 인파레이더")
})

test("citySubtitle: n 생략·0이면 도시별 기대 개수", () => {
  for (const city of CITY_IDS) {
    assert.equal(citySubtitle(UI.ko, city), citySubtitle(UI.ko, city, 0))
    assert.ok(citySubtitle(UI.ko, city).includes(String(SPOT_COUNTS[city])))
    assert.ok(citySubtitle(UI.ko, city, 7).includes("7"))
  }
})
