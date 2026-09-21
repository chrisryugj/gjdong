// /snow 데이터 JSON을 대시보드 청크(maplibre 포함, 사파리에서 수 초)와 같이 받기 시작한다(5라운드).
// 문서 › 청크 › 데이터 › 지도 › 타일이 직렬이라 데이터 1초가 그대로 로딩에 얹혔던 사파리 실측. <link rel=preload as=fetch>는 크롬·WebKit 모두 fetch와 짝이 안 맞아 두 번 받았다(실측) → 모듈 단위 약속 하나를 client.tsx가 먼저 만들고 대시보드가 이어받는다
import type { OntoGraph, SnowMapData } from "@/lib/snow/types"

async function fetchJson<T>(url: string): Promise<T> {
  const r = await fetch(url)
  if (!r.ok) throw new Error(`${url} ${r.status}`)
  return r.json()
}

let started: { map: Promise<SnowMapData>; graph: Promise<OntoGraph> } | null = null

export function startSnowData() {
  if (!started) {
    started = { map: fetchJson<SnowMapData>("/api/snow/data/map"), graph: fetchJson<OntoGraph>("/api/snow/data/graph") }
    // 대시보드가 붙기 전에 실패하면 "처리 안 된 거부" 경고만 막는다(대시보드가 다시 받아 오류 띠를 띄운다)
    started.map.catch(() => {})
    started.graph.catch(() => {})
  }
  return started
}
