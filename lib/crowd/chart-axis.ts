// 상세 차트 Y축 눈금 — recharts 기본 눈금은 8,500·17,000처럼 떨어져 만 단위 한 자리로 못 쓴다.
// 간격을 1·2·5×10ⁿ으로만 골라, 축 최대값으로 정한 단위(만·k) 소수 한 자리가 늘 정확히 떨어지게 한다
// (2.5×10ⁿ을 빼는 이유: 2,500 → "0.3만"처럼 반올림이 생긴다). (2026-10-05 실측: 한 축에 "8500"과 "1.7만")

/** 0부터 max를 덮는 눈금(대략 count칸). max ≤ 0이면 [0] */
export function niceTicks(max: number, count = 4): number[] {
  if (!(max > 0)) return [0]
  const raw = max / count
  const pow = 10 ** Math.floor(Math.log10(raw))
  const step = ([1, 2, 5, 10].find((m) => m * pow >= raw) ?? 10) * pow
  const top = Math.ceil(max / step) * step
  const ticks: number[] = []
  for (let v = 0; v <= top + step / 2; v += step) ticks.push(Math.round(v))
  return ticks
}
