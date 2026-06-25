const MAP_LABEL_PATTERN = /^(?:도로명(?:주소)?|지번(?:주소)?|우편번호|주소)\s*[:：]?\s*/
const TRAILING_COPY_PATTERN = /\s*복사\s*$/
const POSTAL_CODE_PATTERN = /^\d{5}$/

const ADDRESS_PATTERN =
  /[가-힣]+(?:로|길)\s*\d+|[가-힣]+(?:동|리)\s+\d+|[가-힣]+(?:구|시|군)\s+[가-힣0-9\s-]+(?:로|길|동|리)\b|[가-힣]+번지/

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim()
}

function cleanAddressLine(line: string): string {
  return normalizeWhitespace(line.replace(TRAILING_COPY_PATTERN, "").replace(MAP_LABEL_PATTERN, ""))
}

function isNoiseLine(line: string): boolean {
  return (
    line === "복사" ||
    POSTAL_CODE_PATTERN.test(line) ||
    /^(?:도로명(?:주소)?|지번(?:주소)?|우편번호|주소)$/.test(line)
  )
}

function isLikelyAddressLine(line: string): boolean {
  return ADDRESS_PATTERN.test(line)
}

export function normalizeAddressInput(raw: string): string {
  const normalized = raw
    .replace(/\u00a0/g, " ")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/\r\n?/g, "\n")
    .trim()

  if (!normalized) return ""

  const candidates = normalized
    .split("\n")
    .map(cleanAddressLine)
    .filter((line) => line.length > 0 && !isNoiseLine(line))

  return normalizeWhitespace(candidates.find(isLikelyAddressLine) ?? candidates[0] ?? cleanAddressLine(normalized))
}

export function isLikelyCopiedMapSnippet(raw: string): boolean {
  const lines = raw
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)

  if (lines.length <= 1 || lines.length > 4) return false

  const labelLineCount = lines.filter((line) =>
    /^(?:도로명(?:주소)?|지번(?:주소)?|우편번호)\b/.test(line),
  ).length
  const hasCopyLine = lines.some((line) => TRAILING_COPY_PATTERN.test(line))

  return hasCopyLine || labelLineCount >= 2
}
