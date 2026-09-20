// /snow 개략 단가(4라운드 후속, 2026-09-21). 냉독 3회 공통 지적 "비용이 없어 보고 형태가 아니다" → 공개 출처가 있는 단가만 싣고 출처·가정을 화면에 같이 적는다.
// 조달 단가·실시설계가 아니다. 보고 요약 한 장에는 "개략"으로 표기하고 데이터·방법 모달 "쓰인 데이터"에 출처를 둔다.

export const COST = {
  // 도로열선: 서울시 관계자 "열선 100m 설치 평균 1억원, 관리 연 360만원"(헤럴드경제 2024-02-20). 왕복 2차선 200m = 4억이라 차로당 100m 1억으로 읽는다
  heatPerLaneM: 1_000_000, // 원/m(1차로 기준)
  heatUpkeepPerLaneMYear: 36_000, // 원/m/년(1차로 기준)
  heatSource: "헤럴드경제 2024-02-20 「폭설에 효과 만점 '도로 열선' 크게 늘었다」(서울시 관계자: 100m 설치 평균 1억원 · 관리 연 360만원)",
  heatSourceUrl: "https://biz.heraldcorp.com/article/3330125",
  // 제설함: FRP 1220×720×850 소매가(제이아이세이프티, 2026-09-21 조회). 설치·충전(구 비축 제설제)은 별도
  saltBoxWon: 176_000,
  saltBoxSource: "FRP 제설함 1220×720×850 소매가 176,000원(제이아이세이프티, 2026-09-21 조회). 설치·충전은 별도(구 비축 제설제)",
  saltBoxSourceUrl: "https://jisafety.kr/product/%EC%A0%9C%EC%84%A4%ED%95%A8-%EB%AA%A8%EB%9E%98%ED%95%A8-frp%EB%85%B8%EB%9E%91-%EC%A0%81%EC%82%AC%ED%95%A8-%EB%B0%A9%EC%9E%AC%ED%95%A8-%EC%A0%9C%EC%84%A4%EB%8F%84%EA%B5%AC%ED%95%A8-%EC%97%BC%ED%99%94%EC%B9%BC%EC%8A%98%ED%95%A8-%EC%9E%AC%EC%84%A4%ED%95%A8-1220720850/514/",
  lanesAssumed: 2, // 취약구간 차로수는 행안부 파일에 없다. 이면도로 왕복 2차로를 기본 가정, 1차로 하한을 같이 보인다
} as const

export const eok = (won: number) => `${(won / 1e8).toFixed(won >= 1e9 ? 0 : 1)}억`
export const man = (won: number) => `${Math.round(won / 1e4).toLocaleString("ko-KR")}만원`

// 열선 신설 개략 비용(원): 물리 길이 × 차로수 × 단가. 상·하한 = 1차로·가정 차로
export function heatCost(meters: number, lanes = COST.lanesAssumed): { low: number; high: number; upkeepLow: number; upkeepHigh: number } {
  return {
    low: meters * COST.heatPerLaneM,
    high: meters * lanes * COST.heatPerLaneM,
    upkeepLow: meters * COST.heatUpkeepPerLaneMYear,
    upkeepHigh: meters * lanes * COST.heatUpkeepPerLaneMYear,
  }
}
export const heatCostText = (meters: number) => {
  const c = heatCost(meters)
  return `약 ${eok(c.high)}(2차로 가정, 1차로면 ${eok(c.low)}. 1차로 100m당 1억) · 관리 연 ${man(c.upkeepHigh)}(1차로면 ${man(c.upkeepLow)}. 100m당 연 360만원)`
}
