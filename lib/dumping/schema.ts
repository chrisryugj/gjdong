import type { OntoGraph } from "./types"
import { REL_KO, TYPE_KO } from "./labels"

// 온톨로지 스키마 — graph.json(OpenCrab 문법 프로퍼티 그래프)의 클래스·관계에 정의·도메인·레인지를 붙이고
// 그래프가 그 규약을 지키는지 검증한다. 한글 표시명은 labels.ts가 정본이라 여기서는 정의와 제약만 둔다.
// 분석 SSOT(ontology.db)는 재현 해시로 잠겨 있어, 스키마는 "이미 있는 그래프가 무엇을 뜻하는지"를 명문화하는 층이다.

export const SPACES = ["subject", "resource", "concept", "claim", "evidence", "lever", "policy", "outcome"] as const
export type Space = (typeof SPACES)[number]

export interface ClassDef {
  type: string // 노드 type (Org·Dataset·…)
  space: Space // 상위 분류 — 그래프 색·범례 단위
  en: string
  def: string
}

export const CLASSES: ClassDef[] = [
  { type: "Org", space: "subject", en: "Organization", def: "데이터를 관리하거나 개입을 집행하는 기관" },
  { type: "Team", space: "subject", en: "Team", def: "기관 안의 담당 부서·현장 조직" },
  { type: "Dataset", space: "resource", en: "Dataset", def: "원자료 한 벌. 행 수와 기간을 갖고, 증거의 출처가 된다" },
  { type: "Evidence", space: "evidence", en: "Evidence", def: "데이터셋에서 계산해 낸 관측 사실. 신뢰도(confidence)를 갖고, 철회되면 retracted 사유와 confidence 0을 함께 갖는다" },
  { type: "Class", space: "concept", en: "Analysis unit", def: "분석 단위(100m 격자)의 정의" },
  { type: "Concept", space: "concept", en: "Factor", def: "발생과 연관될 수 있는 요인·개념. 단위(unit)를 갖는다" },
  { type: "Entity", space: "concept", en: "Entity", def: "요인의 구체적 실체(다가구주택·관리 공동주택)" },
  { type: "Topic", space: "concept", en: "Theory", def: "해석에 끌어온 이론(재발 자기강화)" },
  { type: "Claim", space: "claim", en: "Claim", def: "증거가 뒷받침하는 주장. 들어오는 supports 엣지가 하나도 없으면 스키마 위반" },
  { type: "Covariate", space: "claim", en: "Covariate", def: "회귀·상관에 투입한 변수와 계수의 기록. 격자 회귀 β는 coefficient, 행정동 상관은 rho" },
  { type: "KPI", space: "outcome", en: "Indicator", def: "결과 지표. 요인이 예측하고 개입이 겨냥하는 대상이자 성과 측정 기준" },
  { type: "Risk", space: "outcome", en: "Risk", def: "격자 단위 위험도" },
  { type: "Lever", space: "lever", en: "Intervention", def: "보유하거나 제안된 개입수단. 효과 판정은 노드가 아니라 lowers/stabilizes 엣지의 status에 둔다" },
  { type: "Policy", space: "policy", en: "Policy / Procedure", def: "법령·조례·운영 원칙(개입 사전등록 등)" },
]

export type RelKind = "structure" | "evidence" | "association" | "intervention" | "governance"

export interface RelDef {
  rel: string
  en: string
  kind: RelKind
  def: string
  domain: string[] // 허용 출발 type
  range: string[] // 허용 도착 type
}

const FACTOR = ["Concept", "Entity", "Topic", "Class"]

export const RELATIONS: RelDef[] = [
  // 구조·소유
  { rel: "manages", en: "manages", kind: "structure", def: "기관·부서가 데이터셋을 관리한다", domain: ["Org", "Team"], range: ["Dataset"] },
  { rel: "owns", en: "owns", kind: "structure", def: "부서가 데이터셋(인프라 장부)을 보유한다", domain: ["Org", "Team"], range: ["Dataset"] },
  { rel: "contains", en: "contains", kind: "evidence", def: "데이터셋 안에서 이 증거가 계산됐다(출처 계보)", domain: ["Dataset"], range: ["Evidence"] },
  { rel: "derived_from", en: "derived from", kind: "evidence", def: "데이터셋을 가공해 이 증거를 얻었다(출처 계보)", domain: ["Dataset"], range: ["Evidence"] },
  // 증거 → 주장·요인
  { rel: "supports", en: "supports", kind: "evidence", def: "증거가 주장·변수·지표를 뒷받침한다. 철회된 증거의 supports는 기록으로 남기되 인용하지 않는다", domain: ["Evidence"], range: ["Claim", "Covariate", "KPI"] },
  { rel: "contradicts", en: "contradicts", kind: "evidence", def: "증거가 변수의 효과를 기각한다(귀무 기각 실패)", domain: ["Evidence"], range: ["Claim", "Covariate"] },
  { rel: "describes", en: "describes", kind: "evidence", def: "증거가 요인·지표·개입의 실측 상태를 서술한다", domain: ["Evidence"], range: [...FACTOR, "KPI", "Lever"] },
  { rel: "exemplifies", en: "exemplifies", kind: "evidence", def: "증거가 실체의 사례다", domain: ["Evidence"], range: ["Entity"] },
  { rel: "mentions", en: "mentions", kind: "evidence", def: "증거가 이론을 언급한다", domain: ["Evidence"], range: ["Topic"] },
  // 요인 사이
  { rel: "part_of", en: "part of", kind: "association", def: "하위 요인·실체가 상위 요인(잠재요인)의 일부다", domain: FACTOR, range: FACTOR },
  { rel: "related_to", en: "related to", kind: "association", def: "요인끼리 상관·중첩된다(방향 없음, rho를 실을 수 있다)", domain: FACTOR, range: FACTOR },
  { rel: "influences", en: "influences", kind: "association", def: "요인이 다른 요인의 분포에 영향을 준다", domain: FACTOR, range: FACTOR },
  // 요인 → 결과 (통계 연관 — 인과 아님)
  { rel: "predicts", en: "predicts", kind: "association", def: "요인이 결과지표와 양의 조건부 연관을 갖는다(β 또는 ρ). 인과를 뜻하지 않는다", domain: FACTOR, range: ["KPI", "Risk"] },
  { rel: "contributes_to", en: "contributes to", kind: "association", def: "요인이 결과지표를 늘리는 방향의 약한 연관", domain: FACTOR, range: ["KPI"] },
  { rel: "constrains", en: "constrains", kind: "association", def: "요인은 결과지표와 음의 연관(β<0). 주장이면 지표 운용의 제약 규칙", domain: [...FACTOR, "Claim"], range: ["KPI"] },
  { rel: "degrades", en: "degrades", kind: "association", def: "이론이 결과지표를 악화시키는 기제를 설명한다", domain: ["Topic"], range: ["KPI"] },
  // 개입 → 결과·요인
  { rel: "lowers", en: "targets (lower)", kind: "intervention", def: "개입이 낮추려는 지표. 효과를 단언하지 않으며 판정(제안·미검증·효과없음·측정불가·철회)은 엣지 status에 있다", domain: ["Lever"], range: ["KPI"] },
  { rel: "stabilizes", en: "targets (stabilize)", kind: "intervention", def: "개입이 안정시키려는 지표. 판정 규칙은 lowers와 같다", domain: ["Lever"], range: ["KPI"] },
  { rel: "affects", en: "affects", kind: "intervention", def: "개입이 직접 겨냥하는 요인. 요인에 affects가 하나도 없으면 대책 공백이다", domain: ["Lever"], range: FACTOR },
  // 법령·절차
  { rel: "classifies", en: "classifies", kind: "governance", def: "법령이 데이터셋의 분류 기준이다", domain: ["Policy"], range: ["Dataset"] },
  { rel: "restricts", en: "restricts", kind: "governance", def: "정책·절차가 데이터셋 운용이나 개입 실행을 제한한다(사전등록 대상)", domain: ["Policy"], range: ["Dataset", "Lever"] },
  { rel: "governed_by", en: "governed by", kind: "governance", def: "개입의 실행 근거 법령·조례", domain: ["Lever"], range: ["Policy"] },
]

export const LEVER_VERDICT_RELS = new Set(["lowers", "stabilizes"])

// ─── 검증 ────────────────────────────────────────────────────────

export interface SchemaIssue {
  code:
    | "UNKNOWN_TYPE"
    | "UNKNOWN_SPACE"
    | "SPACE_MISMATCH"
    | "UNKNOWN_REL"
    | "DANGLING_EDGE"
    | "DOMAIN_VIOLATION"
    | "RANGE_VIOLATION"
    | "ORPHAN_NODE"
    | "RETRACTED_CONFIDENCE"
    | "VERDICT_MISSING_STATUS"
    | "CLAIM_UNSUPPORTED"
    | "LABEL_MISSING"
  level: "error" | "warn"
  ref: string // 노드 id 또는 "f -rel-> t"
  msg: string
}

export function validateGraph(graph: OntoGraph): SchemaIssue[] {
  const issues: SchemaIssue[] = []
  const classByType = new Map(CLASSES.map((c) => [c.type, c]))
  const relByName = new Map(RELATIONS.map((r) => [r.rel, r]))
  const typeOf = new Map(graph.nodes.map((n) => [n.id, n.type]))
  const degree = new Map<string, number>()
  const supported = new Set<string>()

  for (const n of graph.nodes) {
    const cls = classByType.get(n.type)
    if (!cls) issues.push({ code: "UNKNOWN_TYPE", level: "error", ref: n.id, msg: `정의되지 않은 클래스 ${n.type}` })
    if (!(SPACES as readonly string[]).includes(n.space))
      issues.push({ code: "UNKNOWN_SPACE", level: "error", ref: n.id, msg: `정의되지 않은 영역 ${n.space}` })
    else if (cls && cls.space !== n.space)
      issues.push({ code: "SPACE_MISMATCH", level: "error", ref: n.id, msg: `${n.type}는 ${cls.space} 영역인데 ${n.space}로 표기` })
    if (!TYPE_KO[n.type]) issues.push({ code: "LABEL_MISSING", level: "warn", ref: n.id, msg: `클래스 ${n.type}의 한글 표시명 없음` })
    if (n.props.retracted !== undefined && Number(n.props.confidence ?? 0) !== 0)
      issues.push({ code: "RETRACTED_CONFIDENCE", level: "error", ref: n.id, msg: "철회된 노드의 신뢰도는 0이어야 한다" })
  }

  for (const e of graph.edges) {
    const ref = `${e.f} -${e.rel}-> ${e.t}`
    const ft = typeOf.get(e.f)
    const tt = typeOf.get(e.t)
    if (!ft || !tt) {
      issues.push({ code: "DANGLING_EDGE", level: "error", ref, msg: "끝점 노드가 그래프에 없다" })
      continue
    }
    degree.set(e.f, (degree.get(e.f) ?? 0) + 1)
    degree.set(e.t, (degree.get(e.t) ?? 0) + 1)
    if (e.rel === "supports") supported.add(e.t)
    const def = relByName.get(e.rel)
    if (!def) {
      issues.push({ code: "UNKNOWN_REL", level: "error", ref, msg: `정의되지 않은 관계 ${e.rel}` })
      continue
    }
    if (!REL_KO[e.rel]) issues.push({ code: "LABEL_MISSING", level: "warn", ref, msg: `관계 ${e.rel}의 한글 표시명 없음` })
    if (!def.domain.includes(ft))
      issues.push({ code: "DOMAIN_VIOLATION", level: "error", ref, msg: `${e.rel}의 출발은 ${def.domain.join("|")}여야 하는데 ${ft}` })
    if (!def.range.includes(tt))
      issues.push({ code: "RANGE_VIOLATION", level: "error", ref, msg: `${e.rel}의 도착은 ${def.range.join("|")}여야 하는데 ${tt}` })
    if (LEVER_VERDICT_RELS.has(e.rel) && e.props?.status === undefined)
      issues.push({ code: "VERDICT_MISSING_STATUS", level: "error", ref, msg: "개입 판정 엣지에 status가 없다" })
  }

  for (const n of graph.nodes) {
    if (!degree.has(n.id)) issues.push({ code: "ORPHAN_NODE", level: "warn", ref: n.id, msg: "어떤 관계에도 연결되지 않은 노드" })
    if (n.type === "Claim" && !supported.has(n.id))
      issues.push({ code: "CLAIM_UNSUPPORTED", level: "error", ref: n.id, msg: "증거(supports)가 없는 주장" })
  }
  return issues
}

// 그래프에서 실제 관측된 (출발 type → 도착 type) 조합 — 스키마 표와 대조하거나 문서 생성에 쓴다
export function observedSignatures(graph: OntoGraph): Record<string, string[]> {
  const typeOf = new Map(graph.nodes.map((n) => [n.id, n.type]))
  const out: Record<string, Set<string>> = {}
  for (const e of graph.edges) {
    const sig = `${typeOf.get(e.f) ?? "?"}→${typeOf.get(e.t) ?? "?"}`
    ;(out[e.rel] ??= new Set()).add(sig)
  }
  return Object.fromEntries(Object.entries(out).map(([k, v]) => [k, [...v].sort()]))
}
