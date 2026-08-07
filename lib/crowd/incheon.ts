// 인천공항 — 공항 홈페이지 내부 승객예고 JSON 연동 (서버 전용, 무키·Referer 불요)
// 다른 도시와 달리 "명소"가 출국장이다. 원천이 대기 인원·대기 시간을 직접 주므로
// 파생 없이 그대로 등급으로 쓴다: 30분↑ 붐빔 · 20분↑ 약간 붐빔 · 10분↑ 보통 · 그 미만 여유.
//
// 데이터 계약 (2026-08-07 실측):
// - passengerNoticeApiData.do?tmnlId=1 → 12행 DG{1..6}_{E|W} (출국장 1~6번 × 동/서)
//   tmnlId=2 → 8행 DG{1..2}_{A|B|C|D} (출국장 1~2번 × 4입구). tmnlId=3 등은 빈 객체 {}.
//   {gateId, gateStts: OP(운영)/NP(미운영), wtngPrsnm: 대기 인원, wtngTm: 대기 분,
//    operBgngTm/operEndTm: 운영 시간, ocrTm: YYYYMMDDHHmm 관측 시각} — 1분 주기.
//   ⚠️미운영 게이트는 인원·시간이 "-" 문자열이다. 0으로 읽어 "여유"로 만들면 거짓이 된다.
// - 한 출국장의 동/서(A~D) 입구는 수십 m 차라 한 지점으로 묶고, 운영 중인 입구의
//   최대 대기로 등급을 낸다(가장 붐비는 줄이 그 출국장의 체감이다).

import {
  LEVEL_COLORS,
  levelNum,
  type CrowdCctv,
  type CrowdDetail,
  type CrowdExtra,
  type CrowdParkingLot,
  type CrowdSpot,
} from "@/lib/crowd/seoul-rtd"
import { createSnapshot, emptyDetailFields, fetchMeteo12h, LV_BY_N } from "@/lib/crowd/adapter-kit"

const WAIT = "https://www.airport.kr/pgn/ap_ko/passengerNoticeApiData.do?tmnlId="

// 주차 현황 — 공항 홈페이지 SSR HTML 4장(무키). 실측 16구역: T1 단기3·장기5, T2 단기5·장기3.
// 각 <li>에 구역명·잔여("N대 가능"/"만차")·점유율(num-line 의 width%)이 함께 있다.
// 총 주차면수는 어디에도 없다 — 잔여÷(1-점유율)로 역산하면 width가 정수 반올림이라
// ±5% 오차가 확정 숫자처럼 보이므로 capacity 는 비우고 점유율을 그대로 싣는다.
const PARK_PAGES: Array<{ id: string; terminal: "1" | "2"; kind: string }> = [
  { id: "964", terminal: "1", kind: "단기" },
  { id: "965", terminal: "1", kind: "장기" },
  { id: "967", terminal: "2", kind: "단기" },
  { id: "968", terminal: "2", kind: "장기" },
]
// 구역 단위 좌표는 원천에 없다 — 길찾기는 해당 터미널로 보낸다
const TERMINAL_COORD: Record<"1" | "2", { lat: number; lng: number }> = {
  "1": { lat: 37.4495715, lng: 126.4521194 },
  "2": { lat: 37.468044, lng: 126.4348646 },
}

const NO_DATA = "정보 없음"

interface GateDef {
  name: string
  category: string
  lat: number
  lng: number
  terminal: "1" | "2"
  no: number
}

// 출국장 좌표 — 터미널별 안내도 기준, 동쪽부터 1번 (2026-08 실측 좌표)
export const INCHEON_SPOTS: GateDef[] = [
  { name: "T1 1번 출국장", category: "출국장", lat: 37.450313, lng: 126.454437, terminal: "1", no: 1 },
  { name: "T1 2번 출국장", category: "출국장", lat: 37.450187, lng: 126.452812, terminal: "1", no: 2 },
  { name: "T1 3번 출국장", category: "출국장", lat: 37.449937, lng: 126.451562, terminal: "1", no: 3 },
  { name: "T1 4번 출국장", category: "출국장", lat: 37.448937, lng: 126.449813, terminal: "1", no: 4 },
  { name: "T1 5번 출국장", category: "출국장", lat: 37.448062, lng: 126.448937, terminal: "1", no: 5 },
  { name: "T1 6번 출국장", category: "출국장", lat: 37.446813, lng: 126.448437, terminal: "1", no: 6 },
  { name: "T2 1번 출국장", category: "출국장", lat: 37.467687, lng: 126.436562, terminal: "2", no: 1 },
  { name: "T2 2번 출국장", category: "출국장", lat: 37.466062, lng: 126.433688, terminal: "2", no: 2 },
]

interface GateRow {
  id: string
  side: string // E/W(T1) · A~D(T2)
  open: boolean
  waitMin: number | null // 미운영·미제공은 null — 0으로 뭉개지 않는다
  people: number | null
  operBgn: string
  operEnd: string
  at: string
}

export function toNumOrNull(v: unknown): number | null {
  const s = String(v ?? "").trim()
  if (!s || s === "-") return null
  const n = Number.parseFloat(s)
  return Number.isFinite(n) ? n : null
}

interface IncheonSnapshot {
  rows: Map<string, GateRow[]> // key = `${terminal}-${no}`
}

async function fetchTerminal(tmnlId: "1" | "2"): Promise<Array<Record<string, unknown>>> {
  try {
    const res = await fetch(`${WAIT}${tmnlId}`, { cache: "no-store", signal: AbortSignal.timeout(10000) })
    if (!res.ok) return []
    const d = (await res.json()) as unknown
    return Array.isArray(d) ? (d as Array<Record<string, unknown>>) : []
  } catch {
    return []
  }
}

// TTL 60초 — 원천이 1분 주기
const incheonSnapshot = createSnapshot(60_000, async (): Promise<IncheonSnapshot> => {
  const [t1, t2] = await Promise.all([fetchTerminal("1"), fetchTerminal("2")])
  const rows = new Map<string, GateRow[]>()
  for (const [terminal, list] of [["1", t1], ["2", t2]] as const) {
    for (const r of list) {
      const id = String(r.gateId ?? "")
      const m = /^DG(\d)_([A-Z])$/.exec(id)
      if (!m) continue
      const key = `${terminal}-${m[1]}`
      const row: GateRow = {
        id,
        side: m[2],
        open: String(r.gateStts ?? "") === "OP",
        waitMin: toNumOrNull(r.wtngTm),
        people: toNumOrNull(r.wtngPrsnm),
        operBgn: String(r.operBgngTm ?? "").trim(),
        operEnd: String(r.operEndTm ?? "").trim(),
        at: String(r.ocrTm ?? ""),
      }
      const arr = rows.get(key)
      if (arr) arr.push(row)
      else rows.set(key, [row])
    }
  }
  if (rows.size === 0) throw new Error("인천공항 승객예고 응답 없음")
  return { rows }
})

const loadSnapshot = () => incheonSnapshot.get()

/** 주차 페이지 1장 파싱 — 구역명·잔여·점유율 세 값이 한 블록에 붙어 있다 */
export function parseParkPage(html: string, terminal: "1" | "2", kind: string): CrowdParkingLot[] {
  const flat = html.replace(/\s+/g, " ")
  const re =
    /<div class="num-txt">\s*<span>([^<]*)<\/span>\s*<strong[^>]*>\s*([^<]*?)\s*<\/strong>\s*<\/div>\s*<div class="num-line[^"]*"><span style="width:\s*([\d.]+)%"/g
  const out: CrowdParkingLot[] = []
  for (let m = re.exec(flat); m; m = re.exec(flat)) {
    const zone = m[1].trim()
    if (!zone) continue
    // "만차"는 잔여 0 — 숫자가 없다고 건너뛰면 가장 중요한 상태가 사라진다
    const availMatch = /([\d,]+)\s*대/.exec(m[2])
    const available = availMatch ? Number.parseInt(availMatch[1].replace(/,/g, ""), 10) : 0
    out.push({
      name: `T${terminal} ${kind} ${zone}`,
      capacity: 0,
      available: Number.isFinite(available) ? available : 0,
      ...TERMINAL_COORD[terminal],
      occupancyPct: Math.round(Number.parseFloat(m[3])),
    })
  }
  return out
}

async function fetchParking(): Promise<CrowdParkingLot[]> {
  const pages = await Promise.all(
    PARK_PAGES.map(async (p) => {
      try {
        const res = await fetch(`https://www.airport.kr/ap_ko/${p.id}/subview.do`, {
          cache: "no-store",
          signal: AbortSignal.timeout(12000),
        })
        if (!res.ok) return []
        return parseParkPage(await res.text(), p.terminal, p.kind)
      } catch {
        return [] // 페이지 단위 실패 = 그 구역만 빠진다
      }
    }),
  )
  return pages.flat()
}

export function gateLevelNum(waitMin: number): number {
  return waitMin >= 30 ? 4 : waitMin >= 20 ? 3 : waitMin >= 10 ? 2 : 1
}

/** 출국장 단위 집계 — 운영 중 입구만 본다. 전부 닫혔으면 등급을 만들지 않는다. */
function aggregate(def: GateDef, snap: IncheonSnapshot) {
  const all = snap.rows.get(`${def.terminal}-${def.no}`) ?? []
  const live = all.filter((r) => r.open && r.waitMin != null)
  if (live.length === 0) return { level: NO_DATA, waitMin: null as number | null, people: null as number | null, all }
  const waitMin = Math.max(...live.map((r) => r.waitMin as number))
  const people = live.reduce((sum, r) => sum + (r.people ?? 0), 0)
  return { level: LV_BY_N[gateLevelNum(waitMin)], waitMin, people, all }
}

export async function fetchIncheonSpots(): Promise<CrowdSpot[]> {
  const snap = await loadSnapshot()
  return INCHEON_SPOTS.map((s) => {
    const { level } = aggregate(s, snap)
    return {
      name: s.name,
      category: s.category,
      lat: s.lat,
      lng: s.lng,
      level,
      levelNum: levelNum(level),
      color: LEVEL_COLORS[level] ?? "#999",
      basis: level === NO_DATA ? ("none" as const) : ("wait" as const),
    }
  })
}

/** "0630" → "06:30" (원천이 시각을 4자리 문자열로 준다) */
export function hhmm(v: string): string {
  return /^\d{4}$/.test(v) ? `${v.slice(0, 2)}:${v.slice(2)}` : ""
}

export async function fetchIncheonDetail(name: string): Promise<CrowdDetail> {
  const def = INCHEON_SPOTS.find((s) => s.name === name)
  if (!def) throw new Error(`unknown incheon spot: ${name}`)

  const [snap, weather] = await Promise.all([loadSnapshot(), fetchMeteo12h(def.lat, def.lng)])

  const { level, waitMin, people, all } = aggregate(def, snap)
  const sideLabel = (s: string) => (def.terminal === "2" ? `${s}입구` : s === "E" ? "동편" : "서편")

  const message: string[] = []
  if (waitMin == null) {
    const hours = all
      .map((r) => (r.operBgn && r.operEnd ? `${hhmm(r.operBgn)}~${hhmm(r.operEnd)}` : ""))
      .filter(Boolean)
    message.push(
      hours.length > 0
        ? `지금은 운영하지 않는 출국장이에요. 운영 시간은 ${hours[0]}입니다.`
        : "지금은 운영하지 않는 출국장이에요.",
    )
  } else {
    message.push(
      `지금 대기 약 ${waitMin}분${people ? ` · 줄 선 인원 ${people.toLocaleString("ko-KR")}명` : ""}이에요.`,
    )
    const open = all.filter((r) => r.open && r.waitMin != null)
    if (open.length > 1) {
      const per = open.map((r) => `${sideLabel(r.side)} ${r.waitMin}분`).join(" · ")
      message.push(`입구별로는 ${per} 수준이에요.`)
    }
  }

  const cctv: CrowdCctv[] = [] // 공항 공개 CCTV 원천 미확보

  return {
    name,
    city: "incheon",
    level,
    levelNum: levelNum(level),
    color: LEVEL_COLORS[level] ?? "#999",
    message,
    ...emptyDetailFields(),
    weather,
    cctv,
    updatedAt: new Date().toISOString(),
  }
}

/** 인천공항 부가정보 — 주차 16구역 (다른 도시의 CrowdExtra와 같은 형태로 수렴) */
export async function fetchIncheonExtra(name: string): Promise<CrowdExtra> {
  if (!INCHEON_SPOTS.some((s) => s.name === name)) throw new Error(`unknown incheon spot: ${name}`)
  const lots = await fetchParking()

  // 총면수를 모르니 전체 여유율은 구역 점유율의 평균으로 낸다(면수 가중은 불가) — 요약 지표라 허용.
  const pcts = lots.map((l) => l.occupancyPct).filter((p): p is number => p != null)
  const freePct = pcts.length > 0 ? Math.round(100 - pcts.reduce((a, b) => a + b, 0) / pcts.length) : 0

  return {
    alerts: [],
    parking:
      lots.length > 0
        ? { available: lots.reduce((s, l) => s + l.available, 0), percent: freePct, lots }
        : null,
    events: [],
    road: null,
    bike: null,
    updatedAt: new Date().toISOString(),
  }
}
