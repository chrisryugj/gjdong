import type { OntoGraph } from "./types"

// 정오표 — 분석 SSOT(ontology.db)는 재현 해시로 잠겨 있어 고칠 수 없고, export 주석 레이어가 놓친
// 진술을 대시보드가 받는 시점에 바로잡는다. 항목마다 "왜"를 적고, 근거는 map.json 실측이다.
// 정본 수정(gwangjin-dumping/scripts/export_dashboard.py)이 반영되면 여기서 지운다.
//
// ERR-001 (2026-09-05): ev-fines → claim-bias 엣지 note "과태료는 1.1배 — 앱 3배와 대조".
//   map.json yearly.enforcement는 2024 1,578 → 2025 1,059 → 2026(1~8월) 555로, 연환산 0.53배 감소다.
//   "1.1배"는 채널고정 민원(120·직접)의 배율이 과태료에 잘못 옮겨진 것. 결론(신고편향)은 그대로 성립한다.

interface EdgeErratum {
  id: string
  f: string
  rel: string
  t: string
  note: string
}

export const EDGE_ERRATA: EdgeErratum[] = [
  {
    id: "ERR-001",
    f: "ev-fines",
    rel: "supports",
    t: "claim-bias",
    note: "과태료(단속 실측)는 같은 기간 오히려 줄었다 · 앱 신고 3배 증가와 대조. 발생이 늘었다는 근거 없음",
  },
]

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
