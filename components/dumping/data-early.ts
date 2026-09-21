// /dumping 인증 확인과 데이터 4종을 대시보드 청크(maplibre·three 포함, 사파리에서 수 초)와 같이 받기 시작한다(/snow 5라운드 data-early 이식).
// 문서 › 청크 › 인증 › 데이터 › 지도 › 타일이 직렬이라 인증 0.3초 + 데이터 1초가 그대로 로딩에 얹혔다.
// client.tsx가 청크 요청과 같은 시점에 인증을 묻고, 통과하면 곧바로 자료를 받는다. 대시보드는 마운트되면 이 약속을 이어받는다(한 번만 시작. 재시도·재로그인은 fetchBundle을 새로 부른다)
import type { DumpingMapData, InterventionEntry, OntoGraph } from "@/lib/dumping/types"

export const DATA_URL = (name: "map" | "graph" | "interventions" | "bin-recos") => `/api/dumping/data/${name}`

async function fetchJson<T>(url: string): Promise<T> {
  const r = await fetch(url)
  if (!r.ok) throw new Error(`${url} ${r.status}`)
  return r.json()
}

export interface Bundle {
  map: DumpingMapData
  graph: OntoGraph
  interventions: { entries?: InterventionEntry[] } | null
  binRecos: DumpingMapData["binRecos"] | undefined
}

// 자료 4종. 조치 대장·배치추천은 없어도 화면이 선다(실패는 null·undefined)
export function fetchBundle(): Promise<Bundle> {
  return Promise.all([
    fetchJson<DumpingMapData>(DATA_URL("map")),
    fetchJson<OntoGraph>(DATA_URL("graph")),
    fetchJson<{ entries?: InterventionEntry[] } | null>(DATA_URL("interventions")).catch(() => null),
    fetchJson<DumpingMapData["binRecos"]>(DATA_URL("bin-recos")).catch(() => undefined),
  ]).then(([map, graph, interventions, binRecos]) => ({ map, graph, interventions, binRecos }))
}

interface Early {
  auth: Promise<boolean>
  data: Promise<Bundle> | null
}
let started: Early | null = null

export function startDumpingData(): Early {
  if (!started) {
    const auth = fetch("/api/dumping/auth")
      .then((r) => r.json())
      .then((d) => !!d?.ok)
      .catch(() => false)
    const s: Early = { auth, data: null }
    started = s
    // 인증이 통과되면 대시보드가 붙기 전에 자료를 받기 시작한다. 실패는 대시보드가 다시 받아 오류 띠를 띄운다("처리 안 된 거부" 경고만 막는다)
    void auth.then((ok) => {
      if (!ok) return
      s.data = fetchBundle()
      s.data.catch(() => {})
    })
  }
  return started
}
