// /dumping 모형 보기 장식(23라운드 toon-layer.ts 에서 분리 → 24라운드 2026-10-09 실사 나무·떠다니는 구름): 숲·공원 나무(블렌더 glb 인스턴싱) · 바람 따라 흐르는 구름.
// 나무 자리는 실제 지목(바탕 타일 landuse 숲·공원·정원, scripts/dumping-toon-world.py). 매끈한 수관에 그루마다 녹색을 돌리고, 건물 그림자를 받는다.
// 구름(사용자 2026-10-09 "귀여운 구름이 떠다니면")은 날씨(map-weather weatherLook)가 수를 정하고, 보는 곳 둘레 7.2km 칸 안을 바람 따라 흘러
// 가장자리에서 반대편으로 돌아 들어온다(돌아 들어올 때는 옅게). 땅·건물·나무에 그림자를 드리운다(셰이더 cloudShade, 그림자맵을 다시 안 그린다).
// 카메라가 구름에 가까워지면(화면에서 크게 보이면) 걷혀 데이터를 덮지 않는다. 움직임 줄이기면 멈춘다
import * as THREE from "three"
import type { ToonTrees } from "@/lib/dumping/toon-world"
import type { WeatherLook } from "@/lib/dumping/map-weather"
import { hash01 } from "./toon-palette"
import { CLOUD_SHADE_GLSL, MAX_CLOUDS, type AssetPart, type CloudUniforms } from "./toon-assets"

const TREE_CHUNK_M = 1024
const DECOR_THEME = {
  light: { leaf: [["#5d8a4a", "#6b9653", "#527d41", "#78a05c", "#4f7a45"], ["#3f6b45", "#4a7650", "#365e3c", "#507a52"]], trunk: "#6e5a48" },
  dark: { leaf: [["#22392c", "#284230", "#1e3428", "#2c4733"], ["#1a3025", "#1f3629", "#172b21"]], trunk: "#2c2620" },
} as const

const FIELD_M = 7200 // 구름이 흐르는 칸(보는 곳 가운데)
const WIND = new THREE.Vector2(0.94, -0.34).normalize() // 서남서 → 동북동(+x 동, +z 남)
const WIND_MS = 30 // 화면에서 흐름이 보이는 빠르기(실제 바람보다 빠르다)

// 나무: 위를 보는 면에 눈(uSnow) · 구름 그늘. 법선 y 는 모델 공간(그루마다 y 축으로만 돌린다)
const TREE_VERT_PARS = /* glsl */ `
varying float vUpN;
varying vec3 vCW;`
const TREE_VERT = /* glsl */ `
vUpN = normal.y;
vec4 tnW = vec4(transformed, 1.0);
#ifdef USE_INSTANCING
  tnW = instanceMatrix * tnW;
#endif
vCW = (modelMatrix * tnW).xyz;`
const TREE_FRAG_PARS = /* glsl */ `
uniform float uSnow;
uniform vec3 uSnowC;
uniform float uCloudDark;
varying float vUpN;
varying vec3 vCW;
${CLOUD_SHADE_GLSL}`
const TREE_FRAG_SNOW = /* glsl */ `
diffuseColor.rgb = mix(diffuseColor.rgb, uSnowC, uSnow * smoothstep(0.25, 0.7, vUpN));`
const TREE_FRAG_LIGHT = /* glsl */ `
reflectedLight.directDiffuse *= 1.0 - uCloudDark * cloudShade(vCW);`

interface TreeChunk {
  meshes: THREE.InstancedMesh[]
}
interface Cloud {
  mesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshLambertMaterial>
  home: THREE.Vector2
  y: number
  speed: number
  /** 반지름(m, 그림자 크기) */
  r: number
  shown: number
  want: number
}

const TMP_M = new THREE.Matrix4()
const TMP_V = new THREE.Vector4()
const TMP_Q = new THREE.Quaternion()
const TMP_S = new THREE.Vector3()
const TMP_P = new THREE.Vector3()
const Y_AXIS = new THREE.Vector3(0, 1, 0)

export class ToonDecor {
  readonly group = new THREE.Group()
  private readonly trees: TreeChunk[] = []
  private readonly clouds: Cloud[] = []
  /** 이 층이 쓰는 기하(glb 캐시의 복사본). 캐시 기하를 직접 그리면 렌더러 리스너가 붙어 지도를 새로 만들 때마다 옛 렌더러가 남았다 */
  private readonly geoms: THREE.BufferGeometry[] = []
  private own(g: THREE.BufferGeometry): THREE.BufferGeometry {
    const c = g.clone()
    this.geoms.push(c)
    return c
  }
  private readonly treeU: { uSnow: { value: number }; uSnowC: { value: THREE.Color }; uCloudDark: { value: number } } & CloudUniforms
  private readonly leaf = new THREE.MeshLambertMaterial({ color: "#ffffff" })
  private readonly trunk = new THREE.MeshLambertMaterial({ color: DECOR_THEME.light.trunk })
  private readonly exag: number
  private dark: boolean
  private look: WeatherLook | null = null
  private t = 0
  private last = 0
  private readonly reduce = typeof matchMedia === "function" ? matchMedia("(prefers-reduced-motion: reduce)") : null

  constructor(cloudU: CloudUniforms, exag: number, dark: boolean) {
    this.exag = exag
    this.dark = dark
    this.treeU = { uSnow: { value: 0 }, uSnowC: { value: new THREE.Color("#f7f9fc") }, uCloudDark: { value: 0.5 }, ...cloudU }
    this.leaf.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, this.treeU)
      sh.vertexShader = sh.vertexShader.replace("#include <common>", `#include <common>\n${TREE_VERT_PARS}`).replace("#include <begin_vertex>", `#include <begin_vertex>\n${TREE_VERT}`)
      sh.fragmentShader = sh.fragmentShader
        .replace("#include <common>", `#include <common>\n${TREE_FRAG_PARS}`)
        .replace("#include <emissivemap_fragment>", `#include <emissivemap_fragment>\n${TREE_FRAG_SNOW}`)
        .replace("#include <lights_fragment_end>", `#include <lights_fragment_end>\n${TREE_FRAG_LIGHT}`)
    }
    this.setTheme(dark)
  }

  /** 구름 그늘 진하기(날씨·테마가 정한다. 건물·땅 받이와 같은 값) */
  setCloudDark(v: number) {
    this.treeU.uCloudDark.value = v
  }

  /** 나무: 1km 덩어리 × 꼴(활엽·침엽) × 부품(줄기·수관) InstancedMesh. 덩어리 안 순서를 해시로 섞어 두어, 조망에서 앞쪽 일부만 그려도 고르게 솎인다 */
  addTrees(t: ToonTrees, forms: AssetPart[][]) {
    const buckets = new Map<string, number[][]>()
    for (let i = 0; i < t.count; i++) {
      const key = `${Math.floor(t.x[i] / TREE_CHUNK_M)}:${Math.floor(t.z[i] / TREE_CHUNK_M)}`
      let b = buckets.get(key)
      if (!b) buckets.set(key, (b = [[], []]))
      b[t.form[i] === 1 ? 1 : 0].push(i)
    }
    const pal = DECOR_THEME[this.dark ? "dark" : "light"].leaf
    const color = new THREE.Color()
    for (const b of buckets.values()) {
      const meshes: THREE.InstancedMesh[] = []
      b.forEach((list, form) => {
        if (!list.length) return
        list.sort((p, q) => hash01(p, 11) - hash01(q, 11))
        for (const part of forms[form]) {
          const leaf = part.role === "leaf"
          const mesh = new THREE.InstancedMesh(this.own(part.geom), leaf ? this.leaf : this.trunk, list.length)
          const picks = new Float32Array(list.length)
          list.forEach((i, k) => {
            const s = (form === 1 ? 0.95 : 0.8) + t.size[i] * 0.55
            TMP_Q.setFromAxisAngle(Y_AXIS, hash01(i, 3) * Math.PI * 2)
            TMP_M.compose(TMP_P.set(t.x[i], t.ground[i] * this.exag - 0.4, t.z[i]), TMP_Q, TMP_S.set(s, s * (0.9 + hash01(i, 5) * 0.25), s))
            mesh.setMatrixAt(k, TMP_M)
            picks[k] = hash01(i, 9)
            if (leaf) mesh.setColorAt(k, this.leafColor(color, pal[form], picks[k]))
          })
          mesh.castShadow = true
          mesh.receiveShadow = true
          mesh.computeBoundingSphere()
          mesh.userData = { leaf, form, n: list.length, picks }
          meshes.push(mesh)
        }
      })
      for (const m of meshes) this.group.add(m)
      this.trees.push({ meshes })
    }
  }

  /** 팔레트 한 색 + 그루마다 밝기 ±8%(같은 녹색이 줄지어 보이지 않게) */
  private leafColor(out: THREE.Color, pal: readonly string[], pick: number): THREE.Color {
    out.set(pal[Math.floor(pick * pal.length) % pal.length])
    return out.multiplyScalar(0.92 + ((pick * 7.31) % 1) * 0.16)
  }

  /** 구름: 꼴 셋을 돌려 MAX_CLOUDS 개. 자리는 칸 안 해시, 높이 560~760m(아차산 × 과장 위), 크기 3.2~5배(폭 250~550m. 조망에서 손톱만 해야 귀엽게 읽힌다) */
  addClouds(shapes: AssetPart[][]) {
    const geoms = shapes.map((parts) => parts[0]?.geom).filter((g): g is THREE.BufferGeometry => !!g)
    if (!geoms.length) return
    for (let k = 0; k < MAX_CLOUDS; k++) {
      const g = this.own(geoms[k % geoms.length])
      g.computeBoundingBox()
      const bb = g.boundingBox
      const width = bb ? Math.max(bb.max.x - bb.min.x, bb.max.z - bb.min.z) : 90
      const mat = new THREE.MeshLambertMaterial({ color: "#ffffff", emissive: new THREE.Color("#ffffff"), emissiveIntensity: 0.3, transparent: true, opacity: 0 })
      const mesh = new THREE.Mesh(g, mat)
      const s = 3.2 + hash01(k, 23) * 1.8
      mesh.scale.set(s, s * (0.85 + hash01(k, 24) * 0.25), s)
      mesh.rotation.y = Math.atan2(-WIND.y, WIND.x) + (hash01(k, 25) - 0.5) * 0.6
      mesh.renderOrder = 8
      mesh.visible = false
      this.group.add(mesh)
      this.clouds.push({
        mesh,
        home: new THREE.Vector2((hash01(k, 21) - 0.5) * FIELD_M, (hash01(k, 22) - 0.5) * FIELD_M),
        y: 560 + hash01(k, 27) * 200,
        speed: WIND_MS * (0.85 + hash01(k, 28) * 0.3),
        r: (width / 2) * s * 0.9,
        shown: 0,
        want: 0,
      })
    }
    if (this.look) this.setLook(this.look, this.treeU.uSnowC.value)
  }

  setTheme(dark: boolean) {
    this.dark = dark
    const t = DECOR_THEME[dark ? "dark" : "light"]
    this.trunk.color.set(t.trunk)
    const color = new THREE.Color()
    for (const tc of this.trees) {
      for (const m of tc.meshes) {
        if (!m.userData.leaf || !m.instanceColor) continue
        const pal = t.leaf[m.userData.form as number]
        const picks = m.userData.picks as Float32Array
        for (let k = 0; k < picks.length; k++) m.setColorAt(k, this.leafColor(color, pal, picks[k]))
        m.instanceColor.needsUpdate = true
      }
    }
  }

  /** 날씨: 구름 수(weatherLook 0~10을 MAX_CLOUDS로)·색, 수관 눈 */
  setLook(w: WeatherLook, snowColor: THREE.Color) {
    this.look = w
    const n = Math.round((w.clouds / 10) * MAX_CLOUDS)
    this.clouds.forEach((c, k) => {
      c.want = k < n ? 1 : 0
      c.mesh.material.color.set(w.cloud)
      c.mesh.material.emissive.set(w.cloud)
    })
    this.treeU.uSnow.value = w.snow * 0.85
    this.treeU.uSnowC.value.copy(snowColor)
  }

  /**
   * 매 프레임: 줌으로 나무를 솎고(조망 35% → 줌 15 이상 전부), 구름을 흘린다. center = 보는 곳(모델 m), pxK = 화면 1m 픽셀 × 깊이(w), viewH = 화면 높이(px).
   * 구름 그림자 값(cloudU)을 채운다. 시간은 그린 프레임 사이만 흐른다(멈춰 있다 다시 그릴 때 순간이동하지 않게).
   * moving = 뜨거나 걷히는 중(곧 다시 그려 달라), drifting = 보이는 구름이 흐르는 중(느리게 다시 그려 달라)
   */
  frame(proj: THREE.Matrix4, zoom: number, center: THREE.Vector2, pxK: number, viewH: number, cloudU: CloudUniforms, groundY: number): { moving: boolean; drifting: boolean } {
    const k = Math.min(1, Math.max(0.35, ((zoom - 13.4) / 1.6) * 0.65 + 0.35))
    for (const tc of this.trees) for (const m of tc.meshes) m.count = Math.max(1, Math.ceil((m.userData.n as number) * k))
    const now = performance.now()
    const still = !!this.reduce?.matches
    this.t += this.last && !still ? Math.min(0.12, (now - this.last) / 1000) : 0
    this.last = now
    let moving = false
    let drifting = false
    let n = 0
    const half = FIELD_M / 2
    const shadowK = this.look?.shadow ?? 0.5
    for (const c of this.clouds) {
      // 칸 안 자리(바람 따라 흐르다 가장자리에서 반대편으로)
      let ox = c.home.x + WIND.x * c.speed * this.t - center.x
      let oz = c.home.y + WIND.y * c.speed * this.t - center.y
      ox = ((((ox + half) % FIELD_M) + FIELD_M) % FIELD_M) - half
      oz = ((((oz + half) % FIELD_M) + FIELD_M) % FIELD_M) - half
      const edge = 1 - THREE.MathUtils.smoothstep(Math.max(Math.abs(ox), Math.abs(oz)) / half, 0.78, 1)
      const x = center.x + ox
      const z = center.y + oz
      const y = groundY + c.y
      c.mesh.position.set(x, y, z)
      TMP_V.set(x, y, z, 1).applyMatrix4(proj)
      // 화면에서 너무 크게(가까이) 보이면 걷는다: 카메라가 구름 높이로 내려오면 지나가는 듯 사라진다
      const px = TMP_V.w > 0 ? (c.r * pxK) / TMP_V.w : Infinity
      const near = 1 - THREE.MathUtils.smoothstep(px, viewH * 0.12, viewH * 0.26)
      // 날씨가 띄우고 걷는 것만 서서히(그동안은 매 프레임 다시 그린다). 칸 가장자리·가까움은 흐름 따라 천천히 바뀌니 바로 곱한다
      // (둘 다 서서히 따라가게 했더니 멈춘 화면에서도 초당 37번 다시 그렸다)
      c.shown += (c.want - c.shown) * 0.12
      if (Math.abs(c.want - c.shown) > 0.01) moving = true
      const alpha = c.shown * edge * near
      c.mesh.visible = alpha > 0.02
      c.mesh.material.opacity = Math.min(0.96, alpha)
      c.mesh.material.depthWrite = alpha > 0.9
      if (c.mesh.visible && !still) drifting = true
      // 그림자는 보이는지와 무관하게 날씨가 띄운 구름이면(가까워 걷힌 구름도 땅엔 그늘이 진다)
      if (c.shown > 0.02 && n < MAX_CLOUDS) {
        cloudU.uClouds.value[n].set(x, z, c.r, y)
        cloudU.uCloudA.value[n] = shadowK * 0.85 * edge * c.shown
        n++
      }
    }
    cloudU.uCloudN.value = n
    return { moving, drifting }
  }

  dispose() {
    for (const tc of this.trees) for (const m of tc.meshes) m.dispose()
    for (const c of this.clouds) c.mesh.material.dispose()
    this.leaf.dispose()
    this.trunk.dispose()
    for (const g of this.geoms) g.dispose()
  }
}
