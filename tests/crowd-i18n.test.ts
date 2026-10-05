import assert from "node:assert/strict"
import test, { before } from "node:test"
import { LANGS, loadLang, trArrival, trHour, trLevelMessages, trRange, trSpot, UI } from "../lib/crowd/i18n"
import { SPOT_T } from "../lib/crowd/i18n-spots-data"
import { romanizeAddress, romanizePlace } from "../lib/crowd/romanize"
import { niceTicks } from "../lib/crowd/chart-axis"

// en·ja·zh 사전은 동적 로드 레지스트리 — 대칭 검사 전에 채운다
before(() => Promise.all(LANGS.map((l) => loadLang(l.code))))

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

test("동적 로드: 로드 후 UI[en]은 영어, 명소명도 번역된다", async () => {
  await loadLang("en")
  assert.equal(UI.en.title, "Seoul Crowd Radar")
  assert.equal(trSpot("강남역", "en"), "Gangnam Station")
  assert.equal(trSpot("강남역", "ko"), "강남역")
})

test("trLevelMessages: 부산·강원·인천은 등급 기준 고지를 번역한다 (인파 캔드 문장으로 덮지 않는다)", () => {
  const busan = ["부산은 인파 계측 원천이 없어 접근 도로·주차 혼잡 기준으로 보여드려요.", "지금 접근 도로 서행 · 주차 여유 수준이에요."]
  assert.deepEqual(trLevelMessages(busan, 2, "en", "busan"), [
    "Busan has no live crowd count, so this level reflects access-road and parking congestion.",
    "Right now — access roads: slow · parking: plenty of space.",
  ])
  assert.ok(!trLevelMessages(busan, 2, "en", "busan").join(" ").includes("lively"))
  for (const lang of ["ja", "zh"] as const) {
    const out = trLevelMessages(busan, 2, lang, "busan")
    assert.equal(out.length, 2)
    assert.ok(out.every((m) => !/[가-힣]/.test(m)), `${lang}: 한글 잔존 ${out}`)
  }
  const gwNone = ["이 지점은 주차·교차로 실시간 원천이 없어 혼잡 등급을 내지 않습니다. 아래 CCTV와 바다·날씨로 확인해주세요."]
  assert.match(trLevelMessages(gwNone, 0, "en", "gangwon")[0], /no level is given/)

  const ic = ["지금 대기 약 12분 · 줄 선 인원 1,234명이에요.", "입구별로는 동편 12분 · 서편 8분 수준이에요."]
  assert.deepEqual(trLevelMessages(ic, 3, "en", "incheon"), [
    "About 12 min wait right now · 1,234 people in line.",
    "By entrance: East 12 min · West 8 min.",
  ])
  assert.equal(trLevelMessages(["입구별로는 A입구 5분 · B입구 9분 수준이에요."], 2, "ja", "incheon")[0], "入口別：A入口 5分 · B入口 9分。")
  assert.equal(
    trLevelMessages(["지금은 운영하지 않는 출국장이에요. 운영 시간은 05:00~19:00입니다."], 0, "en", "incheon")[0],
    "This departure gate is closed right now. Hours: 05:00~19:00.",
  )
  // 패턴 밖 문장은 버리고 기준 설명을 앞에 둔다 — 고지가 사라지거나 한국어가 새지 않게
  const odd = trLevelMessages(["새로 생긴 문장이에요.", "지금 접근 도로 원활 수준이에요."], 1, "en", "busan")
  assert.match(odd[0], /access-road and parking/)
  assert.deepEqual(odd.slice(1), ["Right now — access roads: smooth."])
  // 인파 도시는 기존대로 캔드 문장 1개
  assert.equal(trLevelMessages(["원문"], 2, "en", "seoul").length, 1)
})

test("romanizePlace: 장소명 일반명사는 영어, 괄호 안 지명도 같은 규칙", () => {
  assert.equal(romanizePlace("대티터널(괴정동입출구)"), "Daeti Tunnel (Goejeong-dong Entrance)")
  assert.equal(romanizePlace("천마산터널(영도입구)"), "Cheonmasan Tunnel (Yeongdo Entrance)")
  assert.equal(romanizePlace("다대포해수욕장입구"), "Dadaepo Beach Entrance")
  assert.equal(romanizePlace("진구청 옥상"), "Jin-gu Office Rooftop")
  assert.equal(romanizePlace("강남역사거리"), "Gangnam Station Intersection")
  assert.equal(romanizePlace("NC백화점"), "NC Department Store")
  assert.equal(romanizePlace("보호구역"), "Bohoguyeok") // 구역·지역은 "역"이 아니다
  assert.equal(romanizePlace("해운대 앞"), "Haeundae front")
  // 주소용 로마자는 그대로
  assert.equal(romanizeAddress("당리동"), "Dangni-dong")
  assert.equal(romanizeAddress("자양2동"), "Jayang2-dong")
})

test("차트 Y축: 눈금은 1·2·5 간격, 단위는 축 최대값 하나로 (한 축에 8500과 1.7만이 섞이지 않는다)", () => {
  assert.deepEqual(niceTicks(33000), [0, 10000, 20000, 30000, 40000])
  assert.deepEqual(niceTicks(17000), [0, 5000, 10000, 15000, 20000])
  assert.deepEqual(niceTicks(0), [0])
  const ticks = niceTicks(33000)
  const top = ticks[ticks.length - 1]
  assert.deepEqual(ticks.map((v) => UI.ko.yAxisTen(v, top)), ["0", "1만", "2만", "3만", "4만"])
  assert.deepEqual(niceTicks(1700).map((v) => UI.en.yAxisTen(v, 2000)), ["0", "0.5k", "1k", "1.5k", "2k"])
  // 만 미만 축은 숫자 그대로
  assert.deepEqual(niceTicks(780).map((v) => UI.ko.yAxisTen(v, 800)), ["0", "200", "400", "600", "800"])
  // 어떤 최대값이든 만 단위 소수 한 자리가 정확히 떨어진다 (반올림 표기 금지)
  for (let max = 500; max < 200000; max += 777) {
    const tk = niceTicks(max)
    const t = tk[tk.length - 1]
    if (t < 10000) continue
    for (const v of tk) assert.equal((v / 1000) % 1, 0, `max=${max} 눈금 ${v}`)
  }
})

test("trArrival: 지하철 도착 안내 정형 문장 현지화 (통째 로마자 금지)", () => {
  assert.equal(trArrival("3분 10초 후 (선정릉)", "en"), "in 3m 10s (Seonjeongneung)")
  assert.equal(trArrival("45초 후 (선정릉)", "ja"), "45秒後 (Seonjeongneung)")
  assert.equal(trArrival("[5]번째 전역 (삼전)", "en"), "5 stops away (Samjeon)")
  assert.equal(trArrival("전역 도착", "en"), "Arriving · previous stn")
  assert.equal(trArrival("신논현 진입", "zh"), "Sinnonhyeon 进站")
  assert.equal(trArrival("3분 10초 후 (선정릉)", "ko"), "3분 10초 후 (선정릉)")
})
