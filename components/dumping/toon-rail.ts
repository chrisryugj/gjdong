// /dumping 모형 보기 2호선 고가(26라운드 후속 4, 2026-10-10 사용자: "구의역·건대입구역도 전혀 구현이 안 되어 있네").
// 자료는 scripts/dumping-toon-rail.mjs 가 바탕 타일에서 뽑은 toon-rail.json(고가 선·승강장·역 점).
// 고가교: 선로마다 폭 5.4m 상판(윗면 땅 + 11.5m, 두께 1.8m, 옆면 위쪽에 2호선 초록 띠) + 32m 마다 교각. 복선은 두 선로 상판이 겹쳐 한 판으로 보인다.
// 역사: 역 점 150m 안 승강장을 선로 방향 사각형으로 묶어 상판 아래 2m 부터 위 9m 까지 유리 상자 + 흰 지붕 + 초록 띠.
// 전동차: 1km 넘는 선로마다 한 편성(18m × 6량, 흰 몸통 초록 띠)이 초속 14m 로 왕복. 움직이면 toon-layer 가 차·사람과 같은 간격으로 다시 그린다
import * as THREE from "three"
import { groundAt, lngLatToLocal, type ToonGround } from "@/lib/dumping/toon-world"

export interface RailData {
  lines: { name: string; coords: [number, number][] }[]
  platforms: { coords: [number, number][] }[]
  stations: { name: string; lng: number; lat: number }[]
}

export const DECK_TOP_M = 11.5
const DECK_W = 5.4
const DECK_T = 1.8
const PIER_EVERY = 32
const STEP = 10
const CAR_L = 18
const CAR_GAP = 1.4
const CARS = 6
const SPEED = 14
const LINE2 = "#2e9d43"

type XZ = [number, number]

interface Track {
  pts: XZ[]
  cum: number[]
  ys: number[]
}
interface Train {
  track: Track
  s: number
  dir: 1 | -1
}

const COL = { light: { deck: "#cfccc5", pier: "#bdb9b1", glass: "#4d6a76", roof: "#f4f2ec", body: "#f6f6f2" }, dark: { deck: "#4a4f55", pier: "#3c4146", glass: "#2b3d47", roof: "#5b6067", body: "#d9dbd6" } }

export class ToonRail {
  readonly group = new THREE.Group()
  private tracks: Track[] = []
  private trains: Train[] = []
  private trainMesh: THREE.InstancedMesh | null = null
  private stripeMesh: THREE.InstancedMesh | null = null
  private readonly mats = {
    deck: new THREE.MeshLambertMaterial({ vertexColors: true }),
    pier: new THREE.MeshLambertMaterial({ color: COL.light.pier }),
    glass: new THREE.MeshLambertMaterial({ color: COL.light.glass, emissive: new THREE.Color("#000000") }),
    roof: new THREE.MeshLambertMaterial({ color: COL.light.roof }),
    band: new THREE.MeshLambertMaterial({ color: LINE2, emissive: new THREE.Color(LINE2), emissiveIntensity: 0.15 }),
    body: new THREE.MeshLambertMaterial({ color: COL.light.body }),
    stripe: new THREE.MeshLambertMaterial({ color: LINE2, emissive: new THREE.Color(LINE2), emissiveIntensity: 0.2 }),
  }
  private dark = false
  private last = 0

  build(data: RailData, ground: ToonGround, exag: number) {
    const gy = (x: number, z: number) => groundAt(ground, x, z) * exag
    // 선로: 10m 마다 나누고 지면을 따라 상판 높이(잠실철교 강 위도 땅 + 11.5m)
    for (const l of data.lines) {
      const raw = l.coords.map(([lng, lat]) => lngLatToLocal(lng, lat) as XZ)
      const pts: XZ[] = []
      for (let k = 0; k < raw.length - 1; k++) {
        const [ax, az] = raw[k], [bx, bz] = raw[k + 1]
        const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / STEP))
        for (let j = 0; j < n; j++) pts.push([ax + ((bx - ax) * j) / n, az + ((bz - az) * j) / n])
      }
      pts.push(raw[raw.length - 1])
      // 높이는 둘레 40m 평균 지면으로 부드럽게(지형 잔물결에 상판이 출렁이지 않게)
      const g0 = pts.map(([x, z]) => gy(x, z))
      const ys = g0.map((_, i) => {
        let s = 0, c = 0
        for (let j = Math.max(0, i - 4); j <= Math.min(g0.length - 1, i + 4); j++) {
          s += g0[j]
          c++
        }
        return s / c + DECK_TOP_M
      })
      const cum = [0]
      for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]))
      this.tracks.push({ pts, cum, ys })
    }
    this.buildDeck(gy)
    this.buildStations(data, gy)
    this.buildTrains()
  }

  private buildDeck(gy: (x: number, z: number) => number) {
    const P: number[] = [], N: number[] = [], C: number[] = [], I: number[] = []
    const deck = new THREE.Color(COL.light.deck)
    const band = new THREE.Color(LINE2)
    const quad = (a: number[], b: number[], c: number[], d: number[], n: number[], col: THREE.Color) => {
      const o = P.length / 3
      for (const v of [a, b, c, d]) {
        P.push(...v)
        N.push(...n)
        C.push(col.r, col.g, col.b)
      }
      I.push(o, o + 1, o + 2, o, o + 2, o + 3)
    }
    const piers: THREE.Matrix4[] = []
    for (const t of this.tracks) {
      for (let i = 0; i < t.pts.length - 1; i++) {
        const [ax, az] = t.pts[i], [bx, bz] = t.pts[i + 1]
        const len = Math.hypot(bx - ax, bz - az) || 1
        const nx = -(bz - az) / len, nz = (bx - ax) / len
        const w = DECK_W / 2
        const ya = t.ys[i], yb = t.ys[i + 1]
        const L = (x: number, z: number, s: number, y: number) => [x + nx * w * s, y, z + nz * w * s]
        // 윗면 · 바닥 · 양 옆(위 0.5m 는 초록 띠)
        quad(L(ax, az, -1, ya), L(ax, az, 1, ya), L(bx, bz, 1, yb), L(bx, bz, -1, yb), [0, 1, 0], deck)
        quad(L(ax, az, 1, ya - DECK_T), L(ax, az, -1, ya - DECK_T), L(bx, bz, -1, yb - DECK_T), L(bx, bz, 1, yb - DECK_T), [0, -1, 0], deck)
        for (const s of [-1, 1]) {
          const n = [nx * s, 0, nz * s]
          quad(L(ax, az, s, ya - DECK_T), L(bx, bz, s, yb - DECK_T), L(bx, bz, s, yb - 0.55), L(ax, az, s, ya - 0.55), n, deck)
          quad(L(ax, az, s, ya - 0.55), L(bx, bz, s, yb - 0.55), L(bx, bz, s, yb + 0.6), L(ax, az, s, ya + 0.6), n, band)
        }
      }
      for (let s = PIER_EVERY / 2; s < t.cum[t.cum.length - 1]; s += PIER_EVERY) {
        const { x, z, y, ang } = at(t, s)
        const g = gy(x, z) - 2
        const h = y - DECK_T - g
        if (h < 1) continue
        piers.push(new THREE.Matrix4().compose(new THREE.Vector3(x, g + h / 2, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -ang), new THREE.Vector3(1.6, h, 2.6)))
      }
    }
    const geom = new THREE.BufferGeometry()
    geom.setAttribute("position", new THREE.Float32BufferAttribute(P, 3))
    geom.setAttribute("normal", new THREE.Float32BufferAttribute(N, 3))
    geom.setAttribute("color", new THREE.Float32BufferAttribute(C, 3))
    geom.setIndex(I)
    geom.computeBoundingSphere()
    const mesh = new THREE.Mesh(geom, this.mats.deck)
    mesh.castShadow = mesh.receiveShadow = true
    mesh.frustumCulled = false
    mesh.userData.deck = true
    this.group.add(mesh)
    const pm = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), this.mats.pier, piers.length)
    piers.forEach((m, i) => pm.setMatrixAt(i, m))
    pm.castShadow = pm.receiveShadow = true
    pm.frustumCulled = false
    this.group.add(pm)
  }

  private buildStations(data: RailData, gy: (x: number, z: number) => number) {
    const plats = data.platforms.map((p) => p.coords.map(([lng, lat]) => lngLatToLocal(lng, lat) as XZ))
    for (const s of data.stations) {
      const [sx, sz] = lngLatToLocal(s.lng, s.lat)
      // 가장 가까운 선로 점에서 방향·상판 높이
      let best = { d: Infinity, ang: 0, y: 0, x: sx, z: sz }
      for (const t of this.tracks)
        for (let i = 0; i < t.pts.length - 1; i++) {
          const d = Math.hypot(t.pts[i][0] - sx, t.pts[i][1] - sz)
          if (d < best.d) best = { d, ang: Math.atan2(t.pts[i + 1][1] - t.pts[i][1], t.pts[i + 1][0] - t.pts[i][0]), y: t.ys[i], x: t.pts[i][0], z: t.pts[i][1] }
        }
      if (best.d > 120) continue
      const ux = Math.cos(best.ang), uz = Math.sin(best.ang)
      const vx = -uz, vz = ux
      // 역 점 150m 안 승강장 꼭짓점을 선로 방향 축으로 재 사각형
      let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity
      const cx = best.x, cz = best.z
      for (const ring of plats) {
        if (!ring.some(([x, z]) => Math.hypot(x - sx, z - sz) < 150)) continue
        for (const [x, z] of ring) {
          const u = (x - cx) * ux + (z - cz) * uz, v = (x - cx) * vx + (z - cz) * vz
          u0 = Math.min(u0, u)
          u1 = Math.max(u1, u)
          v0 = Math.min(v0, v)
          v1 = Math.max(v1, v)
        }
      }
      if (!Number.isFinite(u0)) {
        u0 = -100
        u1 = 100
        v0 = -8
        v1 = 8
      }
      u0 -= 4
      u1 += 4
      v0 = Math.min(v0 - 5, -11)
      v1 = Math.max(v1 + 5, 11)
      const mu = (u0 + u1) / 2, mv = (v0 + v1) / 2
      const ox = cx + ux * mu + vx * mv, oz = cz + uz * mu + vz * mv
      const base = best.y - DECK_T - 2.2
      const top = best.y + 8.5
      const rot = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -best.ang)
      const box = (w: number, h: number, d: number, y: number, mat: THREE.Material, inset = 0) => {
        const m = new THREE.Mesh(new THREE.BoxGeometry(w - inset * 2, h, d - inset * 2), mat)
        m.position.set(ox, y, oz)
        m.quaternion.copy(rot)
        m.castShadow = m.receiveShadow = true
        this.group.add(m)
      }
      const L = u1 - u0, W = v1 - v0
      box(L, top - base, W, (base + top) / 2, this.mats.glass, 0.4)
      box(L + 1.2, 1.1, W + 1.2, top + 0.55, this.mats.roof)
      box(L + 0.6, 0.9, W + 0.6, best.y + 1.6, this.mats.band)
      box(L - 2, 0.5, W - 2, top + 1.35, this.mats.roof)
      // 역 몸통 아래 계단·출입 기둥 둘(땅에서 역사까지)
      for (const k of [-0.32, 0.32]) {
        const px = ox + ux * L * k + vx * (W / 2 + 3), pz = oz + uz * L * k + vz * (W / 2 + 3)
        const g = gy(px, pz)
        const m = new THREE.Mesh(new THREE.BoxGeometry(6, base - g + 2, 4.5), this.mats.roof)
        m.position.set(px, (g + base) / 2 - 1, pz)
        m.quaternion.copy(rot)
        m.castShadow = m.receiveShadow = true
        this.group.add(m)
      }
    }
  }

  private buildTrains() {
    for (const t of this.tracks) {
      const len = t.cum[t.cum.length - 1]
      if (len < 1000) continue
      this.trains.push({ track: t, s: (len * ((this.trains.length * 0.37) % 1)) | 0, dir: this.trains.length % 2 ? -1 : 1 })
    }
    const n = this.trains.length * CARS
    if (!n) return
    this.trainMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(CAR_L, 3.4, 3.0), this.mats.body, n)
    this.stripeMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(CAR_L + 0.02, 0.55, 3.04), this.mats.stripe, n)
    for (const m of [this.trainMesh, this.stripeMesh]) {
      m.castShadow = true
      m.frustumCulled = false
      this.group.add(m)
    }
    this.place()
  }

  private place() {
    if (!this.trainMesh || !this.stripeMesh) return
    const m = new THREE.Matrix4()
    const q = new THREE.Quaternion()
    const up = new THREE.Vector3(0, 1, 0)
    let k = 0
    for (const tr of this.trains) {
      for (let c = 0; c < CARS; c++) {
        const s = tr.s - tr.dir * c * (CAR_L + CAR_GAP)
        const p = at(tr.track, s)
        q.setFromAxisAngle(up, -p.ang)
        m.compose(new THREE.Vector3(p.x, p.y + 1.9, p.z), q, new THREE.Vector3(1, 1, 1))
        this.trainMesh.setMatrixAt(k, m)
        m.compose(new THREE.Vector3(p.x, p.y + 1.4, p.z), q, new THREE.Vector3(1, 1, 1))
        this.stripeMesh.setMatrixAt(k, m)
        k++
      }
    }
    this.trainMesh.instanceMatrix.needsUpdate = true
    this.stripeMesh.instanceMatrix.needsUpdate = true
  }

  /** 매 프레임. 전동차가 있으면 true(다시 그리기 필요) */
  frame(): boolean {
    if (!this.trains.length) return false
    const now = performance.now()
    const dt = this.last ? Math.min(0.2, (now - this.last) / 1000) : 0
    this.last = now
    for (const tr of this.trains) {
      const len = tr.track.cum[tr.track.cum.length - 1]
      const train = CARS * (CAR_L + CAR_GAP)
      tr.s += tr.dir * SPEED * dt
      if (tr.s > len) {
        tr.s = len
        tr.dir = -1
      } else if (tr.s < train) {
        tr.s = train
        tr.dir = 1
      }
    }
    this.place()
    return true
  }

  setTheme(dark: boolean) {
    this.dark = dark
    const c = dark ? COL.dark : COL.light
    this.mats.pier.color.set(c.pier)
    this.mats.glass.color.set(c.glass)
    this.mats.glass.emissive.set(dark ? "#ffcf8a" : "#000000")
    this.mats.glass.emissiveIntensity = dark ? 0.35 : 0
    this.mats.roof.color.set(c.roof)
    this.mats.body.color.set(c.body)
    this.mats.deck.color.set(dark ? "#9aa0a6" : "#ffffff")
  }

  dispose() {
    this.group.traverse((o) => {
      const m = o as THREE.Mesh
      if (m.isMesh) m.geometry.dispose()
    })
    for (const m of Object.values(this.mats)) m.dispose()
  }
}

function at(t: Track, s: number): { x: number; z: number; y: number; ang: number } {
  const total = t.cum[t.cum.length - 1]
  const d = Math.max(0, Math.min(total, s))
  let i = 1
  while (i < t.cum.length - 1 && t.cum[i] < d) i++
  const f = (d - t.cum[i - 1]) / Math.max(1e-6, t.cum[i] - t.cum[i - 1])
  const a = t.pts[i - 1], b = t.pts[i]
  return { x: a[0] + (b[0] - a[0]) * f, z: a[1] + (b[1] - a[1]) * f, y: t.ys[i - 1] + (t.ys[i] - t.ys[i - 1]) * f, ang: Math.atan2(b[1] - a[1], b[0] - a[0]) }
}
