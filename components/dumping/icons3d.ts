// /dumping 입체 시설 아이콘(18라운드 후속, 2026-09-19). maplibre 커스텀 레이어(renderingMode 3d) 위의 Three.js 장면.
// 시설 종류마다 작은 모델(이동식 CCTV=기둥+머리, 고정 CCTV=기둥+돔, 의류수거함=상자+뚜껑+투입구, 재활용정거장=받침+통 3개, 가로쓰레기통=통+뚜껑),
// 재배치 후보=흰 핀(바늘+구슬) + 머리 위 순위 배지(카메라를 보는 스프라이트, 상위 3은 액센트), 배치추천=반투명 분홍 통.
// 크기는 화면 기준 최소 높이를 지킨다(마커처럼): 조망에서도 점이 아니라 모양이 보이고, 확대하면 실제 크기에 가까워진다.
// 깊이 버퍼를 지도와 공유해 건물·기둥이 아이콘을 자연스럽게 가린다. 모델 공간: x=동, y=위(m), z=남(getMatrixForModel 규약).
// 툴팁은 같은 자리의 투명 fill-extrusion(dumping-map S.infraPosts 등)이 queryRenderedFeatures로 받는다(커스텀 레이어는 조회 불가).
import * as THREE from "three"
import maplibregl, { type CustomLayerInterface, type CustomRenderMethodInput, type Map as MlMap } from "maplibre-gl"
import { INFRA_STYLE, BIN_RECO_COLOR, type RouteChain } from "./map-geo"

export type IconKind = "clothBins" | "cctvFixed" | "cctvMobile" | "recycling" | "bins" | "cand" | "binReco" | "dongRank"
export interface IconPoint {
  lng: number
  lat: number
  rank?: number // 순위(배지). 후보는 핀 머리 위, 동별 기둥은 기둥 꼭대기
  h?: number // 배지를 띄울 높이(m, 지형 위). 없으면 핀 머리 위
  color?: string // 배지 색. 없으면 액센트(후보)
  side?: -1 | 1 // 같은 자리에 배지가 둘일 때(동별 민원·과태료) 좌우로 비킨다
}

const ANCHOR: [number, number] = [127.085, 37.546] // 모델 원점(구 중심). 모든 인스턴스는 여기서의 미터 오프셋
const TARGET_PX = 26 // 아이콘 목표 화면 높이. 이보다 작아지면 확대하되 종류별 maxScale배까지만(조망에서 857개 정거장이 구를 덮었다)
const DENSE_MAX = 4 // 빽빽한 시설의 확대 상한. 후보 핀은 마커처럼 항상 읽히게 상한을 크게
const BADGE_PX = 24
const DONG_BADGE_PX = 30 // 동별 기둥 꼭대기 순위 배지(1~3위)는 조금 크게
const COIN_SPIN = 0.9 // 배지 동전 회전(라디안/초). 어느 방향에서 봐도 숫자가 돌아온다
const TRUCK_PX = 26 // 청소차 목표 화면 길이
const TRUCK_MAX_SCALE = 10
const TRUCK_SPEED = 9 // m/s(약 32km/h)
const APPEAR_MS = 650
const LAT0 = 37.546
const metersPerPixel = (z: number) => (156543.03392 * Math.cos((LAT0 * Math.PI) / 180)) / Math.pow(2, z)
const easeOutBack = (t: number) => 1 + 2.2 * Math.pow(t - 1, 3) + 1.2 * Math.pow(t - 1, 2)

interface Part {
  geom: THREE.BufferGeometry
  mat: THREE.Material
  local: THREE.Matrix4
}
interface KindDef {
  height: number // 모델 높이(m). 화면 크기 계산 기준
  maxScale: number // 화면 크기 유지를 위한 확대 상한(배)
  parts: Part[]
}

const lambert = (color: string, extra: Partial<THREE.MeshLambertMaterialParameters> = {}) => new THREE.MeshLambertMaterial({ color, ...extra })
const at = (x: number, y: number, z: number, rx = 0) => new THREE.Matrix4().makeTranslation(x, y, z).multiply(new THREE.Matrix4().makeRotationX(rx))
const pole = (r: number, h: number, color: string): Part => ({ geom: new THREE.CylinderGeometry(r, r * 1.15, h, 10), mat: lambert(color), local: at(0, h / 2, 0) })
const plate = (r: number, color: string): Part => ({ geom: new THREE.CylinderGeometry(r, r, 0.35, 14), mat: lambert(color), local: at(0, 0.17, 0) })

// 모델은 만들 때 한 번. 종류마다 높이 10~12m 언저리(화면 크기 계산이 같은 기준을 쓰게)
function buildDefs(): Record<IconKind, KindDef> {
  const mobile = INFRA_STYLE.cctvMobile.color
  const fixed = INFRA_STYLE.cctvFixed.color
  const cloth = INFRA_STYLE.clothBins.color
  const recy = INFRA_STYLE.recycling.color
  const bin = INFRA_STYLE.bins.color
  const dark = "#262626"
  // 핀은 앰버 램버트 + 약한 자체발광(물리 재질은 환경맵이 없어 검게 나왔다, 실측). 테마 액센트(setTheme에서 색 갱신)
  const pin = lambert("#c0741a", { emissive: new THREE.Color("#c0741a"), emissiveIntensity: 0.22 })
  return {
    cctvMobile: {
      height: 12.6,
      maxScale: DENSE_MAX,
      parts: [
        plate(1.4, dark),
        pole(0.42, 11, mobile),
        // 머리: 앞으로 살짝 숙인 상자 + 렌즈
        { geom: new THREE.BoxGeometry(3.0, 1.4, 1.4), mat: lambert(mobile), local: at(0, 11.6, -0.6, -0.35) },
        { geom: new THREE.CylinderGeometry(0.42, 0.42, 0.7, 10), mat: lambert(dark), local: new THREE.Matrix4().makeTranslation(0, 11.1, -2.1).multiply(new THREE.Matrix4().makeRotationX(Math.PI / 2 - 0.35)) },
      ],
    },
    cctvFixed: {
      height: 11.5,
      maxScale: DENSE_MAX,
      parts: [plate(1.4, dark), pole(0.42, 10, fixed), { geom: new THREE.SphereGeometry(1.3, 14, 10), mat: lambert(fixed), local: at(0, 10.4, 0) }],
    },
    clothBins: {
      height: 11,
      maxScale: DENSE_MAX,
      parts: [
        { geom: new THREE.BoxGeometry(5.2, 8.4, 4.0), mat: lambert(cloth), local: at(0, 4.2, 0) },
        { geom: new THREE.BoxGeometry(5.9, 1.2, 4.7), mat: lambert("#0a5d70"), local: at(0, 9.0, 0) },
        { geom: new THREE.BoxGeometry(3.4, 0.9, 0.5), mat: lambert(dark), local: at(0, 6.4, -2.05) },
      ],
    },
    recycling: {
      height: 8,
      maxScale: DENSE_MAX,
      parts: [
        { geom: new THREE.BoxGeometry(11, 1.0, 7), mat: lambert("#6b7280"), local: at(0, 0.5, 0) },
        { geom: new THREE.CylinderGeometry(1.7, 1.5, 5.4, 12), mat: lambert(recy), local: at(-3.4, 3.7, 0) },
        { geom: new THREE.CylinderGeometry(1.7, 1.5, 5.4, 12), mat: lambert("#10b981"), local: at(0, 3.7, 0) },
        { geom: new THREE.CylinderGeometry(1.7, 1.5, 5.4, 12), mat: lambert("#047857"), local: at(3.4, 3.7, 0) },
      ],
    },
    bins: {
      height: 8,
      maxScale: DENSE_MAX,
      parts: [
        { geom: new THREE.CylinderGeometry(2.1, 1.9, 6.4, 14), mat: lambert(bin), local: at(0, 3.2, 0) },
        { geom: new THREE.CylinderGeometry(2.4, 2.4, 0.9, 14), mat: lambert("#1f2937"), local: at(0, 6.85, 0) },
      ],
    },
    // 재배치 후보: 앰버 핀(액센트). 바늘(끝이 땅) + 구슬. 순위 배지(흰 원+앰버 숫자, 상위 3은 앰버 채움)는 스프라이트로 따로
    cand: {
      height: 14,
      maxScale: 60,
      parts: [
        { geom: new THREE.ConeGeometry(1.5, 8, 16), mat: pin, local: new THREE.Matrix4().makeTranslation(0, 4, 0).multiply(new THREE.Matrix4().makeRotationX(Math.PI)) },
        { geom: new THREE.SphereGeometry(2.6, 18, 14), mat: pin, local: at(0, 9.6, 0) },
      ],
    },
    // 동별 기둥 1~3위 배지: 모델 없이 스프라이트만(기둥은 fill-extrusion이 그린다)
    dongRank: { height: 1, maxScale: 1, parts: [] },
    binReco: {
      height: 8,
      maxScale: DENSE_MAX,
      parts: [
        { geom: new THREE.CylinderGeometry(2.1, 1.9, 6.4, 14), mat: lambert(BIN_RECO_COLOR, { transparent: true, opacity: 0.55 }), local: at(0, 3.2, 0) },
        { geom: new THREE.CylinderGeometry(2.4, 2.4, 0.9, 14), mat: lambert(BIN_RECO_COLOR, { transparent: true, opacity: 0.75 }), local: at(0, 6.85, 0) },
      ],
    },
  }
}

interface KindState {
  points: IconPoint[]
  pos: { x: number; z: number; y: number }[] // 원점 기준 미터. y는 지형 고도
  meshes: THREE.InstancedMesh[]
  coins: THREE.Group[] // 순위 배지 동전(앞뒤에 숫자, 세로축으로 천천히 돈다)
  appearAt: number
  elevated: boolean // 지형 고도를 한 번이라도 받았나
}
interface Truck {
  chain: RouteChain
  cum: number[] // 꼭짓점까지 누적 거리(m)
  pts: { x: number; z: number }[]
  dist: number
  dir: 1 | -1
}
// 청소차 모델(길이 7m, 앞이 +x): 앰버 적재함(종이 지도에 안 묻힌다) + 잉크 운전석 + 흰 경광등 + 바퀴
const TRUCK_LEN = 7
const TRUCK_PARTS: Part[] = [
  { geom: new THREE.BoxGeometry(4.4, 2.4, 2.3), mat: new THREE.MeshLambertMaterial({ color: "#c0741a" }), local: at(-1.1, 1.9, 0) },
  { geom: new THREE.BoxGeometry(2.0, 2.0, 2.3), mat: new THREE.MeshLambertMaterial({ color: "#1c1a15" }), local: at(2.2, 1.7, 0) },
  { geom: new THREE.BoxGeometry(0.8, 0.4, 1.2), mat: new THREE.MeshLambertMaterial({ color: "#fbf9f3", emissive: new THREE.Color("#fbf9f3"), emissiveIntensity: 0.7 }), local: at(2.2, 2.9, 0) },
  { geom: new THREE.CylinderGeometry(0.55, 0.55, 2.5, 10).rotateX(Math.PI / 2), mat: new THREE.MeshLambertMaterial({ color: "#262626" }), local: at(2.0, 0.55, 0) },
  { geom: new THREE.CylinderGeometry(0.55, 0.55, 2.5, 10).rotateX(Math.PI / 2), mat: new THREE.MeshLambertMaterial({ color: "#262626" }), local: at(-2.0, 0.55, 0) },
]
// 동전(반지름 1, 두께 0.16): 옆면 고리(축을 눕힌 원통) + 앞뒤 숫자 면(평면, 뒷면은 돌려 붙인다). 원통 뚜껑에 텍스처를 얹으면 숫자가 옆으로 누웠다(실측)
const COIN_RIM = new THREE.CylinderGeometry(1, 1, 0.16, 40, 1, true).rotateX(Math.PI / 2)
const COIN_FACE = new THREE.CircleGeometry(1, 40)
function makeCoin(tex: THREE.Texture, rimColor: string): THREE.Group {
  const g = new THREE.Group()
  const rim = new THREE.Mesh(COIN_RIM, new THREE.MeshLambertMaterial({ color: rimColor, depthTest: false, depthWrite: false }))
  const faceMat = new THREE.MeshBasicMaterial({ map: tex, depthTest: false, depthWrite: false, transparent: true })
  const front = new THREE.Mesh(COIN_FACE, faceMat)
  front.position.z = 0.081
  const back = new THREE.Mesh(COIN_FACE, faceMat)
  back.position.z = -0.081
  back.rotation.y = Math.PI
  for (const m of [rim, front, back]) m.renderOrder = 10
  g.add(rim, front, back)
  return g
}

// 순위 배지 텍스처(흰 원 + 액센트 링 + 잉크 숫자, 상위 3은 액센트 채움 + 흰 숫자)
const badgeCache = new Map<string, THREE.CanvasTexture>()
function badgeTexture(rank: number, accent: string): THREE.CanvasTexture {
  const key = `${rank}:${accent}`
  const hit = badgeCache.get(key)
  if (hit) return hit
  const size = 96
  const c = document.createElement("canvas")
  c.width = size
  c.height = size
  const ctx = c.getContext("2d")!
  const top = rank <= 3
  ctx.beginPath()
  ctx.arc(size / 2, size / 2, size / 2 - 6, 0, Math.PI * 2)
  ctx.fillStyle = top ? accent : "#ffffff"
  ctx.fill()
  ctx.lineWidth = 6
  ctx.strokeStyle = top ? "#ffffff" : accent
  ctx.stroke()
  ctx.fillStyle = top ? "#ffffff" : accent
  ctx.font = `700 ${rank >= 10 ? 44 : 50}px "IBM Plex Sans KR", "Apple SD Gothic Neo", sans-serif`
  ctx.textAlign = "center"
  ctx.textBaseline = "middle"
  ctx.fillText(String(rank), size / 2, size / 2 + 2)
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  badgeCache.set(key, tex)
  return tex
}

export class Icons3DLayer implements CustomLayerInterface {
  id = "dump-icons3d"
  type = "custom" as const
  renderingMode = "3d" as const
  visible = true
  private map: MlMap | null = null
  private renderer: THREE.WebGLRenderer | null = null
  private scene = new THREE.Scene()
  private camera = new THREE.Camera()
  private defs: Record<IconKind, KindDef> | null = null
  private kinds = new Map<IconKind, KindState>()
  private lastZoom = -1
  private lastTick = 0
  private trucks: Truck[] = []
  private truckMeshes: THREE.InstancedMesh[] = []
  private accent = "#c0741a"
  private anchor = maplibregl.MercatorCoordinate.fromLngLat(ANCHOR, 0)
  private scale = this.anchor.meterInMercatorCoordinateUnits()

  constructor() {
    const hemi = new THREE.HemisphereLight(0xffffff, 0x8f8a7c, 1.1)
    const sun = new THREE.DirectionalLight(0xffffff, 1.4)
    sun.position.set(0.5, 1, 0.7)
    this.scene.add(hemi, sun)
  }

  onAdd(map: MlMap, gl: WebGLRenderingContext | WebGL2RenderingContext) {
    this.map = map
    if (!this.renderer) {
      this.renderer = new THREE.WebGLRenderer({ canvas: map.getCanvas(), context: gl, antialias: true })
      this.renderer.autoClear = false
    }
    if (!this.defs) this.defs = buildDefs()
    // 이미 받은 점이 있으면(스타일 교체 뒤 재추가) 다시 세운다
    for (const [kind, st] of this.kinds) this.rebuild(kind, st.points, false)
  }

  onRemove() {
    // 스타일 교체 시 잠깐 떼었다 붙는다. 렌더러·모델은 유지
    this.map = null
  }

  setTheme(dark: boolean) {
    this.accent = dark ? "#e39a3f" : "#c0741a"
    const pin = this.defs?.cand.parts[0].mat as THREE.MeshLambertMaterial | undefined
    if (pin) {
      pin.color.set(this.accent)
      pin.emissive.set(this.accent)
    }
    const st = this.kinds.get("cand")
    if (st)
      st.coins.forEach((c, i) => {
        const rank = st.points[i].rank ?? i + 1
        const [rim, front] = c.children as THREE.Mesh[]
        ;(front.material as THREE.MeshBasicMaterial).map = badgeTexture(rank, this.accent)
        if (rank > 3) (rim.material as THREE.MeshLambertMaterial).color.set(this.accent)
      })
    this.map?.triggerRepaint()
  }

  setVisible(v: boolean) {
    this.visible = v
    this.map?.triggerRepaint()
  }

  /** 종류의 점 전체를 바꾼다. 빈 배열이면 치운다. 새로 놓인 아이콘은 솟아오르며 나타난다 */
  setPoints(kind: IconKind, points: IconPoint[]) {
    this.rebuild(kind, points, true)
  }

  /** 지형 타일이 늦게 오면 고도가 비어 있다. idle마다 불러 채운다 */
  refreshElevation() {
    const map = this.map
    if (!map) return
    let changed = false
    for (const st of this.kinds.values()) {
      if (st.elevated) continue
      let ok = true
      st.points.forEach((p, i) => {
        const e = map.queryTerrainElevation([p.lng, p.lat])
        if (e == null) ok = false
        else if (Math.abs(e - st.pos[i].y) > 0.01) {
          st.pos[i].y = e
          changed = true
        }
      })
      st.elevated = ok
    }
    if (changed) {
      this.lastZoom = -1
      map.triggerRepaint()
    }
  }

  private rebuild(kind: IconKind, points: IconPoint[], animate: boolean) {
    const defs = this.defs
    const map = this.map
    if (!defs || !map) {
      // 아직 지도에 안 붙었으면 점만 기억해 둔다
      const prev = this.kinds.get(kind)
      this.kinds.set(kind, { points, pos: [], meshes: prev?.meshes ?? [], coins: prev?.coins ?? [], appearAt: 0, elevated: false })
      return
    }
    const prev = this.kinds.get(kind)
    if (prev) {
      for (const m of prev.meshes) this.scene.remove(m)
      for (const c of prev.coins) {
        this.scene.remove(c)
        c.traverse((o) => {
          if (o instanceof THREE.Mesh) (o.material as THREE.Material).dispose()
        })
      }
    }
    if (!points.length) {
      this.kinds.set(kind, { points: [], pos: [], meshes: [], coins: [], appearAt: 0, elevated: true })
      map.triggerRepaint()
      return
    }
    const pos = points.map((p) => {
      const mc = maplibregl.MercatorCoordinate.fromLngLat([p.lng, p.lat], 0)
      return { x: (mc.x - this.anchor.x) / this.scale, z: (mc.y - this.anchor.y) / this.scale, y: map.queryTerrainElevation([p.lng, p.lat]) ?? 0 }
    })
    const def = defs[kind]
    const meshes = def.parts.map((part) => {
      const mesh = new THREE.InstancedMesh(part.geom, part.mat, points.length)
      mesh.frustumCulled = false
      this.scene.add(mesh)
      return mesh
    })
    const coins: THREE.Group[] = []
    if (kind === "cand" || kind === "dongRank") {
      points.forEach((p, i) => {
        // 배지는 3D 동전: 앞뒤 면에 숫자, 옆면은 배지 색(상위 3은 흰 테). 깊이 검사를 안 해 건물 뒤에서도 읽힌다
        const rank = p.rank ?? i + 1
        const color = p.color ?? this.accent
        const coin = makeCoin(badgeTexture(rank, color), rank <= 3 ? "#ffffff" : color)
        coins.push(coin)
        this.scene.add(coin)
      })
    }
    this.kinds.set(kind, { points, pos, meshes, coins, appearAt: animate ? performance.now() : 0, elevated: false })
    this.lastZoom = -1
    map.triggerRepaint()
  }

  // 줌(화면 크기)·등장 진행·회전에 맞춰 행렬을 다시 쓴다. 동전·트럭이 있으면 매 프레임
  private updateMatrices(now: number): boolean {
    const map = this.map
    const defs = this.defs
    if (!map || !defs) return false
    const zoom = map.getZoom()
    const mpp = metersPerPixel(zoom)
    const spin = (now / 1000) * COIN_SPIN
    let animating = false
    const tmp = new THREE.Matrix4()
    const sc = new THREE.Matrix4()
    for (const [kind, st] of this.kinds) {
      if (!st.meshes.length && !st.coins.length) continue
      const def = defs[kind]
      const appearing = st.appearAt > 0 && now - st.appearAt < APPEAR_MS
      const zoomChanged = Math.abs(zoom - this.lastZoom) >= 0.01
      animating ||= appearing || st.coins.length > 0
      const k = Math.min(def.maxScale, Math.max(1, (TARGET_PX * mpp) / def.height))
      const a = appearing ? easeOutBack(Math.min(1, (now - st.appearAt) / APPEAR_MS)) : 1
      if (st.meshes.length && (appearing || zoomChanged)) {
        st.pos.forEach((p, i) => {
          sc.makeScale(k * a, k * a, k * a)
          st.meshes.forEach((mesh, j) => {
            tmp.makeTranslation(p.x, p.y, p.z).multiply(sc).multiply(def.parts[j].local)
            mesh.setMatrixAt(i, tmp)
          })
        })
        for (const mesh of st.meshes) mesh.instanceMatrix.needsUpdate = true
      }
      st.pos.forEach((p, i) => {
        const coin = st.coins[i]
        if (!coin) return
        const pt = st.points[i]
        const r = ((pt.h != null ? DONG_BADGE_PX : BADGE_PX) * mpp * a) / 2
        // 같은 자리 배지 둘(민원·과태료)은 좌우로 반지름 1.1배 비킨다
        coin.position.set(p.x + (pt.side ?? 0) * r * 1.1, p.y + (pt.h ?? 12.4 * k * a) + r, p.z)
        coin.scale.set(r, r, r)
        coin.rotation.y = spin + i * 0.7
      })
      if (!appearing) st.appearAt = 0
    }
    // 청소차: 체인 위를 등속으로. 방향은 진행 방향
    if (this.trucks.length && this.truckMeshes.length) {
      const dt = this.lastTick ? Math.min(0.1, (now - this.lastTick) / 1000) : 0
      const kt = Math.min(TRUCK_MAX_SCALE, Math.max(1, (TRUCK_PX * mpp) / TRUCK_LEN))
      this.trucks.forEach((t, i) => {
        const total = t.cum[t.cum.length - 1]
        t.dist += t.dir * TRUCK_SPEED * dt
        if (t.dist >= total) {
          t.dist = total
          t.dir = -1
        } else if (t.dist <= 0) {
          t.dist = 0
          t.dir = 1
        }
        let j = 1
        while (j < t.cum.length - 1 && t.cum[j] < t.dist) j++
        const f = (t.dist - t.cum[j - 1]) / Math.max(1e-6, t.cum[j] - t.cum[j - 1])
        const A = t.pts[j - 1]
        const B = t.pts[j]
        const x = A.x + (B.x - A.x) * f
        const z = A.z + (B.z - A.z) * f
        const heading = Math.atan2((B.z - A.z) * t.dir, (B.x - A.x) * t.dir)
        const y = map.queryTerrainElevation([t.chain.coords[j - 1][0], t.chain.coords[j - 1][1]]) ?? 0
        sc.makeScale(kt, kt, kt)
        const rot = new THREE.Matrix4().makeRotationY(-heading)
        this.truckMeshes.forEach((mesh, m) => {
          tmp.makeTranslation(x, y, z).multiply(rot).multiply(sc).multiply(TRUCK_PARTS[m].local)
          mesh.setMatrixAt(i, tmp)
        })
      })
      for (const mesh of this.truckMeshes) mesh.instanceMatrix.needsUpdate = true
      animating = true
    }
    this.lastTick = now
    this.lastZoom = zoom
    return animating
  }

  /** 청소차 노선(map-geo routeChains). 긴 체인은 2대, 짧은 체인은 1대. 빈 배열이면 치운다 */
  setTrucks(chains: RouteChain[]) {
    for (const m of this.truckMeshes) this.scene.remove(m)
    this.truckMeshes = []
    this.trucks = []
    if (!chains.length || !this.map) {
      this.map?.triggerRepaint()
      return
    }
    for (const chain of chains) {
      const pts = chain.coords.map(([lng, lat]) => {
        const mc = maplibregl.MercatorCoordinate.fromLngLat([lng, lat], 0)
        return { x: (mc.x - this.anchor.x) / this.scale, z: (mc.y - this.anchor.y) / this.scale }
      })
      const cum = [0]
      for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z))
      const n = chain.meters > 2500 ? 2 : 1
      for (let t = 0; t < n; t++) this.trucks.push({ chain, cum, pts, dist: (cum[cum.length - 1] * (t + 0.35)) / n, dir: t % 2 ? -1 : 1 })
    }
    this.truckMeshes = TRUCK_PARTS.map((part) => {
      const mesh = new THREE.InstancedMesh(part.geom, part.mat, this.trucks.length)
      mesh.frustumCulled = false
      this.scene.add(mesh)
      return mesh
    })
    this.lastTick = 0
    this.map.triggerRepaint()
  }

  render(_gl: WebGLRenderingContext | WebGL2RenderingContext, args: CustomRenderMethodInput) {
    const map = this.map
    if (!map || !this.renderer || !this.visible) return
    const animating = this.updateMatrices(performance.now())
    const model = (map as unknown as { transform: { getMatrixForModel: (l: [number, number], alt?: number) => Float64Array | number[] } }).transform.getMatrixForModel(ANCHOR, 0)
    const proj = new THREE.Matrix4().fromArray(Array.from(args.defaultProjectionData.mainMatrix as unknown as ArrayLike<number>))
    this.camera.projectionMatrix = proj.multiply(new THREE.Matrix4().fromArray(Array.from(model)))
    this.renderer.resetState()
    this.renderer.render(this.scene, this.camera)
    if (animating) map.triggerRepaint()
  }
}
