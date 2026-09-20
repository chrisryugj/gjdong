import { test } from "node:test"
import assert from "node:assert"
import fs from "node:fs"
import path from "node:path"
import graphJson from "../data/snow/graph.json" with { type: "json" }
import type { OntoGraph } from "../lib/snow/types"
import { runCompetencyQuestions } from "../lib/snow/queries"
import { REL_KO, TYPE_KO } from "../lib/snow/labels"

// /snow 카피 게이트(deck-copy-rules 정본 적용). 화면 문장·그래프 라벨·역량 질문·툴팁에서 비유 동사·줄표·화살표·AI 관용어를 0으로 박는다.
// 1라운드 위반 실측: 겨냥(10곳)·받친다·말한다·"표로는 못 던지는 질문"·"커버리지의 바닥"·"X가 아니라 Y"·반말 혼재·화살표 남발

const ROOT = path.resolve(import.meta.dirname, "..")
const FILES = [
  "components/snow/gap-panel.tsx",
  "components/snow/stage-panel.tsx",
  "components/snow/resource-panel.tsx",
  "components/snow/onto-panel.tsx",
  "components/snow/law-panel.tsx",
  "components/snow/methods-modal.tsx",
  "components/snow/map-controls.tsx",
  "components/snow/map-geo.ts",
  "components/snow/snow-dashboard.tsx",
  "lib/snow/queries.ts",
  "lib/snow/facts.ts",
  "lib/snow/labels.ts",
  "lib/snow/schema.ts",
  "lib/snow/stage.ts",
]
const read = (f: string) => fs.readFileSync(path.join(ROOT, f), "utf8")

// 한글 문자열 리터럴만 뽑는다(코드 식별자·주석 제외). 백틱·따옴표 안 한글 포함 문자열
function koreanStrings(src: string): string[] {
  const out: string[] = []
  const re = /(["'`])((?:\\.|(?!\1)[^\\])*?)\1/g
  let m: RegExpExecArray | null
  while ((m = re.exec(src))) if (/[가-힣]/.test(m[2])) out.push(m[2])
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
