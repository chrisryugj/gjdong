import type { InfraLayerId, MapMode, OntoEdge, OntoGraph, OntoNode } from "@/lib/dumping/types"

// 개입수단(Lever) 파생 로직 — 정책 제안 보드와 제안이유 모달이 함께 쓴다.
// 표시 문구는 graph.json의 노드·엣지에서 만들어내고, 별도 원고는 두지 않는다.

export interface LeverView {
  node: OntoNode
  status: string // lowers/stabilizes 엣지의 status — 제안·철회·효과없음·측정불가·미검증
  verdictNote: string | null // 판정 근거 (엣지 note) — 전문용어가 섞인 분석 메모는 rationale로 분리
  rationale: string | null // 분석 메모 원문 (있는 것만)
  targets: { id: string; label: string }[] // affects → 겨냥 요인
  owner: string | null
  costNote: string | null
  verificationPlan: string | null
  preRegistered: boolean // 개입 사전등록 원칙(restricts) 적용 대상
  ordinance: string | null // governed_by → 실행 근거 조례 라벨
}

// 비용 표기를 배지로 정규화 — 관리자가 먼저 보는 것은 "돈이 드는가"
export function costBadge(
  costNote: string | null,
  edgeCost: string | undefined,
): { label: string; cls: string } | null {
  const src = costNote ?? edgeCost ?? ""
  if (!src) return null
  if (src.includes("0원")) return { label: "무예산", cls: "bg-[#0c6155]/12 text-[#0a4a41]" }
  if (src.includes("저")) return { label: "저비용", cls: "bg-[#1c4f96]/10 text-[#1c4f96]" }
  return { label: "예산 필요", cls: "bg-[#8a530e]/12 text-[#8a530e]" }
}

export const STATUS_STYLE: Record<string, { label: string; cls: string }> = {
  "제안": { label: "신규 제안", cls: "bg-[#0c6155] text-white" },
  "효과 확인 안 됨(철회)": { label: "효과 철회", cls: "bg-[#a8322a] text-white" },
  "효과없음": { label: "효과 없음", cls: "bg-slate-500 text-white" },
  "측정불가": { label: "판정 불가", cls: "bg-[#8a530e] text-white" },
  "미검증": { label: "미검증", cls: "bg-slate-400 text-white" },
}

// 요인 라벨은 그래프 원문이 길다 — 칩용으로 짧게
export function shortTarget(label: string): string {
  return label.replace(/\(.*?\)/g, "").trim()
}

export function deriveLevers(graph: OntoGraph): LeverView[] {
  const nodeById = new Map(graph.nodes.map((n) => [n.id, n]))
  const restricted = new Set(
    graph.edges.filter((e) => e.f === "proc-intervention-registry" && e.rel === "restricts").map((e) => e.t),
  )
  return graph.nodes
    .filter((n) => n.type === "Lever")
    .map((node) => {
      const verdict: OntoEdge | undefined = graph.edges.find(
        (e) => e.f === node.id && (e.rel === "lowers" || e.rel === "stabilizes"),
      )
      const p = verdict?.props ?? {}
      const targets = graph.edges
        .filter((e) => e.f === node.id && e.rel === "affects")
        .map((e) => ({ id: e.t, label: shortTarget(nodeById.get(e.t)?.label ?? e.t) }))
      const ordEdge = graph.edges.find((e) => e.f === node.id && e.rel === "governed_by")
      return {
        node,
        status: String(p.status ?? "미검증"),
        verdictNote: p.note != null ? String(p.note) : null,
        rationale: p.rationale != null ? String(p.rationale) : null,
        targets,
        owner: node.props.owner != null ? String(node.props.owner) : null,
        costNote: node.props.cost_note != null ? String(node.props.cost_note) : null,
        verificationPlan: node.props.verification_plan != null ? String(node.props.verification_plan) : null,
        preRegistered: restricted.has(node.id),
        ordinance: ordEdge ? (nodeById.get(ordEdge.t)?.label ?? null) : null,
      }
    })
}

// ─── 지도 연계 ────────────────────────────────────────────────
// 수단마다 "이 사업이 어디를 두고 하는 이야기인지" 지도로 바로 넘어가게 한다.
// 바탕·레이어는 여기서 정하고, 대상 동은 실측값(map.json)에서 골라야 하므로
// dongBy만 남겨 두고 실제 선택은 대시보드가 한다.

export interface LeverViz {
  mode: MapMode
  layers?: InfraLayerId[]
  candidates?: boolean
  routes?: boolean
  dongBy?: "frn" | "yth" | "one" // 해당 지표가 가장 높은 행정동으로 좁힌다
  label: string
}

export const LEVER_VIZ: Record<string, LeverViz> = {
  "lev-joint-disposal": { mode: "unm", label: "지도에서 관리주체 없는 주거 밀집지 보기" },
  "lev-collection-time": { mode: "enf", routes: true, label: "지도에서 청소차 노선과 함께 보기" },
  "lev-multilingual": { mode: "enf", dongBy: "frn", label: "지도에서 외국인 주민이 가장 많은 동 보기" },
  "lev-movein-guide": { mode: "enf", dongBy: "one", label: "지도에서 1인세대가 가장 많은 동 보기" },
  "lev-campus": { mode: "enf", dongBy: "yth", label: "지도에서 청년이 가장 많은 동 보기" },
  "lev-cctv-relocate": {
    mode: "enf",
    layers: ["cctvMobile"],
    candidates: true,
    label: "지도에서 이동식 CCTV와 재배치 후보 보기",
  },
  "lev-recycling": { mode: "unm", layers: ["recycling"], label: "지도에서 재활용정거장 위치 보기" },
  "lev-cctv-fixed": { mode: "enf", layers: ["cctvFixed"], label: "지도에서 고정식 CCTV 위치 보기" },
  "lev-cctv-mobile": { mode: "enf", layers: ["cctvMobile"], label: "지도에서 이동식 CCTV 위치 보기" },
  "lev-bin": { mode: "enf", layers: ["bins"], label: "지도에서 가로쓰레기통 위치 보기" },
}

export function vizForLever(lv: LeverView): LeverViz | null {
  return LEVER_VIZ[lv.node.id] ?? null
}

// ─── 요인 강도 ────────────────────────────────────────────────
// kpi-dump-rate(발생률)로 들어오는 엣지에서 β(격자 회귀)·ρ(행정동 비교)를 뽑는다.

export interface FactorStat {
  id: string
  easy: string // 쉬운 라벨
  kind: "beta" | "rho"
  value: number
  p?: number
  n?: number
}

// 요인 id → 일반 독자가 바로 이해하는 표현
export const FACTOR_EASY: Record<string, string> = {
  "con-unmanaged": "관리주체 없는 주택(다가구·단독)이 몰린 정도",
  "con-youth": "20~34세 청년이 사는 비율",
  "con-foreign": "등록 외국인이 사는 비율",
  "con-single-person": "혼자 사는 세대 비율",
  "con-commercial": "가게·상가가 몰린 정도",
  "con-alley": "골목이 많은 정도",
  "con-arterial-dist": "큰길에서 떨어진 거리",
  "con-latent-fragmentation": "1인·소형 주거가 몰린 동네 성격",
}

// 흐름도 박스용 짧은 이름 — 긴 설명은 막대 그래프 쪽에서 읽는다
export const FACTOR_SHORT: Record<string, string> = {
  "con-unmanaged": "관리주체 없는 주택 밀집",
  "con-youth": "청년 밀집",
  "con-foreign": "외국인 주민 밀집",
  "con-single-person": "1인세대 밀집",
  "con-commercial": "상가 밀집",
  "con-alley": "골목 많음",
  "con-arterial-dist": "큰길에서 먼 거리",
  "con-latent-fragmentation": "1인·소형 주거 밀집",
}

export function easyFactor(id: string, fallback: string): string {
  return FACTOR_EASY[id] ?? fallback
}

export function factorStats(graph: OntoGraph): FactorStat[] {
  const nodeById = new Map(graph.nodes.map((n) => [n.id, n]))
  const out: FactorStat[] = []
  for (const e of graph.edges) {
    if (e.t !== "kpi-dump-rate" || !e.props) continue
    const easy = easyFactor(e.f, shortTarget(nodeById.get(e.f)?.label ?? e.f))
    const num = (v: unknown) => (typeof v === "number" ? v : parseFloat(String(v)))
    if (e.props.beta !== undefined)
      out.push({ id: e.f, easy, kind: "beta", value: num(e.props.beta), p: num(e.props.p), n: num(e.props.n) })
    else if (e.props.rho !== undefined)
      out.push({ id: e.f, easy, kind: "rho", value: num(e.props.rho), n: num(e.props.n) })
  }
  return out
}

// ─── 제안이유 자동 조합 ────────────────────────────────────────
// rationale이 달린 수단은 두 건뿐이라, 겨냥 요인의 강도와 순위에서 문장을 만든다.

function josa(word: string, withBatchim: string, without: string): string {
  const c = word.charCodeAt(word.length - 1)
  if (c < 0xac00 || c > 0xd7a3) return without
  return (c - 0xac00) % 28 ? withBatchim : without
}

function ordinal(n: number): string {
  return ["가장", "두 번째로", "세 번째로", "네 번째로"][n] ?? `${n + 1}번째로`
}

// 겨냥 요인 중 연관이 가장 강한 것
export function primaryStat(lv: LeverView, stats: FactorStat[]): FactorStat | null {
  const ids = new Set(lv.targets.map((t) => t.id))
  const mine = stats.filter((s) => ids.has(s.id))
  if (!mine.length) return null
  return [...mine].sort((a, b) => Math.abs(b.value) - Math.abs(a.value))[0]
}

export function reasonSentences(lv: LeverView, stats: FactorStat[]): string[] {
  const top = primaryStat(lv, stats)
  if (!top) {
    return [
      "특정 요인을 겨냥하기보다, 수거와 단속의 운영 방식 자체를 조정하는 수단입니다.",
      "새 예산 없이 지금 있는 인력과 노선만 바꿔 시도할 수 있어, 먼저 검토해 볼 값어치가 있습니다.",
    ]
  }
  const s1 = `${top.easy}${josa(top.easy, "을", "를")} 겨냥하는 사업입니다.`

  // 통계로 확인된 효과가 아니라 자원 배분 논리로만 유지하는 제안 — 근거를 부풀리면 안 된다
  const notStat = /근거가 아니|근거 아님/.test(`${lv.rationale ?? ""} ${lv.node.props.note ?? ""}`)
  if (notStat) {
    return [
      s1,
      "다만 근거는 통계로 확인된 효과가 아닙니다. 이미 갖고 있는 장비를, 무단투기가 한 번도 없던 자리에서 실제로 잦은 자리로 옮기자는 자원 배분 논리입니다.",
      "돈이 들지 않으니 효과 판정을 기다리지 않고 지금 바로 조정할 수 있습니다.",
    ]
  }

  const same = stats.filter((s) => s.kind === top.kind).sort((a, b) => Math.abs(b.value) - Math.abs(a.value))
  const rank = same.findIndex((s) => s.id === top.id)
  const chance =
    top.p == null || Number.isNaN(top.p) || top.p < 0.001
      ? "이런 결과가 우연히 나올 확률은 0.1%도 되지 않습니다."
      : `이런 결과가 우연히 나올 확률은 ${(top.p * 100).toFixed(1)}%입니다.`
  const s2 =
    top.kind === "beta"
      ? `광진구를 100m 격자 ${(top.n ?? 0).toLocaleString()}칸으로 나눠 견줘 보니, 무단투기가 어디에서 생기는지를 ${ordinal(rank)} 잘 설명하는 조건이었습니다. ${chance}`
      : `행정동 15곳을 나란히 놓고 보면, 이 비율이 높은 동네일수록 무단투기도 ${
          top.value >= 0.8 ? "거의 예외 없이" : top.value >= 0.7 ? "뚜렷하게" : "어느 정도"
        } 많았습니다. 두 값이 함께 움직이는 정도는 ${top.value.toFixed(2)}입니다. 1에 가까울수록 붙어 다닌다는 뜻입니다.`
  const s3 =
    "그동안 광진구 대책은 시설과 단속에 몰려 있었고, 이 조건을 직접 건드리는 수단은 비어 있었습니다."
  return [s1, s2, s3]
}

// 판정 근거(note)가 비어 있는 기존 수단을 위한 기본 설명
export const STATUS_FALLBACK: Record<string, string> = {
  "미검증":
    "아직 효과를 재 보지 않았습니다. 설치 시점과 위치 자료를 갖추면 다른 수단과 같은 방식으로 판정할 수 있습니다.",
  "효과없음": "설치 위치와 무단투기 발생 사이에서 이렇다 할 관계가 나타나지 않았습니다.",
}

// 이 수단의 효과 분석(Evidence)에 달린 쉬운 설명 — 검증 결과를 전문용어 없이 보여줄 때 쓴다
export function easyVerdict(lv: LeverView, graph: OntoGraph): string | null {
  const nodeById = new Map(graph.nodes.map((n) => [n.id, n]))
  for (const e of graph.edges) {
    if (e.rel !== "describes" || e.t !== lv.node.id) continue
    const easy = nodeById.get(e.f)?.props?.["쉬운 설명"]
    if (easy) return String(easy)
  }
  return null
}

// 겨냥 요인을 설명하는 실측 증거 요약
export function evidenceFor(lv: LeverView, graph: OntoGraph): string[] {
  const ids = new Set(lv.targets.map((t) => t.id))
  const nodeById = new Map(graph.nodes.map((n) => [n.id, n]))
  const seen = new Set<string>()
  const out: string[] = []
  for (const e of graph.edges) {
    if (e.rel !== "describes" || !ids.has(e.t) || seen.has(e.f)) continue
    seen.add(e.f)
    const n = nodeById.get(e.f)
    const s = n?.props?.summary
    if (s) out.push(String(s))
  }
  return out
}
