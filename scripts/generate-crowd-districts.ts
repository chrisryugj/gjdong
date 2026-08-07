// 명소 → 자치구(구·시군) 정적 매핑 생성기 — 1회성, 결과는 lib/crowd/districts.ts로 커밋한다.
//
// 좌표 소스: 서울은 RTD 목록(121곳, 원천이 지점을 개편할 수 있어 라이브 조회),
// 제주·부산·강원은 어댑터 정적 정의. 인천공항은 단일 시설이라 제외.
// 구 판정: Kakao coord2regioncode의 region_2depth_name (행정동 문서 우선).
//
// 실행:  export $(grep KAKAO_REST_API_KEY .env.local) && npx tsx scripts/generate-crowd-districts.ts > lib/crowd/districts.ts
// 재실행 시점: 서울 RTD 지점 목록이 바뀌었을 때 (미매핑은 UI에서 "기타" 버킷으로 보이므로 자연 감지)

import { fetchAllSpots } from "../lib/crowd/seoul-rtd"
import { JEJU_SPOTS } from "../lib/crowd/jeju"
import { BUSAN_SPOTS } from "../lib/crowd/busan"
import { GANGWON_SPOTS } from "../lib/crowd/gangwon"
import { kakaoCoord2Region } from "../lib/utils/kakao-api"

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function districtOf(lat: number, lng: number): Promise<string> {
  const docs = await kakaoCoord2Region(lng, lat)
  // 행정동(H) 문서 우선 — 관할 개념과 일치. 없으면 법정동(B)
  const doc = docs.find((d) => d.region_type === "H") ?? docs[0]
  return doc?.region_2depth_name ?? ""
}

async function mapCity(name: string, spots: Array<{ name: string; lat: number; lng: number }>) {
  const out: Record<string, string> = {}
  let missing = 0
  for (const s of spots) {
    const gu = await districtOf(s.lat, s.lng)
    if (gu) out[s.name] = gu
    else {
      missing += 1
      console.error(`[districts] ${name} 미매핑: ${s.name} (${s.lat},${s.lng})`)
    }
    await sleep(100) // Kakao rate limit 배려 (배치 API 관행 준수)
  }
  console.error(`[districts] ${name}: ${spots.length}곳 중 미매핑 ${missing}곳`)
  return out
}

async function main() {
  const seoul = await mapCity("seoul", await fetchAllSpots())
  const jeju = await mapCity("jeju", JEJU_SPOTS)
  const busan = await mapCity("busan", BUSAN_SPOTS)
  const gangwon = await mapCity("gangwon", GANGWON_SPOTS)

  const body = { seoul, jeju, busan, gangwon, incheon: {} }

  console.log(`// 명소 → 자치구(구·시군) 정적 매핑 — scripts/generate-crowd-districts.ts 생성물 (${new Date().toISOString().slice(0, 10)})
// 서울 RTD가 지점을 개편하면 재생성한다. 미매핑 지점은 UI에서 "기타" 버킷으로 노출된다.

import type { CityId } from "@/lib/crowd/cities"

export const DISTRICTS: Record<CityId, Record<string, string>> = ${JSON.stringify(body, null, 2)}

export function districtOf(city: CityId, name: string): string | null {
  return DISTRICTS[city][name] ?? null
}

/** 현재 목록에 실제로 존재하는 구만, 가나다순 */
export function listDistricts(city: CityId, names: string[]): string[] {
  const set = new Set<string>()
  for (const n of names) {
    const d = DISTRICTS[city][n]
    if (d) set.add(d)
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b, "ko"))
}
`)
}

void main()
