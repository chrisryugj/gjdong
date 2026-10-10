// /dumping 모형 보기 랜드마크 모델(26라운드 후속, 2026-10-10 사용자: "구청 렌더 제대로 해볼래" + 사진 2장). 지금은 광진구청 신청사 하나.
// 블렌더 glb(scripts/blender/dumping_gucheong.py)를 그 자리에 놓고, 부지 안에 중심이 든 일반 모형 건물(OSM 발자국 한 덩어리를 대장 높이 82.3m 로
// 통째로 세운 것과 보건소)은 덩어리에서 뺀다(toon-layer). 재질은 역할마다 다시 칠한다: 흰 틀 · 어두운 유리(보는 각도에 따라 하늘빛, 밤엔 칸마다 불) ·
// 녹색 커튼월 · 막 지붕 · 태양광 · 옥상 정원 · 간판(캔버스 글자, 밤엔 글자만 빛남. 광진구 표장은 그리지 않는다).
// 지붕 눈(uRoofSnow, 바탕 없음일 때만)·구름 그늘(cloudShade)은 일반 모형 건물과 같은 유니폼을 나눠 받는다(검증: 눈 오는 날 구청 지붕만 초록·검정으로 남았다)
import * as THREE from "three"
import { groundAt, lngLatToLocal, type ToonBuildings, type ToonGround } from "@/lib/dumping/toon-world"
import { CLOUD_SHADE_GLSL, loadAsset, type CloudUniforms } from "./toon-assets"

export interface LandmarkDef {
  /** glb 이름(public/dumping/models) */
  name: string
  /** 모델 원점(땅) [경도, 위도] */
  origin: [number, number]
  /** 세로축 회전(라디안). 모델 x = 건물 축 u, 모델 −z = v */
  rotY: number
  /** 일반 모형 건물을 뺄 부지(모델 좌표 u0, u1, v0, v1). 중심이 이 안이면 뺀다 */
  site: [number, number, number, number]
  /** 낮은 건물만 빼는 부지(모델 좌표 사각형 + 높이 상한 m). 저층부 위에 선 고층 타워는 남긴다 */
  lowSites?: { rect: [number, number, number, number]; maxH: number }[]
  /** 바닥을 앉힐 땅높이를 잴 자리(모델 u, v). 부지 땅이 고르지 않으면(지형 자료의 둔덕) 이 점 기준으로 앉히고 아래는 묻는다 */
  seat: [number, number]
  /** 부분(재질 이름 "역할@부분")마다 따로 앉힐 자리. 없는 부분은 seat */
  parts?: Record<string, [number, number]>
  /** 간판 역할 → 글자 */
  signs: Record<string, string>
}

// 광진구청: 건물 축 방위 111.2°(u)·21.4°(v), 원점 (127.08770, 37.53625). 회전 −21.15° 는 toon 로컬(x 동·z 남)에서 u 변이 (cos 21.15°, sin 21.15°)
export const LANDMARK_MODELS: LandmarkDef[] = [
  {
    name: "gucheong",
    origin: [127.0877, 37.53625],
    rotY: -0.3691,
    site: [-32, 47, -58, 34],
    seat: [15, 0],
    // 구의회·보건소 가운데. 지형 자료상 구의회 쪽 땅이 탑보다 2m 낮고 보건소 쪽이 1.3m 높다(실제 광장은 평평, 이스트폴 둔덕 잔재로 보인다)
    // 이스트폴 판매시설(북측) 저층부(@p, 사무 타워 두 동이 그 위에 선다): 모형 건물 자료엔 타워만 있고 저층부가 없어 모델이 그린다
    parts: { c: [-15.7, 16.9], h: [28, -38], p: [10, 75] },
    lowSites: [{ rect: [-52, 76, 33, 135], maxH: 40 }],
    signs: { sign_gc: "광진구청", sign_council: "광진구의회", sign_health: "광진구보건소" },
  },
]

/** 모델 좌표(u, v) ↔ toon 로컬(x 동, z 남) */
export function landmarkToLocal(def: LandmarkDef, u: number, v: number): [number, number] {
  const [ox, oz] = lngLatToLocal(def.origin[0], def.origin[1])
  const c = Math.cos(def.rotY), s = Math.sin(def.rotY)
  return [ox + u * c - v * s, oz - u * s - v * c]
}
export function localToLandmark(def: LandmarkDef, x: number, z: number): [number, number] {
  const [ox, oz] = lngLatToLocal(def.origin[0], def.origin[1])
  const c = Math.cos(def.rotY), s = Math.sin(def.rotY)
  const dx = x - ox, dz = z - oz
  return [dx * c - dz * s, -(dx * s + dz * c)]
}

/** 랜드마크 모델이 대신 그리는 일반 건물 번호(꼭짓점 평균이 부지 안) */
export function landmarkReplaces(b: ToonBuildings, defs: LandmarkDef[] = LANDMARK_MODELS): Set<number> {
  const out = new Set<number>()
  for (let i = 0; i < b.count; i++) {
    let x = 0, z = 0
    const s0 = b.start[i], e = b.start[i + 1]
    for (let k = s0; k < e; k++) {
      x += b.xz[k * 2]
      z += b.xz[k * 2 + 1]
    }
    x /= e - s0
    z /= e - s0
    for (const d of defs) {
      const [u, v] = localToLandmark(d, x, z)
      if (u > d.site[0] && u < d.site[1] && v > d.site[2] && v < d.site[3]) out.add(i)
      for (const l of d.lowSites ?? []) if (u > l.rect[0] && u < l.rect[1] && v > l.rect[2] && v < l.rect[3] && b.height[i] < l.maxH) out.add(i)
    }
  }
  return out
}

// 역할 → 색(라이트·다크). 흰 틀은 테마와 무관(밤 조명이 알아서 어둡게 한다)
const COLORS: Record<string, [string, string]> = {
  frame: ["#fbfbf8", "#e3e2dc"],
  glass: ["#27313a", "#1b232b"],
  curtain: ["#2c4949", "#1d3434"],
  membrane: ["#f4f3ee", "#dcdbd5"],
  roof: ["#cbc8c0", "#8d8b85"],
  solar: ["#2a3850", "#1d2738"],
  green: ["#7aa05b", "#2f4a34"],
  leaf: ["#5e8b4b", "#2a4231"],
  trunk: ["#6e5a48", "#3a3027"],
  mech: ["#b6b4ad", "#7c7a74"],
  lattice: ["#d6d9dc", "#7d838a"],
  pergola: ["#2a2d31", "#1b1e21"],
}
const GLASS_ROLES = new Set(["glass", "curtain"])

/** 일반 모형 건물(toon-layer bldU)과 나눠 받는 유니폼: 지붕 눈·눈 색·구름 그늘 진하기 + 구름 자리(cloudU) */
export type LandmarkShared = { uRoofSnow: { value: number }; uSnowC: { value: THREE.Color }; uCloudDark: { value: number } } & CloudUniforms
type GlassU = { uEye: { value: THREE.Vector3 }; uSky: { value: THREE.Color }; uNight: { value: number }; uLitC: { value: THREE.Color } }

// 한국어 주석은 템플릿 밖에(카피 게이트). 모든 재질: 위를 보는 면에 지붕 눈, 직사광에 구름 그늘. 유리는 더해서 프레넬 하늘빛과 밤 창(칸 1.75m × 4m 해시)
const LM_VERT_PARS = /* glsl */ `
varying vec3 vLmW;
varying vec3 vLmN;
`
const LM_VERT = /* glsl */ `
vLmW = (modelMatrix * vec4(transformed, 1.0)).xyz;
vLmN = normalize(mat3(modelMatrix) * objectNormal);
`
const LM_FRAG_PARS = /* glsl */ `
uniform float uRoofSnow;
uniform vec3 uSnowC;
uniform float uCloudDark;
varying vec3 vLmW;
varying vec3 vLmN;
${CLOUD_SHADE_GLSL}
`
const LM_SNOW = /* glsl */ `
diffuseColor.rgb = mix(diffuseColor.rgb, uSnowC, uRoofSnow * smoothstep(0.55, 0.85, normalize(vLmN).y));
`
const LM_LIGHT = /* glsl */ `
reflectedLight.directDiffuse *= 1.0 - uCloudDark * cloudShade(vLmW);
`
// 이스트폴 저층부 은색 마름모 격자 외벽: 벽면을 따라 간 거리·높이로 대각 두 방향 가는 선(칸 4.2m), 위를 보는 면은 건너뛴다
const LM_LATTICE = /* glsl */ `
{
  vec3 lmLN = normalize(vLmN);
  if (abs(lmLN.y) < 0.5) {
    vec2 lmLT = normalize(vec2(-lmLN.z, lmLN.x) + 1e-5);
    float lmS = dot(vLmW.xz, lmLT);
    float lmA = abs(fract((lmS + vLmW.y * 0.8) / 4.2) - 0.5);
    float lmB = abs(fract((lmS - vLmW.y * 0.8) / 4.2) - 0.5);
    float lmL = 1.0 - smoothstep(0.035, 0.07, min(lmA, lmB));
    diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * 0.5, lmL);
  }
}
`
const GLASS_FRAG_PARS = /* glsl */ `
uniform vec3 uEye;
uniform vec3 uSky;
uniform float uNight;
uniform vec3 uLitC;
float lmHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
`
const GLASS_COLOR = /* glsl */ `
vec3 lmN = normalize(vLmN);
float lmF = pow(1.0 - clamp(abs(dot(lmN, normalize(uEye - vLmW))), 0.0, 1.0), 2.0);
diffuseColor.rgb = mix(diffuseColor.rgb, uSky, 0.1 + 0.55 * lmF);
`
const GLASS_EMIT = /* glsl */ `
{
  vec2 lmT = normalize(vec2(-lmN.z, lmN.x) + 1e-5);
  vec2 lmCell = floor(vec2(dot(vLmW.xz, lmT) / 1.75, vLmW.y / 4.0));
  float lmLit = step(lmHash(lmCell + floor(lmN.xz * 3.0) * 17.0), 0.34) * (1.0 - abs(lmN.y));
  totalEmissiveRadiance += uLitC * lmLit * uNight * 0.62;
}
`

function landmarkMaterial(params: THREE.MeshLambertMaterialParameters, shared: LandmarkShared, glass?: GlassU, lattice = false): THREE.MeshLambertMaterial {
  const m = new THREE.MeshLambertMaterial(params)
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, shared, glass ?? {})
    sh.vertexShader = sh.vertexShader.replace("#include <common>", `#include <common>\n${LM_VERT_PARS}`).replace("#include <begin_vertex>", `#include <begin_vertex>\n${LM_VERT}`)
    sh.fragmentShader = sh.fragmentShader
      .replace("#include <common>", `#include <common>\n${LM_FRAG_PARS}${glass ? GLASS_FRAG_PARS : ""}`)
      .replace("#include <color_fragment>", `#include <color_fragment>\n${glass ? GLASS_COLOR : LM_SNOW}${lattice ? LM_LATTICE : ""}`)
      .replace("#include <emissivemap_fragment>", `#include <emissivemap_fragment>\n${glass ? GLASS_EMIT : ""}`)
      .replace("#include <lights_fragment_end>", `#include <lights_fragment_end>\n${LM_LIGHT}`)
  }
  // 유리·일반 두 갈래 셰이더를 프로그램 캐시가 따로 잡게
  m.customProgramCacheKey = () => (glass ? "lm-glass" : lattice ? "lm-lattice" : "lm-plain")
  return m
}

/** 간판 글자 캔버스: 낮엔 흰 판 위 남색 글자, 밤 빛은 검정 위 흰 글자(emissiveMap) */
/** 광진구 표장(간판 사진대로 줄여 그림, 2026-10-10 사용자 "구청사 마크도"): 오른쪽 위로 기운 파란 타원 + 위 초록 삼각(산) + 아래 흰 꺾쇠(배·물결) + 가운데 가는 파란 선.
 * cx·cy 가운데, e 지름(px). glow 면 밤 빛 지도용(타원은 옅게, 흰 꺾쇠는 밝게) */
export function drawEmblem(g: CanvasRenderingContext2D, cx: number, cy: number, e: number, glow = false) {
  g.save()
  g.translate(cx, cy)
  g.save()
  g.rotate(-0.5)
  g.beginPath()
  g.ellipse(0, 0, e * 0.5, e * 0.38, 0, 0, Math.PI * 2)
  g.fillStyle = glow ? "#3a3a3a" : "#1e3fa8"
  g.fill()
  g.restore()
  const poly = (pts: [number, number][], fill: string) => {
    g.beginPath()
    pts.forEach(([x, y], i) => (i ? g.lineTo(x * e, y * e) : g.moveTo(x * e, y * e)))
    g.closePath()
    g.fillStyle = fill
    g.fill()
  }
  // 사진 자리를 타원 지름 기준으로 옮긴 좌표: 초록 산(꼭대기 위) · 흰 큰 꺾쇠(아래로 뾰족) · 흰 돛(산 앞) · 물결 선
  poly([[0.08, -0.36], [-0.33, -0.04], [0.22, -0.09]], glow ? "#6a6a6a" : "#2f9d4c")
  poly([[-0.33, -0.02], [0.39, 0.02], [-0.08, 0.36]], "#ffffff")
  poly([[-0.2, 0.0], [0.09, -0.23], [0.13, 0.04]], "#ffffff")
  g.strokeStyle = glow ? "#3a3a3a" : "#1e3fa8"
  g.lineWidth = Math.max(1, e * 0.022)
  g.beginPath()
  g.moveTo(-0.13 * e, 0.11 * e)
  g.quadraticCurveTo(0.03 * e, 0.06 * e, 0.2 * e, 0.1 * e)
  g.stroke()
  g.restore()
}

function signTextures(text: string, aspect: number, emblem = false): { map: THREE.CanvasTexture; glow: THREE.CanvasTexture } | null {
  if (typeof document === "undefined") return null
  const w = 1024
  const h = Math.max(64, Math.round(w / aspect))
  const draw = (bg: string, fg: string, glow: boolean) => {
    const c = document.createElement("canvas")
    c.width = w
    c.height = h
    const g = c.getContext("2d")!
    g.fillStyle = bg
    g.fillRect(0, 0, w, h)
    // 표장이 있으면 왼쪽에 판 높이 0.9 만큼, 글자는 그 오른쪽 남은 폭 가운데
    const e = emblem ? h * 0.9 : 0
    const x0 = emblem ? e * 1.12 : 0
    if (emblem) drawEmblem(g, e * 0.58, h / 2, e, glow)
    g.fillStyle = fg
    g.textAlign = "center"
    g.textBaseline = "middle"
    let px = Math.round(h * 0.72)
    const font = (n: number) => `700 ${n}px "IBM Plex Sans KR", SUIT, "Apple SD Gothic Neo", "Malgun Gothic", sans-serif`
    g.font = font(px)
    while (g.measureText(text).width > (w - x0) * 0.9 && px > 10) g.font = font((px -= 4))
    g.fillText(text, x0 + (w - x0) / 2, h / 2 + px * 0.04)
    const t = new THREE.CanvasTexture(c)
    // glTF UV 는 위가 v=0 이라 뒤집지 않는다(GLTFLoader 와 같은 규약)
    t.flipY = false
    t.anisotropy = 4
    return t
  }
  const map = draw("#fbfbf8", "#1d2433", false)
  map.colorSpace = THREE.SRGBColorSpace
  const glow = draw("#000000", "#ffffff", true)
  return { map, glow }
}

export class ToonLandmarks {
  readonly group = new THREE.Group()
  private readonly glassU: GlassU = { uEye: { value: new THREE.Vector3() }, uSky: { value: new THREE.Color("#d2dde4") }, uNight: { value: 0 }, uLitC: { value: new THREE.Color("#ffcf8a") } }
  private readonly mats = new Map<string, THREE.MeshLambertMaterial>()
  private dark = false
  private disposed = false
  /** 모델이 하나라도 섰나(이름표 알약을 숨겨도 되나) */
  ready = false

  constructor(private readonly shared: LandmarkShared) {}

  /** glb 를 받아 놓는다. 땅높이는 seat 자리의 toon 지면(× 과장). 실패하면 아무것도 안 놓는다(일반 건물은 이미 빠졌으니 호출 쪽이 되돌린다) */
  async load(ground: ToonGround, exag: number, defs: LandmarkDef[] = LANDMARK_MODELS): Promise<boolean> {
    let ok = false
    for (const d of defs) {
      const parts = await loadAsset(d.name, true)
      if (this.disposed) return false
      if (!parts.length) continue
      const root = new THREE.Group()
      const [x, z] = landmarkToLocal(d, 0, 0)
      const at = (s: [number, number]) => groundAt(ground, ...landmarkToLocal(d, s[0], s[1])) * exag
      const y0 = at(d.seat)
      root.position.set(x, y0, z)
      root.rotation.y = d.rotY
      for (const p of parts) {
        const [role, part] = (p.role as string).split("@")
        // 기하는 층마다 복사본(모듈 캐시 기하를 dispose 하면 지도를 다시 만들 때 빈 기하가 된다, icons3d 와 같은 규약)
        const mesh = new THREE.Mesh(p.geom.clone(), this.material(role, d))
        const ps = part ? d.parts?.[part] : undefined
        if (ps) mesh.position.y = at(ps) - y0
        const sign = role.startsWith("sign_")
        mesh.castShadow = !sign
        mesh.receiveShadow = true
        root.add(mesh)
      }
      root.updateMatrixWorld(true)
      this.group.add(root)
      ok = true
    }
    this.applyTheme()
    this.ready = ok
    return ok
  }

  private material(role: string, d: LandmarkDef): THREE.MeshLambertMaterial {
    const hit = this.mats.get(role)
    if (hit) return hit
    let m: THREE.MeshLambertMaterial
    if (GLASS_ROLES.has(role)) m = landmarkMaterial({ color: COLORS[role][0] }, this.shared, this.glassU)
    else if (role.startsWith("sign_")) {
      // 판 비율은 블렌더 간판 크기(가로 ÷ 세로)와 맞춘다. 간판은 벽면이라 눈이 안 쌓이고 구름 그늘만
      const aspect = role === "sign_gc" ? 12.2 / 3.3 : role === "sign_council" ? 10.4 / 1.4 : 11.0 / 1.7
      // 구청·보건소 간판엔 광진구 표장(사진: 구청 왕관 간판·보건소 간판 둘 다 파란 표장 + 글자). 구의회는 의회 표장이라 글자만
      const t = signTextures(d.signs[role] ?? "", aspect, role === "sign_gc" || role === "sign_health")
      m = landmarkMaterial({ color: "#ffffff", map: t?.map ?? null, emissiveMap: t?.glow ?? null, emissive: new THREE.Color("#000000") }, this.shared)
    } else m = landmarkMaterial({ color: (COLORS[role] ?? COLORS.frame)[0] }, this.shared, undefined, role === "lattice")
    this.mats.set(role, m)
    return m
  }

  setTheme(dark: boolean) {
    this.dark = dark
    this.applyTheme()
  }

  private applyTheme() {
    const k = this.dark ? 1 : 0
    for (const [role, m] of this.mats) {
      if (role.startsWith("sign_")) {
        m.emissive.set(this.dark ? "#fff3dc" : "#000000")
        m.emissiveIntensity = this.dark ? 0.9 : 0
        continue
      }
      const c = COLORS[role] ?? COLORS.frame
      m.color.set(c[k])
    }
    this.glassU.uNight.value = this.dark ? 1 : 0
    this.glassU.uSky.value.set(this.dark ? "#3a4656" : "#d2dde4")
  }

  /** 매 프레임 눈 위치(유리 프레넬) */
  frame(eye: THREE.Vector3) {
    this.glassU.uEye.value.copy(eye)
  }

  dispose() {
    this.disposed = true
    this.group.traverse((o) => {
      const mesh = o as THREE.Mesh
      if (mesh.isMesh) mesh.geometry.dispose()
    })
    for (const m of this.mats.values()) {
      m.map?.dispose()
      m.emissiveMap?.dispose()
      m.dispose()
    }
    this.mats.clear()
  }
}
