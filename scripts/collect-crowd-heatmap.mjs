// 서울 인파레이더 요일×시간 히트맵 수집기 (GitHub Actions 매시 실행)
// data 브랜치의 heatmap.json에 (요일, 시각)별 혼잡도 합계·표본수를 누적한다.
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

async function fetchPage(page) {
  const qs = new URLSearchParams({ page: String(page), category: "전체보기", count: "50", sort: "false" })
  const res = await fetch(`${RTD_BASE}/hotspot-category?${qs}`, { headers: RTD_HEADERS })
  if (!res.ok) throw new Error(`SeoulRtd HTTP ${res.status}`)
  return res.json()
}

const prev = await fetch(PREV_URL)
  .then((r) => (r.ok ? r.json() : null))
  .catch(() => null)
const spots = prev?.spots && typeof prev.spots === "object" ? prev.spots : {}

const pages = await Promise.all([1, 2, 3].map(fetchPage))

// KST 기준 요일(0=일)·시각
const kst = new Date(Date.now() + 9 * 3600 * 1000)
const dow = kst.getUTCDay()
const hour = kst.getUTCHours()

const seen = new Set()
let updated = 0
for (const page of pages) {
  for (const row of page.row ?? []) {
    const name = row.area_nm
    const lvl = LEVELS[row.area_congest_lvl]
    if (!name || !lvl || seen.has(name)) continue
    seen.add(name)
    if (!validEntry(spots[name])) spots[name] = { sum: zeros(), cnt: zeros() }
    spots[name].sum[dow][hour] += lvl
    spots[name].cnt[dow][hour] += 1
    updated++
  }
}

if (updated === 0) throw new Error("no spots collected — SeoulRtd 응답 확인 필요")

await mkdir("out-data", { recursive: true })
await writeFile(
  "out-data/heatmap.json",
  JSON.stringify({ updated: kst.toISOString().replace("Z", "+09:00"), spots }),
)
console.log(`collected ${updated} spots @ KST dow=${dow} hour=${hour}`)
