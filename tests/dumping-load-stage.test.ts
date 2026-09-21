import assert from "node:assert/strict"
import { test } from "node:test"
import { LOAD_NONE, loadStageOf } from "../lib/dumping/load-stage"

// 로딩 커튼 단계(독립 리뷰 F5): 이벤트 순서가 어떻든 표시가 실제 준비 상태와 맞아야 한다
test("map → icons → idle: 아이콘이 먼저 와도 건물 결합(idle) 전에는 4단계가 되지 않는다", () => {
  let r = { ...LOAD_NONE, data: true }
  assert.equal(loadStageOf(r), 1)
  r = { ...r, map: true }
  assert.equal(loadStageOf(r), 2)
  r = { ...r, icons: true }
  assert.equal(loadStageOf(r), 2) // 03 건물 결합 대기 중. 04만 먼저 체크
  r = { ...r, idle: true }
  assert.equal(loadStageOf(r), 4)
})

test("map → idle → icons: 순서대로 오면 3에서 4로", () => {
  let r = { ...LOAD_NONE, data: true, map: true }
  r = { ...r, idle: true }
  assert.equal(loadStageOf(r), 3)
  r = { ...r, icons: true }
  assert.equal(loadStageOf(r), 4)
})

test("자료가 아직이면 지도 이벤트가 와도 0단계(자료 요청 중)", () => {
  assert.equal(loadStageOf(LOAD_NONE), 0)
  assert.equal(loadStageOf({ ...LOAD_NONE, map: true, idle: true, icons: true }), 0)
})
