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
export const segType = (s: SegLike) => (s.src === "weak" ? s.type : "결빙")
// 소관(3라운드, 보고받는 사람 관점): 구가 직접 자재를 둘 수 있는 구간인지. 행안부 적설취약구간 47은 전부 광진구 관리청, 상습결빙구간 9는 서울시(시설공단·동부도로사업소) 6 + 서울시(광진구) 3
export const segOwner = (s: SegLike): "구" | "시" => (s.src === "weak" ? "구" : /\(광진구\)/.test(s.agency) ? "구" : "시")

export interface GapSummary {
  total: number // 취약구간 전체(적설취약 47 + 결빙 9)
  noHeat: number // 60m 안 열선 없음
  none: number // 열선도 자재도 없음
  gu: { total: number; noHeat: number; none: number; noneNames: string[] } // 구 관리 구간
  si: { total: number; noHeat: number; none: number } // 서울시 관리 구간(간선·자동차전용도로)
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
  const gu = segs.filter((s) => segOwner(s) === "구")
  const si = segs.filter((s) => segOwner(s) === "시")
  return {
    total: segs.length,
    noHeat: noHeat.length,
    none: segs.filter((s) => s.gap).length,
    gu: { total: gu.length, noHeat: gu.filter((s) => !s.heatCovered).length, none: gu.filter((s) => s.gap).length, noneNames: gu.filter((s) => s.gap).map(segName) },
    si: { total: si.length, noHeat: si.filter((s) => !s.heatCovered).length, none: si.filter((s) => s.gap).length },
    weakNoHeat: data.gaps.weakNoHeat,
    weakNone: data.gaps.weakNone,
    iceNoHeat: data.gaps.iceTotal - data.gaps.iceHeat,
    iceNone: data.gaps.iceNone,
    noHeatDongs: data.gaps.noHeatDongs,
    schoolsNoHeat: data.gaps.schoolsNoHeat,
    slopeNoHeat: data.gaps.slopeNoHeat,
    slopeKm: data.gaps.slopeKm,
    // 공백(자재도 없음) 먼저, 그 안에서 구 소관 먼저, 자재 적은 순, 열선이 먼 순
    noHeatList: noHeat.sort((a, b) => Number(b.gap) - Number(a.gap) || Number(segOwner(a) === "시") - Number(segOwner(b) === "시") || a.materialsNear - b.materialsNear || (b.near.heat ?? 0) - (a.near.heat ?? 0)),
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
      kicker: "공백 · 구 관리",
      title: `구 관리 취약구간 ${g.gu.total}곳 중 ${g.gu.noHeat}곳에 ${data.gaps.heatNearM}m 안 열선이 없습니다.`,
      body: `${data.gaps.materialNearM}m 안에 비치 자재도 없는 곳은 ${g.gu.none}곳${g.gu.noneNames.length ? `(${g.gu.noneNames.join("·")})` : ""}입니다.`,
      n: String(g.gu.noHeat),
      unit: `/${g.gu.total}곳`,
      kind: "gap",
      focus: { layer: "weak" },
    },
    {
      id: "f-ice",
      kicker: "공백 · 시 관리",
      title: `서울시 관리 결빙구간 ${g.si.total}곳 중 ${g.si.none}곳은 열선도 비치 자재도 없습니다.`,
      body: `${[...new Set(allSegments(data).filter((s) => s.src === "ice" && segOwner(s) === "시" && s.gap).map((s) => (s as IceSeg).road))].join("·")}의 간선·자동차전용도로입니다. 관리청은 ${[...new Set(data.ice.filter((s) => !/\(광진구\)/.test(s.agency) && s.gap).map((s) => s.agency.replace(/^서울특별시\((.*)\)$/, "$1")))].join("·")}입니다.`,
      n: String(g.si.none),
      unit: `/${g.si.total}곳`,
      kind: "gap",
      focus: { layer: "ice" },
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
      // 3라운드 정정: "2025년 설치 23구간"과 "구 파일에 없는 구간"은 다른 수. 조인 안 된 행이 정답(냉독이 14·23 불일치를 잡았다)
      title: `서울시 집계(2026.5) 열선 ${t.heatSeg}구간 중 ${t.heatSeg - data.meta.heatJoin.guMatched}구간은 구 공개 파일(2025.1)에 없습니다.`,
      body: `2025년 설치 ${t.heat2025}구간이 서울시 집계에 새로 있습니다. 지도는 서울시 집계를 정본으로 쓰고 노선명·차로수는 구 파일과 맞은 ${data.meta.heatJoin.guMatched}구간에서 보충했습니다.`,
      n: String(t.heatSeg - data.meta.heatJoin.guMatched),
      unit: `/${t.heatSeg}구간`,
      kind: "limit",
    },
  ]
  return out
}

// ─── 눈 오기 전 점검 후보(보고받는 사람 관점, 3라운드). 데이터가 가리키는 후보를 소관과 함께 늘어놓는다. 판단·우선순위는 담당 부서 몫이라 문장은 사실만 ───
export interface CheckItem {
  id: string
  owner: "구" | "시" | "동"
  title: string
  body: string
  n: number
  focus?: Finding["focus"]
}
export function buildChecklist(data: SnowMapData): CheckItem[] {
  const g = gapSummary(data)
  const noHeatWeak = data.weak.filter((w) => !w.heatCovered)
  const onSlope = noHeatWeak.filter((w) => data.slopes.some((s) => s.weakNear.includes(w.i)))
  const siNone = allSegments(data).filter((s) => s.src === "ice" && segOwner(s) === "시" && s.gap)
  const agencies = [...new Set(siNone.map((s) => (s as IceSeg & { src: "ice" }).agency.replace(/^서울특별시\((.*)\)$/, "$1")))]
  const schoolsGap = data.schools.filter((s) => !s.heatNear.length)
  const schoolsWeak = schoolsGap.filter((s) => s.weakNear.length)
  const out: CheckItem[] = []
  if (g.gu.none)
    out.push({
      id: "c-material",
      owner: "구",
      title: `${g.gu.noneNames.join("·")}: ${data.gaps.materialNearM}m 안 비치 자재 0`,
      body: `구 관리 취약구간 중 열선도 자재도 없는 유일한 구간입니다. 가장 가까운 제설함 ${fmt(Math.min(...data.weak.filter((w) => w.gap).map((w) => w.near.salt ?? 9999)))}m.`,
      n: g.gu.none,
      focus: { layer: "weak" },
    })
  if (onSlope.length)
    out.push({
      id: "c-slope",
      owner: "구",
      title: `열선 없는 구 관리 구간 ${g.gu.noHeat}곳 중 ${onSlope.length}곳은 지형 추정 급경사와 겹칩니다`,
      body: `${onSlope.map((w) => w.name.replace(/\(.*\)$/, "")).join("·")}. 열선 신설 검토 시 우선 확인 대상입니다(추정치).`,
      n: onSlope.length,
      focus: { layer: "weak" },
    })
  if (siNone.length)
    out.push({
      id: "c-seoul",
      owner: "시",
      title: `서울시 관리 결빙구간 ${siNone.length}곳은 구 자재로 대응하지 않습니다`,
      body: `관리청 ${agencies.join("·")}. 제설 계획·장비 살포 현황은 구 데이터에 없어 관리청 확인이 필요합니다.`,
      n: siNone.length,
      focus: { layer: "ice" },
    })
  out.push({
    id: "c-dong",
    owner: "동",
    title: `열선 없는 동 ${g.noHeatDongs.length}곳은 비치 자재로만 첫 결빙에 대응합니다`,
    body: `${g.noHeatDongs.join("·")}. 이 동들의 비치 자재 ${data.dongs.filter((d) => g.noHeatDongs.includes(d.d)).reduce((s, d) => s + d.salt + d.cacl + d.sand, 0)}개소, 적설취약구간 ${data.dongs.filter((d) => g.noHeatDongs.includes(d.d)).reduce((s, d) => s + d.weak, 0)}곳.`,
    n: g.noHeatDongs.length,
    focus: { dong: g.noHeatDongs[0] },
  })
  if (schoolsGap.length)
    out.push({
      id: "c-school",
      owner: "동",
      title: `초등학교 ${schoolsGap.length}교는 ${data.gaps.schoolNearM}m 안에 열선이 없습니다`,
      body: schoolsWeak.length ? `그중 ${schoolsWeak.map((s) => s.name.replace(/^서울/, "")).join("·")}은 ${data.gaps.schoolNearM}m 안에 행안부 취약구간도 있습니다.` : "취약구간과 겹치는 학교는 없습니다.",
      n: schoolsGap.length,
      focus: { layer: "school" },
    })
  return out
}
