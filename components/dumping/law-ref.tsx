"use client"

import { useState } from "react"
import { LAW_ASOF, LAW_TEXTS, lawRefsIn } from "@/lib/dumping/law"

// 법령 인용 문구에 호버·포커스·탭으로 조문 원문을 띄운다. 원문은 lib/dumping/law.ts(법제처 실측)가 정본.
// 결재선이 "조례 9조"가 무슨 말인지 링크를 타지 않고 그 자리에서 읽게(12라운드)

export function LawRef({ keys, up = false, children }: { keys: string[]; up?: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  const items = keys.map((k) => LAW_TEXTS[k]).filter(Boolean)
  if (!items.length) return <>{children}</>
  return (
    <span className="relative inline-block" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        aria-expanded={open}
        className="cursor-help rounded-sm text-[var(--cp-text-strong)] underline decoration-[#0c6155]/60 decoration-dotted underline-offset-[3px] hover:decoration-solid"
      >
        {children}
      </button>
      {open && (
        <span
          role="tooltip"
          className={`absolute left-0 z-30 w-[26rem] max-w-[calc(100vw-3rem)] rounded-lg border border-[var(--cp-border)] bg-[var(--cp-panel)] p-3 text-left shadow-xl ${
            up ? "bottom-full mb-1.5" : "top-full mt-1.5"
          }`}
        >
          {items.map((p) => (
            <span key={p.title} className="mb-2.5 block last:mb-0">
              <b className="block text-[13.5px] font-bold leading-snug text-[var(--cp-text-strong)]">{p.title}</b>
              <span className="mt-1 block max-h-44 overflow-y-auto whitespace-pre-line text-[13px] leading-relaxed text-[var(--cp-text-muted)]">
                {p.text}
              </span>
              <a href={p.url} target="_blank" rel="noreferrer" className="mt-1 inline-block text-[12.5px] font-semibold text-[#0c6155] underline">
                국가법령정보센터에서 원문 보기
              </a>
            </span>
          ))}
          <span className="mt-2 block border-t border-[var(--cp-border)] pt-1.5 text-[11.5px] text-[var(--cp-text-faint)]">
            {LAW_ASOF} 법제처 API로 받은 현행 본문. 이후 개정 여부는 링크에서 확인
          </span>
        </span>
      )}
    </span>
  )
}

// 문장 안의 인용 문구만 LawRef로 감싼다
export function linkLawRefs(text: string, up = false): React.ReactNode {
  return lawRefsIn(text).map((part, i) =>
    typeof part === "string" ? (
      part
    ) : (
      <LawRef key={i} keys={part.keys} up={up}>
        {part.text}
      </LawRef>
    ),
  )
}
