// /dumping 입체 시설 아이콘(18라운드 후속, 2026-09-19). maplibre 커스텀 레이어(renderingMode 3d) 위의 Three.js 장면.
// 시설 종류마다 작은 모델(이동식 CCTV=기둥+머리, 고정 CCTV=기둥+돔, 의류수거함=상자+뚜껑+투입구, 재활용정거장=받침+통 3개, 가로쓰레기통=통+뚜껑),
// 재배치 후보=흰 핀(바늘+구슬) + 머리 위 순위 배지(카메라를 보는 스프라이트, 상위 3은 액센트), 배치추천=반투명 분홍 통.
// 크기는 화면 기준 최소 높이를 지킨다(마커처럼): 조망에서도 점이 아니라 모양이 보이고, 확대하면 실제 크기에 가까워진다.
// 깊이 버퍼를 지도와 공유해 건물·기둥이 아이콘을 자연스럽게 가린다. 모델 공간: x=동, y=위(m), z=남(getMatrixForModel 규약).
// 툴팁은 같은 자리의 투명 fill-extrusion(dumping-map S.infraPosts 등)이 queryRenderedFeatures로 받는다(커스텀 레이어는 조회 불가).
import * as THREE from "three"
import maplibregl, { type CustomLayerInterface, type CustomRenderMethodInput, type Map as MlMap } from "maplibre-gl"
import { INFRA_STYLE, BIN_RECO_COLOR } from "./map-geo"

export type IconKind = "clothBins" | "cctvFixed" | "cctvMobile" | "recycling" | "bins" | "cand" | "binReco" | "dongRank"
export interface IconPoint {
  lng: number
  lat: number
  rank?: number // 순위(배지). 후보는 핀 머리 위, 동별 기둥은 기둥 꼭대기
  h?: number // 배지를 띄울 높이(m, 지형 위). 없으면 핀 머리 위
  color?: string // 배지 색. 없으면 액센트(후보)
}

const ANCHOR: [number, number] = [127.085, 37.546] // 모델 원점(구 중심). 모든 인스턴스는 여기서의 미터 오프셋
const TARGET_PX = 26 // 아이콘 목표 화면 높이. 이보다 작아지면 확대하되 종류별 maxScale배까지만(조망에서 857개 정거장이 구를 덮었다)
const DENSE_MAX = 4 // 빽빽한 시설의 확대 상한. 후보 핀은 마커처럼 항상 읽히게 상한을 크게
const BADGE_PX = 24
const DONG_BADGE_PX = 30 // 동별 기둥 꼭대기 순위 배지(1~3위)는 조금 크게
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
  sprites: THREE.Sprite[]
  appearAt: number
  elevated: boolean // 지형 고도를 한 번이라도 받았나
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
    if (st) st.sprites.forEach((sp, i) => ((sp.material as THREE.SpriteMaterial).map = badgeTexture(st.points[i].rank ?? i + 1, this.accent)))
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
      this.kinds.set(kind, { points, pos: [], meshes: prev?.meshes ?? [], sprites: prev?.sprites ?? [], appearAt: 0, elevated: false })
      return
    }
    const prev = this.kinds.get(kind)
    if (prev) {
      for (const m of prev.meshes) this.scene.remove(m)
      for (const s of prev.sprites) {
        this.scene.remove(s)
        s.material.dispose()
      }
    }
    if (!points.length) {
      this.kinds.set(kind, { points: [], pos: [], meshes: [], sprites: [], appearAt: 0, elevated: true })
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
    const sprites: THREE.Sprite[] = []
    if (kind === "cand" || kind === "dongRank") {
      points.forEach((p, i) => {
        // 배지는 구슬(또는 기둥) 위에 떠 있고 깊이 검사를 안 한다(라벨처럼 건물 뒤에서도 읽힌다)
        const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: badgeTexture(p.rank ?? i + 1, p.color ?? this.accent), depthTest: false, depthWrite: false }))
        sp.center.set(0.5, 0.02)
        sp.renderOrder = 10
        sprites.push(sp)
        this.scene.add(sp)
      })
    }
    this.kinds.set(kind, { points, pos, meshes, sprites, appearAt: animate ? performance.now() : 0, elevated: false })
    this.lastZoom = -1
    map.triggerRepaint()
  }

  // 줌(화면 크기)·등장 진행에 맞춰 인스턴스 행렬을 다시 쓴다
  private updateMatrices(now: number): boolean {
    const map = this.map
    const defs = this.defs
    if (!map || !defs) return false
    const zoom = map.getZoom()
    const mpp = metersPerPixel(zoom)
    let animating = false
    for (const [kind, st] of this.kinds) {
      if (!st.meshes.length && !st.sprites.length) continue
      const def = defs[kind]
      const appearing = st.appearAt > 0 && now - st.appearAt < APPEAR_MS
      if (!appearing && Math.abs(zoom - this.lastZoom) < 0.01) continue
      animating ||= appearing
      // 화면 최소 높이 유지(상한 maxScale배). 시설은 조망(약 10m/px)에선 4~5px 점, 줌 15.5(2.3m/px)에서 26px, 줌 17부터 실물 크기. 후보 핀은 항상 26px 이상
      const k = Math.min(def.maxScale, Math.max(1, (TARGET_PX * mpp) / def.height))
      const a = appearing ? easeOutBack(Math.min(1, (now - st.appearAt) / APPEAR_MS)) : 1
      const tmp = new THREE.Matrix4()
      const s = new THREE.Matrix4()
      st.pos.forEach((p, i) => {
        const pt = st.points[i]
        s.makeScale(k * a, k * a, k * a)
        st.meshes.forEach((mesh, j) => {
          tmp.makeTranslation(p.x, p.y, p.z).multiply(s).multiply(def.parts[j].local)
          mesh.setMatrixAt(i, tmp)
        })
        const sp = st.sprites[i]
        if (sp) {
          const badge = (pt.h != null ? DONG_BADGE_PX : BADGE_PX) * mpp
          sp.position.set(p.x, p.y + (pt.h ?? 12.4 * k * a), p.z) // 기둥 꼭대기 또는 구슬(중심 9.6, 반지름 2.6) 꼭대기
          sp.scale.set(badge * a, badge * a, 1)
        }
      })
      for (const mesh of st.meshes) mesh.instanceMatrix.needsUpdate = true
      if (!appearing) st.appearAt = 0
    }
    this.lastZoom = zoom
    return animating
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
