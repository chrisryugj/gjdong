import type { DongRow, HeatSeg, IceSeg, ResourceId, SnowMapData, WeakSeg } from "@/lib/snow/types"
import { HEAT_STYLE, RESOURCES, RISK, RISK_STYLE } from "@/lib/snow/labels"
import { dongValue, fmt } from "@/lib/snow/facts"

// /snow 지도의 순수 계산부. 지도 엔진을 모른다: GeoJSON 조립·기둥 높이·툴팁 HTML. 테스트가 여기만 읽는다

type FC = GeoJSON.FeatureCollection
const fc = (features: GeoJSON.Feature[]): FC => ({ type: "FeatureCollection", features })
const ll = (p: [number, number]): [number, number] => [p[1], p[0]] // [lat,lng] → [lng,lat]

export const RES_COLOR: Record<ResourceId, string> = Object.fromEntries(RESOURCES.map((r) => [r.id, r.color])) as Record<ResourceId, string>
export const RES_COLOR_LIGHT: Record<ResourceId, string> = Object.fromEntries(RESOURCES.map((r) => [r.id, r.colorLight])) as Record<ResourceId, string>
export const resColor = (id: ResourceId, dark: boolean) => (dark ? RES_COLOR[id] : RES_COLOR_LIGHT[id])
export const riskColor = (dark: boolean) => (dark ? RISK.weak.color : RISK.weak.colorLight)
export const slopeColor = (dark: boolean) => (dark ? RISK.slope.color : RISK.slope.colorLight)
export const heatGlow = (dark: boolean) => (dark ? HEAT_STYLE.glow.dark : HEAT_STYLE.glow.light)
export const heatFlow = (dark: boolean) => (dark ? HEAT_STYLE.flow.dark : HEAT_STYLE.flow.light)
export const casingColor = (dark: boolean) => (dark ? RISK_STYLE.casing.dark : RISK_STYLE.casing.light)
export const badgeColor = (dark: boolean) => (dark ? RISK_STYLE.badge.dark : RISK_STYLE.badge.light)
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] ?? c)

// 카드형 툴팁: 꼬리표 · 제목 · 행(라벨·값) · 각주. 12px 이하 금지(CSS .snow-tip)
export function tip(kicker: string, title: string, rows: [string, string][], note?: string): string {
  return `<div class="snow-tip"><span class="k">${esc(kicker)}</span><b>${esc(title)}</b>${rows.map(([k, v]) => `<div><span>${esc(k)}</span>${esc(v)}</div>`).join("")}${note ? `<p>${esc(note)}</p>` : ""}</div>`
}

const methodNote = (h: { method: string; snapNote: string; roadName: string }): string | undefined => {
  if (h.method === "named") return undefined
  if (h.method === "network") return `노선명과 다른 도로(${h.roadName || "이름 없음"})를 따라 그렸습니다`
  if (h.method === "point") return "기점과 종점이 같은 주소라 도로를 따라 연장만큼 그렸습니다"
  if (/보행로/.test(h.snapNote)) return "지도에 없는 보행로입니다. 도로망에 경로가 없어 두 점을 직선으로 이었습니다"
  if (/지오코딩/.test(h.snapNote)) return "기점·종점 주소를 찾지 못해 위치가 근사입니다"
  return "도로망에서 경로를 찾지 못해 직선으로 그렸습니다"
}
// 지도에 없는 보행로(동의초 통학로 보도열선 등). 툴팁·문서에서 같은 판정을 쓴다
export const isFootpath = (h: { method: string; snapNote: string }) => h.method === "straight" && /보행로/.test(h.snapNote)

// 열선 55구간. 도로 스냅 선형(path). w=선 굵기 등급(차로수)
export function heatFC(data: SnowMapData): FC {
  return fc(
    data.heat.map((h) => ({
      type: "Feature",
      properties: {
        id: h.i,
        d: h.d ?? "",
        m: h.m,
        year: h.year ?? 0,
        w: (h.lanesN ?? 1) >= 2 ? 2 : 1,
        approx: h.approx ? 1 : 0,
        foot: isFootpath(h) ? 1 : 0,
        tip: tip(
          isFootpath(h) ? "도로열선 · 지도에 없는 보행로" : "도로열선",
          h.route || h.roadName || `${h.from}`,
          [
            ["행정동", h.d ?? "미판정"],
            ["구간", h.from === h.to ? h.from : `${h.from}부터 ${h.to}까지`],
            ["연장", `${fmt(h.m)}m(1차로 기준)${h.lanesN ? ` · ${h.lanes}차로` : ""}`],
            ["설치", h.year ? `${h.year}년 ${h.month ?? ""}월` : "미기재"],
          ],
          methodNote(h),
        ),
      },
      geometry: { type: "LineString", coordinates: h.path.map(ll) },
    })),
  )
}
// 열선 끝점(기점·종점) 원. 줌아웃에서 선이 뭉개져도 위치가 보이게
export function heatEndsFC(data: SnowMapData): FC {
  return fc(data.heat.map((h) => ({ type: "Feature", properties: { id: h.i }, geometry: { type: "Point", coordinates: ll(h.path[Math.floor(h.path.length / 2)]) } })))
}

export function saltFC(data: SnowMapData): FC {
  return fc(
    data.salt.map((s) => ({
      type: "Feature",
      properties: { id: s.id, kind: "salt", tip: tip("제설함", s.detail || s.addr, [["주소", s.addr], ["관리", "도로과"], ["행정동", s.d ?? "구 경계선"]]) },
      geometry: { type: "Point", coordinates: [s.lng, s.lat] },
    })),
  )
}

export function caclFC(data: SnowMapData): FC {
  return fc(
    data.cacl.map((c) => ({
      type: "Feature",
      properties: { id: c.id, kind: "cacl", tip: tip("염화칼슘보관함", c.addr, [["관리", `${c.d} 주민센터`]]) },
      geometry: { type: "Point", coordinates: [c.lng, c.lat] },
    })),
  )
}

export function sandFC(data: SnowMapData): FC {
  return fc(
    data.sand.map((s, i) => ({
      type: "Feature",
      properties: {
        id: i,
        kind: "sand",
        center: s.kind === "center" ? 1 : 0,
        qty: s.qty,
        tip: tip(
          "모래주머니(2022년 기준)",
          s.kind === "center" ? `${s.d} 주민센터` : s.addr,
          [["행정동", s.d], ["수량", `${fmt(s.qty)}포${s.note ? ` (${s.note})` : ""}`]],
          s.approx ? "주소를 찾지 못해 동주민센터 위치에 표시했습니다" : undefined,
        ),
      },
      geometry: { type: "Point", coordinates: [s.lng, s.lat] },
    })),
  )
}

const segRows = (s: WeakSeg | IceSeg, data: SnowMapData): [string, string][] => {
  const g = data.gaps
  return [
    ["행정동", s.d ?? "미판정"],
    ["가장 가까운 열선", s.near.heat == null ? "없음" : s.heatCovered ? `${s.near.heat}m(${g.heatNearM}m 안)` : `${fmt(s.near.heat)}m`],
    [`${g.materialNearM}m 안 자재`, s.materialsNear ? `${s.materialsNear}개소(제설함 ${s.matNear.salt} · 염화칼슘함 ${s.matNear.cacl} · 모래 ${s.matNear.sand})` : "없음"],
  ]
}

// 행안부 적설취약구간 47. status: heat(열선 있음) · material(자재만) · gap(둘 다 없음)
export const segStatus = (s: { heatCovered: boolean; materialsNear: number }) => (s.heatCovered ? "heat" : s.materialsNear ? "material" : "gap")
export function weakFC(data: SnowMapData): FC {
  return fc(
    data.weak.map((w) => ({
      type: "Feature",
      properties: {
        id: w.i,
        kind: "weak",
        status: segStatus(w),
        type: w.type,
        tip: tip(`적설취약구간 · ${w.type}`, w.name, [...segRows(w, data), ["관리청", w.agency.replace("서울특별시 ", "")]], w.method === "point" && !w.roadName ? "원자료가 좌표 한 점이라 가장 가까운 도로에 60m만 표시했습니다. 선형은 미확인입니다" : w.approx ? "기점·종점을 도로에 붙여 그린 근사 선형입니다" : undefined),
      },
      geometry: { type: "LineString", coordinates: w.path.map(ll) },
    })),
  )
}
// 구간 번호 배지(가운데 점)
export function weakLabelFC(data: SnowMapData): FC {
  return fc(data.weak.map((w) => ({ type: "Feature", properties: { id: w.i, n: String(w.i), status: segStatus(w), heat: w.heatCovered ? 1 : 0 }, geometry: { type: "Point", coordinates: ll(w.path[Math.floor(w.path.length / 2)]) } })))
}
export const segMid = (path: [number, number][]): [number, number] => path[Math.floor(path.length / 2)]

// 행안부 상습결빙구간 9. 전부 간선·자동차전용도로. method=points(선형 미확인)는 선을 그리지 않고 끝점만 iceEndsFC로
export function iceFC(data: SnowMapData): FC {
  return fc(
    data.ice.filter((s) => s.method !== "points").map((s, i) => ({
      type: "Feature",
      properties: {
        id: s.id,
        n: String(i + 1),
        kind: "ice",
        status: segStatus(s),
        tip: tip("상습결빙구간", `${s.road} ${s.km}km`, [...segRows(s, data), ["관리청", s.agency.replace("서울특별시", "서울시")], ["구분", s.cls]], s.approx ? "기점·종점 두 점 사이만 그렸습니다. 관리 구간 총길이는 더 깁니다" : "기점·종점 두 점 사이를 도로를 따라 그렸습니다"),
      },
      geometry: { type: "LineString", coordinates: s.path.map(ll) },
    })),
  )
}
// 선형 미확인 결빙구간의 기점·종점 마커(선 없음). 이웃 행이 끝점을 공유하면(동부간선도로 1·2) 한 점만 그린다
export function iceEndsFC(data: SnowMapData): FC {
  const out: GeoJSON.Feature[] = []
  const seen = new Set<string>()
  data.ice.forEach((s, i) => {
    if (s.method !== "points") return
    for (const [k, p] of [["기점", s.a], ["종점", s.b]] as const) {
      const key = `${p[0].toFixed(5)},${p[1].toFixed(5)}`
      if (seen.has(key)) continue
      seen.add(key)
      out.push({ type: "Feature", properties: { id: s.id, n: String(i + 1), kind: "ice", tip: tip("상습결빙구간 · 선형 미확인", `${s.road} ${s.km}km · ${k}`, [...segRows(s, data), ["관리청", s.agency.replace("서울특별시", "서울시")]], "원자료 기점·종점이 자동차전용도로 램프 위라 도로 선형을 확정할 수 없어 두 끝점만 표시합니다") }, geometry: { type: "Point", coordinates: ll(p) } })
    }
  })
  return fc(out)
}
// 결빙구간 라벨. 선이 있는 행은 가운데에 "결빙 n", 선형 미확인(points) 행은 끝점이 겹치는 이웃 행을 묶어 기점 하나에만 "결빙 1·2 · 선형 미확인"(번호 배지 겹침 실사고)
export function iceLabelFC(data: SnowMapData): FC {
  const out: GeoJSON.Feature[] = []
  const pointRows = data.ice.map((s, i) => ({ s, n: i + 1 })).filter(({ s }) => s.method === "points")
  data.ice.forEach((s, i) => {
    if (s.method === "points") return
    out.push({ type: "Feature", properties: { id: s.id, n: String(i + 1), text: `결빙 ${i + 1}`, status: segStatus(s), points: 0 }, geometry: { type: "Point", coordinates: ll(segMid(s.path)) } })
  })
  // 끝점을 공유하는 points 행끼리 묶는다(단순 연결: 앞 행의 종점 = 뒤 행의 기점)
  const used = new Set<number>()
  for (const { s, n } of pointRows) {
    if (used.has(n)) continue
    const group = [n]
    let tail = s.b
    for (const other of pointRows) {
      if (used.has(other.n) || other.n === n) continue
      if (Math.abs(other.s.a[0] - tail[0]) < 1e-5 && Math.abs(other.s.a[1] - tail[1]) < 1e-5) {
        group.push(other.n)
        used.add(other.n)
        tail = other.s.b
      }
    }
    used.add(n)
    out.push({ type: "Feature", properties: { id: s.id, n: group.join("·"), text: `결빙 ${group.join("·")}\n선형 미확인`, status: segStatus(s), points: 1 }, geometry: { type: "Point", coordinates: ll(s.a) } })
  }
  return fc(out)
}

// DEM 추정 급경사(점선). 열선 없는 것만 강조 가능하게 heat 속성
export function slopeFC(data: SnowMapData): FC {
  return fc(
    data.slopes.map((s, i) => ({
      type: "Feature",
      properties: {
        id: i,
        kind: "slope",
        heat: s.heatIds.length ? 1 : 0,
        grade: s.grade,
        tip: tip(
          "추정 · 급경사",
          s.name,
          [
            ["경사", `${s.grade}% (${s.len}m 구간, 높이차 ${s.rise}m)`],
            ["행정동", s.d ?? "미판정"],
            ["가장 가까운 열선", s.near.heat == null ? "없음" : `${fmt(s.near.heat)}m`],
            [`${data.gaps.materialNearM}m 안 자재`, s.materialsNear ? `${s.materialsNear}개소` : "없음"],
            ["행안부 취약구간", s.weakNear.length ? `${s.weakNear.length}곳 겹침` : "겹치는 곳 없음"],
          ],
          "지형 타일 고도로 계산한 추정치입니다. 실측 경사가 아닙니다",
        ),
      },
      geometry: { type: "LineString", coordinates: s.coords.map(ll) },
    })),
  )
}

export function schoolFC(data: SnowMapData): FC {
  return fc(
    data.schools.map((s, i) => ({
      type: "Feature",
      properties: {
        id: i,
        kind: "school",
        name: s.name.replace(/^서울/, "").replace("등학교", ""),
        heat: s.heatNear.length ? 1 : 0,
        tip: tip("초등학교", s.name, [["주소", s.addr], ["행정동", s.d ?? "미판정"], [`${data.gaps.schoolNearM}m 안 열선`, s.heatNear.length ? `${s.heatNear.length}구간` : "없음"], ["가까운 취약구간", s.weakNear.length ? `${s.weakNear.length}곳` : "없음"]]),
      },
      geometry: { type: "Point", coordinates: [s.lng, s.lat] },
    })),
  )
}

// 동 외곽선·이름(동주민센터 위치)
export function dongFC(data: SnowMapData): { lines: FC; labels: FC } {
  const lines: GeoJSON.Feature[] = []
  const labels: GeoJSON.Feature[] = []
  for (const d of data.dongs) {
    const rings = data.dongOutlines[d.d] ?? []
    lines.push({ type: "Feature", properties: { name: d.d, noHeat: d.heatSeg ? 0 : 1 }, geometry: { type: "MultiPolygon", coordinates: rings.map((r) => [r.map(ll)]) } })
    labels.push({ type: "Feature", properties: { name: d.d, noHeat: d.heatSeg ? 0 : 1 }, geometry: { type: "Point", coordinates: ll(d.center) } })
  }
  return { lines: fc(lines), labels: fc(labels) }
}

// 동별 기둥: 동주민센터 위치에 정사각형(한 변 side m)을 세우고 값에 비례한 높이. 자원별 색. 라벨은 "동 이름\n값 단위" 두 줄
export const COL_MAX_M = 620
const squareAround = (lat: number, lng: number, side: number): GeoJSON.Polygon => {
  const dLat = side / 111320 / 2
  const dLng = side / (111320 * Math.cos((lat * Math.PI) / 180)) / 2
  return { type: "Polygon", coordinates: [[[lng - dLng, lat - dLat], [lng + dLng, lat - dLat], [lng + dLng, lat + dLat], [lng - dLng, lat + dLat], [lng - dLng, lat - dLat]]] }
}
export type ColMetric = ResourceId | "materials" | "weak"
export const COL_METRICS: { id: ColMetric; label: string; unit: string }[] = [
  { id: "materials", label: "비치 자재", unit: "개소" },
  { id: "heat", label: "열선", unit: "구간" },
  { id: "weak", label: "취약구간", unit: "곳" },
  { id: "salt", label: "제설함", unit: "개소" },
  { id: "cacl", label: "염화칼슘함", unit: "개소" },
  { id: "sand", label: "모래주머니", unit: "지점" },
]
export function colValue(d: DongRow, m: ColMetric): number {
  if (m === "materials") return d.salt + d.cacl + d.sand
  if (m === "weak") return d.weak
  if (m === "heat") return d.heatSeg
  return dongValue(d, m)
}
export function dongColsFC(data: SnowMapData, m: ColMetric, dark: boolean, accent: string): FC {
  const max = Math.max(1, ...data.dongs.map((d) => colValue(d, m)))
  const color = m === "materials" ? accent : m === "weak" ? riskColor(dark) : resColor(m, dark)
  const def = COL_METRICS.find((x) => x.id === m)!
  const order = [...data.dongs].filter((d) => colValue(d, m) > 0).sort((a, b) => colValue(b, m) - colValue(a, m))
  return fc(
    order.map((d, rank) => ({
      type: "Feature",
      properties: {
        name: d.d,
        v: colValue(d, m),
        rank: rank + 1,
        label: `${d.d}\n${fmt(colValue(d, m))}${def.unit}`,
        h: 40 + (colValue(d, m) / max) * COL_MAX_M,
        color,
        tip: tip(def.label, `${d.d} · ${rank + 1}위`, dongRows(d), `동주민센터 ${d.centerName} 위치에 표시`),
      },
      geometry: squareAround(d.center[0], d.center[1], 120),
    })),
  )
}
// 동별 기둥 1~3위(입체 숫자 배지, icons3d dongRank). 기둥 꼭대기 높이 h 위에 선다
export function dongRanks(data: SnowMapData, m: ColMetric, dark: boolean, accent: string): { lng: number; lat: number; rank: number; h: number; color: string }[] {
  const cols = dongColsFC(data, m, dark, accent)
  return cols.features
    .filter((f) => Number(f.properties?.rank) <= 3)
    .map((f) => {
      const d = data.dongs.find((x) => x.d === f.properties?.name)!
      return { lng: d.center[1], lat: d.center[0], rank: Number(f.properties?.rank), h: Number(f.properties?.h), color: String(f.properties?.color) }
    })
}

export function dongRows(d: DongRow): [string, string][] {
  return [
    ["열선", d.heatSeg ? `${d.heatSeg}구간 ${fmt(d.heatM)}m` : "없음"],
    ["비치 자재", `${fmt(d.salt + d.cacl + d.sand)}개소 (제설함 ${d.salt} · 염화칼슘함 ${d.cacl} · 모래 ${d.sand})`],
    ["적설취약구간", d.weak ? `${d.weak}곳${d.weakNoHeat ? ` · 열선 없음 ${d.weakNoHeat}` : ""}` : "없음"],
    ["초등학교", d.schools ? `${d.schools}교` : "없음"],
  ]
}

// ─── 입체 보기 전용 도형(dumping 18라운드 규약). 평면의 원은 입체에서 3D 모델(icons3d)로 바뀌고, 툴팁은 같은 자리의 투명 말뚝(fill-extrusion, opacity 0)이 queryRenderedFeatures로 받는다(커스텀 레이어는 조회 불가) ───
export const POST_R_M = 7 // 자재·학교 말뚝 반지름(m). 아이콘 발자국과 비슷하게
export const POST_H_M = 16
export const FOCUS_RING_R_M = 40 // 초점 고리(구간·발견 카드 클릭)
export function postsFC(points: FC, r = POST_R_M, h = POST_H_M): FC {
  return fc(
    points.features.map((f) => {
      const [lng, lat] = (f.geometry as GeoJSON.Point).coordinates
      return { type: "Feature", properties: { ...f.properties, h }, geometry: squareAround(lat, lng, r * 2) }
    }),
  )
}
export function discPolygon(lng: number, lat: number, r: number, n = 20): GeoJSON.Polygon {
  const dLat = r / 111320
  const dLng = r / (111320 * Math.cos((lat * Math.PI) / 180))
  const ring: [number, number][] = []
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2
    ring.push([lng + Math.cos(a) * dLng, lat + Math.sin(a) * dLat])
  }
  return { type: "Polygon", coordinates: [ring] }
}
export function ringPolygon(lng: number, lat: number, r: number, t: number, n = 24): GeoJSON.Polygon {
  const outer = discPolygon(lng, lat, r, n).coordinates[0]
  const inner = discPolygon(lng, lat, Math.max(1, r - t), n).coordinates[0].reverse()
  return { type: "Polygon", coordinates: [outer, inner] }
}
// 땅 위 맥동 고리(초점). [lat,lng] 한 점
export function focusRingFC(p: [number, number] | null): FC {
  if (!p) return fc([])
  return fc([{ type: "Feature", properties: { h: 14 }, geometry: ringPolygon(p[1], p[0], FOCUS_RING_R_M, 8) }])
}

export function ringFC(ring: [number, number][]): { line: FC; mask: FC; bounds: [[number, number], [number, number]] } {
  const coords = ring.map(ll)
  const closed = coords[0][0] === coords[coords.length - 1][0] && coords[0][1] === coords[coords.length - 1][1] ? coords : [...coords, coords[0]]
  const world: [number, number][] = [[-180, -85], [180, -85], [180, 85], [-180, 85], [-180, -85]]
  const lngs = coords.map((p) => p[0])
  const lats = coords.map((p) => p[1])
  return {
    line: fc([{ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: closed } }]),
    mask: fc([{ type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [world, closed] } }]),
    bounds: [[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]],
  }
}

// 동 경계 상자(선택 동으로 카메라 이동)
export function dongBounds(data: SnowMapData, d: string): [[number, number], [number, number]] | null {
  const rings = data.dongOutlines[d]
  if (!rings?.length) return null
  const pts = rings.flat()
  const lats = pts.map((p) => p[0])
  const lngs = pts.map((p) => p[1])
  return [[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]]
}
// 좌표 목록의 경계 상자(시연 카메라)
export function boundsOf(paths: [number, number][][]): [[number, number], [number, number]] | null {
  const pts = paths.flat()
  if (!pts.length) return null
  const lats = pts.map((p) => p[0])
  const lngs = pts.map((p) => p[1])
  return [[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]]
}
export const heatPaths = (data: SnowMapData, ids?: number[]): [number, number][][] => data.heat.filter((h) => !ids || ids.includes(h.i)).map((h) => h.path)
export const heatById = (data: SnowMapData, id: number): HeatSeg | undefined => data.heat.find((h) => h.i === id)
