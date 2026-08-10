// 에어코리아 대기질 (서버 전용) — 지점 근처 측정소의 실시간 PM2.5·PM10·O3
// ── 데이터 계약 실측 (2026-08-09)
// 원천: apis.data.go.kr/B552584/ArpltnInforInqireSvc/getCtprvnRltmMesureDnsty
//   (시도별 실시간 측정정보 · data.go.kr 활용신청 필요, DATA_GO_KR_KEY 공용)
//   시도당 1콜로 전 측정소가 오므로 15분 스냅샷 1개면 도시 전 지점을 커버한다.
//   측정값 "-"·통신장애 행이 흔하다 — 숫자 아닌 값은 null로 읽고 UI에서 생략.
// 측정소 매핑: 서울은 측정소명=구명(25곳 동일)이라 자치구 매핑을 그대로 쓴다.
//   나머지 도시는 자치구(시군)→측정소 후보 배열 — 라이브 응답에 실존하는 첫 후보 채택이라
//   후보명이 틀려도 도시 폴백으로 강등될 뿐 깨지지 않는다.

import { createSnapshot } from "@/lib/crowd/adapter-kit"
import { krgovJson } from "@/lib/crowd/krgov-fetch"
import { DISTRICTS } from "@/lib/crowd/districts"
import type { CityId } from "@/lib/crowd/cities"

export interface AirRow {
  station: string
  dataTime: string
  pm25: number | null
  pm10: number | null
  o3: number | null
}

export interface AirInfo extends AirRow {
  /** 1 좋음 · 2 보통 · 3 나쁨 · 4 매우나쁨 — PM2.5·PM10 중 나쁜 쪽 (환경부 4단계 기준) */
  grade: number
}

const SIDO: Record<CityId, string> = {
  seoul: "서울",
  busan: "부산",
  jeju: "제주",
  gangwon: "강원",
  incheon: "인천",
  gwangjin: "서울", // 서울 부분집합 도시 — 상세는 city:"seoul"로 흘러 실호출은 서울 경로
}

/** 자치구(시군) → 측정소 후보 (우선순위순) — 시도별 응답의 실존 측정소명 실측(2026-08-09) 기준.
 *  서울은 측정소명=구명(40곳 중 25곳)이라 표가 필요 없다 */
const DISTRICT_STATIONS: Partial<Record<CityId, Record<string, string[]>>> = {
  busan: {
    중구: ["광복동"],
    서구: ["대신동"],
    동구: ["초량동", "수정동"],
    영도구: ["태종대", "청학동"],
    부산진구: ["전포동", "개금동"],
    동래구: ["온천동", "명장동"],
    남구: ["대연동", "용호동"],
    해운대구: ["우동", "좌동", "재송동"],
    수영구: ["광안동"],
    사하구: ["당리동", "감천동", "장림동"],
    금정구: ["청룡동", "회동동"],
    연제구: ["연산동"],
    사상구: ["학장동", "덕포동", "삼락동"],
    강서구: ["명지동", "녹산동", "대저동"],
    북구: ["덕천동", "화명동"],
    기장군: ["기장읍", "용수리"],
  },
  jeju: {
    제주시: ["이도동", "연동", "노형로", "화북동"],
    서귀포시: ["동홍동", "성산읍", "강정동", "대정읍", "남원읍"],
  },
  gangwon: {
    강릉시: ["옥천동", "초당동", "주문진읍"],
    속초시: ["금호동"],
    동해시: ["천곡동", "북평면"],
    삼척시: ["남양동1"],
    양양군: ["양양읍"],
    고성군: ["간성읍"],
    평창군: ["평창읍"],
  },
  incheon: {
    // 공항은 단일 시설(영종도) — 자치구 캡이 꺼져 있어 도시 폴백만 탄다
  },
}

/** 도시 폴백 — 자치구 미매핑·후보 부재 시 (지점과 멀 수 있어 라벨에 측정소명을 항상 병기한다) */
const CITY_FALLBACK: Record<CityId, string[]> = {
  seoul: ["중구", "종로구"],
  busan: ["광복동", "전포동", "온천동"],
  jeju: ["이도동", "연동"],
  gangwon: ["옥천동", "금호동"],
  // 운서·영종이 공항 소재 영종도 측정소
  incheon: ["운서", "영종"],
  gwangjin: ["광진구"],
}

function toNumOrNull(v: unknown): number | null {
  const n = Number.parseFloat(String(v ?? ""))
  return Number.isFinite(n) ? n : null
}

/** 환경부 4단계 (PM2.5: ~15·35·75 / PM10: ~30·80·150 ㎍/㎥) — 나쁜 쪽 채택, 둘 다 없으면 0 */
export function airGrade(pm25: number | null, pm10: number | null): number {
  const g25 = pm25 == null ? 0 : pm25 <= 15 ? 1 : pm25 <= 35 ? 2 : pm25 <= 75 ? 3 : 4
  const g10 = pm10 == null ? 0 : pm10 <= 30 ? 1 : pm10 <= 80 ? 2 : pm10 <= 150 ? 3 : 4
  return Math.max(g25, g10)
}

interface RawAirItem {
  stationName?: string
  dataTime?: string
  pm25Value?: string
  pm10Value?: string
  o3Value?: string
}

export function parseAirRows(items: unknown): Map<string, AirRow> {
  const rows = new Map<string, AirRow>()
  for (const it of (Array.isArray(items) ? items : []) as RawAirItem[]) {
    const station = (it.stationName ?? "").trim()
    if (!station || rows.has(station)) continue
    rows.set(station, {
      station,
      dataTime: it.dataTime ?? "",
      pm25: toNumOrNull(it.pm25Value),
      pm10: toNumOrNull(it.pm10Value),
      o3: toNumOrNull(it.o3Value),
    })
  }
  return rows
}

const airCache = new Map<CityId, { get(): Promise<Map<string, AirRow>> }>()
// stale-on-error — 원천(에어코리아 게이트웨이)이 504 플레이크를 자주 내서, 실패 시
// 마지막 성공분을 물려준다 (시간당 갱신 원천이라 한두 사이클 묵은 값도 유효)
const lastGood = new Map<CityId, Map<string, AirRow>>()

function sidoRows(city: CityId): Promise<Map<string, AirRow>> {
  let snap = airCache.get(city)
  if (!snap) {
    snap = createSnapshot(900_000, async () => {
      // ⚠️undici(fetch) keep-alive 함정(라이브 실측): 이 게이트웨이는 큰 응답(수십 행) 뒤
      // 커넥션을 더럽게 끝내서, 재사용 연결의 다음 요청이 통째로 행에 걸린다 — 프로세스 첫
      // 요청만 성공하는 패턴. 연결을 매번 새로 여는 krgovFetch(node:https)로 우회한다.
      // numOfRows도 200이면 504가 잦다 — 시도별 측정소 최대 43곳(인천)이라 60이면 전량 커버.
      const url =
        `https://apis.data.go.kr/B552584/ArpltnInforInqireSvc/getCtprvnRltmMesureDnsty` +
        `?serviceKey=${process.env.DATA_GO_KR_KEY ?? ""}&returnType=json&numOfRows=60&pageNo=1` +
        `&sidoName=${encodeURIComponent(SIDO[city])}&ver=1.3`
      // 게이트웨이 504·지연 플레이크도 잦다 — 1회 재시도, 총 소요는 라우트 maxDuration 30초 안
      for (let attempt = 0; ; attempt++) {
        const raw = (await krgovJson(url, { timeoutMs: attempt === 0 ? 15000 : 8000 }).catch(() => null)) as {
          response?: { header?: { resultCode?: string }; body?: { items?: unknown } }
        } | null
        // 성공 응답은 header가 body 뒤에 오기도 한다 — resultCode 없이 items만 있어도 채택
        const items = raw?.response?.body?.items
        if (Array.isArray(items) && items.length > 0) {
          const rows = parseAirRows(items)
          lastGood.set(city, rows)
          return rows
        }
        if (attempt >= 1) break
      }
      const stale = lastGood.get(city)
      if (stale) return stale
      throw new Error("airkorea unavailable")
    })
    airCache.set(city, snap)
  }
  return snap.get()
}

/** 후보 이름 목록에서 라이브 응답에 실존하는 첫 측정소 — 값이 하나도 없는(전 항목 "-") 행은 건너뛴다 */
export function resolveStation(rows: Map<string, AirRow>, candidates: string[]): AirRow | null {
  for (const name of candidates) {
    const row = rows.get(name)
    if (row && (row.pm25 != null || row.pm10 != null)) return row
  }
  return null
}

/** 지점의 대기질 — 자치구 측정소 우선, 없으면 도시 폴백. 키 미승인·원천 장애는 null */
export async function fetchAir(city: CityId, spot: string): Promise<AirInfo | null> {
  const rows = await sidoRows(city).catch(() => null)
  if (!rows || rows.size === 0) return null
  const district = DISTRICTS[city]?.[spot]
  const candidates =
    city === "seoul"
      ? [...(district ? [district] : []), ...CITY_FALLBACK.seoul]
      : [...(district ? (DISTRICT_STATIONS[city]?.[district] ?? []) : []), ...CITY_FALLBACK[city]]
  const row = resolveStation(rows, candidates)
  if (!row) return null
  return { ...row, grade: airGrade(row.pm25, row.pm10) }
}
