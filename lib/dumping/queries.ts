import type { OntoGraph, OntoNode } from "./types"

// 역량 질문(competency questions) — "이 온톨로지는 무엇에 답할 수 있는가"를 코드로 고정한다.
// 전부 graph.json 위의 순수 함수라 데이터가 바뀌면 답도 따라오고, 테스트가 현재 답을 핀으로 박는다.
// 화면(온톨로지 탭 "온톨로지에 묻기")과 문서가 같은 함수를 쓴다.

export const OUTCOME = "kpi-dump-rate"
const FACTOR_RELS = new Set(["predicts", "contributes_to", "constrains"])
const VERDICT_RELS = new Set(["lowers", "stabilizes"])
// 도로 형태 변수는 관측 통제용이지 개입으로 바꿀 대상이 아니다 — 공백으로 세지 않되 답에는 표시한다
export const STRUCTURAL_FACTORS = new Set(["con-alley", "con-arterial-dist"])

export interface CqHit {
  id: string
  note?: string
}

export interface CqResult {
  id: string
  q: string // 질문
  why: string // 왜 이 질문이 표로는 안 되고 그래프여야 하는가 / 무엇을 잡아내는가
  hits: CqHit[]
  gaps: number // 실제 공백으로 세는 수 (구조 변수·기록 보존분 제외)
  empty: string // hits가 없을 때 문구
}

function byId(graph: OntoGraph): Map<string, OntoNode> {
  return new Map(graph.nodes.map((n) => [n.id, n]))
}

// CQ1 — 발생과 연관된 요인 가운데 겨냥하는 개입이 없는 것
export function cqUntargetedFactors(graph: OntoGraph): CqResult {
  const nodes = byId(graph)
  const factors = [...new Set(graph.edges.filter((e) => e.t === OUTCOME && FACTOR_RELS.has(e.rel) && nodes.get(e.f)?.type === "Concept").map((e) => e.f))]
  const targeted = new Set(graph.edges.filter((e) => e.rel === "affects").map((e) => e.t))
  const hits = factors
    .filter((f) => !targeted.has(f))
    .map((id) => {
      const edge = graph.edges.find((e) => e.f === id && e.t === OUTCOME)
      const beta = edge?.props?.beta !== undefined ? `β ${Number(edge.props.beta) > 0 ? "+" : ""}${edge.props.beta}` : edge?.props?.rho !== undefined ? `ρ ${edge.props.rho}` : ""
      return {
        id,
        note: STRUCTURAL_FACTORS.has(id) ? `${beta} · 도로 형태 통제변수, 개입 대상 아님` : `${beta} · 겨냥하는 개입 없음`,
      }
    })
  return {
    id: "cq-untargeted",
    q: "발생과 연관된 요인 가운데, 겨냥하는 개입수단이 없는 것은?",
    why: "요인 목록과 개입 목록을 따로 보면 안 보인다. predicts로 들어온 요인에 affects로 나가는 개입이 없는 노드를 기계적으로 찾는다. 청년·외국인·1인세대 공백이 여기서 드러나 신규 대책 3건이 나왔다",
    hits,
    gaps: hits.filter((h) => !STRUCTURAL_FACTORS.has(h.id)).length,
    empty: "없음. 연관 요인마다 겨냥하는 개입이 하나 이상 있다",
  }
}

// CQ2 — 증거 없는 주장
export function cqUnsupportedClaims(graph: OntoGraph): CqResult {
  const supported = new Set(graph.edges.filter((e) => e.rel === "supports").map((e) => e.t))
  const hits = graph.nodes.filter((n) => n.type === "Claim" && !supported.has(n.id)).map((n) => ({ id: n.id }))
  return {
    id: "cq-unsupported",
    q: "증거가 뒷받침하지 않는 주장이 있는가?",
    why: "보고서 문장은 근거 없이도 쓸 수 있지만, 그래프의 주장은 supports 엣지가 있어야 한다. 0건이어야 정상이다",
    hits,
    gaps: hits.length,
    empty: "없음. 주장 전부가 증거 엣지를 갖는다",
  }
}

// CQ3 — 철회된 근거에 아직 연결된 항목 (철회는 지워서 감추지 않고 그대로 보존한다)
export function cqRetractedCitations(graph: OntoGraph): CqResult {
  const nodes = byId(graph)
  const retracted = new Set(graph.nodes.filter((n) => n.props.retracted !== undefined).map((n) => n.id))
  const hits: CqHit[] = []
  const seen = new Set<string>()
  for (const e of graph.edges) {
    if (!retracted.has(e.f) || retracted.has(e.t) || seen.has(e.t)) continue
    seen.add(e.t)
    const target = nodes.get(e.t)
    const verdict = graph.edges.find((x) => x.f === e.t && VERDICT_RELS.has(x.rel))?.props?.status
    hits.push({
      id: e.t,
      note:
        target?.type === "Lever"
          ? `철회된 분석이 이 개입을 서술 · 판정 엣지 status="${verdict ?? "없음"}"`
          : `철회된 증거가 ${e.rel}로 연결됨`,
    })
  }
  return {
    id: "cq-retracted",
    q: "철회된 근거(confidence 0)가 아직 연결된 항목은?",
    why: "CCTV 효과 주장은 철회됐지만 노드를 지우지 않았다. 철회 사유와 함께 남겨 두고, 철회되지 않은 노드로 연결이 이어지는지를 감시한다. 연결이 남아 있어도 도착 노드가 철회 상태이거나 판정 엣지가 철회로 표기돼 있으면 정상이다",
    hits,
    gaps: hits.filter((h) => !/철회/.test(h.note ?? "")).length,
    empty: "없음. 철회된 근거는 어디에도 연결돼 있지 않다",
  }
}

// CQ4 — 개입수단의 검증 상태 분포
export function cqLeversByVerdict(graph: OntoGraph): CqResult {
  const hits = graph.nodes
    .filter((n) => n.type === "Lever")
    .map((n) => {
      const v = graph.edges.find((e) => e.f === n.id && VERDICT_RELS.has(e.rel))
      return { id: n.id, note: String(v?.props?.status ?? "판정 엣지 없음") }
    })
  return {
    id: "cq-verdict",
    q: "보유·제안 개입수단은 각각 어떤 검증 상태인가?",
    why: "개입의 효과는 노드가 아니라 판정 엣지(lowers·stabilizes)의 status에 있다. '효과 있다'를 그래프가 단언하지 않게 만든 설계이고, 이 질문은 그 status를 한 번에 모은다",
    hits,
    gaps: hits.filter((h) => h.note === "판정 엣지 없음").length,
    empty: "개입수단 노드가 없다",
  }
}

// CQ5 — 실행 근거 법령·조례가 연결되지 않은 개입
export function cqLeversWithoutBasis(graph: OntoGraph): CqResult {
  const governed = new Set(graph.edges.filter((e) => e.rel === "governed_by").map((e) => e.f))
  const hits = graph.nodes
    .filter((n) => n.type === "Lever" && !governed.has(n.id))
    .map((n) => {
      const v = graph.edges.find((e) => e.f === n.id && VERDICT_RELS.has(e.rel))
      return { id: n.id, note: `판정 ${String(v?.props?.status ?? "없음")} · governed_by 없음` }
    })
  return {
    id: "cq-basis",
    q: "실행 근거 법령·조례가 연결되지 않은 개입수단은?",
    why: "제안을 실행 계획으로 옮기려면 근거 조례가 필요하다. governed_by가 없는 개입은 그래프가 아직 실행 가능성을 보증하지 않는 것이다",
    hits,
    gaps: hits.length,
    empty: "없음. 모든 개입에 실행 근거가 연결돼 있다",
  }
}

// CQ6 — 출처 데이터셋 계보가 끊긴 증거
export function cqEvidenceWithoutLineage(graph: OntoGraph): CqResult {
  const fromDs = new Set(graph.edges.filter((e) => e.rel === "contains" || e.rel === "derived_from").map((e) => e.t))
  const hits = graph.nodes.filter((n) => n.type === "Evidence" && !fromDs.has(n.id)).map((n) => ({ id: n.id, note: "contains·derived_from 없음" }))
  return {
    id: "cq-lineage",
    q: "어느 데이터셋에서 나왔는지 계보가 끊긴 증거는?",
    why: "증거는 반드시 데이터셋(contains·derived_from)으로 거슬러 올라가야 재현 패키지의 해시와 맞물린다. 끊긴 증거는 출처 노드를 추가해야 할 대상이다",
    hits,
    gaps: hits.length,
    empty: "없음. 모든 증거가 데이터셋에 닿는다",
  }
}

// CQ7 — 사전등록 원칙이 그래프에 실제로 연결된 개입
export function cqPreregistrationCoverage(graph: OntoGraph): CqResult {
  const restricted = new Set(graph.edges.filter((e) => e.f === "proc-intervention-registry" && e.rel === "restricts").map((e) => e.t))
  const proposals = graph.nodes.filter((n) => {
    if (n.type !== "Lever") return false
    const v = graph.edges.find((e) => e.f === n.id && VERDICT_RELS.has(e.rel))
    return v?.props?.status === "제안"
  })
  const hits = proposals.map((n) => ({ id: n.id, note: restricted.has(n.id) ? "사전등록 대상으로 연결됨" : "연결 없음 · 원칙은 전 제안에 적용되지만 그래프에는 미기재" }))
  return {
    id: "cq-prereg",
    q: "제안된 개입 가운데 사전등록 원칙(조치 대장)이 그래프에 연결된 것은?",
    why: "정책 화면은 '모든 제안은 실행 전 등록'이라고 말한다. 그래프의 restricts 엣지가 그 말을 얼마나 뒷받침하는지 세어, 말과 구조의 어긋남을 드러낸다",
    hits,
    gaps: hits.filter((h) => !restricted.has(h.id)).length,
    empty: "제안 상태의 개입이 없다",
  }
}

export function runCompetencyQuestions(graph: OntoGraph): CqResult[] {
  return [
    cqUntargetedFactors(graph),
    cqUnsupportedClaims(graph),
    cqRetractedCitations(graph),
    cqLeversByVerdict(graph),
    cqLeversWithoutBasis(graph),
    cqEvidenceWithoutLineage(graph),
    cqPreregistrationCoverage(graph),
  ]
}

// ─── 근거 계보 ────────────────────────────────────────────────
// 노드 하나에서 거슬러 올라가 "어떤 증거 → 어떤 데이터셋 → 누가 관리"인지 모은다. 상세 카드 "근거 계보"용.
const UPSTREAM_RELS = new Set(["supports", "describes", "contains", "derived_from", "manages", "owns", "exemplifies", "mentions"])

export interface Lineage {
  evidence: string[]
  datasets: string[]
  owners: string[]
}

export function lineageOf(graph: OntoGraph, id: string, maxDepth = 4): Lineage {
  const nodes = byId(graph)
  const out: Lineage = { evidence: [], datasets: [], owners: [] }
  const seen = new Set<string>([id])
  let frontier = [id]
  for (let d = 0; d < maxDepth && frontier.length; d++) {
    const next: string[] = []
    for (const cur of frontier) {
      for (const e of graph.edges) {
        if (e.t !== cur || !UPSTREAM_RELS.has(e.rel) || seen.has(e.f)) continue
        seen.add(e.f)
        next.push(e.f)
        const t = nodes.get(e.f)?.type
        if (t === "Evidence") out.evidence.push(e.f)
        else if (t === "Dataset") out.datasets.push(e.f)
        else if (t === "Org" || t === "Team") out.owners.push(e.f)
      }
    }
    frontier = next
  }
  return out
}
