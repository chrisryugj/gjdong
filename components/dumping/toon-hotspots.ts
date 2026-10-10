// /dumping 모형 보기 과태료(원 겹치기) 열점·쓰레기봉투 더미(26라운드, 2026-10-10 사용자: "통계를 청중이 쉽게 · 가시성 괜찮겠지?").
// 기둥 숲(높이가 비슷한 기둥 60여 개가 건물을 가렸다) 대신 땅 위 현장에 표시한다:
//  · 열점: 원(칸 가운데 원판, map-geo circleColumnsFC 그대로)마다 땅에 번지는 빛. 반지름 = 원 반지름 × 1.6, 가운데 진하게. 조망에서 동네 단위로 읽힌다
//  · 더미: 건수 상위 TOP_PILES 칸에 쓰레기봉투를 쌓는다(봉투 하나 = PER_BAG 건, 최대 MAX_BAGS). 가까이서 "여기 쓰레기가 쌓인다"가 바로 읽힌다(그림 단위 표현)
// 지도 원기둥 레이어는 투명으로 남아 툴팁을 받는다(빛기둥과 같은 규약). 솟기는 열점이 퍼지는 연출(rise), 더미는 다 퍼진 뒤 선다.
// 조망(줌 OVER_ZOOM 아래)에서는 땅의 빛이 지붕에 가려 구 전체에서 하나도 안 보였다(같은 날 3D 개체 검토) → 그때는 깊이 검사 없이 지붕 위로 겹쳐(열지도처럼) 그리고
// 화면 최소 반지름(MIN_PX)을 지키는 또렷한 점으로 그린다(진하기는 건수). 확대하면 다시 땅에 깔린 빛(건물이 가린다)
import * as THREE from "three"
import { groundAt, lngLatToLocal, type ToonGround } from "@/lib/dumping/toon-world"
import { leadMetric } from "./map-geo"

type FC = GeoJSON.FeatureCollection<GeoJSON.Geometry, Record<string, unknown>>

export const TOP_PILES = 24
export const PER_BAG = 3
const MAX_BAGS = 40
const BAG_SCALE = 1.7 // 모형 비율(봉투 지름 약 1m)
const SEG = 32
const OVER_ZOOM = 14.8
const MIN_PX = 5
// 종량제·재활용 봉투 흔한 색(흰·연두·하늘·검정·노랑)
const BAG_COLORS = ["#f4f3ef", "#f4f3ef", "#e4eedb", "#d6e4ee", "#2b2e33", "#efe1a0"]

// 한국어 주석은 템플릿 밖에(카피 게이트). 가운데(aR 0)에서 둘레(aR 1)로 옅어지는 빛, uRise 만큼 가운데에서 퍼진다
const VERT = /* glsl */ `
attribute vec3 aCenter;
attribute vec3 aColor;
attribute float aR;
attribute float aRad;
attribute float aW;
uniform float uRise;
uniform float uMinPx;
uniform float uPxK;
uniform mat4 uMain;
varying float vR;
varying vec3 vC;
varying float vW;
void main() {
  vR = aR;
  vC = aColor;
  vW = aW;
  vec4 c = uMain * vec4(aCenter, 1.0);
  float k = max(1.0, uMinPx * max(c.w, 1.0) / (max(uPxK, 1e-4) * max(aRad, 0.01)));
  vec3 p = aCenter + (position - aCenter) * uRise * k;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}`
const FRAG = /* glsl */ `
uniform float uOpacity;
uniform float uDark;
uniform float uOver;
varying float vR;
varying vec3 vC;
varying float vW;
void main() {
  // 조망은 또렷한 점(가운데 평평·가장자리만 부드럽게): 넓게 번지면 초록 집과 앰버가 섞여 흙빛이 됐다
  float a = mix(pow(1.0 - clamp(vR, 0.0, 1.0), 1.7), 1.0 - smoothstep(0.45, 1.0, vR), uOver);
  float ring = smoothstep(0.86, 0.93, vR) * (1.0 - smoothstep(0.93, 1.0, vR));
  vec3 c = vC;
  c += (1.0 - c) * 0.22 * uOver;
  float w = mix(1.0, 0.25 + 0.75 * vW, uOver);
  // 26라운드 후속 3: 가까이서 희미했다(0.62, 가장자리 흰빛 섞임) → 0.82, 테두리 0.35
  gl_FragColor = vec4(c, clamp((mix(0.82, 0.85, uOver) * a + 0.35 * ring) * uOpacity * w, 0.0, 1.0));
  #include <colorspace_fragment>
}`

interface Spot {
  x: number
  z: number
  y: number
  r: number
  v: number
  color: string
  dong: string
  cid: string
}

export class ToonHotspots {
  readonly group = new THREE.Group()
  private ground: ToonGround | null = null
  private exag = 1
  private dark = false
  private fc: FC | null = null
  private filter: string | null = null
  private rising: { t0: number; ms: number } | null = null
  private glow: THREE.Mesh | null = null
  private bags: THREE.InstancedMesh | null = null
  private readonly bagGeom = new THREE.IcosahedronGeometry(0.5, 1).scale(1, 0.78, 1)
  private readonly bagMat = new THREE.MeshLambertMaterial({ color: "#ffffff" })
  private readonly uniforms = { uRise: { value: 1 }, uOpacity: { value: 1 }, uDark: { value: 0 }, uMinPx: { value: MIN_PX }, uPxK: { value: 1 }, uMain: { value: new THREE.Matrix4() }, uOver: { value: 0 } }

  setGround(g: ToonGround, exag: number) {
    this.ground = g
    this.exag = exag
    this.build()
  }

  setData(fc: FC) {
    this.fc = fc
    this.build()
  }

  setFilter(dong: string | null) {
    if (this.filter === dong) return
    this.filter = dong
    this.build()
  }

  rise(ms = 900) {
    this.rising = { t0: performance.now(), ms: Math.max(ms, 1200) }
    this.uniforms.uRise.value = 0
    if (this.bags) this.bags.visible = false
  }

  setTheme(dark: boolean) {
    this.dark = dark
    this.uniforms.uDark.value = dark ? 1 : 0
    this.uniforms.uOpacity.value = dark ? 0.85 : 1
    if (this.glow) (this.glow.material as THREE.ShaderMaterial).blending = dark ? THREE.AdditiveBlending : THREE.NormalBlending
  }

  /** 매 프레임: 본 카메라 행렬·화면 1m 픽셀×깊이(toon-layer pxK)·줌. 퍼지는 중이면 true */
  frame(proj: THREE.Matrix4, pxK: number, zoom: number): boolean {
    this.uniforms.uMain.value.copy(proj)
    this.uniforms.uPxK.value = pxK
    this.uniforms.uMinPx.value = MIN_PX * (typeof window === "undefined" ? 1 : window.devicePixelRatio || 1)
    if (this.glow) {
      const m = this.glow.material as THREE.ShaderMaterial
      const over = zoom < OVER_ZOOM
      if (m.depthTest === over) m.depthTest = !over
      // 조망의 겹침은 점 지도처럼 진하게(초록 집 결 위에서 옅은 빛은 안 읽혔다)
      this.uniforms.uOver.value = over ? 1 : 0
    }
    if (!this.rising) return false
    const f = Math.min(1, (performance.now() - this.rising.t0) / this.rising.ms)
    this.uniforms.uRise.value = 1 - Math.pow(1 - f, 3)
    if (f >= 1) {
      this.rising = null
      if (this.bags) this.bags.visible = true
      return false
    }
    return true
  }

  /** 지금 서 있는 열점·봉투 수(검수용) */
  counts(): { spots: number; bags: number } {
    return { spots: this.glow ? ((this.glow.geometry.getAttribute("aR") as THREE.BufferAttribute).count / (SEG + 1)) : 0, bags: this.bags?.count ?? 0 }
  }

  private spots(): Spot[] {
    const out: Spot[] = []
    for (const f of this.fc?.features ?? []) {
      const p = f.properties ?? {}
      if (this.filter !== null && p.dong !== this.filter) continue
      const g = f.geometry
      const ring = g.type === "Polygon" ? g.coordinates[0] : null
      if (!ring || ring.length < 4) continue
      const pts = ring.slice(0, -1).map(([lng, lat]) => lngLatToLocal(lng, lat))
      let x = 0, z = 0
      for (const [px, pz] of pts) {
        x += px
        z += pz
      }
      x /= pts.length
      z /= pts.length
      let r = 0
      for (const [px, pz] of pts) r += Math.hypot(px - x, pz - z)
      r /= pts.length
      const y = (this.ground ? groundAt(this.ground, x, z) * this.exag : 0) + 0.6
      out.push({ x, z, y, r, v: Number(p.v) || 0, color: String(p.color ?? "#c47a2c"), dong: String(p.dong ?? ""), cid: String(p.cid ?? "") })
    }
    return out
  }

  private build() {
    if (this.glow) {
      this.group.remove(this.glow)
      this.glow.geometry.dispose()
      ;(this.glow.material as THREE.Material).dispose()
      this.glow = null
    }
    if (this.bags) {
      this.group.remove(this.bags)
      this.bags.dispose()
      this.bags = null
    }
    const spots = this.spots()
    if (!spots.length) return
    const P: number[] = [], Cn: number[] = [], C: number[] = [], R: number[] = [], Rad: number[] = [], W: number[] = [], I: number[] = []
    // 조망 진하기 = √(건수 / 그 지표 최댓값): 최소 반지름 때문에 1건 칸도 77건 칸만 해져 구 전체가 고르게 앰버였다
    const vMax = new Map<string, number>()
    for (const q of spots) vMax.set(q.cid, Math.max(vMax.get(q.cid) ?? 1, q.v))
    const col = new THREE.Color()
    // 큰 열점이 작은 것 위로 오게 작은 것부터
    for (const s of [...spots].sort((a, b) => a.r - b.r)) {
      col.setStyle(s.color)
      const rad = Math.max(22, s.r * 1.6)
      const o = P.length / 3
      P.push(s.x, s.y, s.z)
      Cn.push(s.x, s.y, s.z)
      C.push(col.r, col.g, col.b)
      R.push(0)
      Rad.push(rad)
      const wv = Math.sqrt(s.v / (vMax.get(s.cid) ?? 1))
      W.push(wv)
      for (let k = 0; k < SEG; k++) {
        const a = (k / SEG) * Math.PI * 2
        const gx = s.x + Math.cos(a) * rad, gz = s.z + Math.sin(a) * rad
        P.push(gx, (this.ground ? groundAt(this.ground, gx, gz) * this.exag : 0) + 0.6, gz)
        Cn.push(s.x, s.y, s.z)
        C.push(col.r, col.g, col.b)
        R.push(1)
        Rad.push(rad)
        W.push(wv)
      }
      for (let k = 0; k < SEG; k++) I.push(o, o + 1 + ((k + 1) % SEG), o + 1 + k)
    }
    const geom = new THREE.BufferGeometry()
    geom.setAttribute("position", new THREE.Float32BufferAttribute(P, 3))
    geom.setAttribute("aCenter", new THREE.Float32BufferAttribute(Cn, 3))
    geom.setAttribute("aColor", new THREE.Float32BufferAttribute(C, 3))
    geom.setAttribute("aR", new THREE.Float32BufferAttribute(R, 1))
    geom.setAttribute("aRad", new THREE.Float32BufferAttribute(Rad, 1))
    geom.setAttribute("aW", new THREE.Float32BufferAttribute(W, 1))
    geom.setIndex(I)
    geom.computeBoundingSphere()
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -3,
      polygonOffsetUnits: -6,
      blending: this.dark ? THREE.AdditiveBlending : THREE.NormalBlending,
    })
    this.glow = new THREE.Mesh(geom, mat)
    this.glow.renderOrder = 3
    this.glow.frustumCulled = false
    this.group.add(this.glow)
    // 봉투 더미: 대표 지표(숫자 카드와 같은 leadMetric)의 상위 칸만. 원뿔 모양으로 쌓는다(가운데 높게), 같은 칸은 늘 같은 더미(칸 자리 해시)
    const lead = leadMetric(spots.map((q) => q.cid))
    const top = spots.filter((q) => q.cid === lead).sort((a, b) => b.v - a.v).slice(0, TOP_PILES)
    const total = top.reduce((n, s) => n + Math.min(MAX_BAGS, Math.max(4, Math.round(s.v / PER_BAG))), 0)
    if (!total) return
    const bags = new THREE.InstancedMesh(this.bagGeom, this.bagMat, total)
    const m = new THREE.Matrix4()
    const q = new THREE.Quaternion()
    const e = new THREE.Euler()
    const sc = new THREE.Vector3()
    const pos = new THREE.Vector3()
    let k = 0
    for (const s of top) {
      const n = Math.min(MAX_BAGS, Math.max(4, Math.round(s.v / PER_BAG)))
      let seed = (Math.round(s.x * 10) * 73856093) ^ (Math.round(s.z * 10) * 19349663)
      const rnd = () => {
        seed = (seed * 1664525 + 1013904223) >>> 0
        return seed / 4294967296
      }
      const R0 = 0.55 * Math.sqrt(n) * BAG_SCALE
      for (let j = 0; j < n; j++) {
        const d = R0 * Math.sqrt(rnd())
        const a = rnd() * Math.PI * 2
        const sz = BAG_SCALE * (0.8 + 0.4 * rnd())
        pos.set(s.x + Math.cos(a) * d, s.y - 0.3 + sz * 0.35 + (R0 - d) * 0.55, s.z + Math.sin(a) * d)
        q.setFromEuler(e.set((rnd() - 0.5) * 0.6, rnd() * Math.PI * 2, (rnd() - 0.5) * 0.6))
        sc.set(sz, sz, sz)
        bags.setMatrixAt(k, m.compose(pos, q, sc))
        bags.setColorAt(k, col.setStyle(BAG_COLORS[Math.floor(rnd() * BAG_COLORS.length)]))
        k++
      }
    }
    bags.instanceMatrix.needsUpdate = true
    if (bags.instanceColor) bags.instanceColor.needsUpdate = true
    bags.receiveShadow = true
    bags.frustumCulled = false
    bags.renderOrder = 3
    bags.visible = !this.rising
    this.bags = bags
    this.group.add(bags)
  }

  dispose() {
    this.glow?.geometry.dispose()
    ;(this.glow?.material as THREE.Material | undefined)?.dispose()
    this.bags?.dispose()
    this.bagGeom.dispose()
    this.bagMat.dispose()
  }
}
