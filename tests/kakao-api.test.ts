import assert from "node:assert/strict"
import test from "node:test"
import { resolveAddress, resolveAddressStrict } from "../lib/utils/kakao-api"

const originalFetch = globalThis.fetch
const originalApiKey = process.env.KAKAO_REST_API_KEY

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  })

test.afterEach(() => {
  globalThis.fetch = originalFetch
  if (originalApiKey === undefined) {
    delete process.env.KAKAO_REST_API_KEY
  } else {
    process.env.KAKAO_REST_API_KEY = originalApiKey
  }
})

test("falls back to the original input when reverse geocoding is unavailable", async () => {
  process.env.KAKAO_REST_API_KEY = "test-key"

  let callCount = 0
  globalThis.fetch = (async () => {
    callCount += 1

    if (callCount === 1) {
      return jsonResponse({
        documents: [
          {
            x: "127.0845",
            y: "37.5384",
          },
        ],
      })
    }

    return jsonResponse({ documents: [] })
  }) as typeof fetch

  const result = await resolveAddress("서울시 테스트 123")

  assert.equal(result.fallback, true)
  assert.equal(result.display, "서울시 테스트 123")
  assert.equal(result.meta.source, "KAKAO")
  assert.equal(result.meta.lat, 37.5384)
  assert.equal(result.meta.lon, 127.0845)
  assert.match(result.message ?? "", /상세 주소/)
  assert.equal(callCount, 3)
})

// ── 2026-09-17 서울페이 가맹점 16,946건 실측 엣지케이스 ─────────────────────────────
// URL별 응답을 표로 두고 fetch를 흉내 낸다. 주소검색은 query 문자열로, 나머지는 엔드포인트로 분기.
type AddrDoc = Record<string, unknown>
function mockKakao(opts: {
  address?: Record<string, AddrDoc[]>
  keyword?: AddrDoc[]
  regionH?: string
  onQuery?: (q: string) => void
}) {
  process.env.KAKAO_REST_API_KEY = "test-key"
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = new URL(String(input))
    if (url.pathname.endsWith("/search/address.json")) {
      const q = url.searchParams.get("query") ?? ""
      opts.onQuery?.(q)
      return jsonResponse({ documents: opts.address?.[q] ?? [] })
    }
    if (url.pathname.endsWith("/search/keyword.json")) return jsonResponse({ documents: opts.keyword ?? [] })
    if (url.pathname.endsWith("/geo/coord2address.json")) {
      return jsonResponse({
        documents: [
          {
            road_address: { road_name: "능동로26길", main_building_no: "10", sub_building_no: "", zone_no: "05000" },
            address: { main_address_no: "1", sub_address_no: "2", zip_code: "" },
          },
        ],
      })
    }
    if (url.pathname.endsWith("/geo/coord2regioncode.json")) {
      return jsonResponse({
        documents: [
          { region_type: "B", region_1depth_name: "서울특별시", region_2depth_name: "광진구", region_3depth_name: "능동", code: "1121510300" },
          { region_type: "H", region_1depth_name: "서울특별시", region_2depth_name: "광진구", region_3depth_name: opts.regionH ?? "능동" },
        ],
      })
    }
    return jsonResponse({ documents: [] })
  }) as typeof fetch
}
const roadAddrDoc = (name: string): AddrDoc => ({ address_type: "ROAD_ADDR", address_name: name, x: "127.08", y: "37.55" })

test("strict: 층·호만 남아 도로명만 일치(ROAD)하면 partial로 표시한다", async () => {
  mockKakao({ address: { "서울 광진구 능동로26길": [{ address_type: "ROAD", address_name: "서울 광진구 능동로26길", x: "127.08", y: "37.55" }] } })
  const r = await resolveAddressStrict("서울 광진구 능동로26길 101호")
  assert.equal(r.partial, true)
  assert.equal(r.fallback, true)
  assert.match(r.message ?? "", /도로명만 일치/)
  assert.equal(r.meta.adminDong, "능동")
  assert.equal(r.meta.lat, 37.55)
})

test("strict: 구가 잘못 적힌 주소는 구를 빼고 다시 찾는다", async () => {
  const queries: string[] = []
  mockKakao({ address: { "서울 광나루로 614": [roadAddrDoc("서울 광진구 광나루로 614")] }, regionH: "구의3동", onQuery: (q) => queries.push(q) })
  const r = await resolveAddressStrict("서울 성동구 광나루로 614")
  assert.equal(r.fallback, undefined)
  assert.equal(r.meta.adminDong, "구의3동")
  assert.ok(queries.includes("서울 광나루로 614"))
})

test("strict: 없는 건물번호는 같은 홀짝 인접 번호로 추정하고 partial로 표시한다", async () => {
  mockKakao({ address: { "서울 광진구 광나루로 572": [roadAddrDoc("서울 광진구 광나루로 572")] }, regionH: "구의3동" })
  const r = await resolveAddressStrict("서울 광진구 광나루로 570, 대성제2주유소")
  assert.equal(r.partial, true)
  assert.match(r.message ?? "", /인접 번호\(서울 광진구 광나루로 572\)/)
  assert.equal(r.meta.adminDong, "구의3동")
})

test("strict: 아무것도 못 찾아도 주소에 적힌 폐지동으로 행정동은 채운다", async () => {
  mockKakao({})
  const r = await resolveAddressStrict("서울 광진구 노유동 36-505 유진슈퍼")
  assert.equal(r.fallback, true)
  assert.equal(r.partial, undefined)
  assert.equal(r.meta.adminDong, "자양4동")
  assert.match(r.message ?? "", /자양4동/)
})

test("resolveAddress: 상호 검색은 입력의 도로명·지점명과 맞는 결과를 고른다", async () => {
  mockKakao({
    keyword: [
      { place_name: "아이스크림스토리 중곡점", road_address_name: "서울 광진구 천호대로119길 23", address_name: "서울 광진구 중곡동 130-10", x: "127.086", y: "37.556" },
      { place_name: "아이스크림스토리 건대후문점", road_address_name: "서울 광진구 광나루로 370", address_name: "서울 광진구 화양동 116-2", x: "127.071", y: "37.548" },
    ],
    regionH: "화양동",
  })
  const r = await resolveAddress("서울 광진구 광나루로 아이스크림스토리 건대후문점")
  assert.equal(r.partial, undefined)
  assert.equal(r.meta.placeName, "아이스크림스토리 건대후문점")
  assert.equal(r.meta.lon, 127.071)
})

test("resolveAddress: 맞는 상호 결과가 없으면 첫 결과를 쓰되 partial로 표시한다", async () => {
  mockKakao({
    keyword: [{ place_name: "모텔골드", road_address_name: "서울 광진구 아차산로 385", address_name: "서울 광진구 구의동 246-45", x: "127.085", y: "37.537" }],
  })
  const r = await resolveAddress("서울 광진구 자양동 31 골드")
  assert.equal(r.partial, true)
  assert.match(r.message ?? "", /추정값/)
})
