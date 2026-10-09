// /dumping 모형 보기 건물 색(23라운드, 2026-10-09). 순수 계산이라 엔진 없이 테스트한다.
// 바탕 지표가 있으면 지금 지도와 같은 램프·경계(map-geo colorOf)로 벽·지붕을 칠하고, 값 0·칸 밖·흐림은 흰 모형(중립)으로 둔다.
// 바탕 없음이면 층수로 짐작한 유형별 모형 팔레트(지도 압출의 realBuildingExpr와 같은 층수 구간·같은 ±1층 흔들림).
// 모형 팔레트는 채도를 눌렀다: 데이터 램프(초록·파랑·앰버·청회)와 시설 색이 이 위에 서야 하니 지붕이 데이터처럼 읽히면 안 된다.
// 결과는 동마다 텍셀 두 개(벽 RGBA · 지붕 RGBA, sRGB 바이트). 알파는 쓰지 않는다(255)
import type { BaseMode, GridCell } from "@/lib/dumping/types"
import { BASE_DEF, colorOf, greyRamp, mixHex } from "./map-geo"

type Theme = "light" | "dark"

export const TOON_NEUTRAL: Record<Theme, { wall: string; roof: string }> = {
  light: { wall: "#f6f2ea", roof: "#e6dfd2" },
  dark: { wall: "#323c43", roof: "#3c4750" },
}

// 층수 구간마다 벽·지붕 후보. 같은 구간 안에서는 동 번호 해시로 돌려 이웃이 같은 색으로 붙지 않게
export const TOON_REAL: Record<Theme, { walls: string[]; roofs: string[] }[]> = {
  light: [
    { walls: ["#fbf5ea", "#f8efe1", "#fdf9f2"], roofs: ["#d98b62", "#8fa3b5", "#a9b98a", "#e0b56a"] }, // 1~2층 단독(박공)
    { walls: ["#f6ede0", "#f2e7d8", "#f9f3ea", "#f1e2d3"], roofs: ["#e3d8c6", "#dccfbb"] }, // 3~4층 다가구·다세대
    { walls: ["#f1eee8", "#ebe8e1"], roofs: ["#d9d4ca"] }, // 5~9층 근생·빌라
    { walls: ["#f7f7f4", "#f1f1ed"], roofs: ["#cfd6dc"] }, // 10~19층 아파트
    { walls: ["#dfe7ee", "#d4dee8"], roofs: ["#b4c1ce"] }, // 20층+ 고층
  ],
  dark: [
    { walls: ["#4a4640", "#47433d", "#4d4a44"], roofs: ["#7a5546", "#4f5a66", "#5a6150", "#7a6a4d"] },
    { walls: ["#47413b", "#433d37", "#4b453e"], roofs: ["#5a5249", "#544c44"] },
    { walls: ["#3f4347", "#3b3f43"], roofs: ["#4b5055"] },
    { walls: ["#424a51", "#3e464d"], roofs: ["#4f5961"] },
    { walls: ["#3a4a59", "#364553"], roofs: ["#465868"] },
  ],
}

/** 범례 층수 띠(구간별 대표색 다섯). 박공 집은 지붕색, 그 밖은 벽색이 그 유형을 말한다 */
export function toonRealSwatches(theme: Theme): string[] {
  return TOON_REAL[theme].map((c, k) => (k === 0 ? c.roofs[0] : k === 1 ? c.roofs[0] : c.walls[0]))
}

/** 층수 → 구간(범례 층수 띠와 같은 1~2 · 3~4 · 5~9 · 10~19 · 20+). jitter 는 −1·0·+1(지도 압출 realBuildingExpr처럼 이웃이 같은 색으로 붙지 않게) */
export function floorClass(floors: number, jitter: number): number {
  const f = Math.max(1, floors) + jitter
  return f <= 2 ? 0 : f <= 4 ? 1 : f <= 9 ? 2 : f <= 19 ? 3 : 4
}

/** 동 번호 해시(0~1). 모형 색 돌리기·창 불빛에 쓴다 */
export function hash01(i: number, salt = 0): number {
  let h = Math.imul(i ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(salt + 1, 0xc2b2ae35)
  h ^= h >>> 15
  h = Math.imul(h, 0x2c1b3c6d)
  h ^= h >>> 12
  return (h >>> 0) / 4294967296
}

export interface ToonPaint {
  theme: Theme
  base: BaseMode
  grid: GridCell[]
  /** 동 → 격자 칸 번호(-1 칸 밖) */
  cellOf: Int32Array
  floors: Uint8Array
  selectedDong: string | null
  /** 동별 기둥: 기둥이 주인공이라 건물은 중립(지도 압출 dimB와 같다) */
  dongBars: boolean
  /** 재배치 후보: 바탕 램프를 회색 단계로(지도 압출 greyMode와 같다) */
  candidates: boolean
  /** 시설·배치추천 말뚝이 서면 히트맵을 중립 쪽으로 55% 누른다 */
  pointsOn: boolean
}

const BYTES_PER_BUILDING = 8

function put(out: Uint8Array, o: number, hex: string) {
  out[o] = parseInt(hex.slice(1, 3), 16)
  out[o + 1] = parseInt(hex.slice(3, 5), 16)
  out[o + 2] = parseInt(hex.slice(5, 7), 16)
  out[o + 3] = 255
}

/** 동마다 벽·지붕 색. out 을 주면 거기 쓴다(길이 count×8) */
export function toonColors(p: ToonPaint, out?: Uint8Array): Uint8Array {
  const n = p.cellOf.length
  const buf = out ?? new Uint8Array(n * BYTES_PER_BUILDING)
  const neutral = TOON_NEUTRAL[p.theme]
  const cache = new Map<string, string>()
  const lift = (c: string) => cache.get(c) ?? cache.set(c, mixHex(c, p.theme === "dark" ? "#000000" : "#ffffff", 0.12)).get(c)!
  if (p.base === "none") {
    // 실사 대신 모형 팔레트. 후보 표시 중(동 선택 없음)은 지도 압출처럼 중립
    const plain = p.candidates && !p.selectedDong
    for (let i = 0; i < n; i++) {
      const o = i * BYTES_PER_BUILDING
      if (plain) {
        put(buf, o, neutral.wall)
        put(buf, o + 4, neutral.roof)
        continue
      }
      const cls = TOON_REAL[p.theme][floorClass(p.floors[i] || 2, Math.floor(hash01(i, 7) * 3) - 1)]
      put(buf, o, cls.walls[Math.floor(hash01(i, 1) * cls.walls.length)])
      put(buf, o + 4, cls.roofs[Math.floor(hash01(i, 2) * cls.roofs.length)])
    }
    return buf
  }
  const def = BASE_DEF[p.base]
  const grey = p.candidates && !p.selectedDong
  const pal = grey ? greyRamp(p.theme, def.pal.length) : p.pointsOn ? def.pal.map((c) => mixHex(c, neutral.wall, 0.55)) : def.pal
  for (let i = 0; i < n; i++) {
    const o = i * BYTES_PER_BUILDING
    const ci = p.cellOf[i]
    const cell = ci >= 0 ? p.grid[ci] : null
    const dim = p.selectedDong ? !cell || (cell[7] || "") !== p.selectedDong : p.dongBars
    const v = cell ? cell[def.idx] : 0
    if (dim || v <= 0) {
      put(buf, o, neutral.wall)
      put(buf, o + 4, neutral.roof)
      continue
    }
    const c = colorOf(v, def.stops, pal)
    put(buf, o, c)
    put(buf, o + 4, lift(c))
  }
  return buf
}
