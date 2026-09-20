import type { DongRow, IceSeg, ResourceId, SnowMapData, WeakSeg } from "./types"
import { COST, heatCost, heatCostText, man } from "./costs"

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

// 우선순위(4라운드 후속, 의사결정자 관점: "13곳 중 어디부터"). 점수 = 자재도 없음 3 + 경사 추정 최대 경사%/10 + 150m 안 초등학교 1.5교당 + 행안부 유형(급경사 1 · 고갯길 0.5) + 구 소관 0.5.
// 전부 이 화면 데이터에서 나온 근거이고 가중치는 가정이다(데이터·방법). 근거 문구를 표·칩·결재 한 장에 같이 적는다
export interface Priority {
  score: number
  reasons: string[]
}
export function segPriority(s: SegLike, data: SnowMapData): Priority {
  const reasons: string[] = []
  let score = 0
  if (s.gap) {
    score += 3
    reasons.push(`${data.gaps.materialNearM}m 안 자재 0`)
  }
  if (s.src === "weak") {
    const grades = data.slopes.filter((sl) => sl.weakNear.includes(s.i)).map((sl) => sl.grade)
    if (grades.length) {
      const g = Math.max(...grades)
      score += g / 10
      reasons.push(`경사 추정 ${g}%`)
    }
    const schools = data.schools.filter((sc) => sc.weakNear.includes(s.i)).length
    if (schools) {
      score += schools * 1.5
      reasons.push(`초등학교 ${schools}교`)
    }
    if (s.type === "급경사") {
      score += 1
      reasons.push("급경사 유형")
    } else if (s.type === "고갯길") {
      score += 0.5
      reasons.push("고갯길 유형")
    }
  } else reasons.push("간선 결빙구간")
  if (segOwner(s) === "구") score += 0.5
  else reasons.push("시 관리")
  return { score: Math.round(score * 10) / 10, reasons }
}
export const priorityText = (p: Priority) => p.reasons.join(" · ")

// 열선 예산 역산(의사결정자 관점 wow): 예산(원)을 넣으면 구 관리 열선 없는 취약구간을 우선순위 순으로 신설해 몇 곳이 해소되는지. 단가·차로 가정은 costs.ts
export interface BudgetPlan {
  budget: number
  planned: WeakSeg[]
  meters: number
  cost: number
  remaining: number // 남는 열선 없는 구간 수
  total: number
  next: { seg: WeakSeg; cost: number } | null // 다음 한 곳을 더 하려면
}
export function planHeatBudget(data: SnowMapData, budget: number): BudgetPlan {
  const cands = data.weak.filter((w) => !w.heatCovered).map((w) => ({ w, p: segPriority({ ...w, src: "weak" as const }, data).score, cost: heatCost(w.pathM).high })).sort((a, b) => b.p - a.p)
  const planned: WeakSeg[] = []
  let cost = 0
  let meters = 0
  let next: BudgetPlan["next"] = null
  // 우선순위 순으로 쌓다가 처음 안 들어가는 구간에서 멈춘다(건너뛰어 싼 구간을 먼저 넣으면 "상위 N곳"이 거짓이 된다. 냉독 4차)
  for (const c of cands) {
    if (cost + c.cost <= budget) {
      planned.push(c.w)
      cost += c.cost
      meters += c.w.pathM
    } else {
      next = { seg: c.w, cost: c.cost }
      break
    }
  }
  return { budget, planned, meters: Math.round(meters), cost, remaining: cands.length - planned.length, total: cands.length, next }
}

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
    // 우선순위 점수 순(공백·경사·학교·유형·소관). 같으면 자재 적은 순, 열선이 먼 순
    noHeatList: noHeat.sort((a, b) => segPriority(b, data).score - segPriority(a, data).score || a.materialsNear - b.materialsNear || (b.near.heat ?? 0) - (a.near.heat ?? 0)),
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
  focus?: { heat?: number[]; dong?: string; layer?: "weak" | "ice" | "slope" | "school"; segIds?: number[]; point?: [number, number] } // segIds=적설취약구간 번호(그 구간들만 조망, 하나면 확대+고리), point=[lat,lng] 한 점(학교)
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
      // 분모는 행안부 적설취약구간 47(근거 그래프 판단과 같은 수). 구가 관리하는 결빙구간 3곳은 열선이 있어 13곳은 전부 적설취약구간이다(냉독: 50·47 두 분모가 독자를 세웠다)
      title: `적설취약구간 ${t.weak}곳 중 ${g.weakNoHeat}곳에 ${data.gaps.heatNearM}m 안 열선이 없습니다.`,
      body: `${data.gaps.materialNearM}m 안에 비치 자재도 없는 곳은 ${g.gu.none}곳${g.gu.noneNames.length ? `(${g.gu.noneNames.join("·")})` : ""}입니다. 구가 관리하는 결빙구간 ${g.gu.total - t.weak}곳은 열선이 있습니다.`,
      n: String(g.weakNoHeat),
      unit: `/${t.weak}곳`,
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
      body: `구 파일 ${data.meta.heatJoin.guRows}행 중 ${data.meta.heatJoin.guMatched}행이 서울시 집계와 맞습니다(${t.heatSeg} 빼기 ${data.meta.heatJoin.guMatched}). 2025년 설치 ${t.heat2025}구간이 서울시 집계에 새로 있습니다. 지도는 서울시 집계를 정본으로 씁니다.`,
      n: String(t.heatSeg - data.meta.heatJoin.guMatched),
      unit: `/${t.heatSeg}구간`,
      kind: "limit",
    },
  ]
  return out
}

// ─── 눈 오기 전 점검 후보(보고받는 사람 관점, 3라운드 → 4라운드 결재 문서화). 데이터가 가리키는 후보를 행동 동사·부서·기한·규모와 함께 늘어놓는다.
// 부서·기한·규모는 데이터에 있는 것만: 부서는 그래프 Team 노드의 역할(적설취약구간·제설함·열선 = 도로과 도로관리팀, 염화칼슘함·모래주머니·동 단위 = 동주민센터, 시 관리 = 관리청명), 학교 소관은 데이터가 없어 "내부 확인".
// 기한은 대책기간 시작(ops.period.from)의 달 기준 "대책기간 전". 비용은 단가 데이터가 없어 쓰지 않는다(데이터·방법 "못 구한 데이터"). 조치 여부와 순서는 담당 부서가 정한다 ───
export interface CheckItem {
  id: string
  owner: "구" | "시" | "동" | "학교"
  action: "비치" | "검토" | "확인 요청" | "점검" // 행동 동사 하나. title이 이 말로 끝난다
  dept: string // 담당 부서(데이터에 있는 것만. 없으면 "내부 확인")
  due: string // 기한
  scale: string // 규모(수량)
  done: string // 완료 기준(이 화면의 판정이 바뀌는 조건, 또는 회신·확정)
  cost: string // 개략 비용(lib/snow/costs 출처 단가. 없으면 "미산정"과 이유)
  request: string // 결정 요청 한 줄(결재가 필요한 것과 부서 지시로 끝나는 것을 가른다. 냉독 4차)
  short: string // 시연 캡션·칩용 짧은 이름
  title: string // 동사로 끝나는 제목
  body: string // 근거 한 줄(사실만)
  n: number
  focus?: Finding["focus"]
}
export const DEPT = { road: "도로과 도로관리팀", dong: "동주민센터", internal: "내부 확인" } as const
export function buildChecklist(data: SnowMapData): CheckItem[] {
  const g = gapSummary(data)
  const noHeatWeak = data.weak.filter((w) => !w.heatCovered)
  const onSlope = noHeatWeak.filter((w) => data.slopes.some((s) => s.weakNear.includes(w.i)))
  const siNone = allSegments(data).filter((s) => s.src === "ice" && segOwner(s) === "시" && s.gap) as (IceSeg & { src: "ice"; n: number })[]
  const agencyOf = (s: IceSeg) => s.agency.replace(/^서울특별시\((.*)\)$/, "$1")
  const agencyCounts = [...siNone.reduce((m, s) => m.set(agencyOf(s), (m.get(agencyOf(s)) ?? 0) + 1), new Map<string, number>()).entries()]
  const schoolsGap = data.schools.filter((s) => !s.heatNear.length)
  const schoolsWeak = schoolsGap.filter((s) => s.weakNear.length)
  const due = `대책기간 전(${Number(data.ops.period.from.slice(5, 7))}월 중순)`
  const noHeatDongRows = data.dongs.filter((d) => g.noHeatDongs.includes(d.d))
  const out: CheckItem[] = []
  if (g.gu.none)
    out.push({
      id: "c-material",
      owner: "구",
      action: "비치",
      dept: DEPT.road,
      due,
      scale: `구간 ${g.gu.none}곳`,
      done: `${data.gaps.materialNearM}m 안 비치 자재 1개소 이상(재계산 시 구 관리 공백 0)`,
      cost: `제설함 1개소 약 ${man(COST.saltBoxWon)}(소매가) · 충전은 구 비축 제설제`,
      request: "부서 지시로 충분(예산 결정 불필요)",
      short: `${g.gu.noneNames.join("·")} 자재 비치`,
      title: `${g.gu.noneNames.join("·")}에 제설 자재 비치`,
      body: `구 관리 취약구간 중 열선도 ${data.gaps.materialNearM}m 안 자재도 없는 유일한 구간입니다. 가장 가까운 제설함은 ${fmt(Math.min(...data.weak.filter((w) => w.gap).map((w) => w.near.salt ?? 9999)))}m로 기준 ${data.gaps.materialNearM}m를 넘습니다. ${data.gaps.materialNearM}m는 이 화면의 가정입니다.`,
      n: g.gu.none,
      focus: { layer: "weak", segIds: data.weak.filter((w) => w.gap).map((w) => w.i) },
    })
  if (onSlope.length)
    out.push({
      id: "c-slope",
      owner: "구",
      action: "검토",
      dept: DEPT.road,
      due,
      scale: `구간 ${onSlope.length}곳 · ${fmt(Math.round(onSlope.reduce((s, w) => s + w.pathM, 0)))}m`,
      done: "구간별 열선 신설 여부 결정(예산 반영 여부 포함)",
      cost: `전부 신설 시 ${heatCostText(Math.round(onSlope.reduce((s, w) => s + w.pathM, 0)))}(단가 출처 같음)`,
      request: `열선 신설 검토 착수 여부 결정(예산 반영 시 우선순위 1위 ${onSlope.map((w) => ({ w, p: segPriority({ ...w, src: "weak" as const }, data).score })).sort((a, b) => b.p - a.p)[0]?.w.name ?? ""}부터)`,
      short: `경사 겹침 ${onSlope.length}곳 열선 검토`,
      title: `급경사 추정과 겹치는 열선 없는 취약구간 ${onSlope.length}곳의 열선 신설 검토`,
      body: `열선 없는 적설취약구간 ${g.weakNoHeat}곳 중 ${(() => {
        const cnt = new Map<string, number>()
        for (const w of onSlope) {
          const k = w.name.replace(/\(.*\)$/, "").trim()
          cnt.set(k, (cnt.get(k) ?? 0) + 1)
        }
        return [...cnt.entries()].map(([k, n]) => (n > 1 ? `${k} ${n}구간` : k)).join("·")
      })()}. 경사는 지형 타일 추정치입니다.`,
      n: onSlope.length,
      focus: { layer: "weak", segIds: onSlope.map((w) => w.i) },
    })
  if (siNone.length)
    out.push({
      id: "c-seoul",
      owner: "시",
      action: "확인 요청",
      dept: agencyCounts.map(([a]) => a).join("·"),
      due,
      scale: `구간 ${siNone.length}곳(${agencyCounts.map(([a, n]) => `${a} ${n}`).join(" · ")})`,
      done: "관리청 제설 계획·살포 구간 확인 완료(구 상황실 공유)",
      cost: "구 지출 없음(관리청 소관)",
      request: "관리청 공문 발송 지시",
      short: `시 관리 결빙 ${siNone.length}곳 관리청 확인 요청`,
      title: `서울시 관리 결빙구간 ${siNone.length}곳의 제설 계획을 관리청에 확인 요청`,
      body: `열선도 자재도 없는 상습결빙구간이지만 구 자재로 대응하는 구간이 아닙니다. 관리청의 제설 계획·장비 살포 현황은 구 데이터에 없습니다.`,
      n: siNone.length,
      focus: { layer: "ice" },
    })
  out.push({
    id: "c-dong",
    owner: "동",
    action: "점검",
    dept: DEPT.dong,
    due,
    scale: `동 ${g.noHeatDongs.length}곳 · 자재 ${fmt(noHeatDongRows.reduce((s, d) => s + d.salt + d.cacl + d.sand, 0))}개소`,
    done: "동별 자재 점검 결과(수량·상태)",
    cost: "추가 구입 없이 점검(보충분은 점검 뒤 산정)",
    request: "동주민센터 점검 지시",
    short: `열선 없는 동 ${g.noHeatDongs.length}곳 자재 점검`,
    title: `열선 없는 동 ${g.noHeatDongs.length}곳의 비치 자재 점검`,
    body: `${g.noHeatDongs.join("·")}은 열선 없이 비치 자재로 첫 결빙에 대응합니다. 이 동들의 적설취약구간은 ${noHeatDongRows.reduce((s, d) => s + d.weak, 0)}곳입니다.`,
    n: g.noHeatDongs.length,
    focus: { dong: g.noHeatDongs[0] },
  })
  if (schoolsGap.length)
    out.push({
      id: "c-school",
      owner: "학교",
      action: "점검",
      dept: DEPT.internal,
      due,
      scale: `학교 ${schoolsGap.length}교`,
      done: "통학로 제설 소관 확정",
      cost: "미산정(소관 확정 뒤)",
      request: "소관 확인 지시(교육지원청 협의)",
      short: `열선 없는 초등학교 ${schoolsGap.length}교 통학로 점검`,
      title: `${data.gaps.schoolNearM}m 안 열선 없는 초등학교 ${schoolsGap.length}교 통학로 점검`,
      body: schoolsWeak.length ? `그중 ${schoolsWeak.map((s) => s.name.replace(/^서울/, "")).join("·")}은 ${data.gaps.schoolNearM}m 안에 행안부 취약구간도 있습니다. 통학로 제설 소관은 데이터에 없습니다.` : "취약구간과 겹치는 학교는 없습니다. 통학로 제설 소관은 데이터에 없습니다.",
      n: schoolsGap.length,
      focus: { layer: "school", point: schoolsWeak[0] ? [schoolsWeak[0].lat, schoolsWeak[0].lng] : undefined },
    })
  return out
}
