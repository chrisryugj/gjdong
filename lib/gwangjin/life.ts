// 광진 생활 묶음 (서버 전용) — 따릉이, EV충전, 문화행사, 생활인구 패턴, 무더위쉼터
// ── 데이터 계약 실측 (2026-08-10, 샘플키 실호출 — EV·쉼터만 명세 기반, 실키 검증 대기)
// 따릉이: 마스터 tbCycleStationInfo(총 3,237개소, STA_LOC="광진구" 필드 실측)를 24h 캐시로
//   조인키를 만들고, bikeList(실시간 rackTotCnt/parkingBikeTotCnt/shared)를 60s 캐시로 훑는다.
//   둘 다 1000행 페이징 — 4콜씩. 광진 대여소 번호는 500번대 실측이나 번호 규칙에 의존하지 않는다.
// 행사: RTD citydata event 블록(무키) — 광진 6개 스팟 합산 후 제목 dedupe, 30분 캐시.
//   ⚠️culturalEventInfo 날짜 위치인자는 기간 겹침이 아니라 "시작일 또는 종료일 = 그 날짜"만
//   매칭(2026-08-10 실측: 당일 4건 전부 시작·종료가 그날) — 진행 중 장기 행사가 다 빠져서
//   crowd 상세와 어긋났다. RTD event는 strtDate/endDate를 줘서 진행 중 필터가 정확.
// 생활인구: SPOP_LOCAL_RESD_DONG/1/24/{yyyyMMdd}/{시간대?}/{동코드} — 시간대 생략 시 24행
//   전부 오는지는 미실측이라 시간대 24회 호출 대신 "날짜/동코드"만 넣어 24행을 기대하고,
//   부족하면 시간대별 폴백. 최신 일자는 오늘-7부터 역방향 탐색(실측: 8/10 시점 최신 7/31 = D-10).
//   일배치 데이터 — 하루 캐시.
// EV: apis.data.go.kr/B552584/EvCharger/getChargerInfo?zcode=11&zscode=11215 (15076352 활용신청
//   필요·자동승인). zscode 시군구 필터는 명세 기반 미실측 — 실패 시 zcode=11 폴백 후 주소 필터.
//   응답에 stat(2=충전대기=사용가능)·statUpdDt 포함. dataType=JSON 지원.
// 쉼터: 서울 열린데이터광장 TbGtnHwcwP (OA-21065) — 2026-08-10 실측: 전 행 YEAR=2026,
//   총 4,056행 중 광진구 96행(AREA_CD 11215 프리픽스), LAT/LON 좌표 내장. 구 필터 파라미터
//   없음 → 1000행×5페이징 후 클라이언트 필터, 24h 모듈 캐시.
//   ⚠️행안부 data.go.kr API(HeatWaveShelter3·4·5)와 safemap은 전부 폐기 실측(2026-08-10) —
//   공유플랫폼(safetydata.go.kr DSSP-IF-10942, 별도 가입)이 유일한 전국 대안이나 서울은 이걸로 충분.
// 도서관: SeoulLibraryTimeInfo(1,535행 — 작은도서관 포함, XCNTS 위도/YDNTS 경도·FDRM_CLOSE_DATE
//   휴관일) + SeoulPublicLibraryInfo(215행 — 공공도서관만, OP_TIME 운영시간·HMPG_URL) 실키 실측
//   2026-08-11: 광진 44행(폐관 2 포함 — 이름 "[폐관]" 프리픽스 제외), 공공도서관 8곳.
//   LBRRY_SEQ_NO로 조인해 운영시간을 얹는다. 구 필터 파라미터 없음 → 전량 후 CODE_VALUE 필터.
//   ⚠️구 화장실 서비스(SearchPublicToiletPOIService 등)는 전부 ERROR-500 폐기 — 부활 금지.
// 공영주차 전체: api.data.go.kr/openapi/tn_pubr_prkplce_info_api (전국주차장정보표준데이터
//   15012896, 활용신청 자동승인). 서울시 GetParkingInfo는 광진구 전체가 1행뿐(실키 실측 —
//   구영 주차장은 자치구 관리라 시 API에 없다) → 표준데이터가 유일한 구영 커버.
//   ⚠️미검증(활용신청 전): 컬럼 like 필터(lnmadr)로 요청하되 응답을 주소로 재필터한다.

import { krgovJson } from "@/lib/crowd/krgov-fetch"
import { fetchSpotEvents } from "@/lib/crowd/seoul-rtd"
import { seoulRows } from "@/lib/gwangjin/seoul-open"
import { DONG_CODES, GWANGJIN_SPOTS, NEARBY_SPOTS } from "@/lib/gwangjin/constants"

const DATA_KEY = () => process.env.DATA_GO_KR_KEY ?? ""

// ── 따릉이 ──────────────────────────────────────────────────────────────
export interface BikeStation {
  id: string
  name: string
  /** 도로명 주소 (마스터 STA_ADD1) — 팝업 표기·길찾기 참고용 */
  addr: string
  racks: number
  bikes: number
  lat: number
  lng: number
}

interface BikeMasterEntry {
  name: string
  addr: string
  lat: number
  lng: number
}

// 마스터(광진 대여소 ID 집합)는 배포 인스턴스 수명 동안 사실상 불변 — 24h 모듈 캐시
let bikeMasterCache: Map<string, BikeMasterEntry> | null = null
let bikeMasterAt = 0

async function gwangjinBikeMaster(): Promise<Map<string, BikeMasterEntry> | null> {
  if (bikeMasterCache && Date.now() - bikeMasterAt < 86_400_000) return bikeMasterCache
  const pages = await Promise.all(
    [1, 1001, 2001, 3001].map((s) => seoulRows("tbCycleStationInfo", `${s}/${s + 999}/`, 86_400)),
  )
  if (pages.every((p) => p === null)) return null
  const map = new Map<string, BikeMasterEntry>()
  for (const rows of pages) {
    for (const r of (rows ?? []) as Array<Record<string, unknown>>) {
      if (String(r.STA_LOC ?? "") !== "광진구") continue
      map.set(String(r.RENT_ID ?? ""), {
        name: String(r.RENT_ID_NM ?? r.RENT_NM ?? "").replace(/^\d+\.\s*/, ""),
        addr: String(r.STA_ADD1 ?? ""),
        lat: Number.parseFloat(String(r.STA_LAT ?? "0")) || 0,
        lng: Number.parseFloat(String(r.STA_LONG ?? "0")) || 0,
      })
    }
  }
  if (map.size > 0) {
    bikeMasterCache = map
    bikeMasterAt = Date.now()
  }
  return map
}

export async function fetchBikes(): Promise<BikeStation[] | null> {
  const master = await gwangjinBikeMaster()
  if (master === null) return null
  const pages = await Promise.all([1, 1001, 2001, 3001].map((s) => seoulRows("bikeList", `${s}/${s + 999}/`, 60)))
  const out: BikeStation[] = []
  for (const rows of pages) {
    for (const r of (rows ?? []) as Array<Record<string, unknown>>) {
      const id = String(r.stationId ?? "")
      const m = master.get(id)
      if (!m) continue
      out.push({
        id,
        name: m.name,
        addr: m.addr,
        racks: Number.parseInt(String(r.rackTotCnt ?? "0"), 10) || 0,
        bikes: Number.parseInt(String(r.parkingBikeTotCnt ?? "0"), 10) || 0,
        lat: m.lat,
        lng: m.lng,
      })
    }
  }
  return out.sort((a, b) => a.name.localeCompare(b.name, "ko"))
}

// ── 문화행사 ────────────────────────────────────────────────────────────
export interface GjEvent {
  title: string
  place: string
  date: string
  fee: string
  link: string
}

// 스팟 6곳 × 30분 캐시 — RTD 무키 원천이라 키 상태와 무관하게 항상 동작
let eventsCache: { at: number; data: GjEvent[] } | null = null

export async function fetchEvents(): Promise<GjEvent[] | null> {
  if (eventsCache && Date.now() - eventsCache.at < 1_800_000) return eventsCache.data
  const per = await Promise.all(
    [...GWANGJIN_SPOTS, ...NEARBY_SPOTS].map((s) => fetchSpotEvents(s).catch(() => [])),
  )
  const seen = new Set<string>()
  const data: GjEvent[] = []
  for (const e of per.flat()) {
    if (seen.has(e.title)) continue
    seen.add(e.title)
    data.push({
      title: e.title,
      place: e.place,
      date: e.period,
      fee: e.free ? "무료" : "",
      link: e.url,
    })
  }
  if (data.length > 0) eventsCache = { at: Date.now(), data }
  return data
}

// ── 생활인구 시간대 패턴 ─────────────────────────────────────────────────
export interface DongPattern {
  dongCode: string
  /** 기준일 yyyyMMdd — 일배치라 열흘 안팎 지연 */
  date: string
  /** 0~23시 총 생활인구 (천 단위 반올림 전 원값) */
  hours: number[]
}

// 동별 하루 캐시 — 일배치 데이터라 인스턴스당 하루 한 번이면 충분
const popCache = new Map<string, { at: number; data: DongPattern }>()

export async function fetchDongPattern(dongCode: string): Promise<DongPattern | null> {
  const hit = popCache.get(dongCode)
  if (hit && Date.now() - hit.at < 43_200_000) return hit.data

  // 1) 최신 적재일 탐색: 1행 프로브(0시)로 D-7 → D-14 역방향 — 실측상 D-10 부근이 최신.
  //    (24행 벌크로 탐색하면 샘플키 5행 상한(ERROR-335)에 걸려 영원히 못 찾는다 — 실측 함정)
  let date = ""
  for (let back = 7; back <= 14; back++) {
    const d = new Date(Date.now() + 9 * 3600_000 - back * 86_400_000).toISOString().slice(0, 10).replace(/-/g, "")
    // ⚠️시간대는 2자리 제로패딩("00"~"23") — "0"은 INFO-200 (2026-08-10 실측)
    const probe = await seoulRows("SPOP_LOCAL_RESD_DONG", `1/1/${d}/00/${dongCode}`, 3600)
    if (probe === null) return null
    if (probe.length > 0) {
      date = d
      break
    }
  }
  if (!date) return { dongCode, date: "", hours: [] }

  // 2) 벌크(24행) 시도 — 시간대 위치인자 공백 스킵은 미실측이라 실패 시 시간별 1행 24콜 폴백
  const hours = new Array(24).fill(0)
  const bulk = (await seoulRows("SPOP_LOCAL_RESD_DONG", `1/24/${date}/%20/${dongCode}`, 3600)) ?? []
  for (const r of bulk as Array<Record<string, unknown>>) {
    const h = Number.parseInt(String(r.TMZON_PD_SE ?? ""), 10)
    if (h >= 0 && h < 24) hours[h] = Number.parseFloat(String(r.TOT_LVPOP_CO ?? "0")) || 0
  }
  if (hours.filter((v) => v > 0).length < 12) {
    const fills = await Promise.all(
      Array.from({ length: 24 }, (_, h) =>
        seoulRows("SPOP_LOCAL_RESD_DONG", `1/1/${date}/${String(h).padStart(2, "0")}/${dongCode}`, 3600),
      ),
    )
    fills.forEach((rows2, h) => {
      const r = (rows2 ?? [])[0] as Record<string, unknown> | undefined
      if (r) hours[h] = Number.parseFloat(String(r.TOT_LVPOP_CO ?? "0")) || 0
    })
  }
  const data = { dongCode, date, hours }
  popCache.set(dongCode, { at: Date.now(), data })
  return data
}

// ── EV 충전소 ───────────────────────────────────────────────────────────
export interface EvSummary {
  /** 충전소 단위 집계 — 좌표는 첫 충전기의 lat/lng (지도 마커용) */
  stations: Array<{ name: string; addr: string; total: number; available: number; lat: number; lng: number }>
  updatedAt: string
}

export async function fetchEv(): Promise<EvSummary | null> {
  const key = DATA_KEY()
  if (!key) return null
  const url = `https://apis.data.go.kr/B552584/EvCharger/getChargerInfo?serviceKey=${key}&pageNo=1&numOfRows=9999&zcode=11&zscode=11215&dataType=JSON`
  const raw = (await krgovJson(url, { timeoutMs: 15000 }).catch(() => null)) as {
    items?: { item?: Array<Record<string, unknown>> }
  } | null
  const items = raw?.items?.item ?? []
  if (items.length === 0) return { stations: [], updatedAt: "" }
  const byStation = new Map<string, EvSummary["stations"][number]>()
  let latest = ""
  for (const it of items) {
    // zscode 필터가 무시되는 원천 대비 — 주소로 한 번 더 거른다
    if (!String(it.addr ?? "").includes("광진구")) continue
    const sid = String(it.statId ?? "")
    const entry = byStation.get(sid) ?? {
      name: String(it.statNm ?? ""),
      addr: String(it.addr ?? ""),
      total: 0,
      available: 0,
      lat: Number.parseFloat(String(it.lat ?? "0")) || 0,
      lng: Number.parseFloat(String(it.lng ?? "0")) || 0,
    }
    entry.total += 1
    if (String(it.stat ?? "") === "2") entry.available += 1 // 2 = 충전대기(사용가능)
    byStation.set(sid, entry)
    const upd = String(it.statUpdDt ?? "")
    if (upd > latest) latest = upd
  }
  return { stations: [...byStation.values()].sort((a, b) => b.available - a.available), updatedAt: latest }
}

// ── 지하철역 좌표 ────────────────────────────────────────────────────────
// subwayStationMaster (2026-08-10 실측: 총 784행, BLDN_NM 부역명 포함, LAT/LOT) —
// 광진 8역만 걸러 base명으로 dedupe(환승역은 노선별 행 — 첫 행 좌표 채택). 24h 캐시.
export interface StationPoi {
  base: string
  lat: number
  lng: number
  lines: string[]
}

let stationCache: { at: number; data: StationPoi[] } | null = null

export async function fetchStationPois(bases: Array<{ base: string; lines: string[] }>): Promise<StationPoi[] | null> {
  if (stationCache && Date.now() - stationCache.at < 86_400_000) return stationCache.data
  const rows = await seoulRows("subwayStationMaster", "1/784/", 86_400)
  if (rows === null) return null
  const byBase = new Map<string, StationPoi>()
  for (const r of rows as Array<Record<string, unknown>>) {
    const base = String(r.BLDN_NM ?? "").replace(/\(.*\)$/, "")
    const def = bases.find((b) => b.base === base)
    if (!def || byBase.has(base)) continue
    const lat = Number.parseFloat(String(r.LAT ?? "0")) || 0
    const lng = Number.parseFloat(String(r.LOT ?? "0")) || 0
    if (lat === 0) continue
    byBase.set(base, { base, lat, lng, lines: def.lines })
  }
  const data = bases.map((b) => byBase.get(b.base)).filter((s): s is StationPoi => s != null)
  if (data.length > 0) stationCache = { at: Date.now(), data }
  return data
}

// ── 도서관 ──────────────────────────────────────────────────────────────
export interface Library {
  name: string
  addr: string
  tel: string
  url: string
  /** 운영시간 (공공도서관 8곳만 — 작은도서관은 "") */
  opTime: string
  /** 정기 휴관일 ("휴관중" 포함) */
  closeDay: string
  lat: number
  lng: number
}

// 도서관 목록은 연 단위 관리 — 24h 모듈 캐시
let libraryCache: { at: number; data: Library[] } | null = null

export async function fetchLibraries(): Promise<Library[] | null> {
  if (libraryCache && Date.now() - libraryCache.at < 86_400_000) return libraryCache.data
  const [t1, t2, pub] = await Promise.all([
    seoulRows("SeoulLibraryTimeInfo", "1/1000/", 86_400),
    seoulRows("SeoulLibraryTimeInfo", "1001/2000/", 86_400),
    seoulRows("SeoulPublicLibraryInfo", "1/1000/", 86_400),
  ])
  if (t1 === null && t2 === null) return null
  const opBySeq = new Map<string, string>()
  for (const r of (pub ?? []) as Array<Record<string, unknown>>) {
    if (String(r.CODE_VALUE ?? "") === "광진구") opBySeq.set(String(r.LBRRY_SEQ_NO ?? ""), String(r.OP_TIME ?? ""))
  }
  const out: Library[] = []
  for (const r of [...(t1 ?? []), ...(t2 ?? [])] as Array<Record<string, unknown>>) {
    if (String(r.CODE_VALUE ?? "") !== "광진구") continue
    const name = String(r.LBRRY_NAME ?? "")
    if (!name || name.startsWith("[폐관]")) continue
    const lat = Number.parseFloat(String(r.XCNTS ?? "0")) || 0
    if (lat === 0) continue
    out.push({
      name,
      addr: String(r.ADRES ?? ""),
      tel: String(r.TEL_NO ?? ""),
      url: String(r.HMPG_URL ?? ""),
      opTime: opBySeq.get(String(r.LBRRY_SEQ_NO ?? "")) ?? "",
      closeDay: String(r.FDRM_CLOSE_DATE ?? ""),
      lat,
      lng: Number.parseFloat(String(r.YDNTS ?? "0")) || 0,
    })
  }
  const data = out.sort((a, b) => Number(Boolean(b.opTime)) - Number(Boolean(a.opTime)) || a.name.localeCompare(b.name, "ko"))
  if (data.length > 0) libraryCache = { at: Date.now(), data }
  return data
}

// ── 공영주차장 전체 (표준데이터) ─────────────────────────────────────────
export interface PublicParking {
  name: string
  addr: string
  /** 노상/노외 등 */
  type: string
  /** 요금 정보 요약 — "무료" | "30분 1,000원" 형태 */
  fee: string
  spaces: number
  tel: string
  lat: number
  lng: number
}

let pubParkCache: { at: number; data: PublicParking[] } | null = null

export async function fetchPublicParkings(): Promise<PublicParking[] | null> {
  const key = DATA_KEY()
  if (!key) return null
  if (pubParkCache && Date.now() - pubParkCache.at < 86_400_000) return pubParkCache.data
  const url = `https://api.data.go.kr/openapi/tn_pubr_prkplce_info_api?serviceKey=${key}&pageNo=1&numOfRows=900&type=json&lnmadr=${encodeURIComponent("서울특별시 광진구")}`
  const raw = (await krgovJson(url, { timeoutMs: 15000 }).catch(() => null)) as {
    response?: { body?: { items?: Array<Record<string, unknown>> } }
  } | null
  const items = raw?.response?.body?.items
  if (!Array.isArray(items)) return null
  const out: PublicParking[] = []
  for (const it of items) {
    // 필터 미지원/무시 원천 대비 — 지번·도로명 어느 쪽이든 광진구가 들어간 행만
    const addr = String(it.lnmadr ?? "") || String(it.rdnmadr ?? "")
    if (!addr.includes("광진구")) continue
    const lat = Number.parseFloat(String(it.latitude ?? "0")) || 0
    if (lat === 0) continue
    const basic = Number.parseFloat(String(it.basicCharge ?? "")) || 0
    const basicMin = Number.parseFloat(String(it.basicTime ?? "")) || 0
    const free = String(it.parkingchrgeInfo ?? "").includes("무료") || basic === 0
    out.push({
      name: String(it.prkplceNm ?? ""),
      addr,
      type: String(it.prkplceType ?? ""),
      fee: free ? "무료" : basicMin > 0 ? `${basicMin}분 ${basic.toLocaleString()}원` : `기본 ${basic.toLocaleString()}원`,
      spaces: Number.parseInt(String(it.prkcmprt ?? "0"), 10) || 0,
      tel: String(it.phoneNumber ?? ""),
      lat,
      lng: Number.parseFloat(String(it.longitude ?? "0")) || 0,
    })
  }
  const data = out.filter((p) => p.name).sort((a, b) => a.name.localeCompare(b.name, "ko"))
  if (data.length > 0) pubParkCache = { at: Date.now(), data }
  return data
}

// ── 무더위쉼터 ──────────────────────────────────────────────────────────
export interface Shelter {
  name: string
  addr: string
  capacity: number
  lat: number
  lng: number
  /** 행정동명 — AREA_CD(8자리 행정동코드)를 DONG_CODES로 역매핑, 미매핑은 "" */
  dong: string
}

// 쉼터 목록은 연 단위 관리 데이터 — 24h 모듈 캐시로 5페이징 부담을 상쇄
let shelterCache: { at: number; data: Shelter[] } | null = null

export async function fetchShelters(): Promise<Shelter[] | null> {
  if (shelterCache && Date.now() - shelterCache.at < 86_400_000) return shelterCache.data
  const pages = await Promise.all(
    [1, 1001, 2001, 3001, 4001].map((s) => seoulRows("TbGtnHwcwP", `${s}/${s + 999}/`, 86_400)),
  )
  if (pages.every((p) => p === null)) return null
  const out: Shelter[] = []
  for (const rows of pages) {
    for (const r of (rows ?? []) as Array<Record<string, unknown>>) {
      const areaCd = String(r.AREA_CD ?? "")
      if (!areaCd.startsWith("11215")) continue
      out.push({
        name: String(r.R_AREA_NM ?? ""),
        addr: String(r.R_DETL_ADD ?? r.LOTNO_ADDR ?? ""),
        capacity: Number.parseInt(String(r.USE_PRNB ?? "0"), 10) || 0,
        lat: Number.parseFloat(String(r.LAT ?? "0")) || 0,
        lng: Number.parseFloat(String(r.LON ?? "0")) || 0,
        dong: DONG_CODES.find((d) => d.code === areaCd.slice(0, 8))?.name ?? "",
      })
    }
  }
  const data = out.filter((s) => s.name).sort((a, b) => a.name.localeCompare(b.name, "ko"))
  if (data.length > 0) shelterCache = { at: Date.now(), data }
  return data
}
