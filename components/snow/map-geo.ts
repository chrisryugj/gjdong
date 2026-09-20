import type { DongRow, ResourceId, SnowMapData } from "@/lib/snow/types"
import { RESOURCES } from "@/lib/snow/labels"
import { dongValue, fmt } from "@/lib/snow/facts"

// /snow 지도의 순수 계산부. 지도 엔진을 모른다: GeoJSON 조립·기둥 높이·툴팁 HTML. 테스트가 여기만 읽는다

type FC = GeoJSON.FeatureCollection
const fc = (features: GeoJSON.Feature[]): FC => ({ type: "FeatureCollection", features })
const ll = (p: [number, number]): [number, number] => [p[1], p[0]] // [lat,lng] → [lng,lat]

export const RES_COLOR: Record<ResourceId, string> = Object.fromEntries(RESOURCES.map((r) => [r.id, r.color])) as Record<ResourceId, string>
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] ?? c)

function tip(title: string, rows: [string, string][], note?: string): string {
  return `<div class="snow-tip"><b>${esc(title)}</b>${rows.map(([k, v]) => `<div><span>${esc(k)}</span>${esc(v)}</div>`).join("")}${note ? `<p>${esc(note)}</p>` : ""}</div>`
}

// 열선 41구간. 기점·종점을 잇는 직선(도로 선형 근사)
export function heatFC(data: SnowMapData): FC {
  return fc(
    data.heat.map((h) => ({
      type: "Feature",
      properties: {
        id: h.i,
        d: h.d,
        m: h.m,
        w: /2/.test(h.lanes) ? 3.6 : 2.6,
        tip: tip(
          `열선 ${h.route}`,
          [
            ["행정동", h.d],
            ["구간", `${h.from} → ${h.to}`],
            ["연장", `${fmt(h.m)}m · ${h.lanes}차로`],
            ["설치", h.year ? `${h.year}년 ${h.month ?? ""}월` : h.note || "미기재"],
          ],
          h.approx ? "기점·종점 지오코딩 실패로 노선·동 중심 근사" : "두 점을 직선으로 이은 근사 선형",
        ),
      },
      geometry: { type: "LineString", coordinates: [ll(h.a), ll(h.b)] },
    })),
  )
}

export function saltFC(data: SnowMapData): FC {
  return fc(
    data.salt.map((s) => ({
      type: "Feature",
      properties: { id: s.id, kind: "salt", tip: tip(`제설함 ${s.id}`, [["위치", s.detail || s.addr], ["주소", s.addr], ["관리", "도로과"], ["행정동", s.d ?? "구 경계선"]]) },
      geometry: { type: "Point", coordinates: [s.lng, s.lat] },
    })),
  )
}

export function caclFC(data: SnowMapData): FC {
  return fc(
    data.cacl.map((c) => ({
      type: "Feature",
      properties: { id: c.id, kind: "cacl", tip: tip(`염화칼슘보관함 ${c.id}`, [["주소", c.addr], ["관리", `${c.d} 주민센터`]]) },
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
          s.kind === "center" ? `모래주머니 · ${s.d} 주민센터` : `모래주머니 · 취약지역`,
          [["행정동", s.d], ["주소", s.addr], ["수량", `${fmt(s.qty)}포${s.note ? ` (${s.note})` : ""}`]],
          s.approx ? "주소 지오코딩 실패로 동 중심 근사" : undefined,
        ),
      },
      geometry: { type: "Point", coordinates: [s.lng, s.lat] },
    })),
  )
}

// 동 외곽선·이름
export function dongFC(data: SnowMapData): { lines: FC; labels: FC } {
  const lines: GeoJSON.Feature[] = []
  const labels: GeoJSON.Feature[] = []
  for (const d of data.dongs) {
    const rings = data.dongOutlines[d.d] ?? []
    lines.push({ type: "Feature", properties: { name: d.d }, geometry: { type: "MultiPolygon", coordinates: rings.map((r) => [r.map(ll)]) } })
    labels.push({ type: "Feature", properties: { name: d.d }, geometry: { type: "Point", coordinates: ll(d.center) } })
  }
  return { lines: fc(lines), labels: fc(labels) }
}

// 동별 기둥: 동 중심에 작은 정사각형(한 변 side m)을 세우고 값에 비례한 높이. 자원별 색
export const COL_MAX_M = 900
const squareAround = (lat: number, lng: number, side: number): GeoJSON.Polygon => {
  const dLat = side / 111320 / 2
  const dLng = side / (111320 * Math.cos((lat * Math.PI) / 180)) / 2
  return { type: "Polygon", coordinates: [[[lng - dLng, lat - dLat], [lng + dLng, lat - dLat], [lng + dLng, lat + dLat], [lng - dLng, lat + dLat], [lng - dLng, lat - dLat]]] }
}
export function dongColsFC(data: SnowMapData, r: ResourceId | "all", accent: string): FC {
  const max = Math.max(1, ...data.dongs.map((d) => dongValue(d, r)))
  const color = r === "all" ? accent : RES_COLOR[r]
  const unit = r === "heat" ? "m" : r === "all" ? "개소" : (RESOURCES.find((x) => x.id === r)?.unit ?? "")
  return fc(
    data.dongs
      .filter((d) => dongValue(d, r) > 0)
      .map((d) => ({
        type: "Feature",
        properties: {
          name: d.d,
          v: dongValue(d, r),
          h: 40 + (dongValue(d, r) / max) * COL_MAX_M,
          color,
          tip: tip(d.d, dongRows(d), `${r === "all" ? "자원 4종 합" : (RESOURCES.find((x) => x.id === r)?.label ?? "")} ${fmt(dongValue(d, r))}${unit}`),
        },
        geometry: squareAround(d.center[0], d.center[1], 120),
      })),
  )
}

export function dongRows(d: DongRow): [string, string][] {
  return [
    ["열선", d.heatSeg ? `${d.heatSeg}구간 ${fmt(d.heatM)}m` : "없음"],
    ["제설함", d.salt ? `${d.salt}개소` : "없음"],
    ["염화칼슘함", d.cacl ? `${d.cacl}개소` : "없음"],
    ["모래주머니", d.sand ? `${d.sand}지점 ${fmt(d.sandBags)}포` : "없음"],
  ]
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
