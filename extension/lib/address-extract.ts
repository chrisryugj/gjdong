/**
 * 복사·선택한 텍스트에서 "주소 부분만" 뽑아내는 공용 추출기.
 *
 * 배경: 예전 구현은 줄 단위로만 걸러서, 엑셀·웹 표의 한 행을 복사하면
 * (예: `홍길동<TAB>010-1234-5678<TAB>서울시 광진구 자양로 117<TAB>1970-01-01`)
 * 그 줄이 통째로 통과해 이름·연락처까지 변환 서버와 Kakao API 로 전송됐다.
 * 개인정보 처리방침은 "주소 문자열만 전송한다"고 고지하므로 구현을 거기 맞춘다.
 *
 * 방침:
 *  1. 셀 단위(줄바꿈·탭·2칸 이상 공백)로 쪼갠 뒤 주소로 보이는 셀만 쓴다.
 *  2. 그 셀 안에서도 주소 앞에 붙은 비행정구역 토큰(이름 등)은 떨어낸다.
 *  3. 남은 문자열에 식별정보 패턴이 있으면 지운다.
 *  4. 어느 셀도 주소로 보이지 않으면 null — 아무것도 내보내지 않는다.
 *     (예전의 "매칭 실패 시 원문 전체" 폴백은 제거했다)
 */

// 한국 주소 패턴
export const ADDRESS_PATTERN =
  /[가-힣]+(?:로|길)\s*\d+|[가-힣]+(?:동|리)\s+\d+|[가-힣]+(?:구|시|군)\s+[가-힣]+(?:로|길|동)|[가-힣]+번지/

// 주소 앞에 붙어도 되는 행정구역 표기 — 이 토큰만 되살린다.
const ADMIN_TOKEN =
  /^(?:[가-힣]+(?:특별시|광역시|특별자치시|특별자치도)|[가-힣]{2,3}도|[가-힣]{2,}(?:시|군|구))$/

// 주소와 같은 셀에 섞여 들어올 수 있는 식별정보 — 전송 전 제거.
const PII_PATTERNS: RegExp[] = [
  /\b\d{6}[- ]?[1-8]\d{6}\b/g, // 주민등록번호 · 외국인등록번호
  /\b01[016-9][- ]?\d{3,4}[- ]?\d{4}\b/g, // 휴대전화
  /\b0\d{1,2}[- ]\d{3,4}[- ]\d{4}\b/g, // 일반전화
  /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, // 이메일
]

/** 네이버 지도 등에서 함께 복사되는 UI 잔여물 제거. */
function stripUiNoise(raw: string): string {
  return raw.replace(/복사\s*$/gm, "").replace(/^(?:지번|도로명|우편번호)\s*/gm, "")
}

/**
 * 주소로 판단되는 구간만 반환한다. 없으면 null.
 */
export function extractAddress(raw: string): string | null {
  if (!raw) return null

  const cells = stripUiNoise(raw)
    .split(/[\n\t]|\s{2,}/)
    .map((c) => c.trim())
    .filter(Boolean)

  for (const cell of cells) {
    const m = ADDRESS_PATTERN.exec(cell)
    if (!m || m.index === undefined) continue

    // 매치 지점 앞쪽은 행정구역 표기까지만 되살린다.
    const head = cell.slice(0, m.index).trim().split(/\s+/).filter(Boolean)
    let from = head.length
    while (from > 0 && ADMIN_TOKEN.test(head[from - 1])) from -= 1

    const candidate = [...head.slice(from), cell.slice(m.index).trim()].join(" ")
    const cleaned = PII_PATTERNS.reduce((s, re) => s.replace(re, " "), candidate)
      .replace(/\s{2,}/g, " ")
      .trim()

    if (cleaned.length >= 4 && ADDRESS_PATTERN.test(cleaned)) return cleaned
  }

  return null
}
