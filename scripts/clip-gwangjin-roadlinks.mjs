// MOCT_LINK에서 광진구(경계+250m 버퍼) 링크만 추출 → gwangjin-roadlinks.json
import { readFileSync, writeFileSync } from "node:fs"
import * as shapefile from "shapefile"
import proj4 from "proj4"

const TM = "+proj=tmerc +lat_0=38 +lon_0=127 +k=1 +x_0=200000 +y_0=600000 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs"
const toWgs = (x, y) => proj4(TM, "EPSG:4326", [x, y]) // → [lng, lat]

// 광진 경계 링 (boundary.ts에서 좌표만 추출)
const bsrc = readFileSync("/Users/mong-e/workspace/gjdong/lib/gwangjin/boundary.ts", "utf8")
const RING = [...bsrc.matchAll(/\[\s*([\d.]+)\s*,\s*([\d.]+)\s*\]/g)].map((m) => [Number(m[1]), Number(m[2])]) // [lat,lng]
if (RING.length < 100) throw new Error(`boundary parse fail: ${RING.length}`)

// 경계 bbox → 5186 투영 bbox(+300m) 프리필터
let minLat = 90, maxLat = -90, minLng = 180, maxLng = -180
for (const [la, ln] of RING) { minLat = Math.min(minLat, la); maxLat = Math.max(maxLat, la); minLng = Math.min(minLng, ln); maxLng = Math.max(maxLng, ln) }
const [x1, y1] = proj4("EPSG:4326", TM, [minLng, minLat])
const [x2, y2] = proj4("EPSG:4326", TM, [maxLng, maxLat])
const BX1 = Math.min(x1, x2) - 300, BX2 = Math.max(x1, x2) + 300, BY1 = Math.min(y1, y2) - 300, BY2 = Math.max(y1, y2) + 300

// point-in-polygon (ray casting, lat/lng)
function inRing(lat, lng) {
  let inside = false
  for (let i = 0, j = RING.length - 1; i < RING.length; j = i++) {
    const [yi, xi] = RING[i], [yj, xj] = RING[j]
    if (yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}
// 링까지 최소거리(m) — 등장방형 근사 (37.55N)
const KX = 111320 * Math.cos((37.55 * Math.PI) / 180), KY = 110574
function distToRing(lat, lng) {
  let best = Infinity
  for (let i = 0, j = RING.length - 1; i < RING.length; j = i++) {
    const ax = (RING[j][1] - lng) * KX, ay = (RING[j][0] - lat) * KY
    const bx = (RING[i][1] - lng) * KX, by = (RING[i][0] - lat) * KY
    const dx = bx - ax, dy = by - ay
    const t = Math.max(0, Math.min(1, -(ax * dx + ay * dy) / (dx * dx + dy * dy || 1)))
    const px = ax + t * dx, py = ay + t * dy
    best = Math.min(best, Math.hypot(px, py))
  }
  return best
}
const BUFFER_M = 250

const src = await shapefile.open("nodelink/MOCT_LINK.shp", "nodelink/MOCT_LINK.dbf", { encoding: "euc-kr" })
let total = 0, kept = 0
const out = []
const rankDist = {}
while (true) {
  const rec = await src.read()
  if (rec.done) break
  total++
  const g = rec.value.geometry
  if (!g) continue
  const coordsList = g.type === "MultiLineString" ? g.coordinates : [g.coordinates]
  // 프리필터: 투영좌표 bbox
  let hit = false
  outer: for (const line of coordsList)
    for (const [x, y] of line)
      if (x >= BX1 && x <= BX2 && y >= BY1 && y <= BY2) { hit = true; break outer }
  if (!hit) continue
  // 정밀: WGS 변환 후 경계 포함/버퍼
  const wgsLines = coordsList.map((line) => line.map(([x, y]) => { const [ln, la] = toWgs(x, y); return [la, ln] }))
  let inside = false
  outer2: for (const line of wgsLines)
    for (const [la, ln] of line)
      if (inRing(la, ln) || distToRing(la, ln) <= BUFFER_M) { inside = true; break outer2 }
  if (!inside) continue
  kept++
  const p = rec.value.properties
  const rank = String(p.ROAD_RANK ?? "")
  rankDist[rank] = (rankDist[rank] ?? 0) + 1
  const path = wgsLines.flat().map(([la, ln]) => [Math.round(la * 1e5) / 1e5, Math.round(ln * 1e5) / 1e5])
  out.push({ i: String(p.LINK_ID), n: String(p.ROAD_NAME ?? "").trim(), r: rank, m: Number(p.MAX_SPD) || 0, p: path })
  if (kept % 200 === 0) console.log("kept", kept, "of", total)
}
writeFileSync("gwangjin-roadlinks.json", JSON.stringify({ ver: "2026-08-12", cnt: out.length, links: out }))
console.log("TOTAL", total, "KEPT", kept, "ranks", JSON.stringify(rankDist))
const names = [...new Set(out.map((l) => l.n))].filter(Boolean)
console.log("도로 수", names.length, "—", names.slice(0, 25).join(", "))
