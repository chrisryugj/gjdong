import type { OntoGraph } from "./types"

// /snow 온톨로지 스키마. graph.json(scripts/snow-data.mjs buildGraph)의 클래스·관계에 정의·도메인·레인지를 붙이고 규약을 검증한다.
// /dumping 스키마와 같은 형식이지만 도메인이 다르다: 제설 대응자원(Lever)이 취약요인(Concept)을 대상으로 하고 담당 구역(Zone)·취약구간(Entity)을 덮으며,
// 서울시 대응 단계(Stage)가 적설 예보에 따라 자원을 동원(mobilizes)한다. 법령(Policy)은 의무 주체와 자원의 근거를 댄다.
// 2라운드(2026-09-20): 운영 단위 Zone(동주민센터 담당 구역. 구간표 확보 전엔 행정동 경계 대용, props.proxy="행정동 경계 대용")과
// 취약구간 실체 Entity(행안부 적설취약구간 47·상습결빙구간 9)를 추가. 커버리지는 Lever -covers-> Zone|Entity

export const SPACES = ["subject", "resource", "evidence", "concept", "claim", "outcome", "lever", "policy", "area"] as const
export type Space = (typeof SPACES)[number]

export const SPACE_KO: Record<Space, string> = {
  subject: "주체",
  resource: "데이터",
  evidence: "관측",
  concept: "취약요인",
  claim: "판단",
  outcome: "목표지표",
  lever: "대응자원",
  policy: "법령·단계",
  area: "행정동·구역",
}

export interface ClassDef {
  type: string
  space: Space
  en: string
  def: string
}

export const CLASSES: ClassDef[] = [
  { type: "Org", space: "subject", en: "Organization", def: "대책을 총괄하거나 의무를 지는 기관·주체(구청·서울시·건축물관리자·자율방재단)" },
  { type: "Team", space: "subject", en: "Team", def: "기관 안의 담당 부서(도로과·동주민센터)" },
  { type: "Dataset", space: "resource", en: "Dataset", def: "원자료 한 벌. 행 수·출처·기준일을 갖는다" },
  { type: "Evidence", space: "evidence", en: "Evidence", def: "데이터셋에서 계산한 관측 사실. 신뢰도(confidence)와 출처·기준일·산출 방법을 갖는다" },
  { type: "Concept", space: "concept", en: "Vulnerability factor", def: "결빙·적설 피해가 커지는 조건(급경사·통학로·이면도로·야간 결빙 등). 자원이 대상으로 하는 조건" },
  { type: "Claim", space: "claim", en: "Claim", def: "관측이 뒷받침하는 판단. 들어오는 supports 엣지가 없으면 스키마 위반" },
  { type: "KPI", space: "outcome", en: "Indicator", def: "대응이 낮추려는 결과 지표. measurable 속성이 '데이터 없음'이면 지금은 측정할 수 없다" },
  { type: "Lever", space: "lever", en: "Response resource", def: "대응자원 유형(열선·제설함·염화칼슘함·모래주머니·살포기·장비·인력·민관협력·건축물관리자 의무)" },
  { type: "Policy", space: "policy", en: "Policy", def: "법령·조례·서울시 기준·대책기간" },
  { type: "Stage", space: "policy", en: "Response stage", def: "서울시 강설 대응 단계(보강·1·2·3). 적설 예보 임계값(threshold_cm)을 갖는다" },
  { type: "Area", space: "area", en: "Administrative dong", def: "광진구 행정동 15개. 자원별 개소 수를 속성으로 갖는다" },
  { type: "Zone", space: "area", en: "Snow-clearing zone", def: "동주민센터가 맡는 제설 담당 구역(운영 단위). 담당 구간표 확보 전에는 행정동 경계를 대용하고 proxy 속성에 그렇게 적는다" },
  { type: "Entity", space: "concept", en: "Vulnerable segment", def: "취약요인의 실체 구간. 행안부 적설취약구간(고갯길·급경사)·상습결빙구간. 좌표와 근접 자원 거리를 갖는다" },
]

export type RelKind = "structure" | "evidence" | "targeting" | "coverage" | "governance"

export interface RelDef {
  rel: string
  en: string
  kind: RelKind
  def: string
  domain: string[]
  range: string[]
}

export const RELATIONS: RelDef[] = [
  { rel: "manages", en: "manages", kind: "structure", def: "기관이 데이터셋을 관리한다", domain: ["Org"], range: ["Dataset"] },
  { rel: "owns", en: "owns", kind: "structure", def: "부서가 데이터셋(시설 장부)을 보유한다", domain: ["Team"], range: ["Dataset"] },
  { rel: "operates", en: "operates", kind: "structure", def: "주체가 대응자원을 운영·집행한다", domain: ["Org", "Team"], range: ["Lever"] },
  { rel: "contains", en: "contains", kind: "evidence", def: "데이터셋 안에서 이 관측이 계산됐다(출처 계보)", domain: ["Dataset"], range: ["Evidence"] },
  { rel: "derived_from", en: "derived from", kind: "evidence", def: "여러 데이터셋을 결합해 이 관측을 얻었다(출처 계보)", domain: ["Dataset"], range: ["Evidence"] },
  { rel: "supports", en: "supports", kind: "evidence", def: "관측이 판단을 뒷받침한다", domain: ["Evidence"], range: ["Claim"] },
  { rel: "describes", en: "describes", kind: "evidence", def: "관측이 자원·요인·지표의 실측 상태를 서술한다", domain: ["Evidence"], range: ["Lever", "Concept", "KPI"] },
  { rel: "targets", en: "targets", kind: "targeting", def: "대응자원이 대상으로 하는 취약요인. 효과를 단언하지 않는다", domain: ["Lever"], range: ["Concept"] },
  { rel: "lowers", en: "aims to lower", kind: "targeting", def: "대응자원이 낮추려는 지표. status(상시 가동·비치·단계 동원·법정 의무)는 엣지 속성", domain: ["Lever"], range: ["KPI"] },
  { rel: "raises", en: "raises risk of", kind: "targeting", def: "취약요인이 지표를 악화시키는 방향. 인과 크기는 데이터가 없어 싣지 않는다", domain: ["Concept"], range: ["KPI"] },
  { rel: "operationalizes", en: "operationalizes", kind: "targeting", def: "측정할 수 있는 지표가 측정할 수 없는 상위 지표를 대신한다", domain: ["KPI"], range: ["KPI"] },
  { rel: "covers", en: "covers", kind: "coverage", def: "대응자원이 담당 구역에 몇 개소 있는가(count·length_m·bags), 또는 취약구간의 기준 거리 안에 있는가(within_m)", domain: ["Lever"], range: ["Zone", "Entity"] },
  { rel: "assigned", en: "assigned to", kind: "coverage", def: "동주민센터가 담당 구역을 맡는다", domain: ["Team"], range: ["Zone"] },
  { rel: "within", en: "within", kind: "coverage", def: "담당 구역이 행정동 안에, 취약구간이 담당 구역 안에 있다", domain: ["Zone", "Entity"], range: ["Area", "Zone"] },
  { rel: "exemplifies", en: "exemplifies", kind: "targeting", def: "취약구간이 어떤 취약요인의 실체인가(고갯길·급경사 유형은 급경사 요인, 결빙구간은 야간 결빙·간선도로 요인)", domain: ["Entity"], range: ["Concept"] },
  { rel: "mobilizes", en: "mobilizes", kind: "governance", def: "대응 단계가 동원하는 자원. 상위 단계는 하위 단계 자원을 포함한다", domain: ["Stage"], range: ["Lever"] },
  { rel: "escalates_to", en: "escalates to", kind: "governance", def: "적설 예보가 임계값을 넘으면 다음 단계로", domain: ["Stage"], range: ["Stage"] },
  { rel: "defines", en: "defines", kind: "governance", def: "주체·기준이 단계나 기준을 정한다", domain: ["Org", "Policy"], range: ["Policy", "Stage"] },
  { rel: "triggers", en: "triggers", kind: "governance", def: "취약요인(적설 예보)이 기준을 발동시키는 입력이다", domain: ["Concept"], range: ["Policy"] },
  { rel: "delegates", en: "delegates to", kind: "governance", def: "상위 법령이 구체 범위를 조례에 위임한다", domain: ["Policy"], range: ["Policy"] },
  { rel: "obligates", en: "obligates", kind: "governance", def: "법령·조례가 주체에게 의무를 지운다", domain: ["Policy"], range: ["Org", "Team"] },
  { rel: "basis", en: "legal basis of", kind: "governance", def: "법령·조례·대책기간이 자원 운영의 근거다", domain: ["Policy"], range: ["Lever"] },
  { rel: "governs", en: "governs", kind: "governance", def: "판단이 지표·자원의 해석 규칙을 정한다(예: 측정 자료가 없다)", domain: ["Claim"], range: ["KPI", "Lever"] },
]

export interface SchemaIssue {
  level: "error" | "warn"
  code: "UNKNOWN_TYPE" | "SPACE_MISMATCH" | "UNKNOWN_REL" | "DOMAIN" | "RANGE" | "DANGLING" | "CLAIM_UNSUPPORTED" | "ORPHAN" | "PROV_MISSING" | "STATUS_MISSING"
  ref: string
  msg: string
}

const PROV_KEYS = ["source", "asof", "derived_by"] as const

export function validateGraph(graph: OntoGraph): SchemaIssue[] {
  const issues: SchemaIssue[] = []
  const classOf = new Map(CLASSES.map((c) => [c.type, c]))
  const relOf = new Map(RELATIONS.map((r) => [r.rel, r]))
  const nodeOf = new Map(graph.nodes.map((n) => [n.id, n]))
  const degree = new Map<string, number>()
  const supported = new Set<string>()

  for (const n of graph.nodes) {
    const c = classOf.get(n.type)
    if (!c) issues.push({ level: "error", code: "UNKNOWN_TYPE", ref: n.id, msg: `클래스 없음: ${n.type}` })
    else if (c.space !== n.space) issues.push({ level: "error", code: "SPACE_MISMATCH", ref: n.id, msg: `${n.type}의 space는 ${c.space}인데 ${n.space}` })
    if ((n.type === "Dataset" || n.type === "Evidence") && PROV_KEYS.some((k) => !(k in n.props)))
      issues.push({ level: "warn", code: "PROV_MISSING", ref: n.id, msg: "source·asof·derived_by 중 빠진 것이 있다" })
  }
  for (const e of graph.edges) {
    const f = nodeOf.get(e.f)
    const t = nodeOf.get(e.t)
    if (!f || !t) {
      issues.push({ level: "error", code: "DANGLING", ref: `${e.f} -${e.rel}-> ${e.t}`, msg: "없는 노드를 가리킨다" })
      continue
    }
    degree.set(e.f, (degree.get(e.f) ?? 0) + 1)
    degree.set(e.t, (degree.get(e.t) ?? 0) + 1)
    const r = relOf.get(e.rel)
    if (!r) {
      issues.push({ level: "error", code: "UNKNOWN_REL", ref: `${e.f} -${e.rel}-> ${e.t}`, msg: `관계 없음: ${e.rel}` })
      continue
    }
    if (!r.domain.includes(f.type)) issues.push({ level: "error", code: "DOMAIN", ref: `${e.f} -${e.rel}-> ${e.t}`, msg: `${e.rel}의 출발은 ${r.domain.join("·")}인데 ${f.type}` })
    if (!r.range.includes(t.type)) issues.push({ level: "error", code: "RANGE", ref: `${e.f} -${e.rel}-> ${e.t}`, msg: `${e.rel}의 도착은 ${r.range.join("·")}인데 ${t.type}` })
    if (e.rel === "supports") supported.add(e.t)
    if (e.rel === "lowers" && !e.props?.status) issues.push({ level: "error", code: "STATUS_MISSING", ref: `${e.f} -lowers-> ${e.t}`, msg: "lowers 엣지는 status가 있어야 한다" })
  }
  for (const n of graph.nodes) {
    if (n.type === "Claim" && !supported.has(n.id)) issues.push({ level: "error", code: "CLAIM_UNSUPPORTED", ref: n.id, msg: "뒷받침하는 관측이 없다" })
    if (!degree.get(n.id)) issues.push({ level: "warn", code: "ORPHAN", ref: n.id, msg: "연결이 없다" })
  }
  return issues
}

// 그래프에 실제로 쓰인 (출발 type, rel, 도착 type) 조합. 스키마 문서와 테스트가 쓴다
export function observedSignatures(graph: OntoGraph): string[] {
  const nodeOf = new Map(graph.nodes.map((n) => [n.id, n]))
  const out = new Set<string>()
  for (const e of graph.edges) {
    const f = nodeOf.get(e.f)
    const t = nodeOf.get(e.t)
    if (f && t) out.add(`${f.type} -${e.rel}-> ${t.type}`)
  }
  return [...out].sort()
}
