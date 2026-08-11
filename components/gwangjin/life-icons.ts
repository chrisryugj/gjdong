// 생활 레이어 공용 시각 언어 — 지도 마커(divIcon HTML 문자열)와 칩(lucide)이 같은 도상을 쓴다.
// 지하철은 아이콘 대신 서울 지하철 정식 노선색 동그라미(환승역=겹친 두 개)가 시민의 멘탈모델.
// 마커 형태는 실제 도시 기호 문법을 따른다(2026-08-11): 시설 = 사각 간판(병원 십자·주차 P 표지판),
// 쉼터 = 집 실루엣, 탈것(따릉이·EV) = 원형. 형태가 곧 "무엇인지"를 말하게.

import type { LifeLayerKind } from "@/components/gwangjin/use-gwangjin-life"

/** 노선 번호 → 서울 지하철 정식 노선색 (광진 관내 2·5·7호선) */
export const LINE_COLOR_BY_NUM: Record<string, string> = {
  "2": "#00a84d",
  "5": "#996cac",
  "7": "#747f00",
}

/** 레이어 대표색 — 칩 활성 배경·마커 배경 공용. 따릉이는 2호선 초록·약국 초록과 톤 분리(라임) */
export const LIFE_KIND_COLOR: Record<LifeLayerKind, string> = {
  station: "#1d4ed8",
  bike: "#65a30d",
  ev: "#0284c7",
  parking: "#2563eb",
  er: "#dc2626",
  pharm: "#0ea371",
  aed: "#059669",
  shelter: "#0e7490",
  library: "#7c3aed",
}

/** 마커 형태 — sign=사각 간판(시설), house=집 실루엣(쉼터), circle=원형(탈것) */
export const LIFE_MARKER_SHAPE: Record<Exclude<LifeLayerKind, "station">, "sign" | "house" | "circle"> = {
  er: "sign",
  pharm: "sign",
  aed: "sign",
  parking: "sign",
  library: "sign",
  shelter: "house",
  bike: "circle",
  ev: "circle",
}

// divIcon용 스트로크 SVG (lucide 도형과 동일한 시각 언어, 13px로 렌더)
const svg = (inner: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`

export const LIFE_ICON_SVG: Record<Exclude<LifeLayerKind, "station">, string> = {
  er: svg(
    `<path d="M11 3a1 1 0 0 0-1 1v5H5a1 1 0 0 0-1 1v4a1 1 0 0 0 1 1h5v5a1 1 0 0 0 1 1h2a1 1 0 0 0 1-1v-5h5a1 1 0 0 0 1-1v-4a1 1 0 0 0-1-1h-5V4a1 1 0 0 0-1-1h-2z" fill="currentColor" stroke="none"/>`,
  ),
  aed: svg(
    `<path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" fill="currentColor" stroke="none"/><polyline points="13 8 11 12 14 12 12 16" stroke="#fff" stroke-width="1.8" fill="none"/>`,
  ),
  pharm: svg(
    `<path d="m10.5 20.5 10-10a4.95 4.95 0 1 0-7-7l-10 10a4.95 4.95 0 1 0 7 7Z"/><path d="m8.5 8.5 7 7"/>`,
  ),
  bike: svg(
    `<circle cx="18.5" cy="17.5" r="3.5"/><circle cx="5.5" cy="17.5" r="3.5"/><circle cx="15" cy="5" r="1" fill="currentColor" stroke="none"/><path d="M12 17.5V14l-3-3 4-3 2 3h2"/>`,
  ),
  ev: svg(`<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" fill="currentColor" stroke="none"/>`),
  parking: svg(
    `<rect x="3" y="3" width="18" height="18" rx="2" fill="currentColor" stroke="none"/><path d="M9 17V7h4a3 3 0 0 1 0 6H9" stroke="#fff" stroke-width="2.2" fill="none"/>`,
  ),
  shelter: svg(
    `<line x1="2" y1="12" x2="22" y2="12"/><line x1="12" y1="2" x2="12" y2="22"/><path d="m20 16-4-4 4-4"/><path d="m4 8 4 4-4 4"/><path d="m16 4-4 4-4-4"/><path d="m8 20 4-4 4 4"/>`,
  ),
  library: svg(
    `<path d="M12 7v14"/><path d="M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z"/>`,
  ),
}
