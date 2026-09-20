// /snow 데이터 빌드. data/snow/raw/*(공공데이터포털·서울 열린데이터광장·행안부·나이스·기상청 원본, UTF-8) → data/snow/map.json · graph.json
//   node scripts/snow-data.mjs            지오코딩 캐시(raw/geocode-cache.json)만으로 재생성. 캐시에 없는 주소는 KAKAO_REST_API_KEY가 있을 때만 조회
// 원자료는 개인정보가 없는 시설·구간 위치라 평문으로 커밋한다.
// 2라운드(2026-09-20)부터:
//   열선 정본 = 서울시 OA-22584 광진 55행(2022.11~2025.12). 구 15142397 41행은 시점~종점 지번으로 조인해 노선명·차로수·비고를 보충한다
//   선형 = 로컬 pmtiles 도로망 스냅(scripts/snow-roads.mjs). 두 점 직선이 아니라 도로를 따라 잇고, 못 이으면 approx
//   "1차로 기준 연장" = 물리 길이 × 차로수(실측: 2차로 278m 구간의 도로 경로 163m). 물리 길이 physM = m ÷ 차로수
//   취약구간 = 행안부 적설취약구간_도로 15162108 광진 47 + 상습결빙구간 15067396 광진 9. 열선 60m·자재 100m 안 유무로 "공백"을 센다
//   동 기준점 = 동주민센터(lib/dumping/dong-centers.json 카카오 실측 15곳)
import fs from "node:fs"
import path from "node:path"
import { loadRoads, loadDem, snapPath, snapAlongTrunk, steepSegments, roadChains, routeRoadName, lanesNum, distM } from "./snow-roads.mjs"

const ROOT = path.resolve(new URL(".", import.meta.url).pathname, "..")
const RAW = path.join(ROOT, "data/snow/raw")
const OUT = path.join(ROOT, "data/snow")
const CACHE_FILE = path.join(RAW, "geocode-cache.json")
const KAKAO = process.env.KAKAO_REST_API_KEY || readEnvLocal("KAKAO_REST_API_KEY")
const DATA_GO_KR = process.env.DATA_GO_KR_KEY || readEnvLocal("DATA_GO_KR_KEY")

const FILES = {
  heat: "seoul-heatline-by-gu-20260531.csv",
  heatGu: "gwangjin-heatline-20250131.csv",
  salt: "gwangjin-saltbox-20260820.csv",
  cacl: "gwangjin-cacl2box-20260904.csv",
  sand: "gwangjin-sandbag-20220119.csv",
  weak: "mois-snow-weak-roads-20260827.csv",
  ice: "mois-ice-roads-20251107.csv",
  schools: "gwangjin-elementary-neis-20260423.csv",
  freeze: "kma-freeze-days-seoul-2015-2025.csv",
  accidents: "koroad-ice-accident-zones-seoul.json",
}
const ASOF = {
  heat: "2026-05-31",
  heatGu: "2025-01-31",
  salt: "2026-08-20",
  cacl: "2026-09-04",
  sand: "2022-01-19",
  seoul: "2026-05-31",
  weak: "2026-08-27",
  ice: "2025-11-07",
  schools: "2026-04-23",
  freeze: "2025-12-31",
  accidents: "2024-12-31",
  roads: "2026-09-18",
  dem: "2026-09-18",
}
const SOURCE = {
  heat: "서울 열린데이터광장 OA-22584 자치구별 도로열선 설치현황(2026-05-31) 광진구 55행",
  heatGu: "공공데이터포털 15142397 서울특별시 광진구_도로열선 설치 현황(2025-01-31) 41행",
  salt: "공공데이터포털 15066599 서울특별시 광진구_제설함 위치정보",
  cacl: "공공데이터포털 15041574 서울특별시_광진구_염화칼슘보관함 위치정보",
  sand: "공공데이터포털 15041576 서울특별시_광진구_모래주머니 배치현황",
  seoul: "서울 열린데이터광장 OA-22584 자치구별 도로열선 설치현황(25개 구 집계)",
  weak: "공공데이터포털 15162108 행정안전부_적설취약구간_도로 현황(2026-08-27) 광진구 47행",
  ice: "공공데이터포털 15067396 행정안전부_상습 결빙구간(2025-11-07) 광진구 9행",
  schools: "나이스 교육정보 개방포털 학교기본정보(schoolInfo, 적재일 2026-04-23) 광진구 초등학교 21교",
  freeze: "기상청 기상자료개방포털 결빙일수(서울 108 지점, 2015~2025)",
  accidents: "공공데이터포털 15058135 한국도로교통공단_결빙 교통사고 다발지역 API(반경 200m 안 결빙 사고 3건 이상)",
  roads: "도로망 벡터타일(OpenStreetMap, Protomaps 2026-09-18 빌드) 로컬 파일",
  dem: "지형 고도 타일(Mapzen terrarium, AWS 공개 타일 z14) 로컬 파일",
}
const DONGS = ["중곡1동", "중곡2동", "중곡3동", "중곡4동", "능동", "구의1동", "구의2동", "구의3동", "광장동", "자양1동", "자양2동", "자양3동", "자양4동", "화양동", "군자동"]
const HEAT_NEAR_M = 60 // 취약구간이 "열선으로 덮였다"고 보는 거리
const MATERIAL_NEAR_M = 100 // 자재(제설함·염화칼슘함·모래주머니)가 "있다"고 보는 거리
const SCHOOL_NEAR_M = 150
// DEM 추정 급경사. 지형 타일 해상도(약 7.6m/px)와 고도 오차 때문에 보수적으로. maxGrade 위는 고가·제방 고도가 섞인 오탐(강변역로 32%, 한강변 30%대 실측)
const SLOPE = { window: 100, step: 20, minGrade: 8, minLen: 60, maxGrade: 20, awayFromTrunkM: 120 }

function readEnvLocal(key) {
  try {
    const txt = fs.readFileSync(path.join(ROOT, ".env.local"), "utf8")
    const m = txt.match(new RegExp(`^${key}=(.*)$`, "m"))
    return m ? m[1].trim().replace(/^"|"$/g, "") : ""
  } catch {
    return ""
  }
}

// 따옴표 안 쉼표·줄바꿈을 지키는 CSV 파서(서울시 열선 파일의 설치위치 칸이 그렇다)
function parseCsv(txt) {
  const rows = []
  let row = []
  let cell = ""
  let q = false
  for (let i = 0; i < txt.length; i++) {
    const c = txt[i]
    if (q) {
      if (c === '"' && txt[i + 1] === '"') {
        cell += '"'
        i++
      } else if (c === '"') q = false
      else cell += c
    } else if (c === '"') q = true
    else if (c === ",") {
      row.push(cell)
      cell = ""
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && txt[i + 1] === "\n") i++
      row.push(cell)
      rows.push(row)
      row = []
      cell = ""
    } else cell += c
  }
  if (cell || row.length) {
    row.push(cell)
    rows.push(row)
  }
  return rows.filter((r) => r.some((v) => v.trim()))
}
function csv(file, { headerStartsWith = null } = {}) {
  const txt = fs.readFileSync(path.join(RAW, file), "utf8").replace(/^\uFEFF/, "")
  let all = parseCsv(txt)
  if (headerStartsWith) {
    const at = all.findIndex((r) => r[0].trim() === headerStartsWith)
    all = all.slice(at)
    const end = all.slice(1).findIndex((r) => r[0].trim() === headerStartsWith) // 같은 머리가 다시 나오면(계절 표) 거기서 끝
    if (end >= 0) all = all.slice(0, end + 1)
  }
  const [head, ...body] = all
  const keys = head.map((s) => s.replace(/^.*\uFEFF/, "").trim()) // 행안부 파일은 CP949로 깨진 BOM 뒤에 진짜 BOM이 한 번 더 있다("癤욧뎄媛꾨쾲<BOM>구간번호")
  return body.map((cells) => {
    const row = {}
    keys.forEach((h, i) => (row[h] = (cells[i] ?? "").trim()))
    return row
  })
}

// "중곡 1동" · "중 곡 1 동" · "화 양 동" 같은 표기를 행정동 정식 이름으로
function normDong(s) {
  const t = s.replace(/\s+/g, "")
  return DONGS.find((d) => d === t) ?? t
}
// 행정동 → 법정동 (지번 주소는 법정동으로 찍힌다)
const legalDong = (d) => d.replace(/^(구의|중곡|자양)\d동$/, "$1동")
const round = (v) => Math.round(v * 1e5) / 1e5
const round6 = (v) => Math.round(v * 1e6) / 1e6
const rp = (p) => [round6(p[0]), round6(p[1])]

// ─── 지오코딩(카카오, 캐시) ───
const cache = fs.existsSync(CACHE_FILE) ? JSON.parse(fs.readFileSync(CACHE_FILE, "utf8")) : {}
let cacheDirty = false
async function kakao(url) {
  const r = await fetch(url, { headers: { Authorization: `KakaoAK ${KAKAO}` } })
  if (!r.ok) throw new Error(`kakao ${r.status}`)
  return r.json()
}
async function geocode(query, { keywordFirst = false } = {}) {
  if (query in cache) return cache[query]
  if (!KAKAO) return null
  const q = encodeURIComponent(query)
  let hit = null
  const addr = () => kakao(`https://dapi.kakao.com/v2/local/search/address.json?query=${q}`)
  const kw = () => kakao(`https://dapi.kakao.com/v2/local/search/keyword.json?query=${q}&x=127.0857&y=37.5384&radius=6000`)
  const first = keywordFirst ? kw : addr
  const second = keywordFirst ? addr : kw
  const a = await first()
  if (a.documents?.length) hit = a.documents[0]
  if (!hit) {
    const k = await second()
    if (k.documents?.length) hit = k.documents[0]
  }
  cache[query] = hit ? [round(+hit.y), round(+hit.x)] : null
  cacheDirty = true
  await new Promise((r) => setTimeout(r, 60))
  return cache[query]
}

// 열선 기점·종점 표기 정규화: "구의2동 34-8" → "서울 광진구 구의동 34-8", "중곡 71" → "서울 광진구 중곡동 71", 건물명은 그대로
function heatAddr(raw, dong) {
  let a = raw.trim()
  a = a.replace(/^(구의|중곡|자양)\d동\s/, "$1동 ").replace(/^(구의|중곡|자양|광장|능|화양|군자)\s(?=\d)/, "$1동 ")
  if (!/동\s|로|길/.test(a)) a = `${legalDong(dong)} ${a}` // 학교명 등
  return `서울 광진구 ${a}`
}
// 지번 표기 정규화(조인 키): 공백 제거, 행정동 숫자 제거("구의2동 34-8" = "구의동 34-8")
const jibunKey = (s) => s.replace(/\s+/g, "").replace(/(구의|중곡|자양)\d동/g, "$1동")

// ─── 기하 ───
function pointInRing(lat, lng, ring) {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [yi, xi] = ring[i]
    const [yj, xj] = ring[j]
    if (yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}
// 폴리라인을 step(m)마다 표본화(거리 계산용)
function samplePath(coords, step = 15) {
  const out = [coords[0]]
  for (let i = 1; i < coords.length; i++) {
    const a = coords[i - 1]
    const b = coords[i]
    const L = distM(a, b)
    for (let d = step; d < L; d += step) {
      const t = d / L
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t])
    }
    out.push(b)
  }
  return out
}
const minDistPointPath = (p, pathPts) => Math.min(...pathPts.map((q) => distM(p, q)))
const minDistPaths = (aPts, bPts) => Math.min(...aPts.map((p) => minDistPointPath(p, bPts)))
const midOf = (coords) => coords[Math.floor(coords.length / 2)]

async function main() {
  const geo = JSON.parse(fs.readFileSync(path.join(OUT, "geo.json"), "utf8"))
  const outlines = geo.dongOutlines
  const dongOf = (lat, lng) => DONGS.find((d) => outlines[d]?.some((ring) => pointInRing(lat, lng, ring))) ?? null
  const inGu = (lat, lng) => pointInRing(lat, lng, geo.ring)
  // 동 기준점 = 동주민센터(카카오 실측). /dumping과 같은 파일을 읽기만 한다
  const centersFile = JSON.parse(fs.readFileSync(path.join(ROOT, "lib/dumping/dong-centers.json"), "utf8"))
  const center = Object.fromEntries(DONGS.map((d) => [d, [round(centersFile[d].lat), round(centersFile[d].lng)]]))
  const centerName = Object.fromEntries(DONGS.map((d) => [d, centersFile[d].name]))

  const net = await loadRoads()
  const trunkChains = roadChains(net, { kinds: ["highway", "major_road"], excludeDetail: [], skipBridges: false })
  const snapStats = { heat: {}, weak: {}, ice: {} }
  const tally = (bucket, method) => (snapStats[bucket][method] = (snapStats[bucket][method] ?? 0) + 1)

  // ─── 열선: 서울시 55행 정본 + 구 41행 보충 ───
  const gu = csv(FILES.heatGu).map((r) => ({
    i: +r["연번"],
    d: normDong(r["행정동"]),
    route: r["노선명"],
    from: r["기점"],
    to: r["종점"],
    m: +r["열선연장(m) (1차로 기준)"] || 0,
    lanes: r["차로수"],
    year: r["설치년도"] ? +r["설치년도"] : null,
    month: r["설치월"] ? +r["설치월"] : null,
    note: r["비고"] || "",
  }))
  const guByKey = new Map(gu.map((g) => [`${jibunKey(g.from)}~${jibunKey(g.to)}`, g]))
  const heat = []
  let idx = 0
  for (const r of csv(FILES.heat)) {
    if (!/광진/.test(r["관리기관"])) continue
    const loc = r["설치위치 (시점 ~ 종점)"].replace(/\s+/g, " ").trim()
    const [fromRaw, toRaw] = loc.split("~").map((s) => s.trim())
    const ym = r["설치연도"].match(/(\d{4})\.?\s*(\d{1,2})?/)
    const m = +String(r["설치연장(m)"]).replace(/,/g, "") || 0
    const g = guByKey.get(`${jibunKey(fromRaw)}~${jibunKey(toRaw ?? fromRaw)}`) ?? null
    // 동: 구 행이 있으면 그 행정동, 없으면 기점 지오코딩 점의 경계 판정
    const dHint = g?.d ?? (fromRaw.match(/^(중곡\d동|구의\d동|자양\d동|능동|광장동|화양동|군자동)/)?.[1] ?? null)
    const ends = []
    let geoFail = false
    for (const raw of [fromRaw, toRaw ?? fromRaw]) {
      let p = await geocode(heatAddr(raw, dHint ?? "구의동"))
      if (!p && g) p = await geocode(`서울 광진구 ${routeRoadName(g.route)}`)
      if (!p) geoFail = true
      ends.push(p)
    }
    const lanesN = lanesNum(g?.lanes ?? "")
    const physM = lanesN ? Math.round(m / lanesN) : null
    const route = g?.route ?? ""
    let snap
    if (geoFail) {
      const p = ends.find(Boolean) ?? center[dHint ?? "구의2동"]
      snap = { coords: [p, p], len: 0, method: "straight", approx: true, note: "기점·종점 지오코딩 실패", roadName: "" }
    } else {
      snap = snapPath(net, ends[0], ends[1], routeRoadName(route), physM ?? m, { allowPath: /보도|통학로/.test(route) })
    }
    tally("heat", snap.method)
    const mid = midOf(snap.coords)
    const d = g?.d ?? dongOf(mid[0], mid[1]) ?? dHint ?? null
    heat.push({
      i: ++idx,
      seoulNo: +r["연번"],
      guNo: g?.i ?? null,
      d,
      route: route || snap.roadName || "",
      routeSrc: route ? "gu" : snap.roadName ? "road" : "none",
      from: fromRaw,
      to: toRaw ?? fromRaw,
      m,
      lanes: g?.lanes ?? "",
      lanesN,
      physM,
      year: ym ? +ym[1] : null,
      month: ym?.[2] ? +ym[2] : null,
      note: g?.note ?? "",
      a: ends[0] ? rp(ends[0]) : rp(mid),
      b: ends[1] ? rp(ends[1]) : rp(mid),
      path: snap.coords.map(rp),
      pathM: Math.round(snap.len),
      method: snap.method,
      approx: snap.approx,
      roadName: snap.roadName ?? "",
      snapNote: snap.note ?? "",
    })
  }
  const heatSamples = heat.map((h) => samplePath(h.path))

  // ─── 제설함 110 (도로과, 좌표 있음) → 동은 경계로 판정 ───
  const salt = csv(FILES.salt).map((r) => {
    const lat = +r["위도"]
    const lng = +r["경도"]
    return { id: r["관리번호"], addr: r["도로명주소"].replace("서울특별시 광진구 ", ""), detail: r["상세위치"], lat, lng, d: dongOf(lat, lng) }
  })
  // ─── 염화칼슘보관함 228. 열 이름은 X(GRS80TM)·Y(GRS80TM)지만 값은 WGS84 위경도 ───
  const cacl = csv(FILES.cacl).map((r) => ({
    id: r["관리번호"],
    addr: r["도로명주소"].replace("서울특별시 광진구 ", ""),
    lat: +r["X좌표(GRS80TM)"],
    lng: +r["Y좌표(GRS80TM)"],
    d: normDong(r["관리부서"]),
  }))
  // ─── 모래주머니 45지점(취약지역 30 · 동 주민센터 15) ───
  const sand = []
  for (const r of csv(FILES.sand)) {
    const d = normDong(r["행정동"])
    const raw = r["위치"].replace(/\s+/g, " ").replace(/\s0\d-\d+-?$/, "").trim()
    let q = raw.replace(/^서울특별시 광진구\s*/, "").replace(/^서울시 광진구\s*/, "")
    q = q.replace(/^(구의|중곡|자양)\d동\s/, "$1동 ")
    const isCenter = r["구분"] === "동 주민센터"
    let p = isCenter ? center[d] : await geocode(`서울 광진구 ${q}`)
    let approx = false
    if (!p) {
      p = center[d]
      approx = true
    }
    sand.push({ kind: isCenter ? "center" : "site", d, addr: q, qty: +r["배치수량"] || 0, note: r["비고"] || "", lat: p[0], lng: p[1], approx })
  }
  const materials = [
    ...salt.map((s) => ({ kind: "salt", id: s.id, p: [s.lat, s.lng] })),
    ...cacl.map((s) => ({ kind: "cacl", id: s.id, p: [s.lat, s.lng] })),
    ...sand.map((s, i) => ({ kind: "sand", id: `sand-${i}`, p: [s.lat, s.lng] })),
  ]

  // ─── 취약구간: 행안부 적설취약구간_도로 47 + 상습결빙구간 9 ───
  const nearOf = (pts) => {
    const out = { heat: null, salt: null, cacl: null, sand: null }
    const heatIds = []
    heat.forEach((h, i) => {
      const dd = minDistPaths(pts, heatSamples[i])
      if (out.heat == null || dd < out.heat) out.heat = dd
      if (dd <= HEAT_NEAR_M) heatIds.push(h.i)
    })
    const matNear = { salt: 0, cacl: 0, sand: 0 }
    for (const m of materials) {
      const dd = minDistPointPath(m.p, pts)
      if (out[m.kind] == null || dd < out[m.kind]) out[m.kind] = dd
      if (dd <= MATERIAL_NEAR_M) matNear[m.kind]++
    }
    for (const k of Object.keys(out)) if (out[k] != null) out[k] = Math.round(out[k])
    return { near: out, heatIds, matNear }
  }
  const segRecord = (bucket, base, a, b, name, expectM, snapOpts = {}) => {
    let snap = snapPath(net, a, b, name, expectM, snapOpts)
    // 결빙구간(간선·자동차전용도로): 다익스트라가 직선으로 떨어지면 간선 체인 절단으로 재시도, 그래도 안 되면 선을 그리지 않고 끝점만(points).
    // ★강을 가로지르는 직선(청담대교 구간)이 지도에 그려졌던 실사고. 원자료 기점·종점이 램프 위라 선형을 확정할 수 없다
    if (bucket === "ice" && snap.method === "straight") {
      const t = snapAlongTrunk(net, a, b, { roadName: base.road, chains: trunkChains }) ?? snapAlongTrunk(net, a, b, { chains: trunkChains, maxOffM: 200, maxRatio: 2.2 })
      snap = t ?? { coords: [a, b], len: distM(a, b), method: "points", approx: true, note: "원자료 기점·종점이 자동차전용도로 램프 위라 도로 선형을 확정할 수 없습니다. 두 끝점만 표시합니다", roadName: "" }
    }
    tally(bucket, snap.method)
    const pts = samplePath(snap.coords)
    const mid = midOf(snap.coords)
    const { near, heatIds, matNear } = nearOf(pts)
    const materialsNear = matNear.salt + matNear.cacl + matNear.sand
    return {
      ...base,
      a: rp(a),
      b: rp(b),
      path: snap.coords.map(rp),
      pathM: Math.round(snap.len),
      method: snap.method,
      approx: snap.approx,
      roadName: snap.roadName ?? "",
      d: dongOf(mid[0], mid[1]),
      near,
      heatIds,
      matNear,
      heatCovered: heatIds.length > 0,
      materialsNear,
      gap: heatIds.length === 0 && materialsNear === 0,
    }
  }
  const weak = []
  let wi = 0
  for (const r of csv(FILES.weak)) {
    if (!/광진/.test(r["관리청명"])) continue
    const name = r["적설취약구간명"].replace(/^"+/, "").trim()
    const kmRaw = +r["총도로길이_km"] || 0
    const km = kmRaw > 5 ? kmRaw / 1000 : kmRaw // 76·30처럼 m 단위가 섞였다
    const a = [+r["시점 위도"], +r["시점 경도"]]
    const b = [+r["종점 위도"], +r["종점 경도"]]
    // 시점≈종점인 행은 총도로길이가 관리 구간 전체 길이라 그대로 그리면 과장된다(아차산로 22번이 2km. 2026-09-20 실측) → 300m 상한, 없으면 60m.
    // 노선명 도로에 못 붙는 한 점(능동로 120: 좌표가 건국대 안, 능동로는 400m 밖)은 60m만(3라운드. 이름 없는 길 300m로 그려졌던 실사고)
    const expectM = Math.min(300, km ? km * 1000 : 60)
    weak.push(segRecord("weak", { i: ++wi, name, road: routeRoadName(name.replace(/\(.*$/, "").replace(/,\d+길/, "")), type: r["도로취약유형명"], cls: r["도로분류명"], km, agency: r["관리청명"] }, a, b, routeRoadName(name.replace(/\(.*$/, "")), expectM, { unnamedSameCap: 60 }))
  }
  const ice = []
  for (const r of csv(FILES.ice)) {
    if (!/광진구/.test(r["대표지역"])) continue
    const a = [+r["기점 위도(WGS84(4326))"], +r["기점 경도(WGS84(4326))"]]
    const b = [+r["종점 위도(WGS84(4326))"], +r["종점 경도(WGS84(4326))"]]
    const km = +r["총길이(km)"] || 0
    // 기점·종점 두 점만 믿는다. 총길이(km)·방위각은 두 점과 맞지 않고(1.4km인데 두 점 거리 307m, 방위각이 정반대인 행), 도로명도 OSM과 다르다(동부간선도로 좌표가 강변북로·램프 위. 2026-09-20 실측)
    // 그래서 이름 없이 가장 가까운 도로(램프 포함)로 두 점 사이만 잇는다. 총길이는 참고치
    ice.push(segRecord("ice", { id: r["구간번호"], agency: r["관리청"], cls: r["도로분류"], road: r["도로(노선)명"], km }, a, b, "", 0))
  }

  // ─── 초등학교 21(나이스, 좌표 없음 → 카카오 키워드) ───
  const schools = []
  for (const r of csv(FILES.schools)) {
    const p = (r["위도"] && r["경도"] ? [+r["위도"], +r["경도"]] : null) ?? (await geocode(r["학교명"], { keywordFirst: true })) ?? (await geocode(r["주소"]))
    if (!p) continue
    const heatNear = heat.filter((h, i) => minDistPointPath(p, heatSamples[i]) <= SCHOOL_NEAR_M).map((h) => h.i)
    const weakNear = weak.filter((w) => minDistPointPath(p, samplePath(w.path)) <= SCHOOL_NEAR_M).map((w) => w.i)
    schools.push({ name: r["학교명"], addr: r["주소"].replace("서울특별시 광진구 ", ""), lat: p[0], lng: p[1], d: dongOf(p[0], p[1]), heatNear, weakNear })
  }

  // ─── DEM 급경사 추정(지형 타일 × 이름 있는 이면도로. 교량·터널·간선 제외) ───
  const dem = await loadDem()
  const chains = roadChains(net).filter((c) => c.pts.some((p) => inGu(p[0], p[1])))
  const slopesAll = await steepSegments(net, dem, { ...SLOPE, chains })
  // 고가(강변북로·동부간선·분당수서로) 옆 도로는 지형 타일에 고가 고도가 섞여 경사가 부풀려진다 → 간선(trunk·motorway) 120m 안 구간 제외
  const trunks = net.edges.filter((e) => /trunk|motorway/.test(e.detail))
  const nearTrunk = (pts) => pts.some((p) => trunks.some((e) => Math.abs(e.a[0] - p[0]) < 0.002 && Math.abs(e.a[1] - p[1]) < 0.0025 && distM(p, e.a) <= SLOPE.awayFromTrunkM))
  const slopes = slopesAll
    .filter((s) => s.coords.some((p) => inGu(p[0], p[1])))
    .filter((s) => s.grade <= SLOPE.maxGrade && !nearTrunk(s.coords))
    .map((s) => {
      const pts = samplePath(s.coords)
      const { near, heatIds, matNear } = nearOf(pts)
      const mid = midOf(s.coords)
      return { ...s, d: dongOf(mid[0], mid[1]), near, heatIds, materialsNear: matNear.salt + matNear.cacl + matNear.sand, weakNear: weak.filter((w) => minDistPaths(pts, samplePath(w.path)) <= 40).map((w) => w.i) }
    })
  // 검증: 취약구간 47 중 DEM 급경사 40m 안에 있는 비율(지형 추정의 신뢰도 표기용)
  const weakOnSlope = weak.filter((w) => slopes.some((s) => s.weakNear.includes(w.i))).length

  // ─── 서울시 25개 자치구 열선(2026.5) ───
  const seoulAgg = {}
  for (const r of csv(FILES.heat)) {
    const g = r["관리기관"].trim()
    if (!g) continue
    seoulAgg[g] ??= { gu: g, n: 0, m: 0 }
    seoulAgg[g].n += 1
    seoulAgg[g].m += +String(r["설치연장(m)"]).replace(/,/g, "") || 0
  }
  const seoul = Object.values(seoulAgg).sort((a, b) => b.m - a.m)

  // ─── 결빙일수(서울 108) ───
  const freezeRows = csv(FILES.freeze, { headerStartsWith: "연도" }).filter((r) => /^\d{4}$/.test(r["연도"]))
  const freezeDays = freezeRows.map((r) => ({ year: +r["연도"], total: +r["연합계"], nov: +r["11월"], dec: +r["12월"], jan: +r["1월"], feb: +r["2월"], mar: +r["3월"] }))

  // ─── 결빙 교통사고 다발지역(도로교통공단 API). 키가 있으면 갱신해 raw에 캐시, 없으면 캐시 사용 ───
  const accFile = path.join(RAW, FILES.accidents)
  let accidents = fs.existsSync(accFile) ? JSON.parse(fs.readFileSync(accFile, "utf8")) : null
  if (DATA_GO_KR) {
    try {
      const years = []
      for (let y = 2017; y <= 2025; y++) {
        const url = `https://apis.data.go.kr/B552061/frequentzoneFreezing/getRestFrequentzoneFreezing?serviceKey=${DATA_GO_KR}&searchYearCd=${y}&siDo=11&guGun=&type=json&numOfRows=300&pageNo=1`
        // eslint-disable-next-line no-control-regex
        const txt = (await (await fetch(url)).text()).replace(/[\x00-\x1f]/g, " ")
        const j = JSON.parse(txt)
        if (j.resultCode !== "00" && j.resultCode !== "03") throw new Error(`${y} ${j.resultCode} ${j.resultMsg}`)
        const items = j.items?.item ?? []
        years.push({ year: y, seoul: items.length, gwangjin: items.filter((it) => /광진/.test(it.sido_sgg_nm ?? "")).length, gwangjinSpots: items.filter((it) => /광진/.test(it.sido_sgg_nm ?? "")).map((it) => ({ name: it.spot_nm, n: +it.occrmc_cnt, lat: +it.la_crd, lng: +it.lo_crd })) })
      }
      accidents = { fetched: new Date().toISOString().slice(0, 10), years }
      fs.writeFileSync(accFile, JSON.stringify(accidents, null, 1))
    } catch (e) {
      console.warn("결빙사고 API 갱신 실패, 캐시 사용:", e.message)
    }
  }

  // ─── 동별 집계 ───
  const dongs = DONGS.map((d) => {
    const h = heat.filter((x) => x.d === d)
    const sd = sand.filter((x) => x.d === d)
    const w = weak.filter((x) => x.d === d)
    return {
      d,
      heatSeg: h.length,
      heatM: h.reduce((s, x) => s + x.m, 0),
      heatPhysM: h.reduce((s, x) => s + (x.physM ?? x.pathM), 0),
      salt: salt.filter((x) => x.d === d).length,
      cacl: cacl.filter((x) => x.d === d).length,
      sand: sd.length,
      sandBags: sd.reduce((s, x) => s + x.qty, 0),
      weak: w.length,
      weakNoHeat: w.filter((x) => !x.heatCovered).length,
      weakGap: w.filter((x) => x.gap).length,
      ice: ice.filter((x) => x.d === d).length,
      schools: schools.filter((x) => x.d === d).length,
      slopes: slopes.filter((x) => x.d === d).length,
      center: center[d],
      centerName: centerName[d],
    }
  })

  const gaps = {
    weakTotal: weak.length,
    weakHeat: weak.filter((w) => w.heatCovered).length,
    weakNoHeat: weak.filter((w) => !w.heatCovered).length,
    weakNone: weak.filter((w) => w.gap).length,
    weakByType: Object.fromEntries(["고갯길", "급경사", "기타"].map((t) => [t, { n: weak.filter((w) => w.type === t).length, heat: weak.filter((w) => w.type === t && w.heatCovered).length, none: weak.filter((w) => w.type === t && w.gap).length }])),
    iceTotal: ice.length,
    iceHeat: ice.filter((s) => s.heatCovered).length,
    iceNone: ice.filter((s) => s.gap).length,
    iceByAgency: Object.fromEntries([...new Set(ice.map((s) => s.agency))].map((a) => [a, ice.filter((s) => s.agency === a).length])),
    noHeatDongs: dongs.filter((d) => d.heatSeg === 0).map((d) => d.d),
    schoolsNoHeat: schools.filter((s) => s.heatNear.length === 0).length,
    slopeCount: slopes.length,
    slopeKm: Math.round(slopes.reduce((s, x) => s + x.len, 0) / 100) / 10,
    slopeNoHeat: slopes.filter((s) => s.heatIds.length === 0).length,
    weakOnSlope,
    heatNearM: HEAT_NEAR_M,
    materialNearM: MATERIAL_NEAR_M,
    schoolNearM: SCHOOL_NEAR_M,
  }

  const map = {
    asof: ASOF,
    source: SOURCE,
    ring: geo.ring,
    dongOutlines: outlines,
    dongs,
    heat,
    salt,
    cacl,
    sand,
    weak,
    ice,
    slopes,
    schools,
    seoul,
    climate: { freezeDays, source: SOURCE.freeze, asof: ASOF.freeze, station: "서울(108)" },
    accidents: accidents ? { ...accidents, source: SOURCE.accidents, def: "반경 200m 안 결빙 교통사고 3건 이상(도로교통공단 정의)" } : null,
    gaps,
    // 보도자료 수치(공공데이터 아님). 화면은 출처를 같이 보인다
    ops: {
      source: "광진구 보도자료 2025-11-17(서울시티) · 2026-02-12(문화일보 제설대책 평가)",
      period: { from: "2025-11-14", to: "2026-03-15" },
      staff: 1075,
      squads: 13,
      unimog: 2,
      dump15t: 3,
      sprayers: 52,
      heatSites: 55,
      weakPoints: 89,
      boxSites: 101,
      saltTons: 1549,
      seasonStaff: 1549,
      seasonEquip: 300,
    },
    meta: {
      built: new Date().toISOString().slice(0, 10),
      geocode: {
        rule: "열선 기점·종점과 모래주머니 주소는 카카오 주소검색(실패 시 키워드검색). 초등학교는 키워드검색. 동 기준점은 동주민센터(카카오 실측)",
        heatGeoFail: heat.filter((h) => h.snapNote === "기점·종점 지오코딩 실패").length,
        sandApprox: sand.filter((s) => s.approx).length,
        schoolsMissing: 21 - schools.length,
      },
      snap: {
        rule: `로컬 pmtiles 도로망(OSM)에서 기점·종점을 가장 가까운 도로에 붙이고 노선명 도로를 우선해 최단 경로로 잇는다. 물리 길이 = 1차로 기준 연장 ÷ 차로수. named=노선명 도로로 이음, network=다른 도로로 이음, point=두 점이 같아 연장만큼 잘라 그림, straight=직선`,
        ...snapStats,
        heatApprox: heat.filter((h) => h.approx).length,
      },
      heatJoin: { seoulRows: heat.length, guMatched: heat.filter((h) => h.guNo != null).length, guRows: gu.length, guUnmatched: gu.filter((g) => !heat.some((h) => h.guNo === g.i)).map((g) => g.i) },
      slope: { ...SLOPE, count: slopes.length, km: gaps.slopeKm, weakOnSlope, dropped: slopesAll.length - slopes.length, rule: "terrarium z14(약 7.6m/px) 고도를 이름 있는 이면도로를 따라 20m 간격 표본, 100m 창 고도차 8% 이상 20% 이하. 교량·터널·간선(primary 이상)과 고가 120m 안 구간 제외. 추정치" },
      saltNoDong: salt.filter((s) => !s.d).length,
      thresholds: { heatNearM: HEAT_NEAR_M, materialNearM: MATERIAL_NEAR_M, schoolNearM: SCHOOL_NEAR_M },
    },
  }
  fs.writeFileSync(path.join(OUT, "map.json"), JSON.stringify(map))
  if (cacheDirty) fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 1))

  const graph = buildGraph(map)
  fs.writeFileSync(path.join(OUT, "graph.json"), JSON.stringify(graph, null, 1))
  console.log(
    `map.json: 열선 ${heat.length}(구 조인 ${map.meta.heatJoin.guMatched}, 근사 ${map.meta.snap.heatApprox}, 스냅 ${JSON.stringify(snapStats.heat)}) · 제설함 ${salt.length} · 염화칼슘함 ${cacl.length} · 모래주머니 ${sand.length} · 취약구간 ${weak.length}(열선 ${gaps.weakHeat}·공백 ${gaps.weakNone}) · 결빙구간 ${ice.length}(열선 ${gaps.iceHeat}) · 학교 ${schools.length} · 급경사 추정 ${slopes.length}(${gaps.slopeKm}km, 취약구간 일치 ${weakOnSlope}/${weak.length})`,
  )
  console.log(`graph.json: 노드 ${graph.nodes.length} · 엣지 ${graph.edges.length}`)
}

// ─── 온톨로지 그래프 ───
// 노드 {id,type,space,label,props} · 엣지 {f,rel,t,props?}. 클래스·관계 규약은 lib/snow/schema.ts, 역량 질문은 lib/snow/queries.ts
// 관측·판단 노드는 label(12자 안팎 명사형)과 gist(사실 문장, 합니다체)를 나눈다. 화면 그래프는 label, 카드는 gist
function buildGraph(map) {
  const nodes = []
  const edges = []
  const N = (id, type, space, label, props = {}) => nodes.push({ id, type, space, label, props })
  const E = (f, rel, t, props) => edges.push(props ? { f, rel, t, props } : { f, rel, t })
  const PROV = (key, derived_by = "scripts/snow-data.mjs") => ({ source: map.source[key], asof: map.asof[key], derived_by })
  const fmt = (n) => n.toLocaleString("ko-KR")
  const g = map.gaps

  // 주체
  N("org-gwangjin", "Org", "subject", "광진구청", { name: "광진구청", role: "제설대책 총괄. 24시간 상황실" })
  N("team-road", "Team", "subject", "도로과 도로관리팀", { role: "조례 소관 부서. 제설함·도로열선 관리" })
  N("team-dong", "Team", "subject", "동주민센터(15개 동)", { role: "염화칼슘보관함·모래주머니 관리. 이면도로 생활권 제설 담당 구역 운영" })
  N("org-seoul", "Org", "subject", "서울특별시", { role: "강설 대응 단계 기준 · 자치구 열선 집계 · 제설대책 평가 · 시도(동부간선·천호대로 등) 결빙구간 관리" })
  N("org-mois", "Org", "subject", "행정안전부", { role: "적설취약구간·상습결빙구간 전국 집계" })
  N("org-civic", "Org", "subject", "자율방재단·의용소방대", { role: "민관협력 자원봉사 제설 인력", source: map.ops.source })
  N("actor-owner", "Org", "subject", "건축물관리자", { role: "소유자·점유자·관리자. 조례상 보도·이면도로 제설 의무" })

  // 데이터
  N("ds-heat", "Dataset", "resource", "서울시 자치구별 도로열선(광진 55행)", { rows: map.heat.length, ...PROV("heat", "서울 열린데이터광장 CSV 원본, 광진구 행") })
  N("ds-heat-gu", "Dataset", "resource", "광진구 도로열선 설치 현황(41행)", { rows: map.meta.heatJoin.guRows, ...PROV("heatGu", "공공데이터포털 CSV 원본. 노선명·차로수 보충용") })
  N("ds-salt", "Dataset", "resource", "광진구 제설함 위치정보", { rows: map.salt.length, ...PROV("salt", "공공데이터포털 CSV 원본") })
  N("ds-cacl", "Dataset", "resource", "광진구 염화칼슘보관함 위치정보", { rows: map.cacl.length, ...PROV("cacl", "공공데이터포털 CSV 원본") })
  N("ds-sand", "Dataset", "resource", "광진구 모래주머니 배치현황", { rows: map.sand.length, ...PROV("sand", "공공데이터포털 CSV 원본") })
  N("ds-weak", "Dataset", "resource", "행안부 적설취약구간(도로)", { rows: map.weak.length, ...PROV("weak", "공공데이터포털 CSV 원본, 관리청명 광진구 행") })
  N("ds-ice", "Dataset", "resource", "행안부 상습 결빙구간", { rows: map.ice.length, ...PROV("ice", "공공데이터포털 CSV 원본, 대표지역 광진구 행") })
  N("ds-schools", "Dataset", "resource", "나이스 초등학교 기본정보", { rows: map.schools.length, ...PROV("schools", "나이스 API 서울 초등학교 610교 중 주소 광진구") })
  N("ds-freeze", "Dataset", "resource", "기상청 결빙일수(서울)", { rows: map.climate.freezeDays.length, ...PROV("freeze", "기상자료개방포털 연·월 결빙일수 CSV") })
  if (map.accidents) N("ds-accidents", "Dataset", "resource", "도로교통공단 결빙 교통사고 다발지역", { rows: map.accidents.years.length, ...PROV("accidents", "API 연도별 서울 조회") })
  N("ds-roads", "Dataset", "resource", "도로망(OSM pmtiles)", { rows: 0, ...PROV("roads", "로컬 벡터타일 roads 레이어 디코딩") })
  N("ds-dem", "Dataset", "resource", "지형 고도(terrarium)", { rows: 0, ...PROV("dem", "로컬 지형 타일 디코딩") })
  N("ds-seoul-heat", "Dataset", "resource", "서울시 자치구별 도로열선(25개 구)", { rows: map.seoul.reduce((s, x) => s + x.n, 0), ...PROV("seoul", "서울 열린데이터광장 CSV 원본") })
  N("ds-press", "Dataset", "resource", "광진구 제설대책 보도자료", { rows: 2, source: map.ops.source, asof: "2026-02-12", derived_by: "기사 본문 수치 전사" })
  for (const d of ["ds-heat-gu", "ds-salt", "ds-cacl", "ds-sand", "ds-press"]) E("org-gwangjin", "manages", d)
  for (const d of ["ds-heat", "ds-seoul-heat"]) E("org-seoul", "manages", d)
  for (const d of ["ds-weak", "ds-ice"]) E("org-mois", "manages", d)
  E("team-road", "owns", "ds-heat-gu")
  E("team-road", "owns", "ds-salt")
  E("team-road", "owns", "ds-weak")
  E("team-dong", "owns", "ds-cacl")
  E("team-dong", "owns", "ds-sand")

  // 대응자원(유형)
  const heatPhys = map.heat.reduce((s, h) => s + (h.physM ?? h.pathM), 0)
  // holder: 구가 보유·집행하는 자원("구 보유")인가, 외부 주체의 의무·협력("외부")인가(4라운드. 건축물관리자·민관협력은 구 보유 자원이 아니라는 냉독 지적)
  N("lev-heat", "Lever", "lever", "도로열선", { unit: "구간", count: map.heat.length, length_m: map.heat.reduce((s, h) => s + h.m, 0), phys_m: heatPhys, kind: "상시 설비", holder: "구 보유", def: "급경사·통학로 노면 아래 발열선. 강설 전 자동 가동으로 결빙을 줄입니다" })
  N("lev-salt", "Lever", "lever", "제설함", { holder: "구 보유", unit: "개소", count: map.salt.length, kind: "비치 자재", def: "간선도로변 제설제 보관함. 운전자·관리기관이 즉시 살포합니다" })
  N("lev-cacl", "Lever", "lever", "염화칼슘보관함", { holder: "구 보유", unit: "개소", count: map.cacl.length, kind: "비치 자재", def: "이면도로·주택가 염화칼슘 보관함. 동주민센터가 관리하고 주민이 자율 사용합니다" })
  N("lev-sand", "Lever", "lever", "모래주머니", { holder: "구 보유", unit: "지점", count: map.sand.length, bags: map.sand.reduce((s, x) => s + x.qty, 0), kind: "비치 자재", def: "취약지역·동주민센터 비치 모래. 결빙 노면 미끄럼을 줄입니다" })
  N("lev-sprayer", "Lever", "lever", "자동원격액상살포기", { holder: "구 보유", unit: "대", count: map.ops.sprayers, kind: "상시 설비", def: "급경사 구간 원격 염수 분사. 강설 시 열선과 함께 가동합니다", source: map.ops.source })
  N("lev-fleet", "Lever", "lever", "제설 장비", { holder: "구 보유", unit: "대", unimog: map.ops.unimog, dump15t: map.ops.dump15t, kind: "동원 장비", def: "유니목 2대 · 15톤 덤프 3대 · 1톤·2.5톤 차량. 간선도로 제설제 살포·밀어내기", source: map.ops.source })
  N("lev-staff", "Lever", "lever", "제설 인력", { holder: "구 보유", unit: "명", count: map.ops.staff, squads: map.ops.squads, kind: "동원 인력", def: "실무반 13개 · 환경공무관 · 동주민센터 직원 · 민간 용역", source: map.ops.source })
  N("lev-civic", "Lever", "lever", "민관협력 제설", { holder: "외부", unit: "체계", kind: "동원 인력", def: "자율방재단·의용소방대 연계 자원봉사자 모집·운영", source: map.ops.source })
  N("lev-owner", "Lever", "lever", "건축물관리자 자율 제설", { holder: "외부", unit: "의무", kind: "법정 의무", def: "조례 제4조 범위(보도 접한 구간·대지경계 1m)를 제5조 시한 안에 치웁니다" })
  E("team-road", "operates", "lev-heat")
  E("team-road", "operates", "lev-salt")
  E("team-road", "operates", "lev-sprayer")
  E("team-road", "operates", "lev-fleet")
  E("team-dong", "operates", "lev-cacl")
  E("team-dong", "operates", "lev-sand")
  E("org-gwangjin", "operates", "lev-staff")
  E("org-civic", "operates", "lev-civic")
  E("actor-owner", "operates", "lev-owner")

  // 취약요인
  N("con-slope", "Concept", "concept", "급경사·고갯길", { def: "경사로. 결빙 시 차량·보행 미끄럼 사고 위험이 가장 큰 곳. 행안부 적설취약구간의 유형(고갯길·급경사)" })
  N("con-school", "Concept", "concept", "통학로", { def: "초등학교 주변 보행로. 등교 시간대 결빙 노출" })
  N("con-alley", "Concept", "concept", "이면도로", { def: "폭 12m 미만, 차도·보도 구분 없는 도로(조례 제2조). 제설차 진입이 어렵습니다" })
  N("con-arterial", "Concept", "concept", "간선도로", { def: "차량 통행량 많은 주요 도로. 장비 살포 우선 구간. 상습결빙구간 9곳이 전부 간선·자동차전용도로" })
  N("con-transit", "Concept", "concept", "지하철역·버스정류장 주변", { def: "유동 인구 많은 다중이용 보행 구간. 인력 집중 배치 대상" })
  N("con-freeze", "Concept", "concept", "야간 결빙", { def: "강설 뒤 야간 저온으로 노면이 얼어붙는 조건. 살포·열선의 대상" })
  N("con-snowfall", "Concept", "concept", "적설량 예보", { def: "서울시 대응 단계를 정하는 입력. 기상청 예보 적설(cm)과 대설 특보" })
  E("lev-heat", "targets", "con-slope")
  E("lev-heat", "targets", "con-school")
  E("lev-heat", "targets", "con-freeze")
  E("lev-sprayer", "targets", "con-slope")
  E("lev-sprayer", "targets", "con-freeze")
  E("lev-salt", "targets", "con-arterial")
  E("lev-fleet", "targets", "con-arterial")
  E("lev-cacl", "targets", "con-alley")
  E("lev-sand", "targets", "con-alley")
  E("lev-sand", "targets", "con-freeze")
  E("lev-staff", "targets", "con-transit")
  E("lev-civic", "targets", "con-alley")
  E("lev-owner", "targets", "con-alley")

  // 목표지표
  const accYears = map.accidents?.years ?? []
  const accLast = accYears.length ? `${accYears[0].year}~${accYears[accYears.length - 1].year}` : ""
  N("kpi-coverage", "KPI", "outcome", "취약구간 자원 커버리지", { def: `행안부 적설취약구간·상습결빙구간마다 ${g.heatNearM}m 안 열선 또는 ${g.materialNearM}m 안 자재가 있는가`, measurable: "구간 단위 측정" })
  N("kpi-deadline", "KPI", "outcome", "조례 제설 시한 준수", { def: "눈 그친 뒤 주간 4시간·야간 익일 11시 안에 보도·이면도로가 치워졌는가", measurable: "데이터 없음", request: "정보공개청구" })
  N("kpi-ice-incident", "KPI", "outcome", "결빙 교통사고", { def: "결빙 교통사고 다발지역(반경 200m 3건 이상) 수", measurable: map.accidents ? `다발지역 0곳(${accLast}, 도로교통공단) · 건별 사고 수는 데이터 없음` : "데이터 없음", note: "다발지역 집계는 3건 이상 묶음만 세어 구간 하나의 변화를 잡지 못합니다. 그래서 커버리지가 이 지표를 대신 측정합니다" })
  N("kpi-complaint", "KPI", "outcome", "제설 민원", { def: "강설 뒤 제설 요청·미끄럼 민원 건수", measurable: "데이터 없음", request: "정보공개청구" })
  N("kpi-eval", "KPI", "outcome", "서울시 제설대책 평가", { def: "서울시 겨울철 제설대책 추진 평가 등급", measurable: "우수(3년 연속, 2025~2026)", source: map.ops.source })
  E("lev-heat", "lowers", "kpi-ice-incident", { status: "상시 가동" })
  E("lev-sprayer", "lowers", "kpi-ice-incident", { status: "상시 가동" })
  E("lev-salt", "lowers", "kpi-ice-incident", { status: "비치" })
  E("lev-cacl", "lowers", "kpi-ice-incident", { status: "비치" })
  E("lev-sand", "lowers", "kpi-ice-incident", { status: "비치" })
  E("lev-fleet", "lowers", "kpi-ice-incident", { status: "단계 동원" })
  E("lev-staff", "lowers", "kpi-deadline", { status: "단계 동원" })
  E("lev-civic", "lowers", "kpi-deadline", { status: "단계 동원" })
  E("lev-owner", "lowers", "kpi-deadline", { status: "법정 의무" })
  E("lev-owner", "lowers", "kpi-complaint", { status: "법정 의무" })
  E("con-freeze", "raises", "kpi-ice-incident")
  E("con-slope", "raises", "kpi-ice-incident")
  E("kpi-coverage", "operationalizes", "kpi-ice-incident", { note: "다발지역 0곳은 3건 이상 묶음 기준이라 구간별 변화를 못 잡습니다" })
  E("kpi-coverage", "operationalizes", "kpi-complaint", { note: "민원 건수는 공개 데이터가 없습니다" })

  // 법령·기준
  N("pol-law-27", "Policy", "policy", "자연재해대책법 제27조", { law: "자연재해대책법", article: "제27조 건축물관리자의 제설 책임", efYd: "2025-10-01", gist: "건축물관리자는 주변 보도·이면도로·보행자전용도로·지붕을 제설·제빙합니다. 구체 범위는 조례로 정합니다", source: "법제처 국가법령정보센터 MST 276321" })
  N("pol-ord", "Policy", "policy", "광진구 건축물관리자의 제설·제빙에 관한 조례", { enacted: "2020-10-28", dept: "도로과 도로관리팀", day_hours: 4, night_until: "익일 11:00", heavy_cm: 10, heavy_hours: 24, scope_m: 1, gist: "제3조 책임순위 · 제4조 범위(보도 접한 구간, 대지경계 1m) · 제5조 시한 · 제9조 도구 비치", source: "법제처 자치법규 1540021" })
  N("pol-stage", "Policy", "policy", "서울시 강설 대응 단계 기준", { gist: "평시 · 보강(1cm 미만 예보) · 1단계(5cm 미만) · 2단계(5cm 이상 또는 대설주의보) · 3단계(10cm 이상 또는 대설경보)", source: "서울시 보도자료 2026-02-01(대설예비특보 2단계 발령)" })
  N("pol-period", "Policy", "policy", "겨울철 제설대책기간", { from: map.ops.period.from, to: map.ops.period.to, gist: "11월 중순부터 3월 15일까지 상황실·비상근무 운영. 열선·살포기 가동, 제설함·자재 비치, 인력·장비 동원 계획의 운영 틀", source: map.ops.source })
  N("stage-0", "Stage", "policy", "보강 단계", { order: 0, threshold_cm: 0, until_cm: 1, gist: "적설 1cm 미만 예보입니다. 상황실이 감시하고 열선·살포기를 상시 가동합니다" })
  N("stage-1", "Stage", "policy", "1단계", { order: 1, threshold_cm: 1, until_cm: 5, gist: "적설 5cm 미만 예보입니다. 제설제를 사전 살포하고 취약구간에 인력을 배치합니다" })
  N("stage-2", "Stage", "policy", "2단계", { order: 2, threshold_cm: 5, until_cm: 10, gist: "적설 5cm 이상 예보 또는 대설주의보입니다. 전 장비와 인력을 투입합니다" })
  N("stage-3", "Stage", "policy", "3단계", { order: 3, threshold_cm: 10, until_cm: null, gist: "적설 10cm 이상 예보 또는 대설경보입니다. 전 직원과 민관협력을 총동원합니다" })
  E("pol-law-27", "delegates", "pol-ord")
  E("pol-ord", "obligates", "actor-owner")
  E("pol-ord", "basis", "lev-owner")
  for (const l of ["lev-staff", "lev-fleet", "lev-heat", "lev-salt", "lev-cacl", "lev-sand", "lev-sprayer"]) E("pol-period", "basis", l, { note: "제설대책기간 운영 계획상 자원(보도자료). 개별 설치 근거 규정은 미확인" })
  E("org-seoul", "defines", "pol-stage")
  E("org-gwangjin", "defines", "pol-period")
  E("con-snowfall", "triggers", "pol-stage")
  for (const s of ["stage-0", "stage-1", "stage-2", "stage-3"]) E("pol-stage", "defines", s)
  E("stage-0", "escalates_to", "stage-1")
  E("stage-1", "escalates_to", "stage-2")
  E("stage-2", "escalates_to", "stage-3")
  const MOB = {
    "stage-0": ["lev-heat", "lev-sprayer"],
    "stage-1": ["lev-heat", "lev-sprayer", "lev-salt", "lev-cacl", "lev-sand", "lev-staff"],
    "stage-2": ["lev-heat", "lev-sprayer", "lev-salt", "lev-cacl", "lev-sand", "lev-staff", "lev-fleet", "lev-owner"],
    "stage-3": ["lev-heat", "lev-sprayer", "lev-salt", "lev-cacl", "lev-sand", "lev-staff", "lev-fleet", "lev-owner", "lev-civic"],
  }
  for (const [s, levs] of Object.entries(MOB)) for (const l of levs) E(s, "mobilizes", l)

  // 행정동(Area)과 담당 구역(Zone). 구역 정본(동주민센터 담당 구간표)은 아직 없어 행정동 경계를 대용한다(proxy)
  for (const d of map.dongs) {
    N(`area-${d.d}`, "Area", "area", d.d, { heatSeg: d.heatSeg, heatM: d.heatM, salt: d.salt, cacl: d.cacl, sand: d.sand, sandBags: d.sandBags, weak: d.weak, ice: d.ice, schools: d.schools })
    N(`zone-${d.d}`, "Zone", "area", `${d.d} 담당 구역`, { proxy: "행정동 경계 대용", basis: "동주민센터 담당 구간표 확보 시 교체", center_name: d.centerName, heatSeg: d.heatSeg, salt: d.salt, cacl: d.cacl, sand: d.sand, weak: d.weak, weakNoHeat: d.weakNoHeat, weakGap: d.weakGap })
    E("team-dong", "assigned", `zone-${d.d}`)
    E(`zone-${d.d}`, "within", `area-${d.d}`)
    if (d.heatSeg) E("lev-heat", "covers", `zone-${d.d}`, { count: d.heatSeg, length_m: d.heatM })
    if (d.salt) E("lev-salt", "covers", `zone-${d.d}`, { count: d.salt })
    if (d.cacl) E("lev-cacl", "covers", `zone-${d.d}`, { count: d.cacl })
    if (d.sand) E("lev-sand", "covers", `zone-${d.d}`, { count: d.sand, bags: d.sandBags })
  }

  // 취약구간 실체(Entity): 적설취약구간 47 · 상습결빙구간 9
  for (const w of map.weak) {
    const id = `seg-weak-${w.i}`
    N(id, "Entity", "concept", w.name.length > 14 ? w.name.slice(0, 14) : w.name, { name: w.name, type: w.type, cls: w.cls, km: w.km, dong: w.d, heat_near_m: w.near.heat, materials_near: w.materialsNear, gap: w.gap, ...PROV("weak") })
    E(id, "exemplifies", w.type === "기타" ? "con-arterial" : "con-slope")
    if (w.d) E(id, "within", `zone-${w.d}`)
    for (const hid of w.heatIds) E("lev-heat", "covers", id, { heat_id: hid, within_m: g.heatNearM })
    if (w.matNear.salt) E("lev-salt", "covers", id, { count: w.matNear.salt, within_m: g.materialNearM })
    if (w.matNear.cacl) E("lev-cacl", "covers", id, { count: w.matNear.cacl, within_m: g.materialNearM })
    if (w.matNear.sand) E("lev-sand", "covers", id, { count: w.matNear.sand, within_m: g.materialNearM })
  }
  for (const s of map.ice) {
    const id = `seg-ice-${s.id}`
    N(id, "Entity", "concept", `${s.road} ${s.km}km`, { name: `${s.road} 상습결빙구간 ${s.id}`, agency: s.agency, cls: s.cls, km: s.km, dong: s.d, heat_near_m: s.near.heat, materials_near: s.materialsNear, gap: s.gap, ...PROV("ice") })
    E(id, "exemplifies", "con-freeze")
    E(id, "exemplifies", "con-arterial")
    if (s.d) E(id, "within", `zone-${s.d}`)
    for (const hid of s.heatIds) E("lev-heat", "covers", id, { heat_id: hid, within_m: g.heatNearM })
    if (s.matNear.salt) E("lev-salt", "covers", id, { count: s.matNear.salt, within_m: g.materialNearM })
    if (s.matNear.cacl) E("lev-cacl", "covers", id, { count: s.matNear.cacl, within_m: g.materialNearM })
    if (s.matNear.sand) E("lev-sand", "covers", id, { count: s.matNear.sand, within_m: g.materialNearM })
  }

  // 관측(증거)과 판단(주장). 수치는 전부 map.json에서 계산. label은 그래프용 짧은 이름, gist는 문장
  const heatM = map.heat.reduce((s, h) => s + h.m, 0)
  const byHeat = [...map.dongs].sort((a, b) => b.heatSeg - a.heatSeg)
  const top2 = byHeat.slice(0, 2)
  const top2Seg = top2.reduce((s, d) => s + d.heatSeg, 0)
  const noHeat = g.noHeatDongs
  const byCacl = [...map.dongs].sort((a, b) => b.cacl - a.cacl)[0]
  const schoolSeg = map.heat.filter((h) => /통학로|초/.test(h.route)).length
  const seoulGj = map.seoul.find((x) => x.gu === "광진구")
  const seoulRank = map.seoul.findIndex((x) => x.gu === "광진구") + 1
  const new2025 = map.heat.filter((h) => h.year === 2025).length
  const noneAll = map.dongs.filter((d) => !d.heatSeg && !d.salt && !d.cacl && !d.sand).map((d) => d.d)
  const fz = map.climate.freezeDays
  const fzLast = fz[fz.length - 1]
  const fzAvg = Math.round(fz.reduce((s, x) => s + x.total, 0) / fz.length)
  const weakDongs = [...new Set(map.weak.map((w) => w.d).filter(Boolean))]
  const weakTop = [...map.dongs].sort((a, b) => b.weak - a.weak)[0]
  const iceGu = map.ice.filter((s) => /광진구/.test(s.agency)).length

  const EV = (id, label, gist, props) => N(id, "Evidence", "evidence", label, { gist, ...props })
  EV("ev-heat", `열선 ${map.heat.length}구간`, `열선은 ${map.heat.length}구간 ${fmt(heatM)}m(1차로 기준)입니다. 도로 기준 물리 길이는 약 ${fmt(heatPhys)}m이고 ${map.dongs.filter((d) => d.heatSeg).length}개 동에 있습니다.`, { confidence: 1, ...PROV("heat") })
  EV("ev-heat-top", `열선 2개 동 집중`, `열선 ${top2Seg}/${map.heat.length}구간이 ${top2.map((d) => d.d).join("·")}에 있습니다.`, { confidence: 1, ...PROV("heat") })
  EV("ev-heat-none", `열선 없는 동 ${noHeat.length}곳`, `열선이 한 구간도 없는 동은 ${noHeat.join("·")} ${noHeat.length}곳입니다.`, { confidence: 1, ...PROV("heat") })
  EV("ev-heat-school", `통학로 열선 ${schoolSeg}구간`, `노선명에 통학로·학교가 적힌 열선이 ${schoolSeg}구간입니다. 초등학교 ${map.schools.length}교 중 ${g.schoolNearM}m 안에 열선이 있는 학교는 ${map.schools.length - g.schoolsNoHeat}교입니다.`, { confidence: 0.9, source: `${map.source.heat} · ${map.source.schools}`, asof: map.asof.heat, derived_by: "scripts/snow-data.mjs" })
  EV("ev-heat-2025", `2025년 설치 ${new2025}구간`, `2025년에 설치된 열선이 ${new2025}구간입니다. 구 공개 파일(2025.1)에는 없고 서울시 집계(2026.5)에만 있습니다.`, { confidence: 1, source: `${map.source.heat} · ${map.source.heatGu}`, asof: map.asof.heat, derived_by: "scripts/snow-data.mjs" })
  EV("ev-salt", `제설함 ${map.salt.length}개소`, `제설함 ${map.salt.length}개소는 전부 도로과가 관리하는 간선도로변입니다.`, { confidence: 1, ...PROV("salt") })
  EV("ev-cacl", `염화칼슘함 ${byCacl.d} 집중`, `염화칼슘보관함 ${map.cacl.length}개소 중 ${byCacl.d}에 ${byCacl.cacl}개소(${Math.round((byCacl.cacl / map.cacl.length) * 100)}%)가 있습니다.`, { confidence: 1, ...PROV("cacl") })
  EV("ev-sand", `모래주머니 ${map.sand.length}지점`, `모래주머니 ${map.sand.length}지점 ${fmt(map.sand.reduce((s, x) => s + x.qty, 0))}포(취약지역 ${map.sand.filter((s) => s.kind === "site").length} · 동주민센터 ${map.sand.filter((s) => s.kind === "center").length})입니다. 기준일이 2022-01-19로 가장 오래됐습니다.`, { confidence: 0.8, ...PROV("sand") })
  EV("ev-weak", `적설취약구간 ${map.weak.length}곳`, `행안부 적설취약구간이 광진구에 ${map.weak.length}곳(고갯길 ${g.weakByType["고갯길"].n} · 급경사 ${g.weakByType["급경사"].n} · 기타 ${g.weakByType["기타"].n}) 있고 ${weakDongs.length}개 동에 걸칩니다. ${weakTop.d}가 ${weakTop.weak}곳으로 가장 많습니다.`, { confidence: 1, ...PROV("weak") })
  EV("ev-weak-heat", `취약구간 열선 ${g.weakHeat}/${g.weakTotal}`, `적설취약구간 ${g.weakTotal}곳 중 ${g.heatNearM}m 안에 열선이 있는 곳은 ${g.weakHeat}곳입니다. ${g.weakNoHeat}곳은 열선이 없습니다.`, { confidence: 0.9, source: `${map.source.weak} · ${map.source.heat} · ${map.source.roads}`, asof: map.asof.weak, derived_by: "scripts/snow-data.mjs 도로 스냅 뒤 최근접 거리" })
  EV("ev-weak-none", `자재 없는 취약구간 ${g.weakNone}곳`, `적설취약구간 ${g.weakTotal}곳 중 ${g.heatNearM}m 안 열선도 ${g.materialNearM}m 안 자재도 없는 곳은 ${g.weakNone}곳입니다.`, { confidence: 0.9, source: `${map.source.weak} · 광진구 자원 4종`, asof: map.asof.weak, derived_by: "scripts/snow-data.mjs" })
  EV("ev-ice", `상습결빙구간 ${map.ice.length}곳`, `행안부 상습결빙구간이 광진구에 ${map.ice.length}곳 있습니다. 관리청은 광진구 ${iceGu}곳, 서울시(동부도로사업소·시설공단) ${map.ice.length - iceGu}곳입니다. 전부 간선·자동차전용도로입니다.`, { confidence: 1, ...PROV("ice") })
  EV("ev-ice-heat", `결빙구간 열선 ${g.iceHeat}/${g.iceTotal}`, `상습결빙구간 ${g.iceTotal}곳 중 ${g.heatNearM}m 안에 열선이 있는 곳은 ${g.iceHeat}곳입니다. 열선은 이면도로·통학로에 있고 간선도로 결빙구간은 장비 살포와 제설함으로 대응합니다.`, { confidence: 0.9, source: `${map.source.ice} · ${map.source.heat}`, asof: map.asof.ice, derived_by: "scripts/snow-data.mjs" })
  EV("ev-slope", `지형 추정 급경사 ${map.slopes.length}구간`, `지형 고도로 추정한 경사 ${map.meta.slope.minGrade}% 이상 이면도로가 ${map.slopes.length}구간 ${g.slopeKm}km입니다. 행안부 취약구간 ${g.weakTotal}곳 중 ${g.weakOnSlope}곳이 이 추정 구간과 겹칩니다. 추정치입니다.`, { confidence: 0.5, source: `${map.source.dem} · ${map.source.roads}`, asof: map.asof.dem, derived_by: `scripts/snow-roads.mjs steepSegments(창 ${map.meta.slope.window}m, ${map.meta.slope.minGrade}%)` })
  EV("ev-freeze", `결빙일 연 ${fzLast.total}일`, `서울의 결빙일수는 ${fzLast.year}년 ${fzLast.total}일, 최근 ${fz.length}년 평균 ${fzAvg}일입니다. 12월·1월·2월에 몰립니다.`, { confidence: 1, ...PROV("freeze") })
  if (map.accidents) EV("ev-accidents", `결빙사고 다발지역 0곳`, `도로교통공단 결빙 교통사고 다발지역(반경 200m 3건 이상)은 ${accLast} 서울 연 ${Math.min(...accYears.map((y) => y.seoul))}~${Math.max(...accYears.map((y) => y.seoul))}곳이고 광진구는 0곳입니다.`, { confidence: 1, ...PROV("accidents") })
  EV("ev-seoul", `서울 열선 연장 ${seoulRank}위`, `서울 25개 구 열선 ${fmt(map.seoul.reduce((s, x) => s + x.n, 0))}개소 ${fmt(map.seoul.reduce((s, x) => s + x.m, 0))}m 중 광진구는 ${seoulGj?.n}개소 ${fmt(seoulGj?.m ?? 0)}m로 연장 ${seoulRank}위입니다.`, { confidence: 1, ...PROV("seoul") })
  EV("ev-press", `보도 수치(인력·살포기)`, `보도자료 수치는 인력 ${fmt(map.ops.staff)}명 · 살포기 ${map.ops.sprayers}대 · 취약지점 ${map.ops.weakPoints}개소 · 제설함류 ${map.ops.boxSites}개소입니다. 공공데이터가 아닌 보도 수치라 개소 정의가 다를 수 있습니다.`, { confidence: 0.6, source: map.ops.source, asof: "2026-02-12", derived_by: "기사 본문 전사" })
  EV("ev-coverage", noneAll.length ? `자원 없는 동 ${noneAll.length}곳` : "15개 동 전부 자원 있음", noneAll.length ? `자원 4종이 모두 없는 동은 ${noneAll.join("·")} ${noneAll.length}곳입니다.` : `자원 4종 중 하나도 없는 동은 없습니다. 열선만 없는 동이 ${noHeat.length}곳입니다.`, { confidence: 1, source: "map.json dongs", asof: map.asof.cacl, derived_by: "scripts/snow-data.mjs" })
  for (const [ds, evs] of Object.entries({
    "ds-heat": ["ev-heat", "ev-heat-top", "ev-heat-none", "ev-heat-2025"],
    "ds-heat-gu": ["ev-heat-2025"],
    "ds-salt": ["ev-salt"],
    "ds-cacl": ["ev-cacl"],
    "ds-sand": ["ev-sand"],
    "ds-weak": ["ev-weak", "ev-weak-heat", "ev-weak-none"],
    "ds-ice": ["ev-ice", "ev-ice-heat"],
    "ds-freeze": ["ev-freeze"],
    "ds-seoul-heat": ["ev-seoul"],
    "ds-press": ["ev-press"],
  }))
    for (const ev of evs) E(ds, evs.length === 1 || ["ev-heat", "ev-heat-top", "ev-heat-none", "ev-weak", "ev-ice"].includes(ev) ? "contains" : "derived_from", ev)
  E("ds-schools", "derived_from", "ev-heat-school")
  E("ds-heat", "derived_from", "ev-heat-school")
  E("ds-heat", "derived_from", "ev-weak-heat")
  E("ds-roads", "derived_from", "ev-weak-heat")
  E("ds-heat", "derived_from", "ev-ice-heat")
  for (const k of ["ds-salt", "ds-cacl", "ds-sand"]) E(k, "derived_from", "ev-weak-none")
  E("ds-dem", "derived_from", "ev-slope")
  E("ds-roads", "derived_from", "ev-slope")
  if (map.accidents) E("ds-accidents", "contains", "ev-accidents")
  for (const k of ["ds-heat", "ds-salt", "ds-cacl", "ds-sand"]) E(k, "derived_from", "ev-coverage")
  E("ev-heat", "describes", "lev-heat")
  E("ev-salt", "describes", "lev-salt")
  E("ev-cacl", "describes", "lev-cacl")
  E("ev-sand", "describes", "lev-sand")
  E("ev-press", "describes", "lev-sprayer")
  E("ev-press", "describes", "lev-fleet")
  E("ev-press", "describes", "lev-staff")
  E("ev-heat-school", "describes", "con-school")
  E("ev-weak", "describes", "con-slope")
  E("ev-ice", "describes", "con-arterial")
  E("ev-slope", "describes", "con-slope")
  E("ev-freeze", "describes", "con-freeze")
  E("ev-coverage", "describes", "kpi-coverage")
  E("ev-weak-none", "describes", "kpi-coverage")
  if (map.accidents) E("ev-accidents", "describes", "kpi-ice-incident")
  E("ev-press", "describes", "kpi-eval")

  const CL = (id, label, gist, props = {}) => N(id, "Claim", "claim", label, { gist, ...props })
  CL("claim-weak-gap", `취약구간 ${g.weakNoHeat}곳 열선 없음`, `적설취약구간 ${g.weakTotal}곳 중 ${g.weakNoHeat}곳에 열선이 없습니다. 그중 ${g.weakNone}곳은 ${g.materialNearM}m 안에 비치 자재도 없습니다.`, { note: "거리 기준은 도로 스냅 선형 기준. 취약구간 지정 사유(고갯길·급경사)와 열선 설치 기준이 같은지는 공개 자료로 알 수 없습니다" })
  const weakTopHeat = map.dongs.find((d) => d.d === weakTop.d)?.heatSeg ?? 0
  CL("claim-heat-concentration", `열선 ${top2.map((d) => d.d).join("·")} 집중`, `열선 ${top2Seg}/${map.heat.length}구간이 ${top2.map((d) => d.d).join("·")}에 있습니다. 적설취약구간이 가장 많은 ${weakTop.d}(${weakTop.weak}곳)에는 열선이 ${weakTopHeat}구간입니다.`)
  CL("claim-heat-gap", `열선 없는 동 ${noHeat.length}곳`, `${noHeat.join("·")}은 열선 없이 비치 자재와 인력으로 대응합니다. 이 동들의 적설취약구간은 ${map.dongs.filter((d) => noHeat.includes(d.d)).reduce((s, d) => s + d.weak, 0)}곳입니다.`)
  CL("claim-update-gap", `구 공개 열선 한 시즌 지연`, `구가 공개한 열선 목록(2025.1, ${map.meta.heatJoin.guRows}구간)은 서울시 집계(2026.5, ${map.heat.length}구간)보다 ${map.heat.length - map.meta.heatJoin.guRows}구간 적습니다. 구 파일 ${map.meta.heatJoin.guRows}행 중 ${map.meta.heatJoin.guMatched}행이 서울시 집계와 맞고 ${map.meta.heatJoin.guRows - map.meta.heatJoin.guMatched}행은 서울 파일이 한 행으로 합쳤습니다. 지도는 서울시 집계를 정본으로 씁니다.`)
  CL("claim-alley-first", `이면도로는 자재·주민 의무`, `이면도로는 염화칼슘함 ${map.cacl.length}개소·모래주머니 ${map.sand.length}지점과 건축물관리자 의무(대지경계 1m)로 대응합니다. 장비는 간선도로 우선입니다.`)
  CL("claim-ice-arterial", `결빙구간은 간선도로`, `상습결빙구간 ${g.iceTotal}곳은 전부 간선·자동차전용도로이고 ${g.iceTotal - iceGu}곳은 서울시 관리입니다. 장비 살포와 제설함으로 대응하는 구간입니다.`)
  CL("claim-kpi-missing", `시한 준수·민원은 자료 없음`, `조례 시한 준수와 제설 민원은 공개 데이터가 없습니다. 결빙 교통사고는 다발지역(반경 200m 3건 이상) 0곳으로만 확인되고 건별 사고 수는 없습니다.`)
  E("ev-weak-heat", "supports", "claim-weak-gap")
  E("ev-weak-none", "supports", "claim-weak-gap")
  E("ev-heat-top", "supports", "claim-heat-concentration")
  E("ev-weak", "supports", "claim-heat-concentration")
  E("ev-heat-none", "supports", "claim-heat-gap")
  E("ev-coverage", "supports", "claim-heat-gap")
  E("ev-heat-2025", "supports", "claim-update-gap")
  E("ev-cacl", "supports", "claim-alley-first")
  E("ev-sand", "supports", "claim-alley-first")
  E("ev-ice", "supports", "claim-ice-arterial")
  E("ev-ice-heat", "supports", "claim-ice-arterial")
  E("ev-press", "supports", "claim-kpi-missing")
  if (map.accidents) E("ev-accidents", "supports", "claim-kpi-missing")
  E("claim-kpi-missing", "governs", "kpi-deadline")
  E("claim-kpi-missing", "governs", "kpi-complaint")
  E("claim-update-gap", "governs", "lev-heat")
  E("claim-weak-gap", "governs", "kpi-coverage")

  return { nodes, edges }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
