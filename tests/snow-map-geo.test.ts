import { test } from "node:test"
import assert from "node:assert"
import mapJson from "../data/snow/map.json" with { type: "json" }
import type { SnowMapData } from "../lib/snow/types"
import {
  COL_MAX_M,
  DONG_MIN_GAP_M,
  dongAnchors,
  dongColsFC,
  dongFC,
  flyCameraAt,
  flyRouteFC,
  flySegmentMs,
  flyWaypoints,
  heatFC,
  iceLabelFC,
  insideRing,
  MAT_GLYPH,
  matLabelFC,
  ringFC,
  saltFC,
  segMid,
  segWalls,
  slopeRamps,
  tip,
  truckRoutes,
  weakLabelFC,
  type FlyStop,
} from "../components/snow/map-geo"

// /snow 지도 GeoJSON 조립부 핀(6라운드, dumping tests/dumping-map-geo.test.ts 규약 이식). 엔진 없이 map-geo만 부른다.
// 좌표 방향([lat,lng] 데이터 → [lng,lat] GeoJSON), 동 자리 벌림, 번호 배지 자리표, 구간 벽 색 문법, 드론 비행 곡선, 툴팁 이스케이프를 박는다

const data = mapJson as unknown as SnowMapData
const meters = (a: [number, number], b: [number, number]) => Math.hypot((b[1] - a[1]) * 111320 * Math.cos((a[0] * Math.PI) / 180), (b[0] - a[0]) * 111320)

test("GeoJSON 좌표는 [lng, lat]: 열선 선형·자재 점·동 라벨 전부 광진구 안(127.05~127.13, 37.52~37.58)", () => {
  const inGu = (c: number[]) => c[0] > 127.05 && c[0] < 127.13 && c[1] > 37.52 && c[1] < 37.58
  for (const f of heatFC(data).features) for (const c of (f.geometry as GeoJSON.LineString).coordinates) assert.ok(inGu(c), `열선 ${f.properties?.id} 좌표 ${c}`)
  for (const f of saltFC(data).features) assert.ok(inGu((f.geometry as GeoJSON.Point).coordinates))
  for (const f of dongFC(data).labels.features) assert.ok(inGu((f.geometry as GeoJSON.Point).coordinates))
  const ring = ringFC(data.ring)
  assert.ok(ring.bounds[0][0] < ring.bounds[1][0] && ring.bounds[0][1] < ring.bounds[1][1])
  assert.strictEqual(ring.mask.features[0].geometry.type, "Polygon")
  assert.strictEqual((ring.mask.features[0].geometry as GeoJSON.Polygon).coordinates.length, 2, "마스크는 구멍(구 경계) 하나가 뚫린 면")
})

test("동 이름 자리(dongAnchors): 15개 동, 모든 쌍이 420m 이상(중곡1동·2동 주민센터 136m를 벌린다)", () => {
  const pos = dongAnchors(data)
  assert.strictEqual(pos.size, data.dongs.length)
  const names = [...pos.keys()]
  for (let i = 0; i < names.length; i++)
    for (let j = i + 1; j < names.length; j++) {
      const d = meters(pos.get(names[i])!, pos.get(names[j])!)
      assert.ok(d >= DONG_MIN_GAP_M - 1, `${names[i]}·${names[j]} ${d.toFixed(0)}m`)
    }
  // 원래 136m였던 쌍은 벌어졌고, 먼 동은 제자리
  const raw = new Map(data.dongs.map((d) => [d.d, d.center]))
  assert.ok(meters(raw.get("중곡1동")!, raw.get("중곡2동")!) < DONG_MIN_GAP_M)
  assert.ok(meters(pos.get("광장동")!, raw.get("광장동")!) < 1)
})

test("취약구간 번호 배지(weakLabelFC): 구간마다 하나, 열선 없는 구간은 우선순위 순으로 자리표(anchor·roff)를 받고 가까운 쌍은 다른 자리", () => {
  const order = new Map(data.weak.map((w, k) => [w.i, k + 1]))
  const fcL = weakLabelFC(data, order)
  assert.strictEqual(fcL.features.length, data.weak.length)
  for (const f of fcL.features) {
    const p = f.properties!
    assert.ok(typeof p.anchor === "string" && typeof p.roff === "number" && typeof p.anchorT === "string" && typeof p.roffT === "number", `배지 ${p.n} 자리표 없음`)
    assert.ok(["heat", "gap", "none", "ok"].includes(p.status) || typeof p.status === "string")
  }
  const noHeat = fcL.features.filter((f) => f.properties!.heat === 0)
  assert.ok(noHeat.length >= 10, `열선 없는 배지 ${noHeat.length}`)
  // 260m 안에 있는 열선 없는 구간 쌍은 같은 자리표를 안 받는다(광장동 2·4·5 뭉침 실사고)
  const pts = noHeat.map((f) => ({ n: f.properties!.n, key: `${f.properties!.anchor}/${f.properties!.roff}`, c: (f.geometry as GeoJSON.Point).coordinates as [number, number] }))
  for (let i = 0; i < pts.length; i++)
    for (let j = i + 1; j < pts.length; j++) {
      const d = meters([pts[i].c[1], pts[i].c[0]], [pts[j].c[1], pts[j].c[0]])
      if (d < 260) assert.notStrictEqual(pts[i].key, pts[j].key, `배지 ${pts[i].n}·${pts[j].n} ${d.toFixed(0)}m 같은 자리`)
    }
})

test("구간 벽(segWalls): 열선 없는 취약구간은 진홍·전체 높이, 열선 있는 구간은 회색·0.35, 결빙구간은 0.55, 법령 탭은 전부 관리청 색, 예산 신설은 열선색 1.5", () => {
  const walls = segWalls(data, true, false, { weak: true, ice: true })
  const weakNoHeat = data.weak.filter((w) => !w.heatCovered).length
  const risk = walls.filter((w) => w.h === undefined)
  assert.strictEqual(risk.length, weakNoHeat, "진홍 전체 높이 벽 = 열선 없는 취약구간 수")
  assert.strictEqual(walls.filter((w) => w.h === 0.35).length, data.weak.length - weakNoHeat, "회색 낮은 벽 = 열선 있는 취약구간 수")
  const iceLined = data.ice.filter((s) => s.method !== "points" && s.path.length >= 2 && !s.heatCovered).length
  assert.strictEqual(walls.filter((w) => w.h === 0.55).length, iceLined)
  assert.strictEqual(new Set(risk.map((w) => w.color)).size, 1, "열선 없는 취약구간 벽은 한 색")
  // 법령 탭: 취약구간 47 전부 + 선형 있는 결빙구간, 색은 관리청 2종 이하
  const owner = segWalls(data, true, true, { weak: true, ice: true })
  assert.ok(owner.length >= data.weak.length)
  assert.ok(new Set(owner.map((w) => w.color)).size <= 2)
  // 예산 신설
  const first = data.weak.find((w) => !w.heatCovered)!
  const planned = segWalls(data, true, false, { weak: true, ice: false }, [first.i])
  assert.ok(planned.some((w) => w.h === 1.5 && w.coords === first.path))
  assert.strictEqual(segWalls(data, true, false, { weak: false, ice: false }).length, 0)
})

test("드론 비행: 경유지는 조망·후보 n·조망, 구간 시간 5~11초, 곡선 위 카메라가 양 끝 경유지와 이어지고 후보 사이에서 떠오른다(lift)", () => {
  const stops: FlyStop[] = data.weak.slice(0, 3).map((w, k) => ({ rank: k + 1, label: w.name, lnglat: [segMid(w.path)[1], segMid(w.path)[0]] }))
  const wps = flyWaypoints(stops, { center: [127.085, 37.546], zoom: 13.2 })
  assert.strictEqual(wps.length, stops.length + 2)
  assert.ok(!wps[0].target && !wps[wps.length - 1].target && wps[1].target?.rank === 1)
  for (let i = 0; i < wps.length - 1; i++) {
    const ms = flySegmentMs(wps[i], wps[i + 1])
    assert.ok(ms >= 5000 && ms <= 11000, `구간 ${i} ${ms}ms`)
  }
  const at0 = flyCameraAt(wps, 1, 0)
  const at1 = flyCameraAt(wps, 1, 1)
  assert.ok(Math.abs(at0.center[0] - wps[1].center[0]) < 1e-9 && Math.abs(at1.center[0] - wps[2].center[0]) < 1e-9)
  assert.ok(flyCameraAt(wps, 1, 0.5).zoom < wps[1].zoom - 0.5, "후보 사이 중간에서 줌이 0.7 떠오른다")
  const route = flyRouteFC(stops)
  assert.strictEqual(route.points.features.length, 3)
  assert.strictEqual((route.path.features[0].geometry as GeoJSON.LineString).coordinates.length, 3)
  assert.strictEqual(flyRouteFC([stops[0]]).path.features.length, 0, "지점 하나면 경로 선 없음")
})

test("자재 글자 배지(matLabelFC): 제·염·모 글리프, 자재 수만큼", () => {
  const fcM = matLabelFC(saltFC(data))
  assert.strictEqual(fcM.features.length, data.salt.length)
  assert.ok(fcM.features.every((f) => f.properties!.glyph === MAT_GLYPH.salt && f.properties!.kind === "salt"))
  assert.deepStrictEqual(Object.values(MAT_GLYPH), ["제", "염", "모"])
})

test("동별 기둥(dongColsFC)·결빙 라벨·경사면·제설차 노선 조립", () => {
  const cols = dongColsFC(data, "materials", true, "#7cc0e8")
  assert.strictEqual(cols.features.length, data.dongs.length)
  for (const f of cols.features) {
    const h = f.properties!.h as number
    assert.ok(h >= 40 && h <= 40 + COL_MAX_M, `${f.properties!.name} 높이 ${h}`) // 바닥 40m + 최댓값 비례
    assert.match(String(f.properties!.label), /\n/)
  }
  const ice = iceLabelFC(data)
  assert.ok(ice.features.length > 0 && ice.features.length <= data.ice.length)
  for (const f of ice.features) assert.match(String(f.properties!.text), /^결빙 \d/)
  const ramps = slopeRamps(data)
  assert.strictEqual(ramps.length, data.slopes.length)
  for (const r of ramps) assert.strictEqual(r.coords.length, r.hs.length)
  const trucks = truckRoutes(data)
  assert.ok(trucks.length > 0 && trucks.length <= data.ice.length)
  for (const t of trucks) assert.ok(t.coords.length >= 2 && t.meters > 0)
})

test("툴팁(tip)은 HTML을 이스케이프하고, 구 경계 판정(insideRing)은 광진구청 안·강남 밖", () => {
  const html = tip("제설함", '<b>"x"</b> & y', [["주소", "<i>"]], "각주")
  assert.ok(!html.includes('<b>"x"</b>') && html.includes("&lt;b&gt;&quot;x&quot;&lt;/b&gt; &amp; y") && html.includes("&lt;i&gt;"), html)
  assert.match(html, /^<div class="snow-tip">/)
  assert.ok(insideRing(data.ring, [37.5384, 127.0822]), "광진구청")
  assert.ok(!insideRing(data.ring, [37.5172, 127.0473]), "강남구청")
})
