// /dumping 모형 보기 데이터 기둥(24라운드 빛기둥 → 26라운드 칠한 블록, 2026-10-10 사용자: "3D 개체들 표현·가독·가시성이 지금 3D 지도에 맞는지 검토해 개선").
// 빛기둥(가는 반투명 원기둥 + 바닥 빛 테)은 구 전체 보기에서 통째로 사라졌고(격자 기둥 237개가 화면에 0), 가까이선 반투명 몸통이 뒤 건물 색과 섞여 대비가 약했다.
// 이제는 모형의 부품처럼 칠한 불투명 블록이다: 지도 레이어와 같은 발자국(칸 사각·원)을 가운데 쪽으로 줄여(thin) 세우고, 모형 층의 해·하늘빛을 받고(MeshLambert),
// 해 그림자를 드리우고 받는다. 윗면은 밝게 칠해 높이 끝이 읽히고, 다크는 제 색으로 조금 빛난다. 멀어져도 화면 폭 minPx 아래로는 안 가늘어진다(셰이더가 깊이로 잰다).
// 모양·높이·색·거르기는 지도 레이어와 같은 GeoJSON(dumping-map 이 setFC 하는 것)을 그대로 받아 같은 값을 말한다.
// 지도 압출 기둥은 투명(opacity 0)으로 남아 툴팁 조회를 맡고, 솟는 연출은 riseColumns 와 같은 곡선
import * as THREE from "three"
import { groundAt, lngLatToLocal, type ToonGround } from "@/lib/dumping/toon-world"

type FC = GeoJSON.FeatureCollection<GeoJSON.Geometry, Record<string, unknown>>

// 한국어 주석은 템플릿 밖에(카피 게이트). 정점은 발자국 가운데(aCenter, y는 땅)에서 화면 최소 폭만큼 벌리고(aHalf 실제 반폭 m), 높이는 uRise 만큼 솟는다.
// 깊이(clip w)는 그림자 패스에서도 본 카메라 행렬(uMain)로 잰다: 그림자 폭이 보이는 블록 폭과 같게
const VERT_PARS = /* glsl */ `
attribute vec3 aCenter;
attribute float aHalf;
attribute float aTop;
uniform float uRise;
uniform float uMinPx;
uniform float uPxK;
uniform mat4 uMain;
varying float vTop;
`
const VERT_BODY = /* glsl */ `
{
  vec4 tnC = uMain * vec4(aCenter, 1.0);
  float tnK = max(1.0, 0.5 * uMinPx * max(tnC.w, 1.0) / (max(uPxK, 1e-4) * max(aHalf, 0.01)));
  transformed.xz = aCenter.xz + (transformed.xz - aCenter.xz) * tnK;
  transformed.y = aCenter.y + (transformed.y - aCenter.y) * max(uRise, 0.001);
  vTop = aTop;
}
`
const FRAG_PARS = /* glsl */ `
uniform float uGlow;
varying float vTop;
`

type Uniforms = { uRise: { value: number }; uMinPx: { value: number }; uGlow: { value: number }; uPxK: { value: number }; uMain: { value: THREE.Matrix4 } }

interface BeamSet {
  fc: FC
  color?: string
  /** 블록 발자국 = 지도 발자국 × thin(가운데 쪽으로 줄임) */
  thin: number
  /** 화면 최소 폭(CSS px) */
  minPx: number
  filter: string | null
  rise: { t0: number; ms: number } | null
  mesh: THREE.Mesh | null
  uniforms: Uniforms
}

const patchVertex = (sh: { vertexShader: string }) => {
  sh.vertexShader = sh.vertexShader.replace("#include <common>", `#include <common>\n${VERT_PARS}`).replace("#include <begin_vertex>", `#include <begin_vertex>\n${VERT_BODY}`)
}

export class ToonBeams {
  readonly group = new THREE.Group()
  private readonly sets = new Map<string, BeamSet>()
  private ground: ToonGround | null = null
  private exag = 1
  private dark = false
  private readonly color = new THREE.Color()
  private readonly shared = { uPxK: { value: 1 }, uMain: { value: new THREE.Matrix4() } }
  private dirty = false

  /** 블록을 새로 세웠거나 솟는 중이었으면 true(그림자맵을 다시 그릴 때). 읽으면 지운다 */
  takeDirty(): boolean {
    const d = this.dirty
    this.dirty = false
    return d
  }

  setGround(g: ToonGround, exag: number) {
    this.ground = g
    this.exag = exag
    for (const id of this.sets.keys()) this.build(id)
  }

  /** 지도 기둥 레이어 하나의 데이터. color 를 주면 모든 기둥이 그 색(상습격자처럼 레이어 고정색), thin 은 발자국 비율, minPx 는 화면 최소 폭 */
  setData(id: string, fc: FC, color?: string, thin = 0.55, minPx = 5) {
    const s = this.sets.get(id)
    if (s) {
      s.fc = fc
      s.color = color
      s.thin = thin
      s.minPx = minPx
    } else
      this.sets.set(id, {
        fc,
        color,
        thin,
        minPx,
        filter: null,
        rise: null,
        mesh: null,
        uniforms: { uRise: { value: 1 }, uMinPx: { value: minPx }, uGlow: { value: this.dark ? 0.45 : 0 }, ...this.shared },
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
    for (const s of this.sets.values()) s.uniforms.uGlow.value = dark ? 0.45 : 0
  }

  /** 매 프레임: 본 카메라 행렬·화면 1m 픽셀×깊이(toon-layer pxK, 장치 픽셀)·솟는 중인 배율. 솟는 중이면 true */
  frame(proj: THREE.Matrix4, pxK: number): boolean {
    this.shared.uMain.value.copy(proj)
    this.shared.uPxK.value = pxK
    const dpr = typeof window === "undefined" ? 1 : window.devicePixelRatio || 1
    const now = performance.now()
    let moving = false
    for (const s of this.sets.values()) {
      s.uniforms.uMinPx.value = s.minPx * dpr
      if (!s.rise) continue
      const f = Math.min(1, (now - s.rise.t0) / s.rise.ms)
      s.uniforms.uRise.value = 1 - Math.pow(1 - f, 3)
      if (f >= 1) s.rise = null
      else moving = true
      this.dirty = true
    }
    return moving
  }

  private build(id: string) {
    const s = this.sets.get(id)
    if (!s) return
    this.dirty = true
    if (s.mesh) {
      this.group.remove(s.mesh)
      s.mesh.geometry.dispose()
      ;(s.mesh.material as THREE.Material).dispose()
      s.mesh.customDepthMaterial?.dispose()
      s.mesh = null
    }
    const P: number[] = []
    const N: number[] = []
    const C: number[] = []
    const Cn: number[] = []
    const H: number[] = []
    const T: number[] = []
    const I: number[] = []
    let center: [number, number, number] = [0, 0, 0]
    let half = 1
    const vert = (x: number, y: number, z: number, n: [number, number, number], top: number) => {
      P.push(x, y, z)
      N.push(...n)
      C.push(this.color.r, this.color.g, this.color.b)
      Cn.push(...center)
      H.push(half)
      T.push(top)
      return P.length / 3 - 1
    }
    // 삼각형을 want(바깥 법선) 쪽이 앞면이 되게 감는다(toon-geom Builder.tri 와 같은 규약, 앞면만 그린다)
    const tri = (a: number, b: number, c: number, want: [number, number, number]) => {
      const ux = P[b * 3] - P[a * 3], uy = P[b * 3 + 1] - P[a * 3 + 1], uz = P[b * 3 + 2] - P[a * 3 + 2]
      const vx = P[c * 3] - P[a * 3], vy = P[c * 3 + 1] - P[a * 3 + 1], vz = P[c * 3 + 2] - P[a * 3 + 2]
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx
      if (nx * want[0] + ny * want[1] + nz * want[2] >= 0) I.push(a, b, c)
      else I.push(a, c, b)
    }
    for (const f of s.fc.features) {
      const p = f.properties ?? {}
      if (s.filter !== null && p.dong !== s.filter) continue
      const g = f.geometry
      const ring = g.type === "Polygon" ? g.coordinates[0] : g.type === "MultiPolygon" ? g.coordinates[0]?.[0] : null
      if (!ring || ring.length < 4) continue
      const raw = ring.slice(0, -1).map(([lng, lat]) => lngLatToLocal(lng, lat))
      let cx = 0, cz = 0
      for (const [x, z] of raw) {
        cx += x
        cz += z
      }
      cx /= raw.length
      cz /= raw.length
      const h = Number(p.h) || 0
      const base = Number(p.base) || 0
      if (h <= base) continue
      const gy = (this.ground ? groundAt(this.ground, cx, cz) * this.exag : 0) + 0.3
      const pts = raw.map(([x, z]) => [cx + (x - cx) * s.thin, cz + (z - cz) * s.thin] as [number, number])
      center = [cx, gy, cz]
      half = pts.reduce((a, [x, z]) => a + Math.hypot(x - cx, z - cz), 0) / pts.length
      this.color.setStyle(s.color ?? String(p.color ?? "#888888"))
      const y0 = gy + base
      const y1 = gy + h
      // 옆면: 변마다 바깥 법선(변 가운데에서 발자국 가운데 반대쪽)
      for (let k = 0; k < pts.length; k++) {
        const a = pts[k]
        const b = pts[(k + 1) % pts.length]
        const len = Math.hypot(b[0] - a[0], b[1] - a[1])
        if (len < 1e-3) continue
        let n: [number, number, number] = [(b[1] - a[1]) / len, 0, -(b[0] - a[0]) / len]
        if (n[0] * ((a[0] + b[0]) / 2 - cx) + n[2] * ((a[1] + b[1]) / 2 - cz) < 0) n = [-n[0], 0, -n[2]]
        const v0 = vert(a[0], y0, a[1], n, 0)
        const v1 = vert(b[0], y0, b[1], n, 0)
        const v2 = vert(b[0], y1, b[1], n, 0)
        const v3 = vert(a[0], y1, a[1], n, 0)
        tri(v0, v1, v2, n)
        tri(v0, v2, v3, n)
      }
      // 윗면: 가운데 부채(발자국은 칸 사각·원이라 볼록)
      const up: [number, number, number] = [0, 1, 0]
      const c0 = vert(cx, y1, cz, up, 1)
      const cap = pts.map(([x, z]) => vert(x, y1, z, up, 1))
      for (let k = 0; k < cap.length; k++) tri(c0, cap[k], cap[(k + 1) % cap.length], up)
    }
    if (!I.length) return
    const geom = new THREE.BufferGeometry()
    geom.setAttribute("position", new THREE.Float32BufferAttribute(P, 3))
    geom.setAttribute("normal", new THREE.Float32BufferAttribute(N, 3))
    geom.setAttribute("color", new THREE.Float32BufferAttribute(C, 3))
    geom.setAttribute("aCenter", new THREE.Float32BufferAttribute(Cn, 3))
    geom.setAttribute("aHalf", new THREE.Float32BufferAttribute(H, 1))
    geom.setAttribute("aTop", new THREE.Float32BufferAttribute(T, 1))
    geom.setIndex(I)
    geom.computeBoundingSphere()
    const u = s.uniforms
    const mat = new THREE.MeshLambertMaterial({ color: "#ffffff", vertexColors: true })
    mat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, u)
      patchVertex(sh)
      // 윗면은 흰빛 쪽으로 22%(높이 끝), 다크는 제 색으로 조금 빛난다(밤 조명에서도 데이터 색이 읽히게)
      sh.fragmentShader = sh.fragmentShader
        .replace("#include <common>", `#include <common>\n${FRAG_PARS}`)
        .replace("#include <color_fragment>", "#include <color_fragment>\ndiffuseColor.rgb = mix(diffuseColor.rgb, vec3(1.0), 0.22 * vTop);")
        .replace("#include <emissivemap_fragment>", "#include <emissivemap_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb * uGlow;")
    }
    const depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking })
    depth.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, u)
      patchVertex(sh)
      sh.vertexShader = sh.vertexShader.replace("varying float vTop;", "")
      sh.vertexShader = sh.vertexShader.replace("vTop = aTop;", "")
    }
    const mesh = new THREE.Mesh(geom, mat)
    mesh.customDepthMaterial = depth
    mesh.castShadow = true
    mesh.receiveShadow = true
    mesh.frustumCulled = false
    mesh.renderOrder = 4
    this.group.add(mesh)
    s.mesh = mesh
  }

  dispose() {
    for (const s of this.sets.values()) {
      s.mesh?.geometry.dispose()
      ;(s.mesh?.material as THREE.Material | undefined)?.dispose()
      s.mesh?.customDepthMaterial?.dispose()
    }
    this.sets.clear()
  }
}
