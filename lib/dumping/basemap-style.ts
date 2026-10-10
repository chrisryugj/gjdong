// /dumping 지도 바탕 스타일(16라운드, 2026-09-19). 외부 타일 서버 없이 public/dumping/basemap/ 정적 파일만 쓴다.
// - gwangjin.pmtiles: Protomaps 일일 빌드(OSM) 광진 주변 추출(bbox 127.02,37.49,127.16,37.60 · z≤15). 건물 윤곽·높이(height) 포함
// - dem.pmtiles: AWS Terrain Tiles(Mapzen terrarium) z8~14 추출. 아차산·용마산 지형
// - fonts/: 라틴 글리프(0-511)만. 한글은 maplibre localIdeographFontFamily(SUIT)로 브라우저가 그린다
// 시연·심사 중 외부 서비스가 죽어도 지도가 서 있게 하려는 선택(유저 결정 2026-09-19)
import { layers as basemapLayers, namedFlavor, type Flavor } from "@protomaps/basemaps"
import type { FilterSpecification, LayerSpecification, StyleSpecification } from "maplibre-gl"

export const BASEMAP_PATH = "/dumping/basemap"
export const BASEMAP_SOURCE = "protomaps"
export const DEM_SOURCE = "dump-dem"
const DEM_HILL_SOURCE = "dump-dem-hill" // 음영과 지형이 같은 소스를 쓰면 maplibre가 품질 경고를 낸다. 같은 파일을 두 소스로
export const HILLSHADE_LAYER = "dump-hillshade"
// 구 안 건물 타일(buildings.pmtiles): GIS건물통합정보(광진구 전수) + 건축물대장으로 대조한 OSM 신축(24라운드, scripts/dumping-toon-world.py).
// 구 안 건물은 이 소스(층수·높이)로 그리고, 구 밖은 배경 타일(context-buildings.pmtiles)이 따로 그린다(dumping-map declareLayers)
export const HAS_NSDI_BUILDINGS = true
// 그 타일의 건물 수(2026-10-09 빌드: 통합정보 27,221 − 철거·낡은 345 + 대장 대조 신축 139 + 대장에 없는 저층 83). 로딩 커튼 "건물 N동 입체 결합" 문구.
// 타일을 다시 만들면 같이 고친다(커튼이 건축물대장 동 수 24,520을 적고 있었다. 대장은 회귀 입력이고 입체 건물은 이 타일이다)
export const NSDI_BUILDING_COUNT = 27_098
export const NSDI_SOURCE = "dump-nsdi"
// 구 밖 배경 건물(OSM, 구 경계 밖 1.5km 안만). 24라운드 전엔 OSM 건물 전체에 "구 안 제외" within 필터를 걸었는데
// maplibre within 은 폴리곤 피처를 판정하지 않아 구 안에도 반투명 OSM 건물이 겹쳐 있었다(1,338동 실측) → 빌드 때 구 밖만 따로 뽑는다
export const HAS_CONTEXT_BUILDINGS = true
export const CONTEXT_SOURCE = "dump-context"
// 추출 범위. 그 밖은 타일이 없어 빈 바탕이라 카메라를 안에 가둔다
export const BASEMAP_BOUNDS: [[number, number], [number, number]] = [
  [127.02, 37.49],
  [127.16, 37.6],
]

// Protomaps light 플레이버를 도면지 톤(sunlight-fund --paper-2 #e9e3d3)에 맞춘다. 데이터 색(초록·파랑·주황 램프)과 겹치지 않게 바탕은 회색 기운만
const PAPER: Partial<Flavor> = {
  background: "#e9e3d3",
  earth: "#efe9dc",
  buildings: "#dcd5c4",
  water: "#cfd6d3",
  park_a: "#dfe2cf",
  park_b: "#d4dbc4",
  wood_a: "#d8ddc8",
  wood_b: "#cbd5bd",
  scrub_a: "#dcdfcd",
  scrub_b: "#d0d7c3",
  school: "#e9e3d3",
  hospital: "#ebe2d8",
  industrial: "#e4e1d6",
  pedestrian: "#e8e1d0",
  landcover: {
    grassland: "#e2e4cf",
    barren: "#ece6d6",
    urban_area: "#e9e3d3",
    farmland: "#e3e5d0",
    glacier: "#ffffff",
    scrub: "#e3e3cd",
    forest: "#d4dbc4",
  },
  minor_a: "#f5f1e6",
  minor_b: "#fbf8f0",
  major: "#fbf8f0",
  highway: "#fdfbf5",
  other: "#f3eee2",
  minor_service: "#f3eee2",
  minor_casing: "#ded7c6",
  minor_service_casing: "#e3ddcd",
  link_casing: "#ded7c6",
  major_casing_early: "#d8d0bd",
  major_casing_late: "#d8d0bd",
  highway_casing_early: "#d2cab6",
  highway_casing_late: "#d2cab6",
  railway: "#bbb6a6",
  boundaries: "#bdb7a6",
  roads_label_minor: "#8b8472",
  roads_label_minor_halo: "#f5f1e6",
  roads_label_major: "#6f6858",
  roads_label_major_halo: "#f5f1e6",
  subplace_label: "#7c7563",
  subplace_label_halo: "#efe9dc",
  city_label: "#4a4538",
  city_label_halo: "#efe9dc",
  ocean_label: "#6b86a3",
}

// 다크(17라운드, sunlight-fund 밤 지도): 짙은 청록 바탕, 길은 한 단계 밝게, 라벨은 따뜻한 회백
const NIGHT: Partial<Flavor> = {
  background: "#0c1114",
  earth: "#10161a",
  buildings: "#1c252b",
  water: "#0a1216",
  park_a: "#142019",
  park_b: "#17261c",
  wood_a: "#141f18",
  wood_b: "#17261c",
  scrub_a: "#141e1a",
  scrub_b: "#17241f",
  school: "#161e22",
  hospital: "#1a1f22",
  industrial: "#151d21",
  pedestrian: "#171f23",
  landcover: { grassland: "#121b16", barren: "#141a1c", urban_area: "#10161a", farmland: "#121b16", glacier: "#1b2226", scrub: "#131c17", forest: "#122019" },
  minor_a: "#1a2228",
  minor_b: "#1e272d",
  major: "#242e35",
  highway: "#2a353c",
  other: "#182026",
  minor_service: "#182026",
  minor_casing: "#0e1418",
  minor_service_casing: "#0e1418",
  link_casing: "#0e1418",
  major_casing_early: "#0c1114",
  major_casing_late: "#0c1114",
  highway_casing_early: "#0c1114",
  highway_casing_late: "#0c1114",
  railway: "#3a464d",
  boundaries: "#3a464d",
  roads_label_minor: "#8d8778",
  roads_label_minor_halo: "#10161a",
  roads_label_major: "#a19b8f",
  roads_label_major_halo: "#10161a",
  subplace_label: "#928c7f",
  subplace_label_halo: "#10161a",
  city_label: "#d6d0c3",
  city_label_halo: "#10161a",
  ocean_label: "#6f8fae",
}

// 모형 보기(23라운드 카툰 → 24라운드 실사 → 26라운드 디오라마): 밝은 회백 도시 땅 · 흰 길 · 자연 녹지 · 청록 강(레퍼런스 강릉 지도 물빛). 항공사진을 깨끗하게 칠한 톤.
// 데이터 램프(초록·파랑·앰버·청회)가 건물 위에 서야 해서 땅은 채도를 눌렀다(녹지·물만 색이 있다)
const TOON: Partial<Flavor> = {
  background: "#dcd9d2",
  earth: "#e4e2dc",
  buildings: "#d9d5cc",
  water: "#93c5be",
  park_a: "#bfd3a4",
  park_b: "#b2ca95",
  wood_a: "#a8c48c",
  wood_b: "#98b97b",
  scrub_a: "#bcd09f",
  scrub_b: "#afc792",
  school: "#e3e0d6",
  hospital: "#e6e0da",
  industrial: "#dddbd5",
  pedestrian: "#e9e6df",
  landcover: { grassland: "#c6d8ab", barren: "#e0dcd1", urban_area: "#e4e2dc", farmland: "#d2dbb1", glacier: "#ffffff", scrub: "#bcd09f", forest: "#9fbe83" },
  minor_a: "#f6f5f1",
  minor_b: "#ffffff",
  major: "#ffffff",
  highway: "#fdf8ee",
  other: "#f1efea",
  minor_service: "#f1efea",
  minor_casing: "#cfcbc2",
  minor_service_casing: "#d6d2ca",
  link_casing: "#cfcbc2",
  major_casing_early: "#c7c2b7",
  major_casing_late: "#c7c2b7",
  highway_casing_early: "#c9bda3",
  highway_casing_late: "#c9bda3",
  railway: "#aaa69c",
  boundaries: "#b3aea2",
  roads_label_minor: "#7d786d",
  roads_label_minor_halo: "#f6f5f1",
  roads_label_major: "#625d52",
  roads_label_major_halo: "#ffffff",
  subplace_label: "#6f6a5f",
  subplace_label_halo: "#e4e2dc",
  city_label: "#423e35",
  city_label_halo: "#e4e2dc",
  ocean_label: "#3f6f80",
}
// 모형 밤: 짙은 청록 땅 · 검푸른 숲 · 깊은 청록 강 · 한 단계 밝은 길(건물 창 불빛이 주인공)
const TOON_NIGHT: Partial<Flavor> = {
  ...NIGHT,
  background: "#0d171b",
  earth: "#111d21",
  water: "#0c2a2f",
  park_a: "#142a22",
  park_b: "#163025",
  wood_a: "#132a20",
  wood_b: "#163124",
  scrub_a: "#142a22",
  scrub_b: "#173024",
  landcover: { grassland: "#152a21", barren: "#151f22", urban_area: "#111d21", farmland: "#162b22", glacier: "#1b2226", scrub: "#142a22", forest: "#132a20" },
  minor_a: "#1d2b31",
  minor_b: "#223238",
  major: "#283a41",
  highway: "#2f434a",
}

// 아이콘(스프라이트)이 필요한 레이어와 분석에 소음인 라벨은 뺀다. 스프라이트를 안 받으니 외부 요청도 없다
const DROP = new Set(["pois", "roads_oneway", "roads_shields", "address_label", "places_country", "places_region", "boundaries_country"])

// origin이 붙은 절대 URL. pmtiles 프로토콜은 상대 경로를 페이지 기준으로 풀지 않는다
export function basemapUrl(file: string): string {
  const origin = typeof window !== "undefined" ? window.location.origin : ""
  return `${origin}${BASEMAP_PATH}/${file}`
}

// ring = 구 경계 [lat, lng][]. 구 안의 OSM 동네 라벨(법정동)은 우리 행정동 라벨과 겹치니 밖에만 남긴다
export type BasemapTheme = "light" | "dark"
// 입체 보기의 표현(23라운드): 도면(종이 톤·지도 압출 건물) · 모형(24라운드 실사 톤·three 건물, components/dumping/toon-layer.ts)
export type BasemapLook = "paper" | "model"
// 지형 과장 배율. 지도 setTerrain 과 모형 건물·나무 바닥 높이가 같은 값을 써야 땅에 붙는다
export const TERRAIN_EXAG = 1.4
/** diorama: 모형 디오라마가 실제로 서 있을 때(모형 + 입체). 평면이면 모형 표현이라도 바탕 기호를 살린다(평면엔 three 건물이 없어 지명이 가려질 일이 없다, 26라운드 검증) */
export function buildBasemapStyle(ring: [number, number][], theme: BasemapTheme = "light", look: BasemapLook = "paper", diorama = look === "model"): StyleSpecification {
  const model = look === "model"
  const flavor: Flavor = theme === "dark" ? { ...namedFlavor("dark"), ...(model ? TOON_NIGHT : NIGHT) } : { ...namedFlavor("light"), ...(model ? TOON : PAPER) }
  const ringPoly = { type: "Polygon" as const, coordinates: [ring.map((p) => [p[1], p[0]])] }
  // 모형은 바탕 기호(길 이름·지명·물 이름)를 전부 숨긴다: 기호는 건물에 가려지지 않아 지붕 위에 길 이름이 떴고(24라운드),
  // 26라운드 디오라마는 구 밖이 탁자라 구 밖 지명이 허공에 뜬다. 이름은 우리 동 라벨·랜드마크 이름표가 맡는다.
  // 빼지 않고 visibility 로만 숨겨 네 조합(테마 × 표현)의 레이어 구성을 같게 둔다(dumping-map 은 setStyle 대신 칠하기만 바꾼다, restyleBasemap)
  const layers: LayerSpecification[] = basemapLayers(BASEMAP_SOURCE, flavor, { lang: "ko" })
    .filter((l) => !DROP.has(l.id))
    .map((l) => (l.type === "symbol" ? ({ ...l, layout: { ...l.layout, visibility: model && diorama ? "none" : "visible" } } as LayerSpecification) : l))
    .map((l) => {
      if (l.id !== "places_subplace") return l
      const filter: FilterSpecification = [
        "all",
        ["in", ["get", "kind"], ["literal", ["neighbourhood", "macrohood"]]],
        ["!", ["within", ringPoly]],
      ]
      return { ...l, filter }
    })
  // 음영은 물 아래(물 위에 그늘이 지면 강이 탁해진다)
  const waterAt = Math.max(0, layers.findIndex((l) => l.id === "water"))
  layers.splice(waterAt, 0, {
    id: HILLSHADE_LAYER,
    type: "hillshade",
    source: DEM_HILL_SOURCE,
    // 모형은 음영도 초록 기운(산이 숲으로 읽히게, sunlight 모형 hillshade-accent 와 같은 생각)
    paint:
      theme === "dark"
        ? { "hillshade-exaggeration": 0.35, "hillshade-shadow-color": "#05080a", "hillshade-highlight-color": model ? "#2f4a44" : "#3a4a52" }
        : model
          ? { "hillshade-exaggeration": 0.36, "hillshade-shadow-color": "#6f7c68", "hillshade-highlight-color": "#fbfaf4", "hillshade-accent-color": "#9db38c" }
          : { "hillshade-exaggeration": 0.3, "hillshade-shadow-color": "#6b7266", "hillshade-highlight-color": "#ffffff" },
  })
  return {
    version: 8,
    glyphs: `${basemapUrl("fonts")}/{fontstack}/{range}.pbf`,
    sources: {
      [BASEMAP_SOURCE]: {
        type: "vector",
        url: `pmtiles://${basemapUrl("gwangjin.pmtiles")}`,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors · Protomaps',
      },
      [DEM_SOURCE]: {
        type: "raster-dem",
        url: `pmtiles://${basemapUrl("dem.pmtiles")}`,
        encoding: "terrarium",
        tileSize: 256,
        attribution: "지형 Mapzen · AWS Terrain Tiles",
      },
      [DEM_HILL_SOURCE]: {
        type: "raster-dem",
        url: `pmtiles://${basemapUrl("dem.pmtiles")}`,
        encoding: "terrarium",
        tileSize: 256,
      },
      ...(HAS_NSDI_BUILDINGS
        ? // promoteId: 건물 UFID(id 속성)를 피처 id로. 격자 칸 값을 feature-state로 붙여 건물 색을 칠한다(dumping-map 건물 조인)
          { [NSDI_SOURCE]: { type: "vector" as const, url: `pmtiles://${basemapUrl("buildings.pmtiles")}`, promoteId: "id", attribution: "건물 국토교통부 GIS건물통합정보 · 건축물대장" } }
        : {}),
      ...(HAS_CONTEXT_BUILDINGS ? { [CONTEXT_SOURCE]: { type: "vector" as const, url: `pmtiles://${basemapUrl("context-buildings.pmtiles")}` } } : {}),
    },
    layers,
  }
}
