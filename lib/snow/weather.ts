// 지도 날씨(4라운드 후속, 사용자: "날씨에 따라 맵에 날씨를 구현"). 예보 라우트의 WMO 코드(기상청 단기예보는 PTY·SKY를 WMO로 옮김, 폴백 Open-Meteo는 원래 WMO)를 지도 효과로.
// 눈=눈송이, 비=빗줄기, 안개=흐린 덮개, 그 밖=없음. 강도 0~1. 시나리오 적설(대응 단계 탭)은 이와 별개로 눈 강도를 더한다(둘 중 큰 값)

export type WeatherKind = "none" | "snow" | "rain" | "fog"
export interface WeatherFx {
  kind: WeatherKind
  level: number // 0~1
}

export const WMO_KO: Record<number, string> = { 0: "맑음", 1: "대체로 맑음", 2: "구름 조금", 3: "흐림", 45: "안개", 48: "안개", 51: "이슬비", 53: "이슬비", 55: "이슬비", 56: "언 이슬비", 57: "언 이슬비", 61: "비", 63: "비", 65: "강한 비", 66: "언 비", 67: "언 비", 68: "비 또는 눈", 71: "눈", 73: "눈", 75: "강한 눈", 77: "싸락눈", 80: "소나기", 81: "소나기", 82: "강한 소나기", 85: "소낙눈", 86: "강한 소낙눈", 95: "뇌우", 96: "우박 뇌우", 99: "우박 뇌우" }
export const weatherLabel = (code: number) => WMO_KO[code] ?? "관측 없음"

export function weatherFx(code: number | null | undefined, snowCmPerHour = 0): WeatherFx {
  if (code == null) return { kind: "none", level: 0 }
  if (code === 68 || (code >= 71 && code <= 77) || code === 85 || code === 86) return { kind: "snow", level: Math.min(1, Math.max(0.35, snowCmPerHour / 2, code === 75 || code === 86 ? 0.9 : 0.5)) }
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82) || code >= 95) return { kind: "rain", level: code === 65 || code === 82 || code >= 95 ? 0.9 : code >= 61 ? 0.6 : 0.35 }
  if (code === 45 || code === 48) return { kind: "fog", level: 0.6 }
  return { kind: "none", level: 0 }
}
// 시연·확인용 미리보기(실황이 맑을 때 효과를 보여 준다)
export type WeatherMode = "live" | "snow" | "rain" | "fog"
export const WEATHER_PREVIEW: { id: WeatherMode; label: string; fx: WeatherFx | null }[] = [
  { id: "live", label: "실황", fx: null },
  { id: "snow", label: "눈", fx: { kind: "snow", level: 0.7 } },
  { id: "rain", label: "비", fx: { kind: "rain", level: 0.6 } },
  { id: "fog", label: "안개", fx: { kind: "fog", level: 0.6 } },
]
