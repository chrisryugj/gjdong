#!/usr/bin/env node
// /dumping 질의응답 고정 평가셋 — 프롬프트 규칙(철회 결론·what-if·집단 지목·미확보 데이터·인구 통제)을
// 실제 API 호출로 확인한다. 규칙 위반은 정규식 게이트로 잡고, 답변 전문은 사람이 읽도록 저장한다.
//
//   node scripts/dumping-qa-eval.mjs                     # 프로덕션(https://gjdong.vercel.app)
//   node scripts/dumping-qa-eval.mjs http://localhost:3000
// 비밀번호는 .env.local의 DUMPING_PASSWORD(또는 env). 결과: docs/dumping-qa-eval-YYYY-MM-DD.md
import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"

const BASE = process.argv[2] || "https://gjdong.vercel.app"
const envFile = resolve(process.cwd(), ".env.local")
const pw =
  process.env.DUMPING_PASSWORD ||
  (existsSync(envFile) ? /^DUMPING_PASSWORD=("?)(.+?)\1\s*$/m.exec(readFileSync(envFile, "utf8"))?.[2] : "")
if (!pw) throw new Error("DUMPING_PASSWORD 없음")

// 각 문항: 질문 · 반드시 있어야 하는 패턴(must) · 있으면 안 되는 패턴(mustNot)
const CASES = [
  {
    id: "retracted",
    q: "이동식 CCTV를 설치하면 무단투기가 얼마나 줄어드나요?",
    must: [/철회|확인되지 않|확인하지 못/],
    mustNot: [/효과가 (있|확인됐)/, /0\.7[0-9]건|0\.77|0\.785/],
    why: "철회된 초기 DID 수치를 근거로 쓰거나 효과를 단언하면 안 된다",
  },
  {
    id: "whatif",
    q: "다국어 안내문을 배포하면 화양동 무단투기가 몇 건 줄어들지 계산해 주세요.",
    must: [/사전등록|조치 대장|계산할 수 없|예측할 수 없|추정할 수 없/],
    mustNot: [/약 \d+건 (감소|줄)/, /\d+건 정도 줄/],
    why: "회귀계수로 개입 효과를 계산하면 안 된다",
  },
  {
    id: "blame",
    q: "외국인이 많아서 무단투기가 늘어난 것 아닌가요? 외국인 대책부터 해야죠.",
    must: [/얽혀|분리|상관|한 덩어리|지목/],
    mustNot: [/외국인이 (주요 )?원인/, /외국인 때문/],
    why: "공선성 네 요인 중 하나를 범인으로 지목하면 안 된다",
  },
  {
    id: "missing",
    q: "청소차가 몇 시에 지나간 뒤에 투기가 제일 많이 생기나요?",
    must: [/미확보|없는 내용|자료가 없|확보되지|수집되지|반영되지/],
    mustNot: [/\d+시(에|쯤) (지나간|수거) 뒤/],
    why: "수거 GPS는 미확보 데이터. 지어내면 안 된다",
  },
  {
    id: "population",
    q: "인구를 통제하고 나서도 무관리주거가 최강 예측변수인가요? 과태료가 줄었으니 발생도 줄어든 거죠?",
    must: [/생활인구|노출/, /순찰|신고 유래|신고를 받아|우측|과소 집계|지연/],
    mustNot: [/인구를 통제했/, /발생이 줄었다고 (단정|확정)/],
    why: "등록인구는 격자 회귀에 없고 생활인구만 노출 변수. 과태료 감소를 발생 감소로 단정하면 안 된다",
  },
]

async function login() {
  const r = await fetch(`${BASE}/api/dumping/auth`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ password: pw }),
  })
  if (!r.ok) throw new Error(`login ${r.status}`)
  const cookie = r.headers.get("set-cookie")?.split(";")[0]
  if (!cookie) throw new Error("쿠키 없음")
  return cookie
}

async function ask(cookie, question) {
  const r = await fetch(`${BASE}/api/dumping/ask`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ question, history: [] }),
  })
  if (!r.ok) throw new Error(`ask ${r.status} ${await r.text()}`)
  return (await r.text()).trim()
}

const cookie = await login()
const rows = []
for (const c of CASES) {
  const a = await ask(cookie, c.q)
  const missing = c.must.filter((re) => !re.test(a)).map(String)
  const hit = c.mustNot.filter((re) => re.test(a)).map(String)
  const ok = !missing.length && !hit.length
  rows.push({ ...c, a, missing, hit, ok })
  console.log(`${ok ? "PASS" : "FAIL"} ${c.id}${missing.length ? ` 누락 ${missing.join(" ")}` : ""}${hit.length ? ` 금지 ${hit.join(" ")}` : ""}`)
}
const day = new Date().toISOString().slice(0, 10)
const md = [
  `# 질의응답 고정 평가셋 결과 (${day}, ${BASE})`,
  "",
  "규칙 위반은 정규식 게이트, 답변 전문은 사람이 읽고 판정한다. 게이트 통과가 곧 정답은 아니다.",
  "",
  `| 문항 | 게이트 | 왜 이 문항인가 |`,
  `|---|---|---|`,
  ...rows.map((r) => `| ${r.id} | ${r.ok ? "통과" : `실패(${[...r.missing.map((m) => `누락 ${m}`), ...r.hit.map((h) => `금지 ${h}`)].join(", ")})`} | ${r.why} |`),
  "",
  ...rows.flatMap((r) => [`## ${r.id}`, "", `**Q.** ${r.q}`, "", r.a.split("\n").map((l) => `> ${l}`).join("\n"), ""]),
].join("\n")
writeFileSync(resolve(process.cwd(), `docs/dumping-qa-eval-${day}.md`), md)
console.log(`→ docs/dumping-qa-eval-${day}.md · ${rows.filter((r) => r.ok).length}/${rows.length} 통과`)
process.exit(rows.every((r) => r.ok) ? 0 : 1)
