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
// 추출 범위. 그 밖은 타일이 없어 빈 바탕이라 카메라를 안에 가둔다
export const BASEMAP_BOUNDS: [[number, number], [number, number]] = [
  [127.02, 37.49],
  [127.16, 37.6],
]

// Protomaps light 플레이버를 상황실 종이 톤(--dump-ground #e8ebe6)에 맞춘다. 데이터 색(초록·파랑·주황 램프)과 겹치지 않게 바탕은 회색 기운만
const PAPER: Partial<Flavor> = {
  background: "#e8ebe6",
  earth: "#eceee9",
  buildings: "#d8d6ce",
  water: "#c8d8de",
  park_a: "#dbe6dc",
  park_b: "#cfe0d2",
  wood_a: "#d3e1d3",
  wood_b: "#c4d9c6",
  scrub_a: "#d6e2dc",
  scrub_b: "#c9dbd2",
  school: "#e6e4dc",
  hospital: "#e8e2e0",
  industrial: "#e1e5e6",
  pedestrian: "#e6e4da",
  landcover: {
    grassland: "#dfe8dc",
    barren: "#ece9df",
    urban_area: "#e8ebe6",
    farmland: "#e0e8dc",
    glacier: "#ffffff",
    scrub: "#e0e6d8",
    forest: "#cfdfd2",
  },
  minor_a: "#f3f4f1",
  minor_b: "#ffffff",
  major: "#ffffff",
  highway: "#ffffff",
  other: "#f1f2ee",
  minor_service: "#f1f2ee",
  minor_casing: "#dcdfd9",
  minor_service_casing: "#e2e4df",
  link_casing: "#dcdfd9",
  major_casing_early: "#d5d8d2",
  major_casing_late: "#d5d8d2",
  highway_casing_early: "#cfd3cc",
  highway_casing_late: "#cfd3cc",
  railway: "#b9bfc0",
  boundaries: "#b8bcb6",
  roads_label_minor: "#8a8f89",
  roads_label_minor_halo: "#ffffff",
  roads_label_major: "#6f746e",
  roads_label_major_halo: "#ffffff",
  subplace_label: "#7a7f79",
  subplace_label_halo: "#eceee9",
  city_label: "#4b504a",
  city_label_halo: "#eceee9",
  ocean_label: "#6b8fb0",
}

// 아이콘(스프라이트)이 필요한 레이어와 분석에 소음인 라벨은 뺀다. 스프라이트를 안 받으니 외부 요청도 없다
const DROP = new Set(["pois", "roads_oneway", "roads_shields", "address_label", "places_country", "places_region", "boundaries_country"])

// origin이 붙은 절대 URL. pmtiles 프로토콜은 상대 경로를 페이지 기준으로 풀지 않는다
export function basemapUrl(file: string): string {
  const origin = typeof window !== "undefined" ? window.location.origin : ""
  return `${origin}${BASEMAP_PATH}/${file}`
}

// ring = 구 경계 [lat, lng][]. 구 안의 OSM 동네 라벨(법정동)은 우리 행정동 라벨과 겹치니 밖에만 남긴다
export function buildBasemapStyle(ring: [number, number][]): StyleSpecification {
  const flavor: Flavor = { ...namedFlavor("light"), ...PAPER }
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
    paint: { "hillshade-exaggeration": 0.3, "hillshade-shadow-color": "#6b7266", "hillshade-highlight-color": "#ffffff" },
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
    },
    layers,
  }
}
