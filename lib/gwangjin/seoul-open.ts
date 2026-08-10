// 서울 열린데이터광장 공통 헬퍼 (서버 전용)
// 데이터 계약 실측(2026-08-10, 샘플키):
//  - 베이스 http://openapi.seoul.go.kr:8088/{KEY}/json/{SERVICE}/{start}/{end}/{...위치인자}
//  - 정상 응답: { [SERVICE]: { list_total_count, RESULT: {CODE:"INFO-000"}, row: [...] } }
//  - 데이터 없음: 최상위 { RESULT: { CODE: "INFO-200" } } — 서비스 래퍼 없이 온다
//  - citydata_cmrcl 만 예외 구조: { list_total_count, LIVE_CMRCL_STTS: {...} } (row 아님)
// 인증키는 SEOUL_OPEN_KEY 하나로 전 서비스 공용 (미설정 → null 반환, 라우트가 needKey로 강등)

export const seoulKey = () => process.env.SEOUL_OPEN_KEY ?? ""

interface SeoulEnvelope {
  list_total_count?: number | string
  RESULT?: { CODE?: string; MESSAGE?: string }
  row?: unknown[]
}

/** 서비스 호출 → row 배열. 키 없음·INFO-200·비정상은 전부 null/빈배열로 수렴.
 *  ⚠️래퍼 키 ≠ 서비스명인 API가 있다(실측: tbCycleStationInfo→stationInfo, bikeList→rentBikeStatus)
 *  — 서비스명 키가 없으면 row 배열을 가진 첫 객체 값으로 폴백한다. */
export async function seoulRows(service: string, rest: string, revalidate = 60): Promise<unknown[] | null> {
  const key = seoulKey()
  if (!key) return null
  const url = `http://openapi.seoul.go.kr:8088/${key}/json/${service}/${rest}`
  try {
    const raw = await fetch(url, { next: { revalidate } }).then((r) => (r.ok ? r.json() : null))
    if (!raw || typeof raw !== "object") return []
    let env = (raw as Record<string, unknown>)[service] as SeoulEnvelope | undefined
    if (!env) {
      env = Object.values(raw as Record<string, unknown>).find(
        (v): v is SeoulEnvelope => typeof v === "object" && v !== null && Array.isArray((v as SeoulEnvelope).row),
      )
    }
    if (!env) return [] // INFO-200(데이터 없음) 등 래퍼 없는 응답
    return Array.isArray(env.row) ? env.row : []
  } catch {
    return []
  }
}

/** KST 현재 시각 부품 — 서버가 어느 TZ든 한국 기준으로 계산한다 */
export function kstNow(): { date: string; day: number; hhmm: number } {
  const kst = new Date(Date.now() + 9 * 3600_000)
  const date = kst.toISOString().slice(0, 10).replace(/-/g, "")
  return { date, day: kst.getUTCDay(), hhmm: kst.getUTCHours() * 100 + kst.getUTCMinutes() }
}
