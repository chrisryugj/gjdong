import type { DongRow, ResourceId, SnowMapData } from "./types"

// 화면 수치의 단일 산출처. 패널·툴팁·문서가 전부 여기서 계산한 값을 본다(정적 사본 금지)

export function totals(data: SnowMapData) {
  return {
    heatSeg: data.heat.length,
    heatM: data.heat.reduce((s, h) => s + h.m, 0),
    heatDongs: data.dongs.filter((d) => d.heatSeg > 0).length,
    heatPending: data.heat.filter((h) => /예정/.test(h.note)).length,
    salt: data.salt.length,
    cacl: data.cacl.length,
    sand: data.sand.length,
    sandBags: data.sand.reduce((s, x) => s + x.qty, 0),
    sandSites: data.sand.filter((s) => s.kind === "site").length,
    sites: data.heat.length + data.salt.length + data.cacl.length + data.sand.length,
  }
}

export const fmt = (n: number) => n.toLocaleString("ko-KR")

// 동별 자원 값. 지도 기둥·동별 표가 같은 함수를 쓴다
export function dongValue(d: DongRow, r: ResourceId | "all"): number {
  switch (r) {
    case "heat":
      return d.heatM
    case "salt":
      return d.salt
    case "cacl":
      return d.cacl
    case "sand":
      return d.sand
    default:
      return d.heatSeg + d.salt + d.cacl + d.sand
  }
}

export function dongsSorted(data: SnowMapData, r: ResourceId | "all"): DongRow[] {
  return [...data.dongs].sort((a, b) => dongValue(b, r) - dongValue(a, r))
}

export function seoulRank(data: SnowMapData): { rank: number; of: number; gu: { n: number; m: number } | null; totalN: number; totalM: number; max: number } {
  const i = data.seoul.findIndex((g) => g.gu === "광진구")
  return {
    rank: i + 1,
    of: data.seoul.length,
    gu: i >= 0 ? { n: data.seoul[i].n, m: data.seoul[i].m } : null,
    totalN: data.seoul.reduce((s, g) => s + g.n, 0),
    totalM: data.seoul.reduce((s, g) => s + g.m, 0),
    max: data.seoul[0]?.m ?? 1,
  }
}

// 열선 설치 연도별 구간·연장. 연도 없는 행(2025 예정)은 "예정"으로
export function heatByYear(data: SnowMapData): { year: string; n: number; m: number }[] {
  const acc = new Map<string, { n: number; m: number }>()
  for (const h of data.heat) {
    const k = h.year ? String(h.year) : "예정"
    const a = acc.get(k) ?? { n: 0, m: 0 }
    a.n += 1
    a.m += h.m
    acc.set(k, a)
  }
  return [...acc.entries()].map(([year, v]) => ({ year, ...v })).sort((a, b) => a.year.localeCompare(b.year))
}
