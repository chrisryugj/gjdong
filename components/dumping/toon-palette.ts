// /dumping 모형 보기 건물 색(23라운드 → 24라운드 2026-10-09 실사 재질). 순수 계산이라 엔진 없이 테스트한다.
// 동마다 텍셀 넷(RGBA, sRGB 바이트): 0 데이터 벽 · 1 데이터 지붕 · 2 재질 벽 · 3 재질 지붕.
//   데이터 텍셀 알파 = 255 데이터 색 · 128 흐린 재질(값 0·칸 밖·다른 동·동별 기둥) · 0 재질 그대로(바탕 없음)
//   재질 벽 알파 = 유형 바이트(toon-world BuildingUse·연대·벽돌, 셰이더가 창 무늬를 고른다) · 재질 지붕 알파 = 층수(기록용. 셰이더는 정보 텍스처의 층수를 쓴다)
// 데이터 색은 지도 압출과 같은 램프·경계(map-geo colorOf)라 범례가 그대로 통한다. 셰이더가 창·층 줄눈·난간은 그 위에 그대로 그린다.
// 재질은 용도·연대·구조로 고른다: 벽돌조 빨간 벽돌 · 2000년대 이후 빌라 석재·타일 · 아파트 흰 도장 · 업무 유리 · 학교 크림 · 공장 금속판.
// 평지붕은 서울 옥상 초록 방수 도장이 절반 남짓, 나머지 회색 콘크리트. 박공은 기와·슬레이트 색. 같은 유형 안에서는 동 번호 해시로 돌린다
import type { BaseMode, GridCell } from "@/lib/dumping/types"
import { BuildingUse, decadeOf, isBrick, useOf } from "@/lib/dumping/toon-world"
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

const P = {
  brickRed: ["#9b5a45", "#a5634b", "#8e513f", "#b0705a", "#985f4c", "#a86b52"],
  brickBrown: ["#8a6a55", "#9c7a62", "#7f6250", "#a3846b"],
  stucco: ["#e9e2d4", "#ded5c4", "#f0ebe1", "#d8d0c0", "#e6ddd0", "#ece4cf"],
  stone: ["#d7cdbb", "#cbbfab", "#c4c0b8", "#b9b2a7", "#dcd3c4", "#aaa397"],
  aptWhite: ["#efece6", "#e8e5de", "#f3f1ec", "#e3e1dc", "#ece7dc"],
  shop: ["#d4cec3", "#c8c2b6", "#bdb6aa", "#d9d0bf", "#a8a196", "#b98f74"],
  glass: ["#7e95a3", "#6f8794", "#8aa0a8", "#748c99", "#91a3ad"],
  officeStone: ["#cfcac1", "#bfb9ae", "#d8d2c6"],
  school: ["#e5dac2", "#dccfb3", "#e8e0cc"],
  civic: ["#e7e3db", "#ddd8cd", "#d2cdc3"],
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

/** 동 i 의 벽·지붕 재질 색(라이트 기준 hex). gable 이면 기와·슬레이트 지붕 */
export function materialOf(i: number, style: number, floors: number, gable: boolean): { wall: string; roof: string } {
  const use = useOf(style)
  const dec = decadeOf(style)
  const brick = isBrick(style)
  const r = hash01(i, 51)
  let wall: string
  switch (use) {
    case BuildingUse.house:
      wall = (brick && r < 0.8) || (dec <= 3 && r < 0.45) ? pick(hash01(i, 52) < 0.7 ? P.brickRed : P.brickBrown, i, 53) : pick(P.stucco, i, 53)
      break
    case BuildingUse.villa: {
      // 1990년대까지의 다세대·다가구는 구조와 무관하게 치장벽돌 외벽이 흔하다(철근콘크리트조도 겉은 벽돌). 2000년대부터 석재·타일·도장
      const p = brick ? 0.85 : dec <= 3 ? 0.65 : dec === 4 ? 0.3 : dec === 7 ? 0.5 : 0.12
      wall = r < p ? pick(hash01(i, 52) < 0.7 ? P.brickRed : P.brickBrown, i, 53) : pick(dec >= 4 && dec < 7 ? P.stone : P.stucco, i, 53)
      break
    }
    case BuildingUse.apartment:
      wall = dec <= 2 ? mixHex(pick(P.aptWhite, i, 53), "#c9c6bf", 0.3) : pick(P.aptWhite, i, 53)
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

/** 재질 텍셀(2·3)을 쓴다. gable[i] 는 기하가 정한 박공 여부(지붕 재질이 기와로 바뀐다) */
export function toonMaterials(count: number, style: Uint8Array, floors: Uint8Array, gable: Uint8Array, theme: Theme, out: Uint8Array): Uint8Array {
  for (let i = 0; i < count; i++) {
    const m = materialOf(i, style[i], floors[i], gable[i] === 1)
    const o = i * STRIDE
    put(out, o + 8, theme === "dark" ? night(m.wall) : m.wall, style[i])
    put(out, o + 12, theme === "dark" ? night(m.roof, 0.7) : m.roof, Math.min(255, Math.max(1, floors[i] || 2)))
  }
  return out
}

/** 범례(바탕 없음): 유형 대표 재질 */
export function modelSwatches(): { label: string; color: string }[] {
  return [
    { label: "단독·다가구 벽돌", color: P.brickRed[0] },
    { label: "빌라 석재·타일", color: P.stone[1] },
    { label: "아파트", color: P.aptWhite[3] },
    { label: "업무 유리", color: P.glass[1] },
    { label: "옥상 방수", color: P.greenRoof[0] },
  ]
}

export interface ToonPaint {
  theme: Theme
  base: BaseMode
  grid: GridCell[]
  /** 동 → 격자 칸 번호(-1 칸 밖) */
  cellOf: Int32Array
  selectedDong: string | null
  /** 동별 기둥: 기둥이 주인공이라 건물은 흐린 재질(지도 압출 dimB와 같다) */
  dongBars: boolean
  /** 재배치 후보: 바탕 램프를 회색 단계로(지도 압출 greyMode와 같다) */
  candidates: boolean
  /** 시설·배치추천 말뚝이 서면 히트맵을 중립 쪽으로 55% 누른다 */
  pointsOn: boolean
}

/** 데이터 텍셀(0·1)을 쓴다. out 을 주면 거기(길이 count×16) */
export function toonColors(p: ToonPaint, out?: Uint8Array): Uint8Array {
  const n = p.cellOf.length
  const buf = out ?? new Uint8Array(n * STRIDE)
  const neutral = TOON_NEUTRAL[p.theme]
  const cache = new Map<string, string>()
  const lift = (c: string) => cache.get(c) ?? cache.set(c, mixHex(c, p.theme === "dark" ? "#000000" : "#ffffff", 0.12)).get(c)!
  if (p.base === "none") {
    // 실사 재질 그대로. 후보 표시 중(동 선택 없음)은 지도 압출처럼 흐린 재질
    const a = p.candidates && !p.selectedDong ? DATA_MUTED : DATA_NONE
    for (let i = 0; i < n; i++) {
      put(buf, i * STRIDE, neutral.wall, a)
      put(buf, i * STRIDE + 4, neutral.roof, 255)
    }
    return buf
  }
  const def = BASE_DEF[p.base]
  const grey = p.candidates && !p.selectedDong
  const pal = grey ? greyRamp(p.theme, def.pal.length) : p.pointsOn ? def.pal.map((c) => mixHex(c, neutral.wall, 0.55)) : def.pal
  for (let i = 0; i < n; i++) {
    const o = i * STRIDE
    const ci = p.cellOf[i]
    const cell = ci >= 0 ? p.grid[ci] : null
    const dim = p.selectedDong ? !cell || (cell[7] || "") !== p.selectedDong : p.dongBars
    const v = cell ? cell[def.idx] : 0
    if (dim || v <= 0) {
      put(buf, o, neutral.wall, DATA_MUTED)
      put(buf, o + 4, neutral.roof, 255)
      continue
    }
    const c = colorOf(v, def.stops, pal)
    put(buf, o, c, DATA_COLOR)
    put(buf, o + 4, lift(c), 255)
  }
  return buf
}
