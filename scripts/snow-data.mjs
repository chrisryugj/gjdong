// /snow 데이터 빌드. data/snow/raw/*.csv(공공데이터포털·서울 열린데이터광장 원본, UTF-8 변환본) → data/snow/map.json · graph.json
//   node scripts/snow-data.mjs            지오코딩 캐시(raw/geocode-cache.json)만으로 재생성. 캐시에 없는 주소는 KAKAO_REST_API_KEY가 있을 때만 조회
// 원자료 4종(열선·제설함·염화칼슘보관함·모래주머니)은 개인정보가 없는 시설 위치라 평문으로 커밋한다(/dumping의 민원 원자료와 다르다).
// 열선 구간은 기점·종점 지번을 지오코딩한 두 점을 직선으로 잇는다. 도로 선형이 아니라 근사이고, 지도 툴팁과 문서가 그렇게 말한다.
import fs from "node:fs"
import path from "node:path"

const ROOT = path.resolve(new URL(".", import.meta.url).pathname, "..")
const RAW = path.join(ROOT, "data/snow/raw")
const OUT = path.join(ROOT, "data/snow")
const CACHE_FILE = path.join(RAW, "geocode-cache.json")
const KAKAO = process.env.KAKAO_REST_API_KEY || readEnvLocal("KAKAO_REST_API_KEY")

const FILES = {
  heat: "gwangjin-heatline-20250131.csv",
  salt: "gwangjin-saltbox-20260820.csv",
  cacl: "gwangjin-cacl2box-20260904.csv",
  sand: "gwangjin-sandbag-20220119.csv",
  seoul: "seoul-heatline-by-gu-20260531.csv",
}
const ASOF = { heat: "2025-01-31", salt: "2026-08-20", cacl: "2026-09-04", sand: "2022-01-19", seoul: "2026-05-31" }
const SOURCE = {
  heat: "공공데이터포털 15142397 서울특별시 광진구_도로열선 설치 현황",
  salt: "공공데이터포털 15066599 서울특별시 광진구_제설함 위치정보",
  cacl: "공공데이터포털 15041574 서울특별시_광진구_염화칼슘보관함 위치정보",
  sand: "공공데이터포털 15041576 서울특별시_광진구_모래주머니 배치현황",
  seoul: "서울 열린데이터광장 OA-22584 서울시 열선 설치 현황(자치구별 도로열선 설치현황_20260531)",
}
const DONGS = ["중곡1동", "중곡2동", "중곡3동", "중곡4동", "능동", "구의1동", "구의2동", "구의3동", "광장동", "자양1동", "자양2동", "자양3동", "자양4동", "화양동", "군자동"]

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
function csv(file) {
  const txt = fs.readFileSync(path.join(RAW, file), "utf8").replace(/^\uFEFF/, "")
  const [head, ...body] = parseCsv(txt)
  const keys = head.map((s) => s.trim())
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

// ─── 지오코딩(카카오, 캐시) ───
const cache = fs.existsSync(CACHE_FILE) ? JSON.parse(fs.readFileSync(CACHE_FILE, "utf8")) : {}
let cacheDirty = false
async function kakao(url) {
  const r = await fetch(url, { headers: { Authorization: `KakaoAK ${KAKAO}` } })
  if (!r.ok) throw new Error(`kakao ${r.status}`)
  return r.json()
}
async function geocode(query) {
  if (query in cache) return cache[query]
  if (!KAKAO) return null
  const q = encodeURIComponent(query)
  let hit = null
  const a = await kakao(`https://dapi.kakao.com/v2/local/search/address.json?query=${q}`)
  if (a.documents?.length) hit = a.documents[0]
  if (!hit) {
    const k = await kakao(`https://dapi.kakao.com/v2/local/search/keyword.json?query=${q}&x=127.0857&y=37.5384&radius=6000`)
    if (k.documents?.length) hit = k.documents[0]
  }
  cache[query] = hit ? [round(+hit.y), round(+hit.x)] : null
  cacheDirty = true
  await new Promise((r) => setTimeout(r, 60))
  return cache[query]
}
const round = (v) => Math.round(v * 1e5) / 1e5

// 열선 기점·종점 표기 정규화: "구의2동 34-8" → "서울 광진구 구의동 34-8", "중곡 71" → "서울 광진구 중곡동 71", 건물명은 그대로
function heatAddr(raw, dong) {
  let a = raw.trim()
  a = a.replace(/^(구의|중곡|자양)\d동\s/, "$1동 ").replace(/^(구의|중곡|자양|광장|능|화양|군자)\s(?=\d)/, "$1동 ")
  if (!/동\s|로|길/.test(a)) a = `${legalDong(dong)} ${a}` // 학교명 등
  return `서울 광진구 ${a}`
}

// ─── 점이 동 경계 안에 있는지(제설함은 관리부서가 도로과라 동이 없다) ───
function pointInRing(lat, lng, ring) {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [yi, xi] = ring[i]
    const [yj, xj] = ring[j]
    if (yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}
function centroid(ring) {
  let lat = 0
  let lng = 0
  for (const p of ring) {
    lat += p[0]
    lng += p[1]
  }
  return [round(lat / ring.length), round(lng / ring.length)]
}

async function main() {
  const geo = JSON.parse(fs.readFileSync(path.join(OUT, "geo.json"), "utf8"))
  const outlines = geo.dongOutlines
  const dongOf = (lat, lng) => DONGS.find((d) => outlines[d]?.some((ring) => pointInRing(lat, lng, ring))) ?? null
  const center = Object.fromEntries(DONGS.map((d) => [d, centroid(outlines[d][0])]))

  // 열선 41구간
  const heat = []
  for (const r of csv(FILES.heat)) {
    const d = normDong(r["행정동"])
    const ends = []
    let approx = false
    for (const k of ["기점", "종점"]) {
      let p = await geocode(heatAddr(r[k], d))
      if (!p) {
        p = await geocode(`서울 광진구 ${r["노선명"].replace(/\s.*$/, "")}`) // 노선명(도로명)으로 재시도
        approx = true
      }
      if (!p) {
        p = center[d]
        approx = true
      }
      ends.push(p)
    }
    heat.push({
      i: +r["연번"],
      d,
      route: r["노선명"],
      from: r["기점"],
      to: r["종점"],
      m: +r["열선연장(m) (1차로 기준)"] || 0,
      lanes: r["차로수"],
      year: r["설치년도"] ? +r["설치년도"] : null,
      month: r["설치월"] ? +r["설치월"] : null,
      note: r["비고"] || "",
      a: ends[0],
      b: ends[1],
      approx,
    })
  }

  // 제설함 110 (도로과, 좌표 있음) → 동은 경계로 판정
  const salt = csv(FILES.salt).map((r) => {
    const lat = +r["위도"]
    const lng = +r["경도"]
    return { id: r["관리번호"], addr: r["도로명주소"].replace("서울특별시 광진구 ", ""), detail: r["상세위치"], lat, lng, d: dongOf(lat, lng) }
  })

  // 염화칼슘보관함 228 (관리부서 = 동). 열 이름은 X(GRS80TM)·Y(GRS80TM)지만 값은 WGS84 위경도(위도 37.5x, 경도 127.0x)다
  const cacl = csv(FILES.cacl).map((r) => ({
    id: r["관리번호"],
    addr: r["도로명주소"].replace("서울특별시 광진구 ", ""),
    lat: +r["X좌표(GRS80TM)"],
    lng: +r["Y좌표(GRS80TM)"],
    d: normDong(r["관리부서"]),
  }))

  // 모래주머니 45지점(취약지역 30 · 동 주민센터 15). 주소 지오코딩
  const sand = []
  for (const r of csv(FILES.sand)) {
    const d = normDong(r["행정동"])
    const raw = r["위치"].replace(/\s+/g, " ").replace(/\s0\d-\d+-?$/, "").trim()
    let q = raw.replace(/^서울특별시 광진구\s*/, "").replace(/^서울시 광진구\s*/, "")
    q = q.replace(/^(구의|중곡|자양)\d동\s/, "$1동 ")
    let p = await geocode(`서울 광진구 ${q}`)
    let approx = false
    if (!p && r["구분"] === "동 주민센터") p = await geocode(`광진구 ${d} 주민센터`)
    if (!p) {
      p = center[d]
      approx = true
    }
    sand.push({ kind: r["구분"] === "동 주민센터" ? "center" : "site", d, addr: q, qty: +r["배치수량"] || 0, note: r["비고"] || "", lat: p[0], lng: p[1], approx })
  }

  // 서울시 25개 자치구 열선(2026.5)
  const seoulAgg = {}
  for (const r of csv(FILES.seoul)) {
    const gu = r["관리기관"].trim()
    if (!gu) continue
    seoulAgg[gu] ??= { gu, n: 0, m: 0 }
    seoulAgg[gu].n += 1
    seoulAgg[gu].m += +String(r["설치연장(m)"]).replace(/,/g, "") || 0
  }
  const seoul = Object.values(seoulAgg).sort((a, b) => b.m - a.m)

  // 동별 집계
  const dongs = DONGS.map((d) => {
    const h = heat.filter((x) => x.d === d)
    const sd = sand.filter((x) => x.d === d)
    return {
      d,
      heatSeg: h.length,
      heatM: h.reduce((s, x) => s + x.m, 0),
      salt: salt.filter((x) => x.d === d).length,
      cacl: cacl.filter((x) => x.d === d).length,
      sand: sd.length,
      sandBags: sd.reduce((s, x) => s + x.qty, 0),
      center: center[d],
    }
  })

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
    seoul,
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
        rule: "열선 기점·종점과 모래주머니 주소는 카카오 주소검색(실패 시 키워드검색). 둘 다 실패하면 노선명(열선) 또는 동 중심점으로 두고 approx=true",
        heatApprox: heat.filter((h) => h.approx).length,
        sandApprox: sand.filter((s) => s.approx).length,
      },
      saltNoDong: salt.filter((s) => !s.d).length,
    },
  }
  fs.writeFileSync(path.join(OUT, "map.json"), JSON.stringify(map))
  if (cacheDirty) fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 1))

  const graph = buildGraph(map)
  fs.writeFileSync(path.join(OUT, "graph.json"), JSON.stringify(graph, null, 1))
  console.log(
    `map.json: 열선 ${heat.length}(근사 ${map.meta.geocode.heatApprox}) · 제설함 ${salt.length}(동 미판정 ${map.meta.saltNoDong}) · 염화칼슘함 ${cacl.length} · 모래주머니 ${sand.length}(근사 ${map.meta.geocode.sandApprox}) · 서울 ${seoul.length}구`,
  )
  console.log(`graph.json: 노드 ${graph.nodes.length} · 엣지 ${graph.edges.length}`)
}

// ─── 온톨로지 그래프 ───
// 노드 {id,type,space,label,props} · 엣지 {f,rel,t,props?}. 클래스·관계 규약은 lib/snow/schema.ts, 역량 질문은 lib/snow/queries.ts
function buildGraph(map) {
  const nodes = []
  const edges = []
  const N = (id, type, space, label, props = {}) => nodes.push({ id, type, space, label, props })
  const E = (f, rel, t, props) => edges.push(props ? { f, rel, t, props } : { f, rel, t })
  const PROV = (key, derived_by = "scripts/snow-data.mjs") => ({ source: map.source[key], asof: map.asof[key], derived_by })
  const fmt = (n) => n.toLocaleString("ko-KR")

  // 주체
  N("org-gwangjin", "Org", "subject", "광진구청", { name: "광진구청", role: "제설대책 총괄. 24시간 상황실" })
  N("team-road", "Team", "subject", "도로과 도로관리팀", { role: "조례 소관 부서. 제설함·도로열선 관리" })
  N("team-dong", "Team", "subject", "동주민센터(15개 동)", { role: "염화칼슘보관함·모래주머니 관리. 이면도로 생활권 제설" })
  N("org-seoul", "Org", "subject", "서울특별시", { role: "강설 대응 단계 기준 · 자치구 열선 집계 · 제설대책 평가" })
  N("org-civic", "Org", "subject", "자율방재단·의용소방대", { role: "민관협력 자원봉사 제설 인력", source: map.ops.source })
  N("actor-owner", "Org", "subject", "건축물관리자", { role: "소유자·점유자·관리자. 조례상 보도·이면도로 제설 의무" })

  // 데이터
  N("ds-heat", "Dataset", "resource", "광진구 도로열선 설치 현황", { rows: map.heat.length, ...PROV("heat", "공공데이터포털 CSV 원본") })
  N("ds-salt", "Dataset", "resource", "광진구 제설함 위치정보", { rows: map.salt.length, ...PROV("salt", "공공데이터포털 CSV 원본") })
  N("ds-cacl", "Dataset", "resource", "광진구 염화칼슘보관함 위치정보", { rows: map.cacl.length, ...PROV("cacl", "공공데이터포털 CSV 원본") })
  N("ds-sand", "Dataset", "resource", "광진구 모래주머니 배치현황", { rows: map.sand.length, ...PROV("sand", "공공데이터포털 CSV 원본") })
  N("ds-seoul-heat", "Dataset", "resource", "서울시 자치구별 도로열선 설치현황", { rows: map.seoul.reduce((s, g) => s + g.n, 0), ...PROV("seoul", "서울 열린데이터광장 CSV 원본") })
  N("ds-press", "Dataset", "resource", "광진구 제설대책 보도자료", { rows: 2, source: map.ops.source, asof: "2026-02-12", derived_by: "기사 본문 수치 전사" })
  E("org-gwangjin", "manages", "ds-heat")
  E("org-gwangjin", "manages", "ds-salt")
  E("org-gwangjin", "manages", "ds-cacl")
  E("org-gwangjin", "manages", "ds-sand")
  E("org-gwangjin", "manages", "ds-press")
  E("org-seoul", "manages", "ds-seoul-heat")
  E("team-road", "owns", "ds-heat")
  E("team-road", "owns", "ds-salt")
  E("team-dong", "owns", "ds-cacl")
  E("team-dong", "owns", "ds-sand")

  // 대응자원(유형)
  N("lev-heat", "Lever", "lever", "도로열선", { unit: "구간", count: map.heat.length, length_m: map.heat.reduce((s, h) => s + h.m, 0), kind: "상시 설비", def: "급경사·통학로 노면 아래 발열선. 강설 전 자동 가동으로 결빙을 막는다" })
  N("lev-salt", "Lever", "lever", "제설함", { unit: "개소", count: map.salt.length, kind: "비치 자재", def: "간선도로변 제설제 보관함. 운전자·관리기관이 즉시 살포" })
  N("lev-cacl", "Lever", "lever", "염화칼슘보관함", { unit: "개소", count: map.cacl.length, kind: "비치 자재", def: "이면도로·주택가 염화칼슘 보관함. 동주민센터가 관리, 주민이 자율 사용" })
  N("lev-sand", "Lever", "lever", "모래주머니", { unit: "지점", count: map.sand.length, bags: map.sand.reduce((s, x) => s + x.qty, 0), kind: "비치 자재", def: "취약지역·동주민센터 비치 모래. 결빙 노면 미끄럼 방지" })
  N("lev-sprayer", "Lever", "lever", "자동원격액상살포기", { unit: "대", count: map.ops.sprayers, kind: "상시 설비", def: "급경사 구간 원격 염수 분사. 강설 시 열선과 함께 가동", source: map.ops.source })
  N("lev-fleet", "Lever", "lever", "제설 장비", { unit: "대", unimog: map.ops.unimog, dump15t: map.ops.dump15t, kind: "동원 장비", def: "유니목 2대 · 15톤 덤프 3대 · 1톤·2.5톤 차량. 간선도로 제설제 살포·밀어내기", source: map.ops.source })
  N("lev-staff", "Lever", "lever", "제설 인력", { unit: "명", count: map.ops.staff, squads: map.ops.squads, kind: "동원 인력", def: "실무반 13개 · 환경공무관 · 동주민센터 직원 · 민간 용역", source: map.ops.source })
  N("lev-civic", "Lever", "lever", "민관협력 제설", { unit: "체계", kind: "동원 인력", def: "자율방재단·의용소방대 연계 자원봉사자 모집·운영", source: map.ops.source })
  N("lev-owner", "Lever", "lever", "건축물관리자 자율 제설", { unit: "의무", kind: "법정 의무", def: "조례 제4조 범위(보도 접한 구간·대지경계 1m)를 제5조 시한 안에 치운다" })
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
  N("con-slope", "Concept", "concept", "급경사 구간", { def: "경사로. 결빙 시 차량·보행 미끄럼 사고 위험이 가장 큰 곳" })
  N("con-school", "Concept", "concept", "통학로", { def: "초등학교 주변 보행로. 등교 시간대 결빙 노출" })
  N("con-alley", "Concept", "concept", "이면도로", { def: "폭 12m 미만, 차도·보도 구분 없는 도로(조례 제2조). 제설차 진입이 어렵다" })
  N("con-arterial", "Concept", "concept", "간선도로", { def: "차량 통행량 많은 주요 도로. 장비 살포 우선 구간" })
  N("con-transit", "Concept", "concept", "지하철역·버스정류장 주변", { def: "유동 인구 많은 다중이용 보행 구간. 인력 집중 배치 대상" })
  N("con-freeze", "Concept", "concept", "야간 결빙", { def: "강설 뒤 야간 저온으로 노면이 얼어붙는 조건. 살포·열선의 겨냥점" })
  N("con-snowfall", "Concept", "concept", "적설량 예보", { def: "서울시 대응 단계를 정하는 입력. 기상청 예보 적설(cm)" })
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
  N("kpi-coverage", "KPI", "outcome", "취약지점 자원 커버리지", { def: "취약지점마다 닿는 대응자원이 있는가. 동 단위로 자원 4종 유무를 센다", measurable: "동 단위 부분 측정" })
  N("kpi-deadline", "KPI", "outcome", "조례 제설 시한 준수", { def: "눈 그친 뒤 주간 4시간·야간 익일 11시 안에 보도·이면도로가 치워졌는가", measurable: "데이터 없음" })
  N("kpi-ice-incident", "KPI", "outcome", "결빙 사고·민원", { def: "결빙 미끄럼 사고와 제설 민원 건수", measurable: "데이터 없음" })
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
  E("con-freeze", "raises", "kpi-ice-incident")
  E("con-slope", "raises", "kpi-ice-incident")
  E("kpi-coverage", "operationalizes", "kpi-ice-incident")

  // 법령·기준
  N("pol-law-27", "Policy", "policy", "자연재해대책법 제27조", { law: "자연재해대책법", article: "제27조 건축물관리자의 제설 책임", efYd: "2025-10-01", gist: "건축물관리자는 주변 보도·이면도로·보행자전용도로·지붕을 제설·제빙한다. 구체 범위는 조례로", source: "법제처 국가법령정보센터 MST 276321" })
  N("pol-ord", "Policy", "policy", "광진구 건축물관리자의 제설·제빙에 관한 조례", { enacted: "2020-10-28", dept: "도로과 도로관리팀", day_hours: 4, night_until: "익일 11:00", heavy_cm: 10, heavy_hours: 24, scope_m: 1, gist: "제3조 책임순위 · 제4조 범위(보도 접한 구간, 대지경계 1m) · 제5조 시한 · 제9조 도구 비치", source: "법제처 자치법규 1540021" })
  N("pol-stage", "Policy", "policy", "서울시 강설 대응 단계 기준", { gist: "평시 → 보강(1cm 미만 예보) → 1단계(5cm 미만) → 2단계(5cm 이상·대설주의보) → 3단계(10cm 이상·대설경보)", source: "서울시 보도자료 2026-02-01(대설예비특보 2단계 발령)" })
  N("pol-period", "Policy", "policy", "겨울철 제설대책기간", { from: map.ops.period.from, to: map.ops.period.to, gist: "11월 중순부터 3월 15일까지 상황실·비상근무 운영", source: map.ops.source })
  N("stage-0", "Stage", "policy", "보강 단계", { order: 0, threshold_cm: 0, until_cm: 1, gist: "적설 1cm 미만 예보. 상황실 감시, 열선·살포기 상시 가동" })
  N("stage-1", "Stage", "policy", "1단계", { order: 1, threshold_cm: 1, until_cm: 5, gist: "적설 5cm 미만 예보. 제설제 사전 살포, 취약지점 인력 배치" })
  N("stage-2", "Stage", "policy", "2단계", { order: 2, threshold_cm: 5, until_cm: 10, gist: "적설 5cm 이상 예보 또는 대설주의보. 전 장비·인력 투입" })
  N("stage-3", "Stage", "policy", "3단계", { order: 3, threshold_cm: 10, until_cm: null, gist: "적설 10cm 이상 예보 또는 대설경보. 전 직원·민관협력 총동원" })
  E("pol-law-27", "delegates", "pol-ord")
  E("pol-ord", "obligates", "actor-owner")
  E("pol-ord", "basis", "lev-owner")
  E("pol-period", "basis", "lev-staff")
  E("pol-period", "basis", "lev-fleet")
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

  // 지역(행정동)과 자원 커버
  for (const d of map.dongs) {
    N(`area-${d.d}`, "Area", "area", d.d, { heatSeg: d.heatSeg, heatM: d.heatM, salt: d.salt, cacl: d.cacl, sand: d.sand, sandBags: d.sandBags })
    if (d.heatSeg) E("lev-heat", "covers", `area-${d.d}`, { count: d.heatSeg, length_m: d.heatM })
    if (d.salt) E("lev-salt", "covers", `area-${d.d}`, { count: d.salt })
    if (d.cacl) E("lev-cacl", "covers", `area-${d.d}`, { count: d.cacl })
    if (d.sand) E("lev-sand", "covers", `area-${d.d}`, { count: d.sand, bags: d.sandBags })
  }

  // 관측(증거)과 판단(주장). 수치는 전부 map.json에서 계산
  const heatM = map.heat.reduce((s, h) => s + h.m, 0)
  const byHeat = [...map.dongs].sort((a, b) => b.heatSeg - a.heatSeg)
  const top2 = byHeat.slice(0, 2)
  const top2Seg = top2.reduce((s, d) => s + d.heatSeg, 0)
  const noHeat = map.dongs.filter((d) => d.heatSeg === 0).map((d) => d.d)
  const byCacl = [...map.dongs].sort((a, b) => b.cacl - a.cacl)[0]
  const schoolSeg = map.heat.filter((h) => /통학로|초/.test(h.route)).length
  const seoulGj = map.seoul.find((g) => g.gu === "광진구")
  const seoulRank = map.seoul.findIndex((g) => g.gu === "광진구") + 1
  const pending = map.heat.filter((h) => /예정/.test(h.note)).length
  const noneAll = map.dongs.filter((d) => !d.heatSeg && !d.salt && !d.cacl && !d.sand).map((d) => d.d)

  N("ev-heat", "Evidence", "evidence", `열선 ${map.heat.length}구간 ${fmt(heatM)}m(1차로 기준), ${map.dongs.filter((d) => d.heatSeg).length}개 동`, { confidence: 1, ...PROV("heat") })
  N("ev-heat-top", "Evidence", "evidence", `열선 ${top2Seg}/${map.heat.length}구간이 ${top2.map((d) => d.d).join("·")}에 있다`, { confidence: 1, ...PROV("heat") })
  N("ev-heat-none", "Evidence", "evidence", `열선 없는 동 ${noHeat.length}곳: ${noHeat.join("·")}`, { confidence: 1, ...PROV("heat") })
  N("ev-heat-school", "Evidence", "evidence", `노선명에 통학로·학교가 적힌 열선 ${schoolSeg}구간`, { confidence: 1, ...PROV("heat") })
  N("ev-heat-pending", "Evidence", "evidence", `2025년 상반기 설치 예정 표기 ${pending}구간(설치년월 비어 있음)`, { confidence: 1, ...PROV("heat") })
  N("ev-salt", "Evidence", "evidence", `제설함 ${map.salt.length}개소, 전부 도로과 관리(간선도로변)`, { confidence: 1, ...PROV("salt") })
  N("ev-cacl", "Evidence", "evidence", `염화칼슘보관함 ${map.cacl.length}개소, ${byCacl.d} ${byCacl.cacl}개소(${Math.round((byCacl.cacl / map.cacl.length) * 100)}%)`, { confidence: 1, ...PROV("cacl") })
  N("ev-sand", "Evidence", "evidence", `모래주머니 ${map.sand.length}지점 ${fmt(map.sand.reduce((s, x) => s + x.qty, 0))}포(취약지역 ${map.sand.filter((s) => s.kind === "site").length} · 동주민센터 ${map.sand.filter((s) => s.kind === "center").length})`, { confidence: 0.8, ...PROV("sand"), note: "기준일 2022-01-19. 네 데이터 중 가장 오래됐다" })
  N("ev-seoul", "Evidence", "evidence", `서울 25개 구 열선 ${fmt(map.seoul.reduce((s, g) => s + g.n, 0))}개소 ${fmt(map.seoul.reduce((s, g) => s + g.m, 0))}m. 광진구 ${seoulGj?.n}개소 ${fmt(seoulGj?.m ?? 0)}m, 연장 ${seoulRank}위`, { confidence: 1, ...PROV("seoul") })
  N("ev-update-gap", "Evidence", "evidence", `서울시 집계(2026.5) 광진 ${seoulGj?.n}개소 ${fmt(seoulGj?.m ?? 0)}m vs 구 공개(2025.1) ${map.heat.length}구간 ${fmt(heatM)}m`, { confidence: 1, source: `${map.source.seoul} · ${map.source.heat}`, asof: "2026-05-31", derived_by: "scripts/snow-data.mjs" })
  N("ev-press", "Evidence", "evidence", `보도 수치: 인력 ${fmt(map.ops.staff)}명 · 살포기 ${map.ops.sprayers}대 · 열선 ${map.ops.heatSites}개소 · 취약지점 ${map.ops.weakPoints}개소 · 제설함류 ${map.ops.boxSites}개소`, { confidence: 0.6, source: map.ops.source, asof: "2026-02-12", derived_by: "기사 본문 전사", note: "공공데이터가 아니라 보도자료. 개소 정의가 공개 데이터와 다를 수 있다" })
  N("ev-coverage", "Evidence", "evidence", noneAll.length ? `자원 4종이 모두 없는 동 ${noneAll.length}곳: ${noneAll.join("·")}` : "자원 4종 중 하나도 없는 동은 없다. 열선만 없는 동 " + noHeat.length + "곳", { confidence: 1, source: "map.json dongs", asof: map.asof.cacl, derived_by: "scripts/snow-data.mjs" })
  E("ds-heat", "contains", "ev-heat")
  E("ds-heat", "contains", "ev-heat-top")
  E("ds-heat", "contains", "ev-heat-none")
  E("ds-heat", "contains", "ev-heat-school")
  E("ds-heat", "contains", "ev-heat-pending")
  E("ds-salt", "contains", "ev-salt")
  E("ds-cacl", "contains", "ev-cacl")
  E("ds-sand", "contains", "ev-sand")
  E("ds-seoul-heat", "contains", "ev-seoul")
  E("ds-seoul-heat", "derived_from", "ev-update-gap")
  E("ds-heat", "derived_from", "ev-update-gap")
  E("ds-press", "contains", "ev-press")
  for (const k of ["ds-heat", "ds-salt", "ds-cacl", "ds-sand"]) E(k, "derived_from", "ev-coverage")
  E("ev-heat", "describes", "lev-heat")
  E("ev-salt", "describes", "lev-salt")
  E("ev-cacl", "describes", "lev-cacl")
  E("ev-sand", "describes", "lev-sand")
  E("ev-press", "describes", "lev-sprayer")
  E("ev-press", "describes", "lev-fleet")
  E("ev-press", "describes", "lev-staff")
  E("ev-heat-school", "describes", "con-school")
  E("ev-coverage", "describes", "kpi-coverage")
  E("ev-press", "describes", "kpi-eval")

  N("claim-heat-concentration", "Claim", "claim", `열선은 ${top2.map((d) => d.d).join("·")} 두 동에 절반이 몰려 있다`, { gist: `${top2Seg}/${map.heat.length}구간. 급경사·통학로가 많은 동에 집중 설치한 결과로 읽히지만, 다른 동의 급경사 목록이 공개돼 있지 않아 적정성은 판단할 수 없다` })
  N("claim-heat-gap", "Claim", "claim", `${noHeat.join("·")}은 열선 없이 비치 자재와 인력으로만 대응한다`, { gist: "열선 0구간. 염화칼슘함·모래주머니는 있다. 급경사가 없어서인지 우선순위 밖인지는 데이터로 알 수 없다" })
  N("claim-update-gap", "Claim", "claim", "구가 공개한 열선 목록은 서울시 집계보다 한 시즌 뒤처져 있다", { gist: `${(seoulGj?.n ?? 0) - map.heat.length}개소 ${fmt((seoulGj?.m ?? 0) - heatM)}m 차이. 2025년 설치분이 구 공개 데이터에 아직 없다. 지도의 열선은 2025.1 기준` })
  N("claim-alley-first", "Claim", "claim", "이면도로 대응은 장비가 아니라 비치 자재와 주민에 기대고 있다", { gist: `염화칼슘함 ${map.cacl.length}개소·모래주머니 ${map.sand.length}지점이 동 단위로 깔려 있고, 조례가 건축물관리자에게 대지경계 1m를 맡긴다` })
  N("claim-kpi-missing", "Claim", "claim", "조례 시한 준수와 결빙 사고는 잴 데이터가 없다", { gist: "자원 배치는 공개돼 있지만 결과(사고·민원·시한 준수)는 공개 데이터가 없다. 서울시 평가 등급만 남는다" })
  E("ev-heat-top", "supports", "claim-heat-concentration")
  E("ev-heat-school", "supports", "claim-heat-concentration")
  E("ev-heat-none", "supports", "claim-heat-gap")
  E("ev-coverage", "supports", "claim-heat-gap")
  E("ev-update-gap", "supports", "claim-update-gap")
  E("ev-heat-pending", "supports", "claim-update-gap")
  E("ev-cacl", "supports", "claim-alley-first")
  E("ev-sand", "supports", "claim-alley-first")
  E("ev-press", "supports", "claim-kpi-missing")
  E("claim-kpi-missing", "governs", "kpi-deadline")
  E("claim-kpi-missing", "governs", "kpi-ice-incident")
  E("claim-update-gap", "governs", "lev-heat")

  return { nodes, edges }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
