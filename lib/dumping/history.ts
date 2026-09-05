// 질의응답 대화 이력 정규화 — Gemini는 user/model이 번갈아야 하고 첫 턴이 user여야 한다.
// 라우트 밖으로 뺀 이유: 테스트. "넘치지 않으면 전부 버리던" 초기값 버그(cut=out.length)가 여기서 잡힌다.

export type Turn = { role: "user" | "model"; text: string }

export const MAX_HISTORY_CHARS = 8_000 // 이력 전체 글자 상한 — 시스템 프롬프트가 이미 길어 입력 토큰을 묶는다

export function normalizeHistory(raw: Turn[], maxChars = MAX_HISTORY_CHARS): Turn[] {
  const out: Turn[] = []
  for (const t of raw) {
    if (out.length === 0 && t.role !== "user") continue
    if (out.length > 0 && out[out.length - 1].role === t.role) {
      out[out.length - 1] = t // 같은 역할 연속이면 뒤엣것만
      continue
    }
    out.push(t)
  }
  // 마지막이 user면 이번 질문과 겹친다 — 떨어뜨림
  if (out.length && out[out.length - 1].role === "user") out.pop()
  // 글자 상한 — 뒤에서부터 더해 넘치는 지점 앞을 버린다. 넘치지 않으면 전부 유지(cut=0)
  let total = 0
  let cut = 0
  for (let i = out.length - 1; i >= 0; i--) {
    total += out[i].text.length
    if (total > maxChars) {
      cut = i + 1
      break
    }
  }
  const trimmed = out.slice(cut)
  return trimmed[0]?.role === "model" ? trimmed.slice(1) : trimmed
}
