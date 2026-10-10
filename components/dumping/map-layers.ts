// /dumping 지도의 소스·레이어 선언과 테마 색(23라운드, 2026-10-09 dumping-map.tsx 에서 그대로 옮김: 1,200줄 상한).
// 레이어 id·그리는 순서·페인트 값은 옮기기 전과 같다. 지도 effect 들은 id 로 이 레이어들을 고친다
import type { ExpressionSpecification, LayerSpecification, Map as MlMap, StyleSpecification } from "maplibre-gl"
import { BASEMAP_SOURCE, CONTEXT_SOURCE, HAS_CONTEXT_BUILDINGS, HAS_NSDI_BUILDINGS, NSDI_SOURCE, type BasemapLook, type BasemapTheme } from "@/lib/dumping/basemap-style"
import { BIN_RECO_COLOR, CAND_COLOR, CRIT_COLOR, HOT_COLOR, NEUTRAL_BUILDING, ZERO_CELL, emptyFC, radiusMetersExpr, realBuildingExpr } from "./map-geo"
import { LANDMARK_TIER_ZOOM } from "@/lib/dumping/landmarks"

// 파일별 소스·레이어 id
export const S = {
  mask: "dump-mask",
  ring: "dump-ring",
  grid: "dump-grid",
  cols: "dump-cols",
  circles: "dump-circles",
  weather: "dump-weather",
  dongLine: "dump-dong-line",
  dongFill: "dump-dong-fill",
  dongLabel: "dump-dong-label",
  infra: "dump-infra",
  cand: "dump-cand",
  binReco: "dump-binreco",
  routes: "dump-routes",
  critCells: "dump-crit-cells",
  critCols: "dump-crit-cols",
  critLabels: "dump-crit-labels",
  hotCols: "dump-hot-cols",
  hotLabels: "dump-hot-labels",
  dongCols: "dump-dong-cols",
  dongColLabels: "dump-dong-col-labels",
  // 입체 전용(18라운드)
  circleCols: "dump-circle-cols",
  weatherCols: "dump-weather-cols",
  infraPosts: "dump-infra-posts",
  candPosts: "dump-cand-posts",
  recoRings: "dump-reco-rings",
  focusRing: "dump-focus-ring",
  flyPath: "dump-fly-path",
  // 랜드마크 이름표(24라운드, 입체 전용)
  landmarks: "dump-landmarks",
} as const
// 평면(원·점)과 입체(원기둥·말뚝·고리)는 같은 데이터의 두 그림. 기울기에 따라 한쪽만 보인다
export const L_CAND_LABEL = "dump-cand-label"
export const FLAT_ONLY = [S.circles, S.weather, S.infra, S.cand, S.binReco, L_CAND_LABEL, S.hotLabels, S.critLabels] as string[]
// 랜드마크 이름표 레이어(등급마다 하나, 같은 소스 S.landmarks). 0등급이 맨 위라 겹치면 먼저 산다
// 마지막은 모델 있는 랜드마크(광진구청) 전용: 모형 입체에서 가까이 가면 숨긴다(dumping-map 이 setLayerZoomRange)
export const L_LANDMARK_MODEL = `${S.landmarks}-model`
export const LANDMARK_LAYERS = [...LANDMARK_TIER_ZOOM.map((_, k) => (k === 0 ? S.landmarks : `${S.landmarks}-${k}`)), L_LANDMARK_MODEL]
export const TILT_ONLY = [S.circleCols, S.weatherCols, S.infraPosts, S.candPosts, S.recoRings, ...LANDMARK_LAYERS] as string[]
// 모형 보기에서 빛기둥(three, toon-beams)으로 대신 그리는 지도 기둥. 지도 쪽은 투명으로 남아 툴팁 조회를 맡는다
export const BEAM_LAYERS = [S.circleCols, S.weatherCols, S.cols, S.critCols, S.hotCols, S.dongCols] as string[]
// 랜드마크 이름표 바탕(알약). 테마마다 한 장(dumping-map이 그려 등록한다)
export const PILL_ICON = { light: "dump-pill", dark: "dump-pill-dark" } as const
export const ACCENT = { light: "#c0741a", dark: "#e39a3f" } as const
export const L_BUILDINGS = "dump-buildings"
export const L_BUILDINGS_NSDI = "dump-buildings-nsdi"
export const L_GRID_LINE = "dump-grid-line"
export const L_COL_LABEL = "dump-col-label"
export const L_ROUTES_GENERAL = "dump-routes-general"
export const L_ROUTES_FOCUS = "dump-routes-focus"
export const L_CRIT_FILL = "dump-crit-fill"
export const L_CRIT_LINE = "dump-crit-line"
// 호버 툴팁을 읽는 레이어. 위에 그린 것부터(queryRenderedFeatures가 위→아래 순으로 준다)
export const HOVER_LAYERS = [
  L_CAND_LABEL, S.cand, S.candPosts, S.binReco, S.recoRings, S.infra, S.infraPosts, S.hotLabels, S.hotCols, S.critCols, S.dongCols, L_CRIT_FILL, S.cols,
  L_ROUTES_FOCUS, L_ROUTES_GENERAL, S.weather, S.weatherCols, S.circles, S.circleCols, S.grid,
]
export const BIN_RECO_ICON = "dump-binreco-icon"


// 소스·레이어 전부를 빈 데이터로 선언. 그리는 순서(아래→위): 마스크 → 격자 면 → 동 채움 → 원 → 노선 → 상습격자 면 → 격자선·동 외곽선·구 경계
// → 건물(바닥에 그린 것은 건물이 가리고, 점·기둥은 건물 위에) → 시설·후보·배치추천 → 기둥 3종 → 라벨(항상 맨 위)
export function declareLayers(map: MlMap) {
  const geo = (id: string) => map.addSource(id, { type: "geojson", data: emptyFC() })
  for (const id of Object.values(S)) geo(id)
  // 바탕 스타일의 첫 라벨 레이어 앞에 면·선을 끼워 넣는다. 도로명·지명은 우리 면 위에 남는다
  const firstSymbol = map.getStyle().layers.find((l) => l.type === "symbol")?.id
  const under = (spec: LayerSpecification) => map.addLayer(spec, firstSymbol)

  under({ id: S.mask, type: "fill", source: S.mask, paint: { "fill-color": "#ffffff", "fill-opacity": 0.55 } })
  under({ id: S.grid, type: "fill", source: S.grid, paint: { "fill-color": ZERO_CELL, "fill-opacity": 0 } })
  under({ id: S.dongFill, type: "fill", source: S.dongFill, filter: ["==", ["get", "name"], ""], paint: { "fill-color": "#c0741a", "fill-opacity": 0.08 } })
  under({
    id: S.circles,
    type: "circle",
    source: S.circles,
    paint: {
      "circle-radius": radiusMetersExpr() as ExpressionSpecification,
      "circle-color": ["get", "color"],
      "circle-opacity": ["get", "fill"],
      "circle-stroke-color": ["get", "color"],
      "circle-stroke-width": 1.1,
      "circle-stroke-opacity": 0.75,
      "circle-pitch-alignment": "map",
      "circle-pitch-scale": "map",
    },
  })
  under({
    id: S.weather,
    type: "circle",
    source: S.weather,
    paint: {
      "circle-radius": radiusMetersExpr() as ExpressionSpecification,
      "circle-color": ["get", "color"],
      "circle-opacity": 0.22,
      "circle-stroke-color": ["get", "color"],
      "circle-stroke-width": 1.1,
      "circle-stroke-opacity": 0.8,
      "circle-pitch-alignment": "map",
      "circle-pitch-scale": "map",
    },
  })
  under({ id: L_ROUTES_GENERAL, type: "line", source: S.routes, filter: ["==", ["get", "focus"], 0], paint: { "line-color": "#c026d3", "line-width": 3, "line-opacity": 0.55 } })
  under({ id: L_ROUTES_FOCUS, type: "line", source: S.routes, filter: ["==", ["get", "focus"], 1], paint: { "line-color": "#c026d3", "line-width": 6, "line-opacity": 0.95 } })
  under({ id: L_CRIT_FILL, type: "fill", source: S.critCells, paint: { "fill-color": CRIT_COLOR, "fill-opacity": 0.18 } })
  under({ id: L_CRIT_LINE, type: "line", source: S.critCells, paint: { "line-color": CRIT_COLOR, "line-width": 2.5, "line-opacity": 0.95 } })
  under({ id: L_GRID_LINE, type: "line", source: S.grid, paint: { "line-color": "#ffffff", "line-width": 0.8, "line-opacity": 0 } })
  under({ id: S.dongLine, type: "line", source: S.dongLine, paint: { "line-color": "#64748b", "line-width": 1, "line-opacity": 0.4 } })
  under({ id: S.ring, type: "line", source: S.ring, paint: { "line-color": "#64748b", "line-width": 1.8, "line-opacity": 0.8, "line-dasharray": [2, 4] } })
  // 구 밖 배경 건물(24라운드: 빌드 때 구 밖만 뽑은 context-buildings.pmtiles, 높이 h·바닥 b). 배경 타일이 없으면 OSM 전체(높이 없으면 9m)
  // 예전엔 OSM 전체에 "구 안 제외" within 필터를 걸었는데 maplibre within 은 폴리곤에 안 먹어 구 안에도 반투명 건물이 겹쳤다
  under({
    id: L_BUILDINGS,
    type: "fill-extrusion",
    source: HAS_CONTEXT_BUILDINGS ? CONTEXT_SOURCE : BASEMAP_SOURCE,
    "source-layer": "buildings",
    minzoom: 12,
    layout: { visibility: "none" },
    paint: {
      "fill-extrusion-color": "#d7d5cd",
      "fill-extrusion-height": HAS_CONTEXT_BUILDINGS ? ["get", "h"] : ["coalesce", ["get", "height"], 9],
      "fill-extrusion-base": HAS_CONTEXT_BUILDINGS ? ["get", "b"] : ["coalesce", ["get", "min_height"], 0],
      // 구 밖은 배경. 옅게 물러나야 구 안(칸 값으로 칠한 건물)이 그림의 주인공이 된다
      "fill-extrusion-opacity": HAS_NSDI_BUILDINGS ? 0.45 : 0.85,
    },
  })
  // 국가공간정보포털 GIS건물통합정보(전수). 높이(h)가 0이면 층수×3.2m, 층수도 없으면 6m
  if (HAS_NSDI_BUILDINGS)
    under({
      id: L_BUILDINGS_NSDI,
      type: "fill-extrusion",
      source: NSDI_SOURCE,
      "source-layer": "buildings",
      minzoom: 12,
      layout: { visibility: "none" },
      paint: {
        "fill-extrusion-color": realBuildingExpr("light") as ExpressionSpecification,
        "fill-extrusion-height": ["case", [">", ["coalesce", ["get", "h"], 0], 0], ["get", "h"], ["*", ["max", 2, ["coalesce", ["get", "flr"], 2]], 3.2]],
        // 불투명. 반투명이면 원기둥·말뚝과 교차하는 벽이 그 속에 비친다(17라운드 실측 "기둥 텍스처 깨짐")
        "fill-extrusion-opacity": 1,
      },
    })
  // 입체 전용(18라운드): 말뚝·고리·원기둥. 전부 불투명 + 세로 그라데이션. 평면일 때는 tilt effect가 숨긴다
  const solid = (id: string, source: string, color: ExpressionSpecification | string, extra: Record<string, unknown> = {}) =>
    under({
      id,
      type: "fill-extrusion",
      source,
      paint: { "fill-extrusion-color": color, "fill-extrusion-height": ["get", "h"], "fill-extrusion-opacity": 1, "fill-extrusion-vertical-gradient": true, ...extra },
    })
  solid(S.circleCols, S.circleCols, ["get", "color"])
  solid(S.weatherCols, S.weatherCols, ["get", "color"])
  // 말뚝·고리는 보이지 않는 조회용(opacity 0). 모양은 Three.js 아이콘(icons3d)이 같은 자리에 그린다. queryRenderedFeatures는 그려진 픽셀이 아니라 도형으로 찾는다
  solid(S.infraPosts, S.infraPosts, ["get", "color"], { "fill-extrusion-opacity": 0 })
  solid(S.recoRings, S.recoRings, BIN_RECO_COLOR, { "fill-extrusion-opacity": 0 })
  solid(S.candPosts, S.candPosts, CAND_COLOR.light, { "fill-extrusion-opacity": 0 })
  // 초점 고리(목록 클릭·드론 목표). 높이·투명도는 맥동 effect가 프레임마다 바꾼다
  under({
    id: S.focusRing,
    type: "fill-extrusion",
    source: S.focusRing,
    paint: { "fill-extrusion-color": ACCENT.light, "fill-extrusion-height": 16, "fill-extrusion-opacity": 0.9, "fill-extrusion-vertical-gradient": false },
  })
  // 드론 경로 점선(바닥). 지점 번호는 라벨과 함께 아래에서
  under({ id: S.flyPath, type: "line", source: S.flyPath, paint: { "line-color": ACCENT.light, "line-width": 2.5, "line-opacity": 0.9, "line-dasharray": [1.5, 2.5] } })
  under({
    id: S.infra,
    type: "circle",
    source: S.infra,
    paint: { "circle-radius": ["get", "r"], "circle-color": ["get", "color"], "circle-stroke-color": "#ffffff", "circle-stroke-width": 2 },
  })
  under({ id: S.binReco, type: "symbol", source: S.binReco, layout: { "icon-image": BIN_RECO_ICON, "icon-size": 0.5, "icon-allow-overlap": true } })
  under({
    id: S.cand,
    type: "circle",
    source: S.cand,
    paint: { "circle-radius": 13, "circle-color": ACCENT.light, "circle-stroke-color": "#ffffff", "circle-stroke-width": 2 },
  })
  // 기둥 3종. 위에서 아래로 갈수록 밝아지는 면 그라데이션이 입체감을 만든다. 불투명(반투명끼리 교차하면 건물이 기둥 속에 비친다)
  const col = (id: string, source: string, color: ExpressionSpecification | string) =>
    under({
      id,
      type: "fill-extrusion",
      source,
      paint: { "fill-extrusion-color": color, "fill-extrusion-height": ["get", "h"], "fill-extrusion-opacity": 1, "fill-extrusion-vertical-gradient": true },
    })
  col(S.cols, S.cols, ["get", "color"])
  col(S.critCols, S.critCols, CRIT_COLOR)
  col(S.hotCols, S.hotCols, ["get", "color"])
  // 동별 기둥은 토막(채널 스택)마다 바닥 높이가 다르다
  under({
    id: S.dongCols,
    type: "fill-extrusion",
    source: S.dongCols,
    paint: { "fill-extrusion-color": ["get", "color"], "fill-extrusion-height": ["get", "h"], "fill-extrusion-base": ["get", "base"], "fill-extrusion-opacity": 1, "fill-extrusion-vertical-gradient": true },
  })
  // 라벨. 순위·값은 겹쳐도 보이게, 동 이름은 서로 피한다. 글자는 화면에 세워 기울여도 읽힌다
  const halo = { "text-halo-color": "rgba(251,249,243,0.94)", "text-halo-width": 1.6 } // 종이색 후광
  map.addLayer({
    id: S.dongLabel,
    type: "symbol",
    source: S.dongLabel,
    // 동 이름은 바탕 지도 라벨보다 우선(겹치면 바탕 쪽이 진다)
    layout: { "text-field": ["get", "name"], "text-size": 13, "text-font": ["Noto Sans Medium"], "text-pitch-alignment": "viewport", "text-allow-overlap": true, "text-ignore-placement": true },
    paint: { "text-color": "#14201c", ...halo },
  })
  map.addLayer({
    id: L_COL_LABEL,
    type: "symbol",
    source: S.cols,
    minzoom: 15,
    layout: { "text-field": ["to-string", ["get", "v"]], "text-size": 11, "text-font": ["Noto Sans Medium"], "text-offset": [0, -1.1], "text-pitch-alignment": "viewport" },
    paint: { "text-color": ["get", "color"], ...halo },
  })
  map.addLayer({
    id: S.critLabels,
    type: "symbol",
    source: S.critLabels,
    layout: { "text-field": ["get", "label"], "text-size": 11.5, "text-font": ["Noto Sans Medium"], "text-allow-overlap": true, "text-pitch-alignment": "viewport" },
    paint: { "text-color": CRIT_COLOR, ...halo },
  })
  // 평면 전용(입체는 icons3d 입체 숫자). 흰 숫자 + 굵은 벽돌 후광 = 배지(/snow 구간 번호 문법). 상위 3은 진한 벽돌
  map.addLayer({
    id: S.hotLabels,
    type: "symbol",
    source: S.hotLabels,
    layout: {
      "text-field": ["get", "label"],
      // 구 전체 보기(13.5 미만)에서는 작게. 20개가 서로 덮지 않는다(12라운드 실측)
      "text-size": ["step", ["zoom"], 12.5, 13.5, 14],
      "text-font": ["Noto Sans Medium"],
      "text-allow-overlap": true,
      "text-ignore-placement": true,
      "text-pitch-alignment": "viewport",
    },
    paint: { "text-color": "#ffffff", "text-halo-color": ["case", ["==", ["get", "top"], 1], CRIT_COLOR, HOT_COLOR], "text-halo-width": 3 },
  })
  // 동별 기둥 값·동 이름. 두 기둥 사이 바닥에
  map.addLayer({
    id: S.dongColLabels,
    type: "symbol",
    source: S.dongColLabels,
    // 18라운드: 기둥 사이 바닥 글자가 건물·기둥에 묻혔다 → 15px·후광 2.6(건물은 동별 기둥 모드에서 중립색)
    // 겹치면 옆자리(왼·오른쪽)로 옮겨 본다. 그래도 겹치면 하나는 숨김(확대하면 나온다). 중곡1동·2동 주민센터가 136m라 생긴 규칙
    layout: { "text-field": ["get", "label"], "text-size": 15, "text-font": ["Noto Sans Medium"], "text-variable-anchor": ["top", "left", "right", "bottom"], "text-radial-offset": 0.6, "text-justify": "auto", "text-pitch-alignment": "viewport", "text-line-height": 1.25 },
    paint: { "text-color": "#1c1a15", "text-halo-color": "rgba(251,249,243,0.96)", "text-halo-width": 2.6 },
  })
  // 랜드마크 이름표(24라운드): 알약 바탕 + 이름. 등급마다 레이어(minzoom 소수 문턱), 아래 등급부터 쌓아 0등급이 맨 위. 입체에서만(TILT_ONLY)
  // 쌓는 순서: 2·1·0등급, 맨 위에 모델 층(광진구청 rank 0 이 겹침에서 먼저 산다)
  for (const k of [...LANDMARK_TIER_ZOOM.keys()].reverse().concat(LANDMARK_TIER_ZOOM.length))
    map.addLayer({
      id: LANDMARK_LAYERS[k],
      type: "symbol",
      source: S.landmarks,
      // 모델 있는 랜드마크 층(k = 등급 수)은 0등급과 같은 줌부터
      minzoom: LANDMARK_TIER_ZOOM[k] ?? LANDMARK_TIER_ZOOM[0],
      filter: k === LANDMARK_TIER_ZOOM.length ? ["==", ["get", "model"], 1] : ["all", ["==", ["get", "tier"], k], ["!=", ["get", "model"], 1]],
      layout: {
        "text-field": ["get", "name"],
        "text-size": ["interpolate", ["linear"], ["zoom"], 12, 12.5, 15, 14],
        "text-font": ["Noto Sans Medium"],
        "text-anchor": "bottom",
        "text-offset": [0, -0.9],
        "text-pitch-alignment": "viewport",
        "icon-image": PILL_ICON.light,
        "icon-text-fit": "both",
        "icon-text-fit-padding": [4, 9, 4, 9],
        "symbol-sort-key": ["get", "rank"],
      },
      paint: { "text-color": "#1c1a15" },
    })
  map.addLayer({
    id: L_CAND_LABEL,
    type: "symbol",
    source: S.cand,
    layout: { "text-field": ["get", "label"], "text-size": 13, "text-font": ["Noto Sans Medium"], "text-allow-overlap": true, "text-pitch-alignment": "viewport" },
    paint: { "text-color": "#ffffff" },
  })
}

// 테마에 따라 달라지는 지도 색. 데이터 색(램프·원·기둥)은 안 바꾼다. 마스크·격자선·동 외곽선·구 경계·건물·라벨 후광만
/** diorama: 모형 + 입체(디오라마가 실제로 선 때). 탁자 마스크·경계 점선 끔은 그때만(평면에선 도면처럼) */
export function applyThemePaint(map: MlMap, theme: BasemapTheme, look: BasemapLook = "paper", diorama = look === "model") {
  const dark = theme === "dark"
  const table = look === "model" && diorama
  const ink = dark ? "#ece7dc" : "#14201c"
  const halo = dark ? "rgba(16,22,26,0.9)" : "rgba(251,249,243,0.94)"
  // 26라운드 모형은 구를 잘라 낸 디오라마: 구 밖은 불투명한 탁자(모형 하늘 modelSkyFor 의 안개색과 같다). 도면은 예전처럼 옅게 덮기만
  if (map.getLayer(S.mask)) {
    map.setPaintProperty(S.mask, "fill-color", table ? (dark ? "#101a1f" : "#e9e5dd") : dark ? "#0c1114" : "#ffffff")
    map.setPaintProperty(S.mask, "fill-opacity", table ? 1 : 0.55)
  }
  // NSDI 건물은 바탕 effect가 칸 값으로 칠한다(중립색도 거기서 테마별로). 여기서는 구 밖 OSM 건물만
  // 모형 보기(23라운드)는 구 밖 건물도 모형 땅색에 맞춘 흰 모형 톤(구 안은 three 건물이 그린다)
  // 모형 보기(24라운드 실사)는 구 밖도 거의 불투명한 회백 배경 건물(구가 섬처럼 떠 보이지 않게)
  map.setPaintProperty(L_BUILDINGS, "fill-extrusion-color", look === "model" ? (dark ? "#28323a" : "#d8d4cb") : dark ? NEUTRAL_BUILDING.dark : NEUTRAL_BUILDING.light)
  map.setPaintProperty(L_BUILDINGS, "fill-extrusion-opacity", look === "model" ? 0.92 : HAS_NSDI_BUILDINGS ? 0.45 : 0.85)
  for (const id of LANDMARK_LAYERS) {
    if (!map.getLayer(id)) continue
    map.setLayoutProperty(id, "icon-image", dark ? PILL_ICON.dark : PILL_ICON.light)
    map.setPaintProperty(id, "text-color", ink)
  }
  const accent = dark ? ACCENT.dark : ACCENT.light
  map.setPaintProperty(S.focusRing, "fill-extrusion-color", accent)
  map.setPaintProperty(S.flyPath, "line-color", accent)
  map.setPaintProperty(S.cand, "circle-color", accent)
  map.setPaintProperty(S.cand, "circle-stroke-color", dark ? "#14181b" : "#ffffff")
  const icons = map.getLayer("dump-icons3d") as unknown as { implementation?: { setTheme: (d: boolean) => void } } | undefined
  icons?.implementation?.setTheme(dark)
  map.setPaintProperty(S.dongColLabels, "text-halo-width", 2.6)
  // 청소차 노선은 자홍 한 색(26라운드 후속 3: 앰버는 과태료와, 회색·잉크는 길·건물과 묻혔다). 굵기·진하기로 집중/일반, 다크는 밝은 자홍
  for (const id of [L_ROUTES_FOCUS, L_ROUTES_GENERAL]) if (map.getLayer(id)) map.setPaintProperty(id, "line-color", dark ? "#e879f9" : "#c026d3")
  if (map.getLayer(S.ring)) {
    map.setPaintProperty(S.ring, "line-color", dark ? "#a19b8f" : "#64748b")
    // 모형은 블록 모서리가 구 경계라 점선은 쉰다
    map.setPaintProperty(S.ring, "line-opacity", table ? 0 : 0.8)
  }
  // 핫스팟 바닥 배지(S.hotLabels)는 흰 글자+벽돌 후광이라 테마와 무관
  for (const id of [S.dongLabel, S.critLabels, L_COL_LABEL, S.dongColLabels]) {
    if (!map.getLayer(id)) continue
    map.setPaintProperty(id, "text-halo-color", halo)
    if (id === S.dongLabel || id === S.dongColLabels) map.setPaintProperty(id, "text-color", ink)
  }
}

// 바탕 다시 칠하기(24라운드): 테마·표현을 바꿀 때 setStyle 로 통째로 갈지 않고 같은 레이어의 칠하기·보이기만 바꾼다.
// 네 조합(라이트·다크 × 도면·모형)은 레이어 구성·배치·필터·소스가 같고 색만 다르다(tests/dumping-toon.test.ts 가 고정).
// 예전 setStyle 방식은 새 스타일이 뜰 때까지(30~90ms) 다른 effect 의 setPaintProperty 가 "Style is not done loading" 을 던져
// 오류 화면으로 떨어졌고(검증 재현), 소스를 다시 만들어 건물 feature-state·커스텀 층을 다시 붙여야 했다
export function restyleBasemap(map: MlMap, next: StyleSpecification) {
  const cur = new Map(map.getStyle().layers.map((l) => [l.id, l as LayerSpecification & { paint?: Record<string, unknown> }]))
  for (const l of next.layers as (LayerSpecification & { paint?: Record<string, unknown>; layout?: Record<string, unknown> })[]) {
    if (!map.getLayer(l.id)) continue
    const paint = l.paint ?? {}
    for (const k of new Set([...Object.keys(cur.get(l.id)?.paint ?? {}), ...Object.keys(paint)])) map.setPaintProperty(l.id, k as never, paint[k] as never)
    // 보이기는 다를 때만: 미지정 → "visible" 도 maplibre 는 변경으로 보고 소스를 다시 읽었다(첫 전환에 음영 DEM 35장 재요청, 검증 실측)
    const vis = (l.layout?.visibility as "visible" | "none" | undefined) ?? "visible"
    if ((map.getLayoutProperty(l.id, "visibility") ?? "visible") !== vis) map.setLayoutProperty(l.id, "visibility", vis)
  }
}
