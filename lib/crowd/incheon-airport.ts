// 인천공항 실황 보드 — 도착편·택시 대기·공항버스 (공항 홈페이지 내부 무키 원천, 서버 전용)
// 출국장 대기·주차는 incheon.ts가 담당하고, 여기는 도시 단위 부가 실황만 모은다.
//
// 데이터 계약 (2026-08-08 실측):
// - 도착편: POST /arr/ap_ko/getArrPasSchList.do (form) → scheduleList[70±].
//   코드셰어가 편마다 중복 행(masterflight 동일·항공사만 다름) — fnumber===masterflight 행이 운항 본편.
//   stime/etime "HH:MM", terminalId P01=T1·P02=탑승동·P03=T2, exitnumber=입국장 문, carousel=수하물,
//   stattxt: 도착/착륙/지연/""(예정). layout 파라미터는 hex("ap_ko@@872@@fnct2") 상수.
// - 택시 대기: /ap_ko/987/subview.do SSR 표 2장(T1 일반·모범·대형 / T2 서울·인천·경기·시계외·모범·대형)
//   + "마지막 업데이트: YYYY.MM.DD HH:mm:ss".
// - 버스: POST /bus/ap_ko/busRouteList.do (routeArea 1서울 2경기 3인천 4강원 5충청 7전라 6경상)
//   → <a data-id="routeId">6001(동대문)</a> 목록. POST /bus/ap_ko/busInfoDetail.do (routeId)
//   → 첫차/막차(T1·T2)·요금·운수사·"버스 시간표(T1/평일)" 블록별 시각 목록. 시간표는 사실상 정적 — 길게 캐시.

import { createSnapshot } from "@/lib/crowd/adapter-kit"

const UA = { "user-agent": "Mozilla/5.0", referer: "https://www.airport.kr/ap_ko/index.do" }
const FORM = { ...UA, "content-type": "application/x-www-form-urlencoded; charset=UTF-8" }

// ── 도착편 ──────────────────────────────────────────────────────

export interface AirportArrival {
  flight: string
  airline: string
  from: { ko: string; en: string; ja: string; zh: string }
  sched: string // "08:10"
  est: string // 변경 시각 (지연 시 sched와 다름)
  status: string // 도착/착륙/지연/"" — 표기는 클라이언트 사전
  terminal: "1" | "2" | "C" // C=탑승동
  exit: string // 입국장 문 (T1만 제공)
  belt: string // 수하물 수취대
}

const TERMINAL_BY_P: Record<string, "1" | "2" | "C"> = { P01: "1", P02: "C", P03: "2" }

/** 원천 행 → 도착편 목록 (코드셰어 중복 제거·시각순) — 순수 함수, 테스트 대상 */
export function parseArrivals(rows: Array<Record<string, string>>): AirportArrival[] {
  // 코드셰어는 편마다 항공사만 다른 중복 행 — 본편(fnumber===masterflight) 우선, 없으면 첫 행
  const byMaster = new Map<string, Record<string, string>>()
  for (const r of rows) {
    const key = r.masterflight || r.fnumber
    if (!key) continue
    const prev = byMaster.get(key)
    if (!prev || r.fnumber === r.masterflight) byMaster.set(key, r)
  }
  return Array.from(byMaster.values())
    .map((r) => ({
      flight: r.masterflight || r.fnumber || "",
      airline: r.airlineNameKo ?? "",
      from: {
        ko: r.airportName1Ko ?? "",
        en: r.airportName1En ?? "",
        ja: r.airportName1Ja || r.airportName1En || "",
        zh: r.airportName1Ch || r.airportName1En || "",
      },
      sched: r.stime ?? "",
      est: r.etime || r.stime || "",
      status: r.stattxt ?? "",
      terminal: TERMINAL_BY_P[r.terminalId ?? ""] ?? "1",
      exit: r.exitnumber ?? "",
      belt: r.carousel ?? "",
    }))
    .sort((a, b) => a.est.localeCompare(b.est))
}

async function fetchArrivals(): Promise<AirportArrival[]> {
  const kst = new Date(Date.now() + 9 * 3600 * 1000)
  const ymd = kst.toISOString().slice(0, 10).replace(/-/g, "")
  const hh = kst.getUTCHours()
  const hhmm = `${String(hh).padStart(2, "0")}${String(kst.getUTCMinutes()).padStart(2, "0")}`
  const endH = String(Math.min(hh + 2, 23)).padStart(2, "0")
  const body = new URLSearchParams({
    intg: "",
    keyWord: "",
    curDate: ymd,
    startTime: `${String(hh).padStart(2, "0")}00`,
    airPort: "",
    endTime: `${endH}59`,
    todayDate: ymd,
    tomorrowDate: ymd,
    todayTime: hhmm,
    curStime: `${String(hh).padStart(2, "0")}00`,
    curEtime: `${endH}59`,
    layout: "61705f6b6f40403837324040666e637432",
    siteId: "ap_ko",
  })
  const res = await fetch("https://www.airport.kr/arr/ap_ko/getArrPasSchList.do", {
    method: "POST",
    headers: FORM,
    body: body.toString(),
    cache: "no-store",
    signal: AbortSignal.timeout(12000),
  })
  if (!res.ok) return []
  const d = (await res.json()) as { scheduleList?: Array<Record<string, string>> }
  return parseArrivals(d.scheduleList ?? [])
}

// ── 택시 대기 ───────────────────────────────────────────────────

export interface AirportTaxi {
  t1: { normal: number; deluxe: number; jumbo: number }
  t2: { seoul: number; incheon: number; gyeonggi: number; outer: number; deluxe: number; jumbo: number }
  at: string // "2026.08.08 08:29:14"
}

/** 택시 SSR 표 파싱 — 표 구조가 바뀌면 null (지어내지 않는다).
 *  T1 행은 <th>, T2 행은 <td>이고 요금표 머리글에 같은 문구의 미끼가 있다 —
 *  "대기 차량(대)" 셀이 바로 뒤따르는 행만이 대기 현황표다. */
export function parseTaxiPage(html: string): AirportTaxi | null {
  const flat = html.replace(/\s+/g, " ")
  const at = /마지막 업데이트:\s*([\d.]+ [\d:]+)/.exec(flat)?.[1] ?? ""
  const nums = (seg: string): number[] =>
    Array.from(seg.matchAll(/<td[^>]*>\s*([\d,]+)\s*<\/td>/g)).map((m) => Number.parseInt(m[1].replace(/,/g, ""), 10))
  const rowOf = (n: "1" | "2"): string =>
    new RegExp(`제${n} 여객터미널</t[dh]>\\s*<td[^>]*>\\s*대기 차량\\(대\\)\\s*</td>(.*?)</tr>`).exec(flat)?.[1] ?? ""
  const a = nums(rowOf("1"))
  const b = nums(rowOf("2"))
  if (a.length < 3 || b.length < 6) return null
  return {
    t1: { normal: a[0], deluxe: a[1], jumbo: a[2] },
    t2: { seoul: b[0], incheon: b[1], gyeonggi: b[2], outer: b[3], deluxe: b[4], jumbo: b[5] },
    at,
  }
}

async function fetchTaxi(): Promise<AirportTaxi | null> {
  try {
    const res = await fetch("https://www.airport.kr/ap_ko/987/subview.do", {
      headers: UA,
      cache: "no-store",
      signal: AbortSignal.timeout(12000),
    })
    if (!res.ok) return null
    return parseTaxiPage(await res.text())
  } catch {
    return null
  }
}

// ── 보드 스냅샷 (도착편+택시, 2분) — 주차는 라우트가 incheon.ts fetchParking과 합성 ──

export interface AirportBoardData {
  arrivals: AirportArrival[]
  taxi: AirportTaxi | null
}

const boardSnapshot = createSnapshot(120_000, async (): Promise<AirportBoardData> => {
  const [arrivals, taxi] = await Promise.all([fetchArrivals().catch(() => []), fetchTaxi()])
  return { arrivals, taxi }
})

export const fetchAirportBoard = () => boardSnapshot.get()

// ── 입국장별 예상 인원 (공항 예상 혼잡도, 매일 17시 갱신 예고 자료) ──────────
// POST /pni/ap_ko/statisticPredictCrowdedOfInout.do — layout=hex("ap_ko@@883@@fnct1").
// 표: thead 2행째가 입국장 그룹(첫 "합계" 전까지) → 출국장 열. tbody 행 = "HH~HH시" + 숫자들.

export interface InoutForecast {
  labels: string[] // 입국장 그룹 ["A,B","C","D","E,F"](T1) — 터미널마다 다르다
  rows: Array<{ hour: string; counts: number[]; total: number }>
}

export function parseInoutForecast(html: string): InoutForecast | null {
  const flat = html.replace(/\s+/g, " ")
  const head = /<thead>\s*<tr>.*?<\/tr>\s*<tr>(.*?)<\/tr>\s*<\/thead>/.exec(flat)?.[1] ?? ""
  const labels: string[] = []
  for (const m of head.matchAll(/<th[^>]*>([^<]+)<\/th>/g)) labels.push(m[1].trim())
  const nGroups = labels.indexOf("합계")
  if (nGroups <= 0) return null
  const rows: InoutForecast["rows"] = []
  for (const m of flat.matchAll(/<th>(\d{2}~\d{2}시)<\/th>((?:\s*<td[^>]*>[\d,]*<\/td>)+)/g)) {
    const nums = Array.from(m[2].matchAll(/<td[^>]*>([\d,]*)<\/td>/g)).map((x) =>
      Number.parseInt(x[1].replace(/,/g, "") || "0", 10),
    )
    if (nums.length <= nGroups) continue
    rows.push({ hour: m[1], counts: nums.slice(0, nGroups), total: nums[nGroups] })
  }
  return rows.length > 0 ? { labels: labels.slice(0, nGroups), rows } : null
}

async function fetchInoutOne(selTm: "T1" | "T2"): Promise<InoutForecast | null> {
  const kst = new Date(Date.now() + 9 * 3600 * 1000)
  const pday = kst.toISOString().slice(0, 10).replace(/-/g, "")
  try {
    const res = await fetch("https://www.airport.kr/pni/ap_ko/statisticPredictCrowdedOfInout.do", {
      method: "POST",
      headers: { ...FORM, referer: "https://www.airport.kr/ap_ko/883/subview.do" },
      body: new URLSearchParams({ selTm, pday, layout: "61705f6b6f40403838334040666e637431", siteId: "ap_ko" }).toString(),
      cache: "no-store",
      signal: AbortSignal.timeout(12000),
    })
    if (!res.ok) return null
    return parseInoutForecast(await res.text())
  } catch {
    return null
  }
}

// 예고 자료는 하루 1회(17시) 갱신 — 1시간 캐시
const inoutSnapshot = createSnapshot(3600_000, async () => {
  const [t1, t2] = await Promise.all([fetchInoutOne("T1"), fetchInoutOne("T2")])
  return { t1, t2 }
})

export const fetchInoutForecast = () => inoutSnapshot.get()

// ── 공항철도 시각표 (airportrailroad.com SSR — 공식 API 없음, 일 1회 파싱) ────
// /train/normal/info/{100|110}/0 페이지에 평일·휴일 표가 함께 SSR된다.
// 분 셀 span의 data-id: A010=직통열차 · B010=일반열차(서울역행) — DMC행(B040)·검암행(B070)은 제외.

export interface ArexDayTimes {
  express: string[] // 직통 "HH:MM" 정렬
  all: string[] // 일반열차(서울역행)
}
export interface ArexStation {
  weekday: ArexDayTimes
  holiday: ArexDayTimes
}

export function parseArexStation(html: string): ArexStation | null {
  const dayOf = (kind: "평일" | "휴일"): ArexDayTimes | null => {
    const i = html.indexOf(`열차시각표(${kind})_서울역 방면`)
    if (i < 0) return null
    const seg = html.slice(i, html.indexOf("</table>", i))
    const out: ArexDayTimes = { express: [], all: [] }
    for (const row of seg.matchAll(/<td class="pcBlind">(\d{1,2})<\/td>([\s\S]*?)<\/tr>/g)) {
      const hour = row[1].padStart(2, "0")
      // 원천 HTML은 속성마다 줄바꿈+깊은 들여쓰기라 여는 태그 닫힘(>)까지 수백 자를 허용해야 한다
      for (const sp of row[2].matchAll(/data-id="([AB]010)"[\s\S]{0,400}?>\s*(\d{1,2})\s*<\/span>/g)) {
        const t = `${hour}:${sp[2].padStart(2, "0")}`
        if (sp[1] === "A010") out.express.push(t)
        else out.all.push(t)
      }
    }
    out.express.sort()
    out.all.sort()
    return out.all.length > 0 || out.express.length > 0 ? out : null
  }
  const weekday = dayOf("평일")
  const holiday = dayOf("휴일")
  return weekday && holiday ? { weekday, holiday } : null
}

async function fetchArexOne(stn: "100" | "110"): Promise<ArexStation | null> {
  try {
    const res = await fetch(`https://www.airportrailroad.com/train/normal/info/${stn}/0`, {
      headers: { "user-agent": "Mozilla/5.0" },
      cache: "no-store",
      signal: AbortSignal.timeout(15000),
    })
    if (!res.ok) return null
    return parseArexStation(await res.text())
  } catch {
    return null
  }
}

// 시각표는 개정 전까지 고정 — 24시간 캐시
const arexSnapshot = createSnapshot(24 * 3600_000, async () => {
  const [t1, t2] = await Promise.all([fetchArexOne("100"), fetchArexOne("110")])
  return { t1, t2 }
})

export const fetchArexTimetables = () => arexSnapshot.get()

// ── 공항버스 ────────────────────────────────────────────────────

export const BUS_AREAS = [
  { id: "1", nameKo: "서울" },
  { id: "2", nameKo: "경기" },
  { id: "3", nameKo: "인천" },
  { id: "4", nameKo: "강원" },
  { id: "5", nameKo: "충청" },
  { id: "7", nameKo: "전라" },
  { id: "6", nameKo: "경상" },
] as const

export interface BusRoute {
  id: string
  name: string // "6001(동대문)"
}

// 노선명은 싣지 않는다 — 상세 HTML의 제목은 클라이언트 jQuery가 채우는 빈 껍데기라
// 본문에서 집으면 엉뚱한 번호가 나온다(실측: 6001 조회에 6004). 표시는 호출부가 목록의 이름을 쓴다.
export interface BusDetail {
  first: string // "T1 05:29 / T2 05:39"
  last: string
  fare: string // "₩17,000"
  company: string // "공항리무진(02-2664-9898)"
  tables: Array<{ label: string; times: string[] }> // "T1/평일" 등
}

export function parseBusRoutes(html: string): BusRoute[] {
  const out: BusRoute[] = []
  const re = /<a data-id="(\d+)"[^>]*>\s*([^<]+?)\s*<\/a>/g
  const flat = html.replace(/\s+/g, " ")
  for (let m = re.exec(flat); m; m = re.exec(flat)) out.push({ id: m[1], name: m[2] })
  return out
}

export function parseBusDetail(html: string): BusDetail | null {
  const noScript = html.replace(/<script[\s\S]*?<\/script>/g, " ").replace(/<style[\s\S]*?<\/style>/g, " ")
  const flat = noScript
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(Number(n)))
    .replace(/\s+/g, " ")
  const text = flat.replace(/<[^>]+>/g, "\n")
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
  if (lines.length === 0) return null

  const grab = (label: string): string => {
    const i = lines.indexOf(label)
    if (i < 0) return ""
    // "첫차" 다음 줄들이 "T1 05:29" "/" "T2 05:39" 식으로 흩어져 있다 — 다음 라벨 전까지 이어붙인다
    const stop = new Set(["첫차", "막차", "홈페이지", "노선 시간표"])
    const parts: string[] = []
    for (let j = i + 1; j < lines.length && !stop.has(lines[j]) && !lines[j].startsWith("₩") && parts.length < 4; j++)
      parts.push(lines[j])
    return parts.join(" ").replace(/\s*\/\s*/g, " / ")
  }
  const fare = lines.find((l) => l.startsWith("₩")) ?? ""
  const company = (lines.find((l) => /\(\d{2,4}-\d{3,4}-\d{4}\)/.test(l)) ?? "").replace(/\s*\/\s*$/, "")

  // "버스 시간표(T1/평일)" 헤더 뒤로 이어지는 HH:MM 목록을 블록으로 수집
  const tables: Array<{ label: string; times: string[] }> = []
  let cur: { label: string; times: string[] } | null = null
  for (const l of lines) {
    const head = /^버스 시간표\(([^)]+)\)/.exec(l)
    if (head) {
      cur = { label: head[1], times: [] }
      tables.push(cur)
      continue
    }
    if (cur && /^\d{2}:\d{2}$/.test(l)) cur.times.push(l)
  }
  return { first: grab("첫차"), last: grab("막차"), fare, company, tables: tables.filter((t) => t.times.length > 0) }
}

// 노선 목록·시간표는 사실상 정적 — 6시간 캐시 (지역별·노선별)
const busCache = new Map<string, { at: number; data: unknown }>()
const BUS_TTL = 6 * 3600 * 1000

async function busPost(path: string, params: Record<string, string>): Promise<string> {
  const res = await fetch(`https://www.airport.kr${path}`, {
    method: "POST",
    headers: { ...FORM, referer: "https://www.airport.kr/ap_ko/976/subview.do" },
    body: new URLSearchParams(params).toString(),
    cache: "no-store",
    signal: AbortSignal.timeout(12000),
  })
  if (!res.ok) throw new Error(`bus ${path} ${res.status}`)
  return res.text()
}

export async function fetchBusRoutes(area: string): Promise<BusRoute[]> {
  const key = `routes-${area}`
  const hit = busCache.get(key)
  if (hit && Date.now() - hit.at < BUS_TTL) return hit.data as BusRoute[]
  const html = await busPost("/bus/ap_ko/busRouteList.do", {
    layout: "61705f6b6f4040393736",
    siteId: "ap_ko",
    routeArea: area,
    searchVal: "",
  })
  const routes = parseBusRoutes(html)
  if (routes.length > 0) busCache.set(key, { at: Date.now(), data: routes })
  return routes
}

export async function fetchBusDetail(routeId: string): Promise<BusDetail | null> {
  if (!/^\d+$/.test(routeId)) return null
  const key = `detail-${routeId}`
  const hit = busCache.get(key)
  if (hit && Date.now() - hit.at < BUS_TTL) return hit.data as BusDetail
  const html = await busPost("/bus/ap_ko/busInfoDetail.do", { routeId })
  const detail = parseBusDetail(html)
  if (detail && detail.tables.length > 0) busCache.set(key, { at: Date.now(), data: detail })
  return detail
}
