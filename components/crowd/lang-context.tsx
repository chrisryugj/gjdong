"use client"

import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react"
import {
  detectLang,
  isLang,
  LANGS,
  META,
  trCategory,
  trLevel,
  trSpot,
  UI,
  type Lang,
  type UIStrings,
} from "@/lib/crowd/i18n"
import { DEFAULT_LANG, parseCrowdPathname } from "@/lib/crowd/crowd-url"

interface LangContextValue {
  lang: Lang
  setLang: (l: Lang) => void
  t: UIStrings
  spot: (name: string) => string
  level: (lv: string) => string
  cat: (c: string) => string
}

const LangContext = createContext<LangContextValue | null>(null)

export function useLang(): LangContextValue {
  const ctx = useContext(LangContext)
  if (!ctx) throw new Error("useLang must be used within LangProvider")
  return ctx
}

export function LangProvider({ children }: { children: React.ReactNode }) {
  // SSR·첫 페인트는 ko — 마운트 후 ?lang= → 경로(/crowd/en) → 저장값 → 브라우저 언어 순으로 확정
  const [lang, setLangState] = useState<Lang>("ko")

  useEffect(() => {
    const param = new URLSearchParams(window.location.search).get("lang")
    const fromPath = parseCrowdPathname(window.location.pathname).lang
    const explicit = isLang(param) ? param : fromPath !== DEFAULT_LANG ? fromPath : null
    if (explicit) {
      setLangState(explicit)
      localStorage.setItem("crowdLang", explicit)
      return
    }
    const stored = localStorage.getItem("crowdLang")
    setLangState(isLang(stored) ? stored : detectLang())
  }, [])

  // 언어 반영: 문서 제목·lang 속성 동기화 (공유·탭 표시용)
  useEffect(() => {
    document.title = META[lang].title
    document.documentElement.lang = lang === "zh" ? "zh-CN" : lang
  }, [lang])

  const setLang = (l: Lang) => {
    setLangState(l)
    localStorage.setItem("crowdLang", l)
  }

  const value = useMemo<LangContextValue>(
    () => ({
      lang,
      setLang,
      t: UI[lang],
      spot: (name: string) => trSpot(name, lang),
      level: (lv: string) => trLevel(lv, lang),
      cat: (c: string) => trCategory(c, lang),
    }),
    [lang],
  )

  return <LangContext.Provider value={value}>{children}</LangContext.Provider>
}

/** 국기 드롭다운 언어 스위처 — 헤더용 */
export function LangSwitcher() {
  const { lang, setLang, t } = useLang()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent | TouchEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", onDown)
    document.addEventListener("touchstart", onDown)
    return () => {
      document.removeEventListener("mousedown", onDown)
      document.removeEventListener("touchstart", onDown)
    }
  }, [open])

  const current = LANGS.find((l) => l.code === lang) ?? LANGS[0]

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={t.langSwitch}
        title={t.langSwitch}
        className="flex items-center gap-1 rounded-md border border-[var(--cp-border)] px-1.5 py-1 text-[15px] leading-none transition-colors hover:border-[var(--cp-border-strong)] hover:bg-[var(--cp-hover)]"
      >
        <span aria-hidden>{current.flag}</span>
        <span className="text-[10px] text-[var(--cp-text-dim)]">▾</span>
      </button>
      {open && (
        <ul
          role="listbox"
          aria-label={t.langSwitch}
          className="absolute right-0 top-full z-[1100] mt-1 w-32 overflow-hidden rounded-md border border-[var(--cp-border-strong)] bg-[var(--cp-bg)] shadow-lg"
        >
          {LANGS.map((l) => (
            <li key={l.code}>
              <button
                role="option"
                aria-selected={l.code === lang}
                onClick={() => {
                  setLang(l.code)
                  setOpen(false)
                }}
                className={`flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] transition-colors hover:bg-[var(--cp-hover)] ${
                  l.code === lang
                    ? "font-semibold text-[var(--cp-text-strong)]"
                    : "text-[var(--cp-text-muted)]"
                }`}
              >
                <span aria-hidden>{l.flag}</span> {l.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
