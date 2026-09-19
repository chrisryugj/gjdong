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
// 국가공간정보포털 GIS건물통합정보(광진구) 타일. scripts/dumping-buildings.mjs로 만든 buildings.pmtiles가 public에 있으면 true로.
// 구 안 건물은 이 소스(전수·층수·높이)로, OSM 건물은 구 밖만 그린다(dumping-map declareLayers)
export const HAS_NSDI_BUILDINGS = true
export const NSDI_SOURCE = "dump-nsdi"
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

// 아이콘(스프라이트)이 필요한 레이어와 분석에 소음인 라벨은 뺀다. 스프라이트를 안 받으니 외부 요청도 없다
const DROP = new Set(["pois", "roads_oneway", "roads_shields", "address_label", "places_country", "places_region", "boundaries_country"])

// origin이 붙은 절대 URL. pmtiles 프로토콜은 상대 경로를 페이지 기준으로 풀지 않는다
export function basemapUrl(file: string): string {
  const origin = typeof window !== "undefined" ? window.location.origin : ""
  return `${origin}${BASEMAP_PATH}/${file}`
}

// ring = 구 경계 [lat, lng][]. 구 안의 OSM 동네 라벨(법정동)은 우리 행정동 라벨과 겹치니 밖에만 남긴다
export type BasemapTheme = "light" | "dark"
export function buildBasemapStyle(ring: [number, number][], theme: BasemapTheme = "light"): StyleSpecification {
  const flavor: Flavor = theme === "dark" ? { ...namedFlavor("dark"), ...NIGHT } : { ...namedFlavor("light"), ...PAPER }
  const ringPoly = { type: "Polygon" as const, coordinates: [ring.map((p) => [p[1], p[0]])] }
  const layers: LayerSpecification[] = basemapLayers(BASEMAP_SOURCE, flavor, { lang: "ko" })
    .filter((l) => !DROP.has(l.id))
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
    paint:
      theme === "dark"
        ? { "hillshade-exaggeration": 0.35, "hillshade-shadow-color": "#05080a", "hillshade-highlight-color": "#3a4a52" }
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
        ? { [NSDI_SOURCE]: { type: "vector" as const, url: `pmtiles://${basemapUrl("buildings.pmtiles")}`, attribution: "건물 국토교통부 GIS건물통합정보" } }
        : {}),
    },
    layers,
  }
}
