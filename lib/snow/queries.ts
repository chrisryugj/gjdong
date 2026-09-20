import type { OntoGraph, OntoNode } from "./types"

// 역량 질문(competency questions). 표로는 계산할 수 없는 질문을 그래프에서 그 자리에서 계산합니다. 답이 바뀌면 tests/snow-queries.test.ts가 먼저 깨집니다.
// core=true인 질문만 화면 기본 노출, 나머지는 "더 보기"

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
  core: boolean
  badge?: string // 배지에 쓸 값. 없으면 items.length
}

const byId = (g: OntoGraph) => new Map(g.nodes.map((n) => [n.id, n]))
const label = (m: Map<string, OntoNode>, id: string) => m.get(id)?.label ?? id

export function runCompetencyQuestions(graph: OntoGraph): CqResult[] {
  const m = byId(graph)
  const E = graph.edges
  const out: CqResult[] = []

  // 1. 취약구간 중 열선도 자재도 없는 곳(Entity에 들어오는 covers가 0)
  const segs = graph.nodes.filter((n) => n.type === "Entity")
  const coveredSeg = new Map<string, Set<string>>()
  for (const e of E) if (e.rel === "covers" && m.get(e.t)?.type === "Entity") (coveredSeg.get(e.t) ?? coveredSeg.set(e.t, new Set()).get(e.t)!).add(e.f)
  const heatSeg = new Set(E.filter((e) => e.rel === "covers" && e.f === "lev-heat").map((e) => e.t))
  const noHeatSegs = segs.filter((n) => !heatSeg.has(n.id))
  out.push({
    id: "cq-seg-gap",
    q: "취약구간 중 열선이 없는 곳은 몇 곳이고, 자재까지 없는 곳은?",
    why: "행안부 취약구간마다 60m 안 열선과 100m 안 자재를 셉니다. 둘 다 없으면 첫 결빙에 대응할 자원이 그 자리에 없습니다",
    items: noHeatSegs.map((n) => ({
      id: n.id,
      label: String(n.props.name ?? n.label),
      note: `${n.props.dong ?? "동 미판정"} · 열선 ${n.props.heat_near_m ?? "?"}m · 자재 ${n.props.materials_near ?? 0}개소${coveredSeg.get(n.id)?.size ? "" : " · 자원 공백"}`,
    })),
    empty: "취약구간 전부 60m 안에 열선이 있습니다",
    core: true,
    badge: `${noHeatSegs.length}/${segs.length}`,
  })

  // 2. 열선이 없는 동(구역). lev-heat covers Zone이 없는 Zone
  const heatZones = new Set(E.filter((e) => e.f === "lev-heat" && e.rel === "covers" && m.get(e.t)?.type === "Zone").map((e) => e.t))
  out.push({
    id: "cq-heat-gap",
    q: "도로열선이 한 구간도 없는 동은?",
    why: "열선은 상시 설비라 강설 전에 작동합니다. 없는 동은 비치 자재와 인력으로 첫 결빙에 대응합니다",
    items: graph.nodes
      .filter((n) => n.type === "Zone" && !heatZones.has(n.id))
      .map((n) => ({ id: n.id, label: String(n.label).replace(" 담당 구역", ""), note: `염화칼슘함 ${n.props.cacl} · 모래주머니 ${n.props.sand}지점 · 제설함 ${n.props.salt} · 취약구간 ${n.props.weak}` })),
    empty: "15개 동 전부 열선이 있습니다",
    core: true,
  })

  // 3. 자원 4종 중 하나도 없는 구역
  const covered = new Map<string, Set<string>>()
  for (const e of E) if (e.rel === "covers" && m.get(e.t)?.type === "Zone") (covered.get(e.t) ?? covered.set(e.t, new Set()).get(e.t)!).add(e.f)
  out.push({
    id: "cq-uncovered",
    q: "대응자원 4종이 모두 없는 동은?",
    why: "동 단위로 자원이 하나라도 있는지 확인하는 최소 기준입니다",
    items: graph.nodes.filter((n) => n.type === "Zone" && !(covered.get(n.id)?.size ?? 0)).map((n) => ({ id: n.id, label: n.label })),
    empty: "자원 4종 중 하나도 없는 동은 없습니다",
    core: false,
  })

  // 4. 대상으로 하는 자원이 없는 취약요인(적설량 예보는 기준의 입력이라 제외)
  const targeted = new Set(E.filter((e) => e.rel === "targets").map((e) => e.t))
  out.push({
    id: "cq-untargeted",
    q: "대상으로 하는 대응자원이 없는 취약요인은?",
    why: "요인만 있고 수단이 없으면 대책의 빈자리입니다",
    items: graph.nodes.filter((n) => n.type === "Concept" && n.id !== "con-snowfall" && !targeted.has(n.id)).map((n) => ({ id: n.id, label: n.label, note: String(n.props.def ?? "") })),
    empty: "취약요인 전부에 대상 자원이 있습니다(적설량 예보는 기준의 입력이라 제외)",
    core: false,
  })

  // 5. 근거(basis)가 연결되지 않은 대응자원
  const based = new Set(E.filter((e) => e.rel === "basis").map((e) => e.t))
  const unbased = graph.nodes.filter((n) => n.type === "Lever" && !based.has(n.id))
  out.push({
    id: "cq-basis",
    q: "법령·조례·대책기간 근거가 연결되지 않은 대응자원은?",
    why: "근거가 그래프에 없다는 뜻이지 위법이라는 뜻이 아닙니다. 근거 규정을 연결하면 0건이 됩니다",
    items: unbased.map((n) => ({ id: n.id, label: n.label, note: String(n.props.kind ?? "") })),
    empty: "대응자원 전부에 근거가 연결돼 있습니다",
    core: true,
    badge: unbased.length ? String(unbased.length) : "0",
  })

  // 6. 측정 자료가 없는 목표지표
  out.push({
    id: "cq-kpi-unmeasured",
    q: "지금 측정할 수 없는 목표지표는?",
    why: "자원 배치는 공개 데이터가 있지만 결과(민원·시한 준수)는 없습니다. 대책 평가가 투입 지표까지만 가능한 이유입니다",
    items: graph.nodes.filter((n) => n.type === "KPI" && n.props.measurable === "데이터 없음").map((n) => ({ id: n.id, label: n.label, note: `${n.props.def ?? ""}${n.props.request ? ` · ${n.props.request}` : ""}` })),
    empty: "목표지표 전부 측정 데이터가 있습니다",
    core: true,
  })

  // 7. 단계별 동원 자원 수(상위 단계는 하위를 포함해야 합니다)
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
    why: "단계 격상은 자원의 누적이어야 합니다. 하위 단계 자원이 상위에서 빠지면 규칙 오류입니다",
    items: stages.map((s) => ({
      id: s.id,
      label: `${s.label} · ${mob(s.id).length}종`,
      note: `${mob(s.id).map((id) => label(m, id)).join(", ")}${broken.includes(s.id) ? " · 하위 단계 자원 누락" : ""}`,
    })),
    empty: "단계 노드가 없습니다",
    core: false,
    badge: `누락 ${broken.length}`,
  })

  // 8. 출처 데이터셋이 끊긴 관측
  const sourced = new Set(E.filter((e) => e.rel === "contains" || e.rel === "derived_from").map((e) => e.t))
  out.push({
    id: "cq-lineage",
    q: "출처 데이터셋이 끊긴 관측은?",
    why: "계보가 없는 숫자는 재현이 안 됩니다",
    items: graph.nodes.filter((n) => n.type === "Evidence" && !sourced.has(n.id)).map((n) => ({ id: n.id, label: n.label })),
    empty: "관측 전부에 출처 데이터셋이 있습니다",
    core: false,
  })

  // 9. 보도자료에만 기대는 자원·지표
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
    why: "살포기·장비·인력은 개소 위치가 공개돼 있지 않습니다. 지도에 표시할 수 없어 수치만 표시합니다",
    items: onlyPress.map((n) => ({ id: n.id, label: n.label, note: String(n.props.count ?? n.props.measurable ?? "") })),
    empty: "전부 공공데이터 관측이 있습니다",
    core: true,
  })

  // 10. 기준일 격차
  const ds = graph.nodes.filter((n) => n.type === "Dataset" && typeof n.props.asof === "string" && Number(n.props.rows) > 0).sort((a, b) => String(a.props.asof).localeCompare(String(b.props.asof)))
  out.push({
    id: "cq-stale",
    q: "데이터셋 기준일은 얼마나 벌어져 있는가?",
    why: "모래주머니는 2022년, 염화칼슘함은 2026년 9월입니다. 한 지도에 올리지만 같은 시점이 아닙니다",
    items: ds.map((n) => ({ id: n.id, label: n.label, note: String(n.props.asof) })),
    empty: "데이터셋이 없습니다",
    core: true,
    badge: ds.length ? `${String(ds[0].props.asof).slice(0, 4)}~${String(ds[ds.length - 1].props.asof).slice(0, 4)}` : "",
  })

  return out
}

// 근거 계보: 판단 ‹ 관측 ‹ 데이터셋 ‹ 관리 주체. 상세 카드가 위로 오릅니다
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
