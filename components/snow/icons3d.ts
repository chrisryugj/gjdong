// /snow 입체 정보 핀(3라운드 2026-09-20). /dumping icons3d.ts(18라운드 후속)를 복사해 모델만 바꿨다. dumping 파일 수정 0.
// maplibre 커스텀 레이어(renderingMode 3d) 위의 Three.js 장면. 입체 보기에서 평면 원 대신 모델이 선다:
//   제설함=각진 상자(경사 뚜껑) 청회 · 염화칼슘보관함=원통(뚜껑) 청빙 · 모래주머니=납작한 포대 2단(주민센터는 3단) 모래색 · 초등학교=깃대+흰 깃발(받침은 150m 안 열선 유무 색)
//   열선 위치=발광 구슬(줌 14.2 아래에서만, 구 전체에서 55곳이 보이게) · 선형 미확인 결빙구간 끝점=땅에 누운 진홍 고리 · 열선 없는 취약구간·결빙구간 번호=입체 숫자(진홍) · 동별 기둥 1~3위=입체 숫자(기둥 색)
// 크기는 화면 기준 최소 높이를 지킨다(마커처럼): 조망에서도 점이 아니라 모양이 보이고, 확대하면 실제 크기에 가까워진다. 빽빽한 자재는 확대 상한을 둔다(383개가 구를 덮지 않게).
// 깊이 버퍼를 지도와 공유해 건물·기둥이 아이콘을 가린다. 모델 공간: x=동, y=위(m), z=남(getMatrixForModel 규약). 지형은 안 켜므로 y=0.
// 툴팁은 같은 자리의 투명 fill-extrusion(snow-map S.posts)이 queryRenderedFeatures로 받는다(커스텀 레이어는 조회 불가).
// ★MeshPhysicalMaterial은 환경맵 없이 검게 나온다(dumping 실측) → Lambert+emissive
import * as THREE from "three"
import { Font } from "three/examples/jsm/loaders/FontLoader.js"
import { TextGeometry } from "three/examples/jsm/geometries/TextGeometry.js"
import digitFont from "@/components/dumping/digit-font.json"
import maplibregl, { type CustomLayerInterface, type CustomRenderMethodInput, type Map as MlMap } from "maplibre-gl"
import { RESOURCES, RISK } from "@/lib/snow/labels"

export type IconKind = "salt" | "cacl" | "sand" | "sandCenter" | "school" | "schoolGap" | "heat" | "iceEnd" | "weakBadge" | "iceBadge" | "dongRank"
export interface IconPoint {
  lng: number
  lat: number
  rank?: number // 배지 숫자(취약구간 번호·결빙 번호·동별 순위)
  h?: number // 배지를 띄울 높이(m). 동별 기둥 꼭대기
  color?: string // 배지 색. 없으면 종류 기본색
}

const ANCHOR: [number, number] = [127.085, 37.546] // 모델 원점(구 중심). 모든 인스턴스는 여기서의 미터 오프셋
const TARGET_PX = 22 // 아이콘 목표 화면 높이
const DENSE_MAX = 6 // 빽빽한 자재의 확대 상한(배). 조망(줌 13.2, 13m/px)에서 26m≈2px 점, 줌 16(1.3m/px)에서 17m≈13px 모양(28m 원통이 동네를 덮던 실측 뒤 조정)
const DENSE_PX = 13 // 자재 목표 화면 높이
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
  hideAboveZoom?: number // 이 줌보다 확대하면 숨긴다(열선 구슬: 줌 14.2부터 선이 대신한다)
  showFromZoom?: number // 이 줌부터 보인다(취약구간 번호: 구 전체에서는 선만)
  targetPx?: number // 종류별 목표 화면 높이(기본 TARGET_PX). 열선 구슬은 작게(55개가 구를 덮지 않게)
}

const lambert = (color: string, extra: Partial<THREE.MeshLambertMaterialParameters> = {}) => new THREE.MeshLambertMaterial({ color, ...extra })
const at = (x: number, y: number, z: number, rx = 0, rz = 0) => new THREE.Matrix4().makeTranslation(x, y, z).multiply(new THREE.Matrix4().makeRotationX(rx)).multiply(new THREE.Matrix4().makeRotationZ(rz))
const INK = "#1c2228"
const PAPER = "#ece7dc"
const res = (id: (typeof RESOURCES)[number]["id"], dark: boolean) => {
  const r = RESOURCES.find((x) => x.id === id)!
  return dark ? r.color : r.colorLight
}

// 모델은 만들 때 한 번. 종류마다 높이 4~7m(실물 크기 언저리. 화면 크기 계산이 같은 기준을 쓰게)
function buildDefs(dark: boolean): Record<IconKind, KindDef> {
  const salt = res("salt", dark)
  const cacl = res("cacl", dark)
  const sand = res("sand", dark)
  const heat = res("heat", dark)
  const risk = dark ? RISK.weak.color : RISK.weak.colorLight
  const lidDark = dark ? "#5c6d86" : "#2b3748"
  const capDark = dark ? "#4d8fb3" : "#1d5f85"
  const sackDark = dark ? "#a98a4c" : "#7d5a18"
  return {
    // 제설함: 각진 상자 + 앞으로 기운 뚜껑(도로변 노란 상자와 같은 실루엣)
    salt: {
      height: 4.6,
      maxScale: DENSE_MAX,
      targetPx: DENSE_PX,
      parts: [
        { geom: new THREE.BoxGeometry(4.4, 3.2, 3.2), mat: lambert(salt), local: at(0, 1.6, 0) },
        { geom: new THREE.BoxGeometry(4.7, 0.5, 3.6), mat: lambert(lidDark), local: at(0, 3.4, 0.25, -0.22) },
        { geom: new THREE.BoxGeometry(3.0, 0.35, 0.3), mat: lambert(INK), local: at(0, 2.3, -1.65) },
      ],
    },
    // 염화칼슘보관함: 원통 + 뚜껑
    cacl: {
      height: 4.4,
      maxScale: DENSE_MAX,
      targetPx: DENSE_PX,
      parts: [
        { geom: new THREE.CylinderGeometry(1.7, 1.6, 3.6, 14), mat: lambert(cacl), local: at(0, 1.8, 0) },
        { geom: new THREE.CylinderGeometry(1.9, 1.9, 0.6, 14), mat: lambert(capDark), local: at(0, 3.9, 0) },
      ],
    },
    // 모래주머니: 납작한 포대 2단(위 단은 90도 돌려 쌓는다)
    sand: {
      height: 3.0,
      maxScale: DENSE_MAX,
      targetPx: DENSE_PX,
      parts: [
        { geom: new THREE.CapsuleGeometry(0.9, 2.6, 4, 10), mat: lambert(sand), local: at(0, 0.9, 0, 0, Math.PI / 2) },
        { geom: new THREE.CapsuleGeometry(0.9, 2.6, 4, 10), mat: lambert(sackDark), local: at(0, 0.9, 0, Math.PI / 2, Math.PI / 2) },
        { geom: new THREE.CapsuleGeometry(0.9, 2.6, 4, 10), mat: lambert(sand), local: at(0, 2.5, 0, 0, Math.PI / 2) },
      ],
    },
    // 동주민센터 보관분: 3단, 조금 크게
    sandCenter: {
      height: 4.4,
      maxScale: DENSE_MAX,
      targetPx: DENSE_PX,
      parts: [
        { geom: new THREE.CapsuleGeometry(1.0, 3.2, 4, 10), mat: lambert(sand), local: at(0, 1.0, 0, 0, Math.PI / 2) },
        { geom: new THREE.CapsuleGeometry(1.0, 3.2, 4, 10), mat: lambert(sackDark), local: at(0, 1.0, 0, Math.PI / 2, Math.PI / 2) },
        { geom: new THREE.CapsuleGeometry(1.0, 3.2, 4, 10), mat: lambert(sand), local: at(0, 2.7, 0, 0, Math.PI / 2) },
        { geom: new THREE.CapsuleGeometry(1.0, 3.2, 4, 10), mat: lambert(sackDark), local: at(0, 2.7, 0, Math.PI / 2, Math.PI / 2) },
        { geom: new THREE.CapsuleGeometry(1.0, 3.2, 4, 10), mat: lambert(sand), local: at(0, 4.4, 0, 0, Math.PI / 2) },
      ],
    },
    // 초등학교: 깃대 + 흰 깃발. 받침 원반이 150m 안 열선 유무(열선색·진홍)
    school: {
      height: 12,
      maxScale: 24,
      parts: [
        { geom: new THREE.CylinderGeometry(2.2, 2.2, 0.5, 16), mat: lambert(heat, { emissive: new THREE.Color(heat), emissiveIntensity: 0.25 }), local: at(0, 0.25, 0) },
        { geom: new THREE.CylinderGeometry(0.22, 0.28, 11, 8), mat: lambert(PAPER), local: at(0, 5.5, 0) },
        { geom: new THREE.BoxGeometry(4.2, 2.6, 0.18), mat: lambert(PAPER, { emissive: new THREE.Color(PAPER), emissiveIntensity: 0.15 }), local: at(2.1, 9.7, 0) },
      ],
    },
    schoolGap: {
      height: 12,
      maxScale: 24,
      parts: [
        { geom: new THREE.CylinderGeometry(2.2, 2.2, 0.5, 16), mat: lambert(risk, { emissive: new THREE.Color(risk), emissiveIntensity: 0.25 }), local: at(0, 0.25, 0) },
        { geom: new THREE.CylinderGeometry(0.22, 0.28, 11, 8), mat: lambert(PAPER), local: at(0, 5.5, 0) },
        { geom: new THREE.BoxGeometry(4.2, 2.6, 0.18), mat: lambert(PAPER, { emissive: new THREE.Color(PAPER), emissiveIntensity: 0.15 }), local: at(2.1, 9.7, 0) },
      ],
    },
    // 열선 위치 구슬: 조망에서 55곳이 보이게. 줌 14.2부터는 선이 대신한다
    // 열선 위치 구슬: 조망에서 55곳이 보이게. 줌 14.2부터는 선이 대신한다. 막대 없이 낮게 놓인 발광 구(풍선 핀처럼 보이던 실측 뒤 조정)
    heat: {
      height: 4,
      maxScale: 30,
      targetPx: 9,
      hideAboveZoom: 14.2,
      parts: [{ geom: new THREE.SphereGeometry(2.0, 16, 12), mat: lambert(heat, { emissive: new THREE.Color(heat), emissiveIntensity: 0.55 }), local: at(0, 1.6, 0) }],
    },
    // 선형 미확인 결빙구간 끝점: 땅에 누운 진홍 고리(평면의 빈 원과 같은 뜻)
    iceEnd: {
      height: 6,
      maxScale: 30,
      targetPx: 12,
      parts: [{ geom: new THREE.TorusGeometry(2.6, 0.55, 8, 24).rotateX(Math.PI / 2), mat: lambert(risk, { emissive: new THREE.Color(risk), emissiveIntensity: 0.35 }), local: at(0, 0.6, 0) }],
    },
    // 입체 숫자만(모델 없음)
    weakBadge: { height: 1, maxScale: 1, parts: [], showFromZoom: 13.6 },
    iceBadge: { height: 1, maxScale: 1, parts: [] },
    dongRank: { height: 1, maxScale: 1, parts: [] },
  }
}

interface KindState {
  points: IconPoint[]
  pos: { x: number; z: number }[] // 원점 기준 미터
  meshes: THREE.InstancedMesh[]
  digits: THREE.Group[] // 입체 숫자(카메라 방위를 따라 선다)
  appearAt: number
}

// 입체 숫자(dumping 18라운드 후속): SUIT Bold 윤곽 압출(digit-font.json, 0~9만). 카메라 방위를 따라 정면이 보인다
const DIGIT_FONT = new Font(digitFont as unknown as ConstructorParameters<typeof Font>[0])
const digitCache = new Map<string, THREE.BufferGeometry>()
function digitGeometry(text: string): THREE.BufferGeometry {
  const hit = digitCache.get(text)
  if (hit) return hit
  const g = new TextGeometry(text, { font: DIGIT_FONT, size: 1, depth: 0.22, curveSegments: 6, bevelEnabled: false })
  g.computeBoundingBox()
  const b = g.boundingBox!
  g.translate(-(b.min.x + b.max.x) / 2, -b.min.y, -(b.min.z + b.max.z) / 2)
  digitCache.set(text, g)
  return g
}
function makeDigit(text: string, color: string): THREE.Group {
  const g = new THREE.Group()
  g.add(new THREE.Mesh(digitGeometry(text), new THREE.MeshLambertMaterial({ color, emissive: new THREE.Color(color), emissiveIntensity: 0.3 })))
  return g
}
const DONG_DIGIT_M = 78 // 동별 기둥 숫자 높이(m). 기둥 한 변 120m 안
const SEG_DIGIT_M = 14 // 구간 번호 숫자 높이(m). 확대하면 이면도로 폭 언저리
const DIGIT_MIN_PX = 13 // 조망에서 읽히는 최소 높이(px). 동별 순위는 더 크게
const DONG_DIGIT_MIN_PX = 20

export class SnowIcons3DLayer implements CustomLayerInterface {
  id = "snow-icons3d"
  type = "custom" as const
  renderingMode = "3d" as const
  visible = true
  private map: MlMap | null = null
  private renderer: THREE.WebGLRenderer | null = null
  private scene = new THREE.Scene()
  private camera = new THREE.Camera()
  private defs: Record<IconKind, KindDef> | null = null
  private dark = true
  private kinds = new Map<IconKind, KindState>()
  private boost = new Map<IconKind, number>() // 종류별 확대 배율(2단계 제설함 1.6배)
  private dims = new Map<IconKind, number>() // 종류별 흐림(평시·보강 자재 대기 0.28)
  private lastZoom = -1
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
    if (!this.defs) this.defs = buildDefs(this.dark)
    // 이미 받은 점이 있으면(스타일 교체 뒤 재추가) 다시 세운다
    for (const [kind, st] of this.kinds) this.rebuild(kind, st.points, false)
  }

  onRemove() {
    // 스타일 교체 시 잠깐 떼었다 붙는다. 렌더러·모델은 유지
    this.map = null
  }

  /** 테마: 라이트는 종이 위라 자재색이 진한 쪽(colorLight). 모델을 다시 만든다 */
  setTheme(dark: boolean) {
    if (this.dark === dark && this.defs) return
    this.dark = dark
    this.defs = buildDefs(dark)
    this.applyDims()
    for (const [kind, st] of this.kinds) this.rebuild(kind, st.points, false)
    this.map?.triggerRepaint()
  }

  setVisible(v: boolean) {
    this.visible = v
    this.map?.triggerRepaint()
  }

  /** 단계 문법: 자재 흐림(1=점등). 재질 투명도로 */
  setDim(kinds: IconKind[], opacity: number) {
    for (const k of kinds) this.dims.set(k, opacity)
    this.applyDims()
    this.map?.triggerRepaint()
  }
  private applyDims() {
    const defs = this.defs
    if (!defs) return
    for (const [k, o] of this.dims)
      for (const part of defs[k].parts) {
        const m = part.mat as THREE.MeshLambertMaterial
        m.transparent = o < 1
        m.opacity = o
        m.needsUpdate = true
      }
  }
  /** 단계 문법: 종류 확대 배율(2단계 제설함 1.6배) */
  setBoost(kind: IconKind, f: number) {
    if ((this.boost.get(kind) ?? 1) === f) return
    this.boost.set(kind, f)
    this.lastZoom = -1
    this.map?.triggerRepaint()
  }

  /** 종류의 점 전체를 바꾼다. 빈 배열이면 치운다. 새로 놓인 아이콘은 솟아오르며 나타난다 */
  setPoints(kind: IconKind, points: IconPoint[]) {
    this.rebuild(kind, points, true)
  }

  private rebuild(kind: IconKind, points: IconPoint[], animate: boolean) {
    const defs = this.defs
    const map = this.map
    const prev = this.kinds.get(kind)
    if (prev) {
      for (const m of prev.meshes) this.scene.remove(m)
      for (const c of prev.digits) {
        this.scene.remove(c)
        ;((c.children[0] as THREE.Mesh).material as THREE.Material).dispose()
      }
    }
    if (!defs || !map) {
      // 아직 지도에 안 붙었으면 점만 기억해 둔다
      this.kinds.set(kind, { points, pos: [], meshes: [], digits: [], appearAt: 0 })
      return
    }
    if (!points.length) {
      this.kinds.set(kind, { points: [], pos: [], meshes: [], digits: [], appearAt: 0 })
      map.triggerRepaint()
      return
    }
    const pos = points.map((p) => {
      const mc = maplibregl.MercatorCoordinate.fromLngLat([p.lng, p.lat], 0)
      return { x: (mc.x - this.anchor.x) / this.scale, z: (mc.y - this.anchor.y) / this.scale }
    })
    const def = defs[kind]
    const meshes = def.parts.map((part) => {
      const mesh = new THREE.InstancedMesh(part.geom, part.mat, points.length)
      mesh.frustumCulled = false
      this.scene.add(mesh)
      return mesh
    })
    const digits: THREE.Group[] = []
    if (kind === "weakBadge" || kind === "iceBadge" || kind === "dongRank") {
      const risk = this.dark ? RISK.weak.color : RISK.weak.colorLight
      points.forEach((p, i) => {
        const d = makeDigit(String(p.rank ?? i + 1), p.color ?? risk)
        digits.push(d)
        this.scene.add(d)
      })
    }
    this.kinds.set(kind, { points, pos, meshes, digits, appearAt: animate ? performance.now() : 0 })
    this.lastZoom = -1
    map.triggerRepaint()
  }

  // 줌(화면 크기)·등장 진행·방위에 맞춰 행렬을 다시 쓴다. 숫자가 있으면 매 프레임
  private updateMatrices(now: number): boolean {
    const map = this.map
    const defs = this.defs
    if (!map || !defs) return false
    const zoom = map.getZoom()
    const mpp = metersPerPixel(zoom)
    // 숫자는 카메라 방위를 따라 선다. 모델 행렬이 x를 뒤집어(getMatrixForModel scale -x) 부호가 반대: rotation.y = -bearing(dumping 실측)
    const face = (-map.getBearing() * Math.PI) / 180
    let animating = false
    const tmp = new THREE.Matrix4()
    const sc = new THREE.Matrix4()
    for (const [kind, st] of this.kinds) {
      if (!st.meshes.length && !st.digits.length) continue
      const def = defs[kind]
      const appearing = st.appearAt > 0 && now - st.appearAt < APPEAR_MS
      const zoomChanged = Math.abs(zoom - this.lastZoom) >= 0.01
      animating ||= appearing
      const hidden = (def.hideAboveZoom != null && zoom > def.hideAboveZoom) || (def.showFromZoom != null && zoom < def.showFromZoom)
      const k = hidden ? 0 : Math.min(def.maxScale, Math.max(1, ((def.targetPx ?? TARGET_PX) * mpp) / def.height)) * (this.boost.get(kind) ?? 1)
      const a = appearing ? easeOutBack(Math.min(1, (now - st.appearAt) / APPEAR_MS)) : 1
      if (st.meshes.length && (appearing || zoomChanged)) {
        st.pos.forEach((p, i) => {
          sc.makeScale(k * a, k * a, k * a)
          st.meshes.forEach((mesh, j) => {
            tmp.makeTranslation(p.x, 0, p.z).multiply(sc).multiply(def.parts[j].local)
            mesh.setMatrixAt(i, tmp)
          })
        })
        for (const mesh of st.meshes) mesh.instanceMatrix.needsUpdate = true
      }
      st.pos.forEach((p, i) => {
        const digit = st.digits[i]
        if (!digit) return
        const pt = st.points[i]
        // 높이: 동별은 기둥 폭 기준(78m), 구간 번호는 14m. 조망에서 최소 px 아래로는 안 내려간다. 줌 범위 밖이면 0
        const hgt = hidden ? 0 : Math.max((pt.h != null ? DONG_DIGIT_MIN_PX : DIGIT_MIN_PX) * mpp, pt.h != null ? DONG_DIGIT_M : SEG_DIGIT_M) * a
        digit.position.set(p.x, pt.h ?? 4, p.z)
        digit.scale.set(hgt, hgt, hgt)
        digit.rotation.y = face
      })
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
