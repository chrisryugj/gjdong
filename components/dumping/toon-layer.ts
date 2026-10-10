// /dumping 모형 보기 three.js 커스텀 레이어(23라운드 카툰 → 24라운드 2026-10-09 실사, 사용자: "너무 비현실적, 건물을 그리다 만 것 같다").
// 매끈한 명암(Lambert) · 이웃 건물 그림자까지 받는 해 그림자맵(보는 곳을 따라감) · 땅과 닿는 곳 그늘 · 구름 그림자(cloudShade).
// 외벽은 용도·연대·구조(GIS건물통합정보 + 대장 대조 OSM 신축)로 고른 재질(toon-palette) 위에 층 나누기와 창을 그린다:
// 변마다 창을 고르게 나누고(모서리 반쪽 창 없음), 아파트 긴 면은 발코니 띠, 상가 1층은 진열창·간판, 업무·고층 공공은 커튼월, 2000년대 이후 빌라 1층은 필로티.
// 평지붕은 난간 띠·옥탑·물탱크, 오래된 단독은 기와·슬레이트 박공. 창 간격이 화면 몇 픽셀보다 작아지면 평균 색으로 물러난다(계단·깜박임 없음). 밤엔 창마다 불빛.
// 데이터 색은 지도 압출과 같은 규칙(toon-palette toonColors)으로 동마다 텍셀에 담고, 바탕을 바꾸면 그 텍스처만 다시 올린다(기하 그대로).
// 기둥은 칠한 블록(toon-beams, 26라운드. 24라운드엔 빛기둥), 나무·구름은 toon-decor, 도로 위 차·사람은 toon-traffic(25라운드). 깊이는 지도와 나눈다(지우지 않는다): 뒤에 그리는 말뚝(fill-extrusion)이 건물과 서로 가린다.
import * as THREE from "three"
import type { CustomLayerInterface, CustomRenderMethodInput, Map as MlMap } from "maplibre-gl"
import { decodeBuildings, decodeGround, decodeSat, decodeTraffic, decodeTrees, groundAt, lngLatToLocal, localToLngLat, SAT_PITCH_KNOWN, SAT_PITCHED, TOON_ANCHOR, type ToonBuildings, type ToonGround, type ToonSat, type ToonTraffic as TrafficData } from "@/lib/dumping/toon-world"
import type { GridCell } from "@/lib/dumping/types"
import { buildChunk, centroidOf, chunkIds, CHUNK_M, floorsOf, haloChunk, ringOf, roofPlan, type RoofPlan } from "./toon-geom"
import { TEXELS_PER_BUILDING, toonColors, toonMaterials, type ToonPaint } from "./toon-palette"
import { anchorMatrix, cloudUniforms, eyeOf, loadAsset } from "./toon-assets"
import { FRAG_COLOR, FRAG_LIGHT, FRAG_PARS, RECV_FRAG, RECV_FRAG_FIND, RECV_FRAG_PARS, RECV_VERT, RECV_VERT_PARS, VERT_MAIN, VERT_PARS } from "./toon-shaders"
import { ToonDecor } from "./toon-decor"
import { ToonBeams } from "./toon-beams"
import { ToonTraffic } from "./toon-traffic"
import { ToonHotspots } from "./toon-hotspots"
import { ToonLandmarks, landmarkReplaces } from "./toon-landmark"
import { ToonRoutes } from "./toon-routes"
import { haloMaterial, SKIRT_M, skirtGroup } from "./toon-diorama"
import { cellLookup } from "./map-geo"
import { weatherLook, type SkyWeather } from "@/lib/dumping/map-weather"

export type ToonPaintInput = Omit<ToonPaint, "cellOf" | "style">

const COLOR_TEX_W = 1024
const INFO_TEX_W = 512
// 26라운드 모형: 조금 낮고 따뜻한 오후 해(그림자가 길어 모형 사진처럼 입체가 산다). 시간 자료가 없어 고정
const SUN_AZIMUTH = (222 * Math.PI) / 180
const SUN_ALTITUDE = (34 * Math.PI) / 180
const RECEIVER_SEG = 112
const DRIFT_MS = 90 // 구름만 흐를 때 다시 그리는 간격(초당 약 11번. 유리 굴절 재계산을 줄인다)
const TRAFFIC_MS = 33 // 차가 보이는 줌(15 이상)에서 다시 그리는 간격(실측 초당 약 20번. 20ms 로 줄이면 가까이 회전이 60 → 48fps 로 떨어졌다)

const THEMES = {
  light: {
    sky: "#eef3f8", ground: "#b3aa9b", hemi: 1.3, sun: "#ffe7c7", sunI: 3.5, shadow: 0.72,
    glass: "#71818c", skyRef: "#d2dde4", cap: "#cdc8bd", rail: "#f1f0ec", tank: "#9eb8c9", muted: "#d9d6cf",
    receiver: { color: "#33404c", opacity: 0.36 }, night: 0, lit: 0.0, cloudDark: 0.5, num: "#3a3f45", winK: 0.78, halo: 0.34,
  },
  dark: {
    sky: "#6a7a94", ground: "#1c222a", hemi: 0.75, sun: "#a9b9d8", sunI: 0.55, shadow: 0.4,
    glass: "#0d151c", skyRef: "#26323d", cap: "#3a434a", rail: "#4a535a", tank: "#33414c", muted: "#2b3339",
    receiver: { color: "#000000", opacity: 0.32 }, night: 1, lit: 0.3, cloudDark: 0.25, num: "#2c3036", winK: 0.92, halo: 0.42,
  },
} as const

/** 측벽 동 번호 숫자 아틀라스(25라운드): 0~9 를 가로로 한 칸씩(칸 비율 0.62:1 = 셰이더 글자 비율). 흰 글자 알파만 쓴다. 칸 안 여백으로 밉맵 번짐을 막는다 */
function digitAtlas(): THREE.CanvasTexture {
  const cw = 60
  const ch = 96
  const c = document.createElement("canvas")
  c.width = cw * 10
  c.height = ch
  const g = c.getContext("2d")!
  g.fillStyle = "#ffffff"
  g.textAlign = "center"
  g.textBaseline = "alphabetic"
  g.font = `700 ${Math.round(ch * 0.9)}px "Helvetica Neue", Arial, sans-serif`
  for (let d = 0; d < 10; d++) {
    const w = g.measureText(String(d)).width
    const k = Math.min(1, (cw * 0.84) / w)
    g.setTransform(k, 0, 0, 1, cw * d + cw / 2, 0)
    g.fillText(String(d), 0, ch * 0.88)
  }
  const t = new THREE.CanvasTexture(c)
  t.anisotropy = 4
  return t
}

interface BuildingChunk {
  mesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshLambertMaterial>
  halo: THREE.Mesh | null
}

const TMP_V = new THREE.Vector4()
// 업로드 뒤 JS 쪽 배열을 버린다(동 2.7만 기하를 두 벌 들고 있지 않게. three 문서의 disposeArray)
function dropArray(this: THREE.BufferAttribute) {
  ;(this as unknown as { array: unknown }).array = null
}

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
  /** 위성 색(25라운드). 못 받았거나 건물 자료와 짝이 안 맞으면 null: 재질 팔레트 */
  private sat: ToonSat | null = null
  private ground: ToonGround | null = null
  private plans: RoofPlan[] = []
  private gable = new Uint8Array(0)
  private cellOf: Int32Array | null = null
  private paint: ToonPaintInput | null = null
  private readonly chunks: BuildingChunk[] = []
  private readonly decor: ToonDecor
  readonly beams = new ToonBeams()
  readonly hotspots = new ToonHotspots()
  // 청소차 노선 띠벽(26라운드 후속 3): 땅의 선은 건물 사이에 묻혔다
  readonly routes = new ToonRoutes()
  // 랜드마크 모델(광진구청 신청사, 블렌더 glb). 같은 자리의 일반 건물은 덩어리에서 뺀다. 눈·구름 그늘 유니폼은 생성자에서 bldU 와 나눈다
  readonly landmarks: ToonLandmarks
  readonly traffic: ToonTraffic
  /** 구 경계 [위도, 경도](디오라마 블록 옆면) */
  private ringLL: [number, number][] | null = null
  private skirt: THREE.Group | null = null
  private readonly haloU = { uHalo: { value: new THREE.Color("#2b2620") }, uHaloA: { value: THEMES.light.halo as number } }
  private readonly haloMat = haloMaterial(this.haloU)
  private readonly skirtU = { uSunDir: { value: new THREE.Vector3() }, uDepth: { value: SKIRT_M }, uDark: { value: 0 }, uShadowA: { value: 0.34 }, uEye: { value: new THREE.Vector3() } }
  private colorBytes = new Uint8Array(4)
  private colorTex = new THREE.DataTexture(this.colorBytes, 1, 1)
  private infoTex = new THREE.DataTexture(new Float32Array(4), 1, 1, THREE.RGBAFormat, THREE.FloatType)
  private readonly cloudU = cloudUniforms()
  private readonly eye = new THREE.Vector3()
  private readonly bldU = {
    uColors: { value: this.colorTex as THREE.Texture },
    uInfo: { value: this.infoTex as THREE.Texture },
    uColorsW: { value: COLOR_TEX_W },
    uInfoW: { value: INFO_TEX_W },
    uGlass: { value: new THREE.Color(THEMES.light.glass) },
    uSkyRef: { value: new THREE.Color(THEMES.light.skyRef) },
    uCap: { value: new THREE.Color(THEMES.light.cap) },
    uRail: { value: new THREE.Color(THEMES.light.rail) },
    uTank: { value: new THREE.Color(THEMES.light.tank) },
    uMuted: { value: new THREE.Color(THEMES.light.muted) },
    uEye: { value: this.eye },
    uNight: { value: 0 },
    uLit: { value: 0 },
    uGlowWarm: { value: new THREE.Color("#ffbf66").multiplyScalar(0.95) },
    uGlowCool: { value: new THREE.Color("#d5e6ff").multiplyScalar(0.62) },
    uRoofSnow: { value: 0 },
    uSnowC: { value: new THREE.Color("#f7f9fc") },
    uCloudDark: { value: THEMES.light.cloudDark as number },
    uDigits: { value: null as THREE.Texture | null },
    uWave: { value: new THREE.Vector4(0, 0, 0, 0) },
    uWinK: { value: THEMES.light.winK as number },
    uNumC: { value: new THREE.Color(THEMES.light.num) },
    uNumGlow: { value: new THREE.Color("#ffe2a8").multiplyScalar(0.55) },
    ...this.cloudU,
  }
  private readonly recvU = { uCloudRecv: { value: 0.5 }, ...this.cloudU }
  private weather: SkyWeather = { kind: "clear", level: 0.35 }
  /** 땅 눈·젖음 덮개(지면 격자 전체, 그림자만 보이는 받이 아래) */
  private tint: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial> | null = null
  private readonly bldMat: THREE.MeshLambertMaterial
  private readonly hemi = new THREE.HemisphereLight()
  private readonly sun = new THREE.DirectionalLight()
  private readonly receiver: THREE.Mesh<THREE.PlaneGeometry, THREE.ShadowMaterial>
  private shadowAt = { x: Infinity, z: Infinity, half: 0 }
  private shadowDirty = true
  private driftTimer = 0
  private readonly center = new THREE.Vector2()
  private disposed = false
  private waveT0 = 0
  private trafficData: TrafficData | null = null
  private trafficBuilt = false

  constructor(opts: { dark: boolean; exag: number }) {
    this.exag = opts.exag
    this.dark = opts.dark
    this.bldMat = new THREE.MeshLambertMaterial({ color: "#ffffff" })
    this.bldU.uDigits.value = digitAtlas()
    this.bldMat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, this.bldU)
      sh.vertexShader = sh.vertexShader.replace("#include <common>", `#include <common>\n${VERT_PARS}`).replace("#include <begin_vertex>", `#include <begin_vertex>\n${VERT_MAIN}`)
      sh.fragmentShader = sh.fragmentShader
        .replace("#include <common>", `#include <common>\n${FRAG_PARS}`)
        .replace("#include <emissivemap_fragment>", `#include <emissivemap_fragment>\n${FRAG_COLOR}`)
        .replace("#include <lights_fragment_end>", `#include <lights_fragment_end>\n${FRAG_LIGHT}`)
    }
    // three z 는 남쪽: 방위(북에서 시계) a 의 해는 (sin a, ·, −cos a)
    this.cloudU.uSunDir.value.set(Math.sin(SUN_AZIMUTH) * Math.cos(SUN_ALTITUDE), Math.sin(SUN_ALTITUDE), -Math.cos(SUN_AZIMUTH) * Math.cos(SUN_ALTITUDE))
    this.cloudU.uWind.value.set(0.94, -0.34).normalize()
    this.sun.castShadow = true
    const s = this.sun.shadow
    const big = Math.min(window.innerWidth, window.innerHeight) >= 768
    s.mapSize.set(big ? 4096 : 2048, big ? 4096 : 2048)
    s.bias = -0.0003
    s.radius = 2
    this.scene.add(this.hemi, this.sun, this.sun.target)
    const recvMat = new THREE.ShadowMaterial({ depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 })
    recvMat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, this.recvU)
      sh.vertexShader = sh.vertexShader.replace("#include <common>", `#include <common>\n${RECV_VERT_PARS}`).replace("#include <begin_vertex>", `#include <begin_vertex>\n${RECV_VERT}`)
      sh.fragmentShader = sh.fragmentShader.replace("#include <common>", `#include <common>\n${RECV_FRAG_PARS}`).replace(RECV_FRAG_FIND, RECV_FRAG)
    }
    this.receiver = new THREE.Mesh(new THREE.PlaneGeometry(1, 1, RECEIVER_SEG, RECEIVER_SEG).rotateX(-Math.PI / 2), recvMat)
    this.receiver.receiveShadow = true
    this.receiver.frustumCulled = false
    this.receiver.renderOrder = 2
    this.scene.add(this.receiver)
    this.decor = new ToonDecor(this.cloudU, this.exag, opts.dark)
    this.landmarks = new ToonLandmarks({ uRoofSnow: this.bldU.uRoofSnow, uSnowC: this.bldU.uSnowC, uCloudDark: this.bldU.uCloudDark, ...this.cloudU })
    this.traffic = new ToonTraffic(opts.dark)
    this.scene.add(this.decor.group, this.beams.group, this.traffic.group, this.hotspots.group, this.landmarks.group, this.routes.group)
    this.skirtU.uSunDir.value.copy(this.cloudU.uSunDir.value)
    this.setTheme(opts.dark)
  }

  // ─── 자료 ───

  /** 정적 자료 셋을 받아 건물(가까운 덩어리부터)·나무·구름을 세운다. 건물이 다 서면 resolve(나무·구름은 뒤따른다) */
  async load(base: string, near: [number, number] = [0, 0]): Promise<void> {
    const get = (f: string) => fetch(`${base}/${f}`).then((r) => {
      if (!r.ok) throw new Error(`${f} ${r.status}`)
      return r.arrayBuffer()
    })
    const [bBuf, gBuf, sBuf] = await Promise.all([get("toon-buildings.bin"), get("toon-ground.bin"), get("toon-sat.bin").catch(() => null)])
    if (this.disposed) return
    const bld = decodeBuildings(bBuf)
    this.bld = bld
    this.sat = sBuf ? decodeSat(sBuf, bBuf, bld.count) : null
    this.ground = decodeGround(gBuf)
    this.addTint(this.ground)
    this.beams.setGround(this.ground, this.exag)
    this.hotspots.setGround(this.ground, this.exag)
    this.routes.setGround(this.ground, this.exag)
    this.buildSkirt()
    // 지붕 계획(박공·처마 높이)을 먼저 전부: 재질(박공이면 기와)과 정보 텍스처(지면·벽 꼭대기·층수)가 그 값을 쓴다. 박공은 위성 판정이 있으면 그것으로
    const n = bld.count
    this.plans = new Array(n)
    this.gable = new Uint8Array(n)
    const info = new Float32Array(INFO_TEX_W * Math.ceil(n / INFO_TEX_W) * 4)
    let last = performance.now()
    for (let i = 0; i < n; i++) {
      const f = this.sat?.flags[i] ?? 0
      const plan = roofPlan(bld, i, ringOf(bld, i), f & SAT_PITCH_KNOWN ? (f & SAT_PITCHED ? 1 : 0) : -1)
      this.plans[i] = plan
      this.gable[i] = plan.gable ? 1 : 0
      const g = bld.groundMid[i] * this.exag
      info[i * 4] = g
      info[i * 4 + 1] = g + plan.eave
      info[i * 4 + 2] = floorsOf(bld, i)
      info[i * 4 + 3] = bld.label[i]
      if (performance.now() - last > 14) {
        await new Promise((r) => setTimeout(r, 0))
        if (this.disposed) return
        last = performance.now()
      }
    }
    this.infoTex.dispose()
    this.infoTex = new THREE.DataTexture(info, INFO_TEX_W, info.length / 4 / INFO_TEX_W, THREE.RGBAFormat, THREE.FloatType)
    this.infoTex.minFilter = this.infoTex.magFilter = THREE.NearestFilter
    this.infoTex.generateMipmaps = false
    this.infoTex.needsUpdate = true
    this.bldU.uInfo.value = this.infoTex
    this.colorBytes = new Uint8Array(COLOR_TEX_W * Math.ceil((n * TEXELS_PER_BUILDING) / COLOR_TEX_W) * 4)
    this.colorTex.dispose()
    this.colorTex = new THREE.DataTexture(this.colorBytes, COLOR_TEX_W, this.colorBytes.length / 4 / COLOR_TEX_W, THREE.RGBAFormat)
    this.colorTex.colorSpace = THREE.SRGBColorSpace
    this.colorTex.minFilter = this.colorTex.magFilter = THREE.NearestFilter
    this.colorTex.generateMipmaps = false
    this.bldU.uColors.value = this.colorTex
    this.remat()
    this.repaint()
    // 덩어리를 지금 보는 곳에서 가까운 순으로 세운다. 한 덩어리마다 한 번 숨을 돌려 첫 화면이 멈추지 않게.
    // 랜드마크 모델이 대신 그리는 건물은 빼고, 모델을 못 받으면 그 건물만 다시 세운다
    const replaced = landmarkReplaces(bld)
    const landmark = this.landmarks.load(this.ground, this.exag).catch(() => false)
    const groups = [...chunkIds(bld).entries()].map(([key, ids]) => {
      const [ix, iz] = key.split(":").map(Number)
      return { ids: ids.filter((i) => !replaced.has(i)), d: Math.hypot((ix + 0.5) * CHUNK_M - near[0], (iz + 0.5) * CHUNK_M - near[1]) }
    })
    groups.sort((a, b) => a.d - b.d)
    last = performance.now()
    for (const g of groups) {
      if (this.disposed) return
      this.addChunk(g.ids)
      if (performance.now() - last > 12) {
        this.map?.triggerRepaint()
        await new Promise((r) => setTimeout(r, 0))
        last = performance.now()
      }
    }
    if (!(await landmark) && replaced.size && !this.disposed) this.addChunk([...replaced])
    if (this.disposed) return
    this.ready = true
    this.shadowDirty = true
    this.map?.triggerRepaint()
    void this.loadDecor(get).catch(() => {
      // 나무·구름은 장식이라 못 받아도 건물·데이터는 그대로
    })
    void get("toon-traffic.bin")
      .then((buf) => {
        if (this.disposed) return
        this.trafficData = decodeTraffic(buf)
        this.buildTraffic()
      })
      .catch(() => {
        // 차·사람도 장식
      })
  }

  private addChunk(ids: number[]) {
    const c = buildChunk(this.bld!, ids, this.exag, this.plans)
    const geom = new THREE.BufferGeometry()
    geom.setAttribute("position", new THREE.BufferAttribute(c.position, 3))
    geom.setAttribute("normal", new THREE.BufferAttribute(c.normal, 3, true))
    geom.setAttribute("aB", new THREE.BufferAttribute(c.info, 2))
    geom.setAttribute("aW", new THREE.BufferAttribute(c.wall, 2))
    geom.setIndex(new THREE.BufferAttribute(c.index, 1))
    geom.computeBoundingSphere()
    for (const a of Object.values(geom.attributes)) (a as THREE.BufferAttribute).onUpload(dropArray)
    geom.index!.onUpload(dropArray)
    const mesh = new THREE.Mesh(geom, this.bldMat)
    mesh.castShadow = true
    mesh.receiveShadow = true
    this.scene.add(mesh)
    const h = haloChunk(this.bld!, ids, this.exag)
    let halo: THREE.Mesh | null = null
    if (h.index.length) {
      const hg = new THREE.BufferGeometry()
      hg.setAttribute("position", new THREE.BufferAttribute(h.position, 3))
      hg.setAttribute("aA", new THREE.BufferAttribute(h.alpha, 1))
      hg.setIndex(new THREE.BufferAttribute(h.index, 1))
      hg.computeBoundingSphere()
      halo = new THREE.Mesh(hg, this.haloMat)
      halo.renderOrder = 1
      this.scene.add(halo)
    }
    this.chunks.push({ mesh, halo })
  }

  private async loadDecor(get: (f: string) => Promise<ArrayBuffer>) {
    const [tBuf, broad, pine, ...clouds] = await Promise.all([
      get("toon-trees.bin"),
      loadAsset("tree-broad", true),
      loadAsset("tree-pine", true),
      loadAsset("cloud", true),
      loadAsset("cloud-b", true),
      loadAsset("cloud-c", true),
    ])
    if (this.disposed) return
    this.decor.addTrees(decodeTrees(tBuf), [broad, pine])
    this.decor.addClouds(clouds)
    this.applyLight()
    this.shadowDirty = true
    this.map?.triggerRepaint()
  }

  // ─── 색·테마 ───

  /** 바탕·선택·켜진 레이어가 바뀔 때. 격자 칸은 처음 한 번만 붙인다(격자는 불변) */
  setPaint(p: ToonPaintInput) {
    this.paint = p
    this.repaint()
    if (!this.trafficBuilt) this.buildTraffic()
  }

  /** 차·사람을 세운다. 사람 수는 그 칸 생활인구(격자 lp, 중앙값 대비 제곱근 0.35~2.4배): 격자(setPaint)와 경로 자료가 둘 다 있을 때 한 번 */
  private buildTraffic() {
    const t = this.trafficData
    const grid = this.paint?.grid
    if (!t || !grid?.length || this.trafficBuilt) return
    const lookup = cellLookup(grid)
    const lps = grid.map((c) => c[8]).filter((v) => v > 0).sort((a, b) => a - b)
    const med = lps[lps.length >> 1] || 1
    this.traffic.setData(t, this.exag, (x, z) => {
      const [lng, lat] = localToLngLat(x, z)
      const i = lookup(lat, lng)
      return i < 0 ? 0.5 : Math.min(2.4, Math.max(0.35, Math.sqrt(grid[i][8] / med)))
    })
    this.trafficBuilt = true
    this.map?.triggerRepaint()
  }

  private repaint() {
    const bld = this.bld
    const p = this.paint
    if (!bld || !p) return
    if (!this.cellOf && p.grid.length) this.cellOf = this.joinCells(bld, p.grid)
    if (!this.cellOf) return
    toonColors({ ...p, cellOf: this.cellOf, style: bld.style }, this.colorBytes)
    this.colorTex.needsUpdate = true
    this.applySnow()
    this.map?.triggerRepaint()
  }

  /** 재질 텍셀(테마마다 한 번) */
  private remat() {
    const bld = this.bld
    if (!bld || !this.gable.length) return
    toonMaterials(bld.count, bld.style, bld.floors, this.gable, this.dark ? "dark" : "light", this.colorBytes, this.sat)
    this.colorTex.needsUpdate = true
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
    this.landmarks.setTheme(dark)
    this.routes.setTheme(dark)
    const t = dark ? THEMES.dark : THEMES.light
    this.receiver.material.color.set(t.receiver.color)
    const u = this.bldU
    u.uGlass.value.set(t.glass)
    u.uSkyRef.value.set(t.skyRef)
    u.uCap.value.set(t.cap)
    u.uRail.value.set(t.rail)
    u.uTank.value.set(t.tank)
    u.uMuted.value.set(t.muted)
    u.uNumC.value.set(t.num)
    u.uWinK.value = t.winK
    this.haloU.uHaloA.value = t.halo
    this.skirtU.uDark.value = dark ? 1 : 0
    this.hotspots.setTheme(dark)
    u.uNight.value = t.night
    u.uLit.value = t.lit
    this.decor.setTheme(dark)
    this.beams.setTheme(dark)
    this.traffic.setTheme(dark)
    this.applyLight()
    this.remat()
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

  /** 테마 기본 조명 × 날씨 배율. 구름 그늘 진하기, 눈·젖음도 같이 */
  private applyLight() {
    const t = this.dark ? THEMES.dark : THEMES.light
    const w = weatherLook(this.weather, this.dark)
    this.hemi.color.set(w.skyColor ?? t.sky)
    this.hemi.groundColor.set(w.groundColor ?? t.ground)
    this.hemi.intensity = t.hemi * w.hemi
    this.sun.color.set(w.sunColor ?? t.sun)
    this.sun.intensity = t.sunI * w.sun
    this.sun.shadow.intensity = Math.min(1, w.shadow * (t.shadow / 0.5))
    this.receiver.material.opacity = t.receiver.opacity * Math.min(1, w.shadow / 0.5)
    // 구름 그늘은 해가 셀수록 진하다(흐림·비는 이미 어둡다)
    const cloud = t.cloudDark * Math.min(1, w.sun)
    this.bldU.uCloudDark.value = cloud
    // 땅 위 구름 그늘(받이 알파, 구름 진하기 uCloudA 와 곱해진다. 맑은 날 약 0.2)
    this.recvU.uCloudRecv.value = this.dark ? 0.3 : 0.5 * Math.min(1, w.sun)
    this.decor.setCloudDark(cloud)
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

  /** 진입 비행(25라운드): 데이터 색이 이 자리에서 바깥으로 번진다(초속 2.2km, 구 끝까지 약 3초) */
  wave(lngLat: [number, number]) {
    const [x, z] = lngLatToLocal(lngLat[0], lngLat[1])
    this.bldU.uWave.value.set(x, z, 0, 1)
    this.waveT0 = performance.now()
    this.map?.triggerRepaint()
  }

  /** 구 경계 [위도, 경도]. 디오라마 블록 옆면을 세운다(지면 자료가 오면 다시) */
  setRing(ring: [number, number][]) {
    this.ringLL = ring
    this.buildSkirt()
  }

  private disposeSkirt() {
    if (!this.skirt) return
    this.scene.remove(this.skirt)
    for (const c of this.skirt.children) {
      ;(c as THREE.Mesh).geometry.dispose()
      ;((c as THREE.Mesh).material as THREE.Material).dispose()
    }
    this.skirt = null
  }

  /** 디오라마 블록(26라운드, toon-diorama skirtGroup). 지면 자료와 구 경계가 둘 다 있을 때 */
  private buildSkirt() {
    const g = this.ground
    if (!this.ringLL || !g) return
    this.disposeSkirt()
    this.skirt = skirtGroup(this.ringLL, g, this.exag, this.skirtU)
    this.scene.add(this.skirt)
    this.map?.triggerRepaint()
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
      if (this.renderer.capabilities.maxTextureSize < 8192) this.sun.shadow.mapSize.set(2048, 2048)
      // 그림자맵 패스만 깊이 범위 (0,1)(26라운드 검증 실측): maplibre 가 3D 커스텀 층에 걸어 둔 gl.depthRange(0, 0.977…)를 그림자 패스도 물려받아
      // 저장 깊이가 눌렸고, 드리우며 받는 건물·블록이 제 그림자에 덮여 지도 평균 밝기가 161 → 176 만큼 어두웠다. 본 패스는 지도와 깊이를 나눠야 해서 그대로 둔다
      const sm = this.renderer.shadowMap
      const draw = sm.render.bind(sm)
      sm.render = (...a: Parameters<typeof draw>) => {
        const d = gl.getParameter(gl.DEPTH_RANGE) as Float32Array
        gl.depthRange(0, 1)
        try {
          draw(...a)
        } finally {
          gl.depthRange(d[0], d[1])
        }
      }
    }
    this.shadowDirty = true
  }

  onRemove() {
    // 지도에서 뗄 때(24라운드부터 테마·표현 전환은 떼지 않는다). 렌더러·기하는 dispose 가 푼다
    this.map = null
  }

  /** 보는 곳(지도 가운데) 둘레로 그림자 범위를 맞춘다. 많이 옮겼거나 줌이 바뀌었을 때만 다시 그린다 */
  private fitShadow(map: MlMap) {
    const c = map.getCenter()
    const x = ((c.lng + 180) / 360 - this.anchor.x) / this.anchor.scale
    const yM = (1 - Math.log(Math.tan(Math.PI / 4 + (c.lat * Math.PI) / 360)) / Math.PI) / 2
    const z = (yM - this.anchor.y) / this.anchor.scale
    this.center.set(x, z)
    const mpp = (78271.517 * Math.cos((TOON_ANCHOR[1] * Math.PI) / 180)) / Math.pow(2, map.getZoom())
    const half = Math.min(3800, Math.max(240, mpp * 950))
    const s = this.shadowAt
    const moved = Math.hypot(x - s.x, z - s.z) > half * 0.14 || Math.abs(half - s.half) > s.half * 0.18
    if (!moved && !this.shadowDirty) return false
    s.x = x
    s.z = z
    s.half = half
    const sh = this.sun.shadow
    const cam = sh.camera
    cam.left = cam.bottom = -half
    cam.right = cam.top = half
    cam.near = 10
    cam.far = 9000
    cam.updateProjectionMatrix()
    // 법선 바이어스는 그림자맵 한 칸 크기에 비례(줌을 바꿔도 여드름·뜬 그림자가 안 생기게)
    sh.normalBias = ((half * 2) / sh.mapSize.x) * 1.6
    const g = this.ground ? groundAt(this.ground, x, z) * this.exag : 0
    this.sun.target.position.set(x, g, z)
    this.sun.target.updateMatrixWorld()
    const dir = this.cloudU.uSunDir.value
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
    eyeOf(proj, this.eye)
    this.skirtU.uEye.value.copy(this.eye)
    this.landmarks.frame(this.eye)
    const zoom = map.getZoom()
    const w = gl.drawingBufferWidth
    const h = gl.drawingBufferHeight
    // 기둥 블록이 바뀌었거나 솟는 중이면 그림자맵도 다시(카메라가 그대로면 새 블록에 그림자가 없고 끈 블록 그림자가 남았다, 검증 실측)
    if (this.beams.takeDirty()) this.shadowDirty = true
    if (this.fitShadow(map)) r.shadowMap.needsUpdate = true
    // 화면 1m 가 몇 픽셀인지 × 깊이(w): 구름이 화면에서 얼마나 크게 보이는지 재는 데 쓴다
    const s = this.shadowAt
    const g = this.ground ? groundAt(this.ground, s.x, s.z) * this.exag : 0
    const a = TMP_V.set(s.x, g, s.z, 1).applyMatrix4(proj)
    const ax = a.x / a.w, ay = a.y / a.w, aw = a.w
    const b = TMP_V.set(s.x + 10, g, s.z, 1).applyMatrix4(proj)
    const pxK = (Math.hypot(((b.x / b.w - ax) * w) / 2, ((b.y / b.w - ay) * h) / 2) / 10) * aw
    const decor = this.decor.frame(proj, zoom, this.center, pxK, h, this.cloudU, g)
    const rising = this.beams.frame(proj, pxK)
    const moving = this.traffic.frame(zoom)
    const spreading = this.hotspots.frame(proj, pxK, zoom)
    const wave = this.bldU.uWave.value
    if (wave.w > 0.5) {
      wave.z = (performance.now() - this.waveT0) * 2.2
      if (wave.z > 7500) wave.w = 0
    }
    r.resetState()
    r.setViewport(0, 0, w, h)
    r.render(this.scene, this.camera)
    if (decor.moving || rising || spreading || wave.w > 0.5) map.triggerRepaint()
    else if ((moving || decor.drifting) && !this.driftTimer)
      this.driftTimer = window.setTimeout(
        () => {
          this.driftTimer = 0
          this.map?.triggerRepaint()
        },
        moving ? TRAFFIC_MS : DRIFT_MS,
      )
  }

  dispose() {
    this.disposed = true
    window.clearTimeout(this.driftTimer)
    for (const c of this.chunks) {
      c.mesh.geometry.dispose()
      c.halo?.geometry.dispose()
    }
    this.haloMat.dispose()
    this.disposeSkirt()
    this.hotspots.dispose()
    this.landmarks.dispose()
    this.routes.dispose()
    this.decor.dispose()
    this.beams.dispose()
    this.traffic.dispose()
    this.bldMat.dispose()
    this.receiver.geometry.dispose()
    this.receiver.material.dispose()
    this.tint?.geometry.dispose()
    this.tint?.material.dispose()
    this.colorTex.dispose()
    this.infoTex.dispose()
    this.bldU.uDigits.value?.dispose()
    this.renderer?.dispose()
    this.renderer = null
  }
}
