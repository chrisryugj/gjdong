import type { OntoGraph, OntoNode } from "./types"

// 역량 질문(competency questions). "표로는 못 던지는 질문"을 그래프에서 그 자리에서 계산한다. 답이 바뀌면 tests/snow-queries.test.ts가 먼저 깨진다

export interface CqItem {
  id: string
  label: string
  note?: string
}
export interface CqResult {
  id: string
  q: string
  why: string
  items: CqItem[]
  empty: string // 결과 0건일 때의 문장
}

const byId = (g: OntoGraph) => new Map(g.nodes.map((n) => [n.id, n]))
const label = (m: Map<string, OntoNode>, id: string) => m.get(id)?.label ?? id

export function runCompetencyQuestions(graph: OntoGraph): CqResult[] {
  const m = byId(graph)
  const E = graph.edges
  const out: CqResult[] = []

  // 1. 열선이 없는 동. covers(lev-heat → Area)가 없는 Area
  const heatAreas = new Set(E.filter((e) => e.f === "lev-heat" && e.rel === "covers").map((e) => e.t))
  out.push({
    id: "cq-heat-gap",
    q: "도로열선이 한 구간도 없는 동은?",
    why: "열선은 상시 설비라 강설 전에 이미 작동한다. 없는 동은 비치 자재와 인력으로만 첫 결빙을 막는다",
    items: graph.nodes
      .filter((n) => n.type === "Area" && !heatAreas.has(n.id))
      .map((n) => ({ id: n.id, label: n.label, note: `염화칼슘함 ${n.props.cacl} · 모래주머니 ${n.props.sand}지점 · 제설함 ${n.props.salt}` })),
    empty: "15개 동 전부 열선이 있다",
  })

  // 2. 자원 4종 중 하나도 안 닿는 동
  const covered = new Map<string, Set<string>>()
  for (const e of E) if (e.rel === "covers") (covered.get(e.t) ?? covered.set(e.t, new Set()).get(e.t)!).add(e.f)
  out.push({
    id: "cq-uncovered",
    q: "대응자원 4종이 모두 없는 동은?",
    why: "동 단위 커버리지의 바닥. 하나라도 있으면 통과이므로 느슨한 기준이다",
    items: graph.nodes.filter((n) => n.type === "Area" && !(covered.get(n.id)?.size ?? 0)).map((n) => ({ id: n.id, label: n.label })),
    empty: "자원 4종 중 하나도 없는 동은 없다",
  })

  // 3. 겨냥하는 자원이 없는 취약요인
  const targeted = new Set(E.filter((e) => e.rel === "targets").map((e) => e.t))
  out.push({
    id: "cq-untargeted",
    q: "겨냥하는 대응자원이 없는 취약요인은?",
    why: "요인만 있고 수단이 없으면 대책의 공백이다",
    items: graph.nodes.filter((n) => n.type === "Concept" && !targeted.has(n.id)).map((n) => ({ id: n.id, label: n.label, note: String(n.props.def ?? "") })),
    empty: "취약요인 전부에 겨냥하는 자원이 있다(적설량 예보는 기준의 입력이라 제외)",
  })

  // 4. 법적 근거(basis)가 연결되지 않은 대응자원
  const based = new Set(E.filter((e) => e.rel === "basis").map((e) => e.t))
  out.push({
    id: "cq-basis",
    q: "법령·조례·대책기간 근거가 연결되지 않은 대응자원은?",
    why: "시설 설치·운영 근거가 그래프에 없다는 뜻이지 위법이라는 뜻이 아니다. 근거 규정을 찾아 붙이면 사라진다",
    items: graph.nodes.filter((n) => n.type === "Lever" && !based.has(n.id)).map((n) => ({ id: n.id, label: n.label, note: String(n.props.kind ?? "") })),
    empty: "대응자원 전부에 근거가 연결돼 있다",
  })

  // 5. 잴 데이터가 없는 목표지표
  out.push({
    id: "cq-kpi-unmeasured",
    q: "지금 잴 수 없는 목표지표는?",
    why: "자원 배치는 공개 데이터가 있지만 결과(사고·민원·시한 준수)는 없다. 대책 평가가 투입 지표에 머무는 이유",
    items: graph.nodes.filter((n) => n.type === "KPI" && n.props.measurable === "데이터 없음").map((n) => ({ id: n.id, label: n.label, note: String(n.props.def ?? "") })),
    empty: "목표지표 전부 측정 데이터가 있다",
  })

  // 6. 단계별 동원 자원 수(상위 단계는 하위를 포함해야 한다)
  const stages = graph.nodes.filter((n) => n.type === "Stage").sort((a, b) => Number(a.props.order) - Number(b.props.order))
  const mob = (s: string) => E.filter((e) => e.f === s && e.rel === "mobilizes").map((e) => e.t)
  const broken: string[] = []
  for (let i = 1; i < stages.length; i++) {
    const prev = new Set(mob(stages[i - 1].id))
    if (![...prev].every((x) => mob(stages[i].id).includes(x))) broken.push(stages[i].id)
  }
  out.push({
    id: "cq-stage",
    q: "각 대응 단계가 동원하는 자원은 몇 종이고, 격상할 때 빠지는 자원은 없는가?",
    why: "단계 격상은 자원의 누적이어야 한다. 하위 단계 자원이 상위에서 빠지면 규칙 오류",
    items: stages.map((s) => ({
      id: s.id,
      label: `${s.label} · ${mob(s.id).length}종`,
      note: `${mob(s.id).map((id) => label(m, id)).join(", ")}${broken.includes(s.id) ? " · 하위 단계 자원 누락" : ""}`,
    })),
    empty: "단계 노드가 없다",
  })

  // 7. 출처 데이터셋이 끊긴 관측(contains·derived_from 들어오는 엣지 없음)
  const sourced = new Set(E.filter((e) => e.rel === "contains" || e.rel === "derived_from").map((e) => e.t))
  out.push({
    id: "cq-lineage",
    q: "출처 데이터셋이 끊긴 관측은?",
    why: "계보가 없는 숫자는 재현할 수 없다",
    items: graph.nodes.filter((n) => n.type === "Evidence" && !sourced.has(n.id)).map((n) => ({ id: n.id, label: n.label })),
    empty: "관측 전부가 데이터셋에 닿는다",
  })

  // 8. 공공데이터가 아닌 보도자료에만 기대는 노드(출처 데이터셋이 보도자료뿐인 관측이 서술하는 자원·지표)
  const pressDs = new Set(graph.nodes.filter((n) => n.type === "Dataset" && /보도/.test(n.label)).map((n) => n.id))
  const pressEv = new Set(
    graph.nodes
      .filter((n) => n.type === "Evidence")
      .filter((n) => {
        const src = E.filter((e) => (e.rel === "contains" || e.rel === "derived_from") && e.t === n.id)
        return src.length > 0 && src.every((e) => pressDs.has(e.f))
      })
      .map((n) => n.id),
  )
  const onlyPress = graph.nodes.filter((n) => {
    if (n.type !== "Lever" && n.type !== "KPI") return false
    const desc = E.filter((e) => e.rel === "describes" && e.t === n.id)
    return desc.length > 0 && desc.every((e) => pressEv.has(e.f))
  })
  out.push({
    id: "cq-press-only",
    q: "공공데이터 없이 보도자료 수치로만 서술되는 자원·지표는?",
    why: "살포기·장비·인력은 개소 위치가 공개돼 있지 않다. 지도에 못 올리고 숫자만 보이는 이유",
    items: onlyPress.map((n) => ({ id: n.id, label: n.label, note: String(n.props.count ?? n.props.measurable ?? "") })),
    empty: "전부 공공데이터 관측이 있다",
  })

  // 9. 기준일 격차: 데이터셋 asof의 최신·최고(最古) 차이
  const ds = graph.nodes.filter((n) => n.type === "Dataset" && typeof n.props.asof === "string").sort((a, b) => String(a.props.asof).localeCompare(String(b.props.asof)))
  out.push({
    id: "cq-stale",
    q: "데이터셋 기준일은 얼마나 벌어져 있는가?",
    why: "모래주머니는 2022년, 염화칼슘함은 2026년 9월. 한 지도에 올리지만 같은 시점이 아니다",
    items: ds.map((n) => ({ id: n.id, label: n.label, note: String(n.props.asof) })),
    empty: "데이터셋이 없다",
  })

  return out
}

// 근거 계보: 판단 ← 관측 ← 데이터셋 ← 관리 주체. 상세 카드가 거꾸로 오른다
export function lineageOf(graph: OntoGraph, id: string): { node: OntoNode; rel: string }[] {
  const m = byId(graph)
  const out: { node: OntoNode; rel: string }[] = []
  const seen = new Set<string>([id])
  let frontier = [id]
  const UP = new Set(["supports", "contains", "derived_from", "manages", "owns", "describes"])
  while (frontier.length) {
    const next: string[] = []
    for (const cur of frontier) {
      for (const e of graph.edges) {
        if (e.t !== cur || !UP.has(e.rel) || seen.has(e.f)) continue
        seen.add(e.f)
        const n = m.get(e.f)
        if (n) {
          out.push({ node: n, rel: e.rel })
          next.push(e.f)
        }
      }
    }
    frontier = next
  }
  return out
}
