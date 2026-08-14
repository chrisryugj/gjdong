// 광진 도로 소통 — 전체 도로(ITS) 우선, 명소 반경(RTD) 폴백
// ── 데이터 계약 실측 (2026-08-14 개편)
// [주 원천] 국토부 국가교통정보센터 trafficInfo — openapi.its.go.kr:9443/trafficInfo
//   ?apiKey=&type=all&minX=&maxX=&minY=&maxY=&getType=json — bbox 벌크 한 방, 5분 주기.
//   키 = DATA_GO_KR_KEY (data.go.kr 15040463 활용신청·자동승인 — 신청만 하면 자동 점등).
//   응답 item: linkId(표준노드링크)·speed·travelTime·createdDate·roadName.
//   ⚠️apiKey=test는 bbox를 무시한 고정 샘플 20행(남문로 등)을 반환 — 유효성은 "우리 링크셋과
//   교집합 존재"로 판정한다(무효 키가 샘플로 위장해도 광진 링크와 0교집합이라 걸러짐).
//   지오메트리는 응답에 없다 → road-links.json(표준노드링크 2026-08-12 전국 SHP에서 광진
//   경계+250m 클리핑, 1,561링크·66도로, EPSG:5186→WGS84, scripts/clip-gwangjin-roadlinks.mjs)
//   을 클라이언트가 동적 임포트해 조인. 서버는 [linkId, speed]만 내려 5분 폴링을 가볍게.
// [폴백] 서울 RTD road?hotspotNm= — 인증키 불필요, Referer 필수. 보스팟 반경 도로 조각만
//   커버(부분부분 — 이 한계가 ITS 전환의 이유). 응답 행: XYLIST "경도_위도|…", IDX, SPD,
//   ROAD_NM, LINK_ID(보스팟 간 중복 — 뎁둥 필수), DATEPUBLISHED.
// 등급: ITS 지도 범례와 동일 — 제한속도(MAX_SPD) 대비 80%↑ 원활, 40~80% 서행, 40%↓ 정체.

import { GWANGJIN_SPOTS, NEARBY_SPOTS } from "@/lib/gwangjin/constants"
import roadLinks from "@/lib/gwangjin/road-links.json"

const RTD_HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
  Referer: "https://data.seoul.go.kr/SeoulRtd/map",
  Accept: "application/json, text/plain, */*",
}

// 광진 경계 bbox + 여유 (boundary.ts 실측 lat 37.5208~37.5708 / lng 127.0587~127.1160)
const BBOX = { minX: 127.055, maxX: 127.12, minY: 37.517, maxY: 37.575 }

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

// 정적 링크셋 — ITS 응답 유효성 판정 + 페이로드 슬리밍 (광진 밖 링크 제거)
const LINK_IDS = new Set((roadLinks as { links: Array<{ i: string }> }).links.map((l) => l.i))

function parseXyList(xy: string): Array<[number, number]> {
  const out: Array<[number, number]> = []
  for (const pair of xy.split("|")) {
    const [lng, lat] = pair.split("_").map((v) => Number.parseFloat(v))
    if (Number.isFinite(lat) && Number.isFinite(lng)) out.push([lat, lng])
  }
  return out
}

/** ITS 응답에서 item 배열 추출 — {response:{body:{items:{item:[]}}}} | {body:{items:[]}} 방어 */
function extractItsItems(raw: unknown): Array<Record<string, unknown>> | null {
  if (!raw || typeof raw !== "object") return null
  const resp = ((raw as Record<string, unknown>).response ?? raw) as Record<string, unknown>
  const body = resp.body as Record<string, unknown> | undefined
  if (!body) return null
  const items = body.items as unknown
  if (Array.isArray(items)) return items as Array<Record<string, unknown>>
  const inner = (items as Record<string, unknown> | undefined)?.item
  if (Array.isArray(inner)) return inner as Array<Record<string, unknown>>
  if (inner && typeof inner === "object") return [inner as Record<string, unknown>]
  return null
}

/** "20260814143501" → "2026-08-14 14:35" */
function fmtItsDate(d: string): string {
  if (d.length < 12) return d
  return `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)} ${d.slice(8, 10)}:${d.slice(10, 12)}`
}

async function fetchItsSpeeds(): Promise<TrafficBundle | null> {
  // 기본은 data.go.kr 키(15040463 활용신청) — ITS 전용키가 필요한 것으로 판명되면 ITS_API_KEY로 오버라이드
  const key = process.env.ITS_API_KEY ?? process.env.DATA_GO_KR_KEY
  if (!key) return null
  const url =
    `https://openapi.its.go.kr:9443/trafficInfo?apiKey=${encodeURIComponent(key)}` +
    `&type=all&minX=${BBOX.minX}&maxX=${BBOX.maxX}&minY=${BBOX.minY}&maxY=${BBOX.maxY}&getType=json`
  const raw = await fetch(url, { next: { revalidate: 240 } })
    .then((r) => (r.ok ? r.json() : null))
    .catch(() => null)
  const items = extractItsItems(raw)
  if (!items) return null
  const speeds: Array<[string, number]> = []
  let at = ""
  for (const it of items) {
    const id = String(it.linkId ?? "")
    const spd = Number(it.speed)
    // 우리 링크셋 교집합만 — 미신청 키의 위장 샘플(타지역 20행)도 여기서 0건으로 걸러진다
    if (!LINK_IDS.has(id) || !Number.isFinite(spd)) continue
    speeds.push([id, spd])
    const d = String(it.createdDate ?? "")
    if (d > at) at = d
  }
  if (speeds.length === 0) return null
  return { mode: "its", links: [], speeds, at: fmtItsDate(at) }
}

async function fetchRtdRadius(): Promise<TrafficBundle | null> {
  const spots = [...GWANGJIN_SPOTS, ...NEARBY_SPOTS]
  const results = await Promise.all(
    spots.map((name) =>
      fetch(`https://data.seoul.go.kr/SeoulRtd/api/road?hotspotNm=${encodeURIComponent(name)}`, {
        headers: RTD_HEADERS,
        next: { revalidate: 240 },
      })
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null),
    ),
  )
  if (results.every((r) => r === null)) return null
  const byId = new Map<string, TrafficLink>()
  let at = ""
  for (const raw of results) {
    const rows = (raw as { row?: Array<Record<string, unknown>> } | null)?.row
    if (!Array.isArray(rows)) continue
    for (const r of rows) {
      const id = String(r.LINK_ID ?? "")
      if (!id || byId.has(id)) continue
      const path = parseXyList(String(r.XYLIST ?? ""))
      if (path.length < 2) continue
      const idx = String(r.IDX ?? "").trim()
      byId.set(id, {
        id,
        road: String(r.ROAD_NM ?? "").trim(),
        idx,
        spd: Number.parseFloat(String(r.SPD ?? "0")) || 0,
        color: IDX_COLOR[idx] ?? "#94a3b8",
        path,
      })
      const pub = String(r.DATEPUBLISHED ?? "")
      if (pub > at) at = pub
    }
  }
  return { mode: "rtd", links: [...byId.values()], at }
}

export async function fetchTraffic(): Promise<TrafficBundle | null> {
  const its = await fetchItsSpeeds()
  if (its) return its
  return fetchRtdRadius()
}
