import { test } from "node:test"
import assert from "node:assert"
import { readFileSync } from "node:fs"
import { decodeBuildings, decodeGround, decodeTrees, groundAt, localToLngLat, TOON_ANCHOR, type ToonBuildings } from "../lib/dumping/toon-world"
import { buildChunk, chunkIds, ringOf, roofPlan, signedArea } from "../components/dumping/toon-geom"
import { floorClass, toonColors, TOON_NEUTRAL, TOON_REAL } from "../components/dumping/toon-palette"
import { BASE_DEF, colorOf, greyRamp, stepExpr } from "../components/dumping/map-geo"
import type { GridCell } from "../lib/dumping/types"

// 23라운드 모형 보기. 정적 자료(scripts/dumping-toon-world.py)의 형식·범위, 지붕 판정·면 방향, 데이터 색이 지도 압출 식과 같은지를 핀으로 박는다

const read = (f: string) => {
  const b = readFileSync(new URL(`../public/dumping/basemap/${f}`, import.meta.url))
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)
}

test("모형 건물 자료: 광진 GIS건물통합정보 27,221동이 원점 기준 ±3.5km 안, 지면 고도는 한강~아차산 범위", () => {
  const b = decodeBuildings(read("toon-buildings.bin"))
  assert.strictEqual(b.count, 27221)
  assert.strictEqual(b.start[b.count], b.xz.length / 2)
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity
  for (let k = 0; k < b.xz.length; k += 2) {
    minX = Math.min(minX, b.xz[k])
    maxX = Math.max(maxX, b.xz[k])
    minZ = Math.min(minZ, b.xz[k + 1])
    maxZ = Math.max(maxZ, b.xz[k + 1])
  }
  assert.ok(minX > -3500 && maxX < 3500 && minZ > -3500 && maxZ < 3500, `${minX} ${maxX} ${minZ} ${maxZ}`)
  for (let i = 0; i < b.count; i++) {
    assert.ok(b.start[i + 1] - b.start[i] >= 3, `동 ${i} 꼭짓점 부족`)
    // 최저 지면은 꼭짓점 표본(최대 8곳), 가운데 지면은 꼭짓점 평균 자리라 오목한 땅에선 가운데가 더 낮기도 하다
    assert.ok(b.groundMin[i] > -5 && b.groundMid[i] > -5 && b.groundMin[i] < 400 && b.groundMid[i] < 400, `동 ${i} 지면 ${b.groundMin[i]} ${b.groundMid[i]}`)
  }
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

test("로컬 미터 ↔ 경위도: 원점은 ANCHOR, 동쪽 1km는 경도로 약 0.01134도(지도 평균 반지름 6,371,008.8m 기준)", () => {
  const [lng0, lat0] = localToLngLat(0, 0)
  assert.ok(Math.abs(lng0 - TOON_ANCHOR[0]) < 1e-9 && Math.abs(lat0 - TOON_ANCHOR[1]) < 1e-9)
  const [lng1, lat1] = localToLngLat(1000, 0)
  const mPerDeg = (2 * Math.PI * 6371008.8) / 360
  assert.ok(Math.abs(lng1 - lng0 - 1000 / (mPerDeg * Math.cos((TOON_ANCHOR[1] * Math.PI) / 180))) < 1e-9, `${lng1 - lng0}`)
  assert.ok(Math.abs(lat1 - lat0) < 1e-9)
  // 남쪽(+z)으로 가면 위도가 준다
  assert.ok(localToLngLat(0, 1000)[1] < lat0)
})

// 손으로 만든 동 하나(정사각 10×8m, 층수·높이 지정)
function one(ring: [number, number][], floors: number, height = 0): ToonBuildings {
  const xz = new Float32Array(ring.flat())
  return { count: 1, start: Uint32Array.from([0, ring.length]), xz, floors: Uint8Array.from([floors]), height: Float32Array.from([height]), groundMin: Float32Array.from([20]), groundMid: Float32Array.from([20]) }
}
const SQUARE: [number, number][] = [[0, 0], [10, 0], [10, 8], [0, 8]]

test("지붕: 1~2층 직사각 집은 박공(창 종류 0), 5층은 평지붕+옥탑, 2층 넓은 건물은 창 없는 저층(3)", () => {
  const house = one(SQUARE, 2)
  assert.strictEqual(roofPlan(house, 0, ringOf(house, 0)).gable, true)
  assert.strictEqual(roofPlan(house, 0, ringOf(house, 0)).kind, 0)
  const villa = one(SQUARE, 5)
  const vp = roofPlan(villa, 0, ringOf(villa, 0))
  assert.strictEqual(vp.gable, false)
  assert.strictEqual(vp.kind, 1)
  const big = one([[0, 0], [40, 0], [40, 25], [0, 25]], 2)
  assert.strictEqual(roofPlan(big, 0, ringOf(big, 0)).kind, 3)
  // ㄱ자(외접 사각형의 82% 미만)는 1층이어도 평지붕
  const ell = one([[0, 0], [10, 0], [10, 4], [4, 4], [4, 8], [0, 8]], 1)
  assert.strictEqual(roofPlan(ell, 0, ringOf(ell, 0)).gable, false)
})

test("기하: 모든 삼각형 앞면이 바깥(벽은 동 가운데 반대쪽, 지붕은 위)을 본다 · 바닥은 지면 아래로 묻힌다", () => {
  for (const [b, label] of [[one(SQUARE, 2), "박공"], [one(SQUARE, 5), "평지붕"], [one([[0, 0], [10, 0], [10, 4], [4, 4], [4, 8], [0, 8]], 3), "ㄱ자"]] as const) {
    const c = buildChunk(b, [0], 1.4)
    const P = c.position
    const ground = 20 * 1.4
    let minY = Infinity
    for (let k = 1; k < P.length; k += 3) minY = Math.min(minY, P[k])
    assert.ok(minY < ground - 1, `${label}: 바닥 ${minY}`)
    for (let t = 0; t < c.index.length; t += 3) {
      const [a, d, e] = [c.index[t], c.index[t + 1], c.index[t + 2]]
      const ux = P[d * 3] - P[a * 3], uy = P[d * 3 + 1] - P[a * 3 + 1], uz = P[d * 3 + 2] - P[a * 3 + 2]
      const vx = P[e * 3] - P[a * 3], vy = P[e * 3 + 1] - P[a * 3 + 1], vz = P[e * 3 + 2] - P[a * 3 + 2]
      const n = [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx]
      const len = Math.hypot(...n)
      if (len < 1e-6) continue
      const mx = (P[a * 3] + P[d * 3] + P[e * 3]) / 3
      const mz = (P[a * 3 + 2] + P[d * 3 + 2] + P[e * 3 + 2]) / 3
      if (Math.abs(n[1] / len) > 0.5) assert.ok(n[1] > 0, `${label}: 아래를 보는 지붕면`)
      else {
        // 벽: 면 중심에서 동 가운데(5, 4) 쪽이 아니라 바깥을 본다(ㄱ자 안쪽 모서리는 가운데 기준이 흐려 옥탑·박공 끝만 빼고 본다)
        const out = n[0] * (mx - 5) + n[2] * (mz - 4)
        if (label !== "ㄱ자") assert.ok(out > -1e-6, `${label}: 안을 보는 벽 (${mx.toFixed(1)}, ${mz.toFixed(1)})`)
      }
    }
  }
})

test("덩어리 나누기: 모든 동이 정확히 한 덩어리에 들고, 부호 넓이는 양수로 맞춰진다", () => {
  const b = decodeBuildings(read("toon-buildings.bin"))
  const seen = new Uint8Array(b.count)
  for (const ids of chunkIds(b).values()) for (const i of ids) seen[i]++
  assert.ok(seen.every((v) => v === 1))
  for (let i = 0; i < b.count; i += 211) assert.ok(signedArea(ringOf(b, i)) > 0)
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

test("데이터 색: 바탕 램프·경계가 지도 압출 step 식과 같고, 값 0·칸 밖·다른 동·동별 기둥은 흰 모형(중립)", () => {
  const vals = [0, 1, 2, 3, 7, 8, 9, 30, 61, 150, 151, 900]
  const grid = vals.map((v) => cell({ 6: v, 5: v }))
  const cellOf = Int32Array.from([...grid.map((_, i) => i), -1])
  const floors = new Uint8Array(cellOf.length).fill(3)
  for (const base of ["unm", "enf"] as const) {
    const def = BASE_DEF[base]
    const out = toonColors({ theme: "light", base, grid, cellOf, floors, selectedDong: null, dongBars: false, candidates: false, pointsOn: false })
    const prop = { 4: "comp", 5: "enf", 6: "unm", 8: "lp" }[def.idx]
    const expr = stepExpr(prop, def.stops, def.pal)
    vals.forEach((v, i) => {
      const want = v > 0 ? evalStep(expr, v) : TOON_NEUTRAL.light.wall
      assert.strictEqual(hex(out, i * 8), want, `${base} ${v}`)
      if (v > 0) assert.strictEqual(hex(out, i * 8), colorOf(v, def.stops, def.pal))
    })
    assert.strictEqual(hex(out, vals.length * 8), TOON_NEUTRAL.light.wall, "칸 밖")
  }
  const sel = toonColors({ theme: "light", base: "unm", grid: [cell({ 6: 300 }, "화양동"), cell({ 6: 300 }, "군자동")], cellOf: Int32Array.from([0, 1]), floors: new Uint8Array(2), selectedDong: "군자동", dongBars: false, candidates: false, pointsOn: false })
  assert.strictEqual(hex(sel, 0), TOON_NEUTRAL.light.wall, "다른 동은 흐림")
  assert.strictEqual(hex(sel, 8), colorOf(300, BASE_DEF.unm.stops, BASE_DEF.unm.pal))
  const bars = toonColors({ theme: "dark", base: "unm", grid: [cell({ 6: 300 })], cellOf: Int32Array.from([0]), floors: new Uint8Array(1), selectedDong: null, dongBars: true, candidates: false, pointsOn: false })
  assert.strictEqual(hex(bars, 0), TOON_NEUTRAL.dark.wall, "동별 기둥이면 건물은 중립")
  const grey = toonColors({ theme: "light", base: "enf", grid: [cell({ 5: 9 })], cellOf: Int32Array.from([0]), floors: new Uint8Array(1), selectedDong: null, dongBars: false, candidates: true, pointsOn: false })
  assert.strictEqual(hex(grey, 0), colorOf(9, BASE_DEF.enf.stops, greyRamp("light", 6)), "후보 표시 중은 회색 단계")
})

test("바탕 없음: 층수 구간(1~2·3~4·5~9·10~19·20+)마다 모형 팔레트 안의 색, 같은 동은 늘 같은 색", () => {
  assert.deepStrictEqual([1, 2, 3, 4, 5, 9, 10, 19, 20, 58].map((f) => floorClass(f, 0)), [0, 0, 1, 1, 2, 2, 3, 3, 4, 4])
  const floors = Uint8Array.from([1, 4, 7, 15, 30])
  const p = { theme: "light" as const, base: "none" as const, grid: [], cellOf: new Int32Array(5).fill(-1), floors, selectedDong: null, dongBars: false, candidates: false, pointsOn: false }
  const a = toonColors(p)
  const b = toonColors(p)
  assert.deepStrictEqual(a, b)
  const allWalls = new Set(TOON_REAL.light.flatMap((c) => c.walls))
  const allRoofs = new Set(TOON_REAL.light.flatMap((c) => c.roofs))
  for (let i = 0; i < 5; i++) {
    assert.ok(allWalls.has(hex(a, i * 8)), `벽 ${hex(a, i * 8)}`)
    assert.ok(allRoofs.has(hex(a, i * 8 + 4)), `지붕 ${hex(a, i * 8 + 4)}`)
  }
  // 후보 표시 중(동 선택 없음)은 지도 압출처럼 중립
  const plain = toonColors({ ...p, candidates: true })
  assert.strictEqual(hex(plain, 0), TOON_NEUTRAL.light.wall)
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
  // 맑음은 지금 지도 그대로(하늘 없음), 눈은 지붕·땅 눈 덮임, 비는 젖은 땅, 안개는 구름 없음
  assert.deepStrictEqual(mapSkyFor({ kind: "clear", level: 0.3 }, false), NO_SKY)
  for (const dark of [false, true]) {
    assert.ok(weatherLook({ kind: "snow", level: 0.7 }, dark).snow > 0.5)
    assert.ok(weatherLook({ kind: "rain", level: 0.6 }, dark).wet > 0)
    assert.strictEqual(weatherLook({ kind: "fog", level: 0.6 }, dark).clouds, 0)
    assert.ok(weatherLook({ kind: "cloudy", level: 1 }, dark).shadow < weatherLook({ kind: "clear", level: 0.3 }, dark).shadow)
  }
  assert.strictEqual(precipOf({ kind: "clear", level: 1 }).kind, null)
  assert.ok(precipOf({ kind: "rain", level: 1 }).count > precipOf({ kind: "rain", level: 0 }).count)
})
