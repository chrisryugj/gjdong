// MBTI 추천 — 시민 모드 재미요소. 순수 함수 (테스트 대상).
// ⚠ 등급 산출식(docs/crowd-methodology.md)과 무관한 오락 기능 — 상황실·보고서·CSV에는 싣지 않는다.
// 서울 카테고리 5종 × 현재 등급을 성향 축에 단순 매핑한 결정적 점수 — 근거를 주장하지 않는다.

import type { CrowdSpot } from "@/lib/crowd/seoul-rtd"

export const MBTI_TYPES = [
  "ISTJ", "ISFJ", "INFJ", "INTJ",
  "ISTP", "ISFP", "INFP", "INTP",
  "ESTP", "ESFP", "ENFP", "ENTP",
  "ESTJ", "ESFJ", "ENFJ", "ENTJ",
] as const
export type MbtiType = (typeof MBTI_TYPES)[number]

export function isMbti(v: string | null | undefined): v is MbtiType {
  return MBTI_TYPES.includes((v ?? "").toUpperCase() as MbtiType)
}

// 축별 카테고리 가중치 — 서울 카테고리: 관광특구·고궁·문화유산·인구밀집지역·발달상권·공원
const AXIS_CAT: Record<string, Record<string, number>> = {
  E: { 발달상권: 2, 관광특구: 2, 인구밀집지역: 1 },
  I: { 공원: 2, "고궁·문화유산": 2 },
  S: { 발달상권: 1, 관광특구: 1 },
  N: { "고궁·문화유산": 1, 공원: 1 },
  T: { "고궁·문화유산": 1, 인구밀집지역: 1 },
  F: { 공원: 1, 관광특구: 1 },
}

/** 유형별 추천 — 현재 인파 등급까지 반영해 상위 max곳. 동점은 이름순(결정적) */
export function recommendForMbti(spots: CrowdSpot[], type: string, max = 5): CrowdSpot[] {
  if (!isMbti(type)) return []
  const axes = type.toUpperCase().split("") // e.g. ["E","N","F","P"]
  const scored = spots
    .filter((s) => s.levelNum > 0) // 정보 없음 제외
    .map((s) => {
      let score = 0
      for (const axis of axes) score += AXIS_CAT[axis]?.[s.category] ?? 0
      // E=활기 선호 / I=한적 선호
      if (axes.includes("E") && s.levelNum >= 3) score += 1
      if (axes.includes("I")) score += s.levelNum <= 2 ? 2 : -2
      // J=예측 가능한 쾌적 / P=즉흥·현장 에너지
      if (axes.includes("J") && s.levelNum <= 2) score += 1
      if (axes.includes("P") && s.levelNum >= 3) score += 1
      return { s, score }
    })
    .sort((a, b) => b.score - a.score || a.s.name.localeCompare(b.s.name, "ko"))
  return scored.slice(0, max).map((x) => x.s)
}
