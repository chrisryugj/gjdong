import type { InfraLayerId, MapMode, OntoEdge, OntoGraph, OntoNode } from "@/lib/dumping/types"
import { OUTCOMES } from "@/lib/dumping/queries"

// 개입수단(Lever) 파생 로직. 정책 제안 보드와 제안이유 모달이 함께 쓴다.
// 표시 문구는 graph.json의 노드·엣지에서 만들어내고, 별도 원고는 두지 않는다.

export interface LeverView {
  node: OntoNode
  status: string // lowers/stabilizes 엣지의 status: 제안·철회·효과없음·측정불가·미검증
  verdictNote: string | null // 판정 근거 (엣지 note). 전문용어가 섞인 분석 메모는 rationale로 분리
  rationale: string | null // 분석 메모 원문 (있는 것만)
  targets: { id: string; label: string }[] // affects → 겨냥 요인
  owner: string | null
  costNote: string | null
  verificationPlan: string | null
  preRegistered: boolean // 개입 사전등록 원칙(restricts) 적용 대상
  ordinance: string | null // governed_by → 실행 근거 조례 라벨
  effectRel: string | null // 판정 엣지 관계. lowers(줄인다)·stabilizes(안정시킨다). 기대효과 문장의 방향
  mechanism: string | null // 가정한 작동 원리 요약 칩 (예: "방치 시간 단축"). 정본은 export LEVER_MECHANISM
  mechanismSlots: { assumption: string; action: string; expect: string } | null // 가정 · 조치 · 기대 한 문장씩. 카드·모달·프롬프트가 같은 문장
}

// 비용 표기를 배지로 정규화. 관리자가 먼저 보는 것은 "돈이 드는가".
// 원문은 노드 cost_note("재배치 0원"·"저비용(인쇄·번역)") 또는 판정 엣지 cost("0원"·"저") 두 형태다.
// 10라운드: "무예산"은 추가 현금 지출과 총비용을 혼동시킨다(검토서 J2). 배지는 "추가 예산 없음"으로 부르고 직원 시간·이전 비용은 별도임을 문장이 말한다
export const COST_ORDER = ["추가 예산 없음", "저비용", "예산 필요"] as const

export function costBadge(costNote: string | null): { label: (typeof COST_ORDER)[number]; cls: string } | null {
  const src = costNote ?? ""
  if (!src) return null
  if (src.includes("0원")) return { label: "추가 예산 없음", cls: "bg-[#0c6155]/12 text-[#0a4a41]" }
  if (src === "저" || src.includes("저비용")) return { label: "저비용", cls: "bg-[var(--cp-hover2)] text-[var(--cp-text-muted)]" }
  return { label: "예산 필요", cls: "bg-[#8a530e]/12 text-[#8a530e]" }
}

export const STATUS_STYLE: Record<string, { label: string; cls: string }> = {
  "제안": { label: "신규 제안", cls: "bg-[#0c6155] text-white" },
  "효과 확인 안 됨(철회)": { label: "효과 철회", cls: "bg-[#a8322a] text-white" },
  "효과없음": { label: "효과 없음", cls: "bg-slate-500 text-white" },
  "측정불가": { label: "판정 불가", cls: "bg-slate-500 text-white" },
  "미검증": { label: "미검증", cls: "bg-slate-400 text-white" },
}

// 요인 라벨은 그래프 원문이 길다. 칩용으로 짧게
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
        // 노드에 비용 메모가 없으면 판정 엣지의 cost가 정본 (CCTV 재배치 "0원"이 여기에만 있다)
        costNote: node.props.cost_note != null ? String(node.props.cost_note) : p.cost != null ? String(p.cost) : null,
        verificationPlan: node.props.verification_plan != null ? String(node.props.verification_plan) : null,
        preRegistered: restricted.has(node.id),
        ordinance: ordEdge ? (nodeById.get(ordEdge.t)?.label ?? null) : null,
        effectRel: verdict?.rel ?? null,
        mechanism: node.props.mechanism != null ? String(node.props.mechanism) : null,
        mechanismSlots:
          node.props.mechanism_assumption != null
            ? {
                assumption: String(node.props.mechanism_assumption),
                action: String(node.props.mechanism_action ?? ""),
                expect: String(node.props.mechanism_expect ?? ""),
              }
            : null,
      }
    })
}

// "청소과(대행업체 계약)"처럼 괄호가 붙은 담당 문구. 좁은 칸에서 "(" 앞에서 줄이 꺾여 읽기 나쁘다.
// 본문과 괄호 안을 갈라 "청소과 · 대행업체 계약"으로 잇는다
export function splitParen(s: string): { main: string; note: string | null } {
  const m = s.match(/^(.*?)\s*\((.+)\)\s*$/)
  return m ? { main: m[1].trim(), note: m[2].trim() } : { main: s, note: null }
}

export function joinParen(s: string): string {
  const { main, note } = splitParen(s)
  return note ? `${main} · ${note}` : main
}

// ─── 결재선용 제안 표 ─────────────────────────────────────────
// 제안 6건을 표 한 장으로. 새 판단을 쓰지 않고 레버 노드 속성(cost·owner·verification_plan)만 펼친다.
// 비용 등급 순(무예산 → 저비용 → 예산 필요), 같은 등급 안에서는 그래프 순서.
export interface ProposalRow {
  lever: LeverView
  name: string // 라벨에서 괄호 꼬리를 뗀 이름
  cost: (typeof COST_ORDER)[number] | "미기재"
  costNote: string // 원문 비용 메모(금액·근거)
  owner: string
  verify: string
  mechanism: string // 가정 요약 칩. 없으면 "미기재"
  mechanismDetail: string // "가정: … 조치: … 기대: …" 한 줄. 프롬프트·게이트용
}

export function costRank(lv: LeverView): number {
  const b = costBadge(lv.costNote)
  return b ? COST_ORDER.indexOf(b.label) : COST_ORDER.length
}

export function proposalRows(graph: OntoGraph): ProposalRow[] {
  return deriveLevers(graph)
    .filter((l) => l.status === "제안")
    .sort((a, b) => costRank(a) - costRank(b))
    .map((lever) => ({
      lever,
      name: shortTarget(lever.node.label),
      cost: costBadge(lever.costNote)?.label ?? "미기재",
      costNote: lever.costNote ?? "미기재",
      owner: lever.owner ?? "미기재",
      verify: lever.verificationPlan ?? "미기재",
      mechanism: lever.mechanism ?? "미기재",
      mechanismDetail: lever.mechanismSlots
        ? `가정: ${lever.mechanismSlots.assumption}. 조치: ${lever.mechanismSlots.action}. 기대: ${lever.mechanismSlots.expect}`
        : "미기재",
    }))
}

// 14라운드(심사 냉독 B-1): 결론은 "사람이 아니라 다가구·단독 골목의 배출 구조"인데 제안 2·4·5는 1인세대·외국인·학생을 겨냥해 모순으로 읽혔다.
// 네 요인은 상관 0.85~0.97로 분리되지 않으므로, 사람 요인을 겨냥한 제안은 겨냥 지역을 바꾸는 것이 아니라 그 골목 주민에게 규칙이 닿게 하는
// 전달 수단이다. 카드·모달·프롬프트가 이 한 문장을 같이 쓴다. 다가구·단독 자체를 겨냥한 제안(3·6)과 요인 없는 제안(1)은 null
const PEOPLE_FACTORS: Record<string, string> = { "con-single-person": "1인세대", "con-foreign": "외국인", "con-youth": "청년·학생" }

export function targetNote(lv: LeverView): string | null {
  if (lv.targets.length === 0 || lv.targets.some((t) => !PEOPLE_FACTORS[t.id])) return null
  const people = lv.targets.map((t) => PEOPLE_FACTORS[t.id]).join("·")
  return `겨냥 지역은 다가구·단독 골목 그대로. ${people} 요인은 그 골목과 겹쳐 따로 떼어 볼 수 없어, 이 제안은 그 골목 주민에게 규칙이 닿게 하는 전달 수단입니다`
}

// ─── 지도 연계 ────────────────────────────────────────────────
// 수단마다 "이 제안이 어디를 두고 하는 이야기인지" 지도로 바로 넘어가게 한다.
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
  "lev-joint-disposal": { mode: "unm", label: "지도에서 다가구·단독 밀집지 보기" },
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
  "lev-clothbin-manage": { mode: "comp", layers: ["clothBins"], label: "지도에서 의류수거함과 민원 분포 보기" },
}

export function vizForLever(lv: LeverView): LeverViz | null {
  return LEVER_VIZ[lv.node.id] ?? null
}

// ─── 요인 강도 ────────────────────────────────────────────────
// 결과지표로 들어오는 엣지에서 β(격자 회귀 → kpi-dump-count-cell)·ρ(행정동 비교 → kpi-dump-rate)를 뽑는다.

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
  "con-unmanaged": "다가구·단독주택이 몰린 정도",
  "con-youth": "20~34세 청년이 사는 비율",
  "con-foreign": "등록 외국인이 사는 비율",
  "con-single-person": "혼자 사는 세대 비율",
  "con-commercial": "가게·상가가 몰린 정도",
  "con-alley": "골목이 많은 정도",
  "con-arterial-dist": "큰길에서 떨어진 거리",
  "con-latent-fragmentation": "1인·소형 주거가 몰린 동네 성격",
  "con-living-pop": "생활인구(서울시 250m 격자)",
  "con-clothbin": "의류수거함이 몰린 정도",
}

// 흐름도 박스용 짧은 이름. 긴 설명은 막대 그래프 쪽에서 읽는다
export const FACTOR_SHORT: Record<string, string> = {
  "con-unmanaged": "다가구·단독 밀집",
  "con-youth": "청년 밀집",
  "con-foreign": "외국인 주민 밀집",
  "con-single-person": "1인세대 밀집",
  "con-commercial": "상가 밀집",
  "con-alley": "골목 많음",
  "con-arterial-dist": "큰길에서 먼 거리",
  "con-latent-fragmentation": "1인·소형 주거 밀집",
  "con-living-pop": "생활인구 노출",
  "con-clothbin": "의류수거함 밀집",
}

export function easyFactor(id: string, fallback: string): string {
  return FACTOR_EASY[id] ?? fallback
}

export function factorStats(graph: OntoGraph): FactorStat[] {
  const nodeById = new Map(graph.nodes.map((n) => [n.id, n]))
  const out: FactorStat[] = []
  for (const e of graph.edges) {
    if (!OUTCOMES.has(e.t) || !e.props) continue
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
  // 10라운드: 결재 인쇄물에 들어가는 문장이라 통계 풀이("우연히 나올 확률", "1에 가까울수록")는 뺀다.
  // 근거 1문장 + 기대 방향 1문장(검증 전 명시). 효과를 단정하거나 "지금 바로"를 말하지 않는다
  if (!top) {
    return [
      "특정 요인을 겨냥하기보다, 수거와 단속의 운영 방식 자체를 조정하는 수단입니다.",
      "추가 예산 없이 지금 있는 인력과 노선만 조정해 시범할 수 있습니다. 효과는 시범 뒤 실측으로 판정합니다.",
    ]
  }
  const s1 = `${top.easy}${josa(top.easy, "을", "를")} 겨냥하는 제안입니다.`

  // 통계로 확인된 효과가 아니라 자원 배분 논리로만 유지하는 제안. 근거를 부풀리면 안 된다
  const notStat = /근거가 아니|근거 아님/.test(`${lv.rationale ?? ""} ${lv.node.props.note ?? ""}`)
  if (notStat) {
    return [
      s1,
      "근거는 통계로 확인된 효과가 아닙니다. 이미 있는 장비를 적발 기록이 없던 자리에서 잦은 자리로 옮기자는 자원 배분 논리입니다.",
      "추가 예산은 들지 않지만 이전·설치 인력은 별도이며, 재배치도 조치 대장에 등록한 뒤 평가합니다.",
    ]
  }

  const same = stats.filter((s) => s.kind === top.kind).sort((a, b) => Math.abs(b.value) - Math.abs(a.value))
  const rank = same.findIndex((s) => s.id === top.id)
  const s2 =
    top.kind === "beta"
      ? `광진구를 100m 격자 ${(top.n ?? 0).toLocaleString()}칸으로 나눠 보니 단속 적발 기록과 ${ordinal(rank)} 강하게 같이 움직이는 조건이었습니다.`
      : `행정동 ${top.n ?? 15}곳을 비교하면 이 비율이 높은 동네일수록 적발 기록도 ${
          top.value >= 0.8 ? "뚜렷하게" : top.value >= 0.7 ? "대체로" : "어느 정도"
        } 많았습니다.`
  const s3 = "이번에 모은 정책 목록에는 이 조건을 직접 겨냥하는 수단이 연결돼 있지 않았습니다. 효과는 시범 뒤 실측으로 판정합니다."
  return [s1, s2, s3]
}

// 카드 한 줄용 기대효과. 새 판단을 쓰지 않는다: 판정 엣지의 방향(lowers→감소, stabilizes→안정)·겨냥 요인·통계 근거 여부만 조합하고
// 효과 크기는 말하지 않는다(검증 전). 12라운드: 결재선이 카드에서 "무엇을 기대하는지"를 못 찾았다
export function expectedEffect(lv: LeverView, stats: FactorStat[]): string {
  const notStat = /근거가 아니|근거 아님/.test(`${lv.rationale ?? ""} ${lv.node.props.note ?? ""}`)
  if (notStat) return "적발 기록이 없던 자리의 장비를 잦은 자리로 옮기는 자원 배분. 효과는 통계로 확인된 것이 아님"
  const dir = lv.effectRel === "stabilizes" ? "안정" : "감소"
  const top = primaryStat(lv, stats)
  const first = lv.targets[0]
  const target = top ? (FACTOR_SHORT[top.id] ?? top.easy) : first ? (FACTOR_SHORT[first.id] ?? first.label) : null
  const where = target ? `${target} 지역의` : "수거·단속 운영 방식을 조정해"
  return `${where} 무단투기 적발 기록 ${dir} 기대. 검증 전이라 시범 뒤 실측으로 판정`
}

// 예산 등급별 건수 문장. "추가 예산 없는 3건은 조정으로 시범, 저비용 2건·예산 필요 1건은 시범 동을 정한 뒤 시행"
export function requestSentence(rows: ProposalRow[]): string {
  const count = (label: (typeof COST_ORDER)[number]) => rows.filter((r) => r.cost === label).length
  const free = count("추가 예산 없음")
  const low = count("저비용")
  const budget = count("예산 필요")
  const later = [low ? `저비용 ${low}건` : "", budget ? `예산 필요 ${budget}건` : ""].filter(Boolean).join("과 ")
  return `아래 ${rows.length}건의 검토를 요청합니다. 추가 예산 없는 ${free}건은 기존 인력과 장비 조정으로 시범할 수 있고(직원 시간·이전 비용은 별도) ${later}은 시범 동을 정해 조치 대장에 등록한 뒤 시행합니다. 모두 등록한 설계로만 평가합니다.`
}

// 판정 근거(note)가 비어 있는 기존 수단을 위한 기본 설명
export const STATUS_FALLBACK: Record<string, string> = {
  "미검증":
    "아직 효과를 측정하지 않았습니다. 설치 시점과 위치 자료를 갖추면 다른 수단과 같은 방식으로 판정할 수 있습니다.",
  "효과없음": "설치 위치와 무단투기 발생 사이에서 뚜렷한 관계가 나타나지 않았습니다.",
}

// 이 수단의 효과 분석(Evidence)에 달린 쉬운 설명. 검증 결과를 전문용어 없이 보여줄 때 쓴다
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
