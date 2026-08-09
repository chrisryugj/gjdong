import assert from "node:assert/strict"
import test from "node:test"
import {
  joinStringFields,
  matchRegion,
  parseEmergencyMsgs,
  parseNotificationPage,
  parseWarnings,
  splitRegions,
  toDisasters,
} from "../lib/crowd/safety"

// 기상특보 현황 파서 — 라이브 실측(2026-08-09) 전국 통보문 t6 형식 기준.
// stnId는 필터가 아니다(전 관서 동일 응답) — 지역 텍스트의 시도 세그먼트 매칭이 전부다.

// 실측 t6 축약 픽스처 — 시도 나열 + 괄호 열거 + "제외" 괄호 + 해상 구역이 모두 섞인다
const LIVE_T6 = [
  "o 강풍주의보 : 전라남도(거문도.초도, 완도여서도), 제주도(제주도산지, 추자도, 제주시동부), 울릉도.독도",
  "o 풍랑경보 : 남해동부바깥먼바다, 제주도남쪽바깥먼바다",
  "o 폭염경보 : 경기도(동두천, 연천 제외), 강원도(영월, 횡성, 원주), 서울, 인천, 대전",
  "o 폭염주의보 : 강원도(철원, 화천, 평창평지, 홍천평지), 경상남도(양산, 통영, 고성, 남해), 제주도(제주도산지, 추자도 제외), 대구, 부산",
].join("\r\n")

test("splitRegions: 괄호 안 콤마를 지키며 최상위만 분리한다", () => {
  assert.deepEqual(splitRegions("강원도(영월, 횡성, 원주), 서울, 제주도(추자도 제외)"), [
    "강원도(영월, 횡성, 원주)",
    "서울",
    "제주도(추자도 제외)",
  ])
})

test("parseWarnings: 서울 — 폭염경보만 (풍랑·강풍 해상/타지역 제외)", () => {
  const rows = parseWarnings(LIVE_T6, { prefix: "서울" })
  assert.deepEqual(rows, [{ type: "폭염", step: "경보", region: "서울" }])
})

test("parseWarnings: 부산 — 폭염주의보", () => {
  const rows = parseWarnings(LIVE_T6, { prefix: "부산" })
  assert.deepEqual(rows, [{ type: "폭염", step: "주의보", region: "부산" }])
})

test("parseWarnings: 제주 — 강풍주의보(열거)·폭염주의보(제외형)는 잡고 먼바다 풍랑은 버린다", () => {
  const rows = parseWarnings(LIVE_T6, { prefix: "제주" })
  assert.deepEqual(
    rows.map((r) => `${r.type}${r.step}`),
    ["강풍주의보", "폭염주의보"],
  )
})

test("parseWarnings: 강원 동해안 — 영서만 열거된 폭염경보는 오탐하지 않고, 평창평지 열거는 잡는다", () => {
  const matcher = { prefix: "강원", inner: ["강릉", "속초", "동해", "삼척", "양양", "고성", "평창"] }
  const rows = parseWarnings(LIVE_T6, matcher)
  // 폭염경보의 "강원도(영월, 횡성, 원주)"는 동해안 벨트 무관 — 경남 고성(경상남도 세그먼트)도 오탐 금지
  assert.deepEqual(
    rows.map((r) => `${r.type}${r.step}`),
    ["폭염주의보"],
  )
  assert.equal(rows[0].region, "강원도(철원, 화천, 평창평지, 홍천평지)")
})

test("matchRegion: 먼바다 세그먼트·타 시도 프리픽스는 거른다", () => {
  assert.equal(matchRegion("제주도남쪽바깥먼바다", { prefix: "제주" }), false)
  assert.equal(matchRegion("경상남도(고성, 남해)", { prefix: "강원", inner: ["고성"] }), false)
  assert.equal(matchRegion("강원도", { prefix: "강원", inner: ["강릉"] }), true)
})

test("parseWarnings: 해제 안내 줄·지역 없는 줄·같은 특보 반복은 버린다", () => {
  assert.equal(parseWarnings("o 폭염경보 해제 : 서울", { prefix: "서울" }).length, 0)
  assert.equal(parseWarnings("폭염경보 발효 중", { prefix: "서울" }).length, 0)
  assert.equal(parseWarnings("o 폭염경보 : 서울\no 폭염경보 : 서울 전역", { prefix: "서울" }).length, 1)
})

test("parseWarnings: 지역이 80자를 넘으면 말줄임", () => {
  const long = `o 폭염경보 : 서울${"룰".repeat(100)}`
  const rows = parseWarnings(long, { prefix: "서울" })
  assert.equal(rows[0].region.length, 80)
  assert.ok(rows[0].region.endsWith("…"))
})

test("joinStringFields: 문자열 필드만 이어붙인다 (숫자·null 무시)", () => {
  assert.equal(joinStringFields({ t1: "a", n: 3, x: null, t6: "b" }), "a\nb")
  assert.equal(joinStringFields(null), "")
})

// 행안부 재난문자 파서

const MSG = (over: Record<string, string>) => ({
  MSG_CN: "호우로 하천변 접근을 자제하세요",
  RCPTN_RGN_NM: "부산광역시 전체",
  CRT_DT: "2026/08/09 10:00:00",
  EMRG_STEP_NM: "안전안내",
  DST_SE_NM: "호우",
  ...over,
})

test("parseEmergencyMsgs: 지역 필터·내용 중복 제거·최근순 정렬", () => {
  const rows = parseEmergencyMsgs(
    [
      MSG({}),
      MSG({ MSG_CN: "호우로 하천변 접근을 자제하세요" }), // 중복
      MSG({ MSG_CN: "다른 안내", CRT_DT: "2026/08/09 12:00:00" }),
      MSG({ MSG_CN: "타지역 안내", RCPTN_RGN_NM: "울산광역시 전체" }),
    ],
    ["부산광역시"],
  )
  assert.equal(rows.length, 2)
  assert.equal(rows[0].content, "다른 안내") // 최근 발송이 먼저
})

test("parseEmergencyMsgs: 인천공항은 시 전체·중구만 (옹진군 등 소음 차단)", () => {
  const keywords = ["인천광역시 전체", "중구"]
  const rows = parseEmergencyMsgs(
    [
      MSG({ MSG_CN: "a", RCPTN_RGN_NM: "인천광역시 전체" }),
      MSG({ MSG_CN: "b", RCPTN_RGN_NM: "인천광역시 중구" }),
      MSG({ MSG_CN: "c", RCPTN_RGN_NM: "인천광역시 옹진군" }),
    ],
    keywords,
  )
  assert.deepEqual(
    rows.map((r) => r.content).sort(),
    ["a", "b"],
  )
})

test("parseEmergencyMsgs: 비배열·빈 본문은 빈 배열", () => {
  assert.deepEqual(parseEmergencyMsgs(null, ["서울특별시"]), [])
  assert.deepEqual(parseEmergencyMsgs([MSG({ MSG_CN: " " })], ["부산광역시"]), [])
})

// ── safetydata 알림 목록 SSR 파서 (무키 1차 원천) — 실측 HTML 행 구조 축약 픽스처

const SDN_ROW = (sn: number, content: string, at: string) => `
  <tr>
    <td class="cell-no">${sn}</td>
    <td class="board-list-new cell-subject"><a class="tableHover"
      href="/disaster-data/disasterNotificationDetail?sn=${sn}">${content}</a><i class="ico ico-new">N</i></td>
    <td class="cell-date">${at}</td>
  </tr>`

const SDN_HTML =
  SDN_ROW(1, "부산 폭염주의보 발효 중 ▲야외활동 자제[부산시]", "2026/08/09 11:02:31") +
  SDN_ROW(2, "위험물 누출 사고 발생. 외출 자제.[부산광역시]", "2026/08/08 20:08:38") +
  SDN_ROW(3, "단수 발생. 복구작업중. [사상구]", "2026/08/09 09:58:18")

test("parseNotificationPage: 내용·등록일 쌍을 뽑는다 (구조 불일치는 빈 배열)", () => {
  const rows = parseNotificationPage(SDN_HTML)
  assert.equal(rows.length, 3)
  assert.equal(rows[0].content, "부산 폭염주의보 발효 중 ▲야외활동 자제[부산시]")
  assert.equal(rows[0].at, "2026/08/09 11:02:31")
  assert.deepEqual(parseNotificationPage("<html>개편된 페이지</html>"), [])
})

test("toDisasters: 당일만 남기고 본문의 재난어를 유형으로 (없으면 '재난문자')", () => {
  const out = toDisasters(parseNotificationPage(SDN_HTML), "2026/08/09", "busan")
  assert.equal(out.length, 2) // 08/08 사고 문자는 제외
  assert.equal(out[0].type, "폭염")
  assert.equal(out[1].type, "재난문자") // 단수는 유형 사전에 없음 — 지어내지 않는다
  assert.equal(out[1].step, "")
})

test("toDisasters: 인천은 공항 무관 발신 구를 [발신기관] 정확 일치로 거른다", () => {
  const rows = [
    { content: "무더위 유의 [인천광역시]", at: "2026/08/09 10:00:00" },
    { content: "행사 안내 [연수구]", at: "2026/08/09 10:01:00" },
    { content: "안개 주의 [영종구]", at: "2026/08/09 10:02:00" },
  ]
  const out = toDisasters(rows, "2026/08/09", "incheon")
  assert.deepEqual(
    out.map((d) => d.content),
    ["무더위 유의 [인천광역시]", "안개 주의 [영종구]"],
  )
})
