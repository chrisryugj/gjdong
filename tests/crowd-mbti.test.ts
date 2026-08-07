import assert from "node:assert/strict"
import test from "node:test"
import { isMbti, MBTI_TYPES, recommendForMbti } from "../lib/crowd/mbti"
import type { CrowdSpot } from "../lib/crowd/seoul-rtd"

const spot = (name: string, category: string, levelNum: number): CrowdSpot => ({
  name,
  category,
  lat: 0,
  lng: 0,
  level: ["정보 없음", "여유", "보통", "약간 붐빔", "붐빔"][levelNum],
  levelNum,
  color: "#000",
})

const SPOTS = [
  spot("한적한 공원", "공원", 1),
  spot("붐비는 상권", "발달상권", 4),
  spot("보통 고궁", "고궁·문화유산", 2),
  spot("붐비는 특구", "관광특구", 4),
  spot("정보 없는 곳", "공원", 0),
]

test("recommendForMbti: I형은 한적한 공원·고궁을 붐비는 상권보다 위로", () => {
  const r = recommendForMbti(SPOTS, "INFJ")
  const idx = (n: string) => r.findIndex((s) => s.name === n)
  assert.ok(idx("한적한 공원") < idx("붐비는 상권"), r.map((s) => s.name).join(","))
  assert.ok(idx("보통 고궁") < idx("붐비는 상권"))
})

test("recommendForMbti: E형은 활기(붐빔) 상권·특구가 위로", () => {
  const r = recommendForMbti(SPOTS, "ESTP")
  assert.equal(r[0].category === "발달상권" || r[0].category === "관광특구", true, r[0].name)
})

test("recommendForMbti: 정보 없음 제외·최대 개수·비유형 입력은 빈 배열", () => {
  const r = recommendForMbti(SPOTS, "ENFP", 3)
  assert.equal(r.length, 3)
  assert.ok(!r.some((s) => s.name === "정보 없는 곳"))
  assert.deepEqual(recommendForMbti(SPOTS, "ABCD"), [])
  assert.deepEqual(recommendForMbti(SPOTS, ""), [])
})

test("recommendForMbti: 소문자 입력 허용·결정적 순서", () => {
  const a = recommendForMbti(SPOTS, "intj")
  const b = recommendForMbti(SPOTS, "INTJ")
  assert.deepEqual(a.map((s) => s.name), b.map((s) => s.name))
})

test("isMbti: 16유형 전부 인정", () => {
  for (const t of MBTI_TYPES) assert.ok(isMbti(t))
  assert.equal(isMbti("XXXX"), false)
})
