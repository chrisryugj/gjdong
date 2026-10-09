// /dumping 지도 날씨(23라운드, 2026-10-09 사용자: "현재 날씨에 따라 지도에 반영, 수동으로도 설정"). 순수 계산.
// 실황은 헤더가 이미 받는 기상청 단기예보(/api/snow/forecast, WMO 코드로 옮긴 값)이고, 비·눈·안개 판정은 /snow와 같은 lib/snow/weather.ts weatherFx.
// 여기서는 그 위에 맑음·흐림을 가르고(WMO 0~2 맑음, 3 흐림), 날씨마다 지도 분위기 값(조명 배율·그림자·구름 수·눈 덮임·젖은 땅·하늘 안개)을 정한다.
// 데이터 문법은 안 건드린다: 지도 압출·모형 건물의 칸 색, 기둥·숫자는 그대로이고, 눈은 데이터 색이 없는 지붕(바탕 없음)에만 쌓인다(toon-layer)
import type { SkySpecification } from "maplibre-gl"
import { weatherFx } from "@/lib/snow/weather"

export type MapWeather = "clear" | "cloudy" | "rain" | "snow" | "fog"
export type SkyChoice = "live" | MapWeather
export interface SkyWeather {
  kind: MapWeather
  /** 0~1 강도(구름 수·빗줄기·눈송이 수) */
  level: number
}

export const SKY_CHOICES: { id: SkyChoice; label: string }[] = [
  { id: "live", label: "지금" },
  { id: "clear", label: "맑음" },
  { id: "cloudy", label: "흐림" },
  { id: "rain", label: "비" },
  { id: "snow", label: "눈" },
  { id: "fog", label: "안개" },
]
/** 손으로 고른 날씨의 강도(실황이 아니니 보기 좋은 중간값) */
const PICKED_LEVEL: Record<MapWeather, number> = { clear: 0.35, cloudy: 1, rain: 0.65, snow: 0.7, fog: 0.65 }

/** 실황 WMO 코드 → 지도 날씨. 코드가 없으면(예보를 못 받았으면) 맑음 */
export function weatherOfCode(code: number | null | undefined): SkyWeather {
  if (code == null) return { kind: "clear", level: 0.35 }
  const fx = weatherFx(code)
  if (fx.kind !== "none") return { kind: fx.kind, level: fx.level }
  if (code === 3) return { kind: "cloudy", level: 1 }
  // 0 맑음 · 1 대체로 맑음 · 2 구름 조금: 해는 그대로, 구름만 늘린다
  return { kind: "clear", level: code === 2 ? 0.75 : code === 1 ? 0.5 : 0.25 }
}

export function skyOf(choice: SkyChoice, liveCode: number | null | undefined): SkyWeather {
  return choice === "live" ? weatherOfCode(liveCode) : { kind: choice, level: PICKED_LEVEL[choice] }
}

export interface WeatherLook {
  /** 해 세기·주변광 배율(테마 기본값에 곱한다) */
  sun: number
  hemi: number
  /** 그림자 진하기(0~1) */
  shadow: number
  /** 주변광 하늘색·땅색(없으면 테마 기본) */
  skyColor?: string
  groundColor?: string
  sunColor?: string
  /** 보이는 구름 수(0~10)와 색 */
  clouds: number
  cloud: string
  cloudInk: string
  /** 눈 덮임(지붕·나무·땅, 0~1)과 젖은 땅(0~1) */
  snow: number
  wet: number
}

export function weatherLook(w: SkyWeather, dark: boolean): WeatherLook {
  const lv = Math.max(0, Math.min(1, w.level))
  const white = { cloud: dark ? "#aeb8c4" : "#ffffff", cloudInk: dark ? "#4a5562" : "#9aa6ad" }
  switch (w.kind) {
    case "clear":
      return { sun: 1, hemi: 1, shadow: dark ? 0.45 : 0.5, clouds: 5 + Math.round(lv * 4), ...white, snow: 0, wet: 0 }
    case "cloudy":
      return { sun: 0.45, hemi: 1.32, shadow: 0.18, skyColor: dark ? "#6f7a8a" : "#f2f3f3", groundColor: dark ? "#262a30" : "#c9cbcb", clouds: 10, cloud: dark ? "#6a7482" : "#f1f3f4", cloudInk: dark ? "#2c343d" : "#8f9aa3", snow: 0, wet: 0 }
    case "rain":
      return { sun: 0.24, hemi: 1.28, shadow: 0.08, skyColor: dark ? "#5d6a7c" : "#e1e7ed", groundColor: dark ? "#1b2027" : "#97a1ac", sunColor: dark ? "#93a5c2" : "#dbe5f2", clouds: 10, cloud: dark ? "#4f5a68" : "#b6c0ca", cloudInk: dark ? "#232a32" : "#68747f", snow: 0, wet: 0.35 + 0.5 * lv }
    case "snow":
      return { sun: 0.45, hemi: 1.34, shadow: 0.14, skyColor: dark ? "#9caec6" : "#f6f9fc", groundColor: dark ? "#3a4452" : "#e1e7ee", sunColor: dark ? "#c4d2ea" : "#eef3ff", clouds: 9, cloud: dark ? "#8995a6" : "#eef2f6", cloudInk: dark ? "#3c4652" : "#a4afb8", snow: 0.55 + 0.45 * lv, wet: 0 }
    case "fog":
      return { sun: 0.35, hemi: 1.38, shadow: 0.05, skyColor: dark ? "#7b8696" : "#f3f4f4", groundColor: dark ? "#2b3036" : "#dadbd9", clouds: 0, ...white, snow: 0, wet: 0 }
  }
}

/** 하늘 없음(맑음·평면): maplibre 기본값과 같다(투명 하늘, 안개 없음) */
export const NO_SKY: SkySpecification = { "sky-color": "transparent", "horizon-color": "transparent", "fog-color": "transparent", "fog-ground-blend": 1, "atmosphere-blend": 0 }

/** MapLibre 하늘·안개(입체에서만 보인다). 맑음은 지금 지도 그대로(하늘 없음) */
export function mapSkyFor(w: SkyWeather, dark: boolean): SkySpecification {
  const lv = Math.max(0, Math.min(1, w.level))
  const sky = (s: string, h: string, f: string, ground: number, horizon: number): SkySpecification => ({ "sky-color": s, "horizon-color": h, "fog-color": f, "fog-ground-blend": ground, "horizon-fog-blend": horizon, "sky-horizon-blend": 0.85, "atmosphere-blend": 0.4 })
  switch (w.kind) {
    case "clear":
      return NO_SKY
    case "cloudy":
      return dark ? sky("#1e2733", "#2b3540", "#212a33", 0.75, 0.7) : sky("#cfd6dc", "#e6e8e8", "#e4e6e4", 0.75, 0.7)
    case "rain":
      return dark ? sky("#151d27", "#232d38", "#1c252e", 0.6 - 0.15 * lv, 0.8) : sky("#9eabb8", "#c5cdd4", "#c0c8cf", 0.6 - 0.15 * lv, 0.8)
    case "snow":
      return dark ? sky("#26303d", "#3a4655", "#323d4a", 0.55 - 0.1 * lv, 0.8) : sky("#dfe6ec", "#f1f4f7", "#edf1f4", 0.55 - 0.1 * lv, 0.8)
    case "fog":
      return dark ? sky("#2a313a", "#3a424c", "#363e47", 0.32 - 0.2 * lv, 1) : sky("#e6e9ea", "#eef0f0", "#eceeee", 0.32 - 0.2 * lv, 1)
  }
}

/** 화면 전체 옅은 색조(weather-overlay, 움직이지 않는 덮개). 조망처럼 하늘이 안 보이는 화면에서도 날씨가 읽히게. 데이터 색이 흐려지지 않게 12% 아래 */
export function tintOf(w: SkyWeather, dark: boolean): string | null {
  const lv = Math.max(0, Math.min(1, w.level))
  switch (w.kind) {
    case "cloudy":
      return dark ? "rgba(70,80,92,0.10)" : "rgba(128,136,146,0.07)"
    case "rain":
      return dark ? "rgba(20,32,48,0.16)" : `rgba(64,84,110,${(0.07 + 0.05 * lv).toFixed(3)})`
    case "snow":
      return dark ? "rgba(170,190,214,0.08)" : "rgba(236,242,250,0.10)"
    default:
      return null
  }
}

/** 빗줄기·눈송이 덮개(weather-overlay) 값. 수는 강도에 비례 */
export function precipOf(w: SkyWeather): { kind: "rain" | "snow" | "fog" | null; count: number } {
  const lv = Math.max(0, Math.min(1, w.level))
  if (w.kind === "rain") return { kind: "rain", count: Math.round(180 + 420 * lv) }
  if (w.kind === "snow") return { kind: "snow", count: Math.round(90 + 230 * lv) }
  if (w.kind === "fog") return { kind: "fog", count: 0 }
  return { kind: null, count: 0 }
}
