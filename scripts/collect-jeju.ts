// 제주 인파 스냅샷 수집기 — 맥미니(국내 일반 회선)에서 15분 주기로 실행한다.
//
// 왜 필요한가: 제주 원천(GEONET)은 데이터센터 대역을 거른다. 403이 아니라 200+빈 배열로
// 조용히 거절하기 때문에 Vercel에서는 어떤 리전·런타임을 써도 빈손이다(2026-08-07 실측:
// Node/iad1·Node/icn1·Edge/CF 전부 `[]`, 같은 순간 국내 회선은 26행 정상).
// 그래서 원천이 받아주는 회선에서 떠서 결과만 넘긴다.
//
// 원천은 시간당 1회 갱신이라(응답 선두 시각=현재 시각) 15분 주기면 신선도 손실이 없고,
// 호출량도 15분당 66콜로 고정된다 — 뷰어 수와 무관해지는 게 이 구조의 핵심 이득이다.
//
// 출력: out-data-jeju/jeju.json  {updated, pop: {명소명: GEONET 원본 26행}}
// 원본 행을 그대로 담는 이유는 앱이 쓰는 파싱·등급 로직을 한 벌로 유지하기 위해서다.

import { mkdir, writeFile } from "node:fs/promises"
import { deriveLevel, JEJU_SPOTS } from "../lib/crowd/jeju"
import { levelNum } from "../lib/crowd/seoul-rtd"

// 요일×시간 히트맵도 같이 쌓는다. GEONET은 호출 1회에 지난 24시간을 함께 주므로
// (서울 히트맵의 12시간 룩백과 같은 원리) 15분 주기로도 갭 없이 누적된다.
// 전역 lastSlot(YYYYMMDDHH)으로 이미 센 시각은 건너뛴다.
const HEATMAP_URL = "https://raw.githubusercontent.com/chrisryugj/gjdong/data-jeju/jeju-heatmap.json"

interface HeatEntry {
  sum: number[][]
  cnt: number[][]
}
const zeros = () => Array.from({ length: 7 }, () => new Array(24).fill(0))

/** 이전 누적을 못 읽으면 발행하지 않는다 — 빈 결과로 덮으면 그동안 쌓은 게 복구 불가능하게 사라진다 */
async function loadHeatmap(): Promise<{ lastSlot: number; spots: Record<string, HeatEntry> } | null> {
  for (let i = 1; ; i++) {
    try {
      const res = await fetch(HEATMAP_URL, { cache: "no-store" })
      if (res.status === 404) return { lastSlot: 0, spots: {} } // 최초 수집
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const d = (await res.json()) as { lastSlot?: number; spots?: Record<string, HeatEntry> }
      return { lastSlot: Number.isFinite(d.lastSlot) ? (d.lastSlot as number) : 0, spots: d.spots ?? {} }
    } catch (err) {
      if (i >= 3) throw new Error(`이전 누적 로드 실패 — 덮어쓰기 방지로 중단: ${String(err)}`)
      await new Promise((r) => setTimeout(r, 1000 * i))
    }
  }
}

const GEONET = "https://jeju.mms.gislab.co.kr/mms_new/GEONET."
const SEL =
  "M_POP_00,M_POP_10,M_POP_20,M_POP_30,M_POP_40,M_POP_50,M_POP_60,M_POP_70,M_POP_80,M_POP_90,W_POP_00,W_POP_10,W_POP_20,W_POP_30,W_POP_40,W_POP_50,W_POP_60,W_POP_70,W_POP_80,W_POP_90"
// 원천이 자기 페이지發 XHR만 받는다 — 이 헤더가 빠지면 전건 403
const HEADERS = { "Sec-Fetch-Site": "same-origin" }

async function geonetRows(url: string): Promise<unknown[] | null> {
  for (let i = 1; i <= 3; i++) {
    try {
      const res = await fetch(url, { cache: "no-store", headers: HEADERS, signal: AbortSignal.timeout(15000) })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const rows = (await res.json()) as unknown
      // 빈 배열 = 이 회선이 거절당한 것. 재시도해도 같으니 즉시 알린다.
      if (!Array.isArray(rows)) throw new Error("not an array")
      return rows.length > 0 ? rows : null
    } catch {
      if (i === 3) return null
      await new Promise((r) => setTimeout(r, 1000 * i))
    }
  }
  return null
}

function fetchPop(lat: number, lng: number, r: number): Promise<unknown[] | null> {
  return geonetRows(`${GEONET}getTimePopByCircle.php?SELECT=${SEL}&X=${lng}&Y=${lat}&R=${r}`)
}

/** 성·연령 구성 — 상세 패널의 한 축이라 스냅샷에도 담는다(도민/관광객 2행, 한글 키) */
function fetchSexAge(lat: number, lng: number, r: number): Promise<unknown[] | null> {
  return geonetRows(`${GEONET}getSexAgePopByCircle.php?X=${lng}&Y=${lat}&R=${r}`)
}

interface PopRow {
  IN_POP: number | string
  OUT_POP: number | string
  TIME: number | string
}

function toNum(v: unknown): number {
  const n = Number.parseFloat(String(v ?? ""))
  return Number.isFinite(n) ? n : 0
}

/**
 * 응답의 과거 24시간에 KST (날짜, 시각)을 부여한다.
 * 행은 현재→과거 역순이라, 시각이 직전보다 커지는 지점에서 하루를 빌린다(자정 넘김).
 */
function pastSlots(rows: PopRow[], nowKst: Date) {
  const hours = rows.filter((r) => r.TIME !== "NOW" && r.TIME !== "3AVG")
  const date = new Date(nowKst)
  let lastHour = nowKst.getUTCHours()
  const slots: Array<{ key: number; dow: number; hour: number; v: number }> = []
  for (const r of hours) {
    const hour = Number.parseInt(String(r.TIME), 10)
    if (!Number.isFinite(hour) || hour < 0 || hour > 23) continue
    if (hour > lastHour) date.setUTCDate(date.getUTCDate() - 1)
    lastHour = hour
    slots.push({
      key: date.getUTCFullYear() * 1e6 + (date.getUTCMonth() + 1) * 1e4 + date.getUTCDate() * 100 + hour,
      dow: date.getUTCDay(),
      hour,
      v: toNum(r.IN_POP) + toNum(r.OUT_POP),
    })
  }
  return slots
}

async function main() {
  const pop: Record<string, unknown[]> = {}
  const sexAge: Record<string, unknown[]> = {}
  let failed = 0

  const BATCH = 6
  for (let i = 0; i < JEJU_SPOTS.length; i += BATCH) {
    await Promise.all(
      JEJU_SPOTS.slice(i, i + BATCH).map(async (s) => {
        const [rows, sa] = await Promise.all([
          fetchPop(s.lat, s.lng, s.r),
          // 성·연령은 실패해도 그 축만 비면 되므로 수집 성공 여부에 넣지 않는다
          fetchSexAge(s.lat, s.lng, s.r),
        ])
        if (rows) pop[s.name] = rows
        else failed++
        if (sa) sexAge[s.name] = sa
      }),
    )
  }

  // 절반 넘게 실패했으면 발행하지 않는다 — 반쪽 스냅샷으로 멀쩡한 직전 분을 덮으면
  // 화면에서 명소가 통째로 사라진다. 다음 회차에 회복하는 편이 낫다.
  if (failed > JEJU_SPOTS.length / 2) {
    console.error(`제주 수집 실패 ${failed}/${JEJU_SPOTS.length} — 발행 중단`)
    process.exit(1)
  }

  const kst = new Date(Date.now() + 9 * 3600 * 1000)
  await mkdir("out-data-jeju", { recursive: true })
  await writeFile(
    "out-data-jeju/jeju.json",
    JSON.stringify({ updated: kst.toISOString().replace("Z", "+09:00"), pop, sexAge }),
  )

  // ── 요일×시간 누적
  const prev = await loadHeatmap()
  if (!prev) throw new Error("이전 누적을 읽지 못했다")
  const spots = prev.spots
  let maxSlot = prev.lastSlot
  let added = 0

  for (const s of JEJU_SPOTS) {
    const rows = pop[s.name] as PopRow[] | undefined
    if (!rows) continue
    const slots = pastSlots(rows, kst)
    if (slots.length === 0) continue
    // 등급은 앱과 같은 기준으로 낸다 — 자기 24시간 최대 대비 비율 + 면적당 밀도 상한
    const rhythmMax = Math.max(...slots.map((x) => x.v), 1)
    const entry = (spots[s.name] ??= { sum: zeros(), cnt: zeros() })
    if (entry.sum?.length !== 7 || entry.cnt?.length !== 7) {
      entry.sum = zeros()
      entry.cnt = zeros()
    }
    for (const slot of slots) {
      if (slot.key <= prev.lastSlot) continue
      const lv = levelNum(deriveLevel(slot.v, rhythmMax, s.r / 1000))
      if (!lv) continue
      entry.sum[slot.dow][slot.hour] += lv
      entry.cnt[slot.dow][slot.hour] += 1
      if (slot.key > maxSlot) maxSlot = slot.key
      added++
    }
  }

  await writeFile(
    "out-data-jeju/jeju-heatmap.json",
    JSON.stringify({ updated: kst.toISOString().replace("Z", "+09:00"), lastSlot: maxSlot, spots }),
  )
  console.log(
    `제주 ${JEJU_SPOTS.length - failed}/${JEJU_SPOTS.length} 수집 · 히트맵 +${added}표본 · lastSlot ${prev.lastSlot} → ${maxSlot}`,
  )
}

void main()
