import assert from "node:assert/strict"
import test from "node:test"
import { parseArrivals, parseBusDetail, parseBusRoutes, parseTaxiPage } from "../lib/crowd/incheon-airport"

// 인천공항 실황 보드 파서 특성화 — 픽스처는 2026-08-08 실측 응답 축약본.
// 핵심 계약: 코드셰어 본편 우선 · SSR 표 구조 변경 시 null(지어내지 않기) · 시간표 블록 수집.

// ── 도착편 (코드셰어 = masterflight 동일 행 반복, 본편은 fnumber===masterflight)
const arrRow = (over: Record<string, string>) => ({
  masterflight: "KE690",
  fnumber: "KE690",
  airlineNameKo: "대한항공",
  airportName1Ko: "프놈펜",
  airportName1En: "PHNOM PENH",
  airportName1Ja: "",
  airportName1Ch: "",
  stime: "08:00",
  etime: "08:00",
  stattxt: "도착",
  terminalId: "P03",
  exitnumber: "A",
  carousel: "8",
  ...over,
})

test("parseArrivals: 코드셰어 중복은 본편 1행으로, 본편이 뒤에 와도 이긴다", () => {
  const out = parseArrivals([
    arrRow({ fnumber: "AF9999", airlineNameKo: "에어 프랑스" }),
    arrRow({}),
    arrRow({ fnumber: "GA9998", airlineNameKo: "가루다" }),
  ])
  assert.equal(out.length, 1)
  assert.equal(out[0].airline, "대한항공")
  assert.equal(out[0].terminal, "2")
})

test("parseArrivals: etime 없으면 stime, 정렬은 변경 시각순, ja·zh 공란은 en 폴백", () => {
  const out = parseArrivals([
    arrRow({ masterflight: "OZ574", fnumber: "OZ574", stime: "09:00", etime: "" }),
    arrRow({ masterflight: "ZE582", fnumber: "ZE582", stime: "07:30", etime: "08:40", stattxt: "지연" }),
  ])
  assert.deepEqual(out.map((a) => a.flight), ["ZE582", "OZ574"])
  assert.equal(out[1].est, "09:00")
  assert.equal(out[0].from.ja, "PHNOM PENH")
})

// ── 택시 SSR 표 — T1 행은 <th>, T2 행은 <td>(실측), 요금표 머리글에 "제2 여객터미널</th>" 미끼 존재
const TAXI_HTML = `
<p> 마지막 업데이트: 2026.08.08 08:29:14 </p>
<tr> <th>제1 여객터미널</th> <td>대기 차량(대)</td> <td >92</td> <td>25</td> <td>25</td> </tr>
<thead><tr><th>제2 여객터미널</th> </tr></thead><tbody><tr><th>일반택시</th><td>서울: <strong>4,800</strong></td></tr></tbody>
<tr> <td>제2 여객터미널</td> <td>대기 차량(대)</td> <td>82</td> <td>23</td> <td>21</td> <td>28</td> <td>8</td> <td>19</td> </tr>`

test("parseTaxiPage: 터미널별 대기 대수와 갱신 시각", () => {
  const taxi = parseTaxiPage(TAXI_HTML)
  assert.ok(taxi)
  assert.equal(taxi.at, "2026.08.08 08:29:14")
  assert.deepEqual(taxi.t1, { normal: 92, deluxe: 25, jumbo: 25 })
  assert.equal(taxi.t2.seoul, 82)
  assert.equal(taxi.t2.outer, 28)
})

test("parseTaxiPage: 표 구조가 바뀌면 null — 부분 숫자로 지어내지 않는다", () => {
  assert.equal(parseTaxiPage("<table><tr><th>제1 여객터미널</th><td>92</td></tr></table>"), null)
})

// ── 버스 노선 목록·시간표
test("parseBusRoutes: data-id 앵커에서 노선 id·이름", () => {
  const routes = parseBusRoutes(`<li><a data-id="9118092491" href="javascript:getBusInfoDetail('9118092491');">6001(동대문)</a></li>
    <li><a data-id="7278090365" href="#">6002(청량리역)</a></li>`)
  assert.deepEqual(routes, [
    { id: "9118092491", name: "6001(동대문)" },
    { id: "7278090365", name: "6002(청량리역)" },
  ])
})

test("parseBusDetail: 첫차·막차·요금·운수사·시간표 블록 (운수사 뒤 &#47; 꼬리 제거)", () => {
  const html = `<div><h3>6004</h3>
    <th>첫차</th><td>T1 05:29</td><td>/</td><td>T2 05:39</td>
    <th>막차</th><td>T1 23:09</td><td>/</td><td>T2 22:49</td>
    <td>₩17,000</td><td>공항리무진(02-2664-9898) &#47; </td>
    <h4>버스&nbsp;시간표(T1/평일)</h4><ul><li>05:29</li><li>05:59</li><li>06:24</li></ul>
    <h4>버스&nbsp;시간표(T2/평일)</h4><ul><li>05:39</li><li>06:09</li></ul></div>`
  const d = parseBusDetail(html)
  assert.ok(d)
  assert.equal(d.first, "T1 05:29 / T2 05:39")
  assert.equal(d.last, "T1 23:09 / T2 22:49")
  assert.equal(d.fare, "₩17,000")
  assert.equal(d.company, "공항리무진(02-2664-9898)")
  assert.equal(d.tables.length, 2)
  assert.deepEqual(d.tables[0], { label: "T1/평일", times: ["05:29", "05:59", "06:24"] })
})
