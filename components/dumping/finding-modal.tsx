"use client"

import { useEffect } from "react"
import type { Finding } from "./findings-data"

// 핵심 발견 상세 모달 — 컴팩트한 카드형, 스크롤은 본문만, 통계 용어 쉬운 풀이 동봉

const STAT_HELP: [string, string][] = [
  ["β(베타)", "0보다 크면 이 조건이 큰 곳일수록 무단투기도 많다는 뜻입니다. 음수면 반대입니다."],
  ["p값", "이런 결과가 우연히 나올 확률입니다. 0.05보다 작으면 우연으로 보기 어렵습니다."],
  ["DID", "조치한 곳과 하지 않은 곳의 전후 변화를 견준 차이입니다. 0이면 효과가 없다는 뜻입니다."],
  ["상관 ρ", "두 값이 함께 움직이는 정도입니다. 1에 가까울수록 거의 붙어 다닙니다."],
]

function relevantHelp(finding: Finding): [string, string][] {
  const text = [...(finding.numbers?.map((n) => n.k) ?? []), finding.body].join(" ")
  return STAT_HELP.filter(([term]) =>
    term === "β(베타)" ? /β/.test(text) : term === "상관 ρ" ? /ρ/.test(text) : text.includes(term.replace(/\(.*\)/, "")),
  )
}

interface FindingModalProps {
  finding: Finding | null
  onClose: () => void
  onApplyViz: (finding: Finding) => void
}

export default function FindingModal({ finding, onClose, onApplyViz }: FindingModalProps) {
  useEffect(() => {
    if (!finding) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [finding, onClose])

  if (!finding) return null

  const helps = relevantHelp(finding)

  return (
    <div
      className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/35 p-4 animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        // --cp-panel은 라이트 테마에서 3% 틴트(비침) — 떠 있는 모달은 불투명 흰색이어야 한다
        className="flex max-h-[82dvh] w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-[var(--cp-border)] bg-white shadow-2xl animate-in fade-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 헤더 고정 */}
        <div className="flex items-start justify-between gap-3 border-b border-[var(--cp-border)] px-5 py-3.5">
          <div className="min-w-0">
            <span className="mb-1 inline-block rounded bg-[#0c6155]/10 px-2 py-0.5 text-[12px] font-semibold text-[#0c6155]">
              {finding.tag}
            </span>
            <h3 className="text-[19px] font-bold leading-snug text-[var(--cp-text-strong)]">
              {finding.title}
            </h3>
          </div>
          <button
            onClick={onClose}
            aria-label="닫기"
            className="mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[var(--cp-border)] text-[16px] text-[var(--cp-text-muted)] hover:bg-[var(--cp-hover)] hover:text-[var(--cp-text-strong)]"
          >
            ✕
          </button>
        </div>

        {/* 본문 스크롤 */}
        <div className="min-h-0 overflow-y-auto px-5 py-4">
          {/* 한 줄 결론 — 의사결정 포인트를 맨 위에 */}
          <p className="mb-4 rounded-lg bg-[#0c6155]/10 px-3 py-2.5 text-[15.5px] font-bold leading-snug text-[#0a4a41]">
            {finding.takeaway}
          </p>
          {finding.numbers && (
            <dl className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {finding.numbers.map((n) => (
                <div
                  key={n.k}
                  className="rounded-lg border border-[var(--cp-border-faint)] bg-[var(--cp-bg)] px-2.5 py-2"
                >
                  <dt className="text-[12px] text-[var(--cp-text-dim)]">{n.k}</dt>
                  <dd className="font-mono text-[15px] font-semibold text-[var(--cp-text-strong)]">{n.v}</dd>
                </div>
              ))}
            </dl>
          )}

          <div className="flex flex-col gap-3">
            {finding.detail.map((p, i) => {
              // "해석:"은 의사결정 포인트, "주의:"는 오독 방지 — 본문과 구분되게 하이라이트
              if (p.startsWith("해석:"))
                return (
                  <p key={i} className="rounded-lg bg-[#0c6155]/8 px-3 py-2 text-[15px] font-semibold leading-[1.7] text-[#0a4a41]">
                    {p}
                  </p>
                )
              if (p.startsWith("주의:"))
                return (
                  <p key={i} className="rounded-lg bg-[#a8322a]/8 px-3 py-2 text-[15px] font-semibold leading-[1.7] text-[#7c2620]">
                    {p}
                  </p>
                )
              return (
                <p key={i} className="text-[15px] leading-[1.7] text-[var(--cp-text)]">
                  {p}
                </p>
              )
            })}
          </div>

          {helps.length > 0 && (
            <div className="mt-4 rounded-lg border border-dashed border-[var(--cp-border)] px-3 py-2.5">
              <p className="mb-1 text-[12px] font-semibold text-[var(--cp-text-dim)]">쉬운 풀이</p>
              {helps.map(([term, desc]) => (
                <p key={term} className="text-[13.5px] leading-relaxed text-[var(--cp-text-muted)]">
                  <b className="text-[var(--cp-text)]">{term}</b> · {desc}
                </p>
              ))}
            </div>
          )}
        </div>

        {/* 푸터 고정 */}
        {finding.viz && (
          <div className="border-t border-[var(--cp-border)] px-5 py-3">
            <button
              onClick={() => onApplyViz(finding)}
              className="w-full rounded-lg bg-[#0c6155] py-2.5 text-[15px] font-semibold text-white hover:bg-[#0a5449]"
            >
              {finding.vizLabel ?? "지도에서 확인"}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
