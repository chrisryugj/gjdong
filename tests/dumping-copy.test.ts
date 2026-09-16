import { test } from "node:test"
import assert from "node:assert"
import { existsSync, readFileSync } from "node:fs"
import graphJson from "../data/dumping/graph.json" with { type: "json" }
import type { DumpingMapData, OntoGraph } from "../lib/dumping/types"
import { buildFindings, FINDING_GROUPS, FINDING_ORDER } from "../components/dumping/findings-data"
import { buildSeeds } from "../components/dumping/qa-seeds"
import { expectedEffect, factorStats, joinParen, proposalRows, requestSentence } from "../components/dumping/lever-view"
import { buildSystemPrompt } from "../lib/dumping/context"
import { applyErrata } from "../lib/dumping/errata"
import { detailLines, sentencesOf } from "../lib/dumping/answer-parts"

// 5라운드 카피 게이트. 변수 이름 하나(다가구·단독 밀집), 줄표 0, 챗봇 말투 0, 금지 문구 0, 카드 순서 고정.
// 화면 문장은 여기서 만들어지는 문자열이 전부라 이 테스트가 곧 grep 게이트다.

const MAP_PATH = new URL("../data/dumping/map.json", import.meta.url)
const map: DumpingMapData | null = existsSync(MAP_PATH) ? (JSON.parse(readFileSync(MAP_PATH, "utf8")) as DumpingMapData) : null
const graph = graphJson as unknown as OntoGraph
const withMap = { skip: map ? false : "data/dumping/map.json 없음. `npm run dumping:decrypt`" }

const OLD_NAME = /무관리|관리주체 없는/
const EM_DASH = /\u2014/ // 줄표. 게이트 grep이 이 파일에 걸리지 않게 이스케이프로 쓴다
const CHATBOT = /좋은 질문|살펴보겠습니다|주의하세요|것으로 보입니다|다음과 같습니다/
// 8라운드(검토서 A1·A2·A6): 발생 증가 배제 단정, 비유의를 "연관 없음"으로 단정, 범례 "원인 쪽", "대부분 앱 보급 효과"도 금지
// 10라운드: 초기 주장 라벨의 단정("발생 증가가 아니라", "관리주체 부재의 함수", "대부분이 신고편향"), 홍보 어휘, 내부 과정 누출, 발생/기록 혼용
const FORBIDDEN =
  /신고와 무관한 실측|인구를 통제했|등록인구는 넣지 않|관리주체가 없어서 생긴|반증|낙관 편향 없음|모든 수치 재현|모든 수치가 재현|원인 규명|효과 입증|AI가 답한|발생이 아니라 신고 창구|발생 증가가 아니라|관리주체 부재의 함수|대부분이 신고편향|연관이 없었습니다|연관이 없습니다|연관이 없다|연관이 없고|원인 쪽|대부분 앱 보급 효과|최강 예측변수|데이터가 뒤집은|착시 해명|빈칸 발견|주장 철회|심사에서 나온|문구를 고쳤|출품 검토|우연히 나올 확률|우연이 아님|통째로 비어|같은 착시|지금 바로 조정|무예산|실제 발생|전체 발생/
// 화면 문장은 "기록"을 말한다. "실제로 발생"처럼 관측을 발생으로 바꾸는 표현 금지
const AS_IF_OCCURRENCE = /실제로 발생|발생이 많습니다|발생도 많다/
// 프롬프트는 금지어를 따옴표로 인용하며 "쓰지 마라"고 지시한다. 그 인용 세 가지만 빼고 같은 게이트
const FORBIDDEN_PROMPT = new RegExp(FORBIDDEN.source.replace(/\|최강 예측변수|\|무예산|\|실제 발생|\|전체 발생/g, ""))

function stripLegalTerm(s: string): string {
  return s.replace(/의무관리/g, "")
}

test("발견 카드 17장은 결론 → 검증 → 한계·전망 순서(FINDING_ORDER)로 나오고 그룹 5·8·4로 나뉜다", withMap, () => {
  const fs = buildFindings(map!, graph)
  assert.strictEqual(fs.length, 17)
  assert.deepStrictEqual(fs.map((f) => f.tag), [...FINDING_ORDER])
  assert.strictEqual(fs[0].title, "다가구·단독주택 밀집")
  assert.deepStrictEqual([FINDING_GROUPS.결론.length, FINDING_GROUPS.검증.length, FINDING_GROUPS["한계·전망"].length], [5, 8, 4])
  // 결론 그룹에 CCTV 철회와 신고 채널 분해가 들어간다(심사 냉독: 14번째까지 내려가 있었다)
  assert.ok((FINDING_GROUPS.결론 as readonly string[]).includes("효과 철회") && (FINDING_GROUPS.결론 as readonly string[]).includes("신고 채널 분해"))
})

test("화면 문장(발견·시드·대비·제안)에 옛 변수명·줄표·챗봇 말투·금지 문구가 없다", withMap, () => {
  const stats = factorStats(graph)
  const text = stripLegalTerm(
    JSON.stringify([
      buildFindings(map!, graph),
      buildSeeds(map!, graph),
      proposalRows(graph).map((r) => [r.name, r.costNote, r.owner, r.verify, r.mechanism, r.mechanismDetail, expectedEffect(r.lever, stats)]),
    ]),
  )
  assert.doesNotMatch(text, OLD_NAME)
  assert.doesNotMatch(text, EM_DASH)
  assert.doesNotMatch(text, CHATBOT)
  assert.doesNotMatch(text, FORBIDDEN)
  assert.doesNotMatch(text, AS_IF_OCCURRENCE)
  assert.ok(text.includes("다가구·단독"), "새 변수명이 없다")
})

test("내보낸 그래프 라벨·속성에도 옛 변수명과 줄표가 없다(export sanitizer)", () => {
  const text = stripLegalTerm(JSON.stringify(graph))
  assert.doesNotMatch(text, OLD_NAME)
  assert.doesNotMatch(text, EM_DASH)
  assert.strictEqual(graph.nodes.find((n) => n.id === "con-unmanaged")?.label, "다가구·단독 밀집")
  assert.match(String(graph.nodes.find((n) => n.id === "ev-ledger")?.label), /다가구·단독 [\d,]+/)
})

test("정오표를 거친 그래프(화면·프롬프트가 보는 것)에는 초기 주장의 단정이 없고 원문은 label_initial에 남는다", () => {
  const fixed = applyErrata(graph)
  const text = stripLegalTerm(JSON.stringify(fixed.nodes.map((n) => [n.label, n.props.statement ?? ""])))
  assert.doesNotMatch(text, FORBIDDEN)
  const bias = fixed.nodes.find((n) => n.id === "claim-bias")!
  assert.match(bias.label, /단정할 수 없음/)
  assert.match(String(bias.props.label_initial), /신고편향/)
  assert.strictEqual(bias.props.erratum, "ERR-003")
  const mgmt = fixed.nodes.find((n) => n.id === "claim-mgmt")!
  assert.match(String(mgmt.props.statement), /다세대·연립/)
  // 원본 그래프는 손대지 않는다(재현 해시 대상)
  assert.match(graph.nodes.find((n) => n.id === "claim-bias")!.label, /신고편향/)
})

test("질의응답 프롬프트는 새 변수명으로만 말하고 줄표·금지 문구가 없으며 슬롯·허용 출처·후보 20곳 규칙을 담는다", withMap, () => {
  const p = stripLegalTerm(buildSystemPrompt())
  assert.doesNotMatch(p, OLD_NAME)
  assert.doesNotMatch(p, EM_DASH)
  assert.doesNotMatch(p, FORBIDDEN_PROMPT)
  assert.ok(p.includes("다가구·단독 밀집"))
  for (const must of ['"- 수치: "', '"- 근거: "', '"- 한계: "', "허용 출처", "제안 6건", `재배치 후보 ${map!.cctvCandidates.length}곳`, "세 목록을 섞지 마라"]) {
    assert.ok(p.includes(must), `프롬프트에 ${must} 없음`)
  }
})

test("제안 표는 6건, 비용 등급 순이고 담당·검증은 레버 노드 속성 그대로다", () => {
  const rows = proposalRows(graph)
  assert.strictEqual(rows.length, 6)
  const order = rows.map((r) => r.cost)
  const rank = (c: string) => ["추가 예산 없음", "저비용", "예산 필요", "미기재"].indexOf(c)
  for (let i = 1; i < order.length; i++) assert.ok(rank(order[i - 1]) <= rank(order[i]), order.join(","))
  const multilingual = rows.find((r) => r.lever.node.id === "lev-multilingual")!
  assert.strictEqual(multilingual.owner, "청소과+자치행정과")
  assert.strictEqual(multilingual.cost, "저비용")
  // CCTV 재배치는 이동식 CCTV 노드의 실행 정보(재배치분 검증 계획)를 export가 같이 붙인다. 없는 레버는 "미기재"로 둔다
  assert.strictEqual(rows.find((r) => r.lever.node.id === "lev-cctv-relocate")!.owner, "청소과·동주민센터(276대 보유)")
  assert.match(requestSentence(rows), /^아래 6건의 검토를 요청합니다\./)
  assert.match(requestSentence(rows), /추가 예산 없는 \d건은 .*저비용 \d건과 예산 필요 \d건은/)
})

// 10라운드: 준비된 답은 생성 답과 같은 규격. 1부는 짧은 문장 몇 개, 2부는 슬롯 불릿. 길이 상한은 프롬프트와 같다
test("시드 17개는 1부/2부 규격을 지킨다 (1부 ≤ 4문장·200자, 2부 슬롯 불릿 3~4개·각 60자, core 6개)", withMap, () => {
  const seeds = buildSeeds(map!, graph)
  assert.strictEqual(seeds.length, 17)
  assert.strictEqual(seeds.filter((s) => s.core).length, 6)
  for (const s of seeds) {
    const ss = sentencesOf(s.answer)
    assert.ok(ss.length >= 2 && ss.length <= 4, `${s.q}: 1부 문장 ${ss.length}개`)
    assert.ok(s.answer.length <= 200, `${s.q}: 1부 ${s.answer.length}자`)
    assert.ok(s.answer.startsWith(s.hint.replace(/\.$/, "")), `${s.q}: hint가 1부 첫 문장이 아니다`)
    assert.doesNotMatch(s.answer, /β|p<|p=|R²|DID/, `${s.q}: 1부에 통계 기호`)
    const ls = detailLines(s.detail)
    assert.ok(ls.length >= 3 && ls.length <= 4, `${s.q}: 2부 불릿 ${ls.length}개`)
    assert.ok(ls.every((l) => l.slot !== null), `${s.q}: 슬롯 라벨 없는 불릿`)
    assert.ok(ls.some((l) => l.slot === "근거") && ls.some((l) => l.slot === "한계"), `${s.q}: 근거·한계 슬롯 누락`)
    for (const l of ls) assert.ok(l.text.length <= 70, `${s.q}: 불릿 ${l.text.length}자 "${l.text}"`)
  }
})

// 7라운드. "청소과(대행업체 계약)"이 좁은 칸에서 "(" 앞에서 꺾이던 것. 카드·모달·인쇄가 같은 헬퍼로 잇는다
test("괄호 붙은 담당·비용 문구는 ' · '로 이어 한 줄로 읽힌다", () => {
  assert.strictEqual(joinParen("청소과(대행업체 계약)"), "청소과 · 대행업체 계약")
  assert.strictEqual(joinParen("0원(노선 조정)"), "0원 · 노선 조정")
  assert.strictEqual(joinParen("동주민센터"), "동주민센터")
  const cctv = proposalRows(graph).find((r) => r.lever.node.id === "lev-cctv-relocate")!
  assert.strictEqual(joinParen(cctv.owner), "청소과·동주민센터 · 276대 보유")
})

// 12라운드. 제안은 "사업"이 아니라 제안·수단. 기대효과 문장은 방향(감소·안정)과 겨냥 요인만 말하고 효과 크기를 단정하지 않는다
test("제안 카드의 기대효과는 6건 모두 있고 '사업'이라 부르지 않으며 검증 전임을 말한다", () => {
  const stats = factorStats(graph)
  const rows = proposalRows(graph)
  for (const r of rows) {
    const e = expectedEffect(r.lever, stats)
    assert.ok(e.length > 10, `${r.name}: 기대효과 없음`)
    assert.doesNotMatch(e, /사업/)
    assert.match(e, /검증 전|통계로 확인된 것이 아님/, `${r.name}: ${e}`)
  }
  assert.match(expectedEffect(rows.find((r) => r.lever.node.id === "lev-collection-time")!.lever, stats), /안정/)
  assert.match(expectedEffect(rows.find((r) => r.lever.node.id === "lev-joint-disposal")!.lever, stats), /다가구·단독 밀집 지역의/)
  assert.match(expectedEffect(rows.find((r) => r.lever.node.id === "lev-cctv-relocate")!.lever, stats), /자원 배분/)
  // 가정한 작동 원리: 6건 모두 칩(10자 안)과 가정·조치·기대 세 슬롯(각 한 문장·45자 안)
  for (const r of rows) {
    assert.ok(r.mechanism !== "미기재" && r.mechanism.length <= 10, `${r.name}: 칩 "${r.mechanism}"`)
    const m = r.lever.mechanismSlots
    assert.ok(m, `${r.name}: 슬롯 없음`)
    for (const [k, v] of Object.entries(m!)) assert.ok(v.length > 0 && v.length <= 45, `${r.name}: ${k} ${v.length}자 "${v}"`)
    assert.match(r.mechanismDetail, /^가정: .+ 조치: .+ 기대: /)
  }
})
