// /dumping 모형 보기 디오라마(26라운드, 2026-10-10 "실사와 카툰 사이 어중간" → 정교한 모형 방향, 사용자 채택). toon-layer 에서 나눴다.
// 구를 경계선대로 잘라 탁자 위에 올린 블록처럼: 경계를 따라 땅에서 SKIRT_M 아래까지 옆면(맨 위 겉흙·물 단면, 아래로 지층 줄무늬, 바닥 쪽 어둡게) + 블록 밑 그림자.
// 구 밖은 지도 마스크가 탁자색으로 덮는다(map-layers applyThemePaint). 건물 밑 접지 그늘 띠(toon-geom haloChunk) 재질도 여기
import * as THREE from "three"
import { groundAt, lngLatToLocal, type ToonGround } from "@/lib/dumping/toon-world"
import { signedArea } from "./toon-geom"

// 접지 그늘 띠(toon-geom haloChunk): 안쪽 진하고 바깥 0
const HALO_VERT = /* glsl */ `
attribute float aA;
varying float vA;
void main() {
  vA = aA;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`
const HALO_FRAG = /* glsl */ `
uniform vec3 uHalo;
uniform float uHaloA;
varying float vA;
void main() {
  gl_FragColor = vec4(uHalo, uHaloA * vA * vA);
  #include <colorspace_fragment>
}`
// 디오라마 옆면: 맨 위 띠(물이면 물빛, 땅이면 겉흙), 아래로 지층 줄무늬, 바닥 쪽 어둡게. 해 쪽을 보는 면이 밝다
const SKIRT_VERT = /* glsl */ `
attribute float aTop;
attribute float aWater;
varying float vDepth;
varying float vWater;
varying vec3 vN;
void main() {
  vDepth = aTop - position.y;
  vWater = aWater;
  vN = normal;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`
const SKIRT_FRAG = /* glsl */ `
uniform vec3 uSunDir;
uniform float uDepth;
uniform float uDark;
varying float vDepth;
varying float vWater;
varying vec3 vN;
void main() {
  float t = clamp(vDepth / uDepth, 0.0, 1.0);
  vec3 soil = mix(vec3(0.72, 0.58, 0.44), vec3(0.5, 0.39, 0.3), t);
  soil *= 0.94 + 0.06 * step(0.5, fract(vDepth / 14.0));
  vec3 top = mix(vec3(0.42, 0.47, 0.33), vec3(0.47, 0.71, 0.69), vWater);
  float band = vWater > 0.5 ? 10.0 : 3.5;
  vec3 c = mix(top, soil, smoothstep(band - 1.0, band + 1.0, vDepth));
  float sh = 0.74 + 0.26 * max(0.0, dot(normalize(vec2(vN.x, vN.z)), normalize(vec2(uSunDir.x, uSunDir.z))));
  c *= sh * mix(1.0, 0.62, smoothstep(0.7, 1.0, t));
  c = mix(c, c * 0.32, uDark);
  gl_FragColor = vec4(c, 1.0);
  #include <colorspace_fragment>
}`
// 블록 밑 그림자: 깊이 시험을 못 하니(옆면과 같은 이유) 카메라 반대쪽을 보는 변의 그림자는 접는다. 블록 뒤 그림자가 구 안(아차산 숲)을 가로질러 비쳤다(26라운드 검증)
const SHADOW_VERT = /* glsl */ `
attribute float aA;
attribute vec2 aN;
uniform vec3 uEye;
varying float vA;
void main() {
  vA = dot(aN, uEye.xz - position.xz) > 0.0 ? aA : 0.0;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`
const SHADOW_FRAG = /* glsl */ `
uniform float uShadowA;
varying float vA;
void main() {
  gl_FragColor = vec4(0.16, 0.14, 0.12, uShadowA * vA * vA);
  #include <colorspace_fragment>
}`
export const SKIRT_M = 180 // 블록 두께(지형 과장 뒤 m). 조망(줌 13)에서 20화소쯤

export type SkirtUniforms = { uSunDir: { value: THREE.Vector3 }; uDepth: { value: number }; uDark: { value: number }; uShadowA: { value: number }; uEye: { value: THREE.Vector3 } }

export function haloMaterial(u: { uHalo: { value: THREE.Color }; uHaloA: { value: number } }): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({ uniforms: u, vertexShader: HALO_VERT, fragmentShader: HALO_FRAG, transparent: true, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 })
}

/** 구 경계 [위도, 경도] → 블록 옆면·밑 그림자. 구 밖 땅(지도 지형)이 같은 높이라 깊이 시험을 하면 옆면이 땅에 묻힌다 →
 * 깊이 시험 없이, 바깥을 보는 면만(뒷면 버림) 맨 먼저 그린다 */
export function skirtGroup(ringLL: [number, number][], g: ToonGround, exag: number, u: SkirtUniforms): THREE.Group {
  let pts: [number, number][] = ringLL.map(([lat, lng]) => lngLatToLocal(lng, lat))
  if (pts.length > 2 && Math.hypot(pts[0][0] - pts[pts.length - 1][0], pts[0][1] - pts[pts.length - 1][1]) < 0.5) pts = pts.slice(0, -1)
  if (signedArea(pts) < 0) pts.reverse()
  // 지형을 따라가게 25m 안쪽으로 나눈다
  const fine: [number, number][] = []
  for (let k = 0; k < pts.length; k++) {
    const a = pts[k], b = pts[(k + 1) % pts.length]
    const m = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 25))
    for (let j = 0; j < m; j++) fine.push([a[0] + ((b[0] - a[0]) * j) / m, a[1] + ((b[1] - a[1]) * j) / m])
  }
  const ys = fine.map(([x, z]) => groundAt(g, x, z) * exag)
  const low = Math.min(...ys)
  const base = low - SKIRT_M
  const P: number[] = [], N: number[] = [], Top: number[] = [], W: number[] = [], I: number[] = []
  const SP: number[] = [], SA: number[] = [], SN: number[] = [], SI: number[] = []
  const n = fine.length
  for (let k = 0; k < n; k++) {
    const a = fine[k], b = fine[(k + 1) % n]
    const ya = ys[k] + 0.4, yb = ys[(k + 1) % n] + 0.4
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1
    const nx = (b[1] - a[1]) / len, nz = -(b[0] - a[0]) / len
    const water = (y: number) => (y < low + 1.8 * exag ? 1 : 0)
    const o = P.length / 3
    P.push(a[0], ya, a[1], b[0], yb, b[1], b[0], base, b[1], a[0], base, a[1])
    for (let j = 0; j < 4; j++) N.push(nx, 0, nz)
    Top.push(ya, yb, yb, ya)
    W.push(water(ya - 0.4), water(yb - 0.4), water(yb - 0.4), water(ya - 0.4))
    // 바깥에서 볼 때 반시계(법선이 바깥 n): a 위 → b 아래 → a 아래, a 위 → b 위 → b 아래
    I.push(o, o + 2, o + 3, o, o + 1, o + 2)
    // 블록 밑 그림자: 바닥 높이에서 바깥으로 140m
    const so = SP.length / 3
    SP.push(a[0], base, a[1], b[0], base, b[1], b[0] + nx * 140, base, b[1] + nz * 140, a[0] + nx * 140, base, a[1] + nz * 140)
    SA.push(1, 1, 0, 0)
    for (let j = 0; j < 4; j++) SN.push(nx, nz)
    SI.push(so, so + 1, so + 2, so, so + 2, so + 3)
  }
  const wall = new THREE.BufferGeometry()
  wall.setAttribute("position", new THREE.Float32BufferAttribute(P, 3))
  wall.setAttribute("normal", new THREE.Float32BufferAttribute(N, 3))
  wall.setAttribute("aTop", new THREE.Float32BufferAttribute(Top, 1))
  wall.setAttribute("aWater", new THREE.Float32BufferAttribute(W, 1))
  wall.setIndex(I)
  wall.computeBoundingSphere()
  const shadow = new THREE.BufferGeometry()
  shadow.setAttribute("position", new THREE.Float32BufferAttribute(SP, 3))
  shadow.setAttribute("aA", new THREE.Float32BufferAttribute(SA, 1))
  shadow.setAttribute("aN", new THREE.Float32BufferAttribute(SN, 2))
  shadow.setIndex(SI)
  shadow.computeBoundingSphere()
  const grp = new THREE.Group()
  const sm = new THREE.Mesh(shadow, new THREE.ShaderMaterial({ uniforms: u, vertexShader: SHADOW_VERT, fragmentShader: SHADOW_FRAG, transparent: true, depthTest: false, depthWrite: false, side: THREE.DoubleSide }))
  sm.renderOrder = -21
  const wm = new THREE.Mesh(wall, new THREE.ShaderMaterial({ uniforms: u, vertexShader: SKIRT_VERT, fragmentShader: SKIRT_FRAG, depthTest: false, depthWrite: false, side: THREE.FrontSide }))
  wm.renderOrder = -20
  for (const m of [sm, wm]) m.frustumCulled = false
  grp.add(sm, wm)
  return grp
}
