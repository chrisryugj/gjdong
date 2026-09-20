import type { DongRow, IceSeg, ResourceId, SnowMapData, WeakSeg } from "./types"

// 화면 수치의 단일 산출처. 패널·툴팁·시연 캡션·문서가 전부 여기서 계산한 값을 본다(정적 사본 금지)

export function totals(data: SnowMapData) {
  return {
    heatSeg: data.heat.length,
    heatM: data.heat.reduce((s, h) => s + h.m, 0),
    heatPhysM: data.heat.reduce((s, h) => s + (h.physM ?? h.pathM), 0),
    heatDongs: data.dongs.filter((d) => d.heatSeg > 0).length,
    heat2025: data.heat.filter((h) => h.year === 2025).length,
    salt: data.salt.length,
    cacl: data.cacl.length,
    sand: data.sand.length,
    sandBags: data.sand.reduce((s, x) => s + x.qty, 0),
    sandSites: data.sand.filter((s) => s.kind === "site").length,
    materials: data.salt.length + data.cacl.length + data.sand.length,
    weak: data.weak.length,
    ice: data.ice.length,
    schools: data.schools.length,
    slopes: data.slopes.length,
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

// 열선 설치 연도별 구간·연장
export function heatByYear(data: SnowMapData): { year: string; n: number; m: number }[] {
  const acc = new Map<string, { n: number; m: number }>()
  for (const h of data.heat) {
    const k = h.year ? String(h.year) : "미기재"
    const a = acc.get(k) ?? { n: 0, m: 0 }
    a.n += 1
    a.m += h.m
    acc.set(k, a)
  }
  return [...acc.entries()].map(([year, v]) => ({ year, ...v })).sort((a, b) => a.year.localeCompare(b.year))
}

// ─── 공백(첫 화면 주장) ───
export type SegLike = (WeakSeg & { src: "weak" }) | (IceSeg & { src: "ice"; n: number })
export function allSegments(data: SnowMapData): SegLike[] {
  return [...data.weak.map((w) => ({ ...w, src: "weak" as const })), ...data.ice.map((s, i) => ({ ...s, src: "ice" as const, n: i + 1 }))]
}
export const segName = (s: SegLike) => (s.src === "weak" ? s.name : `${s.road} 결빙 ${s.n}`)
export const segKind = (s: SegLike) => (s.src === "weak" ? `적설취약구간 · ${s.type}` : "상습결빙구간")

export interface GapSummary {
  total: number // 취약구간 전체(적설취약 47 + 결빙 9)
  noHeat: number // 60m 안 열선 없음
  none: number // 열선도 자재도 없음
  weakNoHeat: number
  weakNone: number
  iceNoHeat: number
  iceNone: number
  noHeatDongs: string[]
  schoolsNoHeat: number
  slopeNoHeat: number
  slopeKm: number
  noHeatList: SegLike[] // 열선 없는 구간, 공백 먼저·자재 적은 순
}
export function gapSummary(data: SnowMapData): GapSummary {
  const segs = allSegments(data)
  const noHeat = segs.filter((s) => !s.heatCovered)
  return {
    total: segs.length,
    noHeat: noHeat.length,
    none: segs.filter((s) => s.gap).length,
    weakNoHeat: data.gaps.weakNoHeat,
    weakNone: data.gaps.weakNone,
    iceNoHeat: data.gaps.iceTotal - data.gaps.iceHeat,
    iceNone: data.gaps.iceNone,
    noHeatDongs: data.gaps.noHeatDongs,
    schoolsNoHeat: data.gaps.schoolsNoHeat,
    slopeNoHeat: data.gaps.slopeNoHeat,
    slopeKm: data.gaps.slopeKm,
    noHeatList: noHeat.sort((a, b) => Number(b.gap) - Number(a.gap) || a.materialsNear - b.materialsNear || (b.near.heat ?? 0) - (a.near.heat ?? 0)),
  }
}

// 취약구간 가장 많은 동
export function weakTopDong(data: SnowMapData): DongRow {
  return [...data.dongs].sort((a, b) => b.weak - a.weak)[0]
}
export function heatTopDongs(data: SnowMapData, n = 2): DongRow[] {
  return [...data.dongs].sort((a, b) => b.heatSeg - a.heatSeg).slice(0, n)
}

// ─── 발견 카드(자동 파생, 6장 이내). 문장은 합니다체·사실 하나 ───
export interface Finding {
  id: string
  kicker: string
  title: string // 한 문장 사실
  body: string // 한 문장 보충(수치)
  n: string // 큰 숫자
  unit: string
  kind: "gap" | "resource" | "limit"
  focus?: { heat?: number[]; dong?: string; layer?: "weak" | "ice" | "slope" | "school" }
}
export function buildFindings(data: SnowMapData): Finding[] {
  const t = totals(data)
  const g = gapSummary(data)
  const top = heatTopDongs(data)
  const topSeg = top.reduce((s, d) => s + d.heatSeg, 0)
  const wt = weakTopDong(data)
  const out: Finding[] = [
    {
      id: "f-gap",
      kicker: "공백",
      title: `취약구간 ${g.total}곳 중 ${g.noHeat}곳에 ${data.gaps.heatNearM}m 안 열선이 없습니다.`,
      body: `그중 ${g.none}곳은 ${data.gaps.materialNearM}m 안에 비치 자재도 없습니다. 이면도로 ${g.weakNone}곳, 간선·자동차전용도로 결빙구간 ${g.iceNone}곳입니다.`,
      n: String(g.noHeat),
      unit: `/${g.total}곳`,
      kind: "gap",
      focus: { layer: "weak" },
    },
    {
      id: "f-nodong",
      kicker: "공백",
      title: `열선이 한 구간도 없는 동이 ${g.noHeatDongs.length}곳입니다.`,
      body: `${g.noHeatDongs.join("·")}은 비치 자재와 인력으로 첫 결빙에 대응합니다. 이 동들의 적설취약구간은 ${data.dongs.filter((d) => g.noHeatDongs.includes(d.d)).reduce((s, d) => s + d.weak, 0)}곳입니다.`,
      n: String(g.noHeatDongs.length),
      unit: "/15동",
      kind: "gap",
      focus: { dong: g.noHeatDongs[0] },
    },
    {
      id: "f-school",
      kicker: "통학로",
      title: `초등학교 ${t.schools}교 중 ${g.schoolsNoHeat}교는 ${data.gaps.schoolNearM}m 안에 열선이 없습니다.`,
      body: `열선 노선명에 통학로·학교가 적힌 구간은 ${data.heat.filter((h) => /통학로|초/.test(h.route)).length}구간입니다.`,
      n: String(g.schoolsNoHeat),
      unit: `/${t.schools}교`,
      kind: "gap",
      focus: { layer: "school" },
    },
    {
      id: "f-concentration",
      kicker: "자원",
      title: `열선 ${t.heatSeg}구간 중 ${topSeg}구간이 ${top.map((d) => d.d).join("·")}에 있습니다.`,
      body: `적설취약구간이 가장 많은 ${wt.d}(${wt.weak}곳)에는 열선이 ${wt.heatSeg}구간입니다.`,
      n: String(topSeg),
      unit: `/${t.heatSeg}구간`,
      kind: "resource",
      focus: { dong: top[0].d },
    },
    {
      id: "f-slope",
      kicker: "추정",
      title: `지형 고도로 추정한 급경사 이면도로 ${t.slopes}구간 ${g.slopeKm}km 중 ${g.slopeNoHeat}구간에 열선이 없습니다.`,
      body: `행안부 취약구간 ${t.weak}곳 중 ${data.gaps.weakOnSlope}곳이 이 추정 구간과 겹칩니다. 지형 타일 추정치라 실측 경사가 아닙니다.`,
      n: String(g.slopeNoHeat),
      unit: `/${t.slopes}구간`,
      kind: "limit",
      focus: { layer: "slope" },
    },
    {
      id: "f-update",
      kicker: "데이터",
      title: `서울시 집계(2026.5) 열선 ${t.heatSeg}구간 중 ${t.heat2025}구간은 구 공개 파일(2025.1)에 없습니다.`,
      body: `지도는 서울시 집계를 정본으로 쓰고 노선명·차로수는 구 파일 ${data.meta.heatJoin.guMatched}구간에서 보충했습니다.`,
      n: String(t.heat2025),
      unit: "구간",
      kind: "limit",
    },
  ]
  return out
}
