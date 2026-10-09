// /dumping 모형 보기 빛기둥(24라운드, 2026-10-09 사용자: "민원·과태료 기둥이 이젠 이질적"). 지도 압출 기둥(불투명 색 상자)을 실사 모형 위에서는
// 가는 빛기둥으로 바꿔 그린다: 바닥이 진하고 위로 갈수록 옅어지는 몸통 · 높이를 읽는 또렷한 뚜껑 · 바닥에 원래 발자국 크기의 빛 테.
// 발자국(원 반지름·칸 폭)은 바닥 테가, 값은 높이가 말한다. 기둥을 발자국만큼 굵게 세우면 건물만 한 반투명 원통이 동네를 덮었다(첫 캡처).
// 모양·높이·색·거르기는 지도 레이어와 같은 GeoJSON(dumping-map 이 setFC 하는 것)을 그대로 받아 같은 값을 말한다.
// 지도 압출 기둥은 투명(opacity 0)으로 남아 툴팁 조회를 맡고(queryRenderedFeatures 는 도형으로 찾는다), 솟는 연출은 riseColumns 와 같은 곡선
import * as THREE from "three"
import { groundAt, lngLatToLocal, type ToonGround } from "@/lib/dumping/toon-world"

type FC = GeoJSON.FeatureCollection<GeoJSON.Geometry, Record<string, unknown>>

const VERT = /* glsl */ `
attribute vec3 aColor;
attribute float aBase;
attribute float aT;
uniform float uRise;
uniform vec3 uEye;
varying vec3 vC;
varying float vT;
varying vec3 vN;
varying vec3 vV;
void main() {
  vec3 p = position;
  if (aT < 2.5) p.y = aBase + (p.y - aBase) * uRise;
  vC = aColor;
  vT = aT;
  vN = normal;
  vV = uEye - p;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}`
const FRAG = /* glsl */ `
uniform float uDark;
uniform float uOpacity;
varying vec3 vC;
varying float vT;
varying vec3 vN;
varying vec3 vV;
void main() {
  vec3 c = vC;
  float a;
  if (vT > 2.5) {
    float r = vT - 3.0;
    a = 0.14 * (1.0 - r) + 0.5 * smoothstep(0.8, 0.95, r) * (1.0 - smoothstep(0.95, 1.0, r));
    c = mix(vC, vec3(1.0), 0.15 * (1.0 - uDark));
  } else if (vT > 1.5) {
    a = 0.94;
    c = mix(vC, vec3(1.0), 0.3);
  } else {
    float f = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.0);
    a = mix(0.84, 0.34, vT) + 0.32 * f;
    c = mix(vC, vec3(1.0), 0.16 * vT + 0.32 * f);
  }
  gl_FragColor = vec4(c, clamp(a * uOpacity, 0.0, 1.0));
  #include <colorspace_fragment>
}`

interface BeamSet {
  fc: FC
  color?: string
  /** 기둥 반지름 = 발자국 반지름 × thin(3~20m) */
  thin: number
  filter: string | null
  rise: { t0: number; ms: number } | null
  meshes: THREE.Mesh[]
  uniforms: { uRise: { value: number }; uEye: { value: THREE.Vector3 }; uDark: { value: number }; uOpacity: { value: number } }
}

const SEG_GLOW = 28
const SEG_BEAM = 14

export class ToonBeams {
  readonly group = new THREE.Group()
  private readonly sets = new Map<string, BeamSet>()
  private ground: ToonGround | null = null
  private exag = 1
  private dark = false
  private readonly eye = new THREE.Vector3()
  private readonly color = new THREE.Color()

  setGround(g: ToonGround, exag: number) {
    this.ground = g
    this.exag = exag
    for (const id of this.sets.keys()) this.build(id)
  }

  /** 지도 기둥 레이어 하나의 데이터. color 를 주면 모든 기둥이 그 색(상습격자처럼 레이어 고정색), thin 은 굵기 비율 */
  setData(id: string, fc: FC, color?: string, thin = 0.3) {
    const s = this.sets.get(id)
    if (s) {
      s.fc = fc
      s.color = color
      s.thin = thin
    } else
      this.sets.set(id, {
        fc,
        color,
        thin,
        filter: null,
        rise: null,
        meshes: [],
        uniforms: { uRise: { value: 1 }, uEye: { value: this.eye }, uDark: { value: this.dark ? 1 : 0 }, uOpacity: { value: 1 } },
      })
    this.build(id)
  }

  /** 지도 레이어 거르기와 같다: null 이면 전부, 아니면 dong 속성이 같은 것만(아무 동도 아닌 값이면 전부 숨김) */
  setFilter(id: string, dong: string | null) {
    const s = this.sets.get(id)
    if (!s || s.filter === dong) return
    s.filter = dong
    this.build(id)
  }

  /** 솟기: riseColumns 와 같은 길이·곡선(1 − (1 − t)^3) */
  rise(id: string, ms = 900) {
    const s = this.sets.get(id)
    if (!s) return
    s.rise = { t0: performance.now(), ms }
    s.uniforms.uRise.value = 0
  }

  setTheme(dark: boolean) {
    this.dark = dark
    for (const s of this.sets.values()) {
      s.uniforms.uDark.value = dark ? 1 : 0
      for (const m of s.meshes) (m.material as THREE.ShaderMaterial).blending = dark ? THREE.AdditiveBlending : THREE.NormalBlending
    }
  }

  /** 매 프레임: 눈 위치(테 밝기)·솟는 중인 배율. 솟는 중이면 true */
  frame(eye: THREE.Vector3): boolean {
    this.eye.copy(eye)
    const now = performance.now()
    let moving = false
    for (const s of this.sets.values()) {
      if (!s.rise) continue
      const f = Math.min(1, (now - s.rise.t0) / s.rise.ms)
      s.uniforms.uRise.value = 1 - Math.pow(1 - f, 3)
      if (f >= 1) s.rise = null
      else moving = true
    }
    return moving
  }

  private build(id: string) {
    const s = this.sets.get(id)
    if (!s) return
    for (const m of s.meshes) {
      this.group.remove(m)
      m.geometry.dispose()
      ;(m.material as THREE.Material).dispose()
    }
    s.meshes = []
    const P: number[] = []
    const N: number[] = []
    const C: number[] = []
    const Bs: number[] = []
    const T: number[] = []
    const I: number[] = []
    const vert = (x: number, y: number, z: number, n: [number, number, number], base: number, t: number) => {
      P.push(x, y, z)
      N.push(...n)
      C.push(this.color.r, this.color.g, this.color.b)
      Bs.push(base)
      T.push(t)
      return P.length / 3 - 1
    }
    for (const f of s.fc.features) {
      const p = f.properties ?? {}
      if (s.filter !== null && p.dong !== s.filter) continue
      const g = f.geometry
      const ring = g.type === "Polygon" ? g.coordinates[0] : g.type === "MultiPolygon" ? g.coordinates[0]?.[0] : null
      if (!ring || ring.length < 4) continue
      const pts = ring.slice(0, -1).map(([lng, lat]) => lngLatToLocal(lng, lat))
      let cx = 0, cz = 0
      for (const [x, z] of pts) {
        cx += x
        cz += z
      }
      cx /= pts.length
      cz /= pts.length
      const gy = (this.ground ? groundAt(this.ground, cx, cz) * this.exag : 0) + 0.3
      const h = Number(p.h) || 0
      const base = Number(p.base) || 0
      if (h <= base) continue
      this.color.setStyle(s.color ?? String(p.color ?? "#888888"))
      const y0 = gy + base
      const y1 = gy + h
      let rMean = 0
      for (const [x, z] of pts) rMean += Math.hypot(x - cx, z - cz)
      rMean /= pts.length
      const rb = Math.min(20, Math.max(3, rMean * s.thin))
      // 몸통: 가는 원기둥(SEG_BEAM 각)
      const t0 = base / h
      for (let k = 0; k < SEG_BEAM; k++) {
        const a0 = (k / SEG_BEAM) * Math.PI * 2
        const a1 = ((k + 1) / SEG_BEAM) * Math.PI * 2
        const am = (a0 + a1) / 2
        const n: [number, number, number] = [Math.cos(am), 0, Math.sin(am)]
        const ax = cx + Math.cos(a0) * rb, az = cz + Math.sin(a0) * rb
        const bx = cx + Math.cos(a1) * rb, bz = cz + Math.sin(a1) * rb
        const v0 = vert(ax, y0, az, n, gy, t0)
        const v1 = vert(bx, y0, bz, n, gy, t0)
        const v2 = vert(bx, y1, bz, n, gy, 1)
        const v3 = vert(ax, y1, az, n, gy, 1)
        I.push(v0, v2, v1, v0, v3, v2)
      }
      // 뚜껑
      const c0 = vert(cx, y1, cz, [0, 1, 0], gy, 2)
      const cap: number[] = []
      for (let k = 0; k < SEG_BEAM; k++) {
        const ang = (k / SEG_BEAM) * Math.PI * 2
        cap.push(vert(cx + Math.cos(ang) * rb, y1, cz + Math.sin(ang) * rb, [0, 1, 0], gy, 2))
      }
      for (let k = 0; k < SEG_BEAM; k++) I.push(c0, cap[(k + 1) % SEG_BEAM], cap[k])
      // 바닥 빛 테: 원래 발자국 크기(평면 원·칸과 같은 반지름). 토막 쌓인 동별 기둥은 맨 아래 토막만
      if (base <= 0) {
        const r = Math.max(rMean, rb * 1.6)
        const g0 = vert(cx, gy + 0.4, cz, [0, 1, 0], gy, 3)
        const glow: number[] = []
        for (let k = 0; k < SEG_GLOW; k++) {
          const ang = (k / SEG_GLOW) * Math.PI * 2
          glow.push(vert(cx + Math.cos(ang) * r, gy + 0.4, cz + Math.sin(ang) * r, [0, 1, 0], gy, 4))
        }
        for (let k = 0; k < SEG_GLOW; k++) I.push(g0, glow[(k + 1) % SEG_GLOW], glow[k])
      }
    }
    if (!I.length) return
    const geom = new THREE.BufferGeometry()
    geom.setAttribute("position", new THREE.Float32BufferAttribute(P, 3))
    geom.setAttribute("normal", new THREE.Float32BufferAttribute(N, 3))
    geom.setAttribute("aColor", new THREE.Float32BufferAttribute(C, 3))
    geom.setAttribute("aBase", new THREE.Float32BufferAttribute(Bs, 1))
    geom.setAttribute("aT", new THREE.Float32BufferAttribute(T, 1))
    geom.setIndex(I)
    geom.computeBoundingSphere()
    // 뒷면 먼저, 앞면 나중(반투명 몸통 안쪽 벽이 바깥 벽 앞에 비치지 않게)
    for (const side of [THREE.BackSide, THREE.FrontSide]) {
      const mat = new THREE.ShaderMaterial({
        uniforms: s.uniforms,
        vertexShader: VERT,
        fragmentShader: FRAG,
        transparent: true,
        depthWrite: false,
        side,
        blending: this.dark ? THREE.AdditiveBlending : THREE.NormalBlending,
      })
      const mesh = new THREE.Mesh(geom, mat)
      mesh.renderOrder = side === THREE.BackSide ? 5 : 6
      mesh.frustumCulled = false
      this.group.add(mesh)
      s.meshes.push(mesh)
    }
  }

  dispose() {
    for (const s of this.sets.values())
      for (const m of s.meshes) {
        m.geometry.dispose()
        ;(m.material as THREE.Material).dispose()
      }
    this.sets.clear()
  }
}
