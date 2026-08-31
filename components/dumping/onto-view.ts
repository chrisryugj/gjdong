// 온톨로지 그래프 뷰 상수·라벨 노출 규칙 — 순수 함수로 분리해 하네스에서 검증한다.

export const FOV = 1100 // 원근 초점거리
export const DEFAULT_ZOOM = 1.25 // 기본 보기 확대 — 구면(반지름 340)이 1200×860 캔버스를 채우는 수준

// 회전·투영 후 화면 스케일: 깊이(z)와 줌(k)의 곱
export function projScale(z: number, k: number): number {
  return (FOV / (FOV + z)) * k
}

// 라벨 노출 판정 — 포커스·이웃은 항상, 나머지는 깊이(z)로만.
// 예전 규칙(projScale > 0.98)은 줌 k가 곱해져 줌아웃 한 틱에 라벨이 전멸했다 — k와 무관해야 한다.
export function labelVisible(z: number, _k: number, focusOrNeighbor: boolean): boolean {
  if (focusOrNeighbor) return true
  return FOV / (FOV + z) > 0.95 // 정면 반구 + 여유(z < ~58)
}

// 라벨 겹침 제거 — 앞쪽(입력 순서)부터 그리디로 채우고, 이미 놓인 라벨과 박스가
// 겹치면 숨긴다. keep(포커스·이웃)은 충돌 검사 없이 항상 유지.
export interface LabelCand {
  id: string
  x: number
  y: number // 라벨 박스 중심
  w: number
  h: number
  keep: boolean
}

export function declutterLabels(cands: LabelCand[]): Set<string> {
  const placed: LabelCand[] = []
  const out = new Set<string>()
  const ordered = [...cands.filter((c) => c.keep), ...cands.filter((c) => !c.keep)]
  for (const c of ordered) {
    if (!c.keep) {
      const clash = placed.some(
        (p) => Math.abs(p.x - c.x) < (p.w + c.w) / 2 && Math.abs(p.y - c.y) < (p.h + c.h) / 2,
      )
      if (clash) continue
    }
    placed.push(c)
    out.add(c.id)
  }
  return out
}
