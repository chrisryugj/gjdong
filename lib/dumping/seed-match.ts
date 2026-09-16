// 질문이 준비된 답(시드 17개)과 같은 뜻이면 모델을 부르지 않고 그 답을 바로 낸다(13라운드 속도).
// 준비된 답은 검증된 수치로 쓴 정본이라 모델 답보다 못할 이유가 없고, 첫 글자까지 10초를 0초로 만든다.
// 판정은 글자 2-gram Dice 유사도. 오탐이 오답보다 나쁘므로 문턱을 높게 두고, 2위와 차이가 작으면 매칭하지 않는다.
// 화면은 어느 준비된 답으로 판단했는지 밝히고 "모델에게 새로 묻기"를 둔다.

const PUNCT = /[?？!！.。,、·'"“”‘’()（）[\]~]/g
// 낱말 끝 조사("예산은"→"예산")와 문장 끝 어미("드나"·"들어"→"드"·"들")만 뗀다. 과하게 깎지 않는다
const PARTICLE = /(은|는|이|가|을|를|도|의|에서|에|로|와|과)$/
const TAIL = /(인가요|인가|나요|을까요|을까|습니까|습니다|어요|에요|되나|되죠|됩니까|건가|나|니|냐|죠|지|야|해|어|아)$/

export function normalizeQ(q: string): string {
  const words = q.replace(PUNCT, "").trim().split(/\s+/).filter(Boolean)
  const stripped = words.map((w, i) => (w.length > 1 && i < words.length - 1 ? w.replace(PARTICLE, "") : w))
  return stripped.join("").replace(TAIL, "").toLowerCase()
}

function bigrams(s: string): Map<string, number> {
  const m = new Map<string, number>()
  for (let i = 0; i < s.length - 1; i++) {
    const g = s.slice(i, i + 2)
    m.set(g, (m.get(g) ?? 0) + 1)
  }
  return m
}

export function dice(a: string, b: string): number {
  if (!a || !b) return 0
  if (a === b) return 1
  const ga = bigrams(a)
  const gb = bigrams(b)
  let inter = 0
  for (const [g, n] of ga) inter += Math.min(n, gb.get(g) ?? 0)
  const total = (a.length - 1) + (b.length - 1)
  return total > 0 ? (2 * inter) / total : 0
}

export const SEED_MATCH_MIN = 0.55
export const SEED_MATCH_MARGIN = 0.12
// 글자 겹침은 부정·반대 방향을 못 본다("놓으면 안 되나"≈"놓아야 하나", "절감되나"≈"드나", "나아졌나"≈"나빠졌나" 실측 0.63~0.67).
// 질문과 시드 중 한쪽에만 이런 낱말이 있으면 붙이지 않는다(오탐이 오답보다 나쁘다)
const POLARITY = /안\s|안\s?되|않|못\s|못하|없|아니|말고|절감|줄이|줄어|줄었|나아|좋아|나은/

export function matchSeed<T extends { q: string }>(question: string, seeds: T[]): { seed: T; score: number } | null {
  const q = normalizeQ(question)
  if (q.length < 4) return null
  const polar = POLARITY.test(question)
  const scored = seeds
    .filter((seed) => POLARITY.test(seed.q) === polar)
    .map((seed) => ({ seed, score: dice(q, normalizeQ(seed.q)) }))
    .sort((a, b) => b.score - a.score)
  const [best, second] = scored
  if (!best || best.score < SEED_MATCH_MIN) return null
  if (second && best.score - second.score < SEED_MATCH_MARGIN && best.score < 0.9) return null
  return best
}
