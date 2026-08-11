// 광진 공공서비스 예약 (서버 전용) — 서울시 공공서비스예약 체육·문화·교육 중 광진구 접수중분
// ── 데이터 계약 실측 (2026-08-11, 실키)
// ListPublicReservationSport 615행·Culture 918행·Education 373행 — 1000행 페이지 1콜씩.
//   광진구분: 체육 46(접수중 26 — 뚝섬한강공원 농구·배드민턴·족구·축구장 등)·문화 21(접수중 16 —
//   아차산 치유의숲, 구의아리수정수센터 견학 등)·교육 19(접수중 8 — 어린이대공원 동물학교 등).
// ⚠️위치인자 필터(소분류/상태/지역)는 실키에서도 무시된다(필터를 넣어도 전체가 온다) —
//   전량 페치 후 AREANM으로 거른다. 샘플키는 5행 상한에 더해 인자 무시 동일 응답까지 겹치니
//   이 서비스 검증은 실키로만.
// SVCSTATNM 실측 4종: 접수중|안내중|예약마감|접수종료. SVCNM에 HTML 엔티티(&lt; 실측) 섞임.
// RCPTENDDT "yyyy-MM-dd HH:mm:ss.f" — 날짜부만 쓴다. SVCURL = 예약 페이지 직링크.

import { seoulRows } from "@/lib/gwangjin/seoul-open"

export interface ReserveItem {
  /** 체육 | 문화 | 교육 */
  kind: string
  /** 소분류 (테니스장·산림여가 등) */
  cls: string
  name: string
  place: string
  /** 유료 | 무료 */
  payAt: string
  /** 접수 마감일 yyyy-MM-dd — 없으면 "" */
  rcptEnd: string
  url: string
}

const SERVICES: Array<{ service: string; kind: string }> = [
  { service: "ListPublicReservationSport", kind: "체육" },
  { service: "ListPublicReservationCulture", kind: "문화" },
  { service: "ListPublicReservationEducation", kind: "교육" },
]

const decodeEntities = (s: string) =>
  s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")

// 접수 상태는 시간 단위로 변하는 데이터가 아니다 — 30분 모듈 캐시로 3콜×1000행 파싱 상쇄
let cache: { at: number; data: ReserveItem[] } | null = null

export async function fetchReservations(): Promise<ReserveItem[] | null> {
  if (cache && Date.now() - cache.at < 1_800_000) return cache.data
  const per = await Promise.all(
    SERVICES.map(async ({ service, kind }) => {
      const rows: Array<Record<string, unknown>> = []
      // 실측 총량은 1000행 미만이나 성장 대비 2페이지까지 — 첫 페이지가 꽉 찼을 때만
      for (const start of [1, 1001]) {
        const page = (await seoulRows(service, `${start}/${start + 999}/`, 1800)) as
          | Array<Record<string, unknown>>
          | null
        if (page === null) return null
        rows.push(...page)
        if (page.length < 1000) break
      }
      return rows
        .filter((r) => String(r.AREANM ?? "").includes("광진") && r.SVCSTATNM === "접수중")
        .map((r) => ({
          kind,
          cls: String(r.MINCLASSNM ?? ""),
          name: decodeEntities(String(r.SVCNM ?? "")),
          place: decodeEntities(String(r.PLACENM ?? "")),
          payAt: String(r.PAYATNM ?? ""),
          rcptEnd: String(r.RCPTENDDT ?? "").slice(0, 10),
          url: String(r.SVCURL ?? ""),
        }))
    }),
  )
  if (per.every((p) => p === null)) return null
  // 마감 임박 순 — 연중 상시(연말 마감)는 자연히 뒤로 밀린다
  const data = per
    .filter((p): p is ReserveItem[] => p !== null)
    .flat()
    .sort((a, b) => (a.rcptEnd || "9999").localeCompare(b.rcptEnd || "9999"))
  if (data.length > 0) cache = { at: Date.now(), data }
  return data
}
