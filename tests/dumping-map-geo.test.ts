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
  stepExpr,
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

test("핫스팟 20은 기둥·순위 라벨 각 20, 상위 3만 top", withMap, () => {
  const hot = hotspotsFC(map!)
  assert.equal(hot.cols.features.length, map!.decision.hotspots.top.length)
  assert.equal(hot.labels.features.filter((f) => f.properties.top === 1).length, 3)
  assert.equal(hot.labels.features[0].properties.label, "1위")
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
  assert.equal(route.points.features.length, 5)
  assert.equal((route.path.features[0].geometry as GeoJSON.LineString).coordinates.length, 5)
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
