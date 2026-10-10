import { test } from "node:test"
import assert from "node:assert"
import { readFileSync } from "node:fs"
import { BuildingUse, crc32, decodeBuildings, decodeGround, decodeSat, decodeTraffic, groundAt, lngLatToLocal, SAT_PITCH_KNOWN, SAT_PITCHED, SAT_ROOF, TrafficClass, TrafficKind, type ToonBuildings } from "../lib/dumping/toon-world"
import { endWalls, minRect, Part, ringOf, roofPlan, ToonBuilder, addBuilding } from "../components/dumping/toon-geom"
import { fromPhoto, satOf, toonMaterials, TEXELS_PER_BUILDING } from "../components/dumping/toon-palette"

// 25라운드(2026-10-10): 지형 청소(일감호 솟음)·위성 지붕색·박공 판정·아파트 측벽 동 번호·도로 위 차·사람 경로를 핀으로 박는다

const read = (f: string) => {
  const b = readFileSync(new URL(`../public/dumping/basemap/${f}`, import.meta.url))
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)
}
const BLD_BUF = read("toon-buildings.bin")
const BLD = decodeBuildings(BLD_BUF)

function one(ring: [number, number][], floors: number, style: number, label = 0): ToonBuildings {
  return {
    count: 1, start: Uint32Array.from([0, ring.length]), xz: new Float32Array(ring.flat()), floors: Uint8Array.from([floors]), style: Uint8Array.from([style]),
    height: Float32Array.from([0]), groundMin: Float32Array.from([20]), groundMid: Float32Array.from([20]), label: Uint16Array.from([label]),
  }
}

test("지형: 일감호 수면은 평평하고 둘레 땅 높이 안쪽(SRTM 104m 봉우리를 지웠다). 지면 격자는 청소한 dem.pmtiles 에서", () => {
  const g = decodeGround(read("toon-ground.bin"))
  const hs = [[127.0762, 37.5408], [127.0752, 37.5397], [127.0768, 37.5414], [127.077, 37.5405]].map(([lng, lat]) => groundAt(g, ...lngLatToLocal(lng, lat)))
  assert.ok(Math.max(...hs) - Math.min(...hs) < 1.5, hs.join(","))
  assert.ok(Math.max(...hs) < 25, `수면 ${hs}`)
})

test("동 번호(TNB3): 숫자 동명이 있는 아파트 250동 넘게, 값은 1~9999", () => {
  assert.strictEqual(String.fromCharCode(...new Uint8Array(BLD_BUF, 0, 4)), "TNB3")
  let apt = 0
  for (let i = 0; i < BLD.count; i++) {
    assert.ok(BLD.label[i] <= 9999)
    if (BLD.label[i] > 0 && (BLD.style[i] & 15) === BuildingUse.apartment) apt++
  }
  assert.ok(apt > 250, `번호 붙은 아파트 ${apt}`)
})

test("측벽: 길쭉한 판상 아파트는 양 끝 짧은 벽 둘, 정사각 탑상형은 없음. 5층 이상 아파트만 Part.end 로 깐다", () => {
  const slab: [number, number][] = [[0, 0], [60, 0], [60, 12], [0, 12]]
  assert.deepStrictEqual([...endWalls(slab, minRect(slab))].sort(), [1, 3])
  const tower: [number, number][] = [[0, 0], [20, 0], [20, 18], [0, 18]]
  assert.strictEqual(endWalls(tower, minRect(tower)).size, 0)
  const parts = (floors: number, use: number) => {
    const b = one(slab, floors, use, 101)
    const B = new ToonBuilder()
    addBuilding(B, b, 0, 1)
    return new Set(B.I.filter((_, k) => k % 2 === 1))
  }
  assert.ok(parts(15, BuildingUse.apartment).has(Part.end))
  assert.ok(!parts(4, BuildingUse.apartment).has(Part.end), "4층은 측벽 없음")
  assert.ok(!parts(15, BuildingUse.office).has(Part.end), "업무시설은 측벽 없음")
})

test("위성 색(TNS1): 건물 자료와 짝(동 수·CRC32)이 맞고 지붕 95% 넘게, 박공 판정은 1~2층 직사각 꼴에만. 짝이 틀리면 버린다", () => {
  const sat = decodeSat(read("toon-sat.bin"), BLD_BUF, BLD.count)
  assert.ok(sat, "짝이 맞아야 한다")
  let roof = 0
  let pitched = 0
  for (let i = 0; i < BLD.count; i++) {
    const f = sat.flags[i]
    if (f & SAT_ROOF) roof++
    if (f & SAT_PITCH_KNOWN) {
      assert.ok(roofPlan(BLD, i, ringOf(BLD, i), 1).gable, `판정한 동 ${i} 은 박공 꼴`)
      if (f & SAT_PITCHED) pitched++
    }
  }
  assert.ok(roof / BLD.count > 0.95, `지붕 ${roof}/${BLD.count}`)
  assert.ok(pitched > 500 && pitched < 5000, `박공 ${pitched}`)
  const other = BLD_BUF.slice(0)
  new Uint8Array(other)[30] ^= 1
  assert.strictEqual(decodeSat(read("toon-sat.bin"), other, BLD.count), null, "건물 자료가 바뀌면 버린다")
  assert.notStrictEqual(crc32(other), crc32(BLD_BUF))
})

test("박공: 위성 판정이 있으면 해시 확률 대신 그 판정(1 박공 · 0 평지붕), 꼴이 안 되면 판정과 무관하게 평지붕", () => {
  const house = one([[0, 0], [10, 0], [10, 8], [0, 8]], 2, BuildingUse.house | (1 << 4))
  const ring = ringOf(house, 0)
  assert.strictEqual(roofPlan(house, 0, ring, 1).gable, true)
  assert.strictEqual(roofPlan(house, 0, ring, 0).gable, false)
  const tall = one([[0, 0], [10, 0], [10, 8], [0, 8]], 5, BuildingUse.villa)
  assert.strictEqual(roofPlan(tall, 0, ringOf(tall, 0), 1).gable, false)
})

test("사진 색 보정: 어두운 색은 밝히고 흰색은 그대로, 색상 순서(빨강 > 초록 > 파랑)는 지킨다. 위성 색이 있으면 재질 텍셀이 그 색", () => {
  const hex = (h: string) => [1, 3, 5].map((k) => parseInt(h.slice(k, k + 2), 16))
  const dark = hex(fromPhoto(60, 60, 60))
  assert.ok(dark[0] > 75, `${dark}`)
  assert.ok(hex(fromPhoto(250, 250, 250)).every((v) => v >= 248))
  const brick = hex(fromPhoto(140, 80, 60))
  assert.ok(brick[0] > brick[1] && brick[1] > brick[2], `${brick}`)
  const sat = { roof: Uint8Array.from([70, 110, 95]), wall: Uint8Array.from([0, 0, 0]), flags: Uint8Array.from([SAT_ROOF]) }
  const out = new Uint8Array(TEXELS_PER_BUILDING * 4)
  toonMaterials(1, Uint8Array.from([BuildingUse.villa]), Uint8Array.from([3]), Uint8Array.from([0]), "light", out, sat)
  const roofTexel = `#${[...out.slice(12, 15)].map((v) => v.toString(16).padStart(2, "0")).join("")}`
  assert.strictEqual(roofTexel, satOf(sat, 0).roof)
  assert.strictEqual(satOf(sat, 0).wall, undefined, "외벽 표시가 없으면 팔레트")
})

test("도로 경로(TNR2): 차로 500km 넘게·보행 줄·주차 줄이 있고 경로는 꼭짓점 둘 이상, 보행 붐빔은 1~6배", () => {
  const t = decodeTraffic(read("toon-traffic.bin"))
  const len = [0, 0, 0]
  for (let i = 0; i < t.count; i++) {
    assert.ok(t.n[i] >= 2 && t.kind[i] <= 2)
    let L = 0
    for (let k = t.first[i] + 1; k < t.first[i] + t.n[i]; k++) L += Math.hypot(t.xz[k * 2] - t.xz[k * 2 - 2], t.xz[k * 2 + 1] - t.xz[k * 2 - 1])
    len[t.kind[i]] += L
    if (t.kind[i] === TrafficKind.walk) assert.ok(t.boost[i] >= 1 && t.boost[i] <= 6, `붐빔 ${t.boost[i]}`)
  }
  assert.ok(len[TrafficKind.lane] > 500_000, `차로 ${len[0]}`)
  assert.ok(len[TrafficKind.walk] > 200_000 && len[TrafficKind.park] > 100_000, `${len}`)
  assert.strictEqual(t.first[t.count - 1] + t.n[t.count - 1], t.y.length)
})

// 26라운드(2026-10-10 사용자 "학교나 공원 같은 유동인구 많은 곳엔 사람들이 있어야지"): 모임 자리마다 사람들이 거닌다
test("모임 자리(TNR2): 공원·학교·광장·캠퍼스 수천 곳, 등급 9~12, 거니는 반지름 1.5~12m, 전부 구 근처", () => {
  const s = decodeTraffic(read("toon-traffic.bin")).spots
  assert.ok(s.count > 3000, `${s.count}`)
  const by = new Map<number, number>()
  for (let i = 0; i < s.count; i++) {
    assert.ok(s.cls[i] >= TrafficClass.park && s.cls[i] <= TrafficClass.campus, `등급 ${s.cls[i]}`)
    assert.ok(s.r[i] >= 1.5 && s.r[i] <= 12, `반지름 ${s.r[i]}`)
    assert.ok(Math.abs(s.xz[i * 2]) < 4000 && Math.abs(s.xz[i * 2 + 1]) < 4000)
    by.set(s.cls[i], (by.get(s.cls[i]) ?? 0) + 1)
  }
  for (const c of [TrafficClass.park, TrafficClass.school, TrafficClass.plaza, TrafficClass.campus]) assert.ok((by.get(c) ?? 0) > 100, `등급 ${c}: ${by.get(c)}`)
})
