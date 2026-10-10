import { test } from "node:test"
import assert from "node:assert"
import { existsSync, readFileSync } from "node:fs"
import type { DumpingMapData } from "../lib/dumping/types"
import {
  BASE_DEF,
  COL_MAX_M,
  COL_MIN_COUNT,
  COL_MIN_M,
  colHeight,
  colorOf,
  dongColumnsFC,
  flyWaypoints,
  flySegmentMs,
  flyCameraAt,
  flyRouteFC,
  flyStops,
  cellLookup,
  circleColumnsFC,
  discPolygon,
  postsFC,
  ringPolygon,
  CYL_MIN_M,
  CYL_MAX_M,
  ENF_COLOR,
  gridColumnsFC,
  hotspotsFC,
  radiusMetersExpr,
  ringFC,
  routeChains,
  dongCenter,
  dongAnchors,
  realBuildingExpr,
  REAL_BUILDING,
  DONG_MIN_GAP_M,
  stepExpr,
  topCells,
  leadMetric,
} from "../components/dumping/map-geo"
import { DEFAULT_VIEW } from "../components/dumping/map-controls"

// 16라운드(2026-09-19) MapLibre 전환. 지도 엔진 없이 검증할 수 있는 순수 계산부만 핀으로 박는다

const MAP_PATH = new URL("../data/dumping/map.json", import.meta.url)
const map: DumpingMapData | null = existsSync(MAP_PATH) ? (JSON.parse(readFileSync(MAP_PATH, "utf8")) as DumpingMapData) : null
const withMap = { skip: map ? false : "data/dumping/map.json 없음. `npm run dumping:decrypt`" }

test("step 표현식은 colorOf와 같은 경계로 색을 고른다(v > stop이면 다음 단계)", () => {
  const { stops, pal } = BASE_DEF.unm
  const expr = stepExpr("unm", stops, pal)
  // ["step", input, pal0, s0+1, pal1, s1+1, pal2, ...]. 경계값 자체는 아래 단계, 경계+1부터 위 단계
  for (const v of [0, 1, 20, 21, 60, 150, 151, 600, 601, 5000]) {
    let color = expr[2] as string
    for (let i = 3; i < expr.length; i += 2) if (v >= (expr[i] as number)) color = expr[i + 1] as string
    assert.equal(color, colorOf(v, stops, pal), `v=${v}`)
  }
})

test("미터 반경 표현식은 지수(밑 2) 보간이라 줌 10과 22 사이가 정확히 미터 비례", () => {
  const e = radiusMetersExpr("r")
  assert.equal(e[0], "interpolate")
  assert.deepEqual(e[1], ["exponential", 2])
  const at10 = e[4] as unknown[]
  const at22 = e[6] as unknown[]
  // r / mpp(10) 와 r / mpp(22): 분모 비율이 정확히 2^12
  const d10 = at10[2] as number
  const d22 = at22[2] as number
  assert.ok(Math.abs(d10 / d22 - 4096) < 1e-6)
})

test("기둥 높이는 최댓값에서 COL_MAX_M, 0에서 COL_MIN_M", () => {
  assert.equal(colHeight(0, 100), COL_MIN_M)
  assert.equal(colHeight(100, 100), COL_MAX_M)
  assert.ok(colHeight(50, 100) > COL_MIN_M && colHeight(50, 100) < COL_MAX_M)
})

test("격자 기둥은 5건 이상 칸만, 지표 둘이면 칸마다 좌우 두 기둥", withMap, () => {
  const one = gridColumnsFC(map!, ["enf"], null)
  assert.ok(one.features.length > 0)
  for (const f of one.features) assert.ok((f.properties.v as number) >= COL_MIN_COUNT)
  const two = gridColumnsFC(map!, ["comp", "enf"], null)
  // 칸 하나가 두 피처. 두 지표 중 하나라도 5건이면 둘 다 세운다(한쪽은 최소 높이)
  assert.equal(two.features.length % 2, 0)
  const metrics = new Set(two.features.map((f) => f.properties.metric))
  assert.deepEqual([...metrics].sort(), ["과태료", "민원"])
  // 동을 고르면 그 동 칸만
  const dong = map!.dong[0].d
  const only = gridColumnsFC(map!, ["enf"], dong)
  assert.ok(only.features.length < one.features.length)
})

test("핫스팟 20은 기둥·순위 라벨·입체 숫자 각 20, 상위 3만 top. 숫자는 기둥 높이·색을 그대로 든다(21라운드)", withMap, () => {
  const hot = hotspotsFC(map!)
  assert.equal(hot.cols.features.length, map!.decision.hotspots.top.length)
  assert.equal(hot.labels.features.filter((f) => f.properties.top === 1).length, 3)
  assert.equal(hot.labels.features[0].properties.label, "1") // 평면 배지는 숫자만(흰 글자+벽돌 후광)
  assert.equal(hot.ranks.length, hot.cols.features.length)
  hot.ranks.forEach((r, i) => {
    assert.equal(r.rank, i + 1)
    assert.equal(r.h, hot.cols.features[i].properties.h)
    assert.equal(r.color, hot.cols.features[i].properties.color)
  })
})

test("구 경계는 닫힌 링, 마스크는 세계 사각형에 구를 뚫은 폴리곤, 경계 상자는 [lng, lat]", withMap, () => {
  const ring = ringFC(map!.ring)
  const line = ring.line.features[0].geometry as GeoJSON.LineString
  assert.deepEqual(line.coordinates[0], line.coordinates[line.coordinates.length - 1])
  const mask = ring.mask.features[0].geometry as GeoJSON.Polygon
  assert.equal(mask.coordinates.length, 2)
  const [[w, s], [e, n]] = ring.bounds
  assert.ok(w > 126 && e < 128 && s > 37 && n < 38, "광진구 경계 상자")
})

test("기본 보기는 입체, 자동 회전·드론 비행은 꺼짐", () => {
  assert.equal(DEFAULT_VIEW.tilt, true)
  assert.equal(DEFAULT_VIEW.orbit, false)
  assert.equal(DEFAULT_VIEW.fly, false)
})

test("동별 기둥은 동마다 민원·과태료 두 기둥, 채널 모드는 민원 기둥이 토막으로 쌓인다(바닥 높이 이어짐)", withMap, () => {
  const total = dongColumnsFC(map!, "total", null)
  assert.equal(total.cols.features.length, map!.dong.length * 2)
  assert.equal(total.labels.features.length, map!.dong.length)
  for (const f of total.cols.features) assert.equal(f.properties.base, 0)
  const ch = dongColumnsFC(map!, "channel", null)
  assert.ok(ch.cols.features.length > total.cols.features.length)
  const first = map!.dong[0].d
  const segs = ch.cols.features.filter((f) => f.properties.dong === first && f.properties.color !== ENF_COLOR)
  for (let i = 1; i < segs.length; i++) assert.ok(Math.abs((segs[i].properties.base as number) - (segs[i - 1].properties.h as number)) < 1e-9)
  // 툴팁은 카드형(card=1)
  assert.equal(total.cols.features[0].properties.card, 1)
})

test("드론 비행: 조망 → 핫스팟 5곳 → 조망. 핫스팟 경유지는 목표를 들고, 카메라 곡선은 경유지에서 정확히 그 지점·줌", withMap, () => {
  const wps = flyWaypoints(map!, { center: [127.085, 37.546], zoom: 13.2 })
  assert.equal(wps.length, 7)
  assert.equal(wps[0].target, undefined)
  assert.equal(wps[6].target, undefined)
  wps.slice(1, 6).forEach((w, i) => {
    assert.equal(w.target?.rank, i + 1)
    assert.ok(w.target?.label.startsWith(`예측 핫스팟 ${i + 1}위`))
    assert.deepEqual(w.target?.lnglat, w.center)
    assert.ok(w.zoom > 15 && w.pitch > 55)
  })
  // 구간 시작·끝은 경유지 그대로(f=0은 i, f=1은 i+1). 중간은 두 지점 사이
  const c0 = flyCameraAt(wps, 0, 0)
  assert.deepEqual(c0.center, wps[0].center)
  assert.equal(c0.zoom, wps[0].zoom)
  const c1 = flyCameraAt(wps, 0, 1)
  assert.ok(Math.abs(c1.center[0] - wps[1].center[0]) < 1e-9 && Math.abs(c1.zoom - wps[1].zoom) < 1e-9)
  const mid = flyCameraAt(wps, 1, 0.5)
  assert.ok(mid.zoom < wps[1].zoom, "핫스팟 사이는 살짝 떠오른다")
  for (let i = 0; i < wps.length - 1; i++) {
    const ms = flySegmentMs(wps[i], wps[i + 1])
    assert.ok(ms >= 5000 && ms <= 11000, `구간 ${i} ${ms}ms`)
  }
  const route = flyRouteFC(map!)
  assert.equal((route.path.features[0].geometry as GeoJSON.LineString).coordinates.length, 5)
})

// 21라운드 시연: 장면마다 다른 목표를 1위부터(상습격자 3장면·예측 핫스팟 4장면·재배치 후보 5장면). 같은 비행 규약에 목표만 바뀐다
test("드론 목표 묶음: 상습격자는 12개월 건수 내림차순 1위부터, 재배치 후보는 후보 순서, 경로·경유지가 그 순서를 따른다", withMap, () => {
  const crit = flyStops(map!, "critical")
  assert.equal(crit.length, 5)
  const counts = [...map!.decision.kpi.criticalCells].map((c) => c[4]).sort((a, b) => b - a)
  crit.forEach((s, i) => {
    assert.equal(s.rank, i + 1)
    assert.ok(s.label.startsWith(`상습격자 ${i + 1}위`) && s.label.endsWith(`12개월 ${counts[i]}건`), s.label)
  })
  const cand = flyStops(map!, "candidates")
  assert.equal(cand.length, Math.min(5, map!.cctvCandidates.length))
  cand.forEach((s, i) => {
    assert.ok(s.label.startsWith(`재배치 후보 ${i + 1}위`), s.label)
    assert.deepEqual(s.lnglat, [map!.cctvCandidates[i][1], map!.cctvCandidates[i][0]])
  })
  assert.deepEqual(flyStops(map!), flyStops(map!, "hotspots"))
  const wps = flyWaypoints(map!, { center: [127.085, 37.546], zoom: 13.2 }, "candidates")
  assert.deepEqual(wps.slice(1, -1).map((w) => w.target?.label), cand.map((s) => s.label))
  // 경로 점선은 1위→5위 순서. 번호 지점은 없다(기둥·핀 숫자와 겹친다)
  const route = flyRouteFC(map!, "critical")
  assert.deepEqual((route.path.features[0].geometry as GeoJSON.LineString).coordinates, crit.map((s) => s.lnglat))
})

// ─── 18라운드: 입체 전용 도형 ───
test("원판 다각형은 요청한 반지름(m)을 지키고 닫힌 고리다", () => {
  const poly = discPolygon(127.08, 37.55, 40, 20)
  const ring = poly.coordinates[0]
  assert.equal(ring.length, 21)
  assert.deepEqual(ring[0], ring[20])
  const dLat = (ring[5][1] - 37.55) * 111320 // 90도 지점: 북쪽으로 r
  assert.ok(Math.abs(dLat - 40) < 0.5, `북쪽 반지름 ${dLat}`)
  const hole = ringPolygon(127.08, 37.55, 40, 8)
  assert.equal(hole.coordinates.length, 2)
})

test("원기둥은 평면 원과 같은 칸·같은 반지름 규칙, 높이는 최소~최대 사이", withMap, () => {
  const cols = circleColumnsFC(map!, ["enf"])
  const nonzero = map!.grid.filter((c) => c[5] > 0).length
  assert.equal(cols.features.length, nonzero)
  for (const f of cols.features) {
    const h = f.properties.h as number
    assert.ok(h >= CYL_MIN_M && h <= CYL_MAX_M)
  }
  const maxF = cols.features.reduce((a, b) => ((a.properties.v as number) >= (b.properties.v as number) ? a : b))
  assert.equal(maxF.properties.h, CYL_MAX_M)
  // 두 지표를 같이 켜면 한 칸에 두 기둥이 좌우로 비켜 선다
  const both = circleColumnsFC(map!, ["comp", "enf"])
  assert.ok(both.features.length > cols.features.length)
})

// 26라운드 모형 숫자 카드: 원기둥 중 건수 상위 칸. 지도 거르기와 같은 뜻(동 이름 그 동만 · "\u0000" 없음)
test("숫자 카드 상위 칸: 원기둥 건수 내림차순 1~3위, 동 거르기·전부 숨김을 따른다", withMap, () => {
  const cols = circleColumnsFC(map!, ["enf"])
  const top = topCells(cols, 3, null)
  const want = map!.grid.map((c) => c[5]).sort((a, b) => b - a).slice(0, 3)
  assert.deepStrictEqual(top.map((c) => c.v), want)
  assert.deepStrictEqual(top.map((c) => c.rank), [1, 2, 3])
  assert.ok(top.every((c) => c.cid === "enf" && Math.abs(c.lng - 127.08) < 0.06 && Math.abs(c.lat - 37.545) < 0.04))
  const dong = top[0].dong
  assert.ok(topCells(cols, 3, dong).every((c) => c.dong === dong))
  assert.strictEqual(topCells(cols, 3, "\u0000").length, 0)
  // 두 원을 같이 켜면 지표가 섞이지 않게 대표 지표(과태료가 있으면 과태료)로만 매긴다(26라운드 검증: 민원 115건이 1위, 과태료 1위 칸이 2위로 섞였다)
  const both = circleColumnsFC(map!, ["comp", "enf"])
  assert.strictEqual(leadMetric(both.features.map((f) => f.properties.cid)), "enf")
  assert.strictEqual(leadMetric(["comp"]), "comp")
  const lead = topCells(both, 3, null, "enf")
  assert.deepStrictEqual(lead.map((c) => c.v), want)
  assert.ok(lead.every((c) => c.cid === "enf"))
})

test("말뚝은 점의 속성(툴팁·색)을 그대로 들고 발자국만 원판", () => {
  const pts = { type: "FeatureCollection" as const, features: [{ type: "Feature" as const, properties: { color: "#123", tip: "x" }, geometry: { type: "Point" as const, coordinates: [127.08, 37.55] } }] }
  const posts = postsFC(pts, 9, 34)
  assert.equal(posts.features[0].properties.color, "#123")
  assert.equal(posts.features[0].properties.h, 34)
  assert.equal(posts.features[0].geometry.type, "Polygon")
})

test("격자 조회는 칸 중심을 제 칸으로, 구 밖은 -1", withMap, () => {
  const find = cellLookup(map!.grid)
  let ok = 0
  map!.grid.forEach((c, i) => {
    if (find((c[0] + c[2]) / 2, (c[1] + c[3]) / 2) === i) ok++
  })
  assert.equal(ok, map!.grid.length)
  assert.equal(find(37.0, 126.0), -1)
})

test("청소차 노선 체인: 관리 도로만, 끝점이 이어진 폴리라인, 긴 것부터", () => {
  const links = [
    { n: "천호대로", p: [[37.54, 127.07], [37.541, 127.072]] },
    { n: "천호대로", p: [[37.541, 127.072], [37.542, 127.075]] },
    { n: "천호대로", p: [[37.545, 127.08], [37.542, 127.075]] }, // 뒤집힌 링크
    { n: "동일로", p: [[37.55, 127.07], [37.5501, 127.0701]] }, // 300m 미만 자투리
    { n: "없는길", p: [[37.5, 127.0], [37.6, 127.1]] },
  ]
  const chains = routeChains(links)
  assert.equal(chains.length, 1)
  assert.equal(chains[0].name, "천호대로")
  assert.equal(chains[0].focus, true)
  assert.equal(chains[0].coords.length, 4)
  assert.ok(chains[0].meters > 800)
})

test("동 기준점은 동주민센터 위치, 목록에 없는 이름은 꼭짓점 평균", withMap, () => {
  for (const d of map!.dong) {
    const c = dongCenter(map!.dongOutlines[d.d] ?? [], d.d)!
    assert.ok(c[0] > 127.06 && c[0] < 127.11 && c[1] > 37.52 && c[1] < 37.58, `${d.d} ${c}`)
  }
  const ring: [number, number][][] = [[[37.5, 127.0], [37.5, 127.1], [37.6, 127.1], [37.6, 127.0]]]
  assert.deepEqual(dongCenter(ring, "없는동"), [127.05, 37.55])
})

test("동 기준점끼리는 최소 간격을 지킨다(중곡1동·2동 주민센터 136m → 벌림)", withMap, () => {
  const a = dongAnchors(map!)
  const names = [...a.keys()]
  for (let i = 0; i < names.length; i++)
    for (let j = i + 1; j < names.length; j++) {
      const p = a.get(names[i])!
      const q = a.get(names[j])!
      const d = Math.hypot((p[0] - q[0]) * 111320 * Math.cos((p[1] * Math.PI) / 180), (p[1] - q[1]) * 111320)
      assert.ok(d >= DONG_MIN_GAP_M - 1, `${names[i]}·${names[j]} ${d.toFixed(0)}m`)
    }
})

test("실사 건물 색 식: 층수 보간 + UFID 끝자리 흔들림, 테마별 팔레트 5단", () => {
  const e = realBuildingExpr("light") as unknown[]
  assert.equal(e[0], "interpolate")
  const stops = e.slice(3).filter((_, i) => i % 2 === 0)
  assert.deepEqual(stops, [1, 4, 8, 16, 28])
  const cols = e.slice(3).filter((_, i) => i % 2 === 1)
  assert.deepEqual(cols, [...REAL_BUILDING.light])
  assert.notDeepEqual(realBuildingExpr("dark").slice(3).filter((_, i) => i % 2 === 1), cols)
})

// 26라운드 후속(2026-10-10 사용자 "모든 지도상 3D 객체 범례 전수조사"): 켜진 개체마다 범례 한 줄, 꺼지면 없음. 민원·과태료는 색상각이 갈라진 짝
test("지도 위 개체 범례: 켜진 층마다 한 줄(동별 막대·상습격자·핫스팟·후보·배치추천·시설·노선·분위기 그림), 꺼진 층은 없음", withMap, async () => {
  const { objectLegend } = await import("../components/dumping/legend-items")
  const { COMP_COLOR, ENF_COLOR } = await import("../components/dumping/map-geo")
  const base = { ...DEFAULT_VIEW }
  assert.deepStrictEqual(objectLegend({ view: base, model: false, hotspots: false, critical: false, data: map }), [])
  const all = objectLegend({
    view: { ...base, dongBars: true, candidates: true, binRecos: true, routes: true, layers: ["clothBins", "cctvMobile"] },
    model: true,
    hotspots: true,
    critical: true,
    data: map,
  })
  assert.deepStrictEqual(all.map((o) => o.key), ["dong", "critical", "hotspots", "candidates", "binRecos", "infra-clothBins", "infra-cctvMobile", "infra-note", "routes", "decor"])
  assert.ok(all.find((o) => o.key === "critical")!.text.includes(`${map!.decision.kpi.criticalCells.length}곳`))
  assert.ok(all.find((o) => o.key === "infra-cctvMobile")!.text.includes("대"))
  for (const o of all) assert.ok(!/=|→|\.\.\.|…/.test(o.text), o.text)
  const hue = (h: string) => {
    const [r, g, b] = [1, 3, 5].map((k) => parseInt(h.slice(k, k + 2), 16) / 255)
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn
    const x = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4
    return (x * 60 + 360) % 360
  }
  const gap = Math.abs(hue(COMP_COLOR) - hue(ENF_COLOR))
  assert.ok(Math.min(gap, 360 - gap) > 150, `민원·과태료 색상각 차 ${gap}`)
})
