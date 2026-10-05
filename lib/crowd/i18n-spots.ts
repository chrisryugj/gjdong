// 명소명 외국어 표기 조회 — 표 본문(i18n-spots-data, 약 22KB)은 비한국어 전환 때만 동적으로 받는다.
// 한국어 화면은 표가 필요 없어 첫 번들에서 뺐다 (2026-10-05). API 요청 키는 항상 한국어 원문.

import { pick, type Lang } from "./i18n-core"

let SPOT_T: Record<string, [string, string, string]> | null = null

/** 명소명 표 로드 — 끝나기 전 trSpot은 한국어 원문을 돌려준다(언어 전환은 로드 후에 일어난다) */
export async function loadSpotNames(): Promise<void> {
  if (!SPOT_T) SPOT_T = (await import("./i18n-spots-data")).SPOT_T
}

export const trSpot = (name: string, lang: Lang) => (SPOT_T ? pick(SPOT_T, name, lang) : name)
