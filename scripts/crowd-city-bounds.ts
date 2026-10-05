// 도시별 명소 bbox 산출기 — 출력값을 lib/crowd/cities.ts CITIES[].bounds에 옮겨 적는다.
// 실행: node_modules/.bin/tsx scripts/crowd-city-bounds.ts
//
// 왜 정적 상수인가: 대시보드 지도가 서울 z12로 먼저 뜬 뒤 데이터 도착 시 fitBounds로 다시 맞추면
// 첫 타일 8장 중 6장이 취소되고 LCP가 두 번째 줌의 타일이 된다(2026-10-05 모바일 실측 189KB 낭비).
// 지도 생성 순간부터 최종 뷰로 그리려면 명소 좌표 bbox를 미리 알아야 한다.
//
// 원천: 제주·부산·강원·인천은 어댑터의 정적 정의, 서울·광진은 런타임 원천(SeoulRtd hotspot-category
// 3페이지 = fetchAllSpots)을 1회 조회. 강원은 등급이 나올 수 있는 강릉권(주차·교차로 매핑 보유)만 —
// 원천 없는 외곽 9곳(속초~삼척·고성·평창·정동진)까지 담으면 도 전체가 화면에 깔려 지점이 콩알이 된다.

import { JEJU_SPOTS } from "../lib/crowd/jeju"
import { BUSAN_SPOTS } from "../lib/crowd/busan"
import { GANGWON_SPOTS } from "../lib/crowd/gangwon"
import { INCHEON_SPOTS } from "../lib/crowd/incheon"
import { fetchAllSpots } from "../lib/crowd/seoul-rtd"
import { GWANGJIN_SPOTS, NEARBY_SPOTS } from "../lib/gwangjin/constants"

type P = { name: string; lat: number; lng: number }

// 바깥쪽으로 4자리 반올림 — 반올림 때문에 끝 지점이 bbox 밖으로 밀리지 않게
function bbox(points: P[]): [[number, number], [number, number]] {
  const lats = points.map((p) => p.lat)
  const lngs = points.map((p) => p.lng)
  const down = (v: number) => Math.floor(v * 1e4) / 1e4
  const up = (v: number) => Math.ceil(v * 1e4) / 1e4
  return [
    [down(Math.min(...lats)), down(Math.min(...lngs))],
    [up(Math.max(...lats)), up(Math.max(...lngs))],
  ]
}

async function main() {
  const seoul = await fetchAllSpots()
  const gwangjinNames = new Set<string>([...GWANGJIN_SPOTS, ...NEARBY_SPOTS])
  const gwangjin = seoul.filter((s) => gwangjinNames.has(s.name))

  const out = {
    seoul: { n: seoul.length, bounds: bbox(seoul) },
    jeju: { n: JEJU_SPOTS.length, bounds: bbox(JEJU_SPOTS) },
    busan: { n: BUSAN_SPOTS.length, bounds: bbox(BUSAN_SPOTS) },
    gangwon: {
      n: GANGWON_SPOTS.filter((s) => s.prk.length > 0 || s.roads.length > 0).length,
      bounds: bbox(GANGWON_SPOTS.filter((s) => s.prk.length > 0 || s.roads.length > 0)),
    },
    incheon: { n: INCHEON_SPOTS.length, bounds: bbox(INCHEON_SPOTS) },
    gwangjin: { n: gwangjin.length, bounds: bbox(gwangjin) },
  }
  for (const [city, v] of Object.entries(out)) console.log(`${city.padEnd(9)} n=${String(v.n).padStart(3)}  bounds: ${JSON.stringify(v.bounds)},`)
}

void main()
