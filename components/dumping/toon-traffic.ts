// /dumping 모형 보기 도로 위 차·사람(25라운드, 2026-10-10 사용자: "도로에 차와 사람들도 구현하면 좋겠어").
// 경로(toon-traffic.bin, scripts/dumping-toon-traffic.py: 차로·주차 줄·보행 줄)를 텍스처에 올리고 차·사람을 셰이더 안에서 경로 따라 움직인다(프레임마다 JS 계산 없음).
// 같은 차로는 같은 속도라 앞차와 간격 그대로 돈다(겹치지 않는다). 경로 끝에서 처음으로 돌아갈 때는 끝 6m 안에서 작아졌다 커진다. 꺾인 곳은 앞뒤 변 방향을 3m 안에서 섞는다.
// 골목·진입로 주차 차량은 6.2m 칸 일부만 채운 정지 인스턴스. 차는 줌 15쯤부터, 사람은 16쯤부터 나타난다(그보다 멀면 점보다 작다).
// 그림자는 차 밑 어두운 판으로 대신한다(움직이는 것까지 그림자맵을 프레임마다 다시 그리면 무겁다). 건물 그림자는 받는다. 밤엔 전조등·미등이 켜진다.
// 1km 덩어리마다 메시를 나눠 화면 밖 덩어리는 three 가 그리지 않는다. 색은 서울 등록 차량 색 분포(흰·검정·회색·은색이 대부분), 버스는 간선 파랑·지선 초록·광역 빨강
// 26라운드(사용자: "사람들은 안 그렸어? 학교·공원처럼 유동인구 많을 곳엔 사람이 있어야지"): 사람을 모형 비율로 키우고(1.6배, 키 2.6~3m) 옷 색을 또렷하게,
//   공원·학교 운동장·광장·캠퍼스 모임 자리(TNR2 spots)에서 원을 그리며 거닐거나 서 있게(학교는 아이 키, 밤엔 공원·학교 사람 대부분이 들어간다),
//   보도·모임 자리 사람 수는 그 칸 생활인구(중앙값 대비 제곱근, 0.35~2.4배)로 맞춘다. 줌 15쯤부터 보인다
import * as THREE from "three"
import { TrafficClass, TrafficKind, type ToonTraffic as TrafficData } from "@/lib/dumping/toon-world"

const PATH_TEX_W = 1024
const CHUNK_M = 1024
const SLOT_M = 6.2
const LIFT_M = 0.5 // 지도 지형 그물(약 15m 칸)과 경로 높이(DEM 쌍선형)의 차로 차가 땅에 묻히지 않게
const WALK_SPEED = 1.25
const PERSON_SCALE = 1.6 // 모형 비율(키 2.6~3m). 실제 크기면 줌 16에서 2~3화소라 안 보였다
/** 모임 자리 등급별 사람 수(생활인구 배율 곱하기 전) · 아이 비율 · 걷는 속도(m/s) */
const SPOT_PEOPLE: Record<number, [number, number, number]> = { [TrafficClass.park]: [3, 0.2, 0.8], [TrafficClass.school]: [5, 0.75, 1.7], [TrafficClass.plaza]: [4, 0.1, 0.9], [TrafficClass.campus]: [3, 0, 1.0] }

/** 차로 등급별 차로 하나 1km 당 대수 · 속도(m/s) */
const LANE: Record<number, [number, number]> = {
  [TrafficClass.trunk]: [24, 17],
  [TrafficClass.primary]: [28, 12.5],
  [TrafficClass.secondary]: [22, 11],
  [TrafficClass.tertiary]: [14, 9],
  [TrafficClass.link]: [9, 9],
  [TrafficClass.alley]: [2.5, 5],
  [TrafficClass.service]: [1.2, 4],
}
const PARK_FILL: Record<number, number> = { [TrafficClass.alley]: 0.28, [TrafficClass.service]: 0.3 }
/** 보행 줄 등급별 100m 당 사람(붐빔 배율 곱하기 전) */
const WALK_PER_100: Record<number, number> = { [TrafficClass.alley]: 0.35, [TrafficClass.sidewalk]: 1.2, [TrafficClass.footway]: 0.8 }

const CAR_COLORS: [string, number][] = [
  ["#efefeb", 0.31], ["#1c1e21", 0.19], ["#777b80", 0.15], ["#b7babd", 0.14], ["#24334c", 0.07],
  ["#912a2a", 0.04], ["#b4a68d", 0.04], ["#3a5c8b", 0.03], ["#3b5948", 0.03],
]
const TAXI = ["#e3892c", "#e3892c", "#d8dadb"]
const TRUCK = ["#f0f0ec", "#f0f0ec", "#2e5ea7"]
const BUS = ["#2b6cc5", "#2b6cc5", "#48993c", "#c33a30"]
const SHIRT = ["#f2f1ec", "#1f2226", "#2f3d57", "#8a8d91", "#e05a47", "#f2c94c", "#3f7fd0", "#4caf6e", "#f08a3c", "#e889b0", "#7b5fc4", "#2bb3b1"]
/** 크기(길이·높이·너비 m): 0 승용 · 1 SUV · 2 1톤 트럭 · 3 택시 · 4 버스 */
const SIZE: [number, number, number][] = [[4.6, 1.45, 1.82], [4.75, 1.72, 1.9], [5.0, 2.0, 1.74], [4.7, 1.48, 1.8], [11, 3.15, 2.5]]

const rgb = (hex: string) => new THREE.Color(hex)
function rng(seed: number) {
  let s = seed >>> 0 || 1
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const weighted = (list: [string, number][], r: number) => {
  let acc = 0
  for (const [c, w] of list) if (r < (acc += w)) return c
  return list[list.length - 1][0]
}

// ─── 단위 모양(길이 x −0.5~0.5 · 너비 z −0.5~0.5 · 높이 y 0~1, 인스턴스 크기를 곱한다). 면 종류: 0 차체/셔츠 · 1 유리/바지 · 2 전조등/살갗 · 3 미등 · 4 그림자 판 · 5 바퀴 ───
class Shape {
  P: number[] = []
  N: number[] = []
  T: number[] = []
  I: number[] = []
  quad(a: number[], b: number[], c: number[], d: number[], n: number[], part: number) {
    const o = this.P.length / 3
    this.P.push(...a, ...b, ...c, ...d)
    for (let k = 0; k < 4; k++) {
      this.N.push(...n)
      this.T.push(part)
    }
    this.I.push(o, o + 1, o + 2, o, o + 2, o + 3)
  }
  /** 상자(면 종류는 면마다: +x 앞 · −x 뒤 · ±z 옆 · +y 위 · −y 아래(bottom 이면)) */
  box(x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, part: { front?: number; back?: number; side?: number; top?: number; bottom?: number }) {
    const s = part.side ?? 0
    if (part.front !== -1) this.quad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [1, 0, 0], part.front ?? s)
    if (part.back !== -1) this.quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [-1, 0, 0], part.back ?? s)
    this.quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1], s)
    this.quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [0, 0, -1], s)
    if (part.top !== -1) this.quad([x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], [0, 1, 0], part.top ?? s)
    if (part.bottom !== undefined && part.bottom !== -1) this.quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [0, -1, 0], part.bottom)
  }
  plate(r: number, y: number) {
    this.quad([-r, y, r], [r, y, r], [r, y, -r], [-r, y, -r], [0, 1, 0], 4)
  }
  geometry(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry()
    g.setAttribute("position", new THREE.Float32BufferAttribute(this.P, 3))
    g.setAttribute("normal", new THREE.Float32BufferAttribute(this.N, 3))
    g.setAttribute("aPartV", new THREE.Float32BufferAttribute(this.T, 1))
    g.setIndex(this.I)
    return g
  }
}

function carShape(): THREE.BufferGeometry {
  const s = new Shape()
  s.plate(0.56, 0.012)
  s.box(0.24, 0.4, 0, 0.24, -0.49, 0.49, { side: 5, top: 5 })
  s.box(-0.4, -0.24, 0, 0.24, -0.49, 0.49, { side: 5, top: 5 })
  // 차체: 앞뒤 면은 아래 차체색 · 위 띠 등
  s.box(-0.5, 0.5, 0.14, 0.55, -0.5, 0.5, { front: -1, back: -1 })
  s.quad([0.5, 0.14, 0.5], [0.5, 0.14, -0.5], [0.5, 0.4, -0.5], [0.5, 0.4, 0.5], [1, 0, 0], 0)
  s.quad([0.5, 0.4, 0.5], [0.5, 0.4, -0.5], [0.5, 0.55, -0.5], [0.5, 0.55, 0.5], [1, 0, 0], 2)
  s.quad([-0.5, 0.14, -0.5], [-0.5, 0.14, 0.5], [-0.5, 0.4, 0.5], [-0.5, 0.4, -0.5], [-1, 0, 0], 0)
  s.quad([-0.5, 0.4, -0.5], [-0.5, 0.4, 0.5], [-0.5, 0.55, 0.5], [-0.5, 0.55, -0.5], [-1, 0, 0], 3)
  // 실내: 유리 둘레 + 차체색 지붕
  s.box(-0.32, 0.2, 0.55, 0.94, -0.43, 0.43, { side: 1, top: 0 })
  return s.geometry()
}

function busShape(): THREE.BufferGeometry {
  const s = new Shape()
  s.plate(0.54, 0.01)
  s.box(0.28, 0.38, 0, 0.16, -0.49, 0.49, { side: 5, top: 5 })
  s.box(-0.38, -0.28, 0, 0.16, -0.49, 0.49, { side: 5, top: 5 })
  s.box(-0.5, 0.5, 0.08, 0.5, -0.5, 0.5, { front: 2, back: 3 })
  s.box(-0.5, 0.5, 0.5, 0.88, -0.5, 0.5, { side: 1, top: -1 })
  s.box(-0.5, 0.5, 0.88, 1, -0.5, 0.5, {})
  return s.geometry()
}

function personShape(): THREE.BufferGeometry {
  const s = new Shape()
  s.plate(0.22, 0.01)
  s.box(-0.07, 0.07, 0, 0.47, -0.11, 0.11, { side: 1, top: 1 })
  s.box(-0.1, 0.1, 0.47, 0.83, -0.19, 0.19, { side: 0, top: 0 })
  s.box(-0.075, 0.075, 0.85, 1, -0.075, 0.075, { side: 2, top: 2 })
  return s.geometry()
}

// ─── 셰이더(한국어 주석은 템플릿 밖에: 카피 게이트가 문자열 안 한글을 화면 문구로 읽는다) ───
// 꼭짓점: aPath = (첫 꼭짓점, 꼭짓점 수, 경로 길이, 속도). 꼭짓점 수 0 이면 정지(aCar = 위치 x·y·z, 방위각).
// aPath.x 가 −1 이면 모임 자리: aPath = (−1, 반지름, 각속도, 밤에 숨김), aCar = (가운데 x·y·z, 처음 각). 각속도 0 은 서 있는 사람
// 움직이면 aCar = (출발 거리, 옆으로, 씨앗, ·). 경로 텍스처 텍셀 = (x, 지면 y × 과장 + 띄움, z, 누적 거리). 누적 거리로 이분 탐색
const VERT_PARS = /* glsl */ `
attribute float aPartV;
attribute vec4 aPath;
attribute vec4 aCar;
attribute vec3 aSize;
attribute vec3 aColor;
uniform highp sampler2D uPath;
uniform float uPathW;
uniform float uTime;
uniform float uFade;
uniform float uBob;
varying vec3 vTColor;
varying float vTY;
flat varying float vTPart;
flat varying float vTSeed;
vec3 tpPos;
vec3 tpFwd;
vec3 tpRight;
float tpScale;
float tpMove;
uniform float uNight;
vec4 tpTex(int i) { int w = int(uPathW); return texelFetch(uPath, ivec2(i % w, i / w), 0); }
void tpFrame() {
  tpScale = 1.0;
  tpMove = 1.0;
  if (aPath.x < -0.5) {
    float th = aCar.w + aPath.z * uTime;
    tpPos = aCar.xyz + vec3(cos(th), 0.0, sin(th)) * aPath.y;
    tpFwd = abs(aPath.z) < 0.0001 ? vec3(cos(aCar.w), 0.0, sin(aCar.w)) : vec3(-sin(th), 0.0, cos(th)) * sign(aPath.z);
    tpMove = step(0.0001, abs(aPath.z));
    tpScale = 1.0 - uNight * step(0.5, aPath.w);
  } else if (aPath.y < 0.5) {
    tpPos = aCar.xyz;
    tpFwd = vec3(cos(aCar.w), 0.0, sin(aCar.w));
  } else {
    int first = int(aPath.x + 0.5);
    int n = int(aPath.y + 0.5);
    float L = aPath.z;
    float s = mod(aCar.x + aPath.w * uTime, L);
    int lo = 0;
    int hi = n - 1;
    for (int it = 0; it < 17; it++) {
      if (hi - lo <= 1) break;
      int mid = (lo + hi) / 2;
      if (tpTex(first + mid).w <= s) lo = mid; else hi = mid;
    }
    vec4 a = tpTex(first + lo);
    vec4 b = tpTex(first + lo + 1);
    float t = clamp((s - a.w) / max(b.w - a.w, 0.001), 0.0, 1.0);
    tpPos = mix(a.xyz, b.xyz, t);
    vec3 d = normalize(b.xyz - a.xyz + vec3(0.0001, 0.0, 0.0));
    float ds = s - a.w;
    float de = b.w - s;
    if (ds < 3.0 && lo > 0) {
      vec4 p = tpTex(first + lo - 1);
      d = normalize(mix(normalize(a.xyz - p.xyz + vec3(0.0001, 0.0, 0.0)), d, 0.5 + 0.5 * ds / 3.0));
    } else if (de < 3.0 && lo + 2 < n) {
      vec4 q = tpTex(first + lo + 2);
      d = normalize(mix(d, normalize(q.xyz - b.xyz + vec3(0.0001, 0.0, 0.0)), 0.5 - 0.5 * de / 3.0));
    }
    tpFwd = aPath.w < 0.0 ? -d : d;
    tpScale = smoothstep(0.0, 6.0, s) * smoothstep(0.0, 6.0, L - s);
    vec2 h = normalize(tpFwd.xz);
    tpPos += vec3(-h.y, 0.0, h.x) * aCar.y;
  }
  vec2 hz = normalize(tpFwd.xz + vec2(0.00001, 0.0));
  tpRight = vec3(-hz.y, 0.0, hz.x);
  vTColor = aColor;
  vTPart = aPartV;
  vTY = position.y;
  vTSeed = aPath.x < -0.5 ? fract(aCar.w * 0.159) : aPath.y < 0.5 ? 0.0 : aCar.z;
}`
const VERT_NORMAL = /* glsl */ `
tpFrame();
vec2 tpH = normalize(tpFwd.xz + vec2(0.00001, 0.0));
vec3 objectNormal = vec3(tpH.x, 0.0, tpH.y) * normal.x + vec3(0.0, normal.y, 0.0) + tpRight * normal.z;`
const VERT_POS = /* glsl */ `
vec3 tpL = position * aSize * (tpScale * uFade);
vec3 transformed = tpPos + tpFwd * tpL.x + vec3(0.0, tpL.y, 0.0) + tpRight * tpL.z;
transformed.y += uBob * tpMove * abs(sin(uTime * 7.5 + vTSeed * 6.2832)) * 0.045 * aSize.y;`
const FRAG_PARS = /* glsl */ `
uniform float uNight;
uniform vec3 uGlassT;
uniform vec3 uLampF;
uniform vec3 uLampR;
uniform float uPerson;
varying vec3 vTColor;
varying float vTY;
flat varying float vTPart;
flat varying float vTSeed;
const vec3 TP_PANTS[4] = vec3[4](vec3(0.11, 0.15, 0.24), vec3(0.06, 0.06, 0.07), vec3(0.3, 0.3, 0.32), vec3(0.55, 0.49, 0.38));`
const FRAG_COLOR = /* glsl */ `
float tpP = floor(vTPart + 0.5);
vec3 tpC = vTColor;
if (tpP == 4.0) {
  tpC = vec3(0.1, 0.11, 0.12);
} else if (uPerson > 0.5) {
  if (tpP == 1.0) tpC = TP_PANTS[int(mod(floor(vTSeed * 4.0), 4.0))];
  else if (tpP == 2.0) tpC = vTY > 0.95 ? vec3(0.12, 0.1, 0.09) : vec3(0.82, 0.64, 0.5);
} else if (tpP == 1.0) {
  tpC = uGlassT;
} else if (tpP == 2.0) {
  tpC = vec3(0.9, 0.88, 0.8);
  totalEmissiveRadiance += uLampF * uNight;
} else if (tpP == 3.0) {
  tpC = vec3(0.5, 0.07, 0.05);
  totalEmissiveRadiance += uLampR * uNight;
} else if (tpP == 5.0) {
  tpC = vec3(0.05, 0.05, 0.06);
}
diffuseColor.rgb = tpC;`

interface Batch {
  /** 경계 상자에 넣은 경로 */
  seen: Set<number>
  path: number[]
  car: number[]
  size: number[]
  color: number[]
  lo: [number, number, number]
  hi: [number, number, number]
}
const newBatch = (): Batch => ({ seen: new Set(), path: [], car: [], size: [], color: [], lo: [Infinity, Infinity, Infinity], hi: [-Infinity, -Infinity, -Infinity] })

export class ToonTraffic {
  readonly group = new THREE.Group()
  private pathTex: THREE.DataTexture | null = null
  private readonly shapes = { car: carShape(), bus: busShape(), person: personShape() }
  private readonly common = {
    uPath: { value: null as THREE.Texture | null },
    uPathW: { value: PATH_TEX_W },
    uTime: { value: 0 },
  }
  private readonly carU = { ...this.common, uFade: { value: 0 }, uBob: { value: 0 }, uNight: { value: 0 }, uGlassT: { value: new THREE.Color("#2b3640") }, uLampF: { value: new THREE.Color("#fff3d6").multiplyScalar(2.6) }, uLampR: { value: new THREE.Color("#ff3b2a").multiplyScalar(2) }, uPerson: { value: 0 } }
  private readonly walkU = { ...this.common, uFade: { value: 0 }, uBob: { value: 1 }, uNight: { value: 0 }, uGlassT: { value: new THREE.Color("#2b3640") }, uLampF: { value: new THREE.Color("#000000") }, uLampR: { value: new THREE.Color("#000000") }, uPerson: { value: 1 } }
  private readonly carMat: THREE.MeshLambertMaterial
  private readonly walkMat: THREE.MeshLambertMaterial
  private readonly t0 = performance.now()
  /** 움직이는 것이 보이는 줌인가(지도에 계속 다시 그려 달라고 해야 하나) */
  animating = false

  constructor(dark: boolean) {
    this.carMat = this.material(this.carU)
    this.walkMat = this.material(this.walkU)
    this.setTheme(dark)
  }

  private material(u: Record<string, { value: unknown }>): THREE.MeshLambertMaterial {
    const m = new THREE.MeshLambertMaterial({ color: "#ffffff" })
    m.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, u)
      sh.vertexShader = sh.vertexShader
        .replace("#include <common>", `#include <common>\n${VERT_PARS}`)
        .replace("#include <beginnormal_vertex>", VERT_NORMAL)
        .replace("#include <begin_vertex>", VERT_POS)
      sh.fragmentShader = sh.fragmentShader.replace("#include <common>", `#include <common>\n${FRAG_PARS}`).replace("#include <emissivemap_fragment>", `#include <emissivemap_fragment>\n${FRAG_COLOR}`)
    }
    return m
  }

  setTheme(dark: boolean) {
    this.carU.uNight.value = dark ? 1 : 0
    this.walkU.uNight.value = dark ? 1 : 0
  }

  /** 경로를 텍스처에 올리고 차·주차·사람 인스턴스를 1km 덩어리 메시로 세운다. density(x, z) 는 그 자리 사람 배율(생활인구) */
  setData(t: TrafficData, exag: number, density: (x: number, z: number) => number = () => 1) {
    const nv = t.y.length
    const rows = Math.max(1, Math.ceil(nv / PATH_TEX_W))
    const tex = new Float32Array(PATH_TEX_W * rows * 4)
    const len = new Float32Array(t.count)
    for (let i = 0; i < t.count; i++) {
      let cum = 0
      for (let k = t.first[i]; k < t.first[i] + t.n[i]; k++) {
        if (k > t.first[i]) cum += Math.hypot(t.xz[k * 2] - t.xz[k * 2 - 2], t.xz[k * 2 + 1] - t.xz[k * 2 - 1])
        tex[k * 4] = t.xz[k * 2]
        tex[k * 4 + 1] = t.y[k] * exag + LIFT_M
        tex[k * 4 + 2] = t.xz[k * 2 + 1]
        tex[k * 4 + 3] = cum
      }
      len[i] = cum
    }
    this.pathTex?.dispose()
    this.pathTex = new THREE.DataTexture(tex, PATH_TEX_W, rows, THREE.RGBAFormat, THREE.FloatType)
    this.pathTex.minFilter = this.pathTex.magFilter = THREE.NearestFilter
    this.pathTex.generateMipmaps = false
    this.pathTex.needsUpdate = true
    this.common.uPath.value = this.pathTex

    const batches = new Map<string, Batch>()
    const batchAt = (shape: string, x: number, z: number) => {
      const key = `${shape}:${Math.floor(x / CHUNK_M)}:${Math.floor(z / CHUNK_M)}`
      let b = batches.get(key)
      if (!b) batches.set(key, (b = newBatch()))
      return b
    }
    const grow = (b: Batch, i: number) => {
      if (b.seen.has(i)) return
      b.seen.add(i)
      for (let k = t.first[i]; k < t.first[i] + t.n[i]; k++) {
        const x = t.xz[k * 2], z = t.xz[k * 2 + 1], y = t.y[k] * exag
        b.lo[0] = Math.min(b.lo[0], x); b.lo[1] = Math.min(b.lo[1], y); b.lo[2] = Math.min(b.lo[2], z)
        b.hi[0] = Math.max(b.hi[0], x); b.hi[1] = Math.max(b.hi[1], y + 12); b.hi[2] = Math.max(b.hi[2], z)
      }
    }
    const mid = (i: number): [number, number] => {
      const k = t.first[i] + (t.n[i] >> 1)
      return [t.xz[k * 2], t.xz[k * 2 + 1]]
    }
    const pushColor = (b: Batch, hex: string) => {
      const c = rgb(hex)
      b.color.push(c.r, c.g, c.b)
    }
    for (let i = 0; i < t.count; i++) {
      const L = len[i]
      if (L < 8) continue
      const r = rng(i * 2654435761 + 17)
      const [mx, mz] = mid(i)
      if (t.kind[i] === TrafficKind.lane) {
        const spec = LANE[t.cls[i]]
        if (!spec) continue
        let n = Math.floor((L / 1000) * spec[0] * (0.7 + 0.6 * r()) + r())
        n = Math.min(n, Math.floor(L / 9))
        if (n <= 0) continue
        const speed = spec[1] * (0.88 + 0.24 * r())
        const gap = L / n
        const start = r() * L
        for (let k = 0; k < n; k++) {
          const s0 = start + k * gap + (r() - 0.5) * Math.max(0, gap - 9) * 0.6
          const q = r()
          const big = t.cls[i] === TrafficClass.primary || t.cls[i] === TrafficClass.secondary
          const type = big && q < 0.05 ? 4 : q < (t.cls[i] >= TrafficClass.alley ? 0.15 : 0.11) ? 2 : q < 0.19 ? 3 : q < 0.42 ? 1 : 0
          const b = batchAt(type === 4 ? "bus" : "car", mx, mz)
          grow(b, i)
          b.path.push(t.first[i], t.n[i], L, speed)
          b.car.push(s0, 0, r(), 0)
          b.size.push(...SIZE[type])
          pushColor(b, type === 4 ? BUS[Math.floor(r() * BUS.length)] : type === 3 ? TAXI[Math.floor(r() * TAXI.length)] : type === 2 ? TRUCK[Math.floor(r() * TRUCK.length)] : weighted(CAR_COLORS, r()))
        }
      } else if (t.kind[i] === TrafficKind.park) {
        const fill = PARK_FILL[t.cls[i]] ?? 0.25
        const slots = Math.floor((L - 4) / SLOT_M)
        for (let k = 0; k < slots; k++) {
          if (r() >= fill) continue
          const s = 2 + (k + 0.5) * SLOT_M
          // 경로 위 자리·방향(정지 인스턴스라 여기서 한 번 푼다)
          let a = t.first[i]
          let cum = 0
          for (; a < t.first[i] + t.n[i] - 2; a++) {
            const d = Math.hypot(t.xz[a * 2 + 2] - t.xz[a * 2], t.xz[a * 2 + 3] - t.xz[a * 2 + 1])
            if (cum + d >= s) break
            cum += d
          }
          const dx = t.xz[a * 2 + 2] - t.xz[a * 2], dz = t.xz[a * 2 + 3] - t.xz[a * 2 + 1]
          const d = Math.hypot(dx, dz) || 1
          const f = Math.min(1, Math.max(0, (s - cum) / d))
          const x = t.xz[a * 2] + dx * f, z = t.xz[a * 2 + 1] + dz * f
          const y = (t.y[a] + (t.y[a + 1] - t.y[a]) * f) * exag + LIFT_M
          const type = r() < 0.15 ? 2 : r() < 0.35 ? 1 : 0
          const b = batchAt("car", x, z)
          b.lo[0] = Math.min(b.lo[0], x); b.lo[1] = Math.min(b.lo[1], y); b.lo[2] = Math.min(b.lo[2], z)
          b.hi[0] = Math.max(b.hi[0], x); b.hi[1] = Math.max(b.hi[1], y + 4); b.hi[2] = Math.max(b.hi[2], z)
          b.path.push(0, 0, 0, 0)
          b.car.push(x, y, z, Math.atan2(dz, dx) + (r() < 0.5 ? 0 : Math.PI))
          b.size.push(...SIZE[type])
          pushColor(b, type === 2 ? TRUCK[Math.floor(r() * TRUCK.length)] : weighted(CAR_COLORS, r()))
        }
      } else if (t.kind[i] === TrafficKind.walk) {
        const base = WALK_PER_100[t.cls[i]] ?? 0.5
        let n = Math.floor((L / 100) * base * t.boost[i] * density(mx, mz) * (0.7 + 0.6 * r()) + r())
        n = Math.min(n, Math.floor(L / 2.5))
        if (n <= 0) continue
        for (const dir of [1, -1]) {
          const m = dir > 0 ? Math.ceil(n / 2) : Math.floor(n / 2)
          if (m <= 0) continue
          const speed = dir * WALK_SPEED * (0.9 + 0.2 * r())
          const gap = L / m
          const start = r() * L
          const b = batchAt("person", mx, mz)
          grow(b, i)
          for (let k = 0; k < m; k++) {
            b.path.push(t.first[i], t.n[i], L, speed)
            b.car.push(start + k * gap + (r() - 0.5) * gap * 0.7, 0.45 + 0.25 * r(), r(), 0)
            const h = 1.6 + 0.25 * r()
            b.size.push(PERSON_SCALE, h * PERSON_SCALE, PERSON_SCALE)
            pushColor(b, SHIRT[Math.floor(r() * SHIRT.length)])
          }
        }
      }
    }
    // 모임 자리: 원을 그리며 거닐거나(각속도 ±v/반지름) 서 있다. 학교는 아이가 많고 빠르다, 공원·학교는 밤에 거의 들어간다
    const sp = t.spots
    for (let k = 0; k < sp.count; k++) {
      const spec = SPOT_PEOPLE[sp.cls[k]]
      if (!spec) continue
      const r = rng(k * 2246822519 + 911)
      const x = sp.xz[k * 2], z = sp.xz[k * 2 + 1], y = sp.y[k] * exag + LIFT_M
      const n = Math.min(8, Math.round(spec[0] * density(x, z) * (0.6 + 0.8 * r())))
      if (n <= 0) continue
      const b = batchAt("person", x, z)
      b.lo[0] = Math.min(b.lo[0], x - 12); b.lo[1] = Math.min(b.lo[1], y); b.lo[2] = Math.min(b.lo[2], z - 12)
      b.hi[0] = Math.max(b.hi[0], x + 12); b.hi[1] = Math.max(b.hi[1], y + 5); b.hi[2] = Math.max(b.hi[2], z + 12)
      const nightHide = sp.cls[k] === TrafficClass.park || sp.cls[k] === TrafficClass.school ? 1 : 0
      for (let j = 0; j < n; j++) {
        const kid = r() < spec[1]
        const idle = !kid && r() < 0.3
        const rad = Math.max(1.5, sp.r[k] * (0.45 + 0.55 * r()))
        const w = idle ? 0 : ((kid ? 1.4 : 0.85) * spec[2] * (0.8 + 0.4 * r())) / rad * (r() < 0.5 ? 1 : -1)
        b.path.push(-1, rad, w, nightHide && r() < 0.8 ? 1 : 0)
        b.car.push(x, y, z, r() * Math.PI * 2)
        const h = (kid ? 1.15 : 1.6 + 0.25 * r()) * PERSON_SCALE
        b.size.push(PERSON_SCALE * (kid ? 0.8 : 1), h, PERSON_SCALE * (kid ? 0.8 : 1))
        pushColor(b, SHIRT[Math.floor(r() * SHIRT.length)])
      }
    }
    for (const c of [...this.group.children]) {
      this.group.remove(c)
      ;(c as THREE.Mesh).geometry.dispose()
    }
    for (const [key, b] of batches) {
      const count = b.size.length / 3
      if (!count) continue
      const shape = key.split(":")[0] as keyof typeof this.shapes
      const base = this.shapes[shape]
      const g = new THREE.InstancedBufferGeometry()
      g.index = base.index
      for (const name of ["position", "normal", "aPartV"]) g.setAttribute(name, base.getAttribute(name))
      g.setAttribute("aPath", new THREE.InstancedBufferAttribute(new Float32Array(b.path), 4))
      g.setAttribute("aCar", new THREE.InstancedBufferAttribute(new Float32Array(b.car), 4))
      g.setAttribute("aSize", new THREE.InstancedBufferAttribute(new Float32Array(b.size), 3))
      g.setAttribute("aColor", new THREE.InstancedBufferAttribute(new Float32Array(b.color), 3))
      g.instanceCount = count
      const c = new THREE.Vector3((b.lo[0] + b.hi[0]) / 2, (b.lo[1] + b.hi[1]) / 2, (b.lo[2] + b.hi[2]) / 2)
      g.boundingSphere = new THREE.Sphere(c, Math.hypot(b.hi[0] - b.lo[0], b.hi[1] - b.lo[1], b.hi[2] - b.lo[2]) / 2 + 30)
      const mesh = new THREE.Mesh(g, shape === "person" ? this.walkMat : this.carMat)
      mesh.receiveShadow = true
      mesh.renderOrder = 3
      mesh.userData.kind = shape
      this.group.add(mesh)
    }
  }

  /** 줌에 따라 나타나기·시간. 움직이는 것이 보이면 true(계속 다시 그려야 한다) */
  frame(zoom: number): boolean {
    const car = THREE.MathUtils.smoothstep(zoom, 14.6, 15.3)
    const walk = THREE.MathUtils.smoothstep(zoom, 15.0, 15.6)
    const t = ((performance.now() - this.t0) / 1000) % 100000
    this.common.uTime.value = t
    this.carU.uFade.value = car
    this.walkU.uFade.value = walk
    for (const m of this.group.children) m.visible = (m.userData.kind === "person" ? walk : car) > 0.001
    this.animating = car > 0.001 && this.group.children.length > 0
    return this.animating
  }

  /** 지금 서 있는 인스턴스 수(검수용) */
  counts(): Record<string, number> {
    const out: Record<string, number> = {}
    for (const m of this.group.children) {
      const k = m.userData.kind as string
      out[k] = (out[k] ?? 0) + ((m as THREE.Mesh).geometry as THREE.InstancedBufferGeometry).instanceCount
    }
    return out
  }

  dispose() {
    for (const c of this.group.children) (c as THREE.Mesh).geometry.dispose()
    for (const g of Object.values(this.shapes)) g.dispose()
    this.carMat.dispose()
    this.walkMat.dispose()
    this.pathTex?.dispose()
  }
}
