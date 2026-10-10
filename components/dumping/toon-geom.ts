// /dumping 모형 보기 건물 기하(23라운드 → 24라운드 2026-10-09 실사). toon-world.ts 로 읽은 윤곽을 three 버퍼용 배열로 만든다(순수 계산, 테스트 가능).
// 좌표는 three 로컬 미터(+x 동, +y 위, +z 남). 면마다 꼭짓점을 따로 두고 법선을 싣는다: 매끈한 명암·그림자 받기(법선 바이어스)·창 배치에 필요하다.
// 벽은 변마다 한 장, 꼭짓점 속성 aW = (변 따라 거리 m, 변 길이 m)라 셰이더가 변마다 창을 고르게 나눈다(모서리에 반쪽 창이 안 생긴다).
// 평지붕은 난간(바깥 고리와 0.3~0.75m 안쪽 고리 사이 띠)과 그 안 지붕면, 3층 이상은 옥탑(계단실·기계실), 빌라·주택 일부는 물탱크.
// 박공은 1~2층 직사각에 가까운 집 중 연대가 오래될수록 많이(1980년대 이전 단독 75%, 2010년대 15%). 처마는 내민다.
// 꼭짓점 속성: position · normal · aB(동 번호, 면 종류 Part) · aW(벽: 변 따라 거리·변 길이 / 난간: 바깥 1·안쪽 0)
// 25라운드: 길쭉한 아파트(5층 이상)의 양 끝 짧은 벽은 측벽(Part.end): 창 없이 꼭대기 층 아래 동 번호(GIS건물통합정보 동명)·꼭대기 색띠를 셰이더가 칠한다
import { ShapeUtils, Vector2 } from "three"
import { BuildingUse, decadeOf, useOf, type ToonBuildings } from "@/lib/dumping/toon-world"
import { hash01 } from "./toon-palette"

export const CHUNK_M = 512
/** 층고(m). 높이 미기재면 층수 × 이 값(지도 압출 식과 같다) */
export const STOREY_M = 3.2
const EAVE_M = 0.4 // 박공 처마 내민 길이
const BURY_M = 1.2 // 벽 밑을 땅 아래로 묻는 깊이(경사지에서 벽 밑이 뜨지 않게)

/** 면 종류(셰이더가 aB.y 로 고른다) */
export const Part = { wall: 0, roof: 1, parapet: 2, plain: 3, tile: 4, tank: 5, end: 6 } as const

export interface ToonChunk {
  position: Float32Array
  /** 면 법선(-127~127 정규화) */
  normal: Int8Array
  /** 동 번호 · 면 종류 */
  info: Float32Array
  /** 벽: 변 따라 거리 · 변 길이(m). 난간: 바깥 1 · 안쪽 0 */
  wall: Float32Array
  index: Uint32Array
  ids: number[]
}

type XZ = [number, number]

export function signedArea(r: XZ[]): number {
  let a = 0
  for (let i = 0; i < r.length; i++) {
    const [x0, z0] = r[i]
    const [x1, z1] = r[(i + 1) % r.length]
    a += x0 * z1 - x1 * z0
  }
  return a / 2
}

/** 최소 넓이 외접 직사각형(변 방향 후보 중 최소). u 가 긴 축, long·short 는 반길이 */
export function minRect(pts: XZ[]): { c: XZ; u: XZ; long: number; short: number } {
  let best = { c: [0, 0] as XZ, u: [1, 0] as XZ, long: 0, short: 0, area: Infinity }
  for (let i = 0; i < pts.length; i++) {
    const [ax, az] = pts[i]
    const [bx, bz] = pts[(i + 1) % pts.length]
    const len = Math.hypot(bx - ax, bz - az)
    if (len < 1e-6) continue
    const ux = (bx - ax) / len
    const uz = (bz - az) / len
    let a0 = Infinity, a1 = -Infinity, b0 = Infinity, b1 = -Infinity
    for (const [x, z] of pts) {
      const a = x * ux + z * uz
      const b = -x * uz + z * ux
      a0 = Math.min(a0, a)
      a1 = Math.max(a1, a)
      b0 = Math.min(b0, b)
      b1 = Math.max(b1, b)
    }
    const area = (a1 - a0) * (b1 - b0)
    if (area < best.area) {
      const ca = (a0 + a1) / 2
      const cb = (b0 + b1) / 2
      const c: XZ = [ca * ux - cb * uz, ca * uz + cb * ux]
      best = a1 - a0 >= b1 - b0 ? { c, u: [ux, uz], long: (a1 - a0) / 2, short: (b1 - b0) / 2, area } : { c, u: [-uz, ux], long: (b1 - b0) / 2, short: (a1 - a0) / 2, area }
    }
  }
  return best
}

export function pointInRing(x: number, z: number, r: XZ[]): boolean {
  let inside = false
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const [xi, zi] = r[i]
    const [xj, zj] = r[j]
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside
  }
  return inside
}

/** 동 i 의 꼭짓점(닫는 점 없이). 바깥 법선이 (dz, −dx) 가 되게 부호 넓이 양수로 맞춘다 */
export function ringOf(b: ToonBuildings, i: number): XZ[] {
  const r: XZ[] = []
  for (let k = b.start[i]; k < b.start[i + 1]; k++) r.push([b.xz[k * 2], b.xz[k * 2 + 1]])
  if (signedArea(r) < 0) r.reverse()
  return r
}

/** 층수(미기재면 높이에서, 둘 다 없으면 2층) */
export function floorsOf(b: ToonBuildings, i: number): number {
  return b.floors[i] > 0 ? b.floors[i] : b.height[i] > 0 ? Math.max(1, Math.round(b.height[i] / STOREY_M)) : 2
}

/** 벽 높이(m). 지도 압출 식과 같게: 높이가 있으면 그 값, 없으면 max(2, 층수) × 3.2 */
export function heightOf(b: ToonBuildings, i: number): number {
  return b.height[i] > 0 ? b.height[i] : Math.max(2, b.floors[i]) * STOREY_M
}

/** 박공지붕 확률: 오래된 단독일수록 기와·슬레이트 지붕이 많다(광진 저층 주거지 항공사진 인상, 연대 모름은 중간) */
export function gableChance(style: number): number {
  const use = useOf(style)
  const dec = decadeOf(style)
  if (use === BuildingUse.house) return dec === 7 ? 0.45 : dec <= 2 ? 0.75 : dec <= 4 ? 0.35 : 0.15
  if (use === BuildingUse.annex) return 0.3
  if (use === BuildingUse.civic && dec <= 3) return 0.25
  return 0
}

export interface RoofPlan {
  gable: boolean
  rect: ReturnType<typeof minRect>
  /** 지면 위 처마(평지붕이면 지붕) 높이(m) */
  eave: number
  /** 용마루 높이(처마 위, m). 평지붕 0 */
  ridge: number
  area: number
}

/** 지붕 꼴: 1~2층 · 직사각형에 가까운 꼴(외접 사각형의 82% 이상) · 짧은 변 2.5~11m · 장단비 4 이하 중 박공.
 * pitched 는 위성 판정(25라운드 toon-sat: 1 박공 · 0 평지붕 · −1 판정 없음). 판정이 없으면 gableChance 만큼 */
export function roofPlan(b: ToonBuildings, i: number, ring: XZ[], pitched = -1): RoofPlan {
  const area = Math.abs(signedArea(ring))
  const f = floorsOf(b, i)
  const H = heightOf(b, i)
  const rect = minRect(ring)
  const full = rect.long * rect.short * 4
  const shape = f <= 2 && rect.short * 2 >= 2.5 && rect.short * 2 <= 11 && rect.long / Math.max(rect.short, 0.1) <= 4 && area / full > 0.82
  const gable = shape && (pitched >= 0 ? pitched === 1 : hash01(i, 31) < gableChance(b.style[i]))
  const pitch = ((rect.short <= 2.5 ? 30 : rect.short <= 4 ? 26 : 20) * Math.PI) / 180
  const ridge = gable ? rect.short * Math.tan(pitch) : 0
  // 높이가 기재돼 있으면 용마루까지 포함한 높이로 본다(처마 = 높이 − 용마루). 층수로 짐작한 높이면 그 위에 지붕을 얹는다
  const eave = gable ? (b.height[i] > 0 ? Math.max(2.6, H - ridge) : H) : H
  return { gable, rect, eave, ridge, area }
}

/** 아파트 측벽: 외접 사각형이 길쭉하면(장단비 1.6 이상) 긴 축에 거의 수직이고(|cos| < 0.45) 짧은 변 반 이상 길며 긴 축 양 끝(82% 밖)에 선 변. 변 번호 집합 */
export function endWalls(ring: XZ[], rect: ReturnType<typeof minRect>): Set<number> {
  const out = new Set<number>()
  if (rect.long / Math.max(rect.short, 0.1) < 1.6) return out
  const [ux, uz] = rect.u
  for (let k = 0; k < ring.length; k++) {
    const a = ring[k], c = ring[(k + 1) % ring.length]
    const len = Math.hypot(c[0] - a[0], c[1] - a[1])
    if (len < Math.max(6, rect.short) || Math.abs(((c[0] - a[0]) * ux + (c[1] - a[1]) * uz) / len) > 0.45) continue
    const t = ((a[0] + c[0]) / 2 - rect.c[0]) * ux + ((a[1] + c[1]) / 2 - rect.c[1]) * uz
    if (Math.abs(t) >= rect.long * 0.82) out.add(k)
  }
  return out
}

/** 고리를 d 만큼 안으로(모서리 이등분선 방향). 너무 얇거나 뒤집히면 null */
export function insetRing(ring: XZ[], d: number): XZ[] | null {
  const n = ring.length
  const out: XZ[] = []
  for (let k = 0; k < n; k++) {
    const p = ring[(k + n - 1) % n], c = ring[k], q = ring[(k + 1) % n]
    const l1 = Math.hypot(c[0] - p[0], c[1] - p[1]) || 1
    const l2 = Math.hypot(q[0] - c[0], q[1] - c[1]) || 1
    const n1: XZ = [(c[1] - p[1]) / l1, -(c[0] - p[0]) / l1]
    const n2: XZ = [(q[1] - c[1]) / l2, -(q[0] - c[0]) / l2]
    let mx = n1[0] + n2[0], mz = n1[1] + n2[1]
    const ml = Math.hypot(mx, mz)
    if (ml < 1e-6) [mx, mz] = n1
    else {
      mx /= ml
      mz /= ml
    }
    const len = d / Math.max(0.35, mx * n1[0] + mz * n1[1])
    out.push([c[0] - mx * len, c[1] - mz * len])
  }
  const a0 = signedArea(ring)
  const a1 = signedArea(out)
  if (!(a1 > a0 * 0.3 && a1 < a0)) return null
  if (!out.every(([x, z]) => pointInRing(x, z, ring))) return null
  return out
}

class Builder {
  P: number[] = []
  N: number[] = []
  I: number[] = []
  W: number[] = []
  T: number[] = []
  vert(x: number, y: number, z: number, n: [number, number, number], id: number, part: number, u = 0, len = 0): number {
    this.P.push(x, y, z)
    this.N.push(Math.round(n[0] * 127), Math.round(n[1] * 127), Math.round(n[2] * 127))
    this.I.push(id, part)
    this.W.push(u, len)
    return this.P.length / 3 - 1
  }
  /** 삼각형 a·b·c 를 want 쪽이 앞면(반시계)이 되게 감는다 */
  tri(a: number, b: number, c: number, want: [number, number, number]) {
    const p = this.P
    const ux = p[b * 3] - p[a * 3], uy = p[b * 3 + 1] - p[a * 3 + 1], uz = p[b * 3 + 2] - p[a * 3 + 2]
    const vx = p[c * 3] - p[a * 3], vy = p[c * 3 + 1] - p[a * 3 + 1], vz = p[c * 3 + 2] - p[a * 3 + 2]
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx
    if (nx * want[0] + ny * want[1] + nz * want[2] >= 0) this.T.push(a, b, c)
    else this.T.push(a, c, b)
  }
  /** 사각 면 a-b-c-d(둘레 순) */
  quad(a: number, b: number, c: number, d: number, want: [number, number, number]) {
    this.tri(a, b, c, want)
    this.tri(a, c, d, want)
  }
}

const UP: [number, number, number] = [0, 1, 0]

/** 수직 벽 한 장(a→c 변, y0~y1). 바깥 법선 (dz, −dx) */
function wallQuad(B: Builder, a: XZ, c: XZ, y0: number, y1: number, id: number, part: number) {
  const len = Math.hypot(c[0] - a[0], c[1] - a[1])
  if (len < 1e-3) return
  const n: [number, number, number] = [(c[1] - a[1]) / len, 0, -(c[0] - a[0]) / len]
  const v0 = B.vert(a[0], y0, a[1], n, id, part, 0, len)
  const v1 = B.vert(c[0], y0, c[1], n, id, part, len, len)
  const v2 = B.vert(c[0], y1, c[1], n, id, part, len, len)
  const v3 = B.vert(a[0], y1, a[1], n, id, part, 0, len)
  B.quad(v0, v1, v2, v3, n)
}

/** 평면 다각형(위를 보는 면) */
function flat(B: Builder, ring: XZ[], y: number, id: number, part: number) {
  const tris = ShapeUtils.triangulateShape(ring.map(([x, z]) => new Vector2(x, z)), [])
  const v = ring.map(([x, z]) => B.vert(x, y, z, UP, id, part))
  for (const [a, c, d] of tris) B.tri(v[a], v[c], v[d], UP)
}

/** 상자(옥탑·기계실·물탱크): 가운데 c, 축 u, 반길이 hu·hv, 바닥 y0·꼭대기 y1 */
function addBox(B: Builder, c: XZ, u: XZ, hu: number, hv: number, y0: number, y1: number, id: number, side: number, top: number) {
  const v: XZ = [-u[1], u[0]]
  const corners: XZ[] = [
    [c[0] - u[0] * hu - v[0] * hv, c[1] - u[1] * hu - v[1] * hv],
    [c[0] + u[0] * hu - v[0] * hv, c[1] + u[1] * hu - v[1] * hv],
    [c[0] + u[0] * hu + v[0] * hv, c[1] + u[1] * hu + v[1] * hv],
    [c[0] - u[0] * hu + v[0] * hv, c[1] - u[1] * hu + v[1] * hv],
  ]
  if (signedArea(corners) < 0) corners.reverse()
  for (let k = 0; k < 4; k++) wallQuad(B, corners[k], corners[(k + 1) % 4], y0, y1, id, side)
  flat(B, corners, y1, id, top)
}

/** 옥상 설비. 3층 이상 평지붕 50㎡ 이상: 계단실(빌라·상가) 또는 기계실(10층 이상·아파트·업무, 긴 동은 둘). 빌라·주택 45㎡ 이상 40%는 물탱크 */
function addRooftop(B: Builder, b: ToonBuildings, i: number, ring: XZ[], plan: RoofPlan, top: number) {
  const f = floorsOf(b, i)
  const use = useOf(b.style[i])
  const { u, long, short } = plan.rect
  const v: XZ = [-u[1], u[0]]
  const n = ring.length
  const cen: XZ = [ring.reduce((s, q) => s + q[0], 0) / n, ring.reduce((s, q) => s + q[1], 0) / n]
  const fits = (c: XZ, hu: number, hv: number) => [-1, 1].every((su) => [-1, 1].every((sv) => pointInRing(c[0] + u[0] * hu * su + v[0] * hv * sv, c[1] + u[1] * hu * su + v[1] * hv * sv, ring)))
  const at = (c: XZ, du: number, dv: number): XZ => [c[0] + u[0] * du + v[0] * dv, c[1] + u[1] * du + v[1] * dv]
  if (f >= 3 && plan.area >= 50) {
    const big = f >= 10 || use === BuildingUse.apartment || use === BuildingUse.office
    const hu = big ? Math.min(4.2, long * 0.28) : Math.min(1.6, long * 0.4)
    const hv = big ? Math.min(3.2, short * 0.5) : Math.min(1.35, short * 0.4)
    const hh = big ? 3.4 : 2.6
    const spots = big && long > 18 ? [at(plan.rect.c, -long * 0.42, 0), at(plan.rect.c, long * 0.42, 0)] : [cen, plan.rect.c]
    let placed = 0
    for (const c of spots) {
      if (!fits(c, hu, hv)) continue
      addBox(B, c, u, hu, hv, top - 0.1, top + hh, i, Part.plain, Part.roof)
      placed++
      if (!(big && long > 18) || placed >= 2) break
    }
  }
  // 다세대·연립(26라운드 rowhouse, villa 에서 나눔)도 옥상 물탱크(나눈 뒤 1,496동에서 빠졌다, 검증 실측)
  if ((use === BuildingUse.villa || use === BuildingUse.house || use === BuildingUse.rowhouse) && plan.area >= 45 && hash01(i, 41) < 0.4) {
    const c = at(plan.rect.c, long * 0.55 * (hash01(i, 43) < 0.5 ? -1 : 1), short * 0.45 * (hash01(i, 45) < 0.5 ? -1 : 1))
    if (fits(c, 0.85, 0.65)) addBox(B, c, u, 0.85, 0.65, top - 0.1, top + 1.35, i, Part.tank, Part.tank)
  }
}

/** 한 동을 기하에 더한다. exag 는 지형 과장 배율(지면 고도에 곱한다). plan 은 미리 구했으면 넘긴다 */
export function addBuilding(B: Builder, b: ToonBuildings, i: number, exag: number, known?: RoofPlan): void {
  const ring = ringOf(b, i)
  const n = ring.length
  if (n < 3) return
  const plan = known ?? roofPlan(b, i, ring)
  const ground = b.groundMid[i] * exag
  const base = b.groundMin[i] * exag - BURY_M
  const top = ground + plan.eave
  const ends = !plan.gable && useOf(b.style[i]) === BuildingUse.apartment && floorsOf(b, i) >= 5 ? endWalls(ring, plan.rect) : null
  for (let k = 0; k < n; k++) wallQuad(B, ring[k], ring[(k + 1) % n], base, top, i, ends?.has(k) ? Part.end : Part.wall)
  if (!plan.gable) {
    // 난간 띠: 바깥 고리(1)와 안쪽 고리(0) 사이. 좁은 동(짧은 변 3m 미만)·작은 동은 지붕면만
    const inner = plan.area >= 20 && plan.rect.short * 2 >= 3 ? insetRing(ring, Math.min(0.75, Math.max(0.3, 0.3 + 0.025 * Math.sqrt(plan.area)))) : null
    if (inner) {
      const o = ring.map(([x, z]) => B.vert(x, top, z, UP, i, Part.parapet, 1))
      const q = inner.map(([x, z]) => B.vert(x, top, z, UP, i, Part.parapet, 0))
      for (let k = 0; k < n; k++) B.quad(o[k], o[(k + 1) % n], q[(k + 1) % n], q[k], UP)
      flat(B, inner, top, i, Part.roof)
    } else flat(B, ring, top, i, Part.roof)
    addRooftop(B, b, i, ring, plan, top)
    return
  }
  // 박공: 용마루는 긴 축(u) 따라 가운데. 처마는 EAVE_M 내밀고 그만큼 경사를 따라 낮춘다
  const { c, u, long, short } = plan.rect
  const v: XZ = [-u[1], u[0]]
  const tan = plan.ridge / Math.max(short, 0.1)
  const L = long + EAVE_M
  const S = short + EAVE_M
  const yE = top - EAVE_M * tan
  const yR = top + plan.ridge
  const pt = (su: number, sv: number): XZ => [c[0] + u[0] * su + v[0] * sv, c[1] + u[1] * su + v[1] * sv]
  const r0p = pt(-L, 0), r1p = pt(L, 0)
  for (const side of [-1, 1]) {
    const nl = Math.hypot(tan, 1)
    const nrm: [number, number, number] = [(v[0] * side * tan) / nl, 1 / nl, (v[1] * side * tan) / nl]
    const e0p = pt(-L, side * S), e1p = pt(L, side * S)
    const e0 = B.vert(e0p[0], yE, e0p[1], nrm, i, Part.tile)
    const e1 = B.vert(e1p[0], yE, e1p[1], nrm, i, Part.tile)
    const r1 = B.vert(r1p[0], yR, r1p[1], nrm, i, Part.tile)
    const r0 = B.vert(r0p[0], yR, r0p[1], nrm, i, Part.tile)
    B.quad(e0, e1, r1, r0, nrm)
  }
  // 박공 끝 삼각형(벽, 창 없음): 외접 사각형 양 끝, 처마 높이에서 용마루까지
  for (const end of [-1, 1]) {
    const a = pt(end * long, -short), d = pt(end * long, short), m = pt(end * long, 0)
    const out: [number, number, number] = [u[0] * end, 0, u[1] * end]
    const va = B.vert(a[0], top, a[1], out, i, Part.plain)
    const vd = B.vert(d[0], top, d[1], out, i, Part.plain)
    const vm = B.vert(m[0], yR, m[1], out, i, Part.plain)
    B.tri(va, vd, vm, out)
  }
}

/** 동 번호 목록 → 덩어리 기하. plans 는 동 번호로 찾는 지붕 계획(없으면 여기서 구한다) */
export function buildChunk(b: ToonBuildings, ids: number[], exag: number, plans?: (RoofPlan | undefined)[]): ToonChunk {
  const B = new Builder()
  for (const i of ids) addBuilding(B, b, i, exag, plans?.[i])
  return { position: Float32Array.from(B.P), normal: Int8Array.from(B.N), info: Float32Array.from(B.I), wall: Float32Array.from(B.W), index: Uint32Array.from(B.T), ids }
}

/** 접지 그늘(26라운드): 동 바닥 둘레 바깥으로 띠(높을수록 넓게 2~6m). 꼭짓점 알파 = 안쪽 1 · 바깥 0(셰이더가 진하기를 곱한다).
 * 그림자맵만으로는 건물 밑이 땅에서 떠 보였다(모형 사진의 접지 그늘이 없다) */
export function haloChunk(b: ToonBuildings, ids: number[], exag: number): { position: Float32Array; alpha: Float32Array; index: Uint32Array } {
  const P: number[] = []
  const A: number[] = []
  const I: number[] = []
  for (const i of ids) {
    const ring = ringOf(b, i)
    const n = ring.length
    if (n < 3) continue
    const y = b.groundMid[i] * exag + 0.35
    const w = Math.min(6, Math.max(2, 1.6 + 0.05 * heightOf(b, i)))
    const o = P.length / 3
    for (let k = 0; k < n; k++) {
      const p = ring[(k + n - 1) % n], c = ring[k], q = ring[(k + 1) % n]
      const l1 = Math.hypot(c[0] - p[0], c[1] - p[1]) || 1
      const l2 = Math.hypot(q[0] - c[0], q[1] - c[1]) || 1
      // 변 a→c 의 바깥 법선은 (dz, −dx)
      let nx = (c[1] - p[1]) / l1 + (q[1] - c[1]) / l2
      let nz = -(c[0] - p[0]) / l1 - (q[0] - c[0]) / l2
      const nl = Math.hypot(nx, nz) || 1
      nx /= nl
      nz /= nl
      P.push(c[0], y, c[1], c[0] + nx * w, y, c[1] + nz * w)
      A.push(1, 0)
    }
    for (let k = 0; k < n; k++) {
      const a0 = o + k * 2, a1 = o + ((k + 1) % n) * 2
      I.push(a0, a0 + 1, a1 + 1, a0, a1 + 1, a1)
    }
  }
  return { position: Float32Array.from(P), alpha: Float32Array.from(A), index: Uint32Array.from(I) }
}

/** 첫 꼭짓점 기준 CHUNK_M 칸으로 동을 묶는다. 키는 "ix:iz" */
export function chunkIds(b: ToonBuildings): Map<string, number[]> {
  const m = new Map<string, number[]>()
  for (let i = 0; i < b.count; i++) {
    const k = b.start[i]
    const key = `${Math.floor(b.xz[k * 2] / CHUNK_M)}:${Math.floor(b.xz[k * 2 + 1] / CHUNK_M)}`
    const list = m.get(key)
    if (list) list.push(i)
    else m.set(key, [i])
  }
  return m
}

/** 동의 꼭짓점 평균(로컬 m). 격자 칸 붙이기용 */
export function centroidOf(b: ToonBuildings, i: number): XZ {
  let x = 0, z = 0
  const n = b.start[i + 1] - b.start[i]
  for (let k = b.start[i]; k < b.start[i + 1]; k++) {
    x += b.xz[k * 2]
    z += b.xz[k * 2 + 1]
  }
  return [x / n, z / n]
}

export { Builder as ToonBuilder }
