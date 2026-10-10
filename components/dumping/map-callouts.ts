// /dumping 모형 보기 숫자 카드(26라운드, dumping-map 에서 나눔): 원기둥 상위 세 칸 위에 "1위 · 동 / 과태료 n건" DOM 마커.
// 땅의 빛·봉투 더미는 어디인지, 카드는 얼마인지를 말한다. 순위는 한 지표로만 매긴다(lead: 과태료가 있으면 과태료, 없으면 민원.
// 두 원을 같이 켰을 때 민원 115건이 "1위", 과태료 1위 칸이 "2위"로 섞였다, 26라운드 검증). 솟는 동안(hold)은 숨겼다가 다 퍼진 뒤 선다
import * as maplibregl from "maplibre-gl"
import type { Map as MlMap, Marker } from "maplibre-gl"
import { CIRCLE_DEF, leadMetric, topCells } from "./map-geo"

type FC = GeoJSON.FeatureCollection<GeoJSON.Geometry, Record<string, unknown>>

export class MapCallouts {
  private markers: Marker[] = []
  private timer: number | null = null
  private until = 0

  /** ms 동안은 세우지 않는다(원기둥이 솟는 동안) */
  hold(ms: number) {
    this.until = performance.now() + ms
  }

  /** 다시 세운다. read 는 세울 때 부른다(그 사이 바탕·표현이 바뀌었으면 최신 값으로). null 이면 치우기만 */
  place(map: MlMap, read: () => { fc: FC; filter: string | null } | null) {
    if (this.timer != null) window.clearTimeout(this.timer)
    this.timer = null
    for (const m of this.markers) m.remove()
    this.markers = []
    const b = read()
    if (!b) return
    const wait = this.until - performance.now()
    if (wait > 0) {
      this.timer = window.setTimeout(() => this.place(map, read), wait)
      return
    }
    const lead = leadMetric(b.fc.features.map((f) => f.properties?.cid))
    for (const c of topCells(b.fc, 3, b.filter, lead)) {
      const el = document.createElement("div")
      el.className = "dump-callout"
      el.style.zIndex = "4" // 날씨 덮개(지도 상자 뒤 형제) 위로
      const head = document.createElement("b")
      head.textContent = `${c.rank}위 · ${c.dong}`
      const line = document.createElement("span")
      const chip = document.createElement("i")
      chip.style.background = CIRCLE_DEF[c.cid].color
      const num = document.createElement("em")
      num.textContent = c.v.toLocaleString("ko-KR")
      line.append(chip, `${CIRCLE_DEF[c.cid].label} `, num, "건")
      el.append(head, line)
      this.markers.push(new maplibregl.Marker({ element: el, anchor: "bottom", offset: [0, -8] }).setLngLat([c.lng, c.lat]).addTo(map))
    }
  }

  /** 지도를 내릴 때. 마커 DOM 은 map.remove 가 캔버스 상자째 지운다 */
  dispose() {
    if (this.timer != null) window.clearTimeout(this.timer)
    this.timer = null
    this.markers = []
  }
}
