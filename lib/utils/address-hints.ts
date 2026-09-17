// 주소 변환 폴백용 순수 함수 모음 — 네트워크 없이 단위 테스트 가능.
// 2026-09-17 서울페이 가맹점 16,946건 실측에서 카카오 주소검색이 놓친 유형을 담는다:
//   · 구 오기("서울 성동구 광나루로 614"는 광진구 주소) → 구를 빼고 재시도
//   · 없는 건물번호(폐업·재개발 후 번호 소멸) → 같은 홀짝 인접번호로 추정
//   · 폐지 법정동(노유동·모진동)·행정동 직접 표기·법정동=행정동 1:1 동 → 실패해도 행정동 힌트는 살림
//   · 상호 키워드 폴백의 오매칭(다른 지점·다른 동) → 도로명/법정동/지점명 일치 결과만 채택
import type { KakaoKeywordDocument } from "@/lib/types"

// 주소에 적힌 동명 → 행정동. 광진구 기준: 화양동·능동·광장동·군자동은 법정동=행정동 1:1,
// 노유동(노유1·2동)은 2008년 자양4동에, 모진동은 화양동에 편입돼 카카오 주소검색에 없다.
const STATED_DONG_TO_ADMIN: Record<string, string> = {
  화양동: "화양동",
  능동: "능동",
  광장동: "광장동",
  군자동: "군자동",
  노유동: "자양4동",
  노유1동: "자양4동",
  노유2동: "자양4동",
  모진동: "화양동",
}

const STATED_DONG_PATTERN = /(?<![가-힣])(중곡[1-4]동|구의[1-3]동|자양[1-4]동|노유[12]?동|모진동|화양동|능동|광장동|군자동)(?![가-힣])/

/** 주소 문자열에 적힌 동명으로 알 수 있는 행정동. 중곡동·구의동·자양동처럼 분동된 법정동만 적힌 경우는 없음. */
export function statedAdminDong(address: string): string | undefined {
  const m = address.match(STATED_DONG_PATTERN)
  if (!m) return undefined
  return STATED_DONG_TO_ADMIN[m[1]] ?? m[1]
}

/** "서울 성동구 광나루로 614"처럼 구가 잘못 적힌 경우를 위해 구 토큰을 뺀 주소. 구가 없으면 null. */
export function withoutGu(address: string): string | null {
  const out = address.replace(/(?:^|\s)[가-힣]{1,4}구(?=\s)/, " ").replace(/\s+/g, " ").trim()
  return out === address.trim() ? null : out
}

const ROAD_NUMBER_PATTERN = /^(.*?(?:로|길))\s+(\d+)(?:-(\d+))?$/

/**
 * 도로명 건물번호가 없을 때 시도할 인접 번호 쿼리. 부번이 있으면 본번만, 이어서 같은 홀짝 ±2·±4.
 * 도로명주소는 홀짝으로 도로 양쪽이 갈리므로 반대 홀짝은 쓰지 않는다. 도로명+번호 형태가 아니면 [].
 */
export function neighborBuildingQueries(address: string): string[] {
  const m = address.trim().match(ROAD_NUMBER_PATTERN)
  if (!m) return []
  const road = m[1]
  const main = Number.parseInt(m[2], 10)
  const out: string[] = []
  if (m[3]) out.push(`${road} ${main}`)
  for (const delta of [2, -2, 4, -4]) {
    if (main + delta > 0) out.push(`${road} ${main + delta}`)
  }
  return out
}

const ROAD_TOKEN = /[가-힣A-Za-z0-9]+(?:로|길)\d*[가-힣]?(?:길)?(?![가-힣])/
const DONG_TOKEN = /[가-힣]+동(?:\d가)?(?![가-힣])/
const BRANCH_TOKEN = /(\S+?(?:점|지점|지사))(?=\s|$|\()/

/**
 * 키워드(상호) 검색 결과 중 질의와 맞는 것 하나. 질의에 도로명이 있으면 결과 도로명주소에 그 도로가,
 * 법정동이 있으면 결과 지번주소에 그 동이 있어야 하고, 질의에 지점명(…점)이 있으면 결과 상호에도 있어야 한다.
 * 질의에 도로명·동이 아예 없으면(시설명만 입력) 검사할 근거가 없으므로 checked=false로 돌려 호출자가 첫 결과를 그대로 쓴다.
 */
export function pickConsistentKeywordDoc(
  query: string,
  docs: KakaoKeywordDocument[],
): { doc?: KakaoKeywordDocument; checked: boolean } {
  const road = query.match(ROAD_TOKEN)?.[0]?.replace(/\s/g, "")
  const dong = query.match(DONG_TOKEN)?.[0]
  const branch = query.match(BRANCH_TOKEN)?.[1]
  if (!road && !dong) return { checked: false }
  const doc = docs.find((d) => {
    const roadOk = road ? d.road_address_name.replace(/\s/g, "").includes(road) : false
    const dongOk = dong ? d.address_name.includes(dong) : false
    const branchOk = branch ? d.place_name.replace(/\s/g, "").includes(branch) : true
    return (roadOk || dongOk) && branchOk
  })
  return { doc, checked: true }
}
