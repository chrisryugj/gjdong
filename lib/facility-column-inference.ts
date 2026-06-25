import type { ParsedRow } from "@/lib/facility-storage"

type FilterColumn = {
  index: number
  label: string
}

export type FacilityColumnMapping = {
  hasHeader: boolean
  headers: string[]
  serialIndex: number
  addressIndex: number
  nameIndex: number
  categoryIndex: number
  filterColumns: FilterColumn[]
}

export type ParsedFacilityTable = {
  rows: ParsedRow[]
  mapping: FacilityColumnMapping
}

function cleanCell(value: unknown): string {
  return String(value ?? "").trim()
}

function normalizeHeader(value: string): string {
  return value.toLowerCase().replace(/[\s_()[\]{}·.,:：/-]/g, "")
}

function isSerialHeader(header: string): boolean {
  const h = normalizeHeader(header)
  if (!h || h.includes("우편")) return false
  return /^(?:#|no|num|number|index|idx|연번|순번|번호|순서|일련번호)$/.test(h)
}

function isAddressHeader(header: string): boolean {
  const h = normalizeHeader(header)
  return (
    h.includes("주소") ||
    h.includes("소재지") ||
    h.includes("위치") ||
    h === "도로명" ||
    h === "지번" ||
    h === "도로명주소" ||
    h === "지번주소" ||
    h === "address"
  )
}

function isCategoryHeader(header: string): boolean {
  const h = normalizeHeader(header)
  return (
    h.includes("분류") ||
    h.includes("구분") ||
    h.includes("유형") ||
    h.includes("종류") ||
    h.includes("업종") ||
    h.includes("업태") ||
    h.includes("category") ||
    h === "type"
  )
}

function isAdminDongHeader(header: string): boolean {
  const h = normalizeHeader(header)
  return h.includes("행정동") || h.includes("관할동") || h === "읍면동" || h === "동명"
}

function isNameHeader(header: string): boolean {
  const h = normalizeHeader(header)
  if (!h) return false
  if (isCategoryHeader(header) || isAdminDongHeader(header) || isAddressHeader(header)) return false
  if (["시설명", "기관명", "명칭", "상호", "업체명", "업소명", "장소명", "name"].includes(h)) return true
  return (
    h.endsWith("명") &&
    !/대표자|시설장|담당자|관리자|작성자|보호자|성명|이름|도로|증명|설명|품명|과목|행정동/.test(h)
  )
}

function isNoiseHeader(header: string): boolean {
  const h = normalizeHeader(header)
  return (
    isSerialHeader(header) ||
    h.includes("전화") ||
    h.includes("연락처") ||
    h.includes("대표자") ||
    h.includes("시설장") ||
    h.includes("담당자") ||
    h.includes("관리자") ||
    h.includes("성명") ||
    h.includes("우편번호") ||
    h.includes("비고") ||
    h.includes("메모")
  )
}

function isAddressLike(value: string): boolean {
  return (
    /[가-힣]+(?:로|길)\s*\d+/.test(value) ||
    /[가-힣]+(?:동|읍|면|리)\s*\d/.test(value) ||
    /[가-힣]+(?:시|군|구)\s+[가-힣0-9\s-]+(?:로|길|동|읍|면|리)\b/.test(value)
  )
}

function isMostlyNumber(value: string): boolean {
  return /^[#\d\s.,-]+$/.test(value)
}

function isPhoneLike(value: string): boolean {
  return /(?:\d{2,4}[-\s]){1,2}\d{3,4}/.test(value)
}

function valuesForColumn(rows: string[][], index: number): string[] {
  return rows.map((row) => row[index] ?? "").filter(Boolean)
}

function scoreAddressColumn(rows: string[][], index: number): number {
  return valuesForColumn(rows, index).filter(isAddressLike).length
}

function scoreSerialColumn(rows: string[][], index: number): number {
  const values = valuesForColumn(rows, index)
  if (values.length === 0) return 0
  return values.filter(isMostlyNumber).length / values.length
}

function isLikelyCategorical(rows: string[][], index: number): boolean {
  const values = valuesForColumn(rows, index)
  if (values.length === 0) return false
  if (values.some((value) => isAddressLike(value) || isPhoneLike(value))) return false

  // 분류 값은 짧고 반복적이다 — 긴 자유 텍스트(메모·비고)나 거의 고유한 값(이름 등)은 분류로 보지 않는다.
  const shortValues = values.filter((value) => value.length <= 10 && !isMostlyNumber(value))
  if (shortValues.length === 0 || shortValues.length < values.length * 0.8) return false

  const distinct = new Set(shortValues).size
  if (shortValues.length <= 3) return true // 표본이 작으면 짧은 값들을 분류 후보로 허용
  return distinct <= Math.ceil(shortValues.length * 0.7) // 충분한 표본은 반복(낮은 cardinality)을 요구
}

function hasHeaderKeywords(row: string[]): boolean {
  return row.some(
    (cell) =>
      isSerialHeader(cell) ||
      isAddressHeader(cell) ||
      isNameHeader(cell) ||
      isCategoryHeader(cell) ||
      isAdminDongHeader(cell),
  )
}

function firstIndex(headers: string[], predicate: (header: string) => boolean): number {
  return headers.findIndex((header) => predicate(header))
}

function makeFallbackHeaders(width: number): string[] {
  return Array.from({ length: width }, (_, i) => `${i + 1}열`)
}

function getWidth(rows: string[][]): number {
  return Math.max(0, ...rows.map((row) => row.length))
}

function findBestAddressIndex(headers: string[], rows: string[][]): number {
  const byHeader = firstIndex(headers, isAddressHeader)
  if (byHeader >= 0) return byHeader

  const width = getWidth(rows)
  let bestIndex = -1
  let bestScore = 0
  for (let i = 0; i < width; i += 1) {
    const score = scoreAddressColumn(rows, i)
    if (score > bestScore) {
      bestIndex = i
      bestScore = score
    }
  }
  return bestIndex >= 0 ? bestIndex : 0
}

function uniqueFilterColumns(columns: FilterColumn[]): FilterColumn[] {
  const seenIndexes = new Set<number>()
  const seenLabels = new Set<string>()
  const out: FilterColumn[] = []
  for (const column of columns) {
    const label = column.label.trim()
    if (!label || seenIndexes.has(column.index) || seenLabels.has(label)) continue
    seenIndexes.add(column.index)
    seenLabels.add(label)
    out.push({ index: column.index, label })
  }
  return out
}

export function parseFacilityTable(inputRows: unknown[][]): ParsedFacilityTable {
  const normalizedRows = inputRows
    .map((row) => row.map(cleanCell))
    .filter((row) => row.some((cell) => cell.length > 0))

  const width = getWidth(normalizedRows)
  const emptyMapping: FacilityColumnMapping = {
    hasHeader: false,
    headers: [],
    serialIndex: -1,
    addressIndex: 0,
    nameIndex: -1,
    categoryIndex: -1,
    filterColumns: [],
  }
  if (normalizedRows.length === 0 || width === 0) return { rows: [], mapping: emptyMapping }

  const firstRow = normalizedRows[0]
  const hasHeader = hasHeaderKeywords(firstRow)
  const headers = hasHeader ? firstRow : makeFallbackHeaders(width)
  const dataRows = hasHeader ? normalizedRows.slice(1) : normalizedRows

  const addressIndex = findBestAddressIndex(headers, dataRows)
  const explicitSerialIndex = firstIndex(headers, isSerialHeader)
  let serialIndex = explicitSerialIndex
  const serialIndexes = new Set<number>()
  headers.forEach((header, index) => {
    if (isSerialHeader(header) || (!hasHeader && scoreSerialColumn(dataRows, index) >= 0.9)) {
      serialIndexes.add(index)
      if (serialIndex === -1) serialIndex = index
    }
  })

  const explicitCategoryIndex = firstIndex(headers, isCategoryHeader)
  const adminDongIndex = firstIndex(headers, isAdminDongHeader)

  let nameIndex = firstIndex(headers, isNameHeader)
  if (nameIndex === addressIndex) nameIndex = -1
  if (nameIndex === -1) {
    // 시설명 키워드를 못 찾으면 남은 열에서 채우되, 이미 분류·행정동으로 식별된 열은
    // 시설명으로 오인하지 않는다(시설명 열이 아예 없는 표에서 행정동이 라벨로 새는 것 방지).
    nameIndex = headers.findIndex(
      (_, index) =>
        index !== addressIndex &&
        index !== explicitCategoryIndex &&
        index !== adminDongIndex &&
        !serialIndexes.has(index),
    )
  }

  let categoryIndex = explicitCategoryIndex
  if (categoryIndex === -1 && adminDongIndex >= 0) categoryIndex = adminDongIndex

  const reserved = new Set([addressIndex, nameIndex, ...serialIndexes].filter((index) => index >= 0))
  const filterColumns: FilterColumn[] = []

  if (explicitCategoryIndex >= 0 && !reserved.has(explicitCategoryIndex)) {
    filterColumns.push({ index: explicitCategoryIndex, label: headers[explicitCategoryIndex] || "분류" })
  }
  if (adminDongIndex >= 0 && !reserved.has(adminDongIndex)) {
    filterColumns.push({ index: adminDongIndex, label: headers[adminDongIndex] || "행정동" })
  }

  if (categoryIndex === -1) {
    const genericFilter = headers.findIndex(
      (header, index) =>
        !reserved.has(index) &&
        !isNoiseHeader(header) &&
        index !== explicitCategoryIndex &&
        index !== adminDongIndex &&
        isLikelyCategorical(dataRows, index),
    )
    if (genericFilter >= 0) {
      categoryIndex = genericFilter
      filterColumns.push({ index: genericFilter, label: hasHeader ? headers[genericFilter] : "분류" })
    }
  }

  if (categoryIndex >= 0 && !reserved.has(categoryIndex) && filterColumns.every((column) => column.index !== categoryIndex)) {
    filterColumns.push({ index: categoryIndex, label: hasHeader ? headers[categoryIndex] : "분류" })
  }

  if (hasHeader) {
    headers.forEach((header, index) => {
      if (reserved.has(index) || isNoiseHeader(header) || filterColumns.some((column) => column.index === index)) return
      if (isCategoryHeader(header) || isAdminDongHeader(header) || isLikelyCategorical(dataRows, index)) {
        filterColumns.push({ index, label: header })
      }
    })
  }

  const uniqueFilters = uniqueFilterColumns(filterColumns)
  const rows = dataRows
    .map((row) => {
      const filters: Record<string, string> = {}
      for (const column of uniqueFilters) {
        const value = row[column.index]?.trim()
        if (value) filters[column.label] = value
      }

      return {
        address: row[addressIndex]?.trim() ?? "",
        name: nameIndex >= 0 ? (row[nameIndex]?.trim() ?? "") : "",
        category: categoryIndex >= 0 ? (row[categoryIndex]?.trim() ?? "") : "",
        serialNo: serialIndex >= 0 ? (row[serialIndex]?.trim() || undefined) : undefined,
        filters: Object.keys(filters).length > 0 ? filters : undefined,
      }
    })
    .filter((row) => row.address)

  return {
    rows,
    mapping: {
      hasHeader,
      headers,
      serialIndex,
      addressIndex,
      nameIndex,
      categoryIndex,
      filterColumns: uniqueFilters,
    },
  }
}

export function parseFacilityText(text: string): ParsedFacilityTable {
  const rows = text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => (line.includes("\t") ? line.split("\t") : line.split(/\s{2,}/)))

  return parseFacilityTable(rows)
}
