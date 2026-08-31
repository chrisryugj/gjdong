"use client"

import { useRef, useState } from "react"
import type { DumpingMapData, VizAction } from "@/lib/dumping/types"
import QaChart, { CHART_TITLE, type ChartKind } from "./qa-chart"

// 첫 화면(홈) — 지도 앱처럼 검색이 기본. 상단 검색바에 뭐든 물어보면
// /api/dumping/ask 평문 스트리밍으로 답이 검색바 바로 아래 내려온다(최신순).
// 그 아래 "핵심 질의응답" 아코디언: 상위 3개는 펼쳐진 채 시작, 나머지는 눌러서 확장.
// 답이 미리 준비된 항목은 API 호출 없이 즉시 열리고, 지도 반영은 명시적 버튼으로만 한다.

interface Seed {
  q: string
  hint: string // 접힌 상태에서 보이는 한 줄 결론 — 훑어보기용
  answer: string // 미리 작성된 답(검증 수치 기반) — API 호출 없음
  viz?: VizAction
  vizNote?: string
  chart?: ChartKind
}

// 순서 = 관리자 독서 순서: 현황 판단 → 원인 → 액션. 앞 3개가 기본 펼침.
const SEEDS: Seed[] = [
  {
    q: "작년보다 나빠졌나?",
    hint: "숫자는 늘었지만 대부분 앱 신고 확산 효과",
    answer: `민원 숫자만 보면 늘었지만, 실제로 나빠졌다고 보기는 어렵습니다.

- 민원 접수: 2024년 998건, 2025년 1,069건, 2026년(1~8월) 1,395건
- 단속 실측인 과태료 부과는 2024년 1,578건에서 2025년 1,059건으로 오히려 줄었습니다

민원 증가분의 대부분은 스마트폰 앱 보급으로 신고가 쉬워진 효과입니다(앱 신고만 2.97배, 전화·직접 신고는 1.10배). 연도별 민원 건수로 성과를 평가하면 안 되는 이유입니다.`,
    chart: "yearly",
    viz: { mode: "comp" },
    vizNote: "지도를 민원 분포로 전환했습니다. 민원 수치는 신고 편향이 섞여 있음에 주의하세요.",
  },
  {
    q: "무단투기의 최강 예측변수는?",
    hint: "관리주체 없는 주거 밀도 (β +0.312)",
    answer: `관리주체 없는 주거단위 밀도입니다. 다가구·단독주택처럼 배출을 관리할 주체가 없는 주거가 몰린 곳일수록 발생이 많습니다(표준화 β +0.312, 이 요인이 많은 곳일수록 발생도 많다는 뜻. p<0.001로 우연이 아님).

반대로 아파트 등 공동주택 세대수는 발생과 무관했습니다(β -0.011, p=0.708). 같은 인구라도 관리사무소·공동 배출장이 있으면 발생이 늘지 않습니다. 무단투기는 시민의식보다 배출 관리 구조의 문제라는 뜻입니다.`,
    chart: "beta",
    viz: { mode: "unm" },
    vizNote: "지도를 무관리주거 밀도(β +0.312)로 전환했습니다.",
  },
  {
    q: "CCTV는 어디에 놓아야 하나?",
    hint: "증설 근거는 철회 · 재배치는 합리적",
    answer: `CCTV를 늘려서 무단투기를 줄일 수 있다는 근거는 없습니다. 초기 분석의 감소 효과는 비교 방법 오류(평균회귀)로 확인되어 철회됐고, 공정하게 다시 잰 결과 효과가 확인되지 않았습니다(대칭 DID +0.221, p>0.5).

다만 발생이 전혀 없는 곳에 서 있는 카메라를 발생 이력이 많은 곳으로 옮기는 재배치는 예산 0원의 자원 배분 차원에서 합리적입니다. 지도에 표시된 재배치 후보 20곳(빨간 번호)이 발생 이력 순 후보이며, 오른쪽 목록에서 주소를 확인할 수 있습니다.`,
    chart: "did",
    viz: { mode: "enf", layers: ["cctvMobile"], candidates: true },
    vizNote:
      "지도에 이동식 CCTV 현 위치(보라 점)와 재배치 후보 20곳(빨간 번호)을 표시했습니다. 지도 오른쪽 목록에서 후보지 주소를 볼 수 있습니다.",
  },
  {
    q: "빠뜨린 대책은 없나?",
    hint: "사람을 겨냥하는 대책이 비어 있었다",
    answer: `있습니다. 사람을 겨냥하는 대책이 통째로 비어 있었습니다.

발생과 연관된 요인(청년 밀집, 외국인 비율, 1인세대)을 겨냥하는 개입수단이 지식그래프에 하나도 없다는 것이 기계적으로 드러났고, 이 공백에서 신규 대책 3건이 나왔습니다.

- 다국어 배출안내(화양동은 외국인 비율 19.4%)
- 전입·임대차 시점 배출안내(1인세대 진입 경로)
- 수거 시간대 조정(무예산)

주의: 네 요인은 같은 동네에 함께 몰려 있어 어느 하나를 원인으로 지목할 수는 없습니다.`,
    chart: "beta",
    viz: { mode: "unm" },
    vizNote: "지도를 무관리주거 밀도로 전환했습니다. 사람 겨냥 대책의 공백이 드러난 요인 축입니다.",
  },
  {
    q: "으슥한 골목에 많이 버리지 않나?",
    hint: "반대. 생활동선 위에서 발생한다",
    answer: `아닙니다. 데이터는 반대를 가리킵니다.

골목이 많은 격자일수록(β -0.222), 큰길에서 멀수록(β -0.139) 발생이 오히려 적었습니다. "사람 눈을 피해 으슥한 곳에 버린다"는 은폐 가설은 반증됐습니다.

무단투기는 숨어서 하는 행위가 아니라 생활동선 위, 배출 관리가 없는 곳에서 일어납니다. 단속이나 CCTV를 으슥한 곳 위주로 배치하는 논리는 데이터와 어긋납니다.`,
    chart: "beta",
    viz: { mode: "overlay" },
    vizNote: "지도를 원인+결과 겹쳐보기로 전환했습니다. 발생이 생활동선 위에 있는지 직접 확인해보세요.",
  },
  {
    q: "재활용정거장은 효과가 있었나?",
    hint: "지금 데이터로는 판정 불가",
    answer: `효과를 측정할 수 없었습니다. 재활용정거장은 2024년이 마지막 신규 설치라 제대로 비교할 대상(아직 설치 안 된 곳)이 없고, 철거 기록도 940곳 중 3곳뿐이라 전후 비교가 불가능합니다.

초기 계산에서 +0.642건(p=0.056)이라는 수치가 나왔지만 평균회귀 편향이 남아 있어 판정 불가로 처리했습니다. 효과가 없다는 뜻이 아니라, 지금 데이터로는 알 수 없다는 뜻입니다.`,
    viz: { mode: "comp", layers: ["recycling"] },
    vizNote: "지도에 재활용정거장(초록)을 민원 분포 위에 표시했습니다.",
  },
  {
    q: "청소차는 어디를 청소하나?",
    hint: "집중관리 10.6km · 일반 28.7km",
    answer: `청소차는 총 17대(물청소 5, 노면 7, 분진흡입 5)이고, 도로 등급별로 나눠 순회합니다.

- 집중관리도로 10.6km: 천호대로·아차산로. 겨울철 하루 4회 이상, 평상시 하루 1회
- 일반관리도로 28.7km: 능동로·자양로·동일로 등 14개 도로. 평상시 이틀에 1회 이상
- 폭염특보 시 물청소 추가, 월 1회 클린데이(15개 동 동시)

지도의 주황 굵은 선이 집중관리, 회색 선이 일반관리 노선입니다. 골목 단위의 세부 수거 경로(GPS)는 미확보라 격자 분석에는 반영되지 않았습니다.`,
    viz: { routes: true },
    vizNote:
      "지도에 청소차 관리노선을 표시했습니다. 주황 굵은 선=집중관리도로(천호대로·아차산로), 회색 선=일반관리도로 14개. 도로명 기준 표시입니다.",
  },
  {
    q: "계절이나 날씨에 따라 달라지나?",
    hint: "여름이 겨울의 2배",
    answer: `달라집니다. 여름과 더운 날에 뚜렷하게 많습니다.

- 계절별 일평균 민원: 여름 4.6건, 봄 4.09건, 가을 2.82건, 겨울 2.3건. 여름이 겨울의 2배입니다
- 더운 날(25도 이상)은 4.67건으로 가장 많고, 비 오는 날엔 단속 적발이 3.44건에서 2.98건으로 줄어듭니다(폭우 땐 2.48건)

주의: 민원은 발견·신고 시점, 과태료는 단속 적발 시점 기준이라 투기 행위 시각 그 자체는 아닙니다. 날씨가 원인이라기보다 야외 활동·신고·단속 여건이 함께 움직이는 연관으로 보는 것이 맞습니다.`,
    chart: "seasons",
  },
  {
    q: "작년과 올해 연도별 추이는?",
    hint: "민원은 늘고 단속은 줄었다",
    answer: `민원 접수는 늘고 있고, 단속(과태료)은 줄어드는 흐름입니다.

- 민원: 2024년 998건, 2025년 1,069건, 2026년(1~8월) 1,395건
- 과태료: 2024년 1,578건, 2025년 1,059건, 2026년(1~8월) 555건

2026년은 8개월 집계인데도 민원이 작년 연간치를 이미 넘었지만, 이 증가분의 대부분은 앱 신고 확산(앱만 2.97배) 때문입니다. 실제 발생에 가까운 과태료는 줄고 있어, 상황이 악화됐다고 단정할 수 없습니다. 월별 흐름은 차트를 참고하세요.`,
    chart: "monthly",
  },
]

const DEFAULT_OPEN = 3 // 앞 N개는 펼쳐진 채 시작

// 답변은 두괄식(첫 문장 = 결론)이라 첫 문장만 굵게 강조한다
function renderAnswer(text: string) {
  if (!text) return null
  const m = text.match(/^[^.\n]{5,120}[.]\s*/)
  if (!m) return text
  return (
    <>
      <b className="text-[var(--cp-text-strong)]">{m[0]}</b>
      {text.slice(m[0].length)}
    </>
  )
}

interface Exchange {
  q: string
  a: string
  pending?: boolean
}

interface QaChatProps {
  onAuthExpired: () => void
  onViz: (viz: VizAction) => void
  data: DumpingMapData | null
}

export default function QaChat({ onAuthExpired, onViz, data }: QaChatProps) {
  const [exchanges, setExchanges] = useState<Exchange[]>([]) // 직접 입력 질문만 (시간순 보관, 표시는 최신순)
  const [input, setInput] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [openSeeds, setOpenSeeds] = useState<Set<string>>(
    () => new Set(SEEDS.slice(0, DEFAULT_OPEN).map((s) => s.q)),
  )
  const [appliedSeed, setAppliedSeed] = useState<string | null>(null) // 지도에 반영 중인 항목
  const [bigChart, setBigChart] = useState<ChartKind | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const abortRef = useRef<AbortController | null>(null)

  const toggleSeed = (q: string) => {
    setOpenSeeds((prev) => {
      const next = new Set(prev)
      if (next.has(q)) next.delete(q)
      else next.add(q)
      return next
    })
  }

  const applySeedViz = (seed: Seed) => {
    if (!seed.viz) return
    onViz(seed.viz)
    setAppliedSeed(seed.q)
  }

  const askFree = async (question: string) => {
    const q = question.trim()
    if (!q || busy) return

    // 같은 질문을 다시 물으면 API 호출 없이 기존 답을 맨 위로 끌어올린다
    const cachedIdx = exchanges.findIndex((e) => e.q === q && !e.pending)
    if (cachedIdx >= 0) {
      setExchanges((xs) => {
        const next = xs.filter((_, i) => i !== cachedIdx)
        next.push(xs[cachedIdx])
        return next
      })
      setInput("")
      scrollRef.current?.scrollTo({ top: 0, behavior: "smooth" })
      return
    }

    setError(null)
    setInput("")
    setBusy(true)
    const history = exchanges
      .flatMap((e) => [
        { role: "user" as const, text: e.q },
        { role: "model" as const, text: e.a },
      ])
      .slice(-8)
    setExchanges((xs) => [...xs, { q, a: "", pending: true }])
    scrollRef.current?.scrollTo({ top: 0 })
    const controller = new AbortController()
    abortRef.current = controller
    try {
      const res = await fetch("/api/dumping/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q, history }),
        signal: controller.signal,
      })
      if (res.status === 401) {
        onAuthExpired()
        return
      }
      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => null)
        throw new Error(data?.error ?? "답변 생성에 실패했습니다")
      }
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        const chunk = decoder.decode(value, { stream: true })
        setExchanges((xs) => {
          const next = [...xs]
          const last = next[next.length - 1]
          next[next.length - 1] = { ...last, a: last.a + chunk }
          return next
        })
      }
      setExchanges((xs) => {
        const next = [...xs]
        const last = next[next.length - 1]
        next[next.length - 1] = { ...last, a: last.a || "(빈 응답)", pending: false }
        return next
      })
    } catch (e) {
      if (!(e instanceof DOMException && e.name === "AbortError")) {
        setError(e instanceof Error ? e.message : "오류가 발생했습니다")
        setExchanges((xs) => (xs[xs.length - 1]?.pending ? xs.slice(0, -1) : xs))
      } else {
        // 중단: 받은 데까지 확정
        setExchanges((xs) => {
          const next = [...xs]
          const last = next[next.length - 1]
          if (last?.pending) next[next.length - 1] = { ...last, a: last.a || "(중단됨)", pending: false }
          return next
        })
      }
    } finally {
      setBusy(false)
      abortRef.current = null
    }
  }

  const results = [...exchanges].reverse() // 검색 결과처럼 최신 답이 맨 위

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* 검색바 — 지도 앱처럼 이곳이 시작점 */}
      <form
        onSubmit={(e) => {
          e.preventDefault()
          void askFree(input)
        }}
        className="shrink-0 border-b border-[var(--cp-border)] p-2.5"
      >
        <div className="flex items-center gap-1.5 rounded-full border border-[var(--cp-border)] bg-[var(--cp-panel)] py-1 pl-4 pr-1 shadow-sm transition-colors focus-within:border-[#0c6155]">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="무단투기에 대해 무엇이든 물어보세요"
            maxLength={500}
            className="min-w-0 flex-1 bg-transparent py-1.5 text-[15.5px] text-[var(--cp-text)] placeholder:text-[var(--cp-text-faint)] focus:outline-none"
          />
          {busy ? (
            <button
              type="button"
              onClick={() => abortRef.current?.abort()}
              className="shrink-0 rounded-full border border-[var(--cp-border)] px-3 py-1.5 text-[13.5px] text-[var(--cp-text-muted)] hover:bg-[var(--cp-hover)]"
            >
              중단
            </button>
          ) : (
            <button
              type="submit"
              disabled={!input.trim()}
              aria-label="질문하기"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#0c6155] text-white disabled:opacity-35"
            >
              <svg viewBox="0 0 20 20" className="h-[17px] w-[17px]" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="8.5" cy="8.5" r="5.5" />
                <path d="m13 13 4 4" strokeLinecap="round" />
              </svg>
            </button>
          )}
        </div>
        <p className="mt-1.5 px-2 text-[12.5px] leading-snug text-[var(--cp-text-faint)]">
          AI가 이 분석의 지식그래프와 수치만 근거로 답합니다. 아래 핵심 질문은 검증된 수치로 미리 준비된 답입니다.
        </p>
      </form>

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto p-3">
        {error && (
          <p className="mb-2 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-[14px] text-red-600">
            {error}
          </p>
        )}

        {/* 직접 질문 결과 — 검색바 바로 아래, 최신순 */}
        {results.length > 0 && (
          <section className="mb-4 flex flex-col gap-2">
            <h3 className="text-sm font-semibold tracking-wide text-[var(--cp-text-dim)]">내가 물어본 것</h3>
            {results.map((ex) => (
              <div key={ex.q} className="rounded-xl border border-[var(--cp-border)] bg-[var(--cp-panel)] p-3">
                <p className="mb-1.5 flex items-start gap-1.5 text-[15px] font-semibold leading-snug text-[var(--cp-text-strong)]">
                  <span className="mt-0.5 shrink-0 rounded bg-[#0c6155]/10 px-1.5 py-0.5 text-[11px] font-bold text-[#0c6155]">Q</span>
                  {ex.q}
                </p>
                <div className="whitespace-pre-wrap text-[15px] leading-relaxed text-[var(--cp-text)]">
                  {renderAnswer(ex.a) || (ex.pending ? "생각 중…" : "")}
                </div>
              </div>
            ))}
          </section>
        )}

        {/* 핵심 질의응답 아코디언 — 상위 3개 펼침, 나머지 접힘 */}
        <section>
          <h3 className="mb-2 text-sm font-semibold tracking-wide text-[var(--cp-text-dim)]">
            핵심 질의응답 {SEEDS.length} · 누르면 펼쳐집니다
          </h3>
          <div className="flex flex-col gap-1.5">
            {SEEDS.map((s) => {
              const open = openSeeds.has(s.q)
              const onMap = appliedSeed === s.q
              return (
                <div
                  key={s.q}
                  className={`overflow-hidden rounded-xl border transition-colors ${
                    open ? "border-[var(--cp-border-active)] bg-[var(--cp-panel)]" : "border-[var(--cp-border)] bg-[var(--cp-panel)]"
                  }`}
                >
                  <button
                    onClick={() => toggleSeed(s.q)}
                    aria-expanded={open}
                    className="flex w-full items-center gap-2 px-3 py-2.5 text-left hover:bg-[var(--cp-hover)]"
                  >
                    <span
                      className={`shrink-0 text-[11px] text-[var(--cp-text-dim)] transition-transform ${open ? "rotate-90" : ""}`}
                    >
                      ▶
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[15px] font-semibold leading-snug text-[var(--cp-text-strong)]">
                        {s.q}
                      </span>
                      {!open && (
                        <span className="block truncate text-[13px] text-[var(--cp-text-dim)]">{s.hint}</span>
                      )}
                    </span>
                    {onMap && (
                      <span className="shrink-0 rounded bg-[#0c6155] px-1.5 py-0.5 text-[11px] font-semibold text-white">
                        지도 반영 중
                      </span>
                    )}
                  </button>
                  {open && (
                    <div className="flex flex-col gap-2 border-t border-[var(--cp-border-faint)] px-3 pb-3 pt-2.5">
                      <div className="whitespace-pre-wrap text-[14.5px] leading-relaxed text-[var(--cp-text)]">
                        {renderAnswer(s.answer)}
                      </div>
                      {s.chart && data && (
                        <button
                          onClick={() => setBigChart(s.chart!)}
                          title="누르면 크게 볼 수 있습니다"
                          className="rounded-xl border border-[var(--cp-border)] bg-white p-2.5 text-left transition-shadow hover:shadow-md"
                        >
                          <span className="mb-1 flex items-baseline justify-between">
                            <b className="text-[13px] text-[var(--cp-text-strong)]">{CHART_TITLE[s.chart]}</b>
                            <span className="text-[12px] text-[#0c6155]">크게 보기 +</span>
                          </span>
                          <QaChart kind={s.chart} data={data} />
                        </button>
                      )}
                      {s.viz && (
                        <>
                          <button
                            onClick={() => applySeedViz(s)}
                            disabled={onMap}
                            className={`rounded-lg py-2 text-[14px] font-semibold transition-colors ${
                              onMap
                                ? "bg-[#0c6155]/10 text-[#0c6155]"
                                : "bg-[#0c6155] text-white hover:bg-[#0a5449]"
                            }`}
                          >
                            {onMap ? "✓ 지도에 반영됨" : "지도에서 확인"}
                          </button>
                          {onMap && s.vizNote && (
                            <p className="rounded-lg border border-dashed border-[#0c6155]/40 bg-[#0c6155]/5 px-2.5 py-1.5 text-[13px] leading-snug text-[#0c6155]">
                              {s.vizNote}
                            </p>
                          )}
                        </>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
          <p className="mt-2 text-[12.5px] leading-relaxed text-[var(--cp-text-faint)]">
            준비된 답의 수치는 독립 검토를 거친 확정치입니다. 더 깊은 근거는 발견·데이터 탭에서 볼 수 있습니다.
          </p>
        </section>
      </div>

      {bigChart && data && (
        <div
          className="fixed inset-0 z-[2100] flex items-center justify-center bg-black/35 p-4 animate-in fade-in duration-150"
          onClick={() => setBigChart(null)}
        >
          <div
            className="w-full max-w-3xl rounded-2xl border border-[var(--cp-border)] bg-white p-5 shadow-2xl animate-in fade-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-[17px] font-bold text-[var(--cp-text-strong)]">{CHART_TITLE[bigChart]}</h3>
              <button
                onClick={() => setBigChart(null)}
                aria-label="닫기"
                className="flex h-9 w-9 items-center justify-center rounded-full border border-[var(--cp-border)] text-[16px] text-[var(--cp-text-muted)] hover:bg-[var(--cp-hover)]"
              >
                ✕
              </button>
            </div>
            <QaChart kind={bigChart} data={data} />
          </div>
        </div>
      )}
    </div>
  )
}
