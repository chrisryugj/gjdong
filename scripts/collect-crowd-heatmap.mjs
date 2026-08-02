// 서울 인파레이더 요일×시간 히트맵 수집기 (GitHub Actions 3시간 주기 실행)
// ppltn_congest가 주는 "직전 12시간 실측 혼잡레벨"을 121곳 전체에 대해 수집해
// data 브랜치 heatmap.json의 (요일, 시각)별 합계·표본수에 누적한다.
// 전역 lastSlot(YYYYMMDDHH) 마커로 이미 센 시간대는 건너뛰므로 실행 주기가
// 겹치거나 GH cron이 몇 번 빠져도(12시간 이내) 갭 없이 자가치유된다.
// FRESH=1 환경변수로 기존 누적을 버리고 처음부터 다시 쌓는다.
// 출력: out-data/heatmap.json — 클라이언트는 raw.githubusercontent.com로 읽는다.

import { mkdir, writeFile } from "node:fs/promises"

const RTD_BASE = "https://data.seoul.go.kr/SeoulRtd/api"
const RTD_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
  Referer: "https://data.seoul.go.kr/SeoulRtd/map",
  Accept: "application/json, text/plain, */*",
}
const PREV_URL = "https://raw.githubusercontent.com/chrisryugj/gjdong/data/heatmap.json"
const LEVELS = { 여유: 1, 보통: 2, "약간 붐빔": 3, 붐빔: 4 }

const zeros = () => Array.from({ length: 7 }, () => new Array(24).fill(0))

function validEntry(ent) {
  return (
    ent &&
    Array.isArray(ent.sum) &&
    ent.sum.length === 7 &&
    Array.isArray(ent.cnt) &&
    ent.cnt.length === 7
  )
}

// 서버가 간헐적으로 따옴표 없는 스키마 스텁을 돌려주는 flake가 있어 파싱 실패도 재시도 대상
async function rtdJson(path, params, tries = 3) {
  const qs = new URLSearchParams(params).toString()
  for (let i = 1; ; i++) {
    try {
      const res = await fetch(`${RTD_BASE}/${path}?${qs}`, { headers: RTD_HEADERS })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const text = await res.text()
      if (!text) throw new Error("empty response")
      return JSON.parse(text)
    } catch (err) {
      if (i >= tries) throw new Error(`SeoulRtd ${path} failed: ${err.message}`)
      await new Promise((r) => setTimeout(r, 1000 * i))
    }
  }
}

async function fetchSpotNames() {
  const pages = await Promise.all(
    [1, 2, 3].map((page) =>
      rtdJson("hotspot-category", {
        page: String(page),
        category: "전체보기",
        count: "50",
        sort: "false",
      }),
    ),
  )
  const names = new Set()
  for (const page of pages) for (const row of page.row ?? []) if (row.area_nm) names.add(row.area_nm)
  return [...names]
}

// ppltn_congest의 "현재" 이전 슬롯들에 KST (날짜, 시각)를 부여한다.
// 슬롯은 최신→과거로 걸으며 시각이 직전보다 커지는 지점에서 하루를 빌린다(자정 넘김).
function pastSlots(congest, nowKst) {
  const times = String(congest.time_cd ?? "").split("|")
  const labels = String(congest.congestion_label_list ?? "").split("|")
  const nowIndex = times.indexOf("현재")
  if (nowIndex <= 0) return []

  const slots = []
  const date = new Date(nowKst)
  let lastHour = nowKst.getUTCHours()
  for (let i = nowIndex - 1; i >= 0; i--) {
    const hour = Number.parseInt(times[i].replace(/^\d+\/\d+ /, ""), 10)
    const lvl = LEVELS[labels[i]]
    if (!Number.isFinite(hour) || hour < 0 || hour > 23) continue
    if (hour > lastHour) date.setUTCDate(date.getUTCDate() - 1)
    lastHour = hour
    if (!lvl) continue
    const key =
      date.getUTCFullYear() * 1e6 + (date.getUTCMonth() + 1) * 1e4 + date.getUTCDate() * 100 + hour
    slots.push({ key, dow: date.getUTCDay(), hour, lvl })
  }
  return slots
}

async function mapPool(items, size, fn) {
  const results = []
  let idx = 0
  await Promise.all(
    Array.from({ length: Math.min(size, items.length) }, async () => {
      while (idx < items.length) {
        const i = idx++
        results[i] = await fn(items[i])
      }
    }),
  )
  return results
}

const fresh = process.env.FRESH === "1"
const prev = fresh
  ? null
  : await fetch(PREV_URL)
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null)
const spots = prev?.spots && typeof prev.spots === "object" ? prev.spots : {}
const lastSlot = Number.isFinite(prev?.lastSlot) ? prev.lastSlot : 0

// KST 시각 (UTC 게터로 읽는 시프트 방식)
const kst = new Date(Date.now() + 9 * 3600 * 1000)

const names = await fetchSpotNames()
if (names.length === 0) throw new Error("no spots listed — SeoulRtd 응답 확인 필요")

let added = 0
let failed = 0
let maxSlot = lastSlot
await mapPool(names, 8, async (name) => {
  let rows
  try {
    rows = await rtdJson("ppltn_congest", { hotspotNm: name })
  } catch {
    failed++
    return
  }
  const congest = Array.isArray(rows) ? rows[0] : null
  if (!congest) {
    failed++
    return
  }
  if (!validEntry(spots[name])) spots[name] = { sum: zeros(), cnt: zeros() }
  for (const slot of pastSlots(congest, kst)) {
    if (slot.key <= lastSlot) continue
    spots[name].sum[slot.dow][slot.hour] += slot.lvl
    spots[name].cnt[slot.dow][slot.hour] += 1
    if (slot.key > maxSlot) maxSlot = slot.key
    added++
  }
})

if (failed > names.length / 2) throw new Error(`too many failures: ${failed}/${names.length}`)

await mkdir("out-data", { recursive: true })
await writeFile(
  "out-data/heatmap.json",
  JSON.stringify({
    updated: kst.toISOString().replace("Z", "+09:00"),
    lastSlot: maxSlot,
    spots,
  }),
)
console.log(
  `spots ${names.length - failed}/${names.length} ok, +${added} samples, lastSlot ${lastSlot} → ${maxSlot}`,
)
