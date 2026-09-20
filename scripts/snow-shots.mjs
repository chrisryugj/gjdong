// /snow 스크린샷 시퀀스(냉독·프로덕션 리뷰용). 4라운드(2026-09-21)부터 레포에 둔다(세션 scratchpad에 두면 세션마다 사라졌다).
//   npm run build && node node_modules/.bin/next start -p 3000 &   # 프로덕션 빌드로(dev는 "N Issues" 인디케이터·hydration 경고가 섞인다)
//   node scripts/snow-shots.mjs [출력 폴더] [--base http://localhost:3000] [--only 이름,이름]
// Playwright는 character-card 레포의 것을 빌린다(gjdong devDependency 아님). 헤드 크롬(channel chrome)을 화면 밖(--window-position)에 띄운다:
// headless swiftshader는 3D 레이어 fps를 못 재고 WebGL 텍스처가 다르다(3라운드 실측).
// 장면 목록은 SHOTS. 이름·설명·동작(page 함수)만 적는다. 격상 전후 픽셀 차이(게이트 2%)는 sharp로 잰다.
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
const OUT = args.find((a) => !a.startsWith("--") && args[args.indexOf(a) - 1] !== "--base" && args[args.indexOf(a) - 1] !== "--only") ?? path.join(process.cwd(), "docs/snow-shots")
const BASE = flag("--base") ?? "http://localhost:3000"
const ONLY = flag("--only")?.split(",") ?? null
fs.mkdirSync(OUT, { recursive: true })

const wait = (ms) => new Promise((r) => setTimeout(r, ms))
// 데스크톱 1440×900. 시연 캡션은 xl(1280) 이상에서만 보인다
const DESKTOP = { width: 1440, height: 900 }
const MOBILE = { width: 390, height: 844 }

async function tab(page, label) {
  await page.locator(`[role="tab"]:has-text("${label}")`).first().click()
  await wait(2600)
}
async function layer(page, label, on) {
  const b = page.locator(`aside ~ div button[aria-pressed]:visible, div button[aria-pressed]:visible`).filter({ hasText: label }).first()
  const cur = (await b.getAttribute("aria-pressed")) === "true"
  if (cur !== on) await b.click()
  await wait(1800)
}
async function theme(page, light) {
  const cur = await page.evaluate(() => document.documentElement.getAttribute("data-theme"))
  if ((cur === "light") !== light) {
    await page.locator('button[aria-label*="모드로 전환"]').first().click()
    await wait(2600)
  }
}
async function settle(page, ms = 2600) {
  await wait(ms)
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

// 장면 목록. 각 항목은 새 페이지(첫 화면 상태)에서 시작한다
const SHOTS = [
  { name: "01-first", desc: "첫 화면(공백 탭·입체·다크)", run: async () => {} },
  {
    name: "02-card-scroll",
    desc: "카드 스크롤(01 점검 후보·02 열선 없는 구간·03 발견)",
    run: async (page) => {
      await page.evaluate(() => {
        const box = [...document.querySelectorAll("aside .overflow-y-auto")].find((el) => el.clientHeight > 0)
        if (box) box.scrollTop = 560
      })
      await wait(600)
    },
  },
  {
    name: "03-zoom-town",
    desc: "동네 확대(z15.5 입체. 회색 = 열선 있는 취약구간, 진홍 = 없는 구간)",
    run: async (page) => {
      await page.evaluate(() => window.__snowMap?.easeTo({ center: [127.0925, 37.5535], zoom: 15.5, pitch: 55, bearing: -18, duration: 800 }))
      await wait(2200)
    },
  },
  {
    name: "04-row-click",
    desc: "공백 표 첫 행 클릭(초점 고리·칩)",
    run: async (page) => {
      await page.locator("aside button").filter({ hasText: /능동로|길|로 / }).first().click()
      await wait(3200)
    },
  },
  { name: "05-slope-on", desc: "지형 경사 추정 켬(조망·다크)", run: async (page) => layer(page, "지형 경사 추정", true) },
  {
    name: "06-slope-zoom",
    desc: "경사 확대(중곡4동 용마산로. 경사면·오르막 화살)",
    run: async (page) => {
      await layer(page, "지형 경사 추정", true)
      await page.evaluate(() => window.__snowMap?.easeTo({ center: [127.0885, 37.5675], zoom: 16.2, pitch: 62, bearing: -30, duration: 800 }))
      await wait(2400)
    },
  },
  {
    name: "07-slope-light",
    desc: "경사 라이트 모드(조망)",
    run: async (page) => {
      await theme(page, true)
      await layer(page, "지형 경사 추정", true)
    },
  },
  {
    name: "08-slope-light-zoom",
    desc: "경사 라이트 모드 확대",
    run: async (page) => {
      await theme(page, true)
      await layer(page, "지형 경사 추정", true)
      await page.evaluate(() => window.__snowMap?.easeTo({ center: [127.0885, 37.5675], zoom: 16.2, pitch: 62, bearing: -30, duration: 800 }))
      await wait(2400)
    },
  },
  { name: "09-tab-stage", desc: "대응 단계 탭(단계 동원 층·시나리오 5cm = 2단계 제설차)", run: async (page) => tab(page, "대응 단계") },
  {
    name: "10-tab-stage-3",
    desc: "대응 단계 탭 시나리오 12cm(3단계)",
    run: async (page) => {
      await tab(page, "대응 단계")
      await page.locator('input[type="range"]').first().fill("12")
      await wait(2200)
    },
  },
  { name: "11-tab-resources", desc: "자원 현황 탭(동별 기둥·라벨 1위 접두)", run: async (page) => tab(page, "자원 현황") },
  { name: "12-tab-graph", desc: "근거 그래프 탭", run: async (page) => tab(page, "근거 그래프") },
  { name: "13-tab-law", desc: "법령·책임 탭(관리청별 색)", run: async (page) => tab(page, "법령·책임") },
  {
    name: "14-modal",
    desc: "데이터·방법 모달(못 구한 데이터)",
    run: async (page) => {
      await page.getByRole("button", { name: "데이터·방법" }).first().click()
      await wait(800)
      await page.getByRole("button", { name: "못 구한 데이터" }).click()
      await wait(600)
    },
  },
  ...[0, 1, 2, 3, 4, 5].map((k) => ({
    name: `15-demo-${k + 1}`,
    desc: `시연 장면 ${k + 1}`,
    run: async (page, ctx) => {
      await page.getByRole("button", { name: "시연", exact: true }).click()
      await wait(400)
      for (let i = 0; i < k; i++) {
        await page.keyboard.press("ArrowRight")
        await wait(400)
      }
      if (k === 2) {
        // 격상 전(보강)·후(3단계) 두 장. 픽셀 차이가 게이트
        await wait(1500)
        ctx.before = await shot(page, "15-demo-3-before")
        await wait(7000)
      } else if (k === 5) await wait(9000)
      else await wait(k === 1 ? 4200 : 3600)
    },
  })),
  {
    name: "16-demo-end",
    desc: "시연 끝(카드·카메라 복원)",
    run: async (page) => {
      await page.getByRole("button", { name: "시연", exact: true }).click()
      await wait(2000)
      await page.keyboard.press("Escape")
      await wait(2200)
    },
  },
  { name: "17-flat", desc: "평면 보기", run: async (page) => layer(page, "입체 보기", false) },
  {
    name: "18-flat-slope",
    desc: "평면 + 경사(오르막 화살 글리프)",
    run: async (page) => {
      await layer(page, "입체 보기", false)
      await layer(page, "지형 경사 추정", true)
      await page.evaluate(() => window.__snowMap?.easeTo({ center: [127.0885, 37.5675], zoom: 16, pitch: 0, bearing: 0, duration: 600 }))
      await wait(2000)
    },
  },
  { name: "19-light", desc: "라이트 첫 화면", run: async (page) => theme(page, true) },
  { name: "20-mobile", desc: "모바일 390(평면 기본)", viewport: MOBILE, run: async () => {} },
  {
    name: "21-mobile-layers",
    desc: "모바일 레이어 덮개(범례)",
    viewport: MOBILE,
    run: async (page) => {
      await page.locator('button:has-text("레이어")').first().click()
      await wait(800)
    },
  },
]

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
    await page.goto(`${BASE}/snow`, { waitUntil: "networkidle" })
    await settle(page, 4200)
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
  if (ctx.before && fs.existsSync(path.join(OUT, "15-demo-3.png"))) {
    const pct = await diffPct(ctx.before, path.join(OUT, "15-demo-3.png"))
    console.log(`격상 전후 픽셀 차이 ${pct.toFixed(2)}% (게이트 2%) ${pct > 2 ? "통과" : "미달"}`)
    results.push({ name: "gate-stage-diff", pct })
  }
  fs.writeFileSync(path.join(OUT, "index.json"), JSON.stringify(results, null, 1))
  const errs = results.filter((r) => r.errors?.length)
  if (errs.length) console.log("콘솔 오류:", errs.map((r) => `${r.name}: ${r.errors.slice(0, 2).join(" | ")}`).join("\n"))
}
main().catch((e) => {
  console.error(e)
  process.exit(1)
})
