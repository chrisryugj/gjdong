// /dumping 모형 보기 장식(23라운드, 2026-10-09 toon-layer.ts 에서 분리): 숲·공원 나무(블렌더 glb 인스턴싱) · 구 둘레 구름.
// 나무 자리는 실제 지목(바탕 타일 landuse 숲·공원·정원, scripts/dumping-toon-world.py)이고 구름은 날씨(map-weather weatherLook)가 수를 정한다.
// 둘 다 데이터가 아니라 장식이라 데이터 위를 가리지 않게 했다: 나무는 건물·도로·운동장 자리를 비우고, 구름은 화면 위 띠(구 바깥)에서만 뜬다
import * as THREE from "three"
import type { ToonTrees } from "@/lib/dumping/toon-world"
import type { WeatherLook } from "@/lib/dumping/map-weather"
import { hash01 } from "./toon-palette"
import { addRadialOut, hullMaterial, toonMaterial, type AssetPart, type HullUniforms } from "./toon-assets"

const TREE_CHUNK_M = 1024
const DECOR_THEME = {
  light: { leaf: [["#86b673", "#78ab6c", "#93bf7a", "#6f9f66"], ["#5c9670", "#4f8a66", "#67a079"]], trunk: "#8d6e55", ink: "#3a332b" },
  dark: { leaf: [["#3f6553", "#3a5d4d", "#456c58", "#36574a"], ["#2f5444", "#294b3d", "#345a49"]], trunk: "#4b3f37", ink: "#07090b" },
} as const

// 나무 수관: 위를 보는 면에 눈(uSnow). 면 법선은 normal_fragment_begin 이 구한 평면 법선(모델 공간이라 y가 위)
const TREE_FRAG_PARS = /* glsl */ `
uniform float uSnow;
uniform vec3 uSnowC;`
const TREE_FRAG_SNOW = /* glsl */ `
diffuseColor.rgb = mix(diffuseColor.rgb, uSnowC, uSnow * smoothstep(0.2, 0.65, normal.y));`

interface TreeChunk {
  meshes: THREE.InstancedMesh[]
}
interface Cloud {
  group: THREE.Group
  home: THREE.Vector3
  phase: number
  shown: number
  /** 날씨가 이 구름을 띄우나(맑음 3~7 · 흐림·비 10 · 안개 0) */
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
  private readonly snowU = { uSnow: { value: 0 }, uSnowC: { value: new THREE.Color("#f7f9fc") } }
  private readonly leaf = toonMaterial("#ffffff")
  private readonly trunk = toonMaterial(DECOR_THEME.light.trunk)
  private readonly treeHull: THREE.ShaderMaterial
  private readonly cloudMat = toonMaterial("#ffffff", { emissive: new THREE.Color("#ffffff"), emissiveIntensity: 0.42, transparent: true })
  private readonly cloudHull: THREE.ShaderMaterial
  private readonly exag: number
  private dark: boolean
  private look: WeatherLook | null = null
  private t = 0
  private last = 0

  constructor(hullU: HullUniforms, exag: number, dark: boolean) {
    this.exag = exag
    this.dark = dark
    this.leaf.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, this.snowU)
      sh.fragmentShader = sh.fragmentShader
        .replace("#include <common>", `#include <common>\n${TREE_FRAG_PARS}`)
        .replace("#include <normal_fragment_maps>", `#include <normal_fragment_maps>\n${TREE_FRAG_SNOW}`)
    }
    this.treeHull = hullMaterial(hullU, DECOR_THEME.light.ink, 0.8)
    this.cloudHull = hullMaterial(hullU, "#9aa6ad", 1.1)
    this.cloudHull.transparent = true
    // 구름은 멀리 떠 있어 건물처럼 거리로 선을 거두면 조망에서 흰 얼룩이 됐다: 늘 그린다
    this.cloudHull.uniforms.uFade = { value: new THREE.Vector2(-1, 0) }
    this.setTheme(dark)
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
          const geom = this.own(part.geom)
          const mesh = new THREE.InstancedMesh(geom, leaf ? this.leaf : this.trunk, list.length)
          const picks = new Float32Array(list.length)
          list.forEach((i, k) => {
            const s = (form === 1 ? 0.95 : 0.8) + t.size[i] * 0.55
            TMP_Q.setFromAxisAngle(Y_AXIS, hash01(i, 3) * Math.PI * 2)
            TMP_M.compose(TMP_P.set(t.x[i], t.ground[i] * this.exag - 0.4, t.z[i]), TMP_Q, TMP_S.set(s, s * (0.9 + hash01(i, 5) * 0.25), s))
            mesh.setMatrixAt(k, TMP_M)
            picks[k] = hash01(i, 9)
            if (leaf) mesh.setColorAt(k, color.set(pal[form][Math.floor(picks[k] * pal[form].length)]))
          })
          mesh.castShadow = true
          mesh.computeBoundingSphere()
          mesh.userData = { leaf, form, n: list.length, picks }
          meshes.push(mesh)
          if (leaf) {
            const hull = new THREE.InstancedMesh(addRadialOut(this.own(part.geom), undefined, 0.1), this.treeHull, list.length)
            hull.instanceMatrix = mesh.instanceMatrix
            hull.computeBoundingSphere()
            hull.userData = { hull: true, n: list.length }
            meshes.push(hull)
          }
        }
      })
      for (const m of meshes) this.group.add(m)
      this.trees.push({ meshes })
    }
  }

  /** 구름: 구 둘레 바깥 고리(중심에서 4.2~5.4km, 높이 450~650m)에 열. 조망 카메라에서 먼 쪽 구름이 화면 위 띠(구 바깥)에 걸린다.
   * 더 멀리 두면 지도 투영의 먼 평면 밖이라 잘렸다. 날씨가 몇 개를 띄울지 정하고, 화면 아래쪽(데이터가 있는 곳)으로 내려오면 걷힌다 */
  addClouds(parts: AssetPart[]) {
    if (!parts[0]) return
    const geom = this.own(parts[0].geom)
    const hullGeom = addRadialOut(this.own(parts[0].geom), undefined, 0.15)
    for (let k = 0; k < 10; k++) {
      // 앞 번호부터 띄우니 앞 셋은 고리에 고르게(맑음에도 사방에 하나씩)
      const a = (((k * 3) % 10) / 10) * Math.PI * 2 + 0.4
      const r = 4200 + hash01(k, 21) * 1200
      const group = new THREE.Group()
      // clone()은 flatShading(툰 재질 타입 밖 속성)을 안 옮겨 법선 없는 기하가 검게 나왔다 → 구름마다 새로 만든다
      const mat = toonMaterial(this.cloudMat.color, { emissive: this.cloudMat.emissive, emissiveIntensity: this.cloudMat.emissiveIntensity, transparent: true })
      const hmat = this.cloudHull.clone()
      hmat.uniforms = { ...this.cloudHull.uniforms, uAlpha: { value: 1 } }
      group.add(new THREE.Mesh(geom, mat), new THREE.Mesh(hullGeom, hmat))
      const s = 7 + hash01(k, 23) * 3
      group.scale.set(s, s, s)
      group.rotation.y = hash01(k, 25) * Math.PI
      const home = new THREE.Vector3(Math.cos(a) * r, 450 + hash01(k, 27) * 200, Math.sin(a) * r)
      group.position.copy(home)
      group.renderOrder = 3
      this.group.add(group)
      this.clouds.push({ group, home, phase: hash01(k, 29) * 10, shown: 0, want: 0 })
    }
    if (this.look) this.setLook(this.look, this.snowU.uSnowC.value)
  }

  setTheme(dark: boolean) {
    this.dark = dark
    const t = DECOR_THEME[dark ? "dark" : "light"]
    this.trunk.color.set(t.trunk)
    ;(this.treeHull.uniforms.uInk.value as THREE.Color).set(t.ink)
    const color = new THREE.Color()
    for (const tc of this.trees) {
      for (const m of tc.meshes) {
        if (!m.userData.leaf || !m.instanceColor) continue
        const pal = t.leaf[m.userData.form as number]
        const picks = m.userData.picks as Float32Array
        for (let k = 0; k < picks.length; k++) m.setColorAt(k, color.set(pal[Math.floor(picks[k] * pal.length)]))
        m.instanceColor.needsUpdate = true
      }
    }
  }

  /** 날씨: 구름 수·색, 수관 눈 */
  setLook(w: WeatherLook, snowColor: THREE.Color) {
    this.look = w
    this.cloudMat.color.set(w.cloud)
    this.clouds.forEach((c, k) => {
      c.want = k < w.clouds ? 1 : 0
      ;((c.group.children[0] as THREE.Mesh).material as THREE.MeshToonMaterial).color.set(w.cloud)
      ;(((c.group.children[1] as THREE.Mesh).material as THREE.ShaderMaterial).uniforms.uInk.value as THREE.Color).set(w.cloudInk)
    })
    this.snowU.uSnow.value = w.snow * 0.85
    this.snowU.uSnowC.value.copy(snowColor)
  }

  /**
   * 매 프레임: 줌으로 나무를 솎고(조망 35% → 줌 15 이상 전부, 윤곽선은 14.6 이상), 구름을 흘리고 띄우거나 걷는다.
   * 구름 시간은 그린 프레임 사이만 흐른다(멈춰 있다 다시 그릴 때 순간이동하지 않게). 걷히거나 뜨는 중이면 true(다시 그려 달라는 뜻)
   */
  frame(proj: THREE.Matrix4, zoom: number): boolean {
    const k = Math.min(1, Math.max(0.35, ((zoom - 13.4) / 1.6) * 0.65 + 0.35))
    for (const tc of this.trees) {
      for (const m of tc.meshes) {
        m.count = Math.max(1, Math.ceil((m.userData.n as number) * k))
        if (m.userData.hull) m.visible = zoom >= 14.6
      }
    }
    const now = performance.now()
    this.t += this.last ? Math.min(0.05, (now - this.last) / 1000) : 0
    this.last = now
    let moving = false
    for (const c of this.clouds) {
      const a = this.t * 0.02 + c.phase
      c.group.position.set(c.home.x + Math.cos(a) * 160, c.home.y + Math.sin(a * 1.7) * 8, c.home.z + Math.sin(a) * 160)
      TMP_V.set(c.group.position.x, c.group.position.y, c.group.position.z, 1).applyMatrix4(proj)
      const w = TMP_V.w
      const nx = TMP_V.x / w
      const ny = TMP_V.y / w
      // 화면 위 띠(지평선 쪽)에서만. 아래로 내려와 데이터 위에 걸리거나 양옆 패널 밑이면 걷는다
      const inBand = w > 0 && ny > 0.32 && ny < 1.25 && Math.abs(nx) < 0.92
      const want = c.want && zoom < 15.4 && inBand ? 1 : 0
      c.shown += (want - c.shown) * 0.08
      if (Math.abs(want - c.shown) > 0.01) moving = true
      c.group.visible = c.shown > 0.02
      ;((c.group.children[0] as THREE.Mesh).material as THREE.MeshToonMaterial).opacity = c.shown
      ;((c.group.children[1] as THREE.Mesh).material as THREE.ShaderMaterial).uniforms.uAlpha.value = c.shown
    }
    return moving
  }

  dispose() {
    for (const tc of this.trees) for (const m of tc.meshes) m.dispose()
    for (const c of this.clouds) c.group.traverse((o) => ((o as THREE.Mesh).material as THREE.Material | undefined)?.dispose?.())
    for (const m of [this.leaf, this.trunk, this.treeHull, this.cloudMat, this.cloudHull]) m.dispose()
    for (const g of this.geoms) g.dispose()
  }
}
