// /dumping 스크린샷 시퀀스(프로덕션 리뷰·냉독용). /snow scripts/snow-shots.mjs 규약 이식(2026-09-21).
//   npm run build && node node_modules/.bin/next start -p 3000 &   # 프로덕션 빌드로(dev는 "N Issues" 인디케이터·hydration 경고가 섞인다)
//   DUMPING_PASSWORD=.... node scripts/dumping-shots.mjs [출력 폴더] [--base http://localhost:3000] [--only 이름,이름]
// 비밀번호는 env DUMPING_PASSWORD, 없으면 .env.local에서 읽는다(프로덕션 비밀번호는 로컬과 다르다). 로그인은 컨텍스트 요청으로 쿠키를 받는다(Origin 3000만 허용하는 proxy.ts를 지난다).
// Playwright는 character-card 레포의 것을 빌린다(gjdong devDependency 아님). 헤드 크롬(channel chrome)을 화면 밖에 띄운다:
// headless swiftshader는 setData 반영이 수 초 늦어 장면 5에 앞 장면 기둥이 남은 것처럼 찍힌다(19라운드 실측).
// 장면 목록은 SHOTS. 첫 화면 결론 등장(커튼 뒤 초록·기둥) 전후 픽셀 차이(게이트 2%)는 sharp로 잰다.
/* global window, document */
import fs from "node:fs"
import path from "node:path"
import { createRequire } from "node:module"
import sharp from "sharp"

const require = createRequire(import.meta.url)
const HOME = process.env.HOME ?? ""
const PW_ROOT = process.env.PLAYWRIGHT_ROOT ?? path.join(HOME, "workspace/character-card")
const { chromium } = require(path.join(PW_ROOT, "node_modules/playwright"))

const args = process.argv.slice(2)
const flag = (k) => {
  const i = args.indexOf(k)
  return i >= 0 ? args[i + 1] : null
}
const OUT = args.find((a) => !a.startsWith("--") && args[args.indexOf(a) - 1] !== "--base" && args[args.indexOf(a) - 1] !== "--only") ?? path.join(process.cwd(), "docs/dumping-shots")
const BASE = flag("--base") ?? "http://localhost:3000"
const ONLY = flag("--only")?.split(",") ?? null
fs.mkdirSync(OUT, { recursive: true })

function password() {
  if (process.env.DUMPING_PASSWORD) return process.env.DUMPING_PASSWORD
  try {
    const env = fs.readFileSync(path.join(process.cwd(), ".env.local"), "utf8")
    const m = /^DUMPING_PASSWORD=(.*)$/m.exec(env)
    if (m) return m[1].trim().replace(/^["']|["']$/g, "")
  } catch {
    // .env.local 없음
  }
  throw new Error("DUMPING_PASSWORD가 없습니다(env 또는 .env.local)")
}
const PW = password()

const wait = (ms) => new Promise((r) => setTimeout(r, ms))
// 데스크톱 1440×900. 시연 캡션·월별 띠는 xl(1280) 이상에서만 보인다
const DESKTOP = { width: 1440, height: 900 }
const MOBILE = { width: 390, height: 844 }

async function tab(page, label) {
  await page.locator(`[role="tab"]:has-text("${label}")`).first().click()
  await wait(2600)
}
// 레이어 패널 줄(오른쪽 열. 모바일은 "레이어" 덮개 안). 토글이라 현재 상태를 읽고 원하는 상태로만
async function layer(page, label, on) {
  const b = page.locator("button[aria-pressed]:visible").filter({ hasText: label }).first()
  const cur = (await b.getAttribute("aria-pressed")) === "true"
  if (cur !== on) await b.click()
  await wait(2000)
}
async function theme(page, light) {
  const cur = await page.evaluate(() => document.documentElement.getAttribute("data-theme"))
  if ((cur === "light") !== light) {
    await page.locator('button[aria-label*="모드로 전환"]').first().click()
    await wait(2600)
  }
}
const shot = async (page, name) => {
  const file = path.join(OUT, `${name}.png`)
  await page.screenshot({ path: file })
  return file
}
// 두 PNG의 픽셀 차이 비율(%). 채널 차 합이 60 넘는 픽셀을 다른 픽셀로
async function diffPct(a, b) {
  const A = await sharp(a).raw().toBuffer({ resolveWithObject: true })
  const B = await sharp(b).raw().toBuffer({ resolveWithObject: true })
  const n = Math.min(A.data.length, B.data.length) / A.info.channels
  let d = 0
  for (let i = 0; i < n; i++) {
    const o = i * A.info.channels
    if (Math.abs(A.data[o] - B.data[o]) + Math.abs(A.data[o + 1] - B.data[o + 1]) + Math.abs(A.data[o + 2] - B.data[o + 2]) > 60) d++
  }
  return (d / n) * 100
}
// 커튼이 걷힐 때까지(최대 30초). 걷힌 뒤 결론 등장(초록 0.8초·기둥 1.8초)까지 더 기다린다
// 22라운드: 커튼은 대시보드 청크가 뜬 뒤에야 생긴다. 생기기 전엔 "커튼 없음"이 참이라 바로 통과해 프로덕션에서 01·00-after가 커튼째 찍혔다 → 먼저 생기길 기다린다
async function settled(page) {
  await page.waitForSelector(".dump-curtain", { timeout: 30_000 }).catch(() => {})
  await page.waitForFunction(() => !document.querySelector(".dump-curtain") || document.querySelector(".dump-curtain.out"), null, { timeout: 40_000 }).catch(() => {})
  await wait(3200)
}

// 장면 목록. 각 항목은 새 페이지(로그인 뒤 첫 화면 상태)에서 시작한다
const SHOTS = [
  {
    name: "00-curtain",
    desc: "로딩 커튼(4단계·타일 n/m, 3Mbps 스로틀)",
    noSettle: true,
    throttle: true, // localhost는 0.9초 안에 다 와서 커튼이 안 찍힌다. 19라운드 실측과 같은 3Mbps로 조인다
    run: async (page, ctx) => {
      await wait(2500)
      ctx.curtain = await shot(page, "00-curtain")
      await settled(page)
      ctx.after = await shot(page, "00-curtain-after")
    },
  },
  { name: "01-first", desc: "첫 화면(정책 제안 탭·입체·라이트. 결론 등장 뒤 다가구·단독 초록 + 과태료 기둥)", run: async () => {} },
  {
    name: "02-card-scroll",
    desc: "카드 스크롤(01 결론·02 제안 6건)",
    run: async (page) => {
      await page.evaluate(() => {
        const box = [...document.querySelectorAll("aside .overflow-y-auto")].find((el) => el.clientHeight > 0)
        if (box) box.scrollTop = 520
      })
      await wait(600)
    },
  },
  {
    name: "03-zoom-town",
    desc: "동네 확대(z15.8 입체. 건물이 칸 값 색, 원기둥 = 과태료)",
    run: async (page) => {
      await page.evaluate(() => window.__dumpMap?.easeTo({ center: [127.083, 37.548], zoom: 15.8, pitch: 58, bearing: -18, duration: 800 }))
      await wait(2400)
    },
  },
  { name: "04-dong-bars", desc: "동별 막대(입체 기둥·1~3위 숫자)", run: async (page) => layer(page, "동별 막대", true) },
  { name: "05-grid3d", desc: "격자 기둥(5건 이상 칸)", run: async (page) => layer(page, "격자 기둥", true) },
  { name: "06-candidates", desc: "CCTV 재배치 후보(회색 바탕·앰버 핀·상위 3 벽돌색·후보 목록)", run: async (page) => layer(page, "CCTV 재배치 후보", true) },
  { name: "07-routes", desc: "청소차 노선(체인마다 청소차 왕복)", run: async (page) => layer(page, "청소차 노선", true) },
  { name: "08-weather", desc: "날씨별 민원 원(지금 조건부터. 칩의 점이 실황)", run: async (page) => layer(page, "날씨별 민원 원", true) },
  { name: "09-tab-qa", desc: "물어보기 탭(준비된 답 6 + 더 보기)", run: async (page) => tab(page, "물어보기") },
  {
    name: "10-tab-qa-seed",
    desc: "준비된 답 펼침(1부 문장별·2부 슬롯 칩)",
    run: async (page) => {
      await tab(page, "물어보기")
      // 준비된 답 목록에서 닫혀 있는 첫 항목(첫째는 기본으로 펼쳐져 있다. 닫힌 항목 글에는 힌트가 붙어 "?"로 끝나지 않는다)
      await page.locator('aside button[aria-expanded="false"]:visible').filter({ hasText: "?" }).first().click()
      await wait(1200)
    },
  },
  { name: "11-tab-findings", desc: "발견 탭(결론 5장 먼저)", run: async (page) => tab(page, "발견") },
  {
    name: "12-finding-modal",
    desc: "발견 카드 모달(쉬운 풀이·지도 반영)",
    run: async (page) => {
      await tab(page, "발견")
      await page.locator("aside button").filter({ hasText: "다가구·단독주택 밀집" }).first().click()
      await wait(1000)
    },
  },
  { name: "13-tab-ops", desc: "운영·전망 탭(핫스팟 20 기둥·순위)", run: async (page) => tab(page, "운영·전망") },
  {
    name: "14-ops-critical",
    desc: "집중관리 상습격자 토글(벽돌색 기둥)",
    run: async (page) => {
      await tab(page, "운영·전망")
      await page.locator("aside button").filter({ hasText: "집중관리" }).first().click()
      await wait(2400)
    },
  },
  { name: "15-tab-graph", desc: "근거 그래프 탭", run: async (page) => tab(page, "근거 그래프") },
  {
    name: "16-methods",
    desc: "데이터·방법 모달",
    run: async (page) => {
      await page.getByRole("button", { name: "데이터·방법" }).first().click()
      await wait(900)
    },
  },
  ...[0, 1, 2, 3, 4].map((k) => ({
    name: `17-demo-${k + 1}`,
    desc: `시연 장면 ${k + 1}`,
    run: async (page) => {
      await page.getByRole("button", { name: "시연", exact: true }).click()
      await wait(400)
      for (let i = 0; i < k; i++) {
        await page.keyboard.press("ArrowRight")
        await wait(400)
      }
      await wait(k === 3 ? 9000 : 4600)
    },
  })),
  {
    name: "18-demo-card-hidden",
    desc: "시연 중 카드 숨김(H)",
    run: async (page) => {
      await page.getByRole("button", { name: "시연", exact: true }).click()
      await wait(2600)
      await page.keyboard.press("h")
      await wait(1600)
    },
  },
  {
    name: "19-demo-end",
    desc: "시연 끝(카드·카메라 복원)",
    run: async (page) => {
      await page.getByRole("button", { name: "시연", exact: true }).click()
      await wait(2000)
      await page.keyboard.press("Escape")
      await wait(2200)
    },
  },
  { name: "20-flat", desc: "평면 보기(격자 히트맵·원)", run: async (page) => layer(page, "입체 보기", false) },
  { name: "21-dark", desc: "다크 첫 화면(밤 지도)", run: async (page) => theme(page, false) },
  {
    name: "22-dark-zoom",
    desc: "다크 동네 확대",
    run: async (page) => {
      await theme(page, false)
      await page.evaluate(() => window.__dumpMap?.easeTo({ center: [127.083, 37.548], zoom: 15.8, pitch: 58, bearing: -18, duration: 800 }))
      await wait(2400)
    },
  },
  { name: "23-mobile", desc: "모바일 390(평면 기본·짧은 탭 이름)", viewport: MOBILE, run: async () => {} },
  {
    name: "24-mobile-layers",
    desc: "모바일 레이어 덮개(범례)",
    viewport: MOBILE,
    run: async (page) => {
      await page.locator('button[aria-label="지도 레이어"]').first().click()
      await wait(800)
    },
  },
]

// 로그인: 컨텍스트의 요청 객체로 POST /api/dumping/auth(응답 쿠키가 같은 컨텍스트의 쿠키 통에 들어간다). 페이지를 열기 전에 하므로 첫 goto가 콜드 로드 = 커튼이 찍힌다.
// Origin은 proxy.ts 허용 목록(3000)과 같게 준다
async function login(context) {
  const r = await context.request.post(`${BASE}/api/dumping/auth`, { data: { password: PW }, headers: { Origin: BASE } })
  if (!r.ok()) throw new Error(`로그인 실패 ${r.status()}(비밀번호·레이트리밋 확인)`)
}

async function main() {
  const browser = await chromium.launch({ channel: "chrome", headless: false, args: ["--window-position=2000,2000", "--window-size=1440,900"] })
  const results = []
  const ctx = {}
  for (const s of SHOTS) {
    if (ONLY && !ONLY.includes(s.name)) continue
    const context = await browser.newContext({ viewport: s.viewport ?? DESKTOP, deviceScaleFactor: 1, locale: "ko-KR" })
    const page = await context.newPage()
    const errors = []
    page.on("pageerror", (e) => errors.push(String(e)))
    page.on("console", (m) => m.type() === "error" && errors.push(m.text()))
    // 로그인 쿠키를 먼저 받고 페이지를 연다(게이트 화면 없이 바로 대시보드·커튼). 새 컨텍스트라 캐시가 비어 있어 커튼 단계가 실제로 보인다
    await login(context)
    if (s.throttle) {
      const cdp = await context.newCDPSession(page)
      await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 40, downloadThroughput: (3 * 1024 * 1024) / 8, uploadThroughput: (1 * 1024 * 1024) / 8 })
    }
    await page.goto(`${BASE}/dumping`, { waitUntil: "domcontentloaded" })
    if (!s.noSettle) await settled(page)
    try {
      await s.run(page, ctx)
      const file = await shot(page, s.name)
      results.push({ name: s.name, desc: s.desc, file, errors })
      console.log(`${s.name}  ${s.desc}${errors.length ? `  ⚠ ${errors.length} errors` : ""}`)
    } catch (e) {
      results.push({ name: s.name, desc: s.desc, error: String(e), errors })
      console.log(`${s.name}  실패: ${String(e).split("\n")[0]}`)
    }
    await context.close()
  }
  await browser.close()
  if (ctx.curtain && ctx.after) {
    const pct = await diffPct(ctx.curtain, ctx.after)
    console.log(`커튼 전후 픽셀 차이 ${pct.toFixed(2)}% (게이트 2%) ${pct > 2 ? "통과" : "미달"}`)
    results.push({ name: "gate-curtain-diff", pct })
  }
  fs.writeFileSync(path.join(OUT, "index.json"), JSON.stringify(results, null, 1))
  const errs = results.filter((r) => r.errors?.length)
  if (errs.length) console.log("콘솔 오류:", errs.map((r) => `${r.name}: ${r.errors.slice(0, 2).join(" | ")}`).join("\n"))
}
main().catch((e) => {
  console.error(e)
  process.exit(1)
})
