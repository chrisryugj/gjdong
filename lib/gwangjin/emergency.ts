// 응급의료 (서버 전용) — 광진구 응급실 실시간 가용병상 + 오늘 문여는 약국
// ── 데이터 계약 (2026-08-10 조사 — 포털 명세 기준, 실키 실호출 검증은 활용신청 후)
// 응급실: apis.data.go.kr/B552657/ErmctInfoInqireService/getEmrrmRltmUsefulSckbdInfoInqire
//   (국립중앙의료원 E-Gen · data.go.kr 15000563 활용신청 필요(자동승인) · XML 전용)
//   요청: STAGE1=서울특별시 & STAGE2=광진구 (둘 다 필수)
//   응답 필드(2026-08-10 실키 실측 — 광진구 2곳: 건국대학교병원·혜민병원):
//     hvec 응급실 일반병상, hvoc 수술실, hvicc 일반중환자, hvgc 입원실 — 숫자
//     ⚠️hv10 소아 인공호흡기·hv11 인큐베이터는 숫자가 아니라 "Y" 플래그 (없으면 태그 자체가 없음)
//     dutyName 기관명, dutyTel3 응급실 전화, hvidate 갱신시각(yyyyMMddHHmmss)
//     기관마다 오는 필드가 다르다(혜민 hvicc 있음, 건국대 없음) — 없는 필드는 null로 숨긴다
//   음수 병상수가 실데이터에 존재(초과 수용) — 그대로 노출하되 0 미만은 "포화"로 라벨.
// 약국: apis.data.go.kr/B552657/ErmctInsttInfoInqireService/getParmacyListInfoInqire
//   (15000576 별도 활용신청(자동승인) · XML · 같은 DATA_GO_KR_KEY)
//   요청: Q0=서울특별시 & Q1=광진구 & numOfRows=200 — QT(요일) 필터는 신뢰하지 않고
//   전 목록을 받아 dutyTime{1..8}s/c(월~일·공휴일 HHmm)를 서버에서 계산한다.
//   실시간 아님(신고 기반) — UI에 "전화 확인 후 방문" 문구 필수.
// AED: apis.data.go.kr/B552657/AEDInfoInqireService/getAedLcinfoInqire
//   (15000652 별도 활용신청(자동승인) · XML · 같은 키) — Q0/Q1 주소 문자열, 응답
//   org 설치기관·buildAddress 주소·buildPlace 상세위치·wgs84Lat/Lon·clerkTel.
//   ⚠️미검증(2026-08-11 활용신청 전 — SERVICE_KEY_IS_NOT_REGISTERED 실측): 신청 후
//   프로드에서 필드 실측 확인 필요. 미등록 응답은 <item> 없음 → 빈 배열로 수렴.

import { krgovFetch } from "@/lib/crowd/krgov-fetch"
import { kstNow } from "@/lib/gwangjin/seoul-open"

const KEY = () => process.env.DATA_GO_KR_KEY ?? ""
const BASE = "https://apis.data.go.kr/B552657"

export interface ErRoom {
  name: string
  tel: string
  /** 응급실 일반병상 (음수 = 포화 초과) */
  beds: number | null
  surgery: number | null
  icu: number | null
  ward: number | null
  /** 소아: 인공호흡기·인큐베이터 가용 여부가 하나라도 있으면 true */
  pediatric: boolean
  updatedAt: string
}

export interface Pharmacy {
  name: string
  addr: string
  tel: string
  /** 오늘 운영시간 "0900~1930" — 데이터 없으면 "" */
  hours: string
  /** 지금 영업 중 (KST 기준 서버 계산) */
  openNow: boolean
  /** 심야(22시 이후 마감) 약국 */
  lateNight: boolean
}

/** XML <item> 블록의 태그를 평면 객체로 — E-Gen 응답은 중첩 없는 단층 구조라 정규식으로 충분 */
function parseItems(xml: string): Array<Record<string, string>> {
  const items: Array<Record<string, string>> = []
  for (const m of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const obj: Record<string, string> = {}
    for (const t of m[1].matchAll(/<(\w+)>([\s\S]*?)<\/\1>/g)) obj[t[1]] = t[2].trim()
    items.push(obj)
  }
  return items
}

function numOrNull(v: string | undefined): number | null {
  if (v == null || v === "") return null
  const n = Number.parseInt(v, 10)
  return Number.isFinite(n) ? n : null
}

export async function fetchErRooms(): Promise<ErRoom[] | null> {
  const key = KEY()
  if (!key) return null
  const url = `${BASE}/ErmctInfoInqireService/getEmrrmRltmUsefulSckbdInfoInqire?serviceKey=${key}&STAGE1=${encodeURIComponent("서울특별시")}&STAGE2=${encodeURIComponent("광진구")}&numOfRows=20`
  const xml = await krgovFetch(url).catch(() => "")
  if (!xml.includes("<item>")) return []
  return parseItems(xml).map((it) => ({
    name: it.dutyName ?? "",
    tel: it.dutyTel3 ?? "",
    beds: numOrNull(it.hvec),
    surgery: numOrNull(it.hvoc),
    icu: numOrNull(it.hvicc),
    ward: numOrNull(it.hvgc),
    pediatric: it.hv10 === "Y" || it.hv11 === "Y",
    updatedAt: it.hvidate ?? "",
  }))
}

export interface Aed {
  /** 설치 기관/건물명 */
  org: string
  /** 건물 내 상세 위치 ("1층 로비" 등) */
  place: string
  addr: string
  tel: string
  lat: number
  lng: number
}

// AED 설치 위치는 사실상 정적 — 24h 모듈 캐시. 미등록 키는 빈 배열이라 캐시하지 않는다
let aedCache: { at: number; data: Aed[] } | null = null

export async function fetchAeds(): Promise<Aed[] | null> {
  const key = KEY()
  if (!key) return null
  if (aedCache && Date.now() - aedCache.at < 86_400_000) return aedCache.data
  const url = `${BASE}/AEDInfoInqireService/getAedLcinfoInqire?serviceKey=${key}&Q0=${encodeURIComponent("서울특별시")}&Q1=${encodeURIComponent("광진구")}&numOfRows=500`
  // 활용신청 전이면 HTTP 403(krgovFetch reject) — 에러 메시지를 보존해 null(신청 안내)로 구분한다.
  // 200 + NOT_REGISTERED XML 변형도 실측된 적 있어 둘 다 본다 (2026-08-11: 403 실측)
  const xml = await krgovFetch(url, { timeoutMs: 15000 }).catch((e: Error) => `__ERR__ ${e.message}`)
  if (xml.includes("NOT_REGISTERED") || xml.includes("krgov 403")) return null
  if (!xml.includes("<item>")) return []
  const data = parseItems(xml)
    .map((it) => ({
      org: it.org ?? "",
      place: it.buildPlace ?? "",
      addr: it.buildAddress ?? "",
      tel: it.clerkTel ?? "",
      lat: Number.parseFloat(it.wgs84Lat ?? "0") || 0,
      lng: Number.parseFloat(it.wgs84Lon ?? "0") || 0,
    }))
    .filter((a) => a.org && a.lat !== 0)
  if (data.length > 0) aedCache = { at: Date.now(), data }
  return data
}

/** dutyTime 요일 인덱스: 1월 2화 3수 4목 5금 6토 7일 8공휴일 — kstNow().day(0=일)를 변환 */
function dutyDayIndex(kstDay: number): number {
  return kstDay === 0 ? 7 : kstDay
}

export async function fetchPharmacies(): Promise<Pharmacy[] | null> {
  const key = KEY()
  if (!key) return null
  const url = `${BASE}/ErmctInsttInfoInqireService/getParmacyListInfoInqire?serviceKey=${key}&Q0=${encodeURIComponent("서울특별시")}&Q1=${encodeURIComponent("광진구")}&numOfRows=300`
  const xml = await krgovFetch(url, { timeoutMs: 15000 }).catch(() => "")
  if (!xml.includes("<item>")) return []

  const { day, hhmm } = kstNow()
  const idx = dutyDayIndex(day)
  return parseItems(xml)
    .map((it) => {
      const start = it[`dutyTime${idx}s`] ?? ""
      const close = it[`dutyTime${idx}c`] ?? ""
      const s = Number.parseInt(start, 10)
      // 자정 넘김(예: 0130 마감)은 2400+로 보정해 당일 심야까지 open 판정
      const cRaw = Number.parseInt(close, 10)
      const c = Number.isFinite(cRaw) && Number.isFinite(s) && cRaw < s ? cRaw + 2400 : cRaw
      const valid = Number.isFinite(s) && Number.isFinite(c)
      return {
        name: it.dutyName ?? "",
        addr: it.dutyAddr ?? "",
        tel: it.dutyTel1 ?? "",
        hours: valid ? `${start}~${close}` : "",
        openNow: valid && hhmm >= s && hhmm < c,
        lateNight: valid && c >= 2200,
      }
    })
    .filter((p) => p.name)
    .sort((a, b) => Number(b.openNow) - Number(a.openNow) || Number(b.lateNight) - Number(a.lateNight))
}
