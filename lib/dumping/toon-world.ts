// /dumping 입체 지도 정적 자료의 바이트 형식 정본(23라운드 모형 보기, 24라운드 2026-10-09 건물 유형 바이트). 만드는 쪽은 scripts/dumping-toon-world.py, 읽는 쪽은 이 파일.
// 좌표는 모델 원점(ANCHOR, icons3d와 같다) 기준 three 로컬 미터: +x 동, +z 남. 원점 위도의 메르카토르 축척이라 지도 행렬로 그대로 투영된다.
// 모든 정수는 리틀 엔디언.
//
// toon-buildings.bin  "TNB2"(24라운드, "TNB1"도 읽는다: 유형 0) · u32 동 수 · f64 원점 경도 · f64 원점 위도, 이어서 동마다
//   u16 꼭짓점 수 n · u8 지상층수(0 미기재) · u8 유형(아래 4비트 용도 BuildingUse · 다음 3비트 사용승인 연대 · 맨 위 1비트 벽돌·블록·조적 구조)
//   · u16 높이(0.1m, 0 미기재) · i16 최저 지면(0.1m) · i16 가운데 지면(0.1m) · i32 첫 꼭짓점 x · i32 z(0.1m) · (n−1)×(i16 dx · i16 dz)(0.1m, 앞 꼭짓점과의 차)
//   건물 집합은 GIS건물통합정보 + 건축물대장으로 대조한 OSM 신축(스크립트 머리 주석). 연대는 0 1960년대 이전 · 1 70 · 2 80 · 3 90 · 4 2000 · 5 2010 · 6 2020 · 7 모름
// toon-trees.bin      "TNT1" · u32 그루 수, 이어서 그루마다 i16 x · i16 z(0.5m) · i16 지면(0.1m) · u8 꼴(0 활엽 · 1 침엽 · 2 관목) · u8 크기(0~255)
// toon-ground.bin     "TNG1" · u16 nx · u16 nz · f32 x0 · f32 z0 · f32 칸(m), 이어서 nz행 × nx열 i16 지면(0.1m)
// 지면 고도는 dem.pmtiles z14(지도 지형과 같은 원자료)이고 과장 배율은 곱하지 않은 값이다(런타임이 TERRAIN_EXAG를 곱한다)

/** 건물 용도(유형 바이트 아래 4비트). 스크립트 use_class 와 같은 번호 */
export const BuildingUse = { annex: 0, house: 1, villa: 2, apartment: 3, shop: 4, office: 5, school: 6, civic: 7, industry: 8 } as const
export type BuildingUseId = (typeof BuildingUse)[keyof typeof BuildingUse]
export const useOf = (style: number): number => style & 15
/** 사용승인 연대 0~6(1960년대 이전 ~ 2020년대), 7 모름 */
export const decadeOf = (style: number): number => (style >> 4) & 7
export const isBrick = (style: number): boolean => (style & 128) !== 0

export const TOON_ANCHOR: [number, number] = [127.085, 37.546]

export interface ToonBuildings {
  count: number
  /** 동마다 꼭짓점 시작 위치(xz 쌍 단위). start[i]~start[i+1] */
  start: Uint32Array
  /** 꼭짓점 x·z(m) 교대 */
  xz: Float32Array
  floors: Uint8Array
  /** 유형 바이트(useOf · decadeOf · isBrick) */
  style: Uint8Array
  /** 높이(m). 0이면 미기재 */
  height: Float32Array
  groundMin: Float32Array
  groundMid: Float32Array
}

function magic(view: DataView, want: string): void {
  const got = String.fromCharCode(view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3))
  if (got !== want) throw new Error(`모형 자료 형식이 다릅니다: ${got}`)
}

export function decodeBuildings(buf: ArrayBuffer): ToonBuildings {
  const v = new DataView(buf)
  const v2 = String.fromCharCode(v.getUint8(0), v.getUint8(1), v.getUint8(2), v.getUint8(3)) === "TNB2"
  if (!v2) magic(v, "TNB1")
  const count = v.getUint32(4, true)
  // 꼭짓점 총수를 먼저 센다(배열을 한 번에 잡게)
  let o = 24
  let total = 0
  for (let i = 0; i < count; i++) {
    const n = v.getUint16(o, true)
    total += n
    o += 18 + 4 * (n - 1)
  }
  if (o !== buf.byteLength) throw new Error(`모형 건물 자료 길이가 맞지 않습니다(${o}/${buf.byteLength})`)
  const start = new Uint32Array(count + 1)
  const xz = new Float32Array(total * 2)
  const floors = new Uint8Array(count)
  const style = new Uint8Array(count)
  const height = new Float32Array(count)
  const groundMin = new Float32Array(count)
  const groundMid = new Float32Array(count)
  o = 24
  let k = 0
  for (let i = 0; i < count; i++) {
    const n = v.getUint16(o, true)
    floors[i] = v.getUint8(o + 2)
    style[i] = v2 ? v.getUint8(o + 3) : 0
    height[i] = v.getUint16(o + 4, true) / 10
    groundMin[i] = v.getInt16(o + 6, true) / 10
    groundMid[i] = v.getInt16(o + 8, true) / 10
    let x = v.getInt32(o + 10, true)
    let z = v.getInt32(o + 14, true)
    start[i] = k
    xz[k * 2] = x / 10
    xz[k * 2 + 1] = z / 10
    k++
    o += 18
    for (let j = 1; j < n; j++) {
      x += v.getInt16(o, true)
      z += v.getInt16(o + 2, true)
      xz[k * 2] = x / 10
      xz[k * 2 + 1] = z / 10
      k++
      o += 4
    }
  }
  start[count] = k
  return { count, start, xz, floors, style, height, groundMin, groundMid }
}

export interface ToonTrees {
  count: number
  x: Float32Array
  z: Float32Array
  ground: Float32Array
  form: Uint8Array
  /** 0~1 */
  size: Float32Array
}

export function decodeTrees(buf: ArrayBuffer): ToonTrees {
  const v = new DataView(buf)
  magic(v, "TNT1")
  const count = v.getUint32(4, true)
  if (8 + count * 8 !== buf.byteLength) throw new Error("모형 나무 자료 길이가 맞지 않습니다")
  const t: ToonTrees = { count, x: new Float32Array(count), z: new Float32Array(count), ground: new Float32Array(count), form: new Uint8Array(count), size: new Float32Array(count) }
  for (let i = 0, o = 8; i < count; i++, o += 8) {
    t.x[i] = v.getInt16(o, true) / 2
    t.z[i] = v.getInt16(o + 2, true) / 2
    t.ground[i] = v.getInt16(o + 4, true) / 10
    t.form[i] = v.getUint8(o + 6)
    t.size[i] = v.getUint8(o + 7) / 255
  }
  return t
}

export interface ToonGround {
  nx: number
  nz: number
  x0: number
  z0: number
  cell: number
  /** nz × nx 지면(m) */
  h: Float32Array
}

export function decodeGround(buf: ArrayBuffer): ToonGround {
  const v = new DataView(buf)
  magic(v, "TNG1")
  const nx = v.getUint16(4, true)
  const nz = v.getUint16(6, true)
  const g: ToonGround = { nx, nz, x0: v.getFloat32(8, true), z0: v.getFloat32(12, true), cell: v.getFloat32(16, true), h: new Float32Array(nx * nz) }
  if (20 + nx * nz * 2 !== buf.byteLength) throw new Error("모형 지면 자료 길이가 맞지 않습니다")
  for (let i = 0; i < nx * nz; i++) g.h[i] = v.getInt16(20 + i * 2, true) / 10
  return g
}

/** 지면 격자 쌍선형 높이(m, 과장 전). 격자 밖은 가장자리 값 */
export function groundAt(g: ToonGround, x: number, z: number): number {
  const fx = Math.min(g.nx - 1.0001, Math.max(0, (x - g.x0) / g.cell))
  const fz = Math.min(g.nz - 1.0001, Math.max(0, (z - g.z0) / g.cell))
  const i = Math.floor(fx)
  const j = Math.floor(fz)
  const tx = fx - i
  const tz = fz - j
  const a = g.h[j * g.nx + i]
  const b = g.h[j * g.nx + i + 1]
  const c = g.h[(j + 1) * g.nx + i]
  const d = g.h[(j + 1) * g.nx + i + 1]
  return (a * (1 - tx) + b * tx) * (1 - tz) + (c * (1 - tx) + d * tx) * tz
}

/** 로컬 미터 → 경위도(지도 행렬과 같은 메르카토르 역변환). 건물 중심점을 격자 칸에 붙일 때 쓴다 */
export function localToLngLat(x: number, z: number): [number, number] {
  const R = 6371008.8
  const ax = (TOON_ANCHOR[0] + 180) / 360
  const ay = (1 - Math.log(Math.tan(Math.PI / 4 + (TOON_ANCHOR[1] * Math.PI) / 360)) / Math.PI) / 2
  const perUnit = 2 * Math.PI * R * Math.cos((TOON_ANCHOR[1] * Math.PI) / 180)
  const mx = x / perUnit + ax
  const my = z / perUnit + ay
  const lng = mx * 360 - 180
  const lat = (Math.atan(Math.sinh(Math.PI * (1 - 2 * my))) * 180) / Math.PI
  return [lng, lat]
}

/** 경위도 → 로컬 미터(localToLngLat 의 역). 기둥(GeoJSON)을 모형 좌표로 옮길 때 쓴다 */
export function lngLatToLocal(lng: number, lat: number): [number, number] {
  const R = 6371008.8
  const merc = (a: number, b: number) => [(a + 180) / 360, (1 - Math.log(Math.tan(Math.PI / 4 + (b * Math.PI) / 360)) / Math.PI) / 2]
  const [ax, ay] = merc(TOON_ANCHOR[0], TOON_ANCHOR[1])
  const [mx, my] = merc(lng, lat)
  const perUnit = 2 * Math.PI * R * Math.cos((TOON_ANCHOR[1] * Math.PI) / 180)
  return [(mx - ax) * perUnit, (my - ay) * perUnit]
}
