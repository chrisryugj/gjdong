"use client"

import type { ResolvedDisplay } from "@/lib/types"
import type { OutputField } from "@/lib/constants"
import { OUTPUT_FIELD_LABELS } from "@/lib/constants"

const CopyIcon = () => (
  <svg className="h-5 w-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <rect width="14" height="14" x="8" y="8" rx="2" ry="2" strokeWidth="2" />
    <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" strokeWidth="2" />
  </svg>
)

const CheckIcon = () => (
  <svg className="h-5 w-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <polyline points="20 6 9 17 4 12" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

type BatchResult = ResolvedDisplay & {
  originalInput: string
  facilityName?: string
}

// 필드별 표시값 생성
export function getFieldDisplayValue(
  result: ResolvedDisplay & { facilityName?: string },
  field: OutputField,
): string {
  if (result.fallback) return ""
  const m = result.meta
  const fullBuildingNo = m.unit ? `${m.buildingNo} ${m.unit}` : m.buildingNo

  switch (field) {
    case "standard1":
      return `${m.sido} ${result.display}`
    case "standard2":
      return result.display
    case "road":
      return m.roadName ? `${m.gu} ${m.roadName} ${fullBuildingNo}` : ""
    case "jibun":
      return m.legalDong ? `${m.gu} ${m.legalDong} ${m.jibunNo}` : ""
    case "adminDong":
      return m.adminDong || ""
    case "postalCode":
      return m.postalCode || ""
    case "unit":
      return m.unit || ""
    default:
      return ""
  }
}

const BUTTON_CLASS =
  "inline-flex items-center justify-between w-full rounded-lg border border-gray-200 bg-white hover:bg-gray-50 h-auto px-4 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"

// 단일 결과 필드 버튼
export function ResultFieldButton({
  label,
  value,
  copiedKey,
  currentCopiedKey,
  onCopy,
}: {
  label: string
  value: string
  copiedKey: string
  currentCopiedKey: string | null
  onCopy: (text: string, key: string) => void
}) {
  return (
    <button className={BUTTON_CLASS} onClick={() => onCopy(value, copiedKey)}>
      <div className="flex-1 min-w-0">
        <div className="text-[11px] font-medium text-gray-400 mb-0.5">{label}</div>
        <div className="text-sm text-gray-900 text-pretty">{value}</div>
      </div>
      <div className="flex-shrink-0 ml-3 text-gray-300">
        {currentCopiedKey === copiedKey ? <CheckIcon /> : <CopyIcon />}
      </div>
    </button>
  )
}

// 시설명 태그
function FacilityTag({ name }: { name: string }) {
  return (
    <span className="inline-flex items-center rounded-md bg-blue-100 px-2 py-0.5 text-xs font-bold text-blue-800 mr-2 border border-blue-300">
      {name}
    </span>
  )
}

// 배치 결과 행 렌더링
function BatchResultRow({
  result,
  idx,
  field,
}: {
  result: BatchResult
  idx: number
  field: OutputField
}) {
  if (result.fallback) {
    // standard1, standard2에서만 실패 표시
    if (field === "standard1" || field === "standard2") {
      return (
        <div className="mb-1 text-red-600">
          <span className="text-gray-400">{idx + 1}. </span>
          {result.facilityName && <FacilityTag name={result.facilityName} />}
          변환 실패: {(result.message || "주소를 찾을 수 없습니다").slice(0, 100)}
        </div>
      )
    }
    // 그 외 필드는 빈 행 또는 null
    if (field === "postalCode" || field === "unit") {
      return (
        <div className="mb-1 text-gray-400">
          <span className="text-gray-400">{idx + 1}. </span>
        </div>
      )
    }
    return null
  }

  const value = getFieldDisplayValue(result, field)
  if (!value && field !== "standard1" && field !== "standard2" && field !== "postalCode" && field !== "unit") return null

  return (
    <div className="mb-1">
      <span className="text-gray-400">{idx + 1}. </span>
      {result.facilityName && <FacilityTag name={result.facilityName} />}
      {value}
    </div>
  )
}

// Combined 모드 배치 필드 블록
export function CombinedBatchField({
  field,
  results,
  copiedKey,
  currentCopiedKey,
  onCopy,
}: {
  field: OutputField
  results: BatchResult[]
  copiedKey: string
  currentCopiedKey: string | null
  onCopy: (text: string, key: string) => void
}) {
  const label = `전체 결과 (${OUTPUT_FIELD_LABELS[field]})`

  const getCopyText = () => {
    // postalCode/unit: 모든 행 포함 (행 번호 정렬 유지)
    if (field === "postalCode" || field === "unit") {
      return results
        .map((r) => {
          if (r.fallback) return ""
          const value = getFieldDisplayValue(r, field)
          return r.facilityName ? `[${r.facilityName}] ${value}` : value
        })
        .join("\n")
    }
    // 그 외: 유효한 결과만
    return results
      .filter((r) => {
        if (r.fallback) return false
        if (field === "road") return !!r.meta.roadName
        if (field === "jibun") return !!r.meta.legalDong
        if (field === "adminDong") return !!r.meta.adminDong
        return true
      })
      .map((r) => {
        const value = getFieldDisplayValue(r, field)
        return r.facilityName ? `[${r.facilityName}] ${value}` : value
      })
      .join("\n")
  }

  return (
    <button className={BUTTON_CLASS} onClick={() => onCopy(getCopyText(), copiedKey)}>
      <div className="flex-1 min-w-0">
        <div className="text-[11px] font-medium text-gray-400 mb-1">{label}</div>
        <div className="text-sm font-mono text-gray-900 whitespace-pre-wrap">
          {results.map((result, idx) => (
            <BatchResultRow key={idx} result={result} idx={idx} field={field} />
          ))}
        </div>
      </div>
      <div className="flex-shrink-0 ml-3 text-gray-300 self-start mt-1">
        {currentCopiedKey === copiedKey ? <CheckIcon /> : <CopyIcon />}
      </div>
    </button>
  )
}

// Individual 모드 단일 결과의 필드 버튼
export function IndividualResultFields({
  result,
  idx,
  selectedFields,
  copiedKey,
  onCopy,
}: {
  result: BatchResult
  idx: number
  selectedFields: Set<OutputField>
  copiedKey: string | null
  onCopy: (text: string, key: string) => void
}) {
  if (result.fallback) {
    return (
      <div className="text-sm text-red-600 bg-red-50 p-3 rounded border border-red-200">
        {(result.message || "주소를 찾을 수 없습니다").slice(0, 100)}
      </div>
    )
  }

  const fields: OutputField[] = ["standard1", "standard2", "road", "jibun", "adminDong", "postalCode", "unit"]

  return (
    <>
      {fields
        .filter((field) => {
          if (!selectedFields.has(field)) return false
          if (field === "road" && !result.meta.roadName) return false
          if (field === "jibun" && !result.meta.legalDong) return false
          if (field === "adminDong" && !result.meta.adminDong) return false
          if (field === "postalCode" && !result.meta.postalCode) return false
          if (field === "unit" && !result.meta.unit) return false
          return true
        })
        .map((field) => (
          <ResultFieldButton
            key={field}
            label={OUTPUT_FIELD_LABELS[field]}
            value={getFieldDisplayValue(result, field)}
            copiedKey={`individual-${idx}-${field}`}
            currentCopiedKey={copiedKey}
            onCopy={onCopy}
          />
        ))}
    </>
  )
}
