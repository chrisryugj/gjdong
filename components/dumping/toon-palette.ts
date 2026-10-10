// /dumping 모형 보기 건물 색(23라운드 → 24라운드 2026-10-09 실사 재질). 순수 계산이라 엔진 없이 테스트한다.
// 동마다 텍셀 넷(RGBA, sRGB 바이트): 0 데이터 벽 · 1 데이터 지붕 · 2 재질 벽 · 3 재질 지붕.
//   데이터 텍셀 알파 = 255 데이터 색 · 128 흐린 재질(값 0·칸 밖·다른 동·동별 기둥) · 0 재질 그대로(바탕 없음)
//   재질 벽 알파 = 유형 바이트(toon-world BuildingUse·연대·벽돌, 셰이더가 창 무늬를 고른다) · 재질 지붕 알파 = 층수(기록용. 셰이더는 정보 텍스처의 층수를 쓴다)
// 데이터 색은 지도 압출과 같은 램프·경계(map-geo colorOf)라 범례가 그대로 통한다. 셰이더가 창·층 줄눈·난간은 그 위에 그대로 그린다.
// 재질은 용도·연대·구조로 고른다: 벽돌조 빨간 벽돌 · 2000년대 이후 빌라 석재·타일 · 아파트 흰 도장 · 업무 유리 · 학교 크림 · 공장 금속판.
// 평지붕은 서울 옥상 초록 방수 도장이 절반 남짓, 나머지 회색 콘크리트. 박공은 기와·슬레이트 색. 같은 유형 안에서는 동 번호 해시로 돌린다
// 25라운드(2026-10-10 "건물색 거의 비슷한데 현실감 있게"): 위성 색(toon-sat, 브이월드 영상에서 동마다 뽑은 지붕·외벽)이 있으면 그것을 먼저 쓰고 팔레트는 없을 때만
// 26라운드(2026-10-10 "실사와 카툰 사이 어중간" → 정교한 모형 방향, 사용자 채택): 지붕 위성 색은 고른 팔레트(세이지·슬레이트·테라코타·모래·회색)로 맞추고
//   외벽은 모형 도료처럼 크림 쪽으로 22% 섞는다(색상은 실물 계열 그대로). 데이터 바탕은 건물 전체를 칸 값으로 칠하지 않는다(아파트까지 다가구 초록이 됐다):
//   다가구·단독 바탕은 그 집(주용도 단독주택)만 초록, 나머지는 크림. 민원·과태료·생활인구 바탕은 건물은 크림이고 데이터는 땅의 칸이 맡는다
import type { BaseMode, GridCell } from "@/lib/dumping/types"
import { BuildingUse, decadeOf, isBrick, isDandok, SAT_ROOF, SAT_WALL, useOf, type ToonSat } from "@/lib/dumping/toon-world"
import { BASE_DEF, colorOf, greyRamp, mixHex } from "./map-geo"

type Theme = "light" | "dark"

export const TEXELS_PER_BUILDING = 4
const STRIDE = TEXELS_PER_BUILDING * 4

/** 데이터 텍셀 알파 */
export const DATA_COLOR = 255
export const DATA_MUTED = 128
export const DATA_NONE = 0

/** 흐린 재질·후보 표시의 중립(지도 압출 NEUTRAL_BUILDING과 같은 계열) */
export const TOON_NEUTRAL: Record<Theme, { wall: string; roof: string }> = {
  light: { wall: "#e9e5dc", roof: "#d9d4c8" },
  dark: { wall: "#323c43", roof: "#3c4750" },
}

/** 데이터 바탕의 모형 색(26라운드): 다가구·단독 집 비취 초록(도면 램프 PAL_GREEN 계열, 나무 올리브와 색상각 60° 차) · 나머지 크림.
 * 처음엔 레퍼런스(강릉·이탈리아 지도의 크림 벽 + 주황 지붕)대로 주황이었는데 과태료 앰버와 같은 계열이라 과태료 빛 원·기둥이 집에 묻혔다(같은 날 3D 개체 검토).
 * 지붕은 채도 높은 비취(#36b07f): 진한 초록은 조망에서 그늘과 겹쳐 검게 읽혀 청회 민원 블록이 묻혔고, 도면 램프의 탁한 초록은 조망 채도가 0.08로 흙빛이었다 */
export const MODEL_DATA: Record<Theme, { house: { wall: string; roof: string }; other: { wall: string; roof: string } }> = {
  light: { house: { wall: "#9ad9bc", roof: "#36b07f" }, other: { wall: "#f1ece3", roof: "#ddd6ca" } },
  dark: { house: { wall: "#3f9a78", roof: "#2c8f68" }, other: { wall: "#36414a", roof: "#414c55" } },
}

// 외벽은 서울 저층 주거지 실물 기준(25라운드): 1980~90년대 치장벽돌(적색·갈색), 2000년대 화강석·드라이비트, 2010년대 도시형생활주택 벽돌 타일·짙은 회색 패널,
// 1980~90년대 아파트 연한 색 도장(크림·옅은 민트·분홍·하늘), 2000년대 이후 아파트 흰·밝은 회색
const P = {
  brickRed: ["#8e4b3b", "#9c5340", "#a65d45", "#7f4335", "#b0674c", "#93503f"],
  brickBrown: ["#6f4c3e", "#7e5a48", "#5f4337", "#8a6450", "#74503f"],
  brickTile: ["#b5714f", "#c27d58", "#a8654a", "#9b5a44"],
  stucco: ["#e6dcc8", "#ddd3c3", "#ece5d6", "#d6cdb9", "#e2d5c4", "#d9d6cc", "#cfd6cf"],
  stone: ["#c9c4bc", "#bfb6ab", "#cdbfb2", "#b3aca2", "#d4cfc6", "#a9a196", "#c2b4a3"],
  darkPanel: ["#5f6366", "#6c6f72", "#4f5356", "#77797a"],
  whitePanel: ["#eceae5", "#e2e0db", "#f2f1ee"],
  aptOld: ["#e8e2d6", "#e3e6e3", "#e6dfdf", "#dde3e8", "#e9e4d3", "#e4dccb"],
  aptNew: ["#efeee9", "#e6e5e1", "#f3f2ef", "#e9e8e4"],
  shop: ["#d4cec3", "#c8c2b6", "#bdb6aa", "#d9d0bf", "#a8a196", "#b98f74", "#8e8a84", "#cfc5b4", "#9aa3a8"],
  glass: ["#7e95a3", "#6f8794", "#8aa0a8", "#748c99", "#91a3ad", "#5f7783"],
  officeStone: ["#cfc8bc", "#bdb5a8", "#d8d2c6", "#a9a397"],
  school: ["#e5dac2", "#dccfb3", "#e8e0cc"],
  civic: ["#e7e3db", "#ddd8cd", "#d2cdc3", "#c9c4bc"],
  metal: ["#c9cdcf", "#bcc4c9", "#d4d6d3", "#aeb8bf"],
  annex: ["#c9c3b8", "#bdb7ab", "#d3cdc1"],
  greenRoof: ["#6f9a77", "#78a37f", "#679170", "#82aa86"],
  greyRoof: ["#a8a59e", "#9d9a93", "#b3afa7", "#928f88"],
  tile: ["#5a6068", "#4f6273", "#5f7766", "#8a4f3e", "#a35f43", "#6b5a52"],
  metalRoof: ["#b9c3c9", "#a9b6be", "#cfd3d2"],
  darkRoof: ["#7f8183", "#76787a", "#8a8a88"],
  aptRoof: ["#b5b2ab", "#aaa79f"],
} as const

/** 동 번호 해시(0~1). 재질 돌리기·박공 판정·창 불빛에 쓴다 */
export function hash01(i: number, salt = 0): number {
  let h = Math.imul(i ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(salt + 1, 0xc2b2ae35)
  h ^= h >>> 15
  h = Math.imul(h, 0x2c1b3c6d)
  h ^= h >>> 12
  return (h >>> 0) / 4294967296
}

const pick = (list: readonly string[], i: number, salt: number) => list[Math.floor(hash01(i, salt) * list.length)]

/** 동 i 의 벽·지붕 재질 색(라이트 기준 hex). gable 이면 기와·슬레이트 지붕. 같은 묶음 안에서도 동마다 밝기를 ±6% 흔든다 */
export function materialOf(i: number, style: number, floors: number, gable: boolean): { wall: string; roof: string } {
  const use = useOf(style)
  const dec = decadeOf(style)
  const brick = isBrick(style)
  const r = hash01(i, 51)
  const brickOf = () => pick(hash01(i, 52) < 0.7 ? P.brickRed : P.brickBrown, i, 53)
  // 연대별 묶음 비율(누적): [묶음, 이 값 미만이면]
  const by = (table: [readonly string[], number][]): string => {
    for (const [list, upto] of table) if (r < upto) return list === P.brickRed ? brickOf() : pick(list, i, 53)
    return pick(table[table.length - 1][0], i, 53)
  }
  let wall: string
  switch (use) {
    case BuildingUse.house:
      wall = brick ? by([[P.brickRed, 0.85], [P.stucco, 1]]) : dec <= 3 ? by([[P.brickRed, 0.5], [P.stucco, 0.85], [P.stone, 1]]) : by([[P.stucco, 0.45], [P.stone, 0.7], [P.whitePanel, 0.85], [P.brickTile, 1]])
      break
    case BuildingUse.villa:
    case BuildingUse.rowhouse:
      // 1990년대까지의 다세대·다가구는 구조와 무관하게 치장벽돌 외벽이 흔하다(철근콘크리트조도 겉은 벽돌)
      wall = brick
        ? by([[P.brickRed, 0.85], [P.stucco, 1]])
        : dec <= 3
          ? by([[P.brickRed, 0.62], [P.stucco, 0.85], [P.stone, 1]])
          : dec === 4
            ? by([[P.stone, 0.42], [P.stucco, 0.7], [P.brickRed, 0.85], [P.darkPanel, 1]])
            : dec === 5
              ? by([[P.brickTile, 0.3], [P.darkPanel, 0.5], [P.whitePanel, 0.7], [P.stone, 1]])
              : dec === 6
                ? by([[P.whitePanel, 0.35], [P.darkPanel, 0.6], [P.brickTile, 0.8], [P.stone, 1]])
                : by([[P.brickRed, 0.45], [P.stucco, 0.7], [P.stone, 1]])
      break
    case BuildingUse.apartment:
      wall = dec <= 2 ? mixHex(pick(P.aptOld, i, 53), "#bdb9b0", 0.25) : dec === 3 ? pick(P.aptOld, i, 53) : pick(P.aptNew, i, 53)
      break
    case BuildingUse.shop:
      wall = brick && r < 0.6 ? pick(P.brickBrown, i, 53) : pick(P.shop, i, 53)
      break
    case BuildingUse.office:
      wall = (dec >= 4 && dec < 7) || floors >= 15 ? (r < 0.75 ? pick(P.glass, i, 53) : pick(P.officeStone, i, 53)) : pick(P.officeStone, i, 53)
      break
    case BuildingUse.school:
      wall = brick && dec <= 3 && r < 0.7 ? pick(P.brickRed, i, 53) : pick(P.school, i, 53)
      break
    case BuildingUse.civic:
      wall = pick(P.civic, i, 53)
      break
    case BuildingUse.industry:
      wall = pick(P.metal, i, 53)
      break
    default:
      wall = brick ? pick(P.brickBrown, i, 53) : pick(P.annex, i, 53)
  }
  const j = hash01(i, 57)
  wall = mixHex(wall, j < 0.5 ? "#ffffff" : "#000000", Math.abs(j - 0.5) * 0.12)
  let roof: string
  const q = hash01(i, 54)
  if (gable) roof = pick(P.tile, i, 55)
  else if (use === BuildingUse.apartment) roof = pick(P.aptRoof, i, 55)
  else if (use === BuildingUse.office || (use === BuildingUse.shop && floors >= 6)) roof = pick(P.darkRoof, i, 55)
  else if (use === BuildingUse.industry) roof = pick(P.metalRoof, i, 55)
  else if (use === BuildingUse.civic) roof = pick(P.greyRoof, i, 55)
  else {
    const green = use === BuildingUse.shop ? 0.4 : use === BuildingUse.school ? 0.5 : 0.56
    roof = q < green ? pick(P.greenRoof, i, 55) : q < green + 0.36 ? pick(P.greyRoof, i, 55) : q < green + 0.4 ? "#9a5a48" : "#7d93a3"
  }
  return { wall, roof }
}

/** 위성 사진 색 → 모형 재질 색. 사진은 해·하늘빛이 이미 든 채 뿌옇게 찍혀 같은 회색 지붕이 팔레트보다 30%쯤 어둡다.
 * 밝기를 1−(1−L)^lift 로 들어 올리고(어두운 쪽을 더, 흰색은 그대로) 채도를 sat 배 살린다 */
export function fromPhoto(r: number, g: number, b: number, lift = 1.6, sat = 1.15): string {
  const c = [r / 255, g / 255, b / 255]
  const L = 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]
  const L2 = 1 - Math.pow(1 - L, lift)
  const k = L2 / Math.max(L, 0.02)
  const hex = c.map((v) => Math.round(Math.min(1, Math.max(0, L2 + (v * k - L2) * sat)) * 255).toString(16).padStart(2, "0"))
  return `#${hex.join("")}`
}

/** 동 i 의 위성 색(있는 것만) */
/** 모형 지붕 팔레트(26라운드). 위성 색의 색상 계열을 지키되 고른 칸으로 맞춘다(사진 그대로는 탁하고 제각각이라 장난감 도시처럼 어수선했다) */
const ROOF = {
  sage: ["#a3c2aa", "#97b8a0", "#adc9b2"],
  slate: ["#93a9bd", "#a1b5c7", "#879db2"],
  terracotta: ["#cc8b6c", "#d3977b", "#bf7e61"],
  sand: ["#dccb9f", "#e3d5ae"],
  charcoal: ["#7d8287", "#8a8f93"],
  grey: ["#bfbab0", "#c9c4ba", "#b4afa5"],
  white: ["#e8e3d9", "#eeeae2"],
} as const
export function snapRoof(hex: string, i: number): string {
  const c = [1, 3, 5].map((k) => parseInt(hex.slice(k, k + 2), 16) / 255)
  const mx = Math.max(...c), mn = Math.min(...c), d = mx - mn
  const l = (mx + mn) / 2
  const sat = d < 1e-6 ? 0 : d / (1 - Math.abs(2 * l - 1))
  let h = 0
  if (d > 1e-6) h = mx === c[0] ? 60 * (((c[1] - c[2]) / d) % 6) : mx === c[1] ? 60 * ((c[2] - c[0]) / d + 2) : 60 * ((c[0] - c[1]) / d + 4)
  if (h < 0) h += 360
  const list =
    sat > 0.12 && h >= 105 && h < 200 ? ROOF.sage
    : sat > 0.14 && h >= 200 && h < 260 ? ROOF.slate
    : sat > 0.18 && (h < 35 || h >= 330) ? ROOF.terracotta
    : sat > 0.16 && h >= 35 && h < 75 ? ROOF.sand
    : l < 0.42 ? ROOF.charcoal
    : l > 0.8 ? ROOF.white
    : ROOF.grey
  return pick(list, i, 61)
}

export function satOf(sat: ToonSat | null | undefined, i: number): { roof?: string; wall?: string } {
  if (!sat) return {}
  const f = sat.flags[i]
  const o = i * 3
  return {
    roof: f & SAT_ROOF ? snapRoof(fromPhoto(sat.roof[o], sat.roof[o + 1], sat.roof[o + 2]), i) : undefined,
    wall: f & SAT_WALL ? fromPhoto(sat.wall[o], sat.wall[o + 1], sat.wall[o + 2], 1.45) : undefined,
  }
}

/** 다크(밤): 재질을 밤빛 쪽으로 눌러 창 불빛이 주인공이 되게 */
function night(hex: string, k = 0.66): string {
  return mixHex(hex, "#16202a", k)
}

function put(out: Uint8Array, o: number, hex: string, a: number) {
  out[o] = parseInt(hex.slice(1, 3), 16)
  out[o + 1] = parseInt(hex.slice(3, 5), 16)
  out[o + 2] = parseInt(hex.slice(5, 7), 16)
  out[o + 3] = a
}

/** 재질 텍셀(2·3)을 쓴다. gable[i] 는 기하가 정한 박공 여부(지붕 재질이 기와로 바뀐다). 위성 색이 있으면 그 동은 위성 색 */
export function toonMaterials(count: number, style: Uint8Array, floors: Uint8Array, gable: Uint8Array, theme: Theme, out: Uint8Array, sat?: ToonSat | null): Uint8Array {
  for (let i = 0; i < count; i++) {
    const p = materialOf(i, style[i], floors[i], gable[i] === 1)
    const s = satOf(sat, i)
    // 외벽은 모형 도료처럼 크림 쪽으로(실물 색상 계열은 지킨다)
    const m = { wall: mixHex(s.wall ?? p.wall, "#f3ede2", 0.22), roof: s.roof ?? p.roof }
    const o = i * STRIDE
    put(out, o + 8, theme === "dark" ? night(m.wall) : m.wall, style[i])
    put(out, o + 12, theme === "dark" ? night(m.roof, 0.7) : m.roof, Math.min(255, Math.max(1, floors[i] || 2)))
  }
  return out
}

/** 범례(바탕 없음 · 모형): 외벽 대표 재질과 지붕(위성 사진 색을 맞춘 팔레트, 흔한 셋) */
export function modelSwatches(): { label: string; colors: string[] }[] {
  const paint = (c: string) => mixHex(c, "#f3ede2", 0.22)
  return [
    { label: "벽돌", colors: [paint(P.brickRed[1])] },
    { label: "석재·도장", colors: [paint(P.stone[0])] },
    { label: "아파트", colors: [paint(P.aptNew[1])] },
    { label: "유리", colors: [paint(P.glass[1])] },
    { label: "지붕 사진 색", colors: [ROOF.sage[0], ROOF.grey[0], ROOF.slate[0]] },
  ]
}

export interface ToonPaint {
  theme: Theme
  base: BaseMode
  grid: GridCell[]
  /** 동 → 격자 칸 번호(-1 칸 밖) */
  cellOf: Int32Array
  /** 동마다 유형 바이트(toon-world). 다가구·단독 바탕이 그 집만 칠할 때 쓴다 */
  style: Uint8Array
  selectedDong: string | null
  /** 동별 기둥: 기둥이 주인공이라 건물은 흐린 재질(지도 압출 dimB와 같다) */
  dongBars: boolean
  /** 재배치 후보: 바탕 램프를 회색 단계로(지도 압출 greyMode와 같다) */
  candidates: boolean
  /** 시설·배치추천 말뚝이 서면 히트맵을 중립 쪽으로 55% 누른다 */
  pointsOn: boolean
}

/** 데이터 텍셀(0·1)을 쓴다. out 을 주면 거기(길이 count×16).
 * 바탕 없음: 재질 그대로(후보 표시 중엔 흐린 재질) · 다가구·단독: 그 집만 초록, 나머지 크림 · 민원·과태료·생활인구: 그 칸 값의 램프 색(도면 압출과 같은 문턱, 값 0은 크림).
 * 동을 고르면 그 동 밖은 흐린 재질, 동별 기둥을 세우면 기둥이 주인공이라 모두 크림 */
export function toonColors(p: ToonPaint, out?: Uint8Array): Uint8Array {
  const n = p.cellOf.length
  const buf = out ?? new Uint8Array(n * STRIDE)
  const neutral = TOON_NEUTRAL[p.theme]
  if (p.base === "none") {
    const a = p.candidates && !p.selectedDong ? DATA_MUTED : DATA_NONE
    for (let i = 0; i < n; i++) {
      put(buf, i * STRIDE, neutral.wall, a)
      put(buf, i * STRIDE + 4, neutral.roof, 255)
    }
    return buf
  }
  const m = MODEL_DATA[p.theme]
  // 시설·후보·배치추천이 서면 집 초록을 크림 쪽으로 55% 눌러 그것들이 앞에 선다(지도 압출 pointsOn·greyMode 와 같은 문법. 초록 재활용정거장이 초록 집에 묻혔다)
  const house = (p.pointsOn || p.candidates) && !p.selectedDong ? { wall: mixHex(m.house.wall, m.other.wall, 0.72), roof: mixHex(m.house.roof, m.other.roof, 0.72) } : m.house
  for (let i = 0; i < n; i++) {
    const o = i * STRIDE
    const ci = p.cellOf[i]
    const cell = ci >= 0 ? p.grid[ci] : null
    if (p.selectedDong && (!cell || (cell[7] || "") !== p.selectedDong)) {
      put(buf, o, neutral.wall, DATA_MUTED)
      put(buf, o + 4, neutral.roof, 255)
      continue
    }
    // 26라운드 후속 3(사용자 "바탕이 눈에 안 들어온다"): 민원·과태료·생활인구 바탕은 땅 칸만 칠하면 건물 사이에 묻혔다 →
    // 그 칸 값의 램프 색으로 건물을 칠한다(도면 압출과 같은 램프·문턱. 값 0·칸 밖은 크림). 다가구·단독은 그 집만 초록 그대로
    if (p.base !== "unm" && !p.dongBars && cell) {
      const def = BASE_DEF[p.base as "comp" | "enf" | "lp"]
      const v = cell[def.idx] ?? 0
      if (v > 0) {
        const pal = p.candidates && !p.selectedDong ? greyRamp(p.theme, def.pal.length) : p.pointsOn ? def.pal.map((x) => mixHex(x, m.other.wall, 0.55)) : def.pal
        const col = colorOf(v, def.stops, pal)
        put(buf, o, mixHex(col, "#ffffff", 0.18), DATA_COLOR)
        put(buf, o + 4, col, 255)
        continue
      }
    }
    const c = p.base === "unm" && !p.dongBars && isDandok(p.style[i]) ? house : m.other
    put(buf, o, c.wall, DATA_COLOR)
    put(buf, o + 4, c.roof, 255)
  }
  return buf
}
