import { test } from "node:test"
import assert from "node:assert"
import { DEFAULT_ZOOM, declutterLabels, labelVisible, projScale } from "../components/dumping/onto-view"

// 구면 셸 배치(layout3d)와 같은 조건: 반지름 최대 340, z ∈ [-340, 340].
// 실제 그래프 69노드가 회전하며 z 전 구간을 지나므로 z를 균등 샘플해 판정한다.
const Z_SAMPLES = Array.from({ length: 69 }, (_, i) => -340 + (680 * i) / 68)

function visibleCount(k: number): number {
  return Z_SAMPLES.filter((z) => labelVisible(z, k, false)).length
}

test("기본 줌에서 정면(z<0) 노드는 전부 라벨이 보인다", () => {
  const front = Z_SAMPLES.filter((z) => z < 0)
  const shown = front.filter((z) => labelVisible(z, DEFAULT_ZOOM, false))
  assert.strictEqual(shown.length, front.length,
    `정면 ${front.length}개 중 ${shown.length}개만 라벨 표시 — 기본 뷰에서 라벨 소실`)
})

test("어떤 줌 레벨에서도 비포커스 라벨이 전멸하지 않는다 (줌아웃 라벨 소실 버그)", () => {
  // 휠 줌 클램프 [0.5, 3.5] 전 구간 스캔 — 휠 1틱 축소(×0.78) 포함
  for (let k = 0.5; k <= 3.5; k += 0.02) {
    const n = visibleCount(k)
    assert.ok(n >= Math.floor(Z_SAMPLES.length * 0.3),
      `k=${k.toFixed(2)}에서 라벨 ${n}/${Z_SAMPLES.length}개 — 줌에 따라 라벨이 사라진다`)
  }
})

test("포커스·이웃 라벨은 줌·깊이와 무관하게 항상 보인다", () => {
  for (const z of [-340, 0, 340]) for (const k of [0.5, 1, 3.5]) {
    assert.ok(labelVisible(z, k, true))
  }
})

test("겹치는 라벨은 앞쪽 하나만 남는다", () => {
  const box = (id: string, x: number, y: number, keep = false) => ({ id, x, y, w: 200, h: 20, keep })
  // 같은 자리 두 개 → 먼저 온(앞쪽) 것만
  const s1 = declutterLabels([box("front", 100, 100), box("back", 110, 105)])
  assert.deepStrictEqual([...s1], ["front"])
  // 떨어져 있으면 둘 다
  const s2 = declutterLabels([box("a", 100, 100), box("b", 100, 200)])
  assert.strictEqual(s2.size, 2)
  // keep(포커스·이웃)은 겹쳐도 항상 유지되고 자리를 선점 — 겹친 일반 라벨이 양보한다
  const s3 = declutterLabels([box("plain", 100, 100), box("focus", 105, 102, true)])
  assert.ok(s3.has("focus") && !s3.has("plain"))
  // keep끼리는 겹쳐도 둘 다 유지
  const s4 = declutterLabels([box("f1", 100, 100, true), box("f2", 105, 102, true)])
  assert.strictEqual(s4.size, 2)
})

test("기본 줌이 확대돼 그래프가 캔버스를 채운다 (정면 중앙 스케일 ≥ 1.2)", () => {
  assert.ok(projScale(0, DEFAULT_ZOOM) >= 1.2,
    `projScale(0, ${DEFAULT_ZOOM}) = ${projScale(0, DEFAULT_ZOOM)} — 기본 보기가 너무 작다`)
})
