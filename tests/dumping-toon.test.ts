import { test } from "node:test"
import assert from "node:assert"
import { readFileSync } from "node:fs"
import { BuildingUse, decadeOf, decodeBuildings, decodeGround, decodeTrees, groundAt, isBrick, lngLatToLocal, localToLngLat, TOON_ANCHOR, useOf, type ToonBuildings } from "../lib/dumping/toon-world"
import { buildChunk, chunkIds, gableChance, insetRing, Part, ringOf, roofPlan, signedArea } from "../components/dumping/toon-geom"
import { DATA_COLOR, DATA_MUTED, DATA_NONE, hash01, materialOf, toonColors, toonMaterials, TOON_NEUTRAL } from "../components/dumping/toon-palette"
import { BASE_DEF, colorOf, greyRamp, stepExpr } from "../components/dumping/map-geo"
import { LANDMARK_TIER_ZOOM, LANDMARKS } from "../lib/dumping/landmarks"
import type { GridCell } from "../lib/dumping/types"

// 23라운드 모형 보기 → 24라운드 실사. 정적 자료(scripts/dumping-toon-world.py)의 형식·범위·대장 대조 신축, 지붕·면 방향·법선, 데이터 색이 지도 압출 식과 같은지를 핀으로 박는다

const read = (f: string) => {
  const b = readFileSync(new URL(`../public/dumping/basemap/${f}`, import.meta.url))
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)
}
const BLD = decodeBuildings(read("toon-buildings.bin"))

test("모형 건물 자료(TNB2): 통합정보 + 대장 대조 신축 27,098동, 원점 ±3.5km 안, 지면은 한강~아차산, 유형 바이트가 있다", () => {
  const b = BLD
  assert.strictEqual(b.count, 27098)
  assert.strictEqual(b.start[b.count], b.xz.length / 2)
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity
  for (let k = 0; k < b.xz.length; k += 2) {
    minX = Math.min(minX, b.xz[k])
    maxX = Math.max(maxX, b.xz[k])
    minZ = Math.min(minZ, b.xz[k + 1])
    maxZ = Math.max(maxZ, b.xz[k + 1])
  }
  assert.ok(minX > -3500 && maxX < 3500 && minZ > -3500 && maxZ < 3500, `${minX} ${maxX} ${minZ} ${maxZ}`)
  const uses = new Array(16).fill(0)
  for (let i = 0; i < b.count; i++) {
    assert.ok(b.start[i + 1] - b.start[i] >= 3, `동 ${i} 꼭짓점 부족`)
    // 최저 지면은 꼭짓점 표본(최대 8곳), 가운데 지면은 꼭짓점 평균 자리라 오목한 땅에선 가운데가 더 낮기도 하다
    assert.ok(b.groundMin[i] > -5 && b.groundMid[i] > -5 && b.groundMin[i] < 400 && b.groundMid[i] < 400, `동 ${i} 지면 ${b.groundMin[i]} ${b.groundMid[i]}`)
    uses[useOf(b.style[i])]++
  }
  // 광진은 단독·다가구가 대부분, 아파트 1천여 동, 벽돌조가 많다
  assert.ok(uses[BuildingUse.house] > 7000 && uses[BuildingUse.villa] > 8000 && uses[BuildingUse.apartment] > 900, uses.join(","))
  assert.ok(uses.slice(9).every((v) => v === 0), "유형 번호는 0~8")
  let brick = 0
  for (let i = 0; i < b.count; i++) if (isBrick(b.style[i])) brick++
  assert.ok(brick > 8000, `벽돌조 ${brick}`)
})

test("로딩 커튼 건물 수(NSDI_BUILDING_COUNT)가 모형 자료 동 수와 같다", async () => {
  const { NSDI_BUILDING_COUNT } = await import("../lib/dumping/basemap-style")
  assert.strictEqual(NSDI_BUILDING_COUNT, BLD.count)
})

test("광진구청 신청사(자양동 870, 18층 82.3m)와 이스트폴 48층이 모형에 있고, 철거된 옛 동부지방법원 자리엔 낮은 건물이 남지 않는다", () => {
  const gu = LANDMARKS.find((l) => l.name === "광진구청")!
  const [gx, gz] = lngLatToLocal(gu.lng, gu.lat)
  const near = (r: number) => {
    const out: number[] = []
    for (let i = 0; i < BLD.count; i++) {
      const k = BLD.start[i]
      if (Math.hypot(BLD.xz[k * 2] - gx, BLD.xz[k * 2 + 1] - gz) < r) out.push(i)
    }
    return out
  }
  const hall = near(60).filter((i) => Math.abs(BLD.height[i] - 82.3) < 1)
  assert.strictEqual(hall.length, 1, "구청 82.3m 한 동")
  assert.strictEqual(useOf(BLD.style[hall[0]]), BuildingUse.civic)
  assert.strictEqual(BLD.floors[hall[0]], 18)
  assert.strictEqual(decadeOf(BLD.style[hall[0]]), 6, "2020년대 사용승인")
  assert.ok(near(260).filter((i) => Math.abs(BLD.height[i] - 146.4) < 0.5).length >= 3, "48층 아파트")
  // 옛 동부지방법원·검찰청·구치감(1970~2000년대 2~4층, 구청 서쪽·북쪽 50~80m)이 빠졌다: 구청 80m 안에 2020년대 이전의 10m 미만 건물이 없다
  // (남는 낮은 동은 같은 필지의 2025년 저층부·보건소 동뿐)
  assert.deepStrictEqual(near(80).filter((i) => BLD.height[i] > 0 && BLD.height[i] < 10 && decadeOf(BLD.style[i]) < 6), [])
})

test("모형 나무·지면 자료: 나무는 숲·공원 자리 4만여 그루, 지면 격자는 원점에서 DEM 고도(10~60m)", () => {
  const t = decodeTrees(read("toon-trees.bin"))
  assert.ok(t.count > 30000 && t.count < 60000, `${t.count}`)
  for (let i = 0; i < t.count; i += 97) {
    assert.ok(Math.abs(t.x[i]) < 4000 && Math.abs(t.z[i]) < 4000)
    assert.ok(t.form[i] <= 2 && t.size[i] >= 0 && t.size[i] <= 1)
  }
  const g = decodeGround(read("toon-ground.bin"))
  const h = groundAt(g, 0, 0)
  assert.ok(h > 10 && h < 60, `원점 지면 ${h}`)
  // 쌍선형: 격자점 사이 값은 이웃 네 점 사이에 있다
  const x = g.x0 + g.cell * 10.5
  const z = g.z0 + g.cell * 7.25
  const corners = [g.h[7 * g.nx + 10], g.h[7 * g.nx + 11], g.h[8 * g.nx + 10], g.h[8 * g.nx + 11]]
  const v = groundAt(g, x, z)
  assert.ok(v >= Math.min(...corners) - 1e-6 && v <= Math.max(...corners) + 1e-6)
})

test("로컬 미터 ↔ 경위도: 원점은 ANCHOR, 동쪽 1km는 경도로 약 0.01134도(지도 평균 반지름 6,371,008.8m 기준), 왕복이 제자리", () => {
  const [lng0, lat0] = localToLngLat(0, 0)
  assert.ok(Math.abs(lng0 - TOON_ANCHOR[0]) < 1e-9 && Math.abs(lat0 - TOON_ANCHOR[1]) < 1e-9)
  const [lng1, lat1] = localToLngLat(1000, 0)
  const mPerDeg = (2 * Math.PI * 6371008.8) / 360
  assert.ok(Math.abs(lng1 - lng0 - 1000 / (mPerDeg * Math.cos((TOON_ANCHOR[1] * Math.PI) / 180))) < 1e-9, `${lng1 - lng0}`)
  assert.ok(Math.abs(lat1 - lat0) < 1e-9)
  // 남쪽(+z)으로 가면 위도가 준다
  assert.ok(localToLngLat(0, 1000)[1] < lat0)
  for (const [x, z] of [[1234.5, -987.6], [-3000, 2500]]) {
    const [bx, bz] = lngLatToLocal(...localToLngLat(x, z))
    assert.ok(Math.abs(bx - x) < 1e-4 && Math.abs(bz - z) < 1e-4, `${bx} ${bz}`)
  }
})

// 손으로 만든 동 하나(층수·높이·유형 지정)
function one(ring: [number, number][], floors: number, style = 0, height = 0): ToonBuildings {
  const xz = new Float32Array(ring.flat())
  return { count: 1, start: Uint32Array.from([0, ring.length]), xz, floors: Uint8Array.from([floors]), style: Uint8Array.from([style]), height: Float32Array.from([height]), groundMin: Float32Array.from([20]), groundMid: Float32Array.from([20]) }
}
const SQUARE: [number, number][] = [[0, 0], [10, 0], [10, 8], [0, 8]]
const HOUSE_70S = BuildingUse.house | (1 << 4)
const VILLA_90S = BuildingUse.villa | (3 << 4) | 128

test("지붕: 박공은 1~2층 직사각 단독 중 연대가 오랠수록 많고(gableChance), 아파트·ㄱ자·3층 이상은 평지붕", () => {
  assert.strictEqual(gableChance(HOUSE_70S), 0.75)
  assert.ok(gableChance(BuildingUse.house | (5 << 4)) < gableChance(BuildingUse.house | (3 << 4)))
  assert.strictEqual(gableChance(BuildingUse.apartment | (2 << 4)), 0)
  const house = one(SQUARE, 2, HOUSE_70S)
  assert.strictEqual(roofPlan(house, 0, ringOf(house, 0)).gable, hash01(0, 31) < 0.75)
  const villa = one(SQUARE, 5, VILLA_90S)
  assert.strictEqual(roofPlan(villa, 0, ringOf(villa, 0)).gable, false)
  const ell = one([[0, 0], [10, 0], [10, 4], [4, 4], [4, 8], [0, 8]], 1, HOUSE_70S)
  assert.strictEqual(roofPlan(ell, 0, ringOf(ell, 0)).gable, false, "ㄱ자(외접 사각형의 82% 미만)는 평지붕")
})

test("난간 고리: 안으로 d 만큼 줄인 고리는 원래 안에 들고 넓이가 줄며, 너무 얇은 꼴은 null", () => {
  const inner = insetRing(SQUARE, 0.5)!
  assert.ok(inner && Math.abs(signedArea(inner) - 9 * 7) < 1e-6, `${inner && signedArea(inner)}`)
  assert.strictEqual(insetRing([[0, 0], [10, 0], [10, 0.8], [0, 0.8]], 0.5), null)
})

test("기하: 모든 삼각형 앞면이 꼭짓점 법선 쪽, 벽 법선은 바깥·지붕은 위, 벽 aW 는 변 따라 0~변 길이, 평지붕엔 난간 띠", () => {
  for (const [b, label] of [[one(SQUARE, 2, HOUSE_70S), "단독"], [one(SQUARE, 5, VILLA_90S), "빌라"], [one([[0, 0], [10, 0], [10, 4], [4, 4], [4, 8], [0, 8]], 3, VILLA_90S), "ㄱ자"], [one([[0, 0], [40, 0], [40, 14], [0, 14]], 15, BuildingUse.apartment | (4 << 4)), "아파트"]] as const) {
    const c = buildChunk(b, [0], 1.4)
    const P = c.position
    const N = c.normal
    const ground = 20 * 1.4
    let minY = Infinity
    for (let k = 1; k < P.length; k += 3) minY = Math.min(minY, P[k])
    assert.ok(minY < ground - 1, `${label}: 바닥 ${minY}`)
    const parts = new Set<number>()
    for (let v = 0; v < c.info.length / 2; v++) {
      const part = c.info[v * 2 + 1]
      parts.add(part)
      const n = [N[v * 3] / 127, N[v * 3 + 1] / 127, N[v * 3 + 2] / 127]
      assert.ok(Math.abs(Math.hypot(...n) - 1) < 0.02, `${label}: 법선 길이`)
      if (part === Part.wall) {
        assert.ok(c.wall[v * 2] >= -1e-6 && c.wall[v * 2] <= c.wall[v * 2 + 1] + 1e-6, `${label}: aW`)
        assert.ok(Math.abs(n[1]) < 1e-6, `${label}: 벽 법선은 수평`)
      }
      if (part === Part.roof || part === Part.parapet) assert.ok(n[1] > 0.99, `${label}: 지붕 법선은 위`)
    }
    for (let t = 0; t < c.index.length; t += 3) {
      const [a, d, e] = [c.index[t], c.index[t + 1], c.index[t + 2]]
      const ux = P[d * 3] - P[a * 3], uy = P[d * 3 + 1] - P[a * 3 + 1], uz = P[d * 3 + 2] - P[a * 3 + 2]
      const vx = P[e * 3] - P[a * 3], vy = P[e * 3 + 1] - P[a * 3 + 1], vz = P[e * 3 + 2] - P[a * 3 + 2]
      const n = [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx]
      if (Math.hypot(...n) < 1e-6) continue
      const vn = [N[a * 3], N[a * 3 + 1], N[a * 3 + 2]]
      assert.ok(n[0] * vn[0] + n[1] * vn[1] + n[2] * vn[2] > 0, `${label}: 앞면이 법선 반대`)
      if (c.info[a * 2 + 1] === Part.wall && label !== "ㄱ자") {
        // 벽 바깥: 면 중심에서 동 가운데 반대쪽(ㄱ자 안쪽 모서리는 가운데 기준이 흐려 뺀다)
        const mx = (P[a * 3] + P[d * 3] + P[e * 3]) / 3
        const mz = (P[a * 3 + 2] + P[d * 3 + 2] + P[e * 3 + 2]) / 3
        const [cx, cz] = label === "아파트" ? [20, 7] : [5, 4]
        assert.ok(vn[0] * (mx - cx) + vn[2] * (mz - cz) > 0, `${label}: 안을 보는 벽`)
      }
    }
    if (label !== "단독" || !roofPlan(b, 0, ringOf(b, 0)).gable) assert.ok(parts.has(Part.parapet), `${label}: 난간 띠`)
  }
})

test("덩어리 나누기: 모든 동이 정확히 한 덩어리에 들고, 부호 넓이는 양수로 맞춰진다", () => {
  const seen = new Uint8Array(BLD.count)
  for (const ids of chunkIds(BLD).values()) for (const i of ids) seen[i]++
  assert.ok(seen.every((v) => v === 1))
  for (let i = 0; i < BLD.count; i += 211) assert.ok(signedArea(ringOf(BLD, i)) > 0)
})

// maplibre step 식을 값 하나로 계산(지도 압출 건물 색과 모형 건물 색이 같은 경계를 쓰는지 비교용)
function evalStep(expr: unknown[], v: number): string {
  let out = expr[2] as string
  for (let i = 3; i < expr.length; i += 2) if (v >= (expr[i] as number)) out = expr[i + 1] as string
  return out
}

const cell = (vals: Partial<Record<4 | 5 | 6 | 8, number>>, dong = "화양동"): GridCell => {
  const c = [37.54, 127.07, 37.541, 127.071, 0, 0, 0, dong, 0] as unknown as GridCell
  for (const [k, v] of Object.entries(vals)) (c as unknown as number[])[Number(k)] = v
  return c
}
const hex = (buf: Uint8Array, o: number) => `#${[0, 1, 2].map((k) => buf[o + k].toString(16).padStart(2, "0")).join("")}`
const STRIDE = 16

test("데이터 색: 바탕 램프·경계가 지도 압출 step 식과 같고(알파 255), 값 0·칸 밖·다른 동·동별 기둥은 흐린 재질(128), 바탕 없음은 재질 그대로(0)", () => {
  const vals = [0, 1, 2, 3, 7, 8, 9, 30, 61, 150, 151, 900]
  const grid = vals.map((v) => cell({ 6: v, 5: v }))
  const cellOf = Int32Array.from([...grid.map((_, i) => i), -1])
  for (const base of ["unm", "enf"] as const) {
    const def = BASE_DEF[base]
    const out = toonColors({ theme: "light", base, grid, cellOf, selectedDong: null, dongBars: false, candidates: false, pointsOn: false })
    const prop = { 4: "comp", 5: "enf", 6: "unm", 8: "lp" }[def.idx]
    const expr = stepExpr(prop, def.stops, def.pal)
    vals.forEach((v, i) => {
      if (v > 0) {
        assert.strictEqual(hex(out, i * STRIDE), evalStep(expr, v), `${base} ${v}`)
        assert.strictEqual(hex(out, i * STRIDE), colorOf(v, def.stops, def.pal))
        assert.strictEqual(out[i * STRIDE + 3], DATA_COLOR)
      } else assert.strictEqual(out[i * STRIDE + 3], DATA_MUTED, `${base} 0은 흐린 재질`)
    })
    assert.strictEqual(out[vals.length * STRIDE + 3], DATA_MUTED, "칸 밖")
  }
  const sel = toonColors({ theme: "light", base: "unm", grid: [cell({ 6: 300 }, "화양동"), cell({ 6: 300 }, "군자동")], cellOf: Int32Array.from([0, 1]), selectedDong: "군자동", dongBars: false, candidates: false, pointsOn: false })
  assert.strictEqual(sel[3], DATA_MUTED, "다른 동은 흐림")
  assert.strictEqual(hex(sel, STRIDE), colorOf(300, BASE_DEF.unm.stops, BASE_DEF.unm.pal))
  const bars = toonColors({ theme: "dark", base: "unm", grid: [cell({ 6: 300 })], cellOf: Int32Array.from([0]), selectedDong: null, dongBars: true, candidates: false, pointsOn: false })
  assert.strictEqual(bars[3], DATA_MUTED, "동별 기둥이면 건물은 흐린 재질")
  const grey = toonColors({ theme: "light", base: "enf", grid: [cell({ 5: 9 })], cellOf: Int32Array.from([0]), selectedDong: null, dongBars: false, candidates: true, pointsOn: false })
  assert.strictEqual(hex(grey, 0), colorOf(9, BASE_DEF.enf.stops, greyRamp("light", 6)), "후보 표시 중은 회색 단계")
  const none = toonColors({ theme: "light", base: "none", grid: [], cellOf: new Int32Array(3).fill(-1), selectedDong: null, dongBars: false, candidates: false, pointsOn: false })
  assert.deepStrictEqual([none[3], none[STRIDE + 3], none[2 * STRIDE + 3]], [DATA_NONE, DATA_NONE, DATA_NONE])
  const noneCand = toonColors({ theme: "light", base: "none", grid: [], cellOf: new Int32Array(1).fill(-1), selectedDong: null, dongBars: false, candidates: true, pointsOn: false })
  assert.strictEqual(noneCand[3], DATA_MUTED, "바탕 없음 + 후보 표시는 흐린 재질")
  assert.strictEqual(hex(noneCand, 0), TOON_NEUTRAL.light.wall)
})

test("재질: 유형 바이트·층수를 알파에 싣고, 박공이면 기와 지붕, 같은 동은 늘 같은 재질, 벽돌조 단독은 대부분 벽돌색", () => {
  const n = 400
  const style = new Uint8Array(n).fill(HOUSE_70S | 128)
  const floors = new Uint8Array(n).fill(2)
  const gable = new Uint8Array(n).map((_, i) => i % 2)
  const out = new Uint8Array(n * STRIDE)
  toonMaterials(n, style, floors, gable, "light", out)
  assert.strictEqual(out[8 + 3], HOUSE_70S | 128)
  assert.strictEqual(out[12 + 3], 2)
  const again = new Uint8Array(n * STRIDE)
  toonMaterials(n, style, floors, gable, "light", again)
  assert.deepStrictEqual(out, again)
  const tile = new Set(["#5a6068", "#4f6273", "#5f7766", "#8a4f3e", "#a35f43", "#6b5a52"])
  for (let i = 1; i < n; i += 2) assert.ok(tile.has(hex(out, i * STRIDE + 12)), `박공 지붕 ${hex(out, i * STRIDE + 12)}`)
  // 벽돌색은 R이 G·B보다 뚜렷이 크다
  let brick = 0
  for (let i = 0; i < n; i++) {
    const [r, g, b] = [out[i * STRIDE + 8], out[i * STRIDE + 9], out[i * STRIDE + 10]]
    if (r - g > 20 && r - b > 30) brick++
  }
  assert.ok(brick / n > 0.65, `벽돌 ${brick}/${n}`)
  // 아파트는 흰 외벽(밝다), 업무 2010년대는 유리(푸른 회색)
  const apt = materialOf(3, BuildingUse.apartment | (4 << 4), 20, false).wall
  assert.ok(parseInt(apt.slice(1, 3), 16) > 0xd0, apt)
  const glass = materialOf(7, BuildingUse.office | (5 << 4), 20, false).wall
  assert.ok(parseInt(glass.slice(5, 7), 16) > parseInt(glass.slice(1, 3), 16), `유리 ${glass}`)
})

test("빛기둥: 지도 기둥 GeoJSON 그대로 받아 거르기(동)·솟기를 따른다", async () => {
  const { ToonBeams } = await import("../components/dumping/toon-beams")
  const beams = new ToonBeams()
  const disc = (lng: number, lat: number, r: number, dong: string) => {
    const ring: [number, number][] = []
    for (let k = 0; k <= 20; k++) {
      const a = (k / 20) * Math.PI * 2
      ring.push([lng + (Math.cos(a) * r) / 88000, lat + (Math.sin(a) * r) / 111320])
    }
    return { type: "Feature" as const, properties: { h: 120, color: "#c0741a", dong }, geometry: { type: "Polygon" as const, coordinates: [ring] } }
  }
  const fc = { type: "FeatureCollection" as const, features: [disc(127.08, 37.54, 30, "화양동"), disc(127.09, 37.54, 20, "군자동")] }
  beams.setData("cols", fc)
  const verts = () => beams.group.children.reduce((s, m) => s + ((m as unknown as { geometry: { getAttribute: (k: string) => { count: number } } }).geometry.getAttribute("position").count), 0) / 2
  const all = verts()
  assert.ok(all > 0 && beams.group.children.length === 2, "앞뒤 두 장")
  beams.setFilter("cols", "군자동")
  assert.strictEqual(verts(), all / 2, "한 동만")
  beams.setFilter("cols", "\u0000")
  assert.strictEqual(beams.group.children.length, 0, "전부 숨김")
  beams.setFilter("cols", null)
  beams.rise("cols", 10)
  const { Vector3 } = await import("three")
  const start = performance.now()
  while (performance.now() - start < 20) {
    // 10ms 솟기가 끝나길 기다린다
  }
  assert.strictEqual(beams.frame(new Vector3()), false, "솟기 끝")
  beams.dispose()
})

// 23라운드 지도 날씨. 실황 WMO 코드 → 맑음·흐림·비·눈·안개(비·눈·안개 판정은 /snow weatherFx와 같다), 손으로 고르면 그 날씨
test("지도 날씨: 실황 코드는 맑음(0~2)·흐림(3)·안개(45·48)·비(51~67·80~82·95+)·눈(71~77·85·86)으로, 예보가 없으면 맑음", async () => {
  const { weatherOfCode, skyOf, weatherLook, mapSkyFor, precipOf, NO_SKY } = await import("../lib/dumping/map-weather")
  const kinds = [0, 1, 2, 3, 45, 48, 51, 61, 65, 80, 95, 71, 75, 85, 68].map((c) => weatherOfCode(c).kind)
  assert.deepStrictEqual(kinds, ["clear", "clear", "clear", "cloudy", "fog", "fog", "rain", "rain", "rain", "rain", "rain", "snow", "snow", "snow", "snow"])
  assert.strictEqual(weatherOfCode(null).kind, "clear")
  assert.ok(weatherOfCode(2).level > weatherOfCode(0).level, "구름 조금은 맑음보다 구름이 많다")
  assert.deepStrictEqual(skyOf("snow", 0).kind, "snow")
  assert.deepStrictEqual(skyOf("live", 3), weatherOfCode(3))
  // 맑음은 지금 지도 그대로(하늘 없음), 눈은 지붕·땅 눈 덮임, 비는 젖은 땅, 안개는 구름 없음, 맑은 날에도 구름이 몇 개 떠다닌다
  assert.deepStrictEqual(mapSkyFor({ kind: "clear", level: 0.3 }, false), NO_SKY)
  for (const dark of [false, true]) {
    assert.ok(weatherLook({ kind: "snow", level: 0.7 }, dark).snow > 0.5)
    assert.ok(weatherLook({ kind: "rain", level: 0.6 }, dark).wet > 0)
    assert.strictEqual(weatherLook({ kind: "fog", level: 0.6 }, dark).clouds, 0)
    assert.ok(weatherLook({ kind: "clear", level: 0.25 }, dark).clouds >= 5)
    assert.ok(weatherLook({ kind: "cloudy", level: 1 }, dark).shadow < weatherLook({ kind: "clear", level: 0.3 }, dark).shadow)
  }
  assert.strictEqual(precipOf({ kind: "clear", level: 1 }).kind, null)
  assert.ok(precipOf({ kind: "rain", level: 1 }).count > precipOf({ kind: "rain", level: 0 }).count)
})

test("랜드마크: 이름이 겹치지 않고 전부 구 근처(원점 ±4km), 광진구청이 가장 먼저 산다", () => {
  assert.strictEqual(new Set(LANDMARKS.map((l) => l.name)).size, LANDMARKS.length)
  for (const l of LANDMARKS) {
    const [x, z] = lngLatToLocal(l.lng, l.lat)
    assert.ok(Math.abs(x) < 4000 && Math.abs(z) < 4000, l.name)
  }
  const top = [...LANDMARKS].sort((a, b) => a.rank - b.rank)[0]
  assert.strictEqual(top.name, "광진구청")
  assert.deepStrictEqual(LANDMARKS.filter((l) => l.tier === 0).map((l) => l.name), ["광진구청"], "구 전체 보기에서는 구청만")
  // 등급 문턱은 레이어 minzoom(소수 가능)으로 준다. 오름차순
  assert.ok(LANDMARK_TIER_ZOOM.every((z, k) => k === 0 || z > LANDMARK_TIER_ZOOM[k - 1]))
})

test("바탕 네 조합(라이트·다크 × 도면·모형)은 레이어 구성·배치·필터·소스가 같고 칠하기·보이기만 다르다(setStyle 대신 제자리 다시 칠하기의 전제)", async () => {
  const { buildBasemapStyle } = await import("../lib/dumping/basemap-style")
  const ring: [number, number][] = [[37.53, 127.06], [37.56, 127.06], [37.56, 127.11], [37.53, 127.11]]
  const styles = (["light", "dark"] as const).flatMap((t) => (["paper", "model"] as const).map((l) => buildBasemapStyle(ring, t, l)))
  const shape = (s: (typeof styles)[number]) =>
    JSON.stringify({
      sources: s.sources,
      glyphs: s.glyphs,
      layers: s.layers.map((l) => {
        const { paint: _p, layout, ...rest } = l as typeof l & { paint?: unknown; layout?: Record<string, unknown> }
        const { visibility: _v, ...lay } = layout ?? {}
        return { ...rest, layout: lay }
      }),
    })
  const first = shape(styles[0])
  for (const s of styles) assert.strictEqual(shape(s), first)
  // 모형은 골목길 이름만 숨김
  const vis = (s: (typeof styles)[number]) => (s.layers.find((l) => l.id === "roads_labels_minor") as { layout?: { visibility?: string } }).layout?.visibility
  assert.deepStrictEqual(styles.map(vis), ["visible", "none", "visible", "none"])
})
