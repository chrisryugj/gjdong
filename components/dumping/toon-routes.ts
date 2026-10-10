// /dumping 모형 보기 청소차 노선(26라운드 후속 3, 2026-10-10 사용자: "청소차 노선도 거의 구분이 안 된다").
// 지도의 선은 지형에 구워져 건물 사이 땅에 깔린다: 기울인 시점에선 건물이 길을 가려 노선이 끊긴 점선처럼 보였다.
// 모형에서는 길 위에 자홍 띠벽을 세운다: 아래가 진하고 위로 옅어지는 반투명 벽 + 맨 위 밝은 테. 집중관리도로는 16m, 일반관리도로는 7m.
// 자홍은 다른 데이터(민원 파랑·과태료 앰버·다가구 초록·상습 벽돌·시설 다섯 색)에 안 쓰는 색이다. 조망에서는 지도 선(같은 자홍, 화면 굵기)이 맡는다
import * as THREE from "three"
import { groundAt, lngLatToLocal, type ToonGround } from "@/lib/dumping/toon-world"

type FC = GeoJSON.FeatureCollection<GeoJSON.Geometry, Record<string, unknown>>

export const ROUTE_COLOR = { light: "#c026d3", dark: "#e879f9" } as const
const H_FOCUS = 16
const H_GENERAL = 7
const STEP_M = 20

// 한국어 주석은 템플릿 밖에(카피 게이트). aT 0 바닥 1 꼭대기, aF 집중 1 일반 0
const VERT = /* glsl */ `
attribute float aT;
attribute float aF;
varying float vT;
varying float vF;
void main() {
  vT = aT;
  vF = aF;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`
const FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uDark;
varying float vT;
varying float vF;
void main() {
  float body = mix(0.78, 0.12, vT);
  float rim = smoothstep(0.86, 0.94, vT);
  float a = max(body, rim * 0.95) * mix(0.6, 1.0, vF);
  vec3 c = mix(uColor, vec3(1.0), rim * (1.0 - uDark) * 0.35);
  gl_FragColor = vec4(c, a);
  #include <colorspace_fragment>
}`

export class ToonRoutes {
  readonly group = new THREE.Group()
  private ground: ToonGround | null = null
  private exag = 1
  private fc: FC | null = null
  private mesh: THREE.Mesh | null = null
  private readonly uniforms = { uColor: { value: new THREE.Color(ROUTE_COLOR.light) }, uDark: { value: 0 } }

  setGround(g: ToonGround, exag: number) {
    this.ground = g
    this.exag = exag
    this.build()
  }

  setData(fc: FC | null) {
    this.fc = fc
    this.build()
  }

  setTheme(dark: boolean) {
    this.uniforms.uColor.value.set(dark ? ROUTE_COLOR.dark : ROUTE_COLOR.light)
    this.uniforms.uDark.value = dark ? 1 : 0
  }

  private build() {
    if (this.mesh) {
      this.group.remove(this.mesh)
      this.mesh.geometry.dispose()
      ;(this.mesh.material as THREE.Material).dispose()
      this.mesh = null
    }
    if (!this.fc || !this.ground) return
    const P: number[] = [], T: number[] = [], F: number[] = [], I: number[] = []
    const g = this.ground
    for (const f of this.fc.features) {
      if (f.geometry.type !== "LineString") continue
      const focus = Number(f.properties?.focus) === 1 ? 1 : 0
      const h = focus ? H_FOCUS : H_GENERAL
      // 20m 마다 나눠 지형을 따라가게
      const pts: [number, number][] = []
      const raw = f.geometry.coordinates.map(([lng, lat]) => lngLatToLocal(lng, lat))
      for (let k = 0; k < raw.length - 1; k++) {
        const [ax, az] = raw[k], [bx, bz] = raw[k + 1]
        const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / STEP_M))
        for (let j = 0; j < n; j++) pts.push([ax + ((bx - ax) * j) / n, az + ((bz - az) * j) / n])
      }
      if (raw.length) pts.push(raw[raw.length - 1])
      if (pts.length < 2) continue
      const base = P.length / 3
      for (const [x, z] of pts) {
        const y = groundAt(g, x, z) * this.exag + 0.6
        P.push(x, y, z, x, y + h, z)
        T.push(0, 1)
        F.push(focus, focus)
      }
      for (let k = 0; k < pts.length - 1; k++) {
        const a = base + k * 2
        I.push(a, a + 2, a + 1, a + 1, a + 2, a + 3)
      }
    }
    if (!I.length) return
    const geom = new THREE.BufferGeometry()
    geom.setAttribute("position", new THREE.Float32BufferAttribute(P, 3))
    geom.setAttribute("aT", new THREE.Float32BufferAttribute(T, 1))
    geom.setAttribute("aF", new THREE.Float32BufferAttribute(F, 1))
    geom.setIndex(I)
    geom.computeBoundingSphere()
    const mat = new THREE.ShaderMaterial({ uniforms: this.uniforms, vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false, side: THREE.DoubleSide })
    this.mesh = new THREE.Mesh(geom, mat)
    this.mesh.renderOrder = 7
    this.mesh.frustumCulled = false
    this.group.add(this.mesh)
  }

  dispose() {
    this.mesh?.geometry.dispose()
    ;(this.mesh?.material as THREE.Material | undefined)?.dispose()
    this.mesh = null
  }
}
