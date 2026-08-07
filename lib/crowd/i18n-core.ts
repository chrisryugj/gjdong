// 인파레이더 다국어 공통 코어 — 언어 타입·감지·사전 조회 헬퍼
// (사전 본문은 i18n-terms / i18n-spots / i18n-ui-* 형제 파일, 소비처는 barrel i18n.ts 사용)

export type Lang = "ko" | "en" | "ja" | "zh"

export const LANGS: Array<{ code: Lang; flag: string; label: string }> = [
  { code: "ko", flag: "🇰🇷", label: "한국어" },
  { code: "en", flag: "🇺🇸", label: "English" },
  { code: "ja", flag: "🇯🇵", label: "日本語" },
  { code: "zh", flag: "🇨🇳", label: "中文" },
]

export function isLang(v: string | null | undefined): v is Lang {
  return v === "ko" || v === "en" || v === "ja" || v === "zh"
}

/** 최초 방문: 브라우저 언어로 자동 감지 */
export function detectLang(): Lang {
  if (typeof navigator === "undefined") return "ko"
  const l = navigator.language.toLowerCase()
  if (l.startsWith("ko")) return "ko"
  if (l.startsWith("ja")) return "ja"
  if (l.startsWith("zh")) return "zh"
  return "en"
}

export const IDX: Record<Lang, 0 | 1 | 2> = { ko: 0, en: 0, ja: 1, zh: 2 }

export function pick(table: Record<string, [string, string, string]>, key: string, lang: Lang): string {
  if (lang === "ko") return key
  return table[key]?.[IDX[lang]] ?? key
}
