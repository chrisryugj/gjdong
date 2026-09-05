"use client"

import type { DumpingMapData, OntoGraph } from "@/lib/dumping/types"
import { partialYearSuffix, regressionBetas, summarize } from "@/lib/dumping/facts"

// 예시 질문에 딸려 나오는 데이터 차트 — 의존성 없이 SVG 직접 렌더.
// LLM 답변과 무관하게 export 집계(map.json·graph.json)에서 그리므로 수치가 지어질 수 없다.

export type ChartKind = "yearly" | "monthly" | "seasons" | "beta" | "did"

export const CHART_TITLE: Record<ChartKind, string> = {
  yearly: "연도별 민원·과태료 건수",
  monthly: "월별 민원 추이",
  seasons: "계절별 일평균 발생 (민원·과태료)",
  beta: "요인별 영향력 (표준화 β)",
  did: "이동식 CCTV 효과 재검증 (DID)",
}

// 카드·모달 제목 — 월별은 집계 기간을 데이터에서 붙인다
export function chartTitle(kind: ChartKind, data: DumpingMapData): string {
  return kind === "monthly" ? `${CHART_TITLE.monthly} (${summarize(data).period.label})` : CHART_TITLE[kind]
}

const BLUE = "#1c4f96"
const AMBER = "#8a530e"
const GREEN = "#0c6155"
const RED = "#a8322a"
const GRAY = "#94a3b8"
const INK = "#334155"
const INK_DIM = "#64748b"

const W = 560
const H = 250

function niceMax(v: number): number {
  const pow = Math.pow(10, Math.floor(Math.log10(v)))
  return Math.ceil(v / pow) * pow
}

function YearlyChart({ data }: { data: DumpingMapData }) {
  const years = Object.keys(data.yearly.complaints).filter((y) => Number(y) >= 2024)
  const { period } = summarize(data)
  const series = years.map((y) => ({
    y,
    comp: data.yearly.complaints[y] ?? 0,
    enf: data.yearly.enforcement[y] ?? 0,
  }))
  const max = niceMax(Math.max(...series.flatMap((s) => [s.comp, s.enf])))
  const x0 = 30
  const bw = 44
  const groupW = (W - x0 - 10) / series.length
  const y = (v: number) => 200 - (v / max) * 160
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full">
      <line x1={x0} y1={200} x2={W - 10} y2={200} stroke="#cbd5e1" />
      {series.map((s, i) => {
        const cx = x0 + groupW * i + groupW / 2
        return (
          <g key={s.y}>
            <rect x={cx - bw - 4} y={y(s.comp)} width={bw} height={200 - y(s.comp)} fill={BLUE} rx={3} />
            <rect x={cx + 4} y={y(s.enf)} width={bw} height={200 - y(s.enf)} fill={AMBER} rx={3} opacity={0.9} />
            <text x={cx - bw / 2 - 4} y={y(s.comp) - 6} textAnchor="middle" fontSize={15} fontWeight={700} fill={BLUE}>
              {s.comp.toLocaleString()}
            </text>
            <text x={cx + bw / 2 + 4} y={y(s.enf) - 6} textAnchor="middle" fontSize={15} fontWeight={700} fill={AMBER}>
              {s.enf.toLocaleString()}
            </text>
            <text x={cx} y={222} textAnchor="middle" fontSize={15} fill={INK}>
              {s.y}
              {partialYearSuffix(period, s.y)}
            </text>
          </g>
        )
      })}
      <g fontSize={13} fill={INK_DIM}>
        <rect x={x0} y={12} width={12} height={12} fill={BLUE} rx={2} />
        <text x={x0 + 17} y={22}>민원(신고 편향 포함)</text>
        <rect x={x0 + 165} y={12} width={12} height={12} fill={AMBER} rx={2} />
        <text x={x0 + 182} y={22}>과태료(단속 실측)</text>
      </g>
    </svg>
  )
}

function MonthlyChart({ data }: { data: DumpingMapData }) {
  const entries = Object.entries(data.yearly.complaintsMonthly).sort()
  const max = niceMax(Math.max(...entries.map(([, v]) => v)))
  const x0 = 34
  const step = (W - x0 - 14) / Math.max(entries.length - 1, 1)
  const y = (v: number) => 196 - (v / max) * 150
  const pts = entries.map(([, v], i) => `${x0 + i * step},${y(v)}`).join(" ")
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full">
      <line x1={x0} y1={196} x2={W - 10} y2={196} stroke="#cbd5e1" />
      <text x={x0 - 6} y={y(max) + 4} textAnchor="end" fontSize={12} fill={INK_DIM}>{max}</text>
      <line x1={x0} y1={y(max)} x2={W - 10} y2={y(max)} stroke="#e2e8f0" />
      <polyline points={pts} fill="none" stroke={BLUE} strokeWidth={2.5} />
      {entries.map(([m], i) =>
        m.endsWith("-01") ? (
          <g key={m}>
            <line x1={x0 + i * step} y1={196} x2={x0 + i * step} y2={44} stroke="#e2e8f0" strokeDasharray="3 3" />
            <text x={x0 + i * step + 3} y={214} fontSize={13} fill={INK}>{m.slice(0, 4)}년</text>
          </g>
        ) : null,
      )}
      {(() => {
        const [m, v] = entries[entries.length - 1]
        const i = entries.length - 1
        return (
          <g>
            <circle cx={x0 + i * step} cy={y(v)} r={4} fill={BLUE} />
            <text x={x0 + i * step - 6} y={y(v) - 8} textAnchor="end" fontSize={13} fontWeight={700} fill={BLUE}>
              {m.slice(0, 7)} {v}건
            </text>
          </g>
        )
      })()}
    </svg>
  )
}

function SeasonsChart({ data }: { data: DumpingMapData }) {
  const order = ["봄", "여름", "가을", "겨울"]
  const rows = order.map((k) => ({ k, ...data.env.seasons[k] }))
  const max = Math.max(...rows.flatMap((r) => [r.compPerDay, r.enfPerDay])) * 1.25
  const x0 = 26
  const groupW = (W - x0 - 10) / rows.length
  const bw = 42
  const y = (v: number) => 200 - (v / max) * 160
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full">
      <line x1={x0} y1={200} x2={W - 10} y2={200} stroke="#cbd5e1" />
      {rows.map((r, i) => {
        const cx = x0 + groupW * i + groupW / 2
        const hi = r.k === "여름"
        return (
          <g key={r.k}>
            <rect x={cx - bw - 3} y={y(r.compPerDay)} width={bw} height={200 - y(r.compPerDay)} fill={hi ? RED : BLUE} rx={3} />
            <rect x={cx + 3} y={y(r.enfPerDay)} width={bw} height={200 - y(r.enfPerDay)} fill={AMBER} rx={3} opacity={0.85} />
            <text x={cx - bw / 2 - 3} y={y(r.compPerDay) - 6} textAnchor="middle" fontSize={14} fontWeight={700} fill={hi ? RED : BLUE}>
              {r.compPerDay}
            </text>
            <text x={cx + bw / 2 + 3} y={y(r.enfPerDay) - 6} textAnchor="middle" fontSize={14} fontWeight={700} fill={AMBER}>
              {r.enfPerDay}
            </text>
            <text x={cx} y={222} textAnchor="middle" fontSize={15} fill={INK} fontWeight={hi ? 700 : 400}>
              {r.k}
              {hi ? " 최다" : ""}
            </text>
          </g>
        )
      })}
      <g fontSize={13} fill={INK_DIM}>
        <rect x={x0} y={12} width={12} height={12} fill={BLUE} rx={2} />
        <text x={x0 + 17} y={22}>민원/일</text>
        <rect x={x0 + 95} y={12} width={12} height={12} fill={AMBER} rx={2} />
        <text x={x0 + 112} y={22}>과태료/일</text>
      </g>
    </svg>
  )
}

// 회귀 β — 그래프 Covariate 노드의 coefficient(|β| 내림차순). 꼬리표는 해석 결과라 id별로 붙인다
const BETA_NOTE: Record<string, string> = { "cov-unmanaged": "최강", "cov-alley": "역방향", "cov-arterial": "역방향" }

function BetaChart({ graph }: { graph: OntoGraph }) {
  const BETAS = regressionBetas(graph).map((b) => ({
    n: b.label.replace(/\s*수$/, ""), // "무관리 주거단위 수" → "무관리 주거단위" (음식점 수는 그대로)
    v: b.beta,
    // p ≥ 0.05면 우연 범위 — "비유의"
    note: BETA_NOTE[b.id] ?? (b.p >= 0.05 ? "비유의" : ""),
    invalid: b.p >= 0.05,
  }))
  const cx = W / 2 + 30
  const scale = 380 // px per β 1.0
  const rowH = 40
  const h = 24 + BETAS.length * rowH + 28 // 변수 수에 맞춰 늘어난다(13개면 고정 높이를 넘친다)
  return (
    <svg viewBox={`0 0 ${W} ${h}`} className="h-auto w-full">
      <line x1={cx} y1={16} x2={cx} y2={16 + BETAS.length * rowH} stroke="#cbd5e1" />
      {BETAS.map((b, i) => {
        const yy = 24 + i * rowH
        const w = Math.abs(b.v) * scale
        const color = b.invalid ? GRAY : b.v > 0 ? GREEN : BLUE
        return (
          <g key={b.n}>
            <rect x={b.v > 0 ? cx : cx - w} y={yy} width={Math.max(w, 2)} height={20} fill={color} rx={3} />
            <text x={b.v > 0 ? cx - 8 : cx + 8} y={yy + 15} textAnchor={b.v > 0 ? "end" : "start"} fontSize={14} fill={INK}>
              {b.n}
            </text>
            <text
              x={b.v > 0 ? cx + w + 6 : cx - w - 6}
              y={yy + 15}
              textAnchor={b.v > 0 ? "start" : "end"}
              fontSize={14}
              fontWeight={700}
              fill={color}
            >
              {b.v > 0 ? "+" : ""}
              {b.v}
              {b.note ? ` (${b.note})` : ""}
            </text>
          </g>
        )
      })}
      <text x={cx} y={h - 8} textAnchor="middle" fontSize={13} fill={INK_DIM}>
        0 기준 오른쪽(+) = 많을수록 발생 증가 · 왼쪽(−) = 감소 방향 연관
      </text>
    </svg>
  )
}

// 초기값 −0.785는 철회된 분석의 기록(README)이라 그래프에 없다 — 정적. 재검증값은 판정 엣지에서 읽는다
function DidChart({ graph }: { graph: OntoGraph }) {
  const cy = 140
  const scale = 90 // px per 1.0
  const edge = graph.edges.find((e) => e.f === "lev-cctv-mobile" && e.rel === "lowers")
  const sym = Number(edge?.props?.did_symmetric ?? 0.221)
  const bars = [
    { n: "초기 분석(비대칭 설계)", v: -0.785, color: GRAY, note: "철회됨", retracted: true },
    { n: "재검증(대칭 설계)", v: sym, color: GREEN, note: `p${edge?.props?.p ?? ">0.5"} · 효과 없음`, retracted: false },
  ]
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full">
      <text x={W / 2} y={22} textAnchor="middle" fontSize={13} fill={INK_DIM}>
        비교 조건을 공정하게 다시 걸자 감소 효과가 사라졌습니다
      </text>
      <line x1={60} y1={cy} x2={W - 20} y2={cy} stroke="#cbd5e1" />
      <text x={50} y={cy + 5} textAnchor="end" fontSize={13} fill={INK_DIM}>0</text>
      {bars.map((b, i) => {
        const x = 120 + i * 230
        const h = Math.abs(b.v) * scale
        const yy = b.v < 0 ? cy : cy - h
        return (
          <g key={b.n}>
            {/* 이름은 상단 고정 — 막대·값과 절대 안 겹친다 */}
            <text x={x + 45} y={48} textAnchor="middle" fontSize={15} fill={INK} fontWeight={600}>
              {b.n}
            </text>
            <rect x={x} y={yy} width={90} height={h} fill={b.color} rx={4} />
            {b.retracted && (
              <line x1={x - 6} y1={yy + h + 6} x2={x + 96} y2={yy - 6} stroke={RED} strokeWidth={2.5} />
            )}
            {b.v < 0 ? (
              <text x={x + 45} y={yy + h + 24} textAnchor="middle" fontSize={15} fontWeight={700} fill={INK_DIM}>
                {b.v}건 <tspan fill={RED}>(철회됨)</tspan>
              </text>
            ) : (
              <g textAnchor="middle">
                <text x={x + 45} y={yy - 32} fontSize={13} fill={INK_DIM}>{b.note}</text>
                <text x={x + 45} y={yy - 12} fontSize={16} fontWeight={700} fill={b.color}>
                  +{b.v}건
                </text>
              </g>
            )}
          </g>
        )
      })}
    </svg>
  )
}

export default function QaChart({ kind, data, graph }: { kind: ChartKind; data: DumpingMapData; graph: OntoGraph | null }) {
  if ((kind === "beta" || kind === "did") && !graph) return null
  switch (kind) {
    case "yearly":
      return <YearlyChart data={data} />
    case "monthly":
      return <MonthlyChart data={data} />
    case "seasons":
      return <SeasonsChart data={data} />
    case "beta":
      return <BetaChart graph={graph!} />
    case "did":
      return <DidChart graph={graph!} />
  }
}
