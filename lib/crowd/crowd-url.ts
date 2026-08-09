// 인파레이더 URL 변형 — 언어·도시를 쿼리가 아니라 경로로 표현한다.
//
// 왜 경로인가: generateMetadata가 searchParams를 읽으면 라우트 전체가 동적이 되어
// 조회 1건당 함수 1회가 강제된다(CDN 캐시 불가). 2026-08 Fluid Active CPU 한도 75% 소진의
// 구조적 원인. 언어·도시는 값이 유한(4×5)하므로 경로로 올려 전부 프리렌더하면
// 조회당 함수 0회가 되고 소모가 트래픽과 무관해진다.
//
// 쿼리(?lang=·?city=)는 계속 읽는다 — 이미 배포된 공유 링크의 하위호환이며,
// 읽을 때 경로보다 우선한다.

import { isLang, type Lang } from "@/lib/crowd/i18n"
import { SWITCH_CITY_IDS, isCityId, type CityId } from "@/lib/crowd/cities"

export const DEFAULT_LANG: Lang = "ko"
export const DEFAULT_CITY: CityId = "seoul"

const NON_DEFAULT_LANGS: Lang[] = ["en", "ja", "zh"]
// gwangjin은 /gwangjin 전용 서피스 — /crowd 경로 변형을 만들지 않는다
const NON_DEFAULT_CITIES = SWITCH_CITY_IDS.filter((c) => c !== DEFAULT_CITY)

/** 경로 형태: /crowd · /crowd/{city} · /crowd/{lang} · /crowd/{lang}/{city} */
export function crowdPath(lang: Lang, city: CityId): string {
  const segs = [
    ...(lang === DEFAULT_LANG ? [] : [lang]),
    ...(city === DEFAULT_CITY ? [] : [city]),
  ]
  return segs.length ? `/crowd/${segs.join("/")}` : "/crowd"
}

/**
 * 캐치올 세그먼트 해석. 형태에 맞지 않으면 null — 호출부가 notFound()로 넘긴다.
 * 기본값(ko·seoul)만으로 이뤄진 중복 경로(/crowd/ko, /crowd/seoul)는 정경로가 /crowd이므로 거부.
 */
export function parseCrowdSlug(slug: string[] | undefined): { lang: Lang; city: CityId } | null {
  if (!slug || slug.length === 0 || slug.length > 2) return null
  const [first, second] = slug

  if (slug.length === 2) {
    if (!isLang(first) || first === DEFAULT_LANG) return null
    if (!isCityId(second) || second === DEFAULT_CITY) return null
    return { lang: first, city: second }
  }
  if (isLang(first)) return first === DEFAULT_LANG ? null : { lang: first, city: DEFAULT_CITY }
  if (isCityId(first)) return first === DEFAULT_CITY ? null : { lang: DEFAULT_LANG, city: first }
  return null
}

/** 프리렌더 대상 19개 — /crowd(정적 페이지)와 합쳐 20개 조합 전부가 CDN에서 나간다. */
export function crowdStaticSlugs(): Array<{ slug: string[] }> {
  const slugs: string[][] = [
    ...NON_DEFAULT_CITIES.map((c) => [c]),
    ...NON_DEFAULT_LANGS.map((l) => [l]),
    ...NON_DEFAULT_LANGS.flatMap((l) => NON_DEFAULT_CITIES.map((c) => [l, c])),
  ]
  return slugs.map((slug) => ({ slug }))
}

/** 브라우저에서 현재 경로가 가리키는 언어·도시 (쿼리는 호출부가 우선 적용) */
export function parseCrowdPathname(pathname: string): { lang: Lang; city: CityId } {
  const segs = pathname.split("/").filter(Boolean) // ["crowd", ...]
  return parseCrowdSlug(segs.slice(1)) ?? { lang: DEFAULT_LANG, city: DEFAULT_CITY }
}
