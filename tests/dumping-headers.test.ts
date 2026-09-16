import { test } from "node:test"
import assert from "node:assert"
import nextConfig from "../next.config.mjs"

// 14라운드: 전역 Permissions-Policy microphone=()가 /dumping에도 걸려 음성 질의응답(SpeechRecognition·getUserMedia)이
// not-allowed였다(2026-09-16 Playwright 실측). /dumping 항목이 같은 키를 self로 덮어야 한다(같은 키는 뒤 항목이 이긴다)
type HeaderRule = { source: string; headers: { key: string; value: string }[] }

test("/dumping 경로는 마이크를 허용하고 나머지 경로는 막는다", async () => {
  const rules = (await (nextConfig as { headers: () => Promise<HeaderRule[]> }).headers()) as HeaderRule[]
  const find = (source: string) => rules.find((r) => r.source === source)?.headers.find((h) => h.key === "Permissions-Policy")?.value
  assert.match(find("/(.*)") ?? "", /microphone=\(\)/)
  const dump = find("/dumping/:path*")
  assert.ok(dump, "/dumping/:path* 항목에 Permissions-Policy가 있어야 한다")
  assert.match(dump, /microphone=\(self\)/)
  assert.match(dump, /camera=\(\)/)
  // 전역 항목이 /dumping 항목보다 앞에 있어야 뒤 항목(self)이 이긴다
  const gi = rules.findIndex((r) => r.source === "/(.*)")
  const di = rules.findIndex((r) => r.source === "/dumping/:path*")
  assert.ok(gi >= 0 && di > gi)
})
