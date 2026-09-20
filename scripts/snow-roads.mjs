// /snow 도로망 도구. 로컬 pmtiles(public/dumping/basemap)만 읽는다. 외부 라우팅·타일 서비스 0.
//   loadRoads()            gwangjin.pmtiles z15 roads 레이어 → 노드·엣지 그래프(이름·종류·길이)
//   snapPath(net, a, b, name, lengthM)   기점·종점 두 점을 도로 선형으로 잇는다(같은 이름 도로 우선 다익스트라). 두 점이 같으면 그 점 주변 도로를 연장만큼 자른다
//   loadDem()              dem.pmtiles(terrarium z14) → elevation(lat,lng) 미터
//   steepSegments(net, dem, opts)   도로 폴리라인을 따라 창(window) 단위 경사를 계산해 기준 이상 구간을 낸다("추정")
// 디코딩은 node_modules의 pmtiles·@mapbox/vector-tile·pbf·sharp. 파일 소스는 getBytes(off,len)만 있으면 된다.
import fs from "node:fs"
import path from "node:path"
import zlib from "node:zlib"
import { PMTiles } from "pmtiles"
import { VectorTile } from "@mapbox/vector-tile"
import Pbf from "pbf"
import sharp from "sharp"

const ROOT = path.resolve(new URL(".", import.meta.url).pathname, "..")
const BASEMAP = path.join(ROOT, "public/dumping/basemap")
export const GWANGJIN_BBOX = [127.055, 37.515, 127.125, 37.58] // [w,s,e,n]

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

const R = 6371008.8
export function distM(a, b) {
  const dLat = ((b[0] - a[0]) * Math.PI) / 180
  const dLng = ((b[1] - a[1]) * Math.PI) / 180
  const la1 = (a[0] * Math.PI) / 180
  const la2 = (b[0] * Math.PI) / 180
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}
const round6 = (v) => Math.round(v * 1e6) / 1e6
// 노드 키는 약 2m 격자로 양자화한다. ★타일마다 같은 교차점 좌표가 미세하게 달라(타일 격자 양자화) 6자리 키로는 그래프가 3,953조각으로 끊겼다(청담대교 남단이 섬. 2026-09-20 실측)
const GRID_LAT = 0.000018 // ≈2.0m
const GRID_LNG = 0.0000227 // ≈2.0m at 37.55N
const key = (p) => `${Math.round(p[0] / GRID_LAT)},${Math.round(p[1] / GRID_LNG)}`

function tileXY(lng, lat, z) {
  const n = 2 ** z
  const x = Math.floor(((lng + 180) / 360) * n)
  const y = Math.floor(((1 - Math.log(Math.tan((lat * Math.PI) / 180) + 1 / Math.cos((lat * Math.PI) / 180)) / Math.PI) / 2) * n)
  return [x, y]
}
function tileBounds(x, y, z) {
  const n = 2 ** z
  const lngW = (x / n) * 360 - 180
  const lngE = ((x + 1) / n) * 360 - 180
  const latN = (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / n))) * 180) / Math.PI
  const latS = (Math.atan(Math.sinh(Math.PI * (1 - (2 * (y + 1)) / n))) * 180) / Math.PI
  return { lngW, lngE, latN, latS }
}

// 도로 이름 정규화: 공백 제거, "능동로 17길"→"능동로17길"
export const normRoadName = (s) => (s || "").replace(/\s+/g, "")

// ─── 도로망 ───
const ROAD_KINDS = new Set(["highway", "major_road", "minor_road", "other"]) // path(보도·계단·자전거)는 includePaths일 때만, 경로 가중치 1.8배
export async function loadRoads({ bbox = GWANGJIN_BBOX, z = 15, includePaths = true } = {}) {
  const pm = new PMTiles(new FileSource(path.join(BASEMAP, "gwangjin.pmtiles")))
  const [x0, y0] = tileXY(bbox[0], bbox[3], z)
  const [x1, y1] = tileXY(bbox[2], bbox[1], z)
  const nodes = new Map() // key → {p:[lat,lng], adj:[edgeIdx]}
  const edges = [] // {a,b,name,kind,detail,len,akey,bkey}
  const seen = new Set()
  const nodeOf = (p) => {
    const k = key(p)
    let n = nodes.get(k)
    if (!n) nodes.set(k, (n = { p: [round6(p[0]), round6(p[1])], adj: [] }))
    return k
  }
  for (let x = x0; x <= x1; x++) {
    for (let y = y0; y <= y1; y++) {
      const t = await pm.getZxy(z, x, y)
      if (!t) continue
      let buf = Buffer.from(t.data)
      if (buf[0] === 0x1f) buf = zlib.gunzipSync(buf)
      const vt = new VectorTile(new Pbf(buf))
      const L = vt.layers.roads
      if (!L) continue
      const { lngW, lngE, latN, latS } = tileBounds(x, y, z)
      for (let i = 0; i < L.length; i++) {
        const f = L.feature(i)
        const kind = f.properties.kind
        if (!ROAD_KINDS.has(kind) && !(includePaths && kind === "path")) continue
        const detail = f.properties.kind_detail || ""
        if (detail === "raceway") continue
        const name = normRoadName(f.properties.name || f.properties["name:ko"] || "")
        const bridge = !!(f.properties.is_bridge || f.properties.is_tunnel || (f.properties.layer && f.properties.layer !== 0))
        const geom = f.loadGeometry()
        for (const ring of geom) {
          const pts = ring.map((q) => [latN + (q.y / L.extent) * (latS - latN), lngW + (q.x / L.extent) * (lngE - lngW)])
          for (let j = 1; j < pts.length; j++) {
            const a = pts[j - 1]
            const b = pts[j]
            // 타일 버퍼 조각은 이웃 타일과 같은 좌표라 아래 seen(양 끝 좌표 키)으로 중복 제거된다.
            // ★양 끝이 타일 밖인 조각을 버리면 긴 간선·교량 조각(청담대교 등)이 모든 타일에서 사라져 경로가 끊긴다(2026-09-20 실사고). 버리지 않는다
            const ak = nodeOf(a)
            const bk = nodeOf(b)
            if (ak === bk) continue
            const ek = ak < bk ? `${ak}|${bk}` : `${bk}|${ak}`
            if (seen.has(ek)) continue
            seen.add(ek)
            const len = distM(nodes.get(ak).p, nodes.get(bk).p)
            const idx = edges.push({ a: nodes.get(ak).p, b: nodes.get(bk).p, akey: ak, bkey: bk, name, kind, detail, len, bridge }) - 1
            nodes.get(ak).adj.push(idx)
            nodes.get(bk).adj.push(idx)
          }
        }
      }
    }
  }
  stitchTileSeams(nodes, edges)
  return { nodes, edges }
}

// ★타일 경계 봉합. z15 타일 경계에서 잘린 긴 선분(교량·간선)은 양쪽 타일의 잘린 끝점 좌표가 서로 다르다(extent 양자화 + 버퍼).
// 청담대교 분당수서로가 37.5273(타일 y 경계)에서 285m·401m 두 조각으로 끊겨 한강 남쪽 1,541노드가 섬이 됐다(2026-09-20 실측).
// 끝점(차수 1) 노드끼리 같은 이름·같은 종류이고 45m 안이면 짧은 엣지로 잇는다
function stitchTileSeams(nodes, edges, { maxM = 45 } = {}) {
  const ends = []
  for (const [k, n] of nodes) if (n.adj.length === 1) ends.push({ k, n, e: edges[n.adj[0]] })
  const cell = (p) => `${Math.floor(p[0] / 0.0005)},${Math.floor(p[1] / 0.0006)}`
  const buckets = new Map()
  for (const x of ends) (buckets.get(cell(x.n.p)) ?? buckets.set(cell(x.n.p), []).get(cell(x.n.p))).push(x)
  const used = new Set()
  let stitched = 0
  for (const x of ends) {
    if (used.has(x.k)) continue
    const [ci, cj] = cell(x.n.p).split(",").map(Number)
    let best = null
    for (let di = -1; di <= 1; di++)
      for (let dj = -1; dj <= 1; dj++)
        for (const y of buckets.get(`${ci + di},${cj + dj}`) ?? []) {
          if (y.k === x.k || used.has(y.k)) continue
          if (y.e.name !== x.e.name || y.e.kind !== x.e.kind) continue
          const d = distM(x.n.p, y.n.p)
          if (d <= maxM && (!best || d < best.d)) best = { y, d }
        }
    if (!best) continue
    const { y, d } = best
    const idx = edges.push({ a: x.n.p, b: y.n.p, akey: x.k, bkey: y.k, name: x.e.name, kind: x.e.kind, detail: x.e.detail, len: d, bridge: x.e.bridge || y.e.bridge, seam: true }) - 1
    x.n.adj.push(idx)
    y.n.adj.push(idx)
    used.add(x.k)
    used.add(y.k)
    stitched++
  }
  return stitched
}

// 점에서 선분까지: 투영점·거리·선분 위치 비율
function projectOnSeg(p, a, b) {
  const cos = Math.cos((p[0] * Math.PI) / 180)
  const ax = (a[1] - p[1]) * cos
  const ay = a[0] - p[0]
  const bx = (b[1] - p[1]) * cos
  const by = b[0] - p[0]
  const dx = bx - ax
  const dy = by - ay
  const l2 = dx * dx + dy * dy
  let t = l2 ? -(ax * dx + ay * dy) / l2 : 0
  t = Math.max(0, Math.min(1, t))
  const q = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]
  return { q, d: distM(p, q), t }
}

// 점 p에 가장 가까운 엣지(이름이 맞는 엣지를 우선). 반환 {edge, idx, q, d, t}
export function nearestEdge(net, p, { name = "", namedRadius = 150, anyRadius = 110, allowPath = false, kinds = null, nameOnly = false } = {}) {
  let bestNamed = null
  let bestAny = null
  const nm = normRoadName(name)
  for (let i = 0; i < net.edges.length; i++) {
    const e = net.edges[i]
    if (e.kind === "path" && !allowPath) continue
    if (kinds && !kinds.includes(e.kind)) continue
    // 빠른 거르기: 위도 0.003(≈330m) 밖은 무시
    if (Math.abs(e.a[0] - p[0]) > 0.003 || Math.abs(e.a[1] - p[1]) > 0.004) continue
    const r = projectOnSeg(p, e.a, e.b)
    if (nm && e.name === nm && (!bestNamed || r.d < bestNamed.d)) bestNamed = { edge: e, idx: i, ...r }
    if (!bestAny || r.d < bestAny.d) bestAny = { edge: e, idx: i, ...r }
  }
  if (bestNamed && bestNamed.d <= namedRadius) return { ...bestNamed, byName: true }
  if (nameOnly) return null
  if (bestAny && bestAny.d <= anyRadius) return { ...bestAny, byName: false }
  return null
}

// 다익스트라: 임시 노드 두 개(투영점)를 그래프에 끼워 넣고 최단 경로. 같은 이름 엣지는 가중치 0.3
function dijkstra(net, from, to, name, { pathPenalty = 1.8 } = {}) {
  const nm = normRoadName(name)
  const w = (e) => e.len * (nm && e.name === nm ? 0.3 : 1) * (e.kind === "path" ? pathPenalty : 1)
  // 임시 노드: from.q / to.q, 각각 자기 엣지 양 끝과 연결
  const tmp = new Map()
  const addTmp = (id, hit) => {
    const e = hit.edge
    tmp.set(id, { p: hit.q, links: [
      { to: e.akey, len: distM(hit.q, e.a), cost: distM(hit.q, e.a) * (nm && e.name === nm ? 0.3 : 1) * (e.kind === "path" ? pathPenalty : 1), edge: e },
      { to: e.bkey, len: distM(hit.q, e.b), cost: distM(hit.q, e.b) * (nm && e.name === nm ? 0.3 : 1) * (e.kind === "path" ? pathPenalty : 1), edge: e },
    ] })
  }
  addTmp("__from", from)
  addTmp("__to", to)
  // 같은 엣지 위에 둘 다 있으면 바로 잇는다
  if (from.idx === to.idx) return { coords: [from.q, to.q], len: distM(from.q, to.q), edges: [from.edge] }
  const dist = new Map([["__from", 0]])
  const prev = new Map()
  const done = new Set()
  // 단순 이진 힙 대신 배열 우선순위(그래프가 5천 엣지라 충분)
  const open = [["__from", 0]]
  const neighbors = (id) => {
    if (tmp.has(id)) return tmp.get(id).links
    const n = net.nodes.get(id)
    const out = []
    for (const ei of n.adj) {
      const e = net.edges[ei]
      const other = e.akey === id ? e.bkey : e.akey
      out.push({ to: other, len: e.len, cost: w(e), edge: e })
    }
    // 목적지 임시 노드가 이 엣지 위에 있으면 연결
    for (const l of tmp.get("__to").links) if (l.to === id) out.push({ to: "__to", len: l.len, cost: l.cost, edge: l.edge })
    return out
  }
  while (open.length) {
    open.sort((x, y) => x[1] - y[1])
    const [u, du] = open.shift()
    if (done.has(u)) continue
    done.add(u)
    if (u === "__to") break
    if (du > 6000) break // 6km 넘게 돌면 포기
    for (const l of neighbors(u)) {
      const nd = du + l.cost
      if (nd < (dist.get(l.to) ?? Infinity)) {
        dist.set(l.to, nd)
        prev.set(l.to, { from: u, edge: l.edge, len: l.len })
        open.push([l.to, nd])
      }
    }
  }
  if (!prev.has("__to")) return null
  const coords = []
  const usedEdges = []
  let len = 0
  let cur = "__to"
  while (cur) {
    coords.push(tmp.has(cur) ? tmp.get(cur).p : net.nodes.get(cur).p)
    const pv = prev.get(cur)
    if (!pv) break
    usedEdges.push(pv.edge)
    len += pv.len
    cur = pv.from
  }
  coords.reverse()
  return { coords, len, edges: usedEdges }
}

// 한 점에서 같은 이름 도로를 따라 양쪽으로 total/2씩 걸어 선형을 만든다(기점=종점인 행)
function walkAround(net, hit, name, total) {
  const nm = normRoadName(name)
  const half = total / 2
  const side = (startKey, firstLen, firstP) => {
    const pts = [firstP]
    let remain = half - firstLen
    let cur = startKey
    let prevEdge = hit.edge
    let guard = 0
    if (remain <= 0) {
      // 첫 조각 안에서 끝
      const e = hit.edge
      const end = startKey === e.akey ? e.a : e.b
      const t = half / firstLen
      return [[hit.q[0] + (end[0] - hit.q[0]) * t, hit.q[1] + (end[1] - hit.q[1]) * t]]
    }
    while (remain > 0 && guard++ < 60) {
      const n = net.nodes.get(cur)
      const cands = n.adj.map((i) => net.edges[i]).filter((e) => e !== prevEdge)
      if (!cands.length) break
      const same = cands.filter((e) => nm && e.name === nm)
      const pick = (same.length ? same : cands.filter((e) => e.name === prevEdge.name))[0] ?? (same.length ? null : null)
      if (!pick) break
      const other = pick.akey === cur ? pick.b : pick.a
      const from = net.nodes.get(cur).p
      if (pick.len >= remain) {
        const t = remain / pick.len
        pts.push([from[0] + (other[0] - from[0]) * t, from[1] + (other[1] - from[1]) * t])
        remain = 0
        break
      }
      pts.push(other)
      remain -= pick.len
      cur = pick.akey === cur ? pick.bkey : pick.akey
      prevEdge = pick
    }
    return pts
  }
  const e = hit.edge
  const left = side(e.akey, distM(hit.q, e.a), e.a)
  const right = side(e.bkey, distM(hit.q, e.b), e.b)
  const coords = [...left.reverse(), hit.q, ...right]
  let len = 0
  for (let i = 1; i < coords.length; i++) len += distM(coords[i - 1], coords[i])
  return { coords, len }
}

// 노선명 문자열에서 도로 이름만("자양로44길 구의2동 어린이집"→"자양로44길", "능동로30길23"→"능동로30길", "능동로 17길"→"능동로17길")
export function routeRoadName(route) {
  const t = normRoadName(route)
  const m = t.match(/^([가-힣]+?(?:\d+[가-힣]?)?(?:로|길))(\d+[가-힣]?길)?/)
  return m ? m[1] + (m[2] ?? "") : ""
}
// 차로수 "2"·"1~1.5"·"1~2" → 수. 1차로 기준 연장 ÷ 차로수 = 물리 길이
export function lanesNum(lanes) {
  if (!lanes) return null
  const nums = String(lanes).match(/\d+(?:\.\d+)?/g)
  if (!nums) return null
  const v = nums.map(Number)
  return v.reduce((a, b) => a + b, 0) / v.length
}

// 기점 a·종점 b([lat,lng])를 도로 선형으로. expectM = 기대 물리 길이(연장÷차로수). 반환 {coords:[[lat,lng]...], len, method, approx, note, roadName}
// opts.kinds: 후보 도로 종류 제한(간선 결빙구간은 ["major_road","highway"]). opts.nameOnly: 노선명 도로에만 붙인다(못 붙이면 직선)
export function snapPath(net, a, b, name, expectM, { allowPath = false, kinds = null, nameOnly = false } = {}) {
  const same = distM(a, b) < 15
  const nm = normRoadName(name)
  const eo = { allowPath, kinds, nameOnly, namedRadius: nameOnly ? 260 : 150 }
  const ha = nearestEdge(net, a, { name: nm, ...eo })
  const hb = same ? ha : nearestEdge(net, b, { name: nm, ...eo })
  if (!ha || !hb) return { coords: [a, b], len: distM(a, b), method: "straight", approx: true, note: "기점·종점 110m 안에 도로가 없어 직선", roadName: "" }
  if (same) {
    const w = walkAround(net, ha, nm, Math.max(expectM || 60, 30))
    return { coords: w.coords, len: w.len, method: "point", approx: true, note: `기점과 종점이 같은 주소라 ${ha.byName ? "노선명 도로" : "가장 가까운 도로"}를 따라 연장만큼 그림`, roadName: ha.edge.name }
  }
  // 후보: ① 노선명 가중 경로 ② 같은 출발·도착 조각에서 이름 무시 최단 ③ 가장 가까운 도로(이름 무시)에서 최단. 기대 물리 길이에 가장 가까운 것
  const cands = []
  const p1 = dijkstra(net, ha, hb, nm)
  if (p1) cands.push(p1)
  if (nm) {
    const p2 = dijkstra(net, ha, hb, "")
    if (p2) cands.push(p2)
  }
  const ha2 = nameOnly ? null : nearestEdge(net, a, { name: "", allowPath, kinds })
  const hb2 = nameOnly ? null : nearestEdge(net, b, { name: "", allowPath, kinds })
  if (ha2 && hb2 && (ha2.idx !== ha.idx || hb2.idx !== hb.idx)) {
    const p3 = dijkstra(net, ha2, hb2, "")
    if (p3) cands.push(p3)
  }
  if (!cands.length) return { coords: [a, b], len: distM(a, b), method: "straight", approx: true, note: "도로망에서 경로를 찾지 못해 직선", roadName: "" }
  const straight = distM(a, b)
  const score = (p) => (expectM ? Math.abs(p.len - expectM) / expectM : p.len / straight)
  cands.sort((x, y) => score(x) - score(y))
  const p = cands[0]
  const roadNames = [...new Set(p.edges.map((e) => e.name).filter(Boolean))]
  // 인접 지번이라 두 점이 거의 붙어 경로가 연장의 절반도 안 되면, 경로 가운데에서 도로를 따라 연장만큼 늘린다
  if (expectM && p.len < expectM * 0.5) {
    const mid = p.coords[Math.floor(p.coords.length / 2)]
    const hm = nearestEdge(net, mid, { name: nm || roadNames[0] || "", allowPath, kinds })
    if (hm) {
      const w = walkAround(net, hm, nm || roadNames[0] || "", expectM)
      return { coords: w.coords, len: w.len, method: "point", approx: true, note: "기점·종점이 인접 지번이라 도로를 따라 연장만큼 그림", roadName: hm.edge.name }
    }
  }
  // 도로망이 두 점 사이를 직접 잇지 못해 크게 돌면(학교 담장 옆 보행로 등 OSM에 없는 길) 직선이 더 정직하다
  if (p.len > Math.max(straight * 3, straight + 150)) return { coords: [a, b], len: straight, method: "straight", approx: true, note: "도로망 경로가 직선의 3배를 넘어 직선으로 둠(지도에 없는 보행로로 추정)", roadName: "" }
  const named = nm ? p.edges.filter((e) => e.name === nm).reduce((s, e) => s + e.len, 0) : 0
  const ratio = named / Math.max(1, p.len)
  const byName = !!nm && ratio >= 0.5
  const detour = p.len > straight * 2.2 && p.len > 80
  return {
    coords: p.coords,
    len: p.len,
    method: byName ? "named" : "network",
    approx: !byName || detour,
    note: byName ? (detour ? "경로가 직선거리의 2배를 넘어 우회일 수 있음" : "") : `노선명과 다른 도로(${roadNames.slice(0, 2).join("·") || "이름 없음"})로 이었음`,
    roadName: roadNames[0] ?? "",
  }
}

// 간선(자동차전용도로) 구간: 두 점을 간선 체인(roadChains) 위에 투영해 체인을 그 사이만 자른다.
// 상습결빙구간(동부간선·강변북로·청담대교·천호대로 등)은 램프 연결이 끊긴 그래프에서 다익스트라가 8km를 돌거나 실패한다(2026-09-20 실측) → 체인 절단이 정답.
// 방향별 차로가 별도 체인이라 U자로 도는 체인이 있다 → 절단 길이가 직선의 maxRatio배를 넘으면 기각. 행안부 도로명은 OSM과 달라 별칭 표를 둔다
const TRUNK_ALIAS = { 동부간선도로: ["동부간선로", "강변북로", "분당수서로"], 강변역로: ["강변역로", "강변북로"], 광나루로: ["광나루로"], 자양로: ["자양로"], 워커힐로: ["워커힐로"], 천호대로: ["천호대로"], 아차산로: ["아차산로"] }
export function snapAlongTrunk(net, a, b, { roadName = "", kinds = ["highway", "major_road"], maxOffM = 160, maxRatio = 2.5, chains = null } = {}) {
  const list = chains ?? roadChains(net, { kinds, excludeDetail: [], skipBridges: false })
  const wanted = TRUNK_ALIAS[normRoadName(roadName)] ?? (roadName ? [normRoadName(roadName)] : null)
  const straight = distM(a, b)
  const proj = (c, p) => {
    let bestD = Infinity
    let bestS = 0
    let bestQ = null
    let acc = 0
    for (let i = 1; i < c.pts.length; i++) {
      const r = projectOnSeg(p, c.pts[i - 1], c.pts[i])
      const L = distM(c.pts[i - 1], c.pts[i])
      if (r.d < bestD) {
        bestD = r.d
        bestS = acc + r.t * L
        bestQ = r.q
      }
      acc += L
    }
    return { d: bestD, s: bestS, q: bestQ }
  }
  const cut = (c, pa, pb) => {
    const [s0, s1, q0, q1] = pa.s <= pb.s ? [pa.s, pb.s, pa.q, pb.q] : [pb.s, pa.s, pb.q, pa.q]
    const coords = [q0]
    let acc = 0
    for (let i = 1; i < c.pts.length; i++) {
      const L = distM(c.pts[i - 1], c.pts[i])
      if (acc > s0 && acc < s1) coords.push(c.pts[i - 1])
      acc += L
      if (acc >= s1) break
    }
    coords.push(q1)
    let len = 0
    for (let i = 1; i < coords.length; i++) len += distM(coords[i - 1], coords[i])
    return { coords, len }
  }
  let best = null
  for (const c of list) {
    if (c.len < 150) continue
    if (wanted && !wanted.includes(c.name)) continue
    const pa = proj(c, a)
    const pb = proj(c, b)
    if (pa.d > maxOffM || pb.d > maxOffM) continue
    const k = cut(c, pa, pb)
    if (k.len > straight * maxRatio + 40) continue
    const score = pa.d + pb.d + Math.abs(k.len - straight) * 0.2
    if (!best || score < best.score) best = { c, k, score, off: Math.round(Math.max(pa.d, pb.d)) }
  }
  if (!best) return null
  return { coords: best.k.coords, len: best.k.len, method: "trunk", approx: best.off > 60, note: `${best.c.name || "간선"}을 따라 두 점 사이를 그림(도로에서 최대 ${best.off}m)`, roadName: best.c.name }
}

// ─── 지형(terrarium) ───
export async function loadDem({ z = 14 } = {}) {
  const pm = new PMTiles(new FileSource(path.join(BASEMAP, "dem.pmtiles")))
  const cache = new Map()
  async function tile(x, y) {
    const k = `${x}/${y}`
    if (cache.has(k)) return cache.get(k)
    const t = await pm.getZxy(z, x, y)
    if (!t) {
      cache.set(k, null)
      return null
    }
    const { data, info } = await sharp(Buffer.from(t.data)).raw().toBuffer({ resolveWithObject: true })
    const out = { data, w: info.width, h: info.height, ch: info.channels }
    cache.set(k, out)
    return out
  }
  // 이중선형 보간 고도(m)
  async function elevation(lat, lng) {
    const n = 2 ** z
    const fx = ((lng + 180) / 360) * n
    const fy = ((1 - Math.log(Math.tan((lat * Math.PI) / 180) + 1 / Math.cos((lat * Math.PI) / 180)) / Math.PI) / 2) * n
    const tx = Math.floor(fx)
    const ty = Math.floor(fy)
    const T = await tile(tx, ty)
    if (!T) return null
    const px = (fx - tx) * T.w - 0.5
    const py = (fy - ty) * T.h - 0.5
    const x0 = Math.max(0, Math.min(T.w - 1, Math.floor(px)))
    const y0 = Math.max(0, Math.min(T.h - 1, Math.floor(py)))
    const x1 = Math.min(T.w - 1, x0 + 1)
    const y1 = Math.min(T.h - 1, y0 + 1)
    const at = (x, y) => {
      const i = (y * T.w + x) * T.ch
      return T.data[i] * 256 + T.data[i + 1] + T.data[i + 2] / 256 - 32768
    }
    const sx = Math.max(0, Math.min(1, px - x0))
    const sy = Math.max(0, Math.min(1, py - y0))
    const top = at(x0, y0) * (1 - sx) + at(x1, y0) * sx
    const bot = at(x0, y1) * (1 - sx) + at(x1, y1) * sx
    return top * (1 - sy) + bot * sy
  }
  return { elevation, z }
}

// 이름 있는 도로를 이어 붙인 폴리라인(체인). 같은 이름 엣지를 끝점으로 탐욕 연결. 교량·터널 조각은 뺀다(지형 고도가 도로 고도가 아니다)
export function roadChains(net, { kinds = ["major_road", "minor_road", "other"], excludeDetail = ["motorway", "motorway_link", "trunk", "trunk_link", "primary", "primary_link"], skipBridges = true } = {}) {
  const byName = new Map()
  for (const e of net.edges) {
    if (!e.name || !kinds.includes(e.kind) || excludeDetail.includes(e.detail)) continue
    if (skipBridges && e.bridge) continue
    ;(byName.get(e.name) ?? byName.set(e.name, []).get(e.name)).push(e)
  }
  const chains = []
  for (const [name, es] of byName) {
    const used = new Set()
    const adj = new Map()
    for (const e of es) {
      ;(adj.get(e.akey) ?? adj.set(e.akey, []).get(e.akey)).push(e)
      ;(adj.get(e.bkey) ?? adj.set(e.bkey, []).get(e.bkey)).push(e)
    }
    for (const e0 of es) {
      if (used.has(e0)) continue
      used.add(e0)
      const pts = [e0.a, e0.b]
      const extend = (endKey, atFront) => {
        let cur = endKey
        let guard = 0
        while (guard++ < 400) {
          const next = (adj.get(cur) ?? []).find((e) => !used.has(e))
          if (!next) break
          used.add(next)
          const other = next.akey === cur ? next.b : next.a
          if (atFront) pts.unshift(other)
          else pts.push(other)
          cur = next.akey === cur ? next.bkey : next.akey
        }
      }
      extend(e0.bkey, false)
      extend(e0.akey, true)
      let len = 0
      for (let i = 1; i < pts.length; i++) len += distM(pts[i - 1], pts[i])
      chains.push({ name, kind: e0.kind, detail: e0.detail, pts, len })
    }
  }
  return chains
}

// 체인을 step(m) 간격으로 재표본하고 window(m) 창의 고도차로 경사(%)를 낸다. minGrade 이상인 창이 이어진 구간을 하나로 묶는다
export async function steepSegments(net, dem, { window = 60, step = 20, minGrade = 5, minLen = 40, chains = null } = {}) {
  const out = []
  const list = chains ?? roadChains(net)
  const winN = Math.max(1, Math.round(window / step))
  for (const c of list) {
    if (c.len < window) continue
    const samples = [{ p: c.pts[0], s: 0 }]
    let acc = 0
    for (let i = 1; i < c.pts.length; i++) {
      const a = c.pts[i - 1]
      const b = c.pts[i]
      const L = distM(a, b)
      let d = step - (acc % step)
      while (d < L) {
        const t = d / L
        samples.push({ p: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t], s: acc + d })
        d += step
      }
      acc += L
    }
    samples.push({ p: c.pts[c.pts.length - 1], s: acc })
    for (const smp of samples) smp.h = await dem.elevation(smp.p[0], smp.p[1])
    if (samples.some((smp) => smp.h == null)) continue
    // 창마다 경사. steep[i] = 창 i(샘플 i..i+winN)가 기준 이상
    const grades = []
    for (let i = 0; i + winN < samples.length; i++) {
      const run = samples[i + winN].s - samples[i].s
      grades.push(run >= window * 0.6 ? (Math.abs(samples[i + winN].h - samples[i].h) / run) * 100 : 0)
    }
    let i = 0
    while (i < grades.length) {
      if (grades[i] < minGrade) {
        i++
        continue
      }
      let j = i
      let maxG = 0
      while (j < grades.length && grades[j] >= minGrade) {
        maxG = Math.max(maxG, grades[j])
        j++
      }
      const pts = samples.slice(i, j - 1 + winN + 1)
      const len = pts[pts.length - 1].s - pts[0].s
      if (len >= minLen) {
        const hs = pts.map((q) => q.h)
        out.push({
          name: c.name,
          kind: c.kind,
          detail: c.detail,
          coords: pts.map((q) => [Math.round(q.p[0] * 1e6) / 1e6, Math.round(q.p[1] * 1e6) / 1e6]),
          len: Math.round(len),
          grade: Math.round(maxG * 10) / 10,
          rise: Math.round((Math.max(...hs) - Math.min(...hs)) * 10) / 10,
        })
      }
      i = j
    }
  }
  return out.sort((a, b) => b.grade - a.grade)
}
