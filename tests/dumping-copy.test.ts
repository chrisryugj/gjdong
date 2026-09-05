import { test } from "node:test"
import assert from "node:assert"
import { existsSync, readFileSync } from "node:fs"
import graphJson from "../data/dumping/graph.json" with { type: "json" }
import type { DumpingMapData, OntoGraph } from "../lib/dumping/types"
import { buildFindings, FINDING_ORDER } from "../components/dumping/findings-data"
import { buildSeeds } from "../components/dumping/qa-seeds"
import { proposalRows } from "../components/dumping/lever-view"
import { requestSentence } from "../components/dumping/policy-table"
import { buildSystemPrompt } from "../lib/dumping/context"

// 5라운드 카피 게이트. 변수 이름 하나(다가구·단독 밀집), 줄표 0, 챗봇 말투 0, 금지 문구 0, 카드 순서 고정.
// 화면 문장은 여기서 만들어지는 문자열이 전부라 이 테스트가 곧 grep 게이트다.

const MAP_PATH = new URL("../data/dumping/map.json", import.meta.url)
const map: DumpingMapData | null = existsSync(MAP_PATH) ? (JSON.parse(readFileSync(MAP_PATH, "utf8")) as DumpingMapData) : null
const graph = graphJson as unknown as OntoGraph
const withMap = { skip: map ? false : "data/dumping/map.json 없음. `npm run dumping:decrypt`" }

const OLD_NAME = /무관리|관리주체 없는/
const EM_DASH = /\u2014/ // 줄표. 게이트 grep이 이 파일에 걸리지 않게 이스케이프로 쓴다
const CHATBOT = /좋은 질문|살펴보겠습니다|주의하세요|것으로 보입니다|다음과 같습니다/
const FORBIDDEN = /신고와 무관한 실측|인구를 통제했|등록인구는 넣지 않|관리주체가 없어서 생긴|반증|낙관 편향 없음|모든 수치 재현|모든 수치가 재현|원인 규명|효과 입증|AI가 답한/

function stripLegalTerm(s: string): string {
  return s.replace(/의무관리/g, "")
}

test("발견 카드 14장은 결론 → 근거 → 한계·전망 순서(FINDING_ORDER)로 나온다", withMap, () => {
  const fs = buildFindings(map!, graph)
  assert.strictEqual(fs.length, 14)
  assert.deepStrictEqual(fs.map((f) => f.tag), [...FINDING_ORDER])
  assert.strictEqual(fs[0].title, "다가구·단독주택 밀집")
})

test("화면 문장(발견·시드·대비·제안)에 옛 변수명·줄표·챗봇 말투·금지 문구가 없다", withMap, () => {
  const text = stripLegalTerm(JSON.stringify([buildFindings(map!, graph), buildSeeds(map!, graph), proposalRows(graph).map((r) => [r.name, r.costNote, r.owner, r.verify])]))
  assert.doesNotMatch(text, OLD_NAME)
  assert.doesNotMatch(text, EM_DASH)
  assert.doesNotMatch(text, CHATBOT)
  assert.doesNotMatch(text, FORBIDDEN)
  assert.ok(text.includes("다가구·단독"), "새 변수명이 없다")
})

test("내보낸 그래프 라벨·속성에도 옛 변수명과 줄표가 없다(export sanitizer)", () => {
  const text = stripLegalTerm(JSON.stringify(graph))
  assert.doesNotMatch(text, OLD_NAME)
  assert.doesNotMatch(text, EM_DASH)
  assert.strictEqual(graph.nodes.find((n) => n.id === "con-unmanaged")?.label, "다가구·단독 밀집")
  assert.match(String(graph.nodes.find((n) => n.id === "ev-ledger")?.label), /다가구·단독 [\d,]+/)
})

test("질의응답 프롬프트는 새 변수명으로만 말하고 줄표·금지 문구가 없다", withMap, () => {
  const p = stripLegalTerm(buildSystemPrompt())
  assert.doesNotMatch(p, OLD_NAME)
  assert.doesNotMatch(p, EM_DASH)
  assert.doesNotMatch(p, FORBIDDEN)
  assert.ok(p.includes("다가구·단독 밀집"))
})

test("제안 표는 6건, 비용 등급 순이고 담당·검증은 레버 노드 속성 그대로다", () => {
  const rows = proposalRows(graph)
  assert.strictEqual(rows.length, 6)
  const order = rows.map((r) => r.cost)
  const rank = (c: string) => ["무예산", "저비용", "예산 필요", "미기재"].indexOf(c)
  for (let i = 1; i < order.length; i++) assert.ok(rank(order[i - 1]) <= rank(order[i]), order.join(","))
  const multilingual = rows.find((r) => r.lever.node.id === "lev-multilingual")!
  assert.strictEqual(multilingual.owner, "청소과+자치행정과")
  assert.strictEqual(multilingual.cost, "저비용")
  // CCTV 재배치는 이동식 CCTV 노드의 실행 정보(재배치분 검증 계획)를 export가 같이 붙인다. 없는 레버는 "미기재"로 둔다
  assert.strictEqual(rows.find((r) => r.lever.node.id === "lev-cctv-relocate")!.owner, "청소과·동주민센터(276대 보유)")
  assert.match(requestSentence(rows), /^아래 6건의 검토와 시행을 요청합니다\./)
  assert.match(requestSentence(rows), /무예산 \d건은 .*저비용 \d건과 예산 필요 \d건은/)
})
