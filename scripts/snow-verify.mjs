// /snow 선형 검증. map.json의 열선·취약구간·결빙구간 경로가 ①물(한강·중랑천, pmtiles water 레이어) 위를 지나는지 ②구 경계 밖으로 얼마나 나가는지 ③직선의 몇 배로 도는지 표로 낸다.
//   node scripts/snow-verify.mjs            위반이 있으면 종료 코드 1(게이트)
// 물 위 판정: 경로를 15m 간격 표본화해 water 폴리곤(z14) 안에 든 점 수. 교량 위 정상 경로(청담대교·잠실대교 램프)는 도로 종류가 bridge인 조각에서만 허용
import fs from "node:fs"
import path from "node:path"
import zlib from "node:zlib"
import { PMTiles } from "pmtiles"
import { VectorTile } from "@mapbox/vector-tile"
import Pbf from "pbf"
import { distM, GWANGJIN_BBOX } from "./snow-roads.mjs"

const ROOT = path.resolve(new URL(".", import.meta.url).pathname, "..")
const map = JSON.parse(fs.readFileSync(path.join(ROOT, "data/snow/map.json"), "utf8"))

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
function tileXY(lng, lat, z) {
  const n = 2 ** z
  return [Math.floor(((lng + 180) / 360) * n), Math.floor(((1 - Math.log(Math.tan((lat * Math.PI) / 180) + 1 / Math.cos((lat * Math.PI) / 180)) / Math.PI) / 2) * n)]
}
function tileBounds(x, y, z) {
  const n = 2 ** z
  return { lngW: (x / n) * 360 - 180, lngE: ((x + 1) / n) * 360 - 180, latN: (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / n))) * 180) / Math.PI, latS: (Math.atan(Math.sinh(Math.PI * (1 - (2 * (y + 1)) / n))) * 180) / Math.PI }
}
function pip(lat, lng, ring) {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [yi, xi] = ring[i]
    const [yj, xj] = ring[j]
    if (yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

// 물 폴리곤(외곽 링만. 구멍은 무시. 큰 수역만: 면적 대용으로 점 수 40 이상)
async function loadWater() {
  const pm = new PMTiles(new FileSource(path.join(ROOT, "public/dumping/basemap/gwangjin.pmtiles")))
  const z = 14
  const [x0, y0] = tileXY(GWANGJIN_BBOX[0], GWANGJIN_BBOX[3], z)
  const [x1, y1] = tileXY(GWANGJIN_BBOX[2], GWANGJIN_BBOX[1], z)
  const rings = []
  for (let x = x0; x <= x1; x++)
    for (let y = y0; y <= y1; y++) {
      const t = await pm.getZxy(z, x, y)
      if (!t) continue
      let buf = Buffer.from(t.data)
      if (buf[0] === 0x1f) buf = zlib.gunzipSync(buf)
      const vt = new VectorTile(new Pbf(buf))
      const L = vt.layers.water
      if (!L) continue
      const { lngW, lngE, latN, latS } = tileBounds(x, y, z)
      for (let i = 0; i < L.length; i++) {
        const f = L.feature(i)
        if (f.type !== 3) continue
        const kind = f.properties.kind
        if (kind && !/water|river|lake|reservoir|ocean/.test(kind)) continue
        for (const ring of f.loadGeometry()) {
          if (ring.length < 40) continue
          rings.push(ring.map((q) => [latN + (q.y / L.extent) * (latS - latN), lngW + (q.x / L.extent) * (lngE - lngW)]))
        }
      }
    }
  return rings
}
const inWater = (rings, p) => rings.some((r) => pip(p[0], p[1], r))
function sample(coords, step = 15) {
  const out = [coords[0]]
  for (let i = 1; i < coords.length; i++) {
    const a = coords[i - 1]
    const b = coords[i]
    const L = distM(a, b)
    for (let d = step; d < L; d += step) out.push([a[0] + (b[0] - a[0]) * (d / L), a[1] + (b[1] - a[1]) * (d / L)])
    out.push(b)
  }
  return out
}
function outsideM(ring, p) {
  if (pip(p[0], p[1], ring)) return 0
  let best = Infinity
  for (let i = 0; i < ring.length; i++) best = Math.min(best, distM(p, ring[i]))
  return best
}

async function main() {
  const water = await loadWater()
  const ring = map.ring
  const rows = []
  const check = (kind, id, name, coords, method) => {
    if (!coords || coords.length < 2) return
    const pts = sample(coords)
    const wet = pts.filter((p) => inWater(water, p)).length
    const out = Math.round(Math.max(...pts.map((p) => outsideM(ring, p))))
    const straight = distM(coords[0], coords[coords.length - 1])
    let len = 0
    for (let i = 1; i < coords.length; i++) len += distM(coords[i - 1], coords[i])
    const ratio = straight > 20 ? len / straight : 1
    const flags = []
    if (wet / pts.length > 0.3 && method !== "trunk") flags.push(`물 위 ${Math.round((wet / pts.length) * 100)}%`)
    if (out > 300) flags.push(`구 밖 ${out}m`)
    if (ratio > 3 && len > 120) flags.push(`우회 ${ratio.toFixed(1)}배`)
    rows.push({ kind, id, name, method, len: Math.round(len), straight: Math.round(straight), wet: Math.round((wet / pts.length) * 100), out, flags })
  }
  for (const h of map.heat) check("열선", h.i, h.route || h.roadName || h.from, h.path, h.method)
  for (const w of map.weak) check("취약", w.i, w.name, w.path, w.method)
  for (const s of map.ice) if (s.method !== "points") check("결빙", s.id, s.road, s.path, s.method)
  const bad = rows.filter((r) => r.flags.length)
  console.log(`검사 ${rows.length}구간 · 위반 ${bad.length}`)
  for (const r of bad) console.log(`  ${r.kind} ${r.id} ${r.name} [${r.method}] 경로 ${r.len}m 직선 ${r.straight}m · ${r.flags.join(" · ")}`)
  const md = ["| 종류 | 번호 | 이름 | 방법 | 경로(m) | 직선(m) | 물 위 % | 구 밖(m) | 판정 |", "|---|---|---|---|---|---|---|---|---|", ...rows.map((r) => `| ${r.kind} | ${r.id} | ${r.name} | ${r.method} | ${r.len} | ${r.straight} | ${r.wet} | ${r.out} | ${r.flags.join(" · ") || "통과"} |`)].join("\n")
  fs.writeFileSync(path.join(ROOT, "docs/snow-verify-latest.md"), `# /snow 선형 검증(자동 생성 ${new Date().toISOString().slice(0, 10)})\n\n\`node scripts/snow-verify.mjs\` 결과. 물 위 30% 초과(교량 체인 제외)·구 밖 300m 초과·직선 3배 초과 우회를 위반으로 본다.\n\n${md}\n`)
  process.exit(bad.length ? 1 : 0)
}
main()
