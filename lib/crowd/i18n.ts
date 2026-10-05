// 인파레이더 다국어 사전 barrel (ko·en·ja·zh) — 소비처는 이 파일만 import한다.
// 본문: i18n-core(언어·조회) · i18n-terms(용어 8종+캔드 문장) · i18n-spots(명소명) ·
//       i18n-ui-{ko,en,ja,zh}(UI 문자열) · i18n-meta(페이지 메타데이터)

export { LANGS, detectLang, isLang, type Lang } from "./i18n-core"
export {
  trAge,
  trAlert,
  trArrival,
  trArrStat,
  trBeach,
  trCategory,
  trDisaster,
  trHour,
  trLevel,
  trLevelMessages,
  trRange,
  trRoad,
  trRoadMsg,
} from "./i18n-terms"
export { trSpot } from "./i18n-spots"
export { trDistrict } from "./i18n-districts"
export { META } from "./i18n-meta"
export type { UIStrings } from "./i18n-ui-ko"

import type { Lang } from "./i18n-core"
import { SPOT_COUNTS, type CityId } from "./cities"
import { KO, type UIStrings } from "./i18n-ui-ko"
import { loadSpotNames } from "./i18n-spots"

/**
 * UI 사전 레지스트리 — ko만 정적이고 en·ja·zh는 loadLang()이 채운다. 채우기 전 자리는 ko 폴백.
 * 4개 언어 정적 import가 en/ja/zh UI+명소명 약 20KB(br)를 한국어 사용자 첫 번들에 실었다 (2026-10-05).
 * 언어 상태(LangProvider)는 로드가 끝난 뒤에 바뀌므로 UI[lang]을 동기로 읽는 소비처는 그대로 둔다.
 * 서버(generateMetadata)·테스트도 비한국어를 쓰기 전에 loadLang()을 await할 것.
 */
export const UI: Record<Lang, UIStrings> = { ko: KO, en: KO, ja: KO, zh: KO }

const UI_LOADERS: Record<Exclude<Lang, "ko">, () => Promise<UIStrings>> = {
  en: () => import("./i18n-ui-en").then((m) => m.EN),
  ja: () => import("./i18n-ui-ja").then((m) => m.JA),
  zh: () => import("./i18n-ui-zh").then((m) => m.ZH),
}
const loaded = new Set<Lang>(["ko"])

/** 언어 사전(UI 문자열 + 명소명) 로드 — 이미 받았으면 즉시 끝난다 */
export async function loadLang(lang: Lang): Promise<void> {
  if (loaded.has(lang)) return
  const [ui] = await Promise.all([UI_LOADERS[lang as Exclude<Lang, "ko">](), loadSpotNames()])
  UI[lang] = ui
  loaded.add(lang)
}

/**
 * 도시별 부제 — 원천이 달라 세는 대상도 다르다(인파/접근·주차/출국장 대기).
 * 헤더와 페이지 메타데이터가 같은 문장을 쓴다. n 생략 시 도시별 기대 개수.
 */
export function citySubtitle(t: UIStrings, city: CityId, n?: number): string {
  const fn: Record<CityId, (n: number) => string> = {
    seoul: t.subtitle,
    jeju: t.subtitleJeju,
    busan: t.subtitleBusan,
    gangwon: t.subtitleGangwon,
    incheon: t.subtitleIncheon,
    gwangjin: t.gwangjinSubtitle,
  }
  return fn[city](n && n > 0 ? n : SPOT_COUNTS[city])
}
