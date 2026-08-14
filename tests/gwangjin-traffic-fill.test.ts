// 교통 전 링크 채우기 — 실측 34%를 미러·전파·평균으로 채우는 3단 규칙 고정
import assert from "node:assert/strict"
import { test } from "node:test"
import { fillTrafficSpeeds, gradeBySpeed, type RoadGeoLink } from "../lib/gwangjin/traffic"

const link = (i: string, n: string, p: Array<[number, number]>, m = 50): RoadGeoLink => ({ i, n, r: "104", m, p })

test("실측 링크는 inferred=false 로 그대로 남는다", () => {
  const links = [link("a", "능동로", [[37.55, 127.08], [37.551, 127.08]])]
  const filled = fillTrafficSpeeds(links, new Map([["a", 42]]))
  assert.deepEqual(filled.get("a"), { spd: 42, inferred: false })
})

test("역방향 쌍 미러 — 같은 도로에서 양끝점이 맞바뀐 링크가 실측 속도를 물려받는다", () => {
  const up = link("up", "광나루로", [[37.55, 127.08], [37.552, 127.082]])
  const down = link("down", "광나루로", [[37.552, 127.082], [37.55, 127.08]])
  const filled = fillTrafficSpeeds([up, down], new Map([["up", 18]]))
  assert.deepEqual(filled.get("down"), { spd: 18, inferred: true })
})

test("같은 도로 연결 전파 — 끝점을 공유한 이웃으로 번지고, 더 가까운 실측이 이긴다", () => {
  // a(실측 60) - b - c - d(실측 10) 일렬 연결
  const a = link("a", "자양로", [[37.53, 127.07], [37.531, 127.07]])
  const b = link("b", "자양로", [[37.531, 127.07], [37.532, 127.07]])
  const c = link("c", "자양로", [[37.532, 127.07], [37.533, 127.07]])
  const d = link("d", "자양로", [[37.533, 127.07], [37.534, 127.07]])
  const filled = fillTrafficSpeeds([a, b, c, d], new Map([["a", 60], ["d", 10]]))
  assert.equal(filled.get("b")?.spd, 60)
  assert.equal(filled.get("c")?.spd, 10)
  assert.equal(filled.get("b")?.inferred, true)
})

test("연결이 끊긴 잔여 링크는 도로 평균, 다른 도로로는 번지지 않는다", () => {
  const a = link("a", "구의로", [[37.54, 127.09], [37.541, 127.09]])
  const island = link("island", "구의로", [[37.56, 127.1], [37.561, 127.1]])
  const other = link("other", "긴고랑로", [[37.541, 127.09], [37.542, 127.09]])
  const filled = fillTrafficSpeeds([a, island, other], new Map([["a", 30]]))
  assert.deepEqual(filled.get("island"), { spd: 30, inferred: true })
  assert.equal(filled.has("other"), false, "실측 0인 도로는 지어내지 않는다")
})

test("도로 전체 무실측이면 채우지 않는다 — 호출부가 정보없음으로 그린다", () => {
  const links = [link("x", "아차산로69길", [[37.55, 127.1], [37.551, 127.1]])]
  const filled = fillTrafficSpeeds(links, new Map())
  assert.equal(filled.size, 0)
})

test("추정 속도의 등급은 대상 링크의 제한속도로 다시 매긴다", () => {
  // 60km/h 실측을 제한속도 30 골목이 물려받으면 원활(2.0), 80 대로면 서행(0.75)
  assert.equal(gradeBySpeed(60, 30), "원활")
  assert.equal(gradeBySpeed(60, 80), "서행")
})
