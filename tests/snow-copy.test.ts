import { test } from "node:test"
import assert from "node:assert"
import fs from "node:fs"
import path from "node:path"
import graphJson from "../data/snow/graph.json" with { type: "json" }
import type { OntoGraph } from "../lib/snow/types"
import { runCompetencyQuestions } from "../lib/snow/queries"
import { HEAT_STYLE, REL_KO, RESOURCES, RISK, TYPE_KO } from "../lib/snow/labels"
import mapJson from "../data/snow/map.json" with { type: "json" }
import type { SnowMapData } from "../lib/snow/types"
import { buildChecklist } from "../lib/snow/facts"

// /snow 카피 게이트(deck-copy-rules 정본 적용). 화면 문장·그래프 라벨·역량 질문·툴팁에서 비유 동사·줄표·화살표·AI 관용어를 0으로 박는다.
// 1라운드 위반 실측: 겨냥(10곳)·받친다·말한다·"표로는 못 던지는 질문"·"커버리지의 바닥"·"X가 아니라 Y"·반말 혼재·화살표 남발

const ROOT = path.resolve(import.meta.dirname, "..")
const FILES = [
  "components/snow/gap-panel.tsx",
  "components/snow/check-print.tsx",
  "components/snow/stage-panel.tsx",
  "components/snow/resource-panel.tsx",
  "components/snow/onto-panel.tsx",
  "components/snow/law-panel.tsx",
  "components/snow/methods-modal.tsx",
  "components/snow/map-controls.tsx",
  "components/snow/map-geo.ts",
  "components/snow/snow-dashboard.tsx",
  "components/snow/ui.tsx",
  "components/snow/onto-graph.tsx",
  "components/snow/onto-layouts.ts",
  "lib/snow/queries.ts",
  "lib/snow/facts.ts",
  "lib/snow/costs.ts",
  "lib/snow/weather.ts",
  "lib/snow/labels.ts",
  "lib/snow/schema.ts",
  "lib/snow/stage.ts",
]
const read = (f: string) => fs.readFileSync(path.join(ROOT, f), "utf8")

// 한글 문자열 리터럴 + JSX 본문 텍스트(태그 사이 글)를 뽑는다(코드 식별자·주석 제외). 4라운드: JSX 텍스트("동 — = …")가 게이트를 빠져나갔던 구멍을 막았다
function koreanStrings(src: string): string[] {
  const out: string[] = []
  const re = /(["'`])((?:\\.|(?!\1)[^\\])*?)\1/g
  let m: RegExpExecArray | null
  while ((m = re.exec(src))) if (/[가-힣]/.test(m[2])) out.push(m[2])
  const jsx = />([^<>{}]*[가-힣][^<>{}]*)</g
  while ((m = jsx.exec(src))) out.push(m[1].trim())
  return out
}
// 주석 줄(//·/* */)은 화면에 안 나오니 제외
const stripComments = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")

// S1 비유·의인화 동사, 슬로건, 줄표·화살표, AI 관용어. 규칙 정본 deck-copy-rules §3·§5
const FORBIDDEN: [RegExp, string][] = [
  [/—/, "줄표"],
  [/→|←|⇒|⟶/, "화살표"],
  [/겨냥/, "겨냥(무기 비유)"],
  [/받친다|받칩니다|받쳐/, "받친다(의인화)"],
  [/말한다|말해 준다|말해줍|말합니다\b(?!.*조례)/, "말한다(자료 주어 의인화)"],
  [/못 던지는/, "못 던지는 질문(비유)"],
  [/의 바닥/, "바닥(비유)"],
  [/느슨한 기준/, "느슨한(형용사)"],
  [/가 아니라 |이 아니라 /, "X가 아니라 Y(슬로건)"],
  [/기대고 있/, "기대다(의인화)"],
  [/몰려 있|몰려있/, "몰리다(비유)"],
  [/깔려 있|깔려있/, "깔리다(비유)"],
  [/잴 데이터|잴 수 없|재고,|잽니다/, "재다(자 비유)"],
  [/사라진다|사라집니다/, "사라지다(비유)"],
  [/닿는다|닿습니다/, "닿다(비유)"],
  [/붙이면|붙습니다|붙어 있/, "붙다(비유)"],
  [/뽑아|뽑는다/, "뽑다(비유)"],
  [/드러나|드러납/, "드러나다(의인화)"],
  [/따라가/, "따라가다(비유)"],
  [/거꾸로/, "거꾸로(방향 비유)"],
  [/핵심|본질|시사점|주목|혁신|패러다임|시너지|인사이트|최적화|효율적|강력한|획기적|매우|정말|굉장히|단순히|결론적으로|정리하면|요약하면/, "AI 관용·추상"],
  [/OWL|SPARQL|RDF|추론기/, "표준 이름(독자에게 뜻 없음)"],
  [/온톨로지에 묻기|온톨로지 탭/, "온톨로지(탭·제목에서 제외)"],
  [/헤어볼/, "은어"],
  [/\(보도\)/, "(보도) 접미(소제목으로 묶는다)"],
  // 4라운드 후속(사용자: "작대기·AI 어투 전수검사"): 꺾쇠 화살·등호·말줄임표·"수 있습니다"는 화면 문장에서 뺀다
  [/›|‹|»/, "꺾쇠 화살(작대기)"],
  [/[가-힣)\]] = [가-힣(]/, "등호로 뜻을 잇는 범례체(은/는으로)"],
  [/…|\.\.\.(?=\s|$|["'`)])/, "말줄임표"],
  [/수 있습니다|수 없습니다|수 있어/, "'수 있습니다'(번역투)"],
]
// 반말 종결(화면 문장). 명사 종결·표 안은 허용하므로 문장 끝 "다."·"다\"" 만 잡는다. 법령 원문 인용(blockquote·조문 요지 gist)은 제외 목록
// "…입니다." "…습니다."는 합니다체. 그 밖의 "다."로 끝나는 종결만 반말로 본다
const BANMAL = /(?<!니)(?<=[가-힣])다\.(?=\s|$|")/
const BANMAL_ALLOW = [/하여야 한다\./, /조례로 정한다\./] // 법률 원문 인용

test("화면·그래프·질문 문자열에 금지어 0", () => {
  const hits: string[] = []
  for (const f of FILES) {
    const strs = koreanStrings(stripComments(read(f)))
    for (const s of strs) for (const [re, why] of FORBIDDEN) if (re.test(s)) hits.push(`${f} · ${why} · ${s.slice(0, 60)}`)
  }
  assert.deepStrictEqual(hits, [], hits.join("\n"))
})

test("화면 문장은 합니다체(반말 종결 0). 법률 원문 인용만 예외", () => {
  const hits: string[] = []
  for (const f of FILES) {
    if (f.endsWith("schema.ts")) continue // 스키마 정의문은 개발자용
    const strs = koreanStrings(stripComments(read(f)))
    for (const s of strs) if (BANMAL.test(s) && !BANMAL_ALLOW.some((a) => a.test(s))) hits.push(`${f} · ${s.slice(0, 70)}`)
  }
  assert.deepStrictEqual(hits, [], hits.join("\n"))
})

test("그래프 노드 라벨·요지·역량 질문 문장에도 금지어 0, 관측·판단 요지는 합니다체", () => {
  const graph = graphJson as unknown as OntoGraph
  const hits: string[] = []
  for (const n of graph.nodes) {
    const texts = [n.label, ...Object.values(n.props).map(String)]
    for (const s of texts) for (const [re, why] of FORBIDDEN) if (re.test(s)) hits.push(`${n.id} · ${why} · ${s.slice(0, 60)}`)
    if ((n.type === "Evidence" || n.type === "Claim") && typeof n.props.gist === "string" && BANMAL.test(n.props.gist)) hits.push(`${n.id} · 반말 · ${n.props.gist.slice(0, 60)}`)
    if (n.type === "Evidence" || n.type === "Claim") assert.ok(n.label.length <= 16, `${n.id} 라벨 16자 초과: ${n.label}`)
  }
  for (const c of runCompetencyQuestions(graph)) {
    for (const s of [c.q, c.why, c.empty]) for (const [re, why] of FORBIDDEN) if (re.test(s)) hits.push(`${c.id} · ${why} · ${s.slice(0, 60)}`)
    if (BANMAL.test(c.why) || BANMAL.test(c.empty)) hits.push(`${c.id} · 반말 · ${c.why}`)
  }
  for (const v of [...Object.values(REL_KO), ...Object.values(TYPE_KO)]) for (const [re, why] of FORBIDDEN) if (re.test(v)) hits.push(`label · ${why} · ${v}`)
  assert.deepStrictEqual(hits, [], hits.join("\n"))
})

test("세로 컬러바 0: border-l-*·border-r-* 색선을 강조에 쓰지 않는다(사용자 규칙. 번호 인덱스·면 틴트로 대신한다)", () => {
  const hits: string[] = []
  for (const f of FILES.filter((x) => x.endsWith(".tsx"))) {
    const src = stripComments(read(f))
    const re = /border-[lr]-(\d|\[)/g
    let m: RegExpExecArray | null
    while ((m = re.exec(src))) hits.push(`${f}:${src.slice(0, m.index).split("\n").length}`)
  }
  assert.deepStrictEqual(hits, [], hits.join("\n"))
})

test("글자 크기: 화면 컴포넌트에 12px 미만 본문 클래스 없음(키커 dump-kicker 9.5~10.5px만 허용)", () => {
  const hits: string[] = []
  for (const f of FILES.filter((x) => x.endsWith(".tsx"))) {
    const src = read(f)
    const re = /text-\[(\d+(?:\.\d+)?)px\]/g
    let m: RegExpExecArray | null
    while ((m = re.exec(src))) {
      const px = Number(m[1])
      if (px < 12) {
        // 같은 className 안에 dump-kicker가 있으면 키커
        const start = src.lastIndexOf('className="', m.index)
        const end = src.indexOf('"', m.index)
        const cls = src.slice(start, end)
        if (!/dump-kicker/.test(cls)) hits.push(`${f} · ${px}px · ${cls.slice(0, 60)}`)
      }
    }
  }
  assert.deepStrictEqual(hits, [], hits.join("\n"))
})

// 3라운드: 정보 밀도(dumping 정책 탭 규격). 타일·모달 밖에서 둥근 테두리 상자를 두르지 않는다. 패널 파일당 `rounded-xl border` 2개 상한
test("패널에 둥근 테두리 상자(rounded-xl border) 탭당 2개 이하", () => {
  const PANELS = ["components/snow/gap-panel.tsx", "components/snow/stage-panel.tsx", "components/snow/resource-panel.tsx", "components/snow/onto-panel.tsx", "components/snow/law-panel.tsx", "components/snow/ui.tsx"]
  const hits: string[] = []
  for (const f of PANELS) {
    const n = (stripComments(read(f)).match(/rounded-(?:xl|lg|2xl) border(?![-a-z])/g) ?? []).length
    if (n > 2) hits.push(`${f} · ${n}개`)
  }
  assert.deepStrictEqual(hits, [], hits.join("\n"))
})

// 3라운드: 색 문법. 열선(노랑빛 호박)과 취약·결빙(진홍)이 같은 난색으로 읽히지 않게 hue 차 40° 이상. 급경사 추정(보라)은 둘 모두와 40° 이상
function hue(hex: string): number {
  const n = parseInt(hex.slice(1), 16)
  const r = ((n >> 16) & 255) / 255
  const g = ((n >> 8) & 255) / 255
  const b = (n & 255) / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const d = max - min
  if (d === 0) return 0
  let h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4
  h *= 60
  return h < 0 ? h + 360 : h
}
const hueDiff = (a: string, b: string) => {
  const d = Math.abs(hue(a) - hue(b)) % 360
  return d > 180 ? 360 - d : d
}
test("열선·취약·급경사 색 hue 차 40° 이상(다크·라이트)", () => {
  const heat = RESOURCES[0]
  for (const [heatC, riskC, slopeC] of [
    [heat.color, RISK.weak.color, RISK.slope.color],
    [heat.colorLight, RISK.weak.colorLight, RISK.slope.colorLight],
  ]) {
    assert.ok(hueDiff(heatC, riskC) >= 40, `열선 ${heatC} vs 취약 ${riskC} hue 차 ${hueDiff(heatC, riskC).toFixed(1)}°`)
    assert.ok(hueDiff(slopeC, riskC) >= 40, `급경사 ${slopeC} vs 취약 ${riskC} hue 차 ${hueDiff(slopeC, riskC).toFixed(1)}°`)
    assert.ok(hueDiff(slopeC, heatC) >= 40, `급경사 ${slopeC} vs 열선 ${heatC} hue 차 ${hueDiff(slopeC, heatC).toFixed(1)}°`)
  }
  assert.strictEqual(RISK.weak.color, RISK.ice.color, "취약구간·결빙구간은 같은 색(선 모양으로 구분)")
  assert.ok(hueDiff(HEAT_STYLE.glow.dark, heat.color) < 15, "글로우는 열선과 같은 색상")
})

// 4라운드 결재 문서화: 점검 후보는 동사로 끝나는 제목 + 부서(또는 내부 확인) + 기한 + 규모를 갖는다
test("점검 후보 5행 전부 동사 제목(비치·검토·요청·점검) + 부서 + 기한 + 규모", () => {
  const checks = buildChecklist(mapJson as unknown as SnowMapData)
  assert.strictEqual(checks.length, 5)
  for (const c of checks) {
    assert.match(c.title, /(비치|검토|요청|점검)$/, `${c.id} 제목이 동사로 끝나지 않음: ${c.title}`)
    assert.ok(c.dept.length > 0, `${c.id} 부서 없음`)
    assert.match(c.due, /대책기간 전/, `${c.id} 기한 없음`)
    assert.ok(/\d/.test(c.scale), `${c.id} 규모에 수량 없음: ${c.scale}`)
    assert.ok(c.done.length > 0, `${c.id} 완료 기준 없음`)
    assert.ok(c.cost.length > 0, `${c.id} 개략 비용 없음`)
  }
  assert.deepStrictEqual(
    checks.map((c) => c.owner),
    ["구", "구", "시", "동", "학교"],
    "순서: 구 소관 행동 가능 › 시 요청 › 동 단위 › 학교",
  )
  assert.strictEqual(checks.find((c) => c.id === "c-school")?.dept, "내부 확인", "학교 소관은 데이터에 없어 내부 확인 슬롯")
})

// 4라운드 후속: 우선순위 점수와 예산 역산. 광장로(경사 18.6%·초등학교·급경사)가 1위, 예산 0이면 신설 0, 무한이면 구 관리 열선 없는 13곳 전부
test("우선순위 1위는 광장로(경사 추정·초등학교·행안부 급경사), 예산 역산은 우선순위 순 누적", async () => {
  const { gapSummary, planHeatBudget, segPriority, segName } = await import("../lib/snow/facts")
  const data = mapJson as unknown as SnowMapData
  const g = gapSummary(data)
  assert.strictEqual(segName(g.noHeatList[0]), "광장로")
  assert.ok(segPriority(g.noHeatList[0], data).reasons.some((r) => /학교/.test(r)))
  assert.strictEqual(planHeatBudget(data, 0).planned.length, 0)
  const all = planHeatBudget(data, Infinity)
  assert.strictEqual(all.planned.length, 13)
  assert.strictEqual(all.remaining, 0)
  const five = planHeatBudget(data, 5e8)
  assert.ok(five.planned.length >= 1 && five.planned.length < 13)
  assert.ok(five.cost <= 5e8)
})
