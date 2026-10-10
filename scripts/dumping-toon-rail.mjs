// /dumping 모형 보기 지하철 고가(26라운드 후속 4, 2026-10-10 사용자: "구의역·건대입구역도 전혀 구현이 안 되어 있네").
//   node scripts/dumping-toon-rail.mjs
// 2호선은 성수에서 건대입구·구의·강변을 지나 잠실철교까지 땅 위 고가로 달리는데, 모형 건물 자료는 고가 역사를 뺐고(24라운드: OSM layer≥1 역사는
// 바닥 높이가 없어 땅에 붙은 덩어리로 길을 막았다) 고가 선로는 처음부터 없었다.
// 바탕 타일(public/dumping/basemap/gwangjin.pmtiles, Protomaps OSM)의 roads 레이어 kind=rail·kind_detail=subway·is_bridge 선, landuse kind=platform 면,
// pois kind=station 점을 읽어 public/dumping/basemap/toon-rail.json 으로 낸다(외부 네트워크 0). 형식:
//   { lines: [{ name, coords: [[lng, lat], ...] }], platforms: [{ coords: [[lng, lat], ...] }], stations: [{ name, lng, lat }] }
// 선은 같은 이름 조각을 끝점으로 이어 붙인다(타일 경계에서 잘린 조각). 승강장은 고가 선 30m 안에 있는 것만(지하역 승강장 제외)
import fs from "node:fs"
import path from "node:path"
import zlib from "node:zlib"
import { PMTiles } from "pmtiles"
import { VectorTile } from "@mapbox/vector-tile"
import { PbfReader } from "pbf"

class FileSource {
  constructor(p) {
    this.p = p
    this.fd = fs.openSync(p, "r")
  }
  getKey() {
    return this.p
  }
  async getBytes(off, len) {
    const b = Buffer.alloc(len)
    fs.readSync(this.fd, b, 0, len, off)
    return { data: b.buffer.slice(b.byteOffset, b.byteOffset + len) }
  }
}

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..")
const BASEMAP = path.join(ROOT, "public/dumping/basemap")
const BBOX = [127.052, 37.525, 127.12, 37.572] // 광진구 + 둘레(잠실철교 북단·성수 쪽 고가 끝까지)
const Z = 15
const n = 2 ** Z
const tx = (lng) => Math.floor(((lng + 180) / 360) * n)
const ty = (lat) => Math.floor(((1 - Math.log(Math.tan((lat * Math.PI) / 180) + 1 / Math.cos((lat * Math.PI) / 180)) / Math.PI) / 2) * n)
const r6 = (v) => Math.round(v * 1e6) / 1e6
const distM = (a, b) => Math.hypot((a[0] - b[0]) * 88200, (a[1] - b[1]) * 110940)
// 점에서 선분까지(m)
function segDist(p, a, b) {
  const ax = (a[0] - p[0]) * 88200, ay = (a[1] - p[1]) * 110940, bx = (b[0] - p[0]) * 88200, by = (b[1] - p[1]) * 110940
  const dx = bx - ax, dy = by - ay
  const t = Math.max(0, Math.min(1, -(ax * dx + ay * dy) / (dx * dx + dy * dy || 1)))
  return Math.hypot(ax + dx * t, ay + dy * t)
}
// 땅 위 고가만: 2호선 본선·성수지선. 7호선 "다리"는 청담대교 아래층(한강 위 다리 높이)이라 땅 위 11m 고가로 그리면 틀린다
const ELEVATED = new Set(["2호선", "성수지선"])

const pm = new PMTiles(new FileSource(path.join(BASEMAP, "gwangjin.pmtiles")))
const segs = new Map() // 이름 → 조각 배열
const seen = new Set()
const platformsRaw = []
const stations = new Map()
for (let x = tx(BBOX[0]); x <= tx(BBOX[2]); x++)
  for (let y = ty(BBOX[3]); y <= ty(BBOX[1]); y++) {
    const t = await pm.getZxy(Z, x, y)
    if (!t) continue
    let buf = Buffer.from(t.data)
    if (buf[0] === 0x1f) buf = zlib.gunzipSync(buf)
    const vt = new VectorTile(new PbfReader(buf))
    const lngW = (x / n) * 360 - 180
    const lngE = ((x + 1) / n) * 360 - 180
    const latN = (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / n))) * 180) / Math.PI
    const latS = (Math.atan(Math.sinh(Math.PI * (1 - (2 * (y + 1)) / n))) * 180) / Math.PI
    const ll = (L, q) => [r6(lngW + (q.x / L.extent) * (lngE - lngW)), r6(latN + (q.y / L.extent) * (latS - latN))]
    const R = vt.layers.roads
    if (R)
      for (let i = 0; i < R.length; i++) {
        const f = R.feature(i)
        const p = f.properties
        if (p.kind !== "rail" || p.kind_detail !== "subway" || !p.is_bridge) continue
        const name = String(p.name ?? p["name:ko"] ?? "")
        if (!ELEVATED.has(name)) continue
        for (const ring of f.loadGeometry()) {
          const pts = ring.map((q) => ll(R, q))
          const k = `${name}|${pts[0]}|${pts[pts.length - 1]}`
          if (pts.length < 2 || seen.has(k)) continue
          seen.add(k)
          if (!segs.has(name)) segs.set(name, [])
          segs.get(name).push(pts)
        }
      }
    const U = vt.layers.landuse
    if (U)
      for (let i = 0; i < U.length; i++) {
        const f = U.feature(i)
        if (f.properties.kind !== "platform" || f.type !== 3) continue
        for (const ring of f.loadGeometry()) platformsRaw.push(ring.map((q) => ll(U, q)))
      }
    const P = vt.layers.pois
    if (P)
      for (let i = 0; i < P.length; i++) {
        const f = P.feature(i)
        if (f.properties.kind !== "station") continue
        const name = String(f.properties.name ?? "")
        const [q] = f.loadGeometry()[0]
        if (name && !stations.has(name)) stations.set(name, ll(P, q))
      }
  }

// 조각 잇기: 끝점이 8m 안이면 붙인다(탐욕, 긴 쪽부터)
function chain(parts) {
  const left = parts.map((p) => p.slice())
  const out = []
  while (left.length) {
    let cur = left.shift()
    let grew = true
    while (grew) {
      grew = false
      for (let i = 0; i < left.length; i++) {
        const s = left[i]
        const [a, b] = [cur[0], cur[cur.length - 1]]
        const [c, d] = [s[0], s[s.length - 1]]
        if (distM(b, c) < 8) cur = cur.concat(s.slice(1))
        else if (distM(b, d) < 8) cur = cur.concat(s.slice(0, -1).reverse())
        else if (distM(a, d) < 8) cur = s.concat(cur.slice(1))
        else if (distM(a, c) < 8) cur = s.slice(1).reverse().concat(cur)
        else continue
        left.splice(i, 1)
        grew = true
        break
      }
    }
    out.push(cur)
  }
  return out
}
const lines = []
for (const [name, parts] of segs) for (const c of chain(parts)) {
  let len = 0
  for (let i = 1; i < c.length; i++) len += distM(c[i - 1], c[i])
  if (len > 60) lines.push({ name, coords: c, len: Math.round(len) })
}
lines.sort((a, b) => b.len - a.len)
// 승강장: 고가 선 30m 안(타일 경계 중복 면은 가운데가 10m 안이면 같은 것)
const near = (pt, d = 30) => lines.some((l) => l.coords.some((c, i) => i > 0 && segDist(pt, l.coords[i - 1], c) < d))
const platforms = []
for (const ring of platformsRaw) {
  const c = [ring.reduce((s, p) => s + p[0], 0) / ring.length, ring.reduce((s, p) => s + p[1], 0) / ring.length]
  if (!near(c)) continue
  if (platforms.some((p) => distM(p.c, c) < 10)) continue
  platforms.push({ c, coords: ring })
}
const st = [...stations].filter(([, p]) => near(p, 90)).map(([name, [lng, lat]]) => ({ name, lng, lat }))
const out = { lines: lines.map(({ name, coords }) => ({ name, coords })), platforms: platforms.map(({ coords }) => ({ coords })), stations: st }
fs.writeFileSync(path.join(BASEMAP, "toon-rail.json"), JSON.stringify(out))
console.log(`고가 선 ${lines.length}(${lines.map((l) => `${l.name || "?"} ${l.len}m`).join(", ")}) · 승강장 ${platforms.length} · 역 ${st.map((s) => s.name).join(", ")}`)
