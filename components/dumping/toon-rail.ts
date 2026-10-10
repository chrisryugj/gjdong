// /dumping 모형 보기 2호선 고가(26라운드 후속 4, 2026-10-10 사용자: "구의역·건대입구역도 전혀 구현이 안 되어 있네").
// 자료는 scripts/dumping-toon-rail.mjs 가 바탕 타일에서 뽑은 toon-rail.json(고가 선·승강장·역 점).
// 고가교: 선로마다 폭 5.4m 상판(윗면 땅 + 11.5m, 두께 1.8m, 옆면 위쪽에 2호선 초록 띠) + 32m 마다 교각. 복선은 두 선로 상판이 겹쳐 한 판으로 보인다.
// 역사(26라운드 후속 5, 사용자 "역 모델링 똑같이"·위키미디어 공용 건대입구·구의 사진): 상대식 승강장 약 200m 를 덮는 박공 철골 지붕(짙은 금속판 + 가운데
// 채광창 띠, 처마 돌출), 옆면은 아래 타일 띠(1.0~2.2m) 위로 창 띠, 승강장 아래층 대합실(유리·타일 상자 + 기둥), 길로 내려오는 지붕 덮인 출입구.
// 선로 위에는 50m 마다 전차선 문형 지지대. 구의역 대합실은 광진구청 단지(이스트폴 저층부 서쪽 면)와 유리 연결통로로 잇는다(대장 1층 "구의역 연결통로").
// 전동차: 2호선 신형(스테인리스 은색 몸통 + 초록 띠 + 검은 창 띠, 앞면 검은 유리에 초록 테), 19.5m × 10량, 초속 14m 왕복. 움직이면 toon-layer 가 차·사람과 같은 간격으로 다시 그린다
import * as THREE from "three"
import { groundAt, lngLatToLocal, type ToonGround } from "@/lib/dumping/toon-world"
import { LANDMARK_MODELS, landmarkToLocal } from "./toon-landmark"

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
const CAR_L = 19.5
const CAR_GAP = 0.7
const CARS = 10
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

const COL = {
  light: { deck: "#cfccc5", pier: "#bdb9b1", glass: "#4d6a76", roof: "#f4f2ec", body: "#c9ced2", metal: "#4f565e", tile: "#d8c8a4", fascia: "#3b4148", sky: "#e6edf0" },
  dark: { deck: "#4a4f55", pier: "#3c4146", glass: "#2b3d47", roof: "#5b6067", body: "#9ea4a9", metal: "#2f343a", tile: "#6b6252", fascia: "#22262b", sky: "#ffe6b0" },
}

export class ToonRail {
  readonly group = new THREE.Group()
  private tracks: Track[] = []
  private trains: Train[] = []
  private readonly mats = {
    deck: new THREE.MeshLambertMaterial({ vertexColors: true }),
    pier: new THREE.MeshLambertMaterial({ color: COL.light.pier }),
    glass: new THREE.MeshLambertMaterial({ color: COL.light.glass, emissive: new THREE.Color("#000000") }),
    roof: new THREE.MeshLambertMaterial({ color: COL.light.roof }),
    band: new THREE.MeshLambertMaterial({ color: LINE2, emissive: new THREE.Color(LINE2), emissiveIntensity: 0.15 }),
    body: new THREE.MeshLambertMaterial({ color: COL.light.body }),
    stripe: new THREE.MeshLambertMaterial({ color: LINE2, emissive: new THREE.Color(LINE2), emissiveIntensity: 0.2 }),
    win: new THREE.MeshLambertMaterial({ color: "#1d2329", emissive: new THREE.Color("#000000") }),
    metal: new THREE.MeshLambertMaterial({ color: COL.light.metal }),
    tile: new THREE.MeshLambertMaterial({ color: COL.light.tile }),
    fascia: new THREE.MeshLambertMaterial({ color: COL.light.fascia }),
    sky: new THREE.MeshLambertMaterial({ color: COL.light.sky, emissive: new THREE.Color("#ffffff"), emissiveIntensity: 0.15 }),
  }
  private trainMeshes: THREE.InstancedMesh[] = []
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
    // 전차선 문형 지지대: 50m 마다 상판 양 끝 기둥(높이 6.2m) + 가로보(사진: 고가 위 격자 기둥)
    for (const t of this.tracks)
      for (let s = 25; s < t.cum[t.cum.length - 1]; s += 50) {
        const { x, z, y, ang } = at(t, s)
        const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -ang)
        const nx = -Math.sin(ang), nz = Math.cos(ang)
        for (const sg of [-1, 1]) piers.push(new THREE.Matrix4().compose(new THREE.Vector3(x + nx * sg * (DECK_W / 2 - 0.3), y + 3.1, z + nz * sg * (DECK_W / 2 - 0.3)), q, new THREE.Vector3(0.28, 6.2, 0.28)))
        piers.push(new THREE.Matrix4().compose(new THREE.Vector3(x, y + 6.0, z), q, new THREE.Vector3(0.22, 0.3, DECK_W)))
      }
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
      let best = { d: Infinity, ang: 0, y: 0, x: sx, z: sz }
      for (const t of this.tracks)
        for (let i = 0; i < t.pts.length - 1; i++) {
          const d = Math.hypot(t.pts[i][0] - sx, t.pts[i][1] - sz)
          if (d < best.d) best = { d, ang: Math.atan2(t.pts[i + 1][1] - t.pts[i][1], t.pts[i + 1][0] - t.pts[i][0]), y: t.ys[i], x: t.pts[i][0], z: t.pts[i][1] }
        }
      if (best.d > 120) continue
      const ux = Math.cos(best.ang), uz = Math.sin(best.ang)
      const vx = -uz, vz = ux
      const cx = best.x, cz = best.z
      let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity
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
        v0 = -9
        v1 = 9
      }
      // 길이 200m 안팎(10량 승강장), 폭은 승강장 바깥 + 2m, 최소 22m
      const mid = (u0 + u1) / 2
      const L = Math.max(170, Math.min(215, u1 - u0 + 8))
      u0 = mid - L / 2
      u1 = mid + L / 2
      const vm = (v0 + v1) / 2
      const W = Math.max(22, v1 - v0 + 4)
      v0 = vm - W / 2
      v1 = vm + W / 2
      const y = best.y
      const at2 = (u: number, v: number): XZ => [cx + ux * u + vx * v, cz + uz * u + vz * v]
      const rot = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -best.ang)
      const box = (uc: number, vc: number, l: number, w: number, y0: number, y1: number, mat: THREE.Material, shadow = true) => {
        const [x, z] = at2(uc, vc)
        const m = new THREE.Mesh(new THREE.BoxGeometry(l, y1 - y0, w), mat)
        m.position.set(x, (y0 + y1) / 2, z)
        m.quaternion.copy(rot)
        m.castShadow = shadow
        m.receiveShadow = true
        this.group.add(m)
        return m
      }
      // 승강장 바닥판(상판보다 1m 높게, 선로 사이는 상판이 보인다: 양옆 승강장 폭 4m 씩)
      for (const sv of [v0 + 2.6, v1 - 2.6]) box(mid, sv, L, 5.2, y - 0.2, y + 1.0, this.mats.deck)
      // 옆벽: 타일 띠 · 창 띠(유리) · 처마 띠
      for (const sv of [v0 + 0.25, v1 - 0.25]) {
        box(mid, sv, L, 0.5, y + 1.0, y + 2.2, this.mats.tile)
        box(mid, sv, L, 0.3, y + 2.2, y + 4.8, this.mats.glass)
        box(mid, sv, L, 0.6, y + 4.8, y + 5.6, this.mats.fascia)
        // 창 띠 세로 멀리언(5m 마다)
        for (let u = u0 + 5; u < u1; u += 5) box(u, sv, 0.25, 0.42, y + 2.2, y + 4.8, this.mats.fascia, false)
      }
      // 기둥(승강장 가운데 줄, 10m 마다): 지붕을 받친다
      for (const sv of [v0 + 2.6, v1 - 2.6]) for (let u = u0 + 6; u < u1 - 2; u += 10) box(u, sv, 0.45, 0.45, y + 1.0, y + 6.4, this.mats.pier, false)
      // 박공 지붕: 양쪽 경사판(처마 5.6 → 용마루 7.4, 1.2m 돌출) + 가운데 채광창 띠
      const half = W / 2 + 1.2
      const rise = 1.8
      const slope = Math.atan2(rise, half)
      const panelW = Math.hypot(half, rise)
      for (const sgn of [-1, 1]) {
        const [x, z] = at2(mid, vm + sgn * half / 2)
        const g = new THREE.BoxGeometry(L + 2.4, 0.35, panelW)
        const m = new THREE.Mesh(g, this.mats.metal)
        m.position.set(x, y + 5.6 + rise / 2, z)
        m.quaternion.copy(rot).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), sgn * slope))
        m.castShadow = m.receiveShadow = true
        this.group.add(m)
      }
      box(mid, vm, L + 1.6, 3.2, y + 5.6 + rise - 0.05, y + 5.6 + rise + 0.45, this.mats.sky, false)
      // 승강장 아래 대합실(가운데 70m, 상판 아래 6.5m) + 기둥
      const cy1 = y - DECK_T, cy0 = cy1 - 6.2
      box(mid, vm, 70, W - 3, cy0 + 2.2, cy1, this.mats.glass)
      box(mid, vm, 70.4, W - 2.6, cy0 + 1.0, cy0 + 2.2, this.mats.tile)
      box(mid, vm, 70.8, W - 2.2, cy1 - 0.6, cy1, this.mats.fascia)
      for (const [du, dv] of [[-30, -W / 2 + 3], [30, -W / 2 + 3], [-30, W / 2 - 3], [30, W / 2 - 3], [0, -W / 2 + 3], [0, W / 2 - 3]]) {
        const [x, z] = at2(mid + du, vm + dv)
        const g0 = gy(x, z) - 2
        box(mid + du, vm + dv, 1.4, 1.4, g0, cy0 + 1.0, this.mats.pier)
      }
      // 출입구 넷: 대합실 양 끝 양옆에서 길로 내려오는 지붕 덮인 계단(어두운 지붕 + 유리 옆면)
      for (const du of [-31, 31])
        for (const sgn of [-1, 1]) {
          const vEdge = vm + sgn * (W / 2 + 2.2)
          const [x, z] = at2(mid + du, vEdge)
          const g = gy(x, z)
          const h = cy0 + 1.0 - g
          if (h < 2) continue
          const run = h * 1.7
          const along = du > 0 ? 1 : -1
          const [ex, ez] = at2(mid + du + along * run / 2, vEdge)
          const steps = new THREE.Mesh(new THREE.BoxGeometry(Math.hypot(run, h), 0.6, 4.4), this.mats.tile)
          steps.position.set(ex, g + h / 2, ez)
          steps.quaternion.copy(rot).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), -along * Math.atan2(h, run)))
          steps.castShadow = steps.receiveShadow = true
          this.group.add(steps)
          const roof = new THREE.Mesh(new THREE.BoxGeometry(Math.hypot(run, h), 0.3, 5.0), this.mats.fascia)
          roof.position.set(ex, g + h / 2 + 3.2, ez)
          roof.quaternion.copy(steps.quaternion)
          roof.castShadow = true
          this.group.add(roof)
        }
      // 구의역 ↔ 광진구청 단지 연결통로(대합실 높이, 유리 통로 폭 6m)
      if (s.name === "구의") {
        const d = LANDMARK_MODELS.find((m) => m.name === "gucheong")
        if (d) {
          const [tx, tz] = landmarkToLocal(d, -51, 96)
          const vt = (tx - cx) * vx + (tz - cz) * vz
          const ut = (tx - cx) * ux + (tz - cz) * uz
          const sgn = vt >= vm ? 1 : -1
          const [ax, az] = at2(Math.max(u0 + 10, Math.min(u1 - 10, ut)), vm + sgn * (W / 2 - 1.5))
          const len = Math.hypot(tx - ax, tz - az)
          const ang = Math.atan2(tz - az, tx - ax)
          const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -ang)
          const g = (gy(ax, az) + gy(tx, tz)) / 2
          const ly0 = Math.max(g + 5.5, cy0 + 1.0), ly1 = ly0 + 4.2
          const seg = (y0: number, y1: number, w: number, mat: THREE.Material) => {
            const m = new THREE.Mesh(new THREE.BoxGeometry(len, y1 - y0, w), mat)
            m.position.set((ax + tx) / 2, (y0 + y1) / 2, (az + tz) / 2)
            m.quaternion.copy(q)
            m.castShadow = m.receiveShadow = true
            this.group.add(m)
          }
          seg(ly0, ly0 + 0.8, 6.4, this.mats.roof)
          seg(ly0 + 0.8, ly1 - 0.5, 6.0, this.mats.glass)
          seg(ly1 - 0.5, ly1, 6.6, this.mats.roof)
          for (const f of [0.33, 0.66]) {
            const px = ax + (tx - ax) * f, pz = az + (tz - az) * f
            const g0 = gy(px, pz) - 2
            const m = new THREE.Mesh(new THREE.BoxGeometry(1.2, ly0 - g0, 1.2), this.mats.pier)
            m.position.set(px, (g0 + ly0) / 2, pz)
            m.castShadow = true
            this.group.add(m)
          }
        }
      }
    }
  }

  // 전동차 부품: [기하, 재질, 길이 방향 위치(차 가운데 기준 비율), 높이(상판 위 m)]. 앞면(cab)은 편성 양 끝 차의 바깥쪽 끝에만
  private carParts(): { geom: THREE.BufferGeometry; mat: THREE.Material; y: number; cab?: boolean }[] {
    return [
      { geom: new THREE.BoxGeometry(CAR_L, 3.0, 3.1), mat: this.mats.body, y: 2.25 },
      { geom: new THREE.BoxGeometry(CAR_L - 1.2, 0.95, 3.14), mat: this.mats.win, y: 2.75 },
      { geom: new THREE.BoxGeometry(CAR_L + 0.02, 0.32, 3.16), mat: this.mats.stripe, y: 1.95 },
      { geom: new THREE.BoxGeometry(CAR_L * 0.62, 0.45, 2.1), mat: this.mats.pier, y: 3.95 },
      { geom: new THREE.BoxGeometry(1.4, 2.6, 3.18), mat: this.mats.win, y: 2.45, cab: true },
      { geom: new THREE.BoxGeometry(1.5, 0.4, 3.2), mat: this.mats.stripe, y: 3.85, cab: true },
    ]
  }

  private buildTrains() {
    for (const t of this.tracks) {
      const len = t.cum[t.cum.length - 1]
      if (len < 1000) continue
      this.trains.push({ track: t, s: (len * ((this.trains.length * 0.37) % 1) + CARS * (CAR_L + CAR_GAP)) % len, dir: this.trains.length % 2 ? -1 : 1 })
    }
    if (!this.trains.length) return
    this.trainMeshes = this.carParts().map((p) => {
      const n = this.trains.length * (p.cab ? 2 : CARS)
      const m = new THREE.InstancedMesh(p.geom, p.mat, n)
      m.castShadow = true
      m.frustumCulled = false
      m.userData.part = p
      this.group.add(m)
      return m
    })
    this.place()
  }

  private place() {
    if (!this.trainMeshes.length) return
    const m = new THREE.Matrix4()
    const q = new THREE.Quaternion()
    const up = new THREE.Vector3(0, 1, 0)
    const one = new THREE.Vector3(1, 1, 1)
    const counters = this.trainMeshes.map(() => 0)
    for (const tr of this.trains) {
      for (let c = 0; c < CARS; c++) {
        const sc = tr.s - tr.dir * (c * (CAR_L + CAR_GAP) + CAR_L / 2)
        const p = at(tr.track, sc)
        q.setFromAxisAngle(up, -p.ang)
        const ends: number[] = []
        if (c === 0) ends.push(tr.dir)
        if (c === CARS - 1) ends.push(-tr.dir)
        this.trainMeshes.forEach((mesh, k) => {
          const part = mesh.userData.part as { y: number; cab?: boolean }
          if (!part.cab) {
            m.compose(new THREE.Vector3(p.x, p.y + part.y, p.z), q, one)
            mesh.setMatrixAt(counters[k]++, m)
            return
          }
          for (const e of ends) {
            const off = e * (CAR_L / 2 - 0.6)
            m.compose(new THREE.Vector3(p.x + Math.cos(p.ang) * off, p.y + part.y, p.z + Math.sin(p.ang) * off), q, one)
            mesh.setMatrixAt(counters[k]++, m)
          }
        })
      }
    }
    for (const mesh of this.trainMeshes) mesh.instanceMatrix.needsUpdate = true
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
      } else if (tr.s < 0) {
        tr.s = 0
        tr.dir = 1
      }
      // 편성 꼬리가 선로 밖으로 나가지 않게 끝에서 길이만큼 돌아선다
      if (tr.dir === 1 && tr.s < train) tr.s = train
      if (tr.dir === -1 && tr.s > len - train) tr.s = len - train
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
    this.mats.metal.color.set(c.metal)
    this.mats.tile.color.set(c.tile)
    this.mats.fascia.color.set(c.fascia)
    this.mats.sky.color.set(c.sky)
    this.mats.sky.emissiveIntensity = dark ? 0.6 : 0.15
    this.mats.win.emissive.set(dark ? "#ffe2a8" : "#000000")
    this.mats.win.emissiveIntensity = dark ? 0.35 : 0
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
