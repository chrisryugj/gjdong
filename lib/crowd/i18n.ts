// 인파레이더 다국어 사전 barrel (ko·en·ja·zh) — 소비처는 이 파일만 import한다.
// 본문: i18n-core(언어·조회) · i18n-terms(용어 8종+캔드 문장) · i18n-spots(명소명) ·
//       i18n-ui-{ko,en,ja,zh}(UI 문자열) · i18n-meta(페이지 메타데이터)

export { LANGS, detectLang, isLang, type Lang } from "./i18n-core"
export {
  trAge,
  trAlert,
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
import { EN } from "./i18n-ui-en"
import { JA } from "./i18n-ui-ja"
import { ZH } from "./i18n-ui-zh"

export const UI: Record<Lang, UIStrings> = { ko: KO, en: EN, ja: JA, zh: ZH }

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
