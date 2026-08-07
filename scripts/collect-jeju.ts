// 제주 인파 스냅샷 수집기 — 맥미니(국내 일반 회선)에서 15분 주기로 실행한다.
//
// 왜 필요한가: 제주 원천(GEONET)은 데이터센터 대역을 거른다. 403이 아니라 200+빈 배열로
// 조용히 거절하기 때문에 Vercel에서는 어떤 리전·런타임을 써도 빈손이다(2026-08-07 실측:
// Node/iad1·Node/icn1·Edge/CF 전부 `[]`, 같은 순간 국내 회선은 26행 정상).
// 그래서 원천이 받아주는 회선에서 떠서 결과만 넘긴다.
//
// 원천은 시간당 1회 갱신이라(응답 선두 시각=현재 시각) 15분 주기면 신선도 손실이 없고,
// 호출량도 15분당 66콜로 고정된다 — 뷰어 수와 무관해지는 게 이 구조의 핵심 이득이다.
//
// 출력: out-data-jeju/jeju.json  {updated, pop: {명소명: GEONET 원본 26행}}
// 원본 행을 그대로 담는 이유는 앱이 쓰는 파싱·등급 로직을 한 벌로 유지하기 위해서다.

import { mkdir, writeFile } from "node:fs/promises"
import { JEJU_SPOTS } from "../lib/crowd/jeju"

const GEONET = "https://jeju.mms.gislab.co.kr/mms_new/GEONET."
const SEL =
  "M_POP_00,M_POP_10,M_POP_20,M_POP_30,M_POP_40,M_POP_50,M_POP_60,M_POP_70,M_POP_80,M_POP_90,W_POP_00,W_POP_10,W_POP_20,W_POP_30,W_POP_40,W_POP_50,W_POP_60,W_POP_70,W_POP_80,W_POP_90"
// 원천이 자기 페이지發 XHR만 받는다 — 이 헤더가 빠지면 전건 403
const HEADERS = { "Sec-Fetch-Site": "same-origin" }

async function fetchPop(lat: number, lng: number, r: number): Promise<unknown[] | null> {
  const url = `${GEONET}getTimePopByCircle.php?SELECT=${SEL}&X=${lng}&Y=${lat}&R=${r}`
  for (let i = 1; i <= 3; i++) {
    try {
      const res = await fetch(url, { cache: "no-store", headers: HEADERS, signal: AbortSignal.timeout(15000) })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const rows = (await res.json()) as unknown
      // 빈 배열 = 이 회선이 거절당한 것. 재시도해도 같으니 즉시 알린다.
      if (!Array.isArray(rows)) throw new Error("not an array")
      return rows.length > 0 ? rows : null
    } catch {
      if (i === 3) return null
      await new Promise((r) => setTimeout(r, 1000 * i))
    }
  }
  return null
}

async function main() {
  const pop: Record<string, unknown[]> = {}
  let failed = 0

  const BATCH = 6
  for (let i = 0; i < JEJU_SPOTS.length; i += BATCH) {
    await Promise.all(
      JEJU_SPOTS.slice(i, i + BATCH).map(async (s) => {
        const rows = await fetchPop(s.lat, s.lng, s.r)
        if (rows) pop[s.name] = rows
        else failed++
      }),
    )
  }

  // 절반 넘게 실패했으면 발행하지 않는다 — 반쪽 스냅샷으로 멀쩡한 직전 분을 덮으면
  // 화면에서 명소가 통째로 사라진다. 다음 회차에 회복하는 편이 낫다.
  if (failed > JEJU_SPOTS.length / 2) {
    console.error(`제주 수집 실패 ${failed}/${JEJU_SPOTS.length} — 발행 중단`)
    process.exit(1)
  }

  const kst = new Date(Date.now() + 9 * 3600 * 1000)
  await mkdir("out-data-jeju", { recursive: true })
  await writeFile(
    "out-data-jeju/jeju.json",
    JSON.stringify({ updated: kst.toISOString().replace("Z", "+09:00"), pop }),
  )
  console.log(`제주 ${JEJU_SPOTS.length - failed}/${JEJU_SPOTS.length} 수집 완료`)
}

void main()
