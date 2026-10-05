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

// 장소명 끝의 일반명사 — 로마자로 두면 "Daetiteoneol(Goejeongdongipchul-gu)"처럼 읽을 수 없어(입출"구"를
// 행정구로 오인) 영어로 옮긴다. 긴 것부터 맞춘다(교차로 > 로, 입출구 > 출구 > 구). (2026-10-05 부산 CCTV 실측)
const PLACE_TERMS: Array<[string, string]> = [
  ["해수욕장", "Beach"],
  ["방송총국", "Broadcasting Center"],
  ["교차로", "Intersection"],
  ["사거리", "Intersection"],
  ["삼거리", "Junction"],
  ["입출구", "Entrance"],
  ["전망대", "Observatory"],
  ["방파제", "Breakwater"],
  ["우체국", "Post Office"],
  ["백화점", "Department Store"],
  ["주차장", "Parking Lot"],
  ["터미널", "Terminal"],
  ["터널", "Tunnel"],
  ["대교", "Bridge"],
  ["해변", "Beach"],
  ["입구", "Entrance"],
  ["출구", "Exit"],
  ["등대", "Lighthouse"],
  ["병원", "Hospital"],
  ["구청", "-gu Office"],
  ["시청", "City Hall"],
  ["공원", "Park"],
  ["시장", "Market"],
  ["남단", "South End"],
  ["북단", "North End"],
  ["옥상", "Rooftop"],
]
// 단독 낱말일 때만 옮기는 것 — 다른 낱말 끝에 붙으면 고유명 일부일 수 있다 ("해운대암소갈비 앞" → "… front")
const PLACE_WORDS: Record<string, string> = { 앞: "front" }

/** 장소명(CCTV 카메라명 등 자유 텍스트) 로마자 — 끝의 일반명사는 영어, 고유명은 로마자, 괄호 안도 같은 규칙.
 *  "대티터널(괴정동입출구)" → "Daeti Tunnel (Goejeong-dong Entrance)" */
export function romanizePlace(text: string): string {
  const out = text.replace(/[가-힣]+/g, (run: string, offset: number) => {
    if (PLACE_WORDS[run]) return ` ${PLACE_WORDS[run]}`
    const terms: string[] = []
    let rest = run
    for (;;) {
      // "역"은 한 글자라 오탐이 많다 — 고유명이 두 글자 이상 남고 구역·지역·영역·권역이 아닐 때만 (강남역 → Gangnam Station)
      const hit =
        PLACE_TERMS.find(([ko]) => rest.endsWith(ko)) ??
        (rest.length >= 3 && rest.endsWith("역") && !/[구지영권]역$/.test(rest)
          ? (["역", "Station"] as [string, string])
          : undefined)
      if (!hit) break
      terms.unshift(hit[1])
      rest = rest.slice(0, rest.length - hit[0].length)
    }
    const afterDigit = /[0-9]/.test(text[offset - 1] ?? "")
    const head = !rest
      ? ""
      : afterDigit && (SUFFIXES.includes(rest) || rest === "가")
        ? `-${romanizeRun(rest)}`
        : romanizeWord(rest)
    // 바로 뒤에 라틴 문자가 붙으면 띄운다 ("교보타워R" → "Gyobotawo R")
    const gap = /[A-Za-z]/.test(text[offset + run.length] ?? "") ? " " : ""
    return head + terms.map((w) => (w.startsWith("-") && head ? w : ` ${w.replace(/^-/, "")}`)).join("") + gap
  })
  // 일반명사 앞 공백·괄호 앞뒤 공백 정리
  return out.replace(/\s+/g, " ").replace(/([^\s(])\(/g, "$1 (").replace(/\(\s+/g, "(").trim()
}

/** 주소 문자열의 한글 부분만 로마자로 (숫자·괄호·라틴은 그대로).
 * "자양2동"처럼 숫자 뒤에 접미사만 남은 구간은 하이픈으로 붙인다. */
export function romanizeAddress(text: string): string {
  return text.replace(/([0-9]?)([가-힣]+)/g, (_, digit: string, run: string) => {
    if (digit && (SUFFIXES.includes(run) || run === "가")) return `${digit}-${romanizeRun(run)}`
    return digit + romanizeWord(run)
  })
}
