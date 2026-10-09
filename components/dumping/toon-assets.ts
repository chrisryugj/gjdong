// /dumping 모형 보기 공용 three 부품(23라운드, 2026-10-09): 블렌더 glb 읽기(재질 이름 = 역할) · 계단 명암 재질 · 윤곽선 껍질 재질.
// glb 는 scripts/blender/dumping_assets.py 가 만든다. 메시마다 변환을 기하에 구워 넣어(원점 = 바닥 가운데) 인스턴스 행렬 하나로 놓게 한다.
// 윤곽선은 뒷면 껍질(BackSide)을 화면 픽셀 폭만큼 바깥으로 민다. 미는 방향 aOut 은 꼭짓점 위치에서 부품 가운데를 뺀 방향이라
// 면마다 꼭짓점이 갈라진 로우폴리 메시에서도 같은 자리 꼭짓점은 같은 방향으로 밀려 껍질에 틈이 안 생긴다
import * as THREE from "three"
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js"

export type AssetRole = "body" | "body2" | "body3" | "ink" | "paper" | "glass" | "metal" | "light" | "tire" | "leaf" | "trunk" | "cloud"
export interface AssetPart {
  role: AssetRole
  geom: THREE.BufferGeometry
}
export const MODEL_PATH = "/dumping/models"

const loader = new GLTFLoader()
const cache = new Map<string, Promise<AssetPart[]>>()

/** glb 하나 → 역할별 부품(변환 구움). 같은 이름은 한 번만 받는다. smooth 면 법선을 남긴다(24라운드 실사 나무·구름: 매끈한 명암) */
export function loadAsset(name: string, smooth = false): Promise<AssetPart[]> {
  const key = smooth ? `${name}:smooth` : name
  const hit = cache.get(key)
  if (hit) return hit
  const p = loader.loadAsync(`${MODEL_PATH}/${name}.glb`).then((gltf) => {
    gltf.scene.updateMatrixWorld(true)
    const parts: AssetPart[] = []
    gltf.scene.traverse((o) => {
      const mesh = o as THREE.Mesh
      if (!mesh.isMesh) return
      const mat = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material
      const geom = mesh.geometry.clone().applyMatrix4(mesh.matrixWorld)
      if (!smooth) geom.deleteAttribute("normal") // 평면 셰이딩(화면 미분)이라 법선이 필요 없다
      geom.computeBoundingSphere()
      parts.push({ role: (mat?.name || "body") as AssetRole, geom })
      ;(mat as THREE.Material | undefined)?.dispose()
    })
    return parts
  })
  cache.set(key, p)
  return p
}

/** 부품 가운데에서 꼭짓점으로 향하는 윤곽선 방향(aOut). lift 는 위쪽으로 더 밀 비율(지붕·꼭대기 테두리가 살게) */
export function addRadialOut(geom: THREE.BufferGeometry, center?: THREE.Vector3, lift = 0.25): THREE.BufferGeometry {
  const pos = geom.getAttribute("position") as THREE.BufferAttribute
  if (!center) {
    geom.computeBoundingBox()
    center = geom.boundingBox!.getCenter(new THREE.Vector3())
  }
  const out = new Float32Array(pos.count * 3)
  const d = new THREE.Vector3()
  for (let i = 0; i < pos.count; i++) {
    d.set(pos.getX(i) - center.x, (pos.getY(i) - center.y) * (1 + lift), pos.getZ(i) - center.z)
    if (d.lengthSq() < 1e-8) d.set(0, 1, 0)
    d.normalize()
    out[i * 3] = d.x
    out[i * 3 + 1] = d.y
    out[i * 3 + 2] = d.z
  }
  geom.setAttribute("aOut", new THREE.BufferAttribute(out, 3))
  return geom
}

/** 부품 여럿을 위치만 남겨 한 기하로(윤곽선 껍질은 종류마다 하나) */
export function mergeForHull(parts: AssetPart[], skip: AssetRole[] = []): THREE.BufferGeometry {
  const keep = parts.filter((p) => !skip.includes(p.role))
  const geoms = keep.map((p) => {
    const g = p.geom.index ? p.geom.toNonIndexed() : p.geom.clone()
    for (const k of Object.keys(g.attributes)) if (k !== "position") g.deleteAttribute(k)
    return g
  })
  const total = geoms.reduce((s, g) => s + g.getAttribute("position").count, 0)
  const pos = new Float32Array(total * 3)
  let o = 0
  for (const g of geoms) {
    pos.set(g.getAttribute("position").array as Float32Array, o)
    o += g.getAttribute("position").count * 3
    g.dispose()
  }
  const merged = new THREE.BufferGeometry()
  merged.setAttribute("position", new THREE.BufferAttribute(pos, 3))
  addRadialOut(merged)
  merged.computeBoundingSphere()
  return merged
}

// 계단 명암 네 칸(해 반대쪽 · 해 반대쪽 · 비스듬히 · 해 쪽). 면 법선이 면마다 하나라 칸 경계가 면 경계와 같아 계단이 지지 않는다.
// 그늘 칸을 너무 낮추면 해 반대쪽 벽이 흙빛이 됐다(첫 캡처). 재질마다 새로 만든다(24라운드): 모듈 공용 한 장이면 해제되지 않아
// 렌더러마다 dispose 리스너가 쌓여 지도를 새로 만들 때마다 옛 렌더러를 붙잡았다(검증 실측). 재질을 버릴 때 gradientMap 도 같이 버린다
export function toonGradient(): THREE.DataTexture {
  const gradient = new THREE.DataTexture(new Uint8Array([178, 184, 222, 255]), 4, 1, THREE.RedFormat)
  gradient.minFilter = gradient.magFilter = THREE.NearestFilter
  gradient.generateMipmaps = false
  gradient.needsUpdate = true
  return gradient
}

export function toonMaterial(color: THREE.ColorRepresentation, extra: THREE.MeshToonMaterialParameters = {}): THREE.MeshToonMaterial {
  const m = new THREE.MeshToonMaterial({ color, gradientMap: toonGradient(), ...extra })
  // 평면 셰이딩: three 는 material.flatShading 을 보고 FLAT_SHADED 를 켠다(툰 재질 타입에는 없는 속성이라 직접 단다). 법선 속성 없이 화면 미분으로 면 법선
  Object.assign(m, { flatShading: true })
  return m
}

// 윤곽선 껍질. 뒷면을 그리고, 꼭짓점을 화면에서 aOut 방향으로 uPx 픽셀 민다(거리와 무관한 선 굵기).
// 멀어서 1m 가 uFadeLo 픽셀보다 작으면 선을 거둔다(조망에서 2만 동 윤곽이 화면을 회색으로 덮지 않게). uPxK = 화면 1m 픽셀 × 깊이(w)
export const HULL_VERT = /* glsl */ `
attribute vec3 aOut;
uniform vec2 uViewport;
uniform float uPx;
uniform float uPxMul;
uniform float uPxK;
uniform vec2 uFade;
void main() {
  vec3 p0 = position;
  #ifdef USE_INSTANCING
    vec4 w0 = instanceMatrix * vec4(p0, 1.0);
    vec4 w1 = instanceMatrix * vec4(p0 + aOut, 1.0);
  #else
    vec4 w0 = vec4(p0, 1.0);
    vec4 w1 = vec4(p0 + aOut, 1.0);
  #endif
  vec4 c0 = projectionMatrix * modelViewMatrix * w0;
  vec4 c1 = projectionMatrix * modelViewMatrix * w1;
  vec2 d = c1.xy / c1.w - c0.xy / c0.w;
  float l = length(d);
  d = l > 1e-9 ? d / l : vec2(0.0);
  float ppm = uPxK / max(c0.w, 1e-6);
  float px = uPx * uPxMul * smoothstep(uFade.x, uFade.y, ppm);
  c0.xy += d * px * 2.0 / uViewport * c0.w;
  gl_Position = c0;
}`
export const HULL_FRAG = /* glsl */ `
uniform vec3 uInk;
uniform float uAlpha;
void main() {
  gl_FragColor = vec4(uInk, uAlpha);
  #include <colorspace_fragment>
}`

export interface HullUniforms {
  uViewport: { value: THREE.Vector2 }
  uPx: { value: number }
  uPxK: { value: number }
  uFade: { value: THREE.Vector2 }
}
/** 레이어가 매 프레임 같이 고치는 껍질 공용 값(화면 크기·1m 픽셀) */
export function hullUniforms(): HullUniforms {
  return { uViewport: { value: new THREE.Vector2(1, 1) }, uPx: { value: 1.4 }, uPxK: { value: 0 }, uFade: { value: new THREE.Vector2(0.16, 0.42) } }
}
/** mul 은 공용 선 굵기(uPx)에 곱하는 배율(나무·구름은 건물보다 가늘게 등) */
export function hullMaterial(shared: HullUniforms, ink: THREE.ColorRepresentation, mul = 1): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { ...shared, uPxMul: { value: mul }, uInk: { value: new THREE.Color(ink) }, uAlpha: { value: 1 } },
    vertexShader: HULL_VERT,
    fragmentShader: HULL_FRAG,
    side: THREE.BackSide,
  })
}

/** 지도 커스텀 레이어 투영(정본: icons3d). 모델 원점 이동 · Z 180도 · X 90도 · 미터 축척(x 뒤집기). 메르카토르 전용 */
export function anchorMatrix(anchor: [number, number]): { m: THREE.Matrix4; x: number; y: number; scale: number } {
  // maplibre 를 끌어오지 않으려고 메르카토르 식을 직접 쓴다(MercatorCoordinate.fromLngLat 와 같은 값)
  const x = (anchor[0] + 180) / 360
  const y = (1 - Math.log(Math.tan(Math.PI / 4 + (anchor[1] * Math.PI) / 360)) / Math.PI) / 2
  const scale = 1 / (2 * Math.PI * 6371008.8 * Math.cos((anchor[1] * Math.PI) / 180))
  const m = new THREE.Matrix4()
    .makeTranslation(x, y, 0)
    .multiply(new THREE.Matrix4().makeRotationZ(Math.PI))
    .multiply(new THREE.Matrix4().makeRotationX(Math.PI / 2))
    .multiply(new THREE.Matrix4().makeScale(-scale, scale, scale))
  return { m, x, y, scale }
}

// ─── 구름 그림자(24라운드). 건물·나무·땅 받이가 같은 값을 읽는다 ───
// 구름마다 (x, z, 반지름, 높이)와 진하기. 조각 위치에서 해 쪽으로 구름 높이까지 거슬러 올라가 그 구름 안이면 그늘.
// 구름은 바람 방향으로 1.6배 긴 타원. 해 방향(uSunDir)은 모델 공간(+y 위)
export const MAX_CLOUDS = 16
export const CLOUD_SHADE_GLSL = /* glsl */ `
uniform vec4 uClouds[${MAX_CLOUDS}];
uniform float uCloudA[${MAX_CLOUDS}];
uniform int uCloudN;
uniform vec3 uSunDir;
uniform vec2 uWind;
float cloudShade(vec3 p) {
  float s = 0.0;
  for (int k = 0; k < ${MAX_CLOUDS}; k++) {
    if (k >= uCloudN) break;
    vec4 c = uClouds[k];
    vec2 q = p.xz + uSunDir.xz * ((c.w - p.y) / max(uSunDir.y, 0.2));
    vec2 d = q - c.xy;
    vec2 e = vec2(dot(d, uWind) / 1.6, dot(d, vec2(-uWind.y, uWind.x)));
    s = max(s, (1.0 - smoothstep(0.3, 1.0, length(e) / c.z)) * uCloudA[k]);
  }
  return s;
}`
export interface CloudUniforms {
  uClouds: { value: THREE.Vector4[] }
  uCloudA: { value: number[] }
  uCloudN: { value: number }
  uSunDir: { value: THREE.Vector3 }
  uWind: { value: THREE.Vector2 }
}
export function cloudUniforms(): CloudUniforms {
  return {
    uClouds: { value: Array.from({ length: MAX_CLOUDS }, () => new THREE.Vector4()) },
    uCloudA: { value: new Array(MAX_CLOUDS).fill(0) },
    uCloudN: { value: 0 },
    uSunDir: { value: new THREE.Vector3(0, 1, 0) },
    uWind: { value: new THREE.Vector2(1, 0) },
  }
}

/** 투영 행렬(지도 행렬 × 원점 행렬)에서 모델 공간 눈 위치. 투영 행 0·1·3 이 눈에서 0 이 되는 점(시점 행렬이 단위라 three 의 vViewPosition 은 못 쓴다) */
export function eyeOf(proj: THREE.Matrix4, out: THREE.Vector3): THREE.Vector3 {
  const e = proj.elements // 열 우선: 행 r 열 c = e[c * 4 + r]
  const a = [0, 1, 3].map((r) => [e[r], e[4 + r], e[8 + r], -e[12 + r]])
  const det = (m: number[][]) => m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0])
  const M = a.map((r) => r.slice(0, 3))
  const d = det(M)
  if (Math.abs(d) < 1e-30) return out
  const col = (k: number) => det(M.map((r, i) => r.map((v, j) => (j === k ? a[i][3] : v))))
  return out.set(col(0) / d, col(1) / d, col(2) / d)
}
