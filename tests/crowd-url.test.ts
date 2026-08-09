import assert from "node:assert/strict"
import test from "node:test"
import { crowdPath, crowdStaticSlugs, parseCrowdPathname, parseCrowdSlug } from "../lib/crowd/crowd-url"
import { CITY_IDS } from "../lib/crowd/cities"

test("crowdPath: 기본값은 세그먼트에서 빠진다", () => {
  assert.equal(crowdPath("ko", "seoul"), "/crowd")
  assert.equal(crowdPath("ko", "busan"), "/crowd/busan")
  assert.equal(crowdPath("en", "seoul"), "/crowd/en")
  assert.equal(crowdPath("en", "busan"), "/crowd/en/busan")
})

test("crowdPath ↔ parseCrowdSlug 왕복 — 전 조합", () => {
  for (const lang of ["ko", "en", "ja", "zh"] as const) {
    for (const city of CITY_IDS) {
      const path = crowdPath(lang, city)
      const slug = path.split("/").filter(Boolean).slice(1)
      if (lang === "ko" && city === "seoul") {
        assert.equal(slug.length, 0, "정경로는 /crowd")
        continue
      }
      assert.deepEqual(parseCrowdSlug(slug), { lang, city })
    }
  }
})

test("parseCrowdSlug: 형태가 아니면 null (정적 404로 넘어간다)", () => {
  assert.equal(parseCrowdSlug(undefined), null)
  assert.equal(parseCrowdSlug([]), null)
  assert.equal(parseCrowdSlug(["report"]), null)
  assert.equal(parseCrowdSlug(["en", "en"]), null)
  assert.equal(parseCrowdSlug(["busan", "en"]), null, "순서는 lang/city 고정")
  assert.equal(parseCrowdSlug(["en", "busan", "extra"]), null)
  // 기본값 중복 경로는 거부 — 정경로가 이미 있으므로 같은 화면에 URL이 둘이 되면 안 된다
  assert.equal(parseCrowdSlug(["ko"]), null)
  assert.equal(parseCrowdSlug(["seoul"]), null)
  assert.equal(parseCrowdSlug(["ko", "busan"]), null)
  assert.equal(parseCrowdSlug(["en", "seoul"]), null)
})

test("crowdStaticSlugs: 19개(=4×5-1)이고 전부 유효·중복 없음", () => {
  const slugs = crowdStaticSlugs()
  assert.equal(slugs.length, 19)
  const seen = new Set<string>()
  for (const { slug } of slugs) {
    assert.ok(parseCrowdSlug(slug), `유효해야 함: ${slug.join("/")}`)
    seen.add(slug.join("/"))
  }
  assert.equal(seen.size, 19)
})

test("parseCrowdPathname: 경로에서 초기 언어·도시, 알 수 없으면 기본값", () => {
  assert.deepEqual(parseCrowdPathname("/crowd"), { lang: "ko", city: "seoul" })
  assert.deepEqual(parseCrowdPathname("/crowd/ja/jeju"), { lang: "ja", city: "jeju" })
  assert.deepEqual(parseCrowdPathname("/crowd/gangwon"), { lang: "ko", city: "gangwon" })
  assert.deepEqual(parseCrowdPathname("/crowd/report"), { lang: "ko", city: "seoul" })
  assert.deepEqual(parseCrowdPathname("/"), { lang: "ko", city: "seoul" })
})

test("lang 코드와 city id는 겹치지 않는다 — 한 세그먼트 해석의 전제", () => {
  for (const city of CITY_IDS) {
    assert.ok(!["ko", "en", "ja", "zh"].includes(city), `충돌: ${city}`)
  }
})
