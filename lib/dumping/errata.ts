import type { OntoGraph } from "./types"

// 정오표 — 분석 SSOT(ontology.db)는 재현 해시로 잠겨 있어 고칠 수 없고, export 주석 레이어가 놓친
// 진술을 대시보드가 받는 시점에 바로잡는다. 항목마다 "왜"를 적고, 근거는 map.json 실측이다.
// 정본 수정(gwangjin-dumping/scripts/export_dashboard.py)이 반영되면 여기서 지운다.
//
// 이력: ERR-001 (2026-09-05) ev-fines → claim-bias note "과태료는 1.1배" — 실데이터는 0.53배 감소.
//   같은 날 export_dashboard.py가 실측으로 생성하도록 고쳐져 정오표에서 내렸다. 빈 목록이 정상 상태.

interface EdgeErratum {
  id: string
  f: string
  rel: string
  t: string
  note: string
}

export const EDGE_ERRATA: EdgeErratum[] = []

export function applyErrata(graph: OntoGraph): OntoGraph {
  if (!EDGE_ERRATA.length) return graph
  return {
    nodes: graph.nodes,
    edges: graph.edges.map((e) => {
      const fix = EDGE_ERRATA.find((x) => x.f === e.f && x.rel === e.rel && x.t === e.t)
      return fix ? { ...e, props: { ...(e.props ?? {}), note: fix.note, erratum: fix.id } } : e
    }),
  }
}
