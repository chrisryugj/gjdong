"use client"

import type { DumpingMapData } from "@/lib/dumping/types"

// 핵심 발견 — gwangjin-dumping/README.md 확정 수치의 요약 사본 (SSOT는 README·ontology.db)
const FINDINGS = [
  {
    tag: "최강 예측변수",
    title: "관리주체 없는 주거단위 밀도",
    body: "표준화 β +0.312, p<0.001 (n=1,062). OLS·HC3·군집·음이항 네 모형 모두 유의. 다가구 등 배출을 관리할 주체가 없는 주거가 몰린 곳에서 발생이 많다.",
    accent: true,
  },
  {
    tag: "무효 변수",
    title: "공동주택 세대수는 발생과 무관",
    body: "β −0.011, p=0.708 — 네 모형 모두 무효. 같은 인구라도 아파트면 발생이 늘지 않는다. 무단투기는 시민의식이 아니라 관리주체 부재의 함수다.",
  },
  {
    tag: "가설 반증",
    title: "“으슥한 곳에 버린다”는 틀렸다",
    body: "골목 비율 β −0.222, 간선 이격거리 β −0.139 — 둘 다 음수(역방향). 은폐 가설은 반증됐다. 오히려 생활동선 가까이에서 발생한다.",
  },
  {
    tag: "착시 해명",
    title: "민원 2.10배 증가는 신고 편향",
    body: "앱 신고 2.97배 vs 120·직접 신고 1.10배. 증가분 대부분이 앱 보급에 따른 신고 편의성 효과이며 발생 증가가 아니다.",
  },
  {
    tag: "주장 철회",
    title: "이동식 CCTV 효과 확인 안 됨",
    body: "초기 분석의 감소 효과(−0.785)는 평균회귀 오염으로 철회. 대칭 설계 DID +0.221(p>0.5), 이벤트 스터디(처치 77·대조 667) 전 시점 비유의. 재배치 권고는 자원 배분 논리로만 유지된다.",
  },
  {
    tag: "빈칸 발견",
    title: "사람을 겨냥하는 대책이 비어 있다",
    body: "청년·외국인·1인세대 요인을 겨냥하는 개입수단이 온톨로지에 없다 — 이 공백 질의가 새 대책 세 가지를 만들어냈다. 단, 네 요인은 상관 0.85~0.97로 얽혀 개별 효과 분리는 불가.",
  },
]

interface FindingsPanelProps {
  data: DumpingMapData | null
  selectedDong: string | null
  onSelectDong: (dong: string | null) => void
}

export default function FindingsPanel({ data, selectedDong, onSelectDong }: FindingsPanelProps) {
  const dongs = data ? [...data.dong].sort((a, b) => b.cr - a.cr) : []
  const maxCr = dongs.length ? dongs[0].cr : 1
  const sel = data?.dong.find((d) => d.d === selectedDong) ?? null
  const ts = sel ? (data?.ts[sel.d] ?? []) : []
  const tsClean = ts.filter((v): v is number => v != null)

  return (
    <div className="flex flex-col gap-4 p-3">
      {/* 동별 랭킹 */}
      <section>
        <h3 className="mb-2 text-xs font-semibold tracking-wide text-[var(--cp-text-dim)]">
          동별 민원 (천명당 · 2024.1~2026.8)
        </h3>
        <div className="flex flex-col gap-1">
          {dongs.map((d) => {
            const on = d.d === selectedDong
            return (
              <button
                key={d.d}
                onClick={() => onSelectDong(on ? null : d.d)}
                className={`flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-left transition-colors ${
                  on
                    ? "border-[var(--cp-border-active)] bg-[var(--cp-hover2)]"
                    : "border-transparent hover:bg-[var(--cp-hover)]"
                }`}
              >
                <span className="w-16 shrink-0 text-[13px] font-medium text-[var(--cp-text)]">{d.d}</span>
                <span className="relative h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-[var(--cp-track,rgba(148,163,184,.15))]">
                  <i
                    className="absolute inset-y-0 left-0 rounded-full bg-[#39a189]"
                    style={{ width: `${(d.cr / maxCr) * 100}%` }}
                  />
                </span>
                <span className="w-10 shrink-0 text-right font-mono text-[12px] text-[var(--cp-text-muted)]">
                  {d.cr.toFixed(1)}
                </span>
              </button>
            )
          })}
        </div>

        {sel && (
          <div className="mt-2 rounded-xl border border-[var(--cp-border)] bg-[var(--cp-panel)] p-3">
            <div className="mb-2 flex items-baseline justify-between">
              <h4 className="text-sm font-semibold text-[var(--cp-text-strong)]">{sel.d}</h4>
              <button
                onClick={() => onSelectDong(null)}
                className="text-[11px] text-[var(--cp-text-dim)] hover:text-[var(--cp-text)]"
              >
                선택 해제
              </button>
            </div>
            <dl className="grid grid-cols-3 gap-x-2 gap-y-2 text-center">
              {[
                { k: "민원", v: sel.cr.toFixed(1), u: `천명당 · ${sel.comp}건` },
                { k: "과태료", v: sel.er.toFixed(1), u: `천명당 · ${sel.enf}건` },
                { k: "무관리주거", v: `${sel.unm}%`, u: `다가구 ${sel.mf.toLocaleString()}가구` },
                { k: "1인세대", v: `${sel.one}%`, u: `${sel.hh.toLocaleString()}세대 중` },
                { k: "청년 20-34", v: `${sel.yth}%`, u: "2025년" },
                { k: "외국인", v: `${sel.frn}%`, u: "2025년" },
              ].map((f) => (
                <div key={f.k}>
                  <dt className="text-[10px] text-[var(--cp-text-dim)]">{f.k}</dt>
                  <dd className="font-mono text-[15px] font-semibold text-[var(--cp-text-strong)]">{f.v}</dd>
                  <dd className="text-[10px] text-[var(--cp-text-faint)]">{f.u}</dd>
                </div>
              ))}
            </dl>
            {tsClean.length >= 2 && (
              <div className="mt-3">
                <p className="mb-1 text-[10px] text-[var(--cp-text-dim)]">
                  청년 20-34세 추이 2015→2025 ({tsClean[0]}% → {tsClean[tsClean.length - 1]}%)
                </p>
                <svg viewBox="0 0 200 36" className="h-9 w-full">
                  <polyline
                    fill="none"
                    stroke="#39a189"
                    strokeWidth="1.6"
                    points={tsClean
                      .map((v, i) => {
                        const lo = Math.min(...tsClean)
                        const hi = Math.max(...tsClean)
                        const y = 32 - ((v - lo) / Math.max(hi - lo, 1)) * 28
                        return `${(i / (tsClean.length - 1)) * 196 + 2},${y}`
                      })
                      .join(" ")}
                  />
                </svg>
              </div>
            )}
          </div>
        )}
      </section>

      {/* 핵심 발견 */}
      <section>
        <h3 className="mb-2 text-xs font-semibold tracking-wide text-[var(--cp-text-dim)]">핵심 발견 6</h3>
        <div className="flex flex-col gap-2">
          {FINDINGS.map((f) => (
            <article
              key={f.title}
              className={`rounded-xl border p-3 ${
                f.accent
                  ? "border-[#39a189]/50 bg-[#39a189]/5"
                  : "border-[var(--cp-border)] bg-[var(--cp-panel)]"
              }`}
            >
              <span className="mb-1 inline-block rounded bg-[var(--cp-hover2)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--cp-text-muted)]">
                {f.tag}
              </span>
              <h4 className="text-[13px] font-semibold leading-snug text-[var(--cp-text-strong)]">{f.title}</h4>
              <p className="mt-1 text-[12px] leading-relaxed text-[var(--cp-text-muted)]">{f.body}</p>
            </article>
          ))}
        </div>
        <p className="mt-2 text-[11px] leading-relaxed text-[var(--cp-text-faint)]">
          회귀계수는 통제 후 조건부 연관이며 인과 증명이 아니다. 상세 방법론·검증은 저장소{" "}
          <span className="font-mono">gwangjin-dumping/docs</span> 참조.
        </p>
      </section>
    </div>
  )
}
