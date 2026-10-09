// /dumping 모형 보기(23라운드, 2026-10-09) three.js 커스텀 레이어. sunlight-fund 모형 보기를 이 지도로 옮기고 더 밀었다:
// 계단 명암(MeshToon) · 화면 폭이 일정한 윤곽선(뒷면 껍질) · 박공지붕·옥탑 · 창 무늬와 밤 창 불빛 · 해 그림자맵(보는 곳을 따라감) · 날씨(조명·눈·젖은 땅).
// 숲·공원 나무와 구름은 toon-decor.ts.
// 건물은 GIS건물통합정보 전수(toon-buildings.bin)를 구 전체 한 번에 싣고 512m 덩어리로 나눠 절두체로 거른다.
// 데이터 색은 지도 압출과 같은 규칙으로 동마다 벽·지붕 두 텍셀(toon-palette)에 담고, 바탕을 바꾸면 그 텍스처만 다시 올린다(기하 그대로).
// 깊이는 지도와 나눈다(지우지 않는다): 뒤에 그리는 기둥·말뚝(fill-extrusion)이 건물과 서로 가린다. 아이콘 층(icons3d)은 그 위에 깊이를 지우고 그린다.
import * as THREE from "three"
import type { CustomLayerInterface, CustomRenderMethodInput, Map as MlMap } from "maplibre-gl"
import { decodeBuildings, decodeGround, decodeTrees, groundAt, localToLngLat, TOON_ANCHOR, type ToonBuildings, type ToonGround } from "@/lib/dumping/toon-world"
import type { GridCell } from "@/lib/dumping/types"
import { buildChunk, centroidOf, chunkIds, CHUNK_M } from "./toon-geom"
import { toonColors, type ToonPaint } from "./toon-palette"
import { anchorMatrix, hullMaterial, hullUniforms, loadAsset, toonMaterial } from "./toon-assets"
import { ToonDecor } from "./toon-decor"
import { cellLookup } from "./map-geo"
import { weatherLook, type SkyWeather } from "@/lib/dumping/map-weather"

export type ToonPaintInput = Omit<ToonPaint, "cellOf" | "floors">

const COLOR_TEX_W = 1024
const SUN_AZIMUTH = (215 * Math.PI) / 180 // 남서쪽 오후 해(그림자는 북동으로). 시간 자료가 없어 고정
const SUN_ALTITUDE = (44 * Math.PI) / 180
const RECEIVER_SEG = 112

const THEMES = {
  light: {
    sky: "#fffaf1", ground: "#d6d3cc", hemi: 1.3, sun: "#fff2dc", sunI: 2.05, shadow: 0.5,
    ink: "#3a332b", glass: "#9cb6c6", receiver: { color: "#41505e", opacity: 0.24 }, night: 0,
  },
  dark: {
    sky: "#7d8ca8", ground: "#262b33", hemi: 0.95, sun: "#b4c3e0", sunI: 0.9, shadow: 0.45,
    ink: "#07090b", glass: "#2f3d47", receiver: { color: "#000000", opacity: 0.3 }, night: 1,
  },
} as const

// 건물 재질에 넣는 셰이더 조각(한국어 주석은 템플릿 밖에: 카피 게이트가 문자열 안 한글을 화면 문구로 읽는다)
// 꼭짓점: 동 번호로 색 텍스처에서 벽·지붕 색을 읽어 넘긴다. 조각: 면 법선(화면 미분)이 위를 보면 지붕색, 벽이면 창 무늬
// 창은 벽 따라 간격마다·층마다 사각, 지면 0.8m 아래와 벽 꼭대기 0.5m 위는 비우고, 창 간격이 화면 몇 픽셀보다 작아지면 거둔다(계단·깜박임 방지).
// 밤(uNight)이면 창마다 해시가 uLit 보다 작은 창에 불이 켜진다. 눈(uRoofSnow)은 지붕면에만 쌓인다(데이터 색이 없을 때만, setWeather)
const VERT_PARS = /* glsl */ `
attribute vec4 aB;
uniform highp sampler2D uColors;
uniform float uColorsW;
varying vec3 vLocal;
varying vec4 vB;
varying vec3 vWallC;
varying vec3 vRoofC;`
const VERT_MAIN = /* glsl */ `
vLocal = position;
vB = aB;
int tnI = int(aB.x + 0.5) * 2;
int tnW = int(uColorsW);
vWallC = texelFetch(uColors, ivec2(tnI % tnW, tnI / tnW), 0).rgb;
vRoofC = texelFetch(uColors, ivec2((tnI + 1) % tnW, (tnI + 1) / tnW), 0).rgb;`
const FRAG_PARS = /* glsl */ `
uniform vec3 uGlass;
uniform float uNight;
uniform float uLit;
uniform vec3 uGlow;
uniform float uRoofSnow;
uniform vec3 uSnowC;
varying vec3 vLocal;
varying vec4 vB;
varying vec3 vWallC;
varying vec3 vRoofC;
float tnHash(vec3 p) {
  p = fract(p * vec3(0.1031, 0.1030, 0.0973));
  p += dot(p, p.yzx + 33.33);
  return fract((p.x + p.y) * p.z);
}`
const FRAG_COLOR = /* glsl */ `
vec3 tnN = normalize(cross(dFdx(vLocal), dFdy(vLocal)));
float tnRoof = smoothstep(0.45, 0.7, abs(tnN.y));
diffuseColor.rgb = mix(vWallC, vRoofC, tnRoof);
diffuseColor.rgb = mix(diffuseColor.rgb, uSnowC, uRoofSnow * tnRoof);
float tnWin = 0.0;
float tnLit = 0.0;
if (tnRoof < 0.5 && vB.w < 2.5) {
  vec2 tnT = normalize(vec2(-tnN.z, tnN.x) + 1e-6);
  float tnU = dot(vLocal.xz, tnT);
  float tnH = vLocal.y - vB.y;
  float tnSpan = vB.w < 0.5 ? 3.4 : (vB.w < 1.5 ? 3.0 : 2.5);
  float tnFu = fract(tnU / tnSpan);
  float tnFv = fract(tnH / 3.2);
  tnWin = smoothstep(0.30, 0.36, tnFu) * (1.0 - smoothstep(0.64, 0.70, tnFu)) * smoothstep(0.30, 0.36, tnFv) * (1.0 - smoothstep(0.72, 0.78, tnFv));
  tnWin *= step(0.8, tnH) * step(tnH, vB.z - vB.y - 0.5);
  tnWin *= 1.0 - smoothstep(0.3, 0.6, fwidth(tnU) / tnSpan * 3.0);
  float tnR = tnHash(vec3(vB.x, floor(tnH / 3.2), floor(tnU / tnSpan)));
  tnLit = tnWin * step(tnR, uLit) * uNight;
}
diffuseColor.rgb = mix(diffuseColor.rgb, uGlass, tnWin * 0.8);`
const FRAG_EMISSIVE = /* glsl */ `
totalEmissiveRadiance += uGlow * tnLit;`
interface BuildingChunk {
  mesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshToonMaterial>
  hull: THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>
}
const TMP_V = new THREE.Vector4()
const TMP_P = new THREE.Vector3()

export class ToonLayer implements CustomLayerInterface {
  id = "dump-toon"
  type = "custom" as const
  renderingMode = "3d" as const
  visible = false
  /** 건물이 다 섰나(로딩 커튼 03 단계가 이걸 기다린다) */
  ready = false
  private map: MlMap | null = null
  private renderer: THREE.WebGLRenderer | null = null
  private readonly scene = new THREE.Scene()
  private readonly camera = new THREE.Camera()
  private readonly anchor = anchorMatrix(TOON_ANCHOR)
  private readonly exag: number
  private dark: boolean
  private bld: ToonBuildings | null = null
  private ground: ToonGround | null = null
  private cellOf: Int32Array | null = null
  private paint: ToonPaintInput | null = null
  private readonly chunks: BuildingChunk[] = []
  private readonly decor: ToonDecor
  private colorBytes = new Uint8Array(4)
  private colorTex = new THREE.DataTexture(this.colorBytes, 1, 1)
  private readonly hullU = hullUniforms()
  private readonly bldU = {
    uColors: { value: this.colorTex as THREE.Texture },
    uColorsW: { value: COLOR_TEX_W },
    uGlass: { value: new THREE.Color(THEMES.light.glass) },
    uNight: { value: 0 },
    uLit: { value: 0.42 },
    uGlow: { value: new THREE.Color("#ffc76a").multiplyScalar(1.6) },
    uRoofSnow: { value: 0 },
    uSnowC: { value: new THREE.Color("#f7f9fc") },
  }
  private weather: SkyWeather = { kind: "clear", level: 0.35 }
  /** 땅 눈·젖음 덮개(지면 격자 전체, 그림자만 보이는 받이 아래) */
  private tint: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial> | null = null
  private readonly bldMat: THREE.MeshToonMaterial
  private readonly bldHullMat: THREE.ShaderMaterial
  private readonly hemi = new THREE.HemisphereLight()
  private readonly sun = new THREE.DirectionalLight()
  private readonly receiver: THREE.Mesh<THREE.PlaneGeometry, THREE.ShadowMaterial>
  private shadowAt = { x: Infinity, z: Infinity, half: 0 }
  private shadowDirty = true
  private disposed = false

  constructor(opts: { dark: boolean; exag: number }) {
    this.exag = opts.exag
    this.dark = opts.dark
    this.bldMat = toonMaterial("#ffffff")
    this.bldMat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, this.bldU)
      sh.vertexShader = sh.vertexShader.replace("#include <common>", `#include <common>\n${VERT_PARS}`).replace("#include <begin_vertex>", `#include <begin_vertex>\n${VERT_MAIN}`)
      sh.fragmentShader = sh.fragmentShader
        .replace("#include <common>", `#include <common>\n${FRAG_PARS}`)
        .replace("#include <color_fragment>", `#include <color_fragment>\n${FRAG_COLOR}`)
        .replace("#include <emissivemap_fragment>", `#include <emissivemap_fragment>\n${FRAG_EMISSIVE}`)
    }
    this.bldHullMat = hullMaterial(this.hullU, THEMES.light.ink)
    this.sun.castShadow = true
    const s = this.sun.shadow
    const big = Math.min(window.innerWidth, window.innerHeight) >= 768
    s.mapSize.set(big ? 2048 : 1024, big ? 2048 : 1024)
    s.bias = -0.0006
    s.normalBias = 0
    s.radius = 2
    this.scene.add(this.hemi, this.sun, this.sun.target)
    this.receiver = new THREE.Mesh(new THREE.PlaneGeometry(1, 1, RECEIVER_SEG, RECEIVER_SEG).rotateX(-Math.PI / 2), new THREE.ShadowMaterial({ depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 }))
    this.receiver.receiveShadow = true
    this.receiver.frustumCulled = false
    this.receiver.renderOrder = 2
    this.scene.add(this.receiver)
    this.decor = new ToonDecor(this.hullU, this.exag, opts.dark)
    this.scene.add(this.decor.group)
    this.setTheme(opts.dark)
  }

  // ─── 자료 ───

  /** 정적 자료 셋을 받아 건물(가까운 덩어리부터)·나무·구름을 세운다. 건물이 다 서면 resolve(나무·구름은 뒤따른다) */
  async load(base: string, near: [number, number] = [0, 0]): Promise<void> {
    const get = (f: string) => fetch(`${base}/${f}`).then((r) => {
      if (!r.ok) throw new Error(`${f} ${r.status}`)
      return r.arrayBuffer()
    })
    const [bBuf, gBuf] = await Promise.all([get("toon-buildings.bin"), get("toon-ground.bin")])
    if (this.disposed) return
    const bld = decodeBuildings(bBuf)
    this.bld = bld
    this.ground = decodeGround(gBuf)
    this.addTint(this.ground)
    this.colorBytes = new Uint8Array(COLOR_TEX_W * Math.ceil((bld.count * 2) / COLOR_TEX_W) * 4)
    this.colorTex.dispose()
    this.colorTex = new THREE.DataTexture(this.colorBytes, COLOR_TEX_W, this.colorBytes.length / 4 / COLOR_TEX_W, THREE.RGBAFormat)
    this.colorTex.colorSpace = THREE.SRGBColorSpace
    this.colorTex.minFilter = this.colorTex.magFilter = THREE.NearestFilter
    this.colorTex.generateMipmaps = false
    this.bldU.uColors.value = this.colorTex
    this.repaint()
    // 덩어리를 지금 보는 곳에서 가까운 순으로 세운다. 한 덩어리마다 한 번 숨을 돌려 첫 화면이 멈추지 않게
    const groups = [...chunkIds(bld).entries()].map(([key, ids]) => {
      const [ix, iz] = key.split(":").map(Number)
      return { ids, d: Math.hypot((ix + 0.5) * CHUNK_M - near[0], (iz + 0.5) * CHUNK_M - near[1]) }
    })
    groups.sort((a, b) => a.d - b.d)
    let last = performance.now()
    for (const g of groups) {
      if (this.disposed) return
      this.addChunk(g.ids)
      if (performance.now() - last > 12) {
        this.map?.triggerRepaint()
        await new Promise((r) => setTimeout(r, 0))
        last = performance.now()
      }
    }
    this.ready = true
    this.shadowDirty = true
    this.map?.triggerRepaint()
    void this.loadDecor(get).catch(() => {
      // 나무·구름은 장식이라 못 받아도 건물·데이터는 그대로
    })
  }

  private addChunk(ids: number[]) {
    const c = buildChunk(this.bld!, ids, this.exag)
    const geom = new THREE.BufferGeometry()
    geom.setAttribute("position", new THREE.BufferAttribute(c.position, 3))
    geom.setAttribute("aB", new THREE.BufferAttribute(c.info, 4))
    geom.setAttribute("aOut", new THREE.BufferAttribute(c.out, 3))
    geom.setIndex(new THREE.BufferAttribute(c.index, 1))
    geom.computeBoundingSphere()
    const mesh = new THREE.Mesh(geom, this.bldMat)
    // 그림자는 땅(받이)에만 드리운다. 건물이 받으면 해 반대쪽 벽이 계단 명암에 그림자까지 겹쳐 흙빛이 됐다(첫 캡처)
    mesh.castShadow = true
    mesh.receiveShadow = false
    const hull = new THREE.Mesh(geom, this.bldHullMat)
    this.scene.add(mesh, hull)
    this.chunks.push({ mesh, hull })
  }

  private async loadDecor(get: (f: string) => Promise<ArrayBuffer>) {
    const [tBuf, broad, pine, cloud] = await Promise.all([get("toon-trees.bin"), loadAsset("tree-broad"), loadAsset("tree-pine"), loadAsset("cloud")])
    if (this.disposed) return
    this.decor.addTrees(decodeTrees(tBuf), [broad, pine])
    this.decor.addClouds(cloud)
    this.shadowDirty = true
    this.map?.triggerRepaint()
  }

  // ─── 색·테마 ───

  /** 바탕·선택·켜진 레이어가 바뀔 때. 격자 칸은 처음 한 번만 붙인다(격자는 불변) */
  setPaint(p: ToonPaintInput) {
    this.paint = p
    this.repaint()
  }

  private repaint() {
    const bld = this.bld
    const p = this.paint
    if (!bld || !p) return
    if (!this.cellOf && p.grid.length) this.cellOf = this.joinCells(bld, p.grid)
    if (!this.cellOf) return
    toonColors({ ...p, cellOf: this.cellOf, floors: bld.floors }, this.colorBytes)
    this.colorTex.needsUpdate = true
    this.applySnow()
    this.map?.triggerRepaint()
  }

  /** 동 꼭짓점 평균 → 경위도 → 격자 칸(지도 압출 건물 조인과 같은 중심점 규칙) */
  private joinCells(bld: ToonBuildings, grid: GridCell[]): Int32Array {
    const lookup = cellLookup(grid)
    const out = new Int32Array(bld.count)
    for (let i = 0; i < bld.count; i++) {
      const [x, z] = centroidOf(bld, i)
      const [lng, lat] = localToLngLat(x, z)
      out[i] = lookup(lat, lng)
    }
    return out
  }

  setTheme(dark: boolean) {
    this.dark = dark
    const t = dark ? THEMES.dark : THEMES.light
    this.receiver.material.color.set(t.receiver.color)
    ;(this.bldHullMat.uniforms.uInk.value as THREE.Color).set(t.ink)
    this.bldU.uGlass.value.set(t.glass)
    this.bldU.uNight.value = t.night
    this.decor.setTheme(dark)
    this.applyLight()
    if (this.paint) this.repaint()
    this.shadowDirty = true
    this.map?.triggerRepaint()
  }

  /** 지도 날씨(lib/dumping/map-weather): 해·주변광·그림자 · 구름 수와 색 · 지붕(데이터 색 없을 때)·나무·땅 눈 · 젖은 땅 */
  setWeather(w: SkyWeather) {
    if (w.kind === this.weather.kind && Math.abs(w.level - this.weather.level) < 1e-3) return
    this.weather = w
    this.applyLight()
    this.shadowDirty = true
    this.map?.triggerRepaint()
  }

  /** 테마 기본 조명 × 날씨 배율. 구름 색, 눈·젖음도 같이 */
  private applyLight() {
    const t = this.dark ? THEMES.dark : THEMES.light
    const w = weatherLook(this.weather, this.dark)
    this.hemi.color.set(w.skyColor ?? t.sky)
    this.hemi.groundColor.set(w.groundColor ?? t.ground)
    this.hemi.intensity = t.hemi * w.hemi
    this.sun.color.set(w.sunColor ?? t.sun)
    this.sun.intensity = t.sunI * w.sun
    this.sun.shadow.intensity = w.shadow
    this.receiver.material.opacity = t.receiver.opacity * Math.min(1, w.shadow / t.shadow)
    this.applySnow()
  }

  /** 눈은 데이터 색이 없는 지붕(바탕 없음)에만 쌓인다: 바탕 지표가 칠한 지붕을 덮으면 범례 색이 어긋난다. 나무·땅은 늘 */
  private applySnow() {
    const w = weatherLook(this.weather, this.dark)
    this.bldU.uSnowC.value.set(this.dark ? "#c3cfdd" : "#f7f9fc")
    this.bldU.uRoofSnow.value = this.paint?.base === "none" ? w.snow * 0.9 : 0
    this.decor.setLook(w, this.bldU.uSnowC.value)
    const tint = this.tint
    if (!tint) return
    if (w.snow > 0) {
      tint.material.color.set(this.dark ? "#a9b8cc" : "#ffffff")
      tint.material.opacity = (this.dark ? 0.3 : 0.6) * w.snow
    } else if (w.wet > 0) {
      tint.material.color.set(this.dark ? "#000000" : "#2c3846")
      tint.material.opacity = (this.dark ? 0.2 : 0.16) * w.wet
    } else tint.material.opacity = 0
    tint.visible = tint.material.opacity > 0.005
  }

  /** 땅 덮개: toon-ground 격자 그대로(지형 × 과장 + 0.7m). 그림자 받이보다 먼저 그려 그림자가 눈 위에 진다 */
  private addTint(g: ToonGround) {
    const pos = new Float32Array(g.nx * g.nz * 3)
    for (let j = 0; j < g.nz; j++)
      for (let i = 0; i < g.nx; i++) {
        const k = j * g.nx + i
        pos[k * 3] = g.x0 + i * g.cell
        pos[k * 3 + 1] = g.h[k] * this.exag + 0.7
        pos[k * 3 + 2] = g.z0 + j * g.cell
      }
    const idx = new Uint32Array((g.nx - 1) * (g.nz - 1) * 6)
    let o = 0
    for (let j = 0; j < g.nz - 1; j++)
      for (let i = 0; i < g.nx - 1; i++) {
        const a = j * g.nx + i
        // 위(+y)를 보게 감는다(+x 동 · +z 남)
        idx.set([a, a + g.nx, a + 1, a + 1, a + g.nx, a + g.nx + 1], o)
        o += 6
      }
    const geom = new THREE.BufferGeometry()
    geom.setAttribute("position", new THREE.BufferAttribute(pos, 3))
    geom.setIndex(new THREE.BufferAttribute(idx, 1))
    geom.computeBoundingSphere()
    this.tint = new THREE.Mesh(geom, new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 }))
    this.tint.renderOrder = 1
    this.tint.visible = false
    this.scene.add(this.tint)
    this.applySnow()
  }

  setVisible(v: boolean) {
    this.visible = v
    this.shadowDirty = true
    this.map?.triggerRepaint()
  }

  // ─── 지도 커스텀 레이어 ───

  onAdd(map: MlMap, gl: WebGLRenderingContext | WebGL2RenderingContext) {
    this.map = map
    if (!this.renderer) {
      this.renderer = new THREE.WebGLRenderer({ canvas: map.getCanvas(), context: gl, antialias: true })
      this.renderer.autoClear = false
      this.renderer.shadowMap.enabled = true
      this.renderer.shadowMap.type = THREE.PCFShadowMap
      this.renderer.shadowMap.autoUpdate = false
    }
    this.shadowDirty = true
  }

  onRemove() {
    // 테마·표현 교체(setStyle) 때 잠깐 떼었다 붙는다. 렌더러·기하는 그대로
    this.map = null
  }

  /** 보는 곳(지도 가운데) 둘레로 그림자 범위를 맞춘다. 많이 옮겼거나 줌이 바뀌었을 때만 다시 그린다 */
  private fitShadow(map: MlMap) {
    const c = map.getCenter()
    const x = (((c.lng + 180) / 360 - this.anchor.x) / this.anchor.scale)
    const yM = (1 - Math.log(Math.tan(Math.PI / 4 + (c.lat * Math.PI) / 360)) / Math.PI) / 2
    const z = (yM - this.anchor.y) / this.anchor.scale
    const mpp = (78271.517 * Math.cos((TOON_ANCHOR[1] * Math.PI) / 180)) / Math.pow(2, map.getZoom())
    const half = Math.min(3800, Math.max(240, mpp * 950))
    const s = this.shadowAt
    const moved = Math.hypot(x - s.x, z - s.z) > half * 0.14 || Math.abs(half - s.half) > s.half * 0.18
    if (!moved && !this.shadowDirty) return false
    s.x = x
    s.z = z
    s.half = half
    const cam = this.sun.shadow.camera
    cam.left = cam.bottom = -half
    cam.right = cam.top = half
    cam.near = 10
    cam.far = 9000
    cam.updateProjectionMatrix()
    const g = this.ground ? groundAt(this.ground, x, z) * this.exag : 0
    this.sun.target.position.set(x, g, z)
    this.sun.target.updateMatrixWorld()
    const dir = TMP_P.set(Math.sin(SUN_AZIMUTH) * Math.cos(SUN_ALTITUDE), Math.sin(SUN_ALTITUDE), -Math.cos(SUN_AZIMUTH) * Math.cos(SUN_ALTITUDE))
    // three z 는 남쪽: 방위(북에서 시계) a 의 해는 (sin a, ·, −cos a)
    this.sun.position.set(x + dir.x * 4000, g + dir.y * 4000, z + dir.z * 4000)
    this.sun.updateMatrixWorld()
    this.layReceiver(x, z, half)
    this.shadowDirty = false
    return true
  }

  /** 그림자 받이: 그림자 범위만 한 지면 격자(그림자만 보이는 재질). 높이는 toon-ground(건물·나무와 같은 DEM) × 과장 + 1.4m */
  private layReceiver(cx: number, cz: number, half: number) {
    const pos = this.receiver.geometry.getAttribute("position") as THREE.BufferAttribute
    const n = RECEIVER_SEG + 1
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const x = cx - half + (i / RECEIVER_SEG) * half * 2
        const z = cz - half + (j / RECEIVER_SEG) * half * 2
        const y = this.ground ? groundAt(this.ground, x, z) * this.exag + 1.4 : 0
        pos.setXYZ(j * n + i, x, y, z)
      }
    }
    pos.needsUpdate = true
    this.receiver.geometry.computeBoundingSphere()
  }

  render(gl: WebGLRenderingContext | WebGL2RenderingContext, args: CustomRenderMethodInput) {
    const map = this.map
    const r = this.renderer
    if (!map || !r || !this.visible || !this.chunks.length) return
    const proj = this.camera.projectionMatrix.fromArray(Array.from(args.defaultProjectionData.mainMatrix as unknown as ArrayLike<number>)).multiply(this.anchor.m)
    this.camera.projectionMatrixInverse.copy(proj).invert()
    const zoom = map.getZoom()
    // 화면 1m 가 몇 픽셀인지 × 깊이(w): 지도 가운데 땅에서 재서 껍질 셰이더가 꼭짓점 깊이로 나눠 쓴다
    const w = gl.drawingBufferWidth
    const h = gl.drawingBufferHeight
    this.hullU.uViewport.value.set(w, h)
    const s = this.shadowAt
    if (Number.isFinite(s.x)) {
      const g = this.ground ? groundAt(this.ground, s.x, s.z) * this.exag : 0
      const a = TMP_V.set(s.x, g, s.z, 1).applyMatrix4(proj)
      const ax = a.x / a.w, ay = a.y / a.w, aw = a.w
      const b = TMP_V.set(s.x + 10, g, s.z, 1).applyMatrix4(proj)
      const ppm = Math.hypot(((b.x / b.w - ax) * w) / 2, ((b.y / b.w - ay) * h) / 2) / 10
      this.hullU.uPxK.value = ppm * aw
    }
    this.hullU.uPx.value = Math.max(1, (window.devicePixelRatio || 1) * 1.25)
    if (this.fitShadow(map)) r.shadowMap.needsUpdate = true
    const animating = this.decor.frame(proj, zoom)
    r.resetState()
    r.setViewport(0, 0, w, h)
    r.render(this.scene, this.camera)
    if (animating) map.triggerRepaint()
  }

  dispose() {
    this.disposed = true
    for (const c of this.chunks) c.mesh.geometry.dispose()
    this.decor.dispose()
    this.bldMat.dispose()
    this.bldHullMat.dispose()
    this.receiver.geometry.dispose()
    this.receiver.material.dispose()
    this.colorTex.dispose()
    this.renderer?.dispose()
    this.renderer = null
  }
}
