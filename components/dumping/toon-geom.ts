// /dumping 모형 보기 건물 기하(23라운드, 2026-10-09). toon-world.ts 로 읽은 윤곽을 three 버퍼용 배열로 만든다(순수 계산, 테스트 가능).
// 좌표는 three 로컬 미터(+x 동, +y 위, +z 남). 한 동의 벽은 바닥 고리·윗 고리 꼭짓점을 이웃 벽과 나눠 쓴다:
// 면 법선은 셰이더가 화면 미분으로 구하고(평면 셰이딩), 꼭짓점을 나눠 써야 윤곽선(뒷면 껍질)이 틈 없이 닫힌다.
// 1~2층의 직사각형에 가까운 집은 박공지붕(용마루는 긴 변), 그 밖은 평지붕. 3~15층 평지붕 위에는 옥탑(계단실) 상자 하나.
// 꼭짓점 속성: position · aB(동 번호, 지면 y, 벽 꼭대기 y, 창 종류) · aOut(윤곽선을 밀어낼 바깥 방향)
import { ShapeUtils, Vector2 } from "three"
import type { ToonBuildings } from "@/lib/dumping/toon-world"

export const CHUNK_M = 512
/** 층고(m). 높이 미기재면 층수 × 이 값(지도 압출 식과 같다) */
export const STOREY_M = 3.2
const EAVE_M = 0.4 // 박공 처마 내민 길이
const BURY_M = 1.2 // 벽 밑을 땅 아래로 묻는 깊이(경사지에서 벽 밑이 뜨지 않게)

/** 창 종류: 0 집(박공) · 1 다가구·빌라 · 2 고층 · 3 창 없는 큰 저층(창고·상가) */
export type WindowKind = 0 | 1 | 2 | 3

export interface ToonChunk {
  position: Float32Array
  info: Float32Array
  out: Float32Array
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

export interface RoofPlan {
  gable: boolean
  rect: ReturnType<typeof minRect>
  /** 지면 위 처마(평지붕이면 지붕) 높이(m) */
  eave: number
  /** 용마루 높이(처마 위, m). 평지붕 0 */
  ridge: number
  kind: WindowKind
  area: number
}

/** 지붕 꼴 정하기. 1~2층 · 구멍 없는 직사각형에 가까운 꼴(외접 사각형의 82% 이상) · 짧은 변 2.5~11m · 장단비 4 이하면 박공 */
export function roofPlan(b: ToonBuildings, i: number, ring: XZ[]): RoofPlan {
  const area = Math.abs(signedArea(ring))
  const f = floorsOf(b, i)
  const H = heightOf(b, i)
  const rect = minRect(ring)
  const full = rect.long * rect.short * 4
  const gable = f <= 2 && rect.short * 2 >= 2.5 && rect.short * 2 <= 11 && rect.long / Math.max(rect.short, 0.1) <= 4 && area / full > 0.82
  const pitch = ((rect.short <= 2.5 ? 30 : rect.short <= 4 ? 26 : 20) * Math.PI) / 180
  const ridge = gable ? rect.short * Math.tan(pitch) : 0
  // 높이가 기재돼 있으면 용마루까지 포함한 높이로 본다(처마 = 높이 − 용마루). 층수로 짐작한 높이면 그 위에 지붕을 얹는다
  const eave = gable ? (b.height[i] > 0 ? Math.max(2.6, H - ridge) : H) : H
  const kind: WindowKind = gable ? 0 : f <= 2 && area >= 400 ? 3 : f >= 7 ? 2 : 1
  return { gable, rect, eave, ridge, kind, area }
}

class Builder {
  P: number[] = []
  I: number[] = []
  O: number[] = []
  N: number[] = []
  vert(x: number, y: number, z: number, info: [number, number, number, number], ox: number, oy: number, oz: number): number {
    this.P.push(x, y, z)
    this.I.push(...info)
    const l = Math.hypot(ox, oy, oz) || 1
    this.O.push(ox / l, oy / l, oz / l)
    return this.P.length / 3 - 1
  }
  /** 삼각형 a·b·c 를 want 쪽이 앞면(반시계)이 되게 감는다 */
  tri(a: number, b: number, c: number, want: [number, number, number]) {
    const p = this.P
    const ux = p[b * 3] - p[a * 3], uy = p[b * 3 + 1] - p[a * 3 + 1], uz = p[b * 3 + 2] - p[a * 3 + 2]
    const vx = p[c * 3] - p[a * 3], vy = p[c * 3 + 1] - p[a * 3 + 1], vz = p[c * 3 + 2] - p[a * 3 + 2]
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx
    if (nx * want[0] + ny * want[1] + nz * want[2] >= 0) this.N.push(a, b, c)
    else this.N.push(a, c, b)
  }
}

/** 상자(옥탑): 가운데 c, 축 u, 반길이 hu·hv, 바닥 y0·꼭대기 y1. 벽 4 + 지붕 */
function addBox(B: Builder, c: XZ, u: XZ, hu: number, hv: number, y0: number, y1: number, info: [number, number, number, number]) {
  const v: XZ = [-u[1], u[0]]
  const corners: XZ[] = [
    [c[0] - u[0] * hu - v[0] * hv, c[1] - u[1] * hu - v[1] * hv],
    [c[0] + u[0] * hu - v[0] * hv, c[1] + u[1] * hu - v[1] * hv],
    [c[0] + u[0] * hu + v[0] * hv, c[1] + u[1] * hu + v[1] * hv],
    [c[0] - u[0] * hu + v[0] * hv, c[1] - u[1] * hu + v[1] * hv],
  ]
  const lo: number[] = []
  const hi: number[] = []
  for (const [x, z] of corners) {
    const ox = x - c[0], oz = z - c[1]
    lo.push(B.vert(x, y0, z, info, ox, -0.2, oz))
    hi.push(B.vert(x, y1, z, info, ox, 0.8, oz))
  }
  for (let k = 0; k < 4; k++) {
    const k2 = (k + 1) % 4
    const mx = (corners[k][0] + corners[k2][0]) / 2 - c[0]
    const mz = (corners[k][1] + corners[k2][1]) / 2 - c[1]
    B.tri(lo[k], lo[k2], hi[k2], [mx, 0, mz])
    B.tri(lo[k], hi[k2], hi[k], [mx, 0, mz])
  }
  B.tri(hi[0], hi[1], hi[2], [0, 1, 0])
  B.tri(hi[0], hi[2], hi[3], [0, 1, 0])
}

/** 한 동을 기하에 더한다. exag 는 지형 과장 배율(지면 고도에 곱한다) */
export function addBuilding(B: Builder, b: ToonBuildings, i: number, exag: number): void {
  const ring = ringOf(b, i)
  const n = ring.length
  if (n < 3) return
  const plan = roofPlan(b, i, ring)
  const ground = b.groundMid[i] * exag
  const base = b.groundMin[i] * exag - BURY_M
  const top = ground + plan.eave
  const info: [number, number, number, number] = [i, ground, top, plan.kind]
  // 꼭짓점 바깥 방향: 이웃 두 벽 바깥 법선의 합(모서리 이등분)
  const edgeN: XZ[] = ring.map(([ax, az], k) => {
    const [bx, bz] = ring[(k + 1) % n]
    const l = Math.hypot(bx - ax, bz - az) || 1
    return [(bz - az) / l, -(bx - ax) / l]
  })
  const lo: number[] = []
  const hi: number[] = []
  for (let k = 0; k < n; k++) {
    const a = edgeN[(k + n - 1) % n]
    const c = edgeN[k]
    const mx = a[0] + c[0], mz = a[1] + c[1]
    lo.push(B.vert(ring[k][0], base, ring[k][1], info, mx, -0.3, mz))
    hi.push(B.vert(ring[k][0], top, ring[k][1], info, mx, plan.gable ? 0.1 : 0.7, mz))
  }
  for (let k = 0; k < n; k++) {
    const k2 = (k + 1) % n
    const want: [number, number, number] = [edgeN[k][0], 0, edgeN[k][1]]
    B.tri(lo[k], lo[k2], hi[k2], want)
    B.tri(lo[k], hi[k2], hi[k], want)
  }
  if (!plan.gable) {
    const tris = ShapeUtils.triangulateShape(ring.map(([x, z]) => new Vector2(x, z)), [])
    for (const [a, c, d] of tris) B.tri(hi[a], hi[c], hi[d], [0, 1, 0])
    // 옥탑: 3~15층 · 바닥 50㎡ 이상, 상자 네 귀가 다 윤곽 안일 때만(가운데 → 외접 사각형 가운데 순으로)
    const f = floorsOf(b, i)
    if (f >= 3 && f <= 15 && plan.area >= 50) {
      const hu = Math.min(1.6, plan.rect.long * 0.4)
      const hv = Math.min(1.35, plan.rect.short * 0.4)
      const u = plan.rect.u
      const v: XZ = [-u[1], u[0]]
      const cen: XZ = [ring.reduce((s, q) => s + q[0], 0) / n, ring.reduce((s, q) => s + q[1], 0) / n]
      for (const c of [cen, plan.rect.c]) {
        const ok = [-1, 1].every((su) => [-1, 1].every((sv) => pointInRing(c[0] + u[0] * hu * su + v[0] * hv * sv, c[1] + u[1] * hu * su + v[1] * hv * sv, ring)))
        if (ok) {
          addBox(B, c, u, hu, hv, top - 0.1, top + 2.5, [i, ground, top, plan.kind])
          break
        }
      }
    }
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
  const ridgeInfo: [number, number, number, number] = [i, ground, top, plan.kind]
  const r0p = pt(-L, 0), r1p = pt(L, 0)
  const r0 = B.vert(r0p[0], yR, r0p[1], ridgeInfo, -u[0] * 0.5, 1, -u[1] * 0.5)
  const r1 = B.vert(r1p[0], yR, r1p[1], ridgeInfo, u[0] * 0.5, 1, u[1] * 0.5)
  for (const side of [-1, 1]) {
    const e0p = pt(-L, side * S), e1p = pt(L, side * S)
    const e0 = B.vert(e0p[0], yE, e0p[1], ridgeInfo, v[0] * side - u[0] * 0.5, -0.2, v[1] * side - u[1] * 0.5)
    const e1 = B.vert(e1p[0], yE, e1p[1], ridgeInfo, v[0] * side + u[0] * 0.5, -0.2, v[1] * side + u[1] * 0.5)
    const want: [number, number, number] = [v[0] * side * tan, 1, v[1] * side * tan]
    B.tri(e0, e1, r1, want)
    B.tri(e0, r1, r0, want)
  }
  // 박공 끝 삼각형(벽색): 외접 사각형 양 끝, 처마 높이에서 용마루까지
  for (const end of [-1, 1]) {
    const a = pt(end * long, -short), d = pt(end * long, short), m = pt(end * long, 0)
    const out: [number, number, number] = [u[0] * end, 0, u[1] * end]
    const va = B.vert(a[0], top, a[1], ridgeInfo, u[0] * end - v[0], 0, u[1] * end - v[1])
    const vd = B.vert(d[0], top, d[1], ridgeInfo, u[0] * end + v[0], 0, u[1] * end + v[1])
    const vm = B.vert(m[0], yR, m[1], ridgeInfo, u[0] * end, 1, u[1] * end)
    B.tri(va, vd, vm, out)
  }
}

/** 동 번호 목록 → 덩어리 기하 */
export function buildChunk(b: ToonBuildings, ids: number[], exag: number): ToonChunk {
  const B = new Builder()
  for (const i of ids) addBuilding(B, b, i, exag)
  return { position: Float32Array.from(B.P), info: Float32Array.from(B.I), out: Float32Array.from(B.O), index: Uint32Array.from(B.N), ids }
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
