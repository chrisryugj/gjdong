// 광진 환경·안전 묶음 (서버 전용) — 강우, 중랑천 수위, 대기질, 공영주차장, 건대 상권
// ── 데이터 계약 실측 (2026-08-10, 샘플키 실호출)
// 강우: ListRainfallService/1/6/광진구 — 관측소 "광진구청"(RF_CD 1201) 10분 단위(RN_10M),
//   최신행이 먼저 온다. DATA_CLCT_TM 수집시각(실측 지연 ~14분).
// 수위: ListRiverStageService/1/10/{하천명} — 위치인자는 하천명. 서울시 22지점 중 광진구
//   소재 지점은 없음 — 중랑천 최하류 성동교(성동구)가 최근접. 필드: RLTM_RVR_WATL_CNT 실시간수위,
//   PLAN_FLDE 계획홍수위, EBM_HGT 제방고, CNTRL_WATL 통제수위(0.0 = 미설정 실측).
//   ⚠️RVR_NM 값에 트레일링 공백("중랑천            ") — trim 필수.
// 대기질: RealtimeCityAir/1/5/동북권/광진구 — 1콜 1행, 시간 단위(MSRMT_DT).
//   필드: PM 미세먼지, FPM 초미세, OZON, CAI_GRD 등급문자, CAI_IDX 지수.
// 주차: GetParkingInfo/1/10/광진구 — 실시간 연계는 광진구 1곳뿐(중곡1동 공영주차장(시), 130면).
//   NOW_PRK_VHCL_UPDT_TM 실측 1분 이내. TPKCT 총면수, NOW_PRK_VHCL_CNT 현재 주차대수.
// 상권: citydata_cmrcl/1/5/{지역명} — 예외 구조({LIVE_CMRCL_STTS:{...}} — row 아님).
//   AREA_CMRCL_LVL 수준("한산한"~), AREA_SH_PAYMENT_CNT 최근 30분 결제건수(신한카드),
//   CMRCL_RSB 업종별 배열. 2026-08-11 실키 실측: 광진 스팟 중 건대입구역(10업종)·군자역(5업종)만
//   응답, 공원·산(어린이대공원·뚝섬·아차산·광나루)은 RESULT 에러 — 역세권 상권만 지원.
//   ⚠️샘플키는 지역 인자를 무시하고 전 지점에 동일 응답을 준다(실측) — 지점별 검증은 실키로만.

import { seoulKey, seoulRows } from "@/lib/gwangjin/seoul-open"

export interface RainInfo {
  station: string
  /** 최근 10분 강우량(mm) */
  mm10: number
  /** 최근 1시간 합산(mm) — 10분 행 6개 합 */
  mm60: number
  collectedAt: string
}

export async function fetchRain(): Promise<RainInfo | null> {
  // 1시간 합산에 10분 행 6개 필요 — 샘플키는 5행 상한(ERROR-335 실측)이라 빈 응답이면 5행 폴백
  let rows = (await seoulRows("ListRainfallService", `1/6/${encodeURIComponent("광진구")}`, 300)) as
    | Array<{ RF_NM?: string; RN_10M?: string; DATA_CLCT_TM?: string }>
    | null
  if (rows !== null && rows.length === 0) {
    rows = (await seoulRows("ListRainfallService", `1/5/${encodeURIComponent("광진구")}`, 300)) as typeof rows
  }
  if (rows === null) return null
  if (rows.length === 0) return { station: "광진구청", mm10: 0, mm60: 0, collectedAt: "" }
  const mm = rows.map((r) => Number.parseFloat(String(r.RN_10M ?? "0")) || 0)
  return {
    station: String(rows[0].RF_NM ?? "광진구청"),
    mm10: mm[0] ?? 0,
    mm60: mm.reduce((a, b) => a + b, 0),
    collectedAt: String(rows[0].DATA_CLCT_TM ?? ""),
  }
}

export interface RiverInfo {
  point: string
  river: string
  /** 실시간 수위(EL.m) */
  level: number
  planFlood: number
  bank: number
  /** 계획홍수위 대비 비율 0~1+ */
  ratio: number
  collectedAt: string
}

export async function fetchRiver(): Promise<RiverInfo | null> {
  // 중랑천 지점은 총 4곳 실측 — 1/5면 전부 오고 샘플키 5행 상한과도 호환
  const rows = (await seoulRows("ListRiverStageService", `1/5/${encodeURIComponent("중랑천")}`, 300)) as
    | Array<Record<string, unknown>>
    | null
  if (rows === null) return null
  // 성동교(최하류·광진 최근접) 우선, 없으면 첫 행 폴백 — 지점 개편에도 카드가 죽지 않게
  const row = rows.find((r) => String(r.WATG_NM ?? "").includes("성동교")) ?? rows[0]
  if (!row) return null
  const level = Number.parseFloat(String(row.RLTM_RVR_WATL_CNT ?? "")) || 0
  const plan = Number.parseFloat(String(row.PLAN_FLDE ?? "")) || 0
  return {
    point: String(row.WATG_NM ?? ""),
    river: String(row.RVR_NM ?? "").trim(),
    level,
    planFlood: plan,
    bank: Number.parseFloat(String(row.EBM_HGT ?? "")) || 0,
    ratio: plan > 0 ? level / plan : 0,
    collectedAt: String(row.DTRSM_DATA_CLCT_TM ?? ""),
  }
}

export interface AirNow {
  pm10: number | null
  pm25: number | null
  o3: number | null
  grade: string
  index: number | null
  measuredAt: string
}

export async function fetchAirNow(): Promise<AirNow | null> {
  const rows = (await seoulRows("RealtimeCityAir", `1/5/${encodeURIComponent("동북권")}/${encodeURIComponent("광진구")}`, 600)) as
    | Array<Record<string, unknown>>
    | null
  if (rows === null) return null
  const r = rows[0]
  if (!r) return { pm10: null, pm25: null, o3: null, grade: "", index: null, measuredAt: "" }
  const num = (v: unknown) => {
    const n = Number.parseFloat(String(v ?? ""))
    return Number.isFinite(n) ? n : null
  }
  return {
    pm10: num(r.PM),
    pm25: num(r.FPM),
    o3: num(r.OZON),
    grade: String(r.CAI_GRD ?? ""),
    index: num(r.CAI_IDX),
    measuredAt: String(r.MSRMT_DT ?? ""),
  }
}

export interface ParkingLot {
  name: string
  addr: string
  total: number
  parked: number
  available: number
  tel: string
  updatedAt: string
}

export async function fetchParking(): Promise<ParkingLot[] | null> {
  // 광진구 실시간 연계는 1곳 실측 — 1/5로 샘플키 호환
  const rows = (await seoulRows("GetParkingInfo", `1/5/${encodeURIComponent("광진구")}`, 120)) as
    | Array<Record<string, unknown>>
    | null
  if (rows === null) return null
  return rows
    .filter((r) => r.PRK_STTS_YN === "1")
    .map((r) => {
      const total = Number.parseFloat(String(r.TPKCT ?? "0")) || 0
      const parked = Number.parseFloat(String(r.NOW_PRK_VHCL_CNT ?? "0")) || 0
      return {
        name: String(r.PKLT_NM ?? ""),
        addr: String(r.ADDR ?? ""),
        total,
        parked,
        available: Math.max(total - parked, 0),
        tel: String(r.TELNO ?? ""),
        updatedAt: String(r.NOW_PRK_VHCL_UPDT_TM ?? ""),
      }
    })
}

export interface CmrclInfo {
  /** 조회 지점명 (건대입구역·군자역) */
  area: string
  level: string
  /** 최근 30분 결제 건수 */
  payments: number
  categories: Array<{ name: string; level: string }>
}

async function fetchCmrclArea(area: string): Promise<CmrclInfo | null> {
  const key = seoulKey()
  if (!key) return null
  const url = `http://openapi.seoul.go.kr:8088/${key}/json/citydata_cmrcl/1/5/${encodeURIComponent(area)}`
  const raw = await fetch(url, { next: { revalidate: 600 } })
    .then((r) => (r.ok ? r.json() : null))
    .catch(() => null)
  const stts = (raw as { LIVE_CMRCL_STTS?: Record<string, unknown> } | null)?.LIVE_CMRCL_STTS
  if (!stts) return null
  const rsb = Array.isArray(stts.CMRCL_RSB) ? (stts.CMRCL_RSB as Array<Record<string, unknown>>) : []
  return {
    area,
    level: String(stts.AREA_CMRCL_LVL ?? ""),
    payments: Number.parseFloat(String(stts.AREA_SH_PAYMENT_CNT ?? "0")) || 0,
    categories: rsb.map((c) => ({
      name: `${String(c.RSB_LRG_CTGR ?? "")}·${String(c.RSB_MID_CTGR ?? "")}`.replace(/^·|·$/g, ""),
      level: String(c.RSB_PAYMENT_LVL ?? ""),
    })),
  }
}

/** 역세권 상권 일괄 — 키 없으면 null, 있으면 응답한 지점만 (전멸 시 빈 배열) */
export async function fetchCmrcl(areas: readonly string[]): Promise<CmrclInfo[] | null> {
  if (!seoulKey()) return null
  const per = await Promise.all(areas.map((a) => fetchCmrclArea(a)))
  return per.filter((c): c is CmrclInfo => c !== null)
}
