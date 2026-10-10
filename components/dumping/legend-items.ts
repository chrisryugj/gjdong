// /dumping 범례 "지도 위 개체"(26라운드 후속, 2026-10-10 사용자: "모든 지도상 3D 객체 범례 전수조사해서 검수하고 개선").
// 범례가 바탕·원·격자 기둥만 말해서 동별 막대·상습격자·예측 핫스팟·재배치 후보·배치추천·시설 5종·청소차·사람/차는 지도에 서 있는데 뜻이 안 적혀 있었다.
// 켜진 층만 한 줄씩: 색 칩(그 개체와 같은 색) + 무엇·무엇이 크기/높이를 말하나. 순수 계산이라 테스트가 켜진 층마다 줄이 있는지 고정한다
import type { DumpingMapData } from "@/lib/dumping/types"
import { tallyInfra } from "@/lib/dumping/facts"
import { CHANNEL_DEF } from "@/lib/dumping/labels"
import { BIN_RECO_COLOR, BIN_RECO_LABEL, COMP_COLOR, CRIT_COLOR, ENF_COLOR, HOT_COLOR, INFRA_STYLE } from "./map-geo"
import type { MapView } from "./map-controls"

export type LegendSwatch = "square" | "dot" | "pin" | "line" | "none"
export interface LegendItem {
  key: string
  swatch: LegendSwatch
  colors: string[]
  text: string
}
export interface LegendCtx {
  view: MapView
  /** 모형 보기가 실제로 섰나(입체 + 모형) */
  model: boolean
  /** 운영 탭의 예측 핫스팟·상습격자 강조(MapView 밖 상태) */
  hotspots: boolean
  critical: boolean
  data: DumpingMapData | null
  dark?: boolean
}

const UNIT: Record<string, string> = { cctvMobile: "대", cctvFixed: "대" }
// 입체 아이콘 모양(블렌더 glb, scripts/blender/dumping_assets.py). 범례 줄 하나에 "무엇이 어떤 모양인지"
const SHAPE: Record<string, string> = { cctvMobile: "기둥 위 카메라", cctvFixed: "기둥 위 돔", clothBins: "상자", recycling: "통 셋", bins: "원통" }

export function objectLegend(c: LegendCtx): LegendItem[] {
  const { view, data } = c
  const tilt = view.tilt
  const out: LegendItem[] = []
  if (view.dongBars) {
    if (view.dongMode === "channel")
      out.push({ key: "dong", swatch: "square", colors: [CHANNEL_DEF.app.front, CHANNEL_DEF.c120.front, CHANNEL_DEF.direct.front, ENF_COLOR], text: "동별 막대: 민원은 창구별로 쌓음(진한 파랑 앱 신고·중간 120·옅은 직접), 앰버는 과태료. 높을수록 많음" })
    else
      out.push({
        key: "dong",
        swatch: "square",
        colors: [COMP_COLOR, ENF_COLOR],
        text: `동별 막대: 동마다 파랑 민원·앰버 과태료${view.dongMode === "year" && view.dongYear ? `(${view.dongYear}년)` : ""} 건수, 높을수록 많음. 꼭대기 숫자는 동 순위 1~3위`,
      })
  }
  if (c.critical) {
    const n = data?.decision.kpi.criticalCells.length ?? 0
    out.push({ key: "critical", swatch: "square", colors: [CRIT_COLOR], text: tilt ? `벽돌 기둥: 집중관리 상습격자 ${n}곳, 높이와 꼭대기 숫자는 최근 12개월 건수` : `벽돌 테두리 칸: 집중관리 상습격자 ${n}곳, 칸 숫자는 최근 12개월 건수` })
  }
  if (c.hotspots) {
    const n = data?.decision.hotspots.top.length ?? 0
    out.push({ key: "hotspots", swatch: "square", colors: [CRIT_COLOR, HOT_COLOR], text: tilt ? `벽돌 기둥: 예측 핫스팟 ${n}곳, 높이는 점수·꼭대기 숫자는 순위(1~3위 진하게)` : `벽돌 배지: 예측 핫스팟 ${n}곳의 순위(1~3위 진하게)` })
  }
  if (view.candidates) {
    const n = data?.cctvCandidates.length ?? 0
    out.push({ key: "candidates", swatch: "pin", colors: [ENF_COLOR, CRIT_COLOR], text: `앰버 핀: 이동식 CCTV 재배치 후보 ${n}곳(1~3위는 벽돌 핀·바닥 고리). 보라 시설은 지금의 이동식 CCTV` })
  }
  if (view.binRecos) {
    const n = data?.binRecos?.items.length ?? 0
    out.push({ key: "binRecos", swatch: "dot", colors: [BIN_RECO_COLOR], text: `분홍 반투명 통: ${BIN_RECO_LABEL} ${n}곳` })
  }
  for (const id of view.layers) {
    const s = INFRA_STYLE[id]
    const n = data ? tallyInfra(data.infra[id]).records.length : 0
    out.push({ key: `infra-${id}`, swatch: "dot", colors: [s.color], text: `${s.label} ${n.toLocaleString("ko-KR")}${UNIT[id] ?? "곳"}${tilt ? ` · ${SHAPE[id]}` : ""}` })
  }
  // 시설은 주소로 찍은 자리라 대부분 건물 윤곽 안: 입체에선 늘 건물 위에 그린다(같은 말을 줄마다 되풀이하지 않게 한 번만)
  if (tilt && view.layers.length) out.push({ key: "infra-note", swatch: "none", colors: [], text: "시설은 주소 자리라 건물 위에 겹쳐 보임" })
  if (view.routes)
    out.push({ key: "routes", swatch: "line", colors: [c.dark ? "#e879f9" : "#c026d3"], text: `자홍 ${c.model ? "띠벽" : "선"}은 청소차 노선. 높고 진한 쪽이 집중관리도로, 낮고 옅은 쪽이 일반관리도로${tilt ? ". 움직이는 청소차는 노선을 도는 그림(실제 위치 아님)" : ""}` })
  if (c.model)
    out.push({ key: "decor", swatch: "none", colors: [], text: "차·나무·구름은 분위기 그림. 길과 공원·학교의 사람 수만 생활인구가 많은 칸일수록 많게" })
  return out
}
