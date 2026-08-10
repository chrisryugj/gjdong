// 지하철 실시간 도착 (서버 전용)
// 데이터 계약 실측(2026-08-10, 샘플키):
//  - GET http://swopenapi.seoul.go.kr/api/subway/{KEY}/json/realtimeStationArrival/0/{n}/{정식역명}
//  - 정식 역명은 부역명 포함 — "아차산" 단독은 INFO-200, "아차산(어린이대공원후문)"은 정상 (constants.STATIONS.api)
//  - 정상: { errorMessage: {code:"INFO-000"}, realtimeArrivalList: [...] } / 없음: 최상위 {status:500, code:"INFO-200"}
//  - ⚠️샘플키가 간헐적으로 역 필터를 무시하고 전망(全網) 덤프(total 2925)를 반환 — 실키에서도
//    믿지 말고 statnNm(부역명 없는 base명)으로 반드시 후처리 필터한다.
//  - barvlDt: 도착까지 초(0 = 진입/도착 등 메시지 상태), recptnDt: 수신 시각(초 단위 실시간 실측)
//  - 인증키: SEOUL_OPEN_KEY 공용 (열린데이터광장 일반 인증키로 동작 실측 — 페이지엔 별도 신청 안내 있음)

import { seoulKey } from "@/lib/gwangjin/seoul-open"
import { STATIONS, SUBWAY_LINE, SUBWAY_LINE_COLOR } from "@/lib/gwangjin/constants"

export interface SubwayArrival {
  line: string
  lineColor: string
  /** 상행/하행/내선/외선 */
  updn: string
  /** 행선 표기 ("장암행 - 어린이대공원(세종대)방면") */
  dest: string
  /** 도착 상태 메시지 ("건대입구 진입", "3분 후 (구의)") */
  msg: string
  /** 도착까지 초 — 0이면 msg가 상태를 대신한다 */
  sec: number
  /** 막차 여부 */
  last: boolean
}

export interface SubwayBoard {
  station: string
  arrivals: SubwayArrival[]
  updatedAt: string
}

interface RawArrival {
  subwayId?: string
  updnLine?: string
  trainLineNm?: string
  statnNm?: string
  barvlDt?: string
  arvlMsg2?: string
  lstcarAt?: string
  recptnDt?: string
}

/** 부역명 괄호 제거 — "아차산(어린이대공원후문)" → "아차산" */
function baseName(name: string): string {
  return name.replace(/\(.*\)$/, "")
}

async function fetchArrivals(
  key: string,
  apiName: string,
  rows: number,
): Promise<{ list: RawArrival[]; noRealtimeKey: boolean }> {
  const url = `http://swopenapi.seoul.go.kr/api/subway/${key}/json/realtimeStationArrival/0/${rows}/${encodeURIComponent(apiName)}`
  const raw = (await fetch(url, { next: { revalidate: 15 } })
    .then((r) => (r.ok ? r.json() : null))
    .catch(() => null)) as { code?: string; realtimeArrivalList?: RawArrival[] } | null
  return {
    list: raw?.realtimeArrivalList ?? [],
    // ERROR-338 실측(2026-08-10): 일반 인증키로 실시간 서비스 호출 시 — 실시간 전용 키가 따로 필요
    noRealtimeKey: raw?.code === "ERROR-338",
  }
}

export async function fetchSubwayBoard(stationBase: string): Promise<SubwayBoard | null> {
  // 실시간 서비스는 일반 인증키와 별개(ERROR-338) — SEOUL_SUBWAY_KEY 우선, 없으면 공용 키 시도
  const key = process.env.SEOUL_SUBWAY_KEY || seoulKey()
  if (!key) return null
  const def = STATIONS.find((s) => s.base === stationBase)
  if (!def) return { station: stationBase, arrivals: [], updatedAt: "" }

  // 0/12 = 2개 노선 역(건대입구 실측 8편성) 커버. 샘플키는 5행 상한(ERROR-335) — 빈 응답이면 0/5 폴백
  const first = await fetchArrivals(key, def.api, 12)
  let list = first.list
  const noRealtimeKey = first.noRealtimeKey
  if (noRealtimeKey && key !== "sample") {
    // 실시간 전용 키 미발급 동안의 임시 강등 — sample 키는 실시간 호출이 되는 실측 특례(5행 상한).
    // 그마저 실패하면 null → UI가 실시간 키 발급 안내를 띄운다.
    const demo = await fetchArrivals("sample", def.api, 5)
    if (demo.list.length === 0) return null
    list = demo.list
  } else if (list.length === 0) {
    const retry = await fetchArrivals(key, def.api, 5)
    if (retry.noRealtimeKey) return null
    list = retry.list
  }

  const arrivals = list
    .filter((r) => baseName(String(r.statnNm ?? "")) === baseName(def.api))
    .map((r) => ({
      line: SUBWAY_LINE[String(r.subwayId)] ?? "",
      lineColor: SUBWAY_LINE_COLOR[String(r.subwayId)] ?? "#888",
      updn: String(r.updnLine ?? ""),
      dest: String(r.trainLineNm ?? ""),
      msg: String(r.arvlMsg2 ?? ""),
      sec: Number.parseInt(String(r.barvlDt ?? "0"), 10) || 0,
      last: r.lstcarAt === "1",
    }))
    // 노선 → 도착 임박 순 정렬 (sec 0(진입 등 상태 메시지)이 가장 임박)
    .sort((a, b) => (a.line === b.line ? a.sec - b.sec : a.line.localeCompare(b.line)))

  return {
    station: def.base,
    arrivals,
    updatedAt: String(list[0]?.recptnDt ?? ""),
  }
}
