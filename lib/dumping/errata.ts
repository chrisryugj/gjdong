import type { OntoGraph, OntoNode } from "./types"

// 정오표. 분석 SSOT(ontology.db)는 재현 해시로 잠겨 있어 고칠 수 없고, export 주석 레이어가 놓친
// 진술을 대시보드가 받는 시점에 바로잡는다. 항목마다 "왜"를 적고, 근거는 map.json 실측이다.
// 데이터 라우트(화면)와 질의응답 프롬프트가 같은 함수를 거쳐 같은 문장을 본다.
// 정본 수정(gwangjin-dumping/scripts/export_dashboard.py)이 반영되면 여기서 지운다.
//
// 이력: ERR-001 (2026-09-05) ev-fines → claim-bias note "과태료는 1.1배". 실데이터는 0.53배 감소.
//   같은 날 export_dashboard.py가 실측으로 생성하도록 고쳐져 정오표에서 내렸다.
// ERR-002~006 (2026-09-15, 10라운드 검토): 초기 세션의 주장 라벨이 이후 검증(K-apt 세 갈래·품목 분리·
//   앱 계단 조사)으로 좁혀진 결론과 반대로 남아 "검증된 주장"으로 근거 그래프에 노출되고 프롬프트에 들어갔다.
//   라벨·statement를 현행 결론으로 덮고 원문은 props.label_initial에 보존한다.

interface EdgeErratum {
  id: string
  f: string
  rel: string
  t: string
  note: string
}

interface NodeErratum {
  id: string
  node: string
  label?: string
  statement?: string // Claim 노드는 statement도 같이 덮는다
  easy?: string // Evidence 노드의 "쉬운 설명"
  why: string
}

export const EDGE_ERRATA: EdgeErratum[] = [
  {
    id: "ERR-006",
    f: "ev-channel",
    rel: "supports",
    t: "kpi-fixed-channel",
    note: "앱 2.97배 vs 120·직접 1.11배(2026년 1~8월 연환산 대비 2024년) · 채널고정만 연도 비교 가능",
  },
]

export const NODE_ERRATA: NodeErratum[] = [
  {
    id: "ERR-002",
    node: "claim-mgmt",
    label: "단속 적발은 시민의식보다 다가구·단독주택 밀집과 함께 움직인다 · 관리주체 부재 일반으로는 확인되지 않음",
    statement:
      "단속 적발은 시민의식보다 다가구·단독주택 밀집과 함께 움직인다. K-apt로 나눠 보면 관리사무소가 없는 다세대·연립은 연관이 확인되지 않아, 관리주체 부재 일반으로 넓히지 않는다",
    why: "초기 라벨 '배출 관리주체 부재의 함수'는 3라운드 K-apt 세 갈래 검증에서 다세대·연립 비유의로 범위가 좁혀졌다(규칙 15)",
  },
  {
    id: "ERR-003",
    node: "claim-bias",
    label: "민원 증가분은 앱 신고 창구에 몰려 있다 · 발생 증가 여부는 이 자료로 단정할 수 없음",
    statement:
      "민원 증가분은 앱 신고 창구에 몰려 있고 120·직접 신고와 순찰 적발은 그만큼 늘지 않았다. 앱 이용자 수·단속 인시 자료가 없어 발생 증가를 배제하지는 못한다",
    why: "초기 라벨 '발생 증가가 아니라 신고편향이다'는 발생 증가 배제 단정(검토서 A1). 2026-03 앱 계단의 원인도 미확인",
  },
  {
    id: "ERR-004",
    node: "ev-channel",
    label: "앱 신고 2.97배 vs 120·직접 1.11배 · 늘어난 부분은 앱 창구에 몰려 있다(발생 증가 배제 아님)",
    why: "초기 라벨 '증가분 대부분이 신고편향'은 채널별 관측 증가분의 분해이지 원인 식별이 아니다. 배율은 facts.channelGrowth와 같은 소수 2자리",
  },
  {
    id: "ERR-007",
    node: "kpi-dump-rate",
    label: "인구 1천명당 무단투기 민원·적발 기록률(행정동)",
    why: "'발생률'은 앱 신고 편향이 섞인 민원 기록을 실제 발생으로 읽게 한다(10라운드 심사 냉독). 지표의 정의는 그대로, 이름만 관측 대상을 말한다",
  },
  {
    id: "ERR-008",
    node: "ev-dong-rate",
    label: "인구 1천명당 민원 기록 광장동 1.7 ~ 중곡1동 25.7 (15배)",
    why: "같은 이유. 25.7은 중곡1동의 등록인구 천명당 민원 접수 건수",
  },
  {
    id: "ERR-011",
    node: "ev-seoul-app-trend",
    easy: "광진구 민원이 앱 신고로 늘어 보인 것처럼 서울 전체에서도 앱 청소 신고가 해마다 늘고 있습니다. 자치구별 증가 원인은 별도 확인이 필요합니다.",
    why: "'25개 구 모두 같은 착시'는 서울 합계 증가를 모든 자치구의 원인으로 확장한다(코덱스 qa-appendix P0)",
  },
  {
    id: "ERR-009",
    node: "lev-collection-time",
    label: "수거 시간대 조정(추가 예산 없음)",
    why: "'무예산'은 추가 현금 지출과 총비용을 혼동시킨다(검토서 J2). 직원 시간·계약 협의는 별도",
  },
  {
    id: "ERR-010",
    node: "lev-cctv-relocate",
    label: "이동식 CCTV 발생이력 기준 재배치(추가 예산 없음)",
    why: "같은 이유. 이전·설치 인력은 별도",
  },
  {
    id: "ERR-005",
    node: "claim-not-concealment",
    label: "은폐 가설(골목·간선 이격)은 전체 과태료에서 뒷받침되지 않음 · 생활쓰레기만 보면 차이가 작고 큰길 쪽 음수는 차량 담배꽁초 계열",
    statement:
      "골목 비율·간선 이격거리 계수는 전체 과태료에서 음수라 은폐 가설은 뒷받침되지 않는다. 품목을 나누면 생활쓰레기에서는 차이가 작고 큰길 쪽 음수는 차량 담배꽁초 모형에서 나온다. 가설을 뒤집어 증명한 것은 아니다",
    why: "8라운드 품목 분리(ev-item-split이 contradicts로 반박)를 라벨이 반영하지 않았다",
  },
]

function fixNode(n: OntoNode): OntoNode {
  const fix = NODE_ERRATA.find((x) => x.node === n.id)
  if (!fix) return n
  const props: OntoNode["props"] = { ...n.props, label_initial: n.label, erratum: fix.id }
  if (fix.statement && n.props.statement !== undefined) props.statement = fix.statement
  if (fix.easy && n.props["쉬운 설명"] !== undefined) props["쉬운 설명"] = fix.easy
  return { ...n, label: fix.label ?? n.label, props }
}

export function applyErrata(graph: OntoGraph): OntoGraph {
  if (!EDGE_ERRATA.length && !NODE_ERRATA.length) return graph
  return {
    nodes: graph.nodes.map(fixNode),
    edges: graph.edges.map((e) => {
      const fix = EDGE_ERRATA.find((x) => x.f === e.f && x.rel === e.rel && x.t === e.t)
      return fix ? { ...e, props: { ...(e.props ?? {}), note: fix.note, erratum: fix.id } } : e
    }),
  }
}
