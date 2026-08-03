// 한국어 주소 로마자 변환 (국어의 로마자 표기법 기준) — 비한국어 모드의 주소 핀 라벨 표시용
// 카카오 주소 API가 한국어만 주므로 표시 시점에 변환한다. 완전한 표기법 구현이 아니라
// 주소에 필요한 수준(연음·비음화·유음화 + 행정 접미사 하이픈)만 다룬다.

const CHO = ["g", "kk", "n", "d", "tt", "r", "m", "b", "pp", "s", "ss", "", "j", "jj", "ch", "k", "t", "p", "h"]
const JUNG = ["a", "ae", "ya", "yae", "eo", "e", "yeo", "ye", "o", "wa", "wae", "oe", "yo", "u", "wo", "we", "wi", "yu", "eu", "ui", "i"]
// 종성 대표음 (ㄱㄲㄳㄴㄵㄶㄷㄹㄺㄻㄼㄽㄾㄿㅀㅁㅂㅄㅅㅆㅇㅈㅊㅋㅌㅍㅎ)
const JONG = ["", "k", "k", "k", "n", "n", "n", "t", "l", "k", "m", "p", "l", "l", "p", "l", "m", "p", "p", "t", "t", "ng", "t", "t", "k", "t", "p", "t"]
// 연음 시 다음 음절 초성으로 넘어가는 소리
const JONG_LIAISON = ["", "g", "kk", "ks", "n", "nj", "nh", "d", "r", "lg", "lm", "lb", "ls", "lt", "lp", "lh", "m", "b", "bs", "s", "ss", "ng", "j", "ch", "k", "t", "p", "h"]

// 도로명·행정구역 접미사 — 표기법상 하이픈으로 분리하고 경계의 음운변동은 적용하지 않는다 (아차산로 → Achasan-ro)
// "리"는 왕십리·청량리 같은 지명 오탐이 많아 제외 (서울 대상 앱이라 촌락 里 주소가 없음)
const SUFFIXES = ["대로", "군", "구", "동", "읍", "면", "로", "길"]

// 광역단체명은 관용 표기 고정
const CITY_NAMES: Record<string, string> = {
  서울특별시: "Seoul",
  서울시: "Seoul",
  서울: "Seoul",
  인천광역시: "Incheon",
  경기도: "Gyeonggi-do",
}

interface Syl {
  cho: number
  jung: number
  jong: number
}

function decompose(ch: string): Syl | null {
  const code = ch.charCodeAt(0) - 0xac00
  if (code < 0 || code > 11171) return null
  return { cho: Math.floor(code / 588), jung: Math.floor((code % 588) / 28), jong: code % 28 }
}

/** 한글 연속 구간 하나를 로마자로 (음운변동 포함) */
function romanizeRun(run: string): string {
  const syls = Array.from(run).map(decompose) as Syl[]
  let out = ""
  for (let i = 0; i < syls.length; i++) {
    const cur = syls[i]
    const next = syls[i + 1]
    let onset = CHO[cur.cho]
    let coda = JONG[cur.jong]

    // 앞 음절 종성과의 변동은 앞 음절 처리에서 반영되므로 여기선 종성→다음 초성만 본다
    if (next) {
      if (cur.jong > 0 && next.cho === 11) {
        // 연음: 종성이 다음 빈 초성으로 (ㅇ 종성은 ng 유지)
        if (cur.jong !== 21) {
          syls[i + 1] = { ...next, cho: -1 } // 표식: 초성은 연음으로 대체
          out += onset + JUNG[cur.jung]
          out += JONG_LIAISON[cur.jong] === "ng" ? "" : ""
          // 연음 소리를 다음 음절 시작에 붙인다
          ;(next as Syl & { liaison?: string }).liaison = JONG_LIAISON[cur.jong]
          continue
        }
      } else if (cur.jong > 0) {
        const nextIsNasal = next.cho === 2 || next.cho === 6 // ㄴ·ㅁ
        const nextIsRieul = next.cho === 5 // ㄹ
        if (nextIsNasal) {
          // 비음화: 국물→gungmul, 갑문→gammun
          if (coda === "k") coda = "ng"
          else if (coda === "t") coda = "n"
          else if (coda === "p") coda = "m"
        } else if (nextIsRieul) {
          // 유음화·비음화: 선릉→Seolleung, 종로→Jongno, 독립→dongnip
          if (coda === "n" || coda === "l") {
            coda = "l"
            ;(next as Syl & { override?: string }).override = "l"
          } else if (coda === "k") {
            coda = "ng"
            ;(next as Syl & { override?: string }).override = "n"
          } else if (coda === "p") {
            coda = "m"
            ;(next as Syl & { override?: string }).override = "n"
          } else if (coda === "ng" || coda === "m") {
            ;(next as Syl & { override?: string }).override = "n"
          }
        }
      }
    }

    const marked = cur as Syl & { liaison?: string; override?: string }
    if (marked.liaison !== undefined) onset = marked.liaison
    else if (marked.override !== undefined) onset = marked.override
    else if (cur.cho === -1) onset = ""

    out += onset + JUNG[cur.jung] + coda
  }
  return out
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

/** 한글 구간을 접미사 분리 후 로마자화 — "광진구" → "Gwangjin-gu" */
function romanizeWord(run: string): string {
  if (CITY_NAMES[run]) return CITY_NAMES[run]
  for (const suf of SUFFIXES) {
    if (run.length > suf.length && run.endsWith(suf)) {
      return capitalize(romanizeRun(run.slice(0, run.length - suf.length))) + "-" + romanizeRun(suf)
    }
  }
  return capitalize(romanizeRun(run))
}

/** 주소 문자열의 한글 부분만 로마자로 (숫자·괄호·라틴은 그대로).
 * "자양2동"처럼 숫자 뒤에 접미사만 남은 구간은 하이픈으로 붙인다. */
export function romanizeAddress(text: string): string {
  return text.replace(/([0-9]?)([가-힣]+)/g, (_, digit: string, run: string) => {
    if (digit && (SUFFIXES.includes(run) || run === "가")) return `${digit}-${romanizeRun(run)}`
    return digit + romanizeWord(run)
  })
}
