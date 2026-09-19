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
  gridColumnsFC,
  hotspotsFC,
  radiusMetersExpr,
  ringFC,
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

test("기본 보기는 입체, 자동 회전은 꺼짐", () => {
  assert.equal(DEFAULT_VIEW.tilt, true)
  assert.equal(DEFAULT_VIEW.orbit, false)
})
