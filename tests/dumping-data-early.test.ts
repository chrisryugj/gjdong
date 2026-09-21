import assert from "node:assert/strict"
import { test } from "node:test"
import { AUTH_EXPIRED, fetchBundle, resetDumpingData, startDumpingData } from "../components/dumping/data-early"

// 선행 로딩(독립 리뷰 F3·F4): 재진입·재로그인이 만료된 인증 판정과 이전 자료를 물려받지 않고, 자료 API 401은 인증 만료로 구분된다.
// fetch만 모의한다. 실제 서버·쿠키는 쓰지 않는다
type Reply = { status: number; body: unknown }
const log: string[] = []
let replies: Record<string, Reply> = {}
globalThis.fetch = (async (url: string) => {
  log.push(url)
  const r = replies[url] ?? { status: 404, body: null }
  return { ok: r.status < 400, status: r.status, json: async () => r.body } as Response
}) as typeof fetch

const ok = (body: unknown): Reply => ({ status: 200, body })
const authOk = () => {
  replies = {
    "/api/dumping/auth": ok({ ok: true }),
    "/api/dumping/data/map": ok({ grid: [] }),
    "/api/dumping/data/graph": ok({ nodes: [] }),
    "/api/dumping/data/interventions": ok({ entries: [] }),
    "/api/dumping/data/bin-recos": ok([]),
  }
}
const settle = () => new Promise((r) => setTimeout(r, 0))

test("한 번 시작한 약속은 같은 마운트 안에서 재사용되고, 비운 뒤에는 인증·자료를 새로 요청한다", async () => {
  authOk()
  log.length = 0
  const first = startDumpingData()
  assert.equal(startDumpingData(), first)
  assert.equal(await first.auth, true)
  await settle()
  assert.ok(first.data)
  assert.equal(log.filter((u) => u === "/api/dumping/auth").length, 1)
  assert.equal(log.length, 5)

  // 재진입(대시보드 unmount → mount): 쿠키가 만료됐다고 가정
  resetDumpingData()
  replies["/api/dumping/auth"] = ok({ ok: false })
  log.length = 0
  const second = startDumpingData()
  assert.notEqual(second, first)
  assert.equal(await second.auth, false)
  await settle()
  assert.equal(second.data, null) // 인증 실패면 자료를 받지 않는다
  assert.deepEqual(log, ["/api/dumping/auth"])
})

test("자료 API 401은 AUTH_EXPIRED로 구분돼 로그인으로 돌아갈 수 있다. 그 밖의 실패는 일반 오류", async () => {
  authOk()
  replies["/api/dumping/data/map"] = { status: 401, body: { error: "unauthorized" } }
  await assert.rejects(fetchBundle(), (e: Error) => e.message === AUTH_EXPIRED)
  replies["/api/dumping/data/map"] = { status: 500, body: null }
  await assert.rejects(fetchBundle(), (e: Error) => e.message !== AUTH_EXPIRED)
  // 조치 대장·배치추천은 없어도 번들이 선다
  authOk()
  replies["/api/dumping/data/interventions"] = { status: 404, body: null }
  replies["/api/dumping/data/bin-recos"] = { status: 404, body: null }
  const b = await fetchBundle()
  assert.equal(b.interventions, null)
  assert.equal(b.binRecos, undefined)
})
