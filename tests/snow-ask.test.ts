import { test } from "node:test"
import assert from "node:assert"
import mapJson from "../data/snow/map.json" with { type: "json" }
import type { SnowMapData } from "../lib/snow/types"
import { buildSeeds } from "../components/snow/ask-seeds"
import { buildSystemPrompt } from "../lib/snow/context"
import { detailLines, sentencesOf, splitAnswer } from "../lib/dumping/answer-parts"
import { matchSeed } from "../lib/dumping/seed-match"
import { checkRateLimit } from "../lib/utils/rate-limiter"

// /snow 물어보기(6라운드) 게이트. 준비된 답 규격(dumping 시드 규격과 같다), 프롬프트가 규칙·형식·허용 출처를 담는지, 같은 뜻 질문 즉답·다른 뜻 질문 오탐 0, 공개 라우트 분당 한도

const data = mapJson as unknown as SnowMapData
const seeds = buildSeeds(data)
const BANNED = /—|→|›|…|수 있습니다|수 없습니다|핵심|본질|시사점|최적화|효율적/

test("준비된 답: 1부 2~4문장·200자 안·합니다체, 2부 슬롯 불릿 3~4개·각 60자 안, core 6개, 금지어 0", () => {
  assert.ok(seeds.length >= 10)
  assert.strictEqual(seeds.filter((s) => s.core).length, 6)
  for (const s of seeds) {
    const ss = sentencesOf(s.answer)
    assert.ok(ss.length >= 2 && ss.length <= 4, `${s.q}: 1부 ${ss.length}문장`)
    assert.ok(s.answer.length <= 200, `${s.q}: 1부 ${s.answer.length}자`)
    assert.match(s.answer, /(니다|됩니다)\.$/, `${s.q}: 합니다체 종결`)
    assert.strictEqual(s.hint, ss[0], `${s.q}: hint는 1부 첫 문장`)
    const ls = detailLines(s.detail)
    assert.ok(ls.length >= 3 && ls.length <= 4, `${s.q}: 2부 ${ls.length}줄`)
    for (const l of ls) {
      assert.ok(l.slot, `${s.q}: 슬롯 없는 줄 "${l.text}"`)
      assert.ok(l.text.length <= 60, `${s.q}: 2부 ${l.text.length}자 "${l.text}"`)
    }
    assert.ok(ls.some((l) => l.slot === "수치") && ls.some((l) => l.slot === "근거"), `${s.q}: 수치·근거 슬롯`)
    assert.doesNotMatch(`${s.q} ${s.answer} ${s.detail}`, BANNED, s.q)
    // 준비된 답을 한 덩어리로 만들면 1부/2부가 갈린다(ask-panel 즉답 경로)
    const parts = splitAnswer(`${s.answer}\n[부연]\n${s.detail}`)
    assert.ok(parts.split && parts.spoken === s.answer && parts.detail === s.detail)
  }
  // 수치는 데이터에서: 첫 시드의 분모는 취약구간 수
  assert.ok(seeds[0].answer.includes(`${data.weak.length}곳`))
})

test("프롬프트: 개요·핵심 수치·점검 후보·구간 표·동별·단계·조례·해석 규칙·답변 형식·허용 출처를 담고 줄표·화살표 0, 내부 코드는 근거 그래프 절에만", () => {
  const p = buildSystemPrompt()
  for (const h of ["## 개요", "## 핵심 수치", "## 눈 오기 전 점검 후보", "## 열선 없는 구간", "## 동별 자원", "## 초등학교", "## 대응 단계", "## 조례", "## 못 구한 데이터", "## 근거 그래프", "## 해석 규칙", "## 답변 형식", "허용 출처:", "[부연]"]) assert.ok(p.includes(h), h)
  assert.doesNotMatch(p, /—|→/)
  assert.ok(p.length > 20_000 && p.length < 80_000, `프롬프트 ${p.length}자`)
  // 수치는 facts에서: 열선 없는 취약구간 수와 점검 후보 1 제목이 들어 있다
  assert.ok(p.includes(`열선 없음 ${data.gaps.weakNoHeat}곳`))
  assert.ok(p.includes("능동로 120"))
  // 취약구간 실체(Entity) 노드는 그래프 절에서 뺐다(표로 대신)
  const graphPart = p.slice(p.indexOf("## 근거 그래프"), p.indexOf("## 해석 규칙"))
  assert.ok(!/\(Entity\)/.test(graphPart))
})

test("같은 뜻 질문은 준비된 답으로 즉답하고, 다른 뜻·짧은 질문은 모델로 간다", () => {
  const hit = (q: string) => matchSeed(q, seeds)?.seed.q ?? null
  assert.strictEqual(hit("눈 오기 전에 어디가 비었나요?"), "눈 오기 전에 어디가 비었나?")
  assert.strictEqual(hit("열선을 다 놓으면 얼마나 드나요"), "열선을 다 놓으면 얼마나 드나?")
  assert.strictEqual(hit("열선 없는 동은 어디인가요?"), "열선 없는 동은 어디인가?")
  assert.strictEqual(hit("자재는 충분한가요?"), "자재는 충분한가?")
  assert.strictEqual(hit("제설함 위치 바꿔"), null)
  assert.strictEqual(hit("안녕"), null)
  assert.strictEqual(hit("광장동 열선은 몇 구간인가"), null)
})

test("공개 라우트 한도: snowAsk는 분당 5회", () => {
  const ip = `test-${Date.now()}`
  for (let i = 0; i < 5; i++) assert.ok(checkRateLimit(ip, "snowAsk").allowed)
  assert.strictEqual(checkRateLimit(ip, "snowAsk").allowed, false)
})
