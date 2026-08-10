import assert from "node:assert/strict"
import test from "node:test"
import { DONG_CODES, GWANGJIN_SPOTS, NEARBY_SPOTS, STATIONS, SUBWAY_LINE, SUBWAY_LINE_COLOR } from "../lib/gwangjin/constants"
import { DISTRICTS } from "../lib/crowd/districts"

// 광진 생활상황판 상수 무결성 — 실측 확정값(2026-08-10)이 흐트러지면 잡는다.

test("광진 스팟 5곳 전부가 districts 매핑에서 광진구다 (아차산 편입 포함)", () => {
  for (const name of GWANGJIN_SPOTS) {
    assert.equal(DISTRICTS.seoul[name], "광진구", `${name} 매핑 어긋남`)
  }
})

test("생활권 스팟은 광진구 밖 실소재지를 유지한다 (광나루한강공원=강동구)", () => {
  for (const name of NEARBY_SPOTS) {
    assert.ok(DISTRICTS.seoul[name], `${name} 미매핑`)
    assert.notEqual(DISTRICTS.seoul[name], "광진구")
  }
})

test("행정동 15개 — 자양4동 끼워넣기 코드(11215847) 포함, 코드 중복 없음", () => {
  assert.equal(DONG_CODES.length, 15)
  assert.ok(DONG_CODES.some((d) => d.code === "11215847" && d.name === "자양4동"))
  // 미부여 코드가 실수로 들어오면 즉시 실패
  for (const dead of ["11215720", "11215880"]) {
    assert.ok(!DONG_CODES.some((d) => d.code === dead), `${dead}는 현행 미부여 코드`)
  }
  assert.equal(new Set(DONG_CODES.map((d) => d.code)).size, 15)
})

test("동코드 함정 고정: 810=광장동, 820~840=자양1~3동, 850~870=구의1~3동", () => {
  const byCode = Object.fromEntries(DONG_CODES.map((d) => [d.code, d.name]))
  assert.equal(byCode["11215810"], "광장동")
  assert.equal(byCode["11215820"], "자양1동")
  assert.equal(byCode["11215850"], "구의1동")
})

test("역 8곳 — 부역명 포함 정식 역명, 노선 라벨·색 테이블과 정합", () => {
  assert.equal(STATIONS.length, 8)
  // 실측 함정: 아차산은 단독 역명으로 조회 불가 — 정식 역명 유지 확인
  assert.equal(STATIONS.find((s) => s.base === "아차산")?.api, "아차산(어린이대공원후문)")
  const lineIds = new Set(Object.keys(SUBWAY_LINE))
  for (const s of STATIONS) {
    for (const l of s.lines) {
      assert.ok(lineIds.has(`100${l}`), `${s.base} 노선 ${l} 라벨 테이블에 없음`)
    }
  }
  for (const id of lineIds) assert.ok(SUBWAY_LINE_COLOR[id], `${id} 색 누락`)
})
