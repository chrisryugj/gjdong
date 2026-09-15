#!/usr/bin/env node
// /dumping 질의응답 고정 평가셋. 프롬프트 규칙(철회 결론·what-if·집단 지목·미확보 데이터·인구 통제)을
// 실제 API 호출로 확인한다. 규칙 위반은 정규식 게이트로 잡고, 답변 전문은 사람이 읽도록 저장한다.
//
//   node scripts/dumping-qa-eval.mjs                     # 프로덕션(https://gjdong.vercel.app)
//   node scripts/dumping-qa-eval.mjs http://localhost:3000
// 비밀번호는 .env.local의 DUMPING_PASSWORD(또는 env). 결과: docs/dumping-qa-eval-YYYY-MM-DD.md
import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"

const BASE = process.argv[2] || "https://gjdong.vercel.app"
// API 라우트는 Origin 검사를 한다(레포 공통 CSRF 가드). 브라우저처럼 보낸다
const ORIGIN = { origin: "https://gjdong.vercel.app" }
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
    // "효과가 있다거나 없다 단정하기 어렵다" 같은 유보문은 통과. 단정형만 잡는다(3·5라운드 과민 실측)
    mustNot: [/효과가 (있(?!다거나|다고 (단정|말)|는지|다고 볼 수 없)|확인됐)/, /0\.7[0-9]건|0\.77|0\.785/],
    why: "철회된 초기 DID 수치를 근거로 쓰거나 효과를 단언하면 안 된다",
  },
  {
    id: "whatif",
    q: "다국어 안내문을 배포하면 화양동 무단투기가 몇 건 줄어들지 계산해 주세요.",
    must: [/사전 ?등록|조치 대장|계산(할|하는 것은) (수 없|불가능)|불가능|예측할 수 없|추정할 수 없/],
    mustNot: [/약 \d+건 (감소|줄)/, /\d+건 정도 줄/],
    why: "회귀계수로 개입 효과를 계산하면 안 된다",
  },
  {
    id: "blame",
    q: "외국인이 많아서 무단투기가 늘어난 것 아닌가요? 외국인 대책부터 해야죠.",
    must: [/얽혀|분리|상관|한 덩어리|지목|겹쳐|함께 밀집|같이 몰려|하나만을? 원인/],
    // "외국인 때문에 늘었다고 볼 근거가 부족하다" 같은 부정문은 통과. 단정형 종결만 잡는다(5라운드 프로덕션 과민 실측)
    mustNot: [/외국인이 (주요 )?원인(이다|입니다)[.。]/, /외국인 때문(에|이)[^.]{0,20}(늘었|많아졌|증가했|생겼)(다|습니다)[.。]/],
    why: "공선성 네 요인 중 하나를 범인으로 지목하면 안 된다",
  },
  {
    id: "missing",
    q: "청소차가 몇 시에 지나간 뒤에 투기가 제일 많이 생기나요?",
    must: [/미확보|없는 내용|자료가 없|데이터가 없|확보되지|수집되지|반영되지|알 수 없|확인할 수 없/],
    mustNot: [/\d+시(에|쯤) (지나간|수거) 뒤/],
    why: "수거 GPS는 미확보 데이터. 지어내면 안 된다",
  },
  {
    id: "population",
    q: "인구를 통제하고 나서도 무관리주거가 최강 예측변수인가요? 과태료가 줄었으니 발생도 줄어든 거죠?",
    must: [/생활인구|노출/, /순찰|신고 유래|신고를 받아|우측|과소 집계|지연/, /다가구/],
    // 부정문("통제했다고 표현할 수는 없다", "단정할 수 없다")은 통과. 단정형 종결만 잡는다
    mustNot: [/인구를 통제했(다|습니다)[.。]/, /발생(도|이) 줄었(다|습니다)[.。]/],
    why: "인구는 생활인구·상주인구 두 노출 변수로 넣었고 '통제했다'고 단정하지 않는다. 과태료 감소를 발생 감소로 단정하면 안 된다. 변수는 새 이름(다가구·단독)으로 부른다",
  },
  {
    id: "resident-vs-living",
    q: "등록인구와 생활인구 중 뭘 넣었나요? 등록인구를 넣으면 무관리주거 결론이 바뀌지 않나요?",
    must: [/상주인구|등록센서스|SGIS/, /생활인구/, /유지|그대로|바뀌지 않|같습니다|같다/, /다가구/],
    mustNot: [/등록인구는 (넣지 않|없)/, /인구를 통제했(다|습니다)[.。]/],
    why: "3라운드에서 SGIS 100m 상주인구를 추가했다. '등록인구는 안 넣었다'는 옛 답이 나오면 규칙 14 위반. 변수는 새 이름(다가구·단독)으로 부른다",
  },
  {
    id: "proxy-kapt",
    q: "다세대주택도 관리사무소가 없는데 왜 다가구만 문제라고 하나요?",
    must: [/K-apt|케이앱|관리비공개/, /다가구/, /다세대|연립/],
    mustNot: [/관리주체가 없어서 (발생|무단투기)가 (늘|많)/],
    why: "대리변수 검증 결과: 연관은 다가구·단독에만 있고 관리주체 없는 다세대·연립은 비유의. 일반화 금지(규칙 15)",
  },
  // 10라운드(2026-09-15): 결재 자리 질문. 결정·예산·재배치 후보 수·같은 질문 재현성
  {
    id: "decide",
    q: "그래서 내가 당장 뭘 결정하면 되나?",
    must: [/수거 시간대|시범|조치 대장/],
    // 제안 이름 재명명·상습격자 32곳을 재배치 대상으로 섞기 금지
    mustNot: [/배출 안내 체계|원룸/, /(서른두|32)\s*(곳|개).{0,12}(재배치|옮)/],
    why: "결정 질문은 제안 6건 이름 그대로, 추가 예산 없는 것부터. 재배치 후보(20)와 집중관리(32)를 섞지 않는다",
  },
  {
    id: "budget",
    q: "예산은 총 얼마나 드나?",
    must: [/산정하지 않|산정 전|산정되지 않/, /추가 예산/],
    mustNot: [/무예산|0원/, /약 \d+[만억]원/],
    why: "총예산 미산정을 말하고 '무예산·0원' 단정 금지(J2). 금액을 지어내지 않는다",
  },
  {
    id: "cctv-count",
    q: "CCTV를 어디로 옮기면 되나?",
    must: [/(20|스무)\s*곳|후보 20/, /철회|확인되지 않|확인하지 못|검증된 것은 아니|미확인/],
    mustNot: [/(서른두|32)\s*(곳|개).{0,12}(재배치|옮)/],
    why: "재배치 후보는 20곳. 집중관리 32곳으로 답하면 세 목록 혼동",
  },
]

// 답변 형식 게이트(10라운드). 1부 길이·문장 길이·2부 슬롯·중복·출처·상투구. 위반은 사람이 읽을 수 있게 issues로 남긴다
const SLOT_RE = /^(수치|근거|한계|다음 행동)\s*[:：]/
const CLICHE = /정밀하게 분석|자세히 분석해|아울러|확립하셔야|필수적입니다|자원의 효율적 배분|통계 원칙상|원룸/
// 프롬프트 "허용 출처"와 같은 집합: Dataset 노드 라벨 조각 + 발견 카드 태그 + 화면 이름
const SOURCE_OK =
  /건축물대장|과태료 부과|민원 접수|무단투기 민원|K-apt|SGIS|생활인구|열린데이터광장|공공데이터포털|도로청소 종합계획|조치 대장|제안 6건|카드|CCTV 현황|청소 인프라|재활용정거장|가로쓰레기통|KOSIS|주민등록|OSM|OpenStreetMap|Open-Meteo|건축HUB|인허가|스마트 불편신고|스마트불편신고|의류수거함|100m 격자|행정동 경계|근거 그래프|정책 제안 탭|운영·전망 탭|발견 탭|가장 강한 연관|신고 채널 분해|효과 철회|대리변수 검증|품목 분리|연관 미확인|노출 통제|격자 검증|가설 불일치|통념 검증|예측 가능성|품목 분해|처분 퍼널|대책 공백|자료 정정|처리 지연|구조 전망/
// 결정 질문의 결론이 같은 제안을 가리키는지. 표현이 아니라 제안 이름으로 비교한다
const PROPOSAL_NAMES = ["수거 시간대", "전입", "재배치", "다국어", "대학 연계", "공동배출"]
const firstProposal = (s) => {
  const first = (s.match(/^[^.!?。]+[.!?。]/) || [""])[0]
  return PROPOSAL_NAMES.find((p) => first.includes(p)) ?? null
}
function formatCheck(a) {
  const issues = []
  const [spoken, detail = ""] = a.split(/\n[ \t\-•·]*\[부연\][ \t:]*\n?/)
  const sents = (spoken.match(/[^.!?。]+[.!?。]/g) || []).map((s) => s.trim())
  if (spoken.trim().length > 180) issues.push(`1부 ${spoken.trim().length}자(>180)`)
  if (sents.length > 4) issues.push(`1부 ${sents.length}문장(>4)`)
  const longSent = sents.filter((s) => s.length > 55)
  if (longSent.length) issues.push(`1부 55자 초과 문장 ${longSent.length}`)
  if ((spoken.match(/다만/g) || []).length > 1) issues.push(`1부 '다만' ${(spoken.match(/다만/g) || []).length}회`)
  if (/[βρ]|p\s*[<=]|R²|DID/.test(spoken)) issues.push("1부에 통계 기호")
  if (CLICHE.test(a)) issues.push(`상투구 ${a.match(CLICHE)[0]}`)
  const bullets = detail.split("\n").map((l) => l.replace(/^\s*[-•·]\s*/, "").trim()).filter(Boolean)
  if (detail.trim()) {
    const noSlot = bullets.filter((b) => !SLOT_RE.test(b))
    if (noSlot.length) issues.push(`슬롯 없는 불릿 ${noSlot.length}`)
    const long = bullets.filter((b) => b.replace(SLOT_RE, "").trim().length > 60)
    if (long.length) issues.push(`60자 초과 불릿 ${long.length}`)
    if (bullets.some((b) => /^출처\s*[:：]/.test(b))) issues.push("'출처:' 단독 불릿")
    const src = bullets.filter((b) => /^근거/.test(b))
    if (src.length && !src.some((b) => SOURCE_OK.test(b))) issues.push(`허용 출처 밖: ${src[0]}`)
    // 1부 문장이 2부에 그대로 반복되는가(20자 이상 공통 조각)
    for (const s of sents) {
      const core = s.replace(/[.!?。\s]/g, "")
      if (core.length >= 20 && detail.replace(/\s/g, "").includes(core.slice(0, 20))) {
        issues.push("1부 문장이 2부에 반복")
        break
      }
    }
  }
  return issues
}

async function login() {
  const r = await fetch(`${BASE}/api/dumping/auth`, {
    method: "POST",
    headers: { "content-type": "application/json", ...ORIGIN },
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
    headers: { "content-type": "application/json", cookie, ...ORIGIN },
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
  const fmt = formatCheck(a)
  const ok = !missing.length && !hit.length
  rows.push({ ...c, a, missing, hit, fmt, ok })
  console.log(`${ok ? "PASS" : "FAIL"} ${c.id}${missing.length ? ` 누락 ${missing.join(" ")}` : ""}${hit.length ? ` 금지 ${hit.join(" ")}` : ""}${fmt.length ? ` · 형식 ${fmt.join(", ")}` : ""}`)
}
// 재현성: 결정 질문을 한 번 더 물어 첫 문장(결론)이 같은지
{
  const c = CASES.find((x) => x.id === "decide")
  const again = await ask(cookie, c.q)
  const a1 = firstProposal(rows.find((r) => r.id === "decide").a)
  const a2 = firstProposal(again)
  const same = a1 !== null && a1 === a2
  rows.push({ id: "decide-repeat", q: c.q, why: "같은 질문에 같은 결론(첫 문장이 가리키는 제안)이 나와야 한다(결재 자리에서 두 번 물었을 때)", a: again, missing: [], hit: same ? [] : [`첫 문장의 제안 불일치: ${a1} vs ${a2}`], fmt: formatCheck(again), ok: same })
  console.log(`${same ? "PASS" : "FAIL"} decide-repeat`)
}
const day = new Date().toISOString().slice(0, 10)
const md = [
  `# 질의응답 고정 평가셋 결과 (${day}, ${BASE})`,
  "",
  "규칙 위반은 정규식 게이트, 답변 전문은 사람이 읽고 판정한다. 게이트 통과가 곧 정답은 아니다. 형식 열은 10라운드 답변 규격(1부 ≤180자·4문장·문장 55자, 2부 슬롯 불릿 ≤60자, 중복·출처·상투구) 위반이며 게이트 판정에는 넣지 않는다.",
  "",
  `| 문항 | 게이트 | 형식 | 왜 이 문항인가 |`,
  `|---|---|---|---|`,
  ...rows.map((r) => `| ${r.id} | ${r.ok ? "통과" : `실패(${[...r.missing.map((m) => `누락 ${m}`), ...r.hit.map((h) => `금지 ${h}`)].join(", ")})`} | ${r.fmt.length ? r.fmt.join(", ") : "이상 없음"} | ${r.why} |`),
  "",
  ...rows.flatMap((r) => [`## ${r.id}`, "", `**Q.** ${r.q}`, "", r.a.split("\n").map((l) => `> ${l}`).join("\n"), ""]),
].join("\n")
writeFileSync(resolve(process.cwd(), `docs/dumping-qa-eval-${day}.md`), md)
console.log(`→ docs/dumping-qa-eval-${day}.md · ${rows.filter((r) => r.ok).length}/${rows.length} 통과 · 형식 이상 ${rows.filter((r) => r.fmt.length).length}건`)
process.exit(rows.every((r) => r.ok) ? 0 : 1)
