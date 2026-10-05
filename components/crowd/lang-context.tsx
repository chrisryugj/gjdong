"use client"

import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react"
import {
  detectLang,
  isLang,
  LANGS,
  loadLang,
  trCategory,
  trLevel,
  trSpot,
  UI,
  type Lang,
  type UIStrings,
} from "@/lib/crowd/i18n"
import { crowdPath, DEFAULT_LANG, parseCrowdPathname, parseCrowdSlug } from "@/lib/crowd/crowd-url"
import { isCityId } from "@/lib/crowd/cities"

/**
 * 언어 전환을 주소에 싣는다 — /crowd 그대로면 영어 화면의 공유 링크가 한국어로 열렸다 (2026-10-05 리뷰).
 * 도시는 현재 경로에서, 나머지 쿼리(?spot= 등)는 보존하고 하위호환 ?lang=만 뺀다.
 * /crowd 변형 경로가 아니면(/gwangjin·/crowd/report) 손대지 않는다.
 */
function syncLangToUrl(lang: Lang) {
  const { pathname, search, hash } = window.location
  const segs = pathname.split("/").filter(Boolean)
  if (segs[0] !== "crowd" || (segs.length > 1 && !parseCrowdSlug(segs.slice(1)))) return
  const params = new URLSearchParams(search)
  params.delete("lang")
  // 옛 공유 링크(/crowd?city=busan)는 쿼리가 경로보다 우선 — 도시를 경로로 옮기고 ?city= 는 지운다
  const cityParam = params.get("city")
  const city = isCityId(cityParam) ? cityParam : parseCrowdPathname(pathname).city
  params.delete("city")
  const qs = params.toString()
  const path = crowdPath(lang, city)
  // history.state(crowdSpot·crowdMode)는 상세·상황실 뒤로가기 정책이 쓰므로 그대로 넘긴다
  window.history.replaceState(window.history.state, "", `${path}${qs ? `?${qs}` : ""}${hash}`)
}

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
  // 비한국어 사전은 동적 로드 — 상태는 로드가 끝난 뒤에 바꾼다(그 전엔 ko 화면 유지). 연타 시 마지막 요청만 반영
  const reqRef = useRef(0)
  const applyLang = (l: Lang, after?: () => void) => {
    const req = ++reqRef.current
    void loadLang(l)
      .then(() => {
        if (req !== reqRef.current) return
        setLangState(l)
        after?.()
      })
      .catch(() => {
        // 사전 청크를 못 받으면(오프라인 등) ko 화면 그대로 — 반쯤 번역된 화면보다 낫다
      })
  }

  useEffect(() => {
    const param = new URLSearchParams(window.location.search).get("lang")
    const fromPath = parseCrowdPathname(window.location.pathname).lang
    const explicit = isLang(param) ? param : fromPath !== DEFAULT_LANG ? fromPath : null
    if (explicit) {
      localStorage.setItem("crowdLang", explicit)
      applyLang(explicit)
      return
    }
    const stored = localStorage.getItem("crowdLang")
    applyLang(isLang(stored) ? stored : detectLang())
    // 마운트 1회 확정 (applyLang은 ref만 만지므로 의존성 없음)
  }, [])

  // 언어 반영: lang 속성 동기화. 탭 제목은 도시를 아는 대시보드가 맡는다 — 여기서 쓰면 부모 effect가
  // 나중에 돌아 부산 탭 제목을 "Seoul Crowd Radar — 121 hotspots"로 덮었다(2026-10-05 실측)
  useEffect(() => {
    document.documentElement.lang = lang === "zh" ? "zh-CN" : lang
  }, [lang])

  const setLang = (l: Lang) => {
    localStorage.setItem("crowdLang", l)
    applyLang(l, () => syncLangToUrl(l))
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
