// 광진 도로 소통 — 클라이언트·서버 공용 타입·등급·채우기 (traffic.ts에서 분리, 2026-10-05).
// traffic.ts는 road-links.json(222KB)을 정적 import해서, 클라이언트가 거기서 IDX_COLOR 등을 가져오면
// /crowd 첫 번들에 JSON이 통째로 실렸다(45KB br, 매 로드 JSON.parse). 클라이언트는 이 파일만 import한다.

export interface TrafficLink {
  id: string
  road: string
  /** 원활 | 서행 | 정체 | 정보없음 */
  idx: string
  /** 링크 속도 km/h (정보없음은 0) */
  spd: number
  color: string
  /** [lat, lng][] — Leaflet polyline 그대로 */
  path: Array<[number, number]>
  /** 실측이 아니라 역방향·인근 실측에서 추정한 값 — 툴팁에 공개 */
  est?: boolean
}

/** road-links.json 링크 형태 (scripts/clip-gwangjin-roadlinks.mjs 산출) */
export interface RoadGeoLink {
  i: string
  n: string
  r: string
  /** 제한속도 km/h (0=미상) */
  m: number
  p: Array<[number, number]>
}

export interface TrafficBundle {
  /** its = 전체 도로(클라가 정적 지오메트리와 조인) · rtd = 명소 반경 폴백(links에 완성형) */
  mode: "its" | "rtd"
  links: TrafficLink[]
  /** its 모드 — [표준링크ID, 속도km/h] (지오메트리·등급은 클라 조인 시) */
  speeds?: Array<[string, number]>
  /** 원천 발행 시각 — 최신 링크 기준 */
  at: string
}

// 혼잡도 명소 마커와 같은 시각 언어 — 원활=여유색, 서행=보통색, 정체=붐빔색
// 정보없음 = 도로 전체에 실측이 하나도 없어 추정조차 못 하는 링크 (선은 이어 그리되 중립색)
export const IDX_COLOR: Record<string, string> = {
  원활: "#00d369",
  서행: "#ffb100",
  정체: "#ff3939",
  정보없음: "#9aa2ad",
}

/** 제한속도 대비 등급 (ITS 범례: 80% / 40%) — 제한속도 미상은 도시부 50 가정 */
export function gradeBySpeed(spd: number, maxSpd: number): string {
  const max = maxSpd > 0 ? maxSpd : 50
  const ratio = spd / max
  return ratio >= 0.8 ? "원활" : ratio >= 0.4 ? "서행" : "정체"
}

// ── 전 링크 채우기 ────────────────────────────────────────────
// ITS 실측은 1,561링크 중 ~528개(34%)뿐이라 그대로 그리면 드문드문 끊기고,
// 상행·하행이 별도 링크인 도로는 한 방향만 칠해진다 (2026-08-14 실측).
// 실측을 씨앗으로 3단 채움: ① 역방향 쌍 미러 ② 같은 도로 연결 전파(다중 씨앗 BFS,
// 가장 가까운 실측이 이김) ③ 도로 평균. 도로 전체에 실측이 0이면 채우지 않는다 —
// 그 링크는 호출부가 "정보없음" 중립색으로 이어 그린다 (없는 값을 지어내지 않는 선).

export interface FilledSpeed {
  spd: number
  /** true = 실측이 아니라 추정 (미러·전파·평균) */
  inferred: boolean
}

/** 좌표를 ~11m 그리드로 스냅 — 표준노드링크는 같은 SHP 출신이라 공유 노드 좌표가 일치한다 */
const nodeKey = (pt: [number, number]) => `${pt[0].toFixed(4)},${pt[1].toFixed(4)}`

export function fillTrafficSpeeds(links: RoadGeoLink[], measured: Map<string, number>): Map<string, FilledSpeed> {
  const out = new Map<string, FilledSpeed>()
  for (const l of links) {
    const s = measured.get(l.i)
    if (s != null) out.set(l.i, { spd: s, inferred: false })
  }

  const byRoad = new Map<string, RoadGeoLink[]>()
  for (const l of links) {
    const g = byRoad.get(l.n)
    if (g) g.push(l)
    else byRoad.set(l.n, [l])
  }

  for (const group of byRoad.values()) {
    // ① 역방향 쌍 미러 — 양끝점 집합이 같은 링크끼리 (방향만 반대)
    const byEnds = new Map<string, RoadGeoLink[]>()
    for (const l of group) {
      const a = nodeKey(l.p[0])
      const b = nodeKey(l.p[l.p.length - 1])
      const k = a < b ? `${a}|${b}` : `${b}|${a}`
      const arr = byEnds.get(k)
      if (arr) arr.push(l)
      else byEnds.set(k, [l])
    }
    for (const pair of byEnds.values()) {
      const seed = pair.find((l) => out.get(l.i)?.inferred === false)
      if (!seed) continue
      const spd = out.get(seed.i)!.spd
      for (const l of pair) if (!out.has(l.i)) out.set(l.i, { spd, inferred: true })
    }

    // ② 같은 도로 연결 전파 — 끝점 공유 그래프에서 다중 씨앗 BFS (가까운 실측이 이김)
    const nodeToLinks = new Map<string, RoadGeoLink[]>()
    for (const l of group) {
      for (const k of [nodeKey(l.p[0]), nodeKey(l.p[l.p.length - 1])]) {
        const arr = nodeToLinks.get(k)
        if (arr) arr.push(l)
        else nodeToLinks.set(k, [l])
      }
    }
    let frontier = group.filter((l) => out.has(l.i))
    while (frontier.length > 0) {
      const next: RoadGeoLink[] = []
      for (const l of frontier) {
        const spd = out.get(l.i)!.spd
        for (const k of [nodeKey(l.p[0]), nodeKey(l.p[l.p.length - 1])]) {
          for (const nb of nodeToLinks.get(k) ?? []) {
            if (out.has(nb.i)) continue
            out.set(nb.i, { spd, inferred: true })
            next.push(nb)
          }
        }
      }
      frontier = next
    }

    // ③ 도로 평균 — 연결이 끊겨 전파가 못 닿은 잔여 (실측이 있는 도로만)
    const seeds = group.filter((l) => out.get(l.i)?.inferred === false)
    if (seeds.length > 0) {
      const avg = Math.round(seeds.reduce((sum, l) => sum + out.get(l.i)!.spd, 0) / seeds.length)
      for (const l of group) if (!out.has(l.i)) out.set(l.i, { spd: avg, inferred: true })
    }
  }
  return out
}
