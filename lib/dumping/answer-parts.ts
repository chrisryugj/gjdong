// 질의응답 답변의 두 부분 분리와 음성 읽기용 정리.
// 프롬프트(context.ts "답변 형식")가 답을 "말로 하는 답" + [부연] 구분줄 + "부연"으로 내게 하고,
// 화면은 앞부분을 크게, 뒷부분을 옅게 보여 주며 음성은 앞부분만 읽는다.
// 스트리밍 중에도 쓰이므로 구분줄이 아직 안 왔으면 전부 spoken으로 본다.

export const DETAIL_MARK = "[부연]"

// 구분줄: 줄 머리의 [부연] (앞뒤 공백·불릿 허용). 모델이 "- [부연]"처럼 내도 잡는다
const MARK_RE = /(^|\n)[ \t\-•·]*\[부연\][ \t:]*\n?/

export interface AnswerParts {
  spoken: string // 읽어 줄 본답
  detail: string // 근거 수치·한계. 비어 있을 수 있다
  split: boolean // 구분줄이 나왔는지 (스트리밍 중 문장 단위 낭독의 종료 신호)
}

export function splitAnswer(text: string): AnswerParts {
  const m = MARK_RE.exec(text)
  if (!m) return { spoken: text.trim(), detail: "", split: false }
  return {
    spoken: text.slice(0, m.index).trim(),
    detail: text.slice(m.index + m[0].length).trim(),
    split: true,
  }
}

// 완성된 문장만 골라낸다(스트리밍 낭독용). 마침표·물음표·느낌표 뒤에 공백이나 줄바꿈이 와야 완성으로 본다.
// 반환: [완성 문장들, 소비한 글자 수]. "2.10배"처럼 숫자 안의 점은 뒤에 공백이 없어 안 끊긴다.
export function completeSentences(text: string): [string[], number] {
  const out: string[] = []
  let consumed = 0
  for (let i = 0; i < text.length - 1; i++) {
    if (!".!?。".includes(text[i]) || !/\s/.test(text[i + 1])) continue
    const s = text.slice(consumed, i + 1).trim()
    if (s) out.push(s)
    consumed = i + 1
  }
  return [out, consumed]
}

// 화면 표시용 문장 나누기. 1부를 문장마다 한 줄로 보여 주고 첫 문장만 결론으로 강조한다.
// completeSentences는 끝에 공백이 있어야 마지막 문장을 잡으므로 여기서 붙이고, 남은 조각은 그대로 마지막 항목
export function sentencesOf(text: string): string[] {
  const t = text.trim()
  if (!t) return []
  const [done, consumed] = completeSentences(t + " ")
  const rest = t.slice(consumed).trim()
  return rest ? [...done, rest] : done
}

// 2부 불릿의 슬롯 라벨(수치·근거·한계·다음 행동). 프롬프트가 "- 수치: …" 꼴로 내게 한다
export const DETAIL_SLOTS = ["수치", "근거", "한계", "다음 행동"] as const
export interface DetailLine {
  slot: (typeof DETAIL_SLOTS)[number] | null
  text: string
}
export function detailLines(detail: string): DetailLine[] {
  return detail
    .split("\n")
    .map((l) => l.replace(/^\s*[-•·]\s*/, "").trim())
    .filter(Boolean)
    .map((l) => {
      const m = /^(수치|근거|한계|다음 행동)\s*[:：]\s*(.+)$/.exec(l)
      return m ? { slot: m[1] as DetailLine["slot"], text: m[2].trim() } : { slot: null, text: l }
    })
}

// TTS 엔진이 읽기 어려운 기호를 말로 바꾼다. 준비된 답(시드)은 괄호 풀이·β·p값이 있어 여기서 걷어낸다.
export function ttsClean(text: string): string {
  return text
    .replace(/\[부연\]/g, "")
    .replace(/\([^)]*\)/g, "") // 괄호 풀이는 화면용. 읽으면 흐름이 끊긴다
    .replace(/p\s*<\s*0\.001/gi, "연관이 뚜렷함")
    .replace(/p\s*=\s*([\d.]+)/gi, "피값 $1")
    .replace(/β/g, "베타 ")
    .replace(/R²/g, "설명력")
    .replace(/±/g, "플러스마이너스 ")
    .replace(/(\d)~(\d)/g, "$1에서 $2")
    .replace(/%/g, "퍼센트")
    .replace(/·/g, ", ")
    .replace(/^\s*[-•]\s*/gm, "")
    .replace(/[*#`_>]/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{2,}/g, "\n")
    .trim()
}
