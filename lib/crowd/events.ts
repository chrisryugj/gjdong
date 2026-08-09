// TourAPI 축제·행사 (서버 전용) — 진행 중 + 2주 내 예정 행사 (제주·부산·강원)
// ── 데이터 계약 실측 (2026-08-09)
// 원천: apis.data.go.kr/B551011/KorService2/searchFestival2 (data.go.kr 활용신청 필요)
//   ⚠️구 areaCode 파라미터는 KorService2에서 조용히 0건 — 법정동 시도코드 lDongRegnCd가 정답
//     (서울11·부산26·인천28·제주50·강원51, 라이브 실측으로 확정).
//   ⚠️응답 문자열에 제어문자(개행 등)가 그대로 실려 표준 JSON.parse가 던진다 — 텍스트로 받아
//     [\x00-\x1F]를 공백 치환 후 파싱해야 한다 (response.json() 금지).
//   eventStartDate는 "시작일 기준" 검색이라 진행 중 장기 행사를 잡으려면 과거로 넉넉히(120일)
//   잡고 코드에서 기간 필터를 다시 건다. mapx=경도·mapy=위도 (WGS84). 날짜는 "20260801" 8자리.
// 지점 매칭은 클라이언트 몫 — 서버가 어댑터 fetchSpots를 다시 부르면 제주 원천 보호(15분
// 캐시·콜 수 제한)를 우회해 원천을 때리게 된다. 여기는 TourAPI 스냅샷(6시간)만 담당한다.

import { createSnapshot } from "@/lib/crowd/adapter-kit"
import type { CityId } from "@/lib/crowd/cities"

export interface TourEvent {
  title: string
  place: string // addr1 — 도로명 주소
  start: string // "2026-08-01"
  end: string
  lat: number
  lng: number
  image: string
}

/** 법정동 시도코드 (lDongRegnCd) — 구 areaCode(1·2·6·32·39)는 KorService2에서 무시된다 */
const AREA_CODE: Partial<Record<CityId, string>> = {
  seoul: "11",
  incheon: "28",
  busan: "26",
  gangwon: "51",
  jeju: "50",
}

function ymd(date: Date): string {
  return date.toISOString().slice(0, 10).replace(/-/g, "")
}

function dashed(ymd8: string): string {
  return ymd8.length === 8 ? `${ymd8.slice(0, 4)}-${ymd8.slice(4, 6)}-${ymd8.slice(6, 8)}` : ymd8
}

interface RawFestival {
  title?: string
  addr1?: string
  eventstartdate?: string
  eventenddate?: string
  mapx?: string
  mapy?: string
  firstimage?: string
}

/** 진행 중(오늘 포함) 또는 14일 내 시작 예정만 — 종료·먼 미래는 버린다 */
export function parseFestivals(items: unknown, todayYmd: string): TourEvent[] {
  const horizon = ymd(new Date(Date.parse(`${dashed(todayYmd)}T00:00:00Z`) + 14 * 86400_000))
  return (Array.isArray(items) ? items : [])
    .map((it) => it as RawFestival)
    .filter((it) => {
      const start = it.eventstartdate ?? ""
      const end = it.eventenddate ?? ""
      return start.length === 8 && end.length === 8 && start <= horizon && end >= todayYmd
    })
    .map((it) => ({
      title: (it.title ?? "").trim(),
      place: (it.addr1 ?? "").trim(),
      start: dashed(it.eventstartdate ?? ""),
      end: dashed(it.eventenddate ?? ""),
      lat: Number.parseFloat(it.mapy ?? "") || 0,
      lng: Number.parseFloat(it.mapx ?? "") || 0,
      image: it.firstimage ?? "",
    }))
    .filter((e) => e.title)
    .sort((a, b) => (a.start < b.start ? -1 : 1))
    .slice(0, 60)
}

const eventCache = new Map<CityId, { get(): Promise<TourEvent[]> }>()

/** 도시의 축제·행사 — 6시간 스냅샷. 키 미승인·장애는 빈 배열 */
export function fetchTourEvents(city: CityId): Promise<TourEvent[]> {
  const area = AREA_CODE[city]
  if (!area) return Promise.resolve([])
  let snap = eventCache.get(city)
  if (!snap) {
    snap = createSnapshot(6 * 3600_000, async () => {
      const kstNow = new Date(Date.now() + 9 * 3600 * 1000)
      const lookback = ymd(new Date(kstNow.getTime() - 120 * 86400_000))
      const url =
        `https://apis.data.go.kr/B551011/KorService2/searchFestival2` +
        `?serviceKey=${process.env.DATA_GO_KR_KEY ?? ""}&MobileOS=ETC&MobileApp=gjdong&_type=json` +
        `&numOfRows=300&pageNo=1&arrange=A&lDongRegnCd=${area}&eventStartDate=${lookback}`
      const text = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(12000) }).then((r) =>
        r.ok ? r.text() : "",
      )
      // 원천이 문자열 안에 날 제어문자를 실어 보낸다 — 표준 JSON.parse가 던지므로 공백 치환 후 파싱
      let raw: { response?: { header?: { resultCode?: string }; body?: { items?: { item?: unknown } | "" } } } | null
      try {
        // eslint-disable-next-line no-control-regex
        raw = JSON.parse(text.replace(/[\u0000-\u001f]/g, " "))
      } catch {
        raw = null
      }
      // TourAPI 정상 코드는 "0000" — 키 미승인 응답은 XML(OpenAPI_ServiceResponse)이라 파싱 실패로도 걸러진다
      if (raw?.response?.header?.resultCode !== "0000") throw new Error("tourapi unavailable")
      // 0건이면 items가 객체가 아니라 빈 문자열로 온다 (실측)
      const items = raw.response.body?.items
      return parseFestivals(typeof items === "object" && items != null ? items.item : [], ymd(kstNow))
    })
    eventCache.set(city, snap)
  }
  return snap.get().catch(() => [])
}
