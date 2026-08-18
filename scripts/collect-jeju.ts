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

// 2026-08-18: gjdong 원천(jeju.mms.gislab.co.kr)이 국내 회선까지 광역 403.
// 제주관광공사 공식 데이터맵(data.ijto.or.kr)의 실백엔드인 **다른 인스턴스**로 전환한다.
// ⚠️이 인스턴스는 응답이 JSON 이 아니라 `총합^시각|…#|#` pipe 포맷이라(성별 미제공,
// getTimePop 은 도민+관광 합산만), 여기서 파싱해 앱의 JSON 계약([{IN_POP,OUT_POP,TIME}])
// 으로 변환해 스냅샷에 넣는다 — 앱 파서(lib/crowd/jeju.ts)는 무변경으로 돈다.
// TLS 체인 정상이라 https 직결(포트 444) 그대로, 맨몸 요청도 200(같은-오리진 헤더 불필요).
const GEONET = "https://mms.gislab.co.kr:444/mms_new/GEONET."
const SEL =
  "M_POP_00,M_POP_10,M_POP_20,M_POP_30,M_POP_40,M_POP_50,M_POP_60,M_POP_70,M_POP_80,M_POP_90,W_POP_00,W_POP_10,W_POP_20,W_POP_30,W_POP_40,W_POP_50,W_POP_60,W_POP_70,W_POP_80,W_POP_90"

// 앱 sexAge 파서가 참조하는 연령 키 순서. :444 getSexAge 는 `남연령10^|^여연령10` 이라
// 키를 "x_남_10대"/"x_여_10대" 로 넣으면 앱이 성별(parts[1])·연령(parts[2])을 정확히 뽑는다.
const AGE_KEYS = ["10세미만", "10대", "20대", "30대", "40대", "50대", "60대", "70대", "80대", "90대이상"]

// 도민/관광 시간대별 비율(8/9 마지막 실측). :444 는 도민/관광을 안 줘서 신선 total 에 곱해 추정한다.
import residentProfile from "../lib/crowd/jeju-resident-profile.json"

async function geonetText(url: string): Promise<string | null> {
  for (let i = 1; i <= 3; i++) {
    try {
      const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(15000) })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return await res.text()
    } catch {
      if (i === 3) return null
      await new Promise((r) => setTimeout(r, 1000 * i))
    }
  }
  return null
}

/** "13906^NOW|14350^3AVG|14030^16|…^16#|#" → [{total, TIME}]. NOW 없거나 에러면 null. */
function parseTimePipe(text: string | null): Array<{ total: number; TIME: string }> | null {
  if (!text) return null
  const clean = text.replace(/#\|#\s*$/, "").trim()
  // 데이터 없는 좌표는 PHP 경고("Undefined offset")·HTML 에러를 준다 — 반경 폴백 신호
  if (!clean || clean.includes("Undefined") || clean.includes("<")) return null
  const rows: Array<{ total: number; TIME: string }> = []
  for (const part of clean.split("|")) {
    const [v, label] = part.split("^")
    if (!label || v === "") continue
    const n = Number(v)
    if (Number.isFinite(n)) rows.push({ total: n, TIME: label })
  }
  return rows.some((r) => r.TIME === "NOW") ? rows : null
}

/** "도민10개^|^관광10개#|#" → {domin:[10], tour:[10]}. 형식 안 맞으면 null. */
function parseSexAgePipe(text: string | null): { domin: number[]; tour: number[] } | null {
  if (!text) return null
  const clean = text.replace(/#\|#\s*$/, "").trim()
  if (!clean || clean.includes("Undefined") || clean.includes("<") || !clean.includes("^|^")) return null
  const [dPart, tPart] = clean.split("^|^")
  const domin = dPart.replace(/\^+$/, "").split("^").map(Number)
  const tour = tPart.replace(/\^+$/, "").split("^").map(Number)
  if (domin.length < 10 || tour.length < 10 || [...domin.slice(0, 10), ...tour.slice(0, 10)].some((n) => !Number.isFinite(n)))
    return null
  return { domin: domin.slice(0, 10), tour: tour.slice(0, 10) }
}

/** total 시계열 + sexAge 를 앱 JSON 계약으로 합친다.
 *  ⚠️이 인스턴스(:444)는 도민/관광을 안 준다 — jeju.mms 만 줬는데 그 원천은 광역 차단이다.
 *  그래서 NOW 의 도민/관광은 **8/9 마지막 실측의 시간대별 비율**(jeju-resident-profile)을
 *  신선 total 에 곱해 추정한다. 절대 인원·등급은 정확하고, 도민/관광 비율만 근사(지점 특성이라
 *  9일새 큰 변동 없음, 시각별 프로파일로 낮 관광↑·밤 도민↑는 반영. 시각 단위 실변동은 놓침).
 *  3AVG·과거행은 total 을 IN_POP 에(OUT_POP=0) — 앱은 과거를 IN+OUT 합산으로만 쓴다. */
function buildPopRows(totalRows: Array<{ total: number; TIME: string }>, residentRatio: number): PopRow[] {
  return totalRows.map((r) => {
    if (r.TIME !== "NOW") return { IN_POP: r.total, OUT_POP: 0, TIME: r.TIME }
    const inp = Math.round(r.total * residentRatio)
    return { IN_POP: inp, OUT_POP: r.total - inp, TIME: "NOW" }
  })
}

/** sexAge(남/여×연령) → 앱이 먹는 한글 키 2행. `^|^` 앞=남, 뒤=여로 확정(프로덕션 성별과 대조).
 *  앱은 이 2행에서 성별(parts[1])과 연령(parts[2])만 뽑고 도민/관광은 pop 에서 쓴다. */
function buildSexAge(sa: { domin: number[]; tour: number[] } | null): Array<Record<string, number>> | null {
  if (!sa) return null
  const male: Record<string, number> = {}
  const female: Record<string, number> = {}
  AGE_KEYS.forEach((k, i) => {
    male[`x_남_${k}`] = sa.domin[i]
    female[`x_여_${k}`] = sa.tour[i]
  })
  return [male, female]
}

/** 지점의 시각별 도민 비율(8/9 프로파일). 결측 시각 → 지점 평균 → 전역 평균. */
function residentRatioFor(name: string, hour: number): number {
  const spot = (residentProfile.spots as Record<string, Record<string, number>>)[name]
  if (!spot) return residentProfile._global_avg
  return spot[String(hour)] ?? spot.avg ?? residentProfile._global_avg
}

/** 지점 하나 수집. 정의 반경으로 비면(산간 새벽 등) 1.5·2배까지 키워 재시도. */
async function fetchSpot(
  s: { name: string; lat: number; lng: number; r: number },
  nowHour: number,
): Promise<{ pop: PopRow[]; sexAge: Array<Record<string, number>> | null } | null> {
  // 산간 최고지대(성판악 등)는 시간대에 따라 정의 반경으로도 빈다 — 3배까지 키워 재시도.
  for (const R of [s.r, Math.round(s.r * 1.5), s.r * 2, s.r * 3]) {
    const totalRows = parseTimePipe(await geonetText(`${GEONET}getTimePopByCircle.php?SELECT=${SEL}&X=${s.lng}&Y=${s.lat}&R=${R}`))
    if (!totalRows) continue
    const sa = parseSexAgePipe(await geonetText(`${GEONET}getSexAgePopByCircle.php?X=${s.lng}&Y=${s.lat}&R=${R}`))
    return { pop: buildPopRows(totalRows, residentRatioFor(s.name, nowHour)), sexAge: buildSexAge(sa) }
  }
  return null
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

  // 도민/관광 추정에 쓸 현재 KST 시각(프로파일이 시각별이라)
  const nowHour = new Date(Date.now() + 9 * 3600 * 1000).getUTCHours()

  // ★프로브: 첫 지점을 실제로 받아본다. 인스턴스가 막히거나(다른 서버라 지금은 살아있음)
  // pipe 포맷이 바뀌면 여기서 걸러 66×2 배리지를 아낀다. 다시 열리면 자동 재개.
  const probe = await fetchSpot(JEJU_SPOTS[0], nowHour)
  if (!probe) {
    console.error(`[${new Date().toISOString()}] 제주 원천(${GEONET}) 응답 없음 — 수집 생략`)
    process.exit(1)
  }

  const BATCH = 6
  for (let i = 0; i < JEJU_SPOTS.length; i += BATCH) {
    await Promise.all(
      JEJU_SPOTS.slice(i, i + BATCH).map(async (s) => {
        const data = await fetchSpot(s, nowHour)
        if (data) {
          pop[s.name] = data.pop
          if (data.sexAge) sexAge[s.name] = data.sexAge
        } else {
          failed++
        }
      }),
    )
  }

  // 절반 넘게 실패했으면 발행하지 않는다 — 반쪽 스냅샷으로 멀쩡한 직전 분을 덮으면
  // 화면에서 명소가 통째로 사라진다. 다음 회차에 회복하는 편이 낫다.
  if (failed > JEJU_SPOTS.length / 2) {
    console.error(`[${new Date().toISOString()}] 제주 수집 실패 ${failed}/${JEJU_SPOTS.length} — 발행 중단`)
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
