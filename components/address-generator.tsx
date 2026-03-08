"use client"

import { useState, useRef, useEffect, useMemo } from "react"
import MapView from "@/components/map/map-view"
import { resolveAddressDisplay } from "@/lib/utils/address-resolver"
import type { ResolvedDisplay } from "@/lib/types"
import type { OutputField } from "@/lib/constants"
import { OUTPUT_FIELDS, OUTPUT_FIELD_LABELS } from "@/lib/constants"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import UsageGuideModal, { UsageGuideButton } from "@/components/usage-guide-modal"
import {
  ResultFieldButton,
  CombinedBatchField,
  IndividualResultFields,
  getFieldDisplayValue,
} from "@/components/batch-result-field"

const SearchIcon = () => (
  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <circle cx="11" cy="11" r="8" strokeWidth="2" />
    <path d="m21 21-4.35-4.35" strokeWidth="2" strokeLinecap="round" />
  </svg>
)

const MapPinIcon = () => (
  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" strokeWidth="2" />
    <circle cx="12" cy="10" r="3" strokeWidth="2" />
  </svg>
)

const DownloadIcon = () => (
  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    <polyline points="7 10 12 15 17 10" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    <line x1="12" y1="15" x2="12" y2="3" strokeWidth="2" strokeLinecap="round" />
  </svg>
)

const ClockIcon = () => (
  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <circle cx="12" cy="12" r="10" strokeWidth="2" />
    <polyline points="12 6 12 12 16 14" strokeWidth="2" strokeLinecap="round" />
  </svg>
)

const EditIcon = () => (
  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path
      d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
)

const InfoIcon = () => (
  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <circle cx="12" cy="12" r="10" strokeWidth="2" />
    <path d="M12 16v-4" strokeWidth="2" strokeLinecap="round" />
    <path d="M12 8h.01" strokeWidth="2" strokeLinecap="round" />
  </svg>
)

type BatchResult = ResolvedDisplay & {
  originalInput: string
  facilityName?: string
}
type DisplayMode = "combined" | "individual"

type ProgressState = {
  current: number
  total: number
  startTime: number
  estimatedTimeRemaining: number
}

const FIELD_EXAMPLES: Record<OutputField, string> = {
  standard1: "서울특별시 광진구 아차산로400(자양동 870, 자양2동)",
  standard2: "광진구 아차산로400(자양동 870, 자양2동)",
  road: "광진구 아차산로400",
  jibun: "광진구 자양동 870",
  adminDong: "자양2동",
  postalCode: "05050",
  unit: "102동 304호",
}

const EXCEL_LABELS: Record<OutputField, string> = {
  standard1: "표준주소1",
  standard2: "표준주소2",
  road: "도로명주소",
  jibun: "지번주소",
  adminDong: "행정동",
  postalCode: "우편번호",
  unit: "세부주소",
}

const INPUT_GUIDE_ITEMS = [
  "도로명주소, 지번주소, 건물명 검색어 입력",
  "여러 주소 검색은 줄바꿔서 입력 (대량 데이터 복사+붙여넣기 지원)",
  "엑셀 n행×2열 데이터 복사+붙여넣기 입력지원 [주소+시설명(태그)]",
  "타이핑 n행×2열 데이터 입력지원 (주소 뒤 빈칸 3칸 + 시설명 입력)",
]

function InputGuideContent({ dark = false }: { dark?: boolean }) {
  const numColor = dark ? "text-blue-400" : "text-blue-600"
  return (
    <div className="space-y-2">
      <p className="font-semibold text-sm mb-2">입력 방법 안내</p>
      <div className="space-y-1.5 text-xs">
        {INPUT_GUIDE_ITEMS.map((text, i) => (
          <div key={i} className="flex gap-2">
            <span className={`${numColor} font-bold`}>{i + 1}.</span>
            <span>{text}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function AddressGenerator() {
  const [inputValue, setInputValue] = useState("")
  const [isSearching, setIsSearching] = useState(false)
  const [resolvedAddress, setResolvedAddress] = useState<ResolvedDisplay | null>(null)
  const [batchResults, setBatchResults] = useState<BatchResult[]>([])
  const [copiedKey, setCopiedKey] = useState<string | null>(null)
  const [notification, setNotification] = useState<{ message: string; type: "success" | "error" | "info" } | null>(null)
  const [displayMode, setDisplayMode] = useState<DisplayMode>("combined")
  const [selectedFields, setSelectedFields] = useState<Set<OutputField>>(new Set(OUTPUT_FIELDS))
  const [recentSearches, setRecentSearches] = useState<string[]>([])
  const [showRecentSearches, setShowRecentSearches] = useState(false)
  const [progress, setProgress] = useState<ProgressState | null>(null)
  const [showFormattedInput, setShowFormattedInput] = useState(false)
  const [showUsageGuide, setShowUsageGuide] = useState(false)
  const resultSectionRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const notificationTimerRef = useRef<ReturnType<typeof setTimeout>>()
  const batchAbortRef = useRef<AbortController | null>(null)

  const { lines, parsedInputData } = useMemo(() => {
    const ls = inputValue.split("\n").filter((line) => line.trim().length > 0)
    const parsed = ls.map((line) => {
      const parts = line.split(/\t|\s{3,}/)
      if (parts.length >= 2) {
        return { address: parts[0].trim(), facilityName: parts[1].trim() }
      }
      return { address: line.trim(), facilityName: undefined }
    })
    return { lines: ls, parsedInputData: parsed }
  }, [inputValue])

  const isMultiLine = lines.length > 1
  const hasTwoColumnData = parsedInputData.some((d) => d.facilityName)
  const hasLongFacilityName = parsedInputData.some((d) => d.facilityName && d.facilityName.length >= 10)

  useEffect(() => {
    if (hasLongFacilityName) setShowFormattedInput(true)
  }, [hasLongFacilityName])

  const showNotification = (message: string, type: "success" | "error" | "info" = "success") => {
    if (notificationTimerRef.current) clearTimeout(notificationTimerRef.current)
    setNotification({ message, type })
    notificationTimerRef.current = setTimeout(() => setNotification(null), 3000)
  }

  useEffect(() => {
    const hasVisited = localStorage.getItem("addressGenerator_hasVisited")
    if (!hasVisited) {
      setShowUsageGuide(true)
      localStorage.setItem("addressGenerator_hasVisited", "true")
    }
  }, [])

  useEffect(() => {
    const savedFields = localStorage.getItem("addressGenerator_selectedFields")
    if (savedFields) {
      try {
        setSelectedFields(new Set(JSON.parse(savedFields) as OutputField[]))
      } catch {
        /* ignore corrupted data */
      }
    }
  }, [])

  useEffect(() => {
    localStorage.setItem("addressGenerator_selectedFields", JSON.stringify(Array.from(selectedFields)))
  }, [selectedFields])

  useEffect(() => {
    const savedSearches = localStorage.getItem("addressGenerator_recentSearches")
    if (savedSearches) {
      try {
        setRecentSearches(JSON.parse(savedSearches) as string[])
      } catch {
        /* ignore corrupted data */
      }
    }
  }, [])

  const saveToRecentSearches = (address: string) => {
    const trimmedAddress = address.trim()
    if (!trimmedAddress) return
    setRecentSearches((prev) => {
      const filtered = prev.filter((s) => s !== trimmedAddress)
      const updated = [trimmedAddress, ...filtered].slice(0, 5)
      localStorage.setItem("addressGenerator_recentSearches", JSON.stringify(updated))
      return updated
    })
  }

  useEffect(() => {
    if (textareaRef.current && !showFormattedInput) {
      const lineHeight = 24
      const padding = 16
      const minHeight = 60
      const calculatedHeight = lines.length * lineHeight + padding
      textareaRef.current.style.height = `${Math.max(minHeight, calculatedHeight)}px`
    }
  }, [inputValue, showFormattedInput, lines.length])

  useEffect(() => {
    if ((resolvedAddress || batchResults.length > 0) && resultSectionRef.current) {
      const isMobile = window.innerWidth < 768
      if (isMobile) {
        setTimeout(() => {
          resultSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
        }, 300)
      }
    }
  }, [resolvedAddress, batchResults])

  const handleSearch = async () => {
    if (!inputValue.trim()) return
    const addresses = parsedInputData.map((d) => d.address)

    if (addresses.length > 1000) {
      window.alert(
        `⚠️ 최대 1,000건까지 변환 가능합니다.\n\n현재 ${addresses.length.toLocaleString()}건이 입력되었습니다.\n1,000건을 초과하는 대용량 변환은 관리자에게 문의해주세요.`,
      )
      return
    }

    if (addresses.length >= 200) {
      const message = `${addresses.length}개 주소를 변환합니다.\n예상 소요 시간: 약 ${Math.ceil(addresses.length / 50)}분\n\n계속하시겠습니까?`
      if (!window.confirm(message)) return
    }

    const hasFacilityName = parsedInputData.some((d) => d.facilityName)

    if (addresses.length === 1 && !hasFacilityName) {
      saveToRecentSearches(addresses[0])
      setIsSearching(true)
      setBatchResults([])
      setProgress(null)
      try {
        const result = await resolveAddressDisplay(addresses[0])
        setResolvedAddress(result)
        if (result.fallback) {
          showNotification(result.message || "정확한 주소를 찾을 수 없습니다. 다시 시도해주세요.", "error")
        } else if (result.meta.searchMethod === "KEYWORD" && result.meta.placeName) {
          showNotification(`"${result.meta.placeName}" 위치로 변환되었습니다.`, "info")
        } else {
          const isMobile = window.innerWidth < 768
          if (isMobile) {
            showNotification("주소 변환 완료! 아래에서 복사하세요.", "success")
          }
        }
      } catch {
        showNotification("주소 검색 중 오류가 발생했습니다.", "error")
      } finally {
        setIsSearching(false)
      }
    } else {
      const controller = new AbortController()
      batchAbortRef.current = controller
      saveToRecentSearches(addresses.join("\n"))
      setIsSearching(true)
      setResolvedAddress(null)

      const startTime = Date.now()
      setProgress({ current: 0, total: addresses.length, startTime, estimatedTimeRemaining: 0 })

      try {
        showNotification(`${addresses.length}개 주소 변환 중...`, "info")
        const CHUNK_SIZE = 10
        const allResults: BatchResult[] = []
        const MAX_RETRIES = 2
        let cancelled = false

        for (let i = 0; i < addresses.length; i += CHUNK_SIZE) {
          if (controller.signal.aborted) {
            cancelled = true
            break
          }

          const chunkWithNames = parsedInputData.slice(i, i + CHUNK_SIZE)
          let retries = 0
          let success = false

          while (retries <= MAX_RETRIES && !success) {
            try {
              const response = await fetch("/api/resolve-address-batch", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  addresses: chunkWithNames.map((d) => ({
                    address: d.address,
                    facilityName: d.facilityName,
                  })),
                }),
                signal: controller.signal,
              })

              if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`)
              const data = await response.json()
              allResults.push(...data.results)
              success = true
            } catch {
              if (controller.signal.aborted) {
                cancelled = true
                break
              }
              retries++
              if (retries <= MAX_RETRIES) {
                await new Promise((resolve) => setTimeout(resolve, 1000 * retries))
              } else {
                showNotification("일부 주소 변환에 실패했습니다. 계속 진행합니다...", "error")
                chunkWithNames.forEach((data) => {
                  allResults.push({
                    display: "",
                    fallback: true,
                    message: "네트워크 오류로 변환에 실패했습니다",
                    originalInput: data.address,
                    facilityName: data.facilityName,
                    meta: { lat: 0, lon: 0, gu: "", source: "FALLBACK" },
                  })
                })
              }
            }
          }

          if (cancelled) break

          const now = Date.now()
          const elapsedTime = now - startTime
          const processedCount = allResults.length
          const avgTimePerAddress = elapsedTime / processedCount
          const remainingCount = addresses.length - processedCount

          setProgress({
            current: processedCount,
            total: addresses.length,
            startTime,
            estimatedTimeRemaining: Math.max(0, avgTimePerAddress * remainingCount),
          })

          setBatchResults([...allResults])
        }

        setProgress({ current: addresses.length, total: addresses.length, startTime, estimatedTimeRemaining: 0 })
        setBatchResults(allResults)

        if (cancelled) {
          showNotification(`${allResults.length}/${addresses.length}개 처리 후 취소됨`, "info")
        } else {
          const successCount = allResults.filter((r) => !r.fallback).length
          const failureCount = allResults.filter((r) => r.fallback).length
          if (failureCount > 0) {
            showNotification(
              `${successCount}/${addresses.length}개 주소 변환 완료 (${failureCount}개 실패)`,
              failureCount > successCount ? "error" : "info",
            )
          } else {
            showNotification(`${successCount}/${addresses.length}개 주소 변환 완료`, "success")
          }
        }

        setTimeout(() => {
          resultSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
        }, 300)
      } catch {
        showNotification("일괄 변환 중 오류가 발생했습니다.", "error")
        setProgress(null)
      } finally {
        setIsSearching(false)
        batchAbortRef.current = null
        setTimeout(() => setProgress(null), 1500)
      }
    }
  }

  const handleCancelBatch = () => {
    batchAbortRef.current?.abort()
  }

  const copyToClipboard = async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopiedKey(key)
      showNotification("클립보드에 복사되었습니다.", "success")
      setTimeout(() => setCopiedKey(null), 2000)
    } catch {
      showNotification("클립보드 복사에 실패했습니다.", "error")
    }
  }

  const toggleField = (field: OutputField) => {
    const newFields = new Set(selectedFields)
    if (newFields.has(field)) {
      newFields.delete(field)
    } else {
      newFields.add(field)
    }
    setSelectedFields(newFields)
  }

  const loadRecentSearch = (search: string) => {
    setInputValue(search)
    setShowRecentSearches(false)
  }

  const clearRecentSearches = () => {
    setRecentSearches([])
    localStorage.removeItem("addressGenerator_recentSearches")
    setShowRecentSearches(false)
  }

  const exportToExcel = async () => {
    if (batchResults.length === 0) return
    const XLSX = await import("xlsx")

    const excelData = batchResults.map((result, idx) => {
      const row: Record<string, string | number> = { 번호: idx + 1 }
      if (result.facilityName) row.시설명 = result.facilityName
      for (const field of OUTPUT_FIELDS) {
        if (!selectedFields.has(field)) continue
        row[EXCEL_LABELS[field]] = result.fallback ? "변환 실패" : getFieldDisplayValue(result, field)
      }
      return row
    })

    const worksheet = XLSX.utils.json_to_sheet(excelData)
    const colWidths: { wch: number }[] = [{ wch: 8 }]
    if (batchResults.some((r) => r.facilityName)) colWidths.push({ wch: 25 })
    if (selectedFields.has("standard1")) colWidths.push({ wch: 50 })
    if (selectedFields.has("standard2")) colWidths.push({ wch: 45 })
    if (selectedFields.has("road")) colWidths.push({ wch: 40 })
    if (selectedFields.has("jibun")) colWidths.push({ wch: 35 })
    if (selectedFields.has("adminDong")) colWidths.push({ wch: 20 })
    if (selectedFields.has("postalCode")) colWidths.push({ wch: 12 })
    if (selectedFields.has("unit")) colWidths.push({ wch: 20 })
    worksheet["!cols"] = colWidths

    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, worksheet, "주소변환결과")
    const fileName = `주소변환결과_${new Date().toISOString().slice(0, 10)}.xlsx`
    const wbout = XLSX.write(workbook, { bookType: "xlsx", type: "array" })
    const blob = new Blob([wbout], { type: "application/octet-stream" })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.download = fileName
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
    showNotification("엑셀 파일이 다운로드되었습니다.", "success")
  }

  return (
    <div className="space-y-6">
      {notification && (
        <div
          className={`fixed top-4 right-4 z-50 rounded-lg px-4 py-3 shadow-lg backdrop-blur-sm ${
            notification.type === "error"
              ? "bg-red-500/95 text-white"
              : notification.type === "info"
                ? "bg-blue-500/95 text-white"
                : "bg-green-500/95 text-white"
          }`}
        >
          {notification.message}
        </div>
      )}

      {progress && progress.total > 1 && (
        <div className="fixed top-20 right-4 z-50 rounded-lg bg-white border-2 border-gray-900 shadow-xl p-4 min-w-[280px]">
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm font-medium">
              <span>처리 중...</span>
              <span className="text-gray-600">
                {progress.current} / {progress.total}
              </span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2.5">
              <div
                className="bg-blue-600 h-2.5 rounded-full transition-all duration-300"
                style={{ width: `${(progress.current / progress.total) * 100}%` }}
              />
            </div>
            <div className="flex items-center justify-between text-xs text-gray-500">
              <span>{Math.round((progress.current / progress.total) * 100)}% 완료</span>
              {progress.estimatedTimeRemaining > 0 && (
                <span>약 {Math.ceil(progress.estimatedTimeRemaining / 1000)}초 남음</span>
              )}
            </div>
            {isSearching && (
              <button
                onClick={handleCancelBatch}
                className="w-full mt-1 inline-flex items-center justify-center rounded-md text-xs font-medium bg-red-100 text-red-700 hover:bg-red-200 h-8 px-3 transition-colors"
              >
                취소
              </button>
            )}
          </div>
        </div>
      )}

      <div className="rounded-lg border bg-card text-card-foreground shadow-sm">
        <div className="flex flex-col space-y-1.5 p-6">
          <div className="flex items-center justify-between">
            <h3
              className="flex items-center gap-2 text-2xl font-semibold leading-none tracking-tight"
              style={{ fontFamily: "Shilla, sans-serif" }}
            >
              <SearchIcon />
              무엇을 찾아드리리오?
            </h3>
            <UsageGuideButton onClick={() => setShowUsageGuide(true)} />
          </div>
          <p className="text-sm text-muted-foreground">
            {isMultiLine
              ? "여러 주소를 한 번에 변환하세요 (줄바꿈으로 구분, 엑셀 2열 데이터 지원)"
              : "입력한 주소를 표준주소 형식으로 변환하고, 지도에 표시하오"}
          </p>
        </div>
        <div className="p-6 pt-0">
          <div className="space-y-4">
            {hasTwoColumnData && showFormattedInput ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-gray-700">입력 데이터 ({lines.length}개)</span>
                  <button
                    onClick={() => setShowFormattedInput(false)}
                    className="inline-flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-700 font-medium"
                  >
                    <EditIcon />
                    텍스트로 편집
                  </button>
                </div>
                <div className="rounded-lg border-2 border-gray-300 bg-white overflow-hidden">
                  <div className="max-h-96 overflow-y-auto">
                    <table className="w-full">
                      <thead className="bg-gray-100 border-b-2 border-gray-300 sticky top-0">
                        <tr>
                          <th className="w-12 px-3 py-2 text-xs font-bold text-gray-600 text-center">#</th>
                          <th className="px-4 py-2 text-xs font-bold text-gray-600 text-left">주소</th>
                          <th className="w-48 px-4 py-2 text-xs font-bold text-gray-600 text-left">시설명</th>
                        </tr>
                      </thead>
                      <tbody>
                        {parsedInputData.map((data, idx) => (
                          <tr key={idx} className="border-b border-gray-200 hover:bg-gray-50">
                            <td className="px-3 py-3 text-center">
                              <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-gray-200 text-gray-700 text-xs font-bold">
                                {idx + 1}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-900">{data.address}</td>
                            <td className="px-4 py-3">
                              {data.facilityName ? (
                                <span className="inline-flex items-center rounded-md bg-blue-100 px-3 py-1 text-sm font-bold text-blue-800 border border-blue-300">
                                  {data.facilityName}
                                </span>
                              ) : (
                                <span className="text-xs text-gray-400">-</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="flex items-center justify-between mb-1">
                  <label className="text-sm font-medium text-gray-700">주소 입력</label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <button
                        className="inline-flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-700 font-medium rounded-md px-2 py-1 hover:bg-blue-50 transition-colors"
                        type="button"
                      >
                        <InfoIcon />
                        입력 방법
                      </button>
                    </PopoverTrigger>
                    <PopoverContent side="bottom" align="end" className="w-80">
                      <InputGuideContent />
                    </PopoverContent>
                  </Popover>
                </div>

                <TooltipProvider delayDuration={300}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="relative">
                        <div
                          className="absolute left-0 top-0 w-10 bg-gray-100 border-r border-gray-300 rounded-l-md flex flex-col text-xs text-gray-400 font-mono pt-2 pointer-events-none z-10"
                          style={{ height: textareaRef.current?.style.height || "auto", lineHeight: "1.5rem" }}
                        >
                          {lines.map((_, idx) => (
                            <div
                              key={idx}
                              className="h-6 flex items-center justify-center"
                              style={{ lineHeight: "1.5rem" }}
                            >
                              {idx + 1}
                            </div>
                          ))}
                        </div>
                        <textarea
                          ref={textareaRef}
                          placeholder="찾을 주소를 입력하시오, 여러주소는 줄바꿈하시오"
                          value={inputValue}
                          onChange={(e) => setInputValue(e.target.value)}
                          onFocus={() => setShowRecentSearches(true)}
                          onBlur={() => {
                            setTimeout(() => setShowRecentSearches(false), 200)
                            if (hasTwoColumnData) setShowFormattedInput(true)
                          }}
                          className="flex min-h-[60px] w-full rounded-md border border-input bg-background pl-12 pr-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 resize-none"
                          rows={1}
                          style={{ lineHeight: "1.5rem" }}
                        />

                        {showRecentSearches && recentSearches.length > 0 && (
                          <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg max-h-60 overflow-auto">
                            <div className="flex items-center justify-between px-3 py-2 border-b border-gray-200 bg-gray-50">
                              <div className="flex items-center gap-2 text-xs font-medium text-gray-600">
                                <ClockIcon />
                                최근 검색
                              </div>
                              <button
                                onClick={clearRecentSearches}
                                className="text-xs text-gray-500 hover:text-gray-700"
                              >
                                전체 삭제
                              </button>
                            </div>
                            {recentSearches.map((search, idx) => {
                              const isBatch = search.includes("\n")
                              const displayText = isBatch
                                ? `${search.split("\n")[0]}... (외 ${search.split("\n").length - 1}개)`
                                : search

                              return (
                                <button
                                  key={idx}
                                  onClick={() => loadRecentSearch(search)}
                                  className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100 transition-colors border-b border-gray-100 last:border-b-0"
                                >
                                  {displayText}
                                </button>
                              )
                            })}
                          </div>
                        )}
                      </div>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" className="max-w-md p-4">
                      <InputGuideContent dark />
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
            )}

            <div className="rounded-lg bg-muted/30 border border-border/50 p-4">
              <label className="text-sm font-semibold text-foreground mb-3 block">출력 항목 선택</label>
              <TooltipProvider delayDuration={200}>
                <div className="flex flex-wrap gap-2">
                  {OUTPUT_FIELDS.map((field) => (
                    <Tooltip key={field}>
                      <TooltipTrigger asChild>
                        <button
                          onClick={() => toggleField(field)}
                          className={`inline-flex items-center justify-center rounded-full px-4 py-2 text-sm transition-all duration-200 ${
                            selectedFields.has(field)
                              ? "bg-gray-200 text-gray-900 font-bold shadow-md hover:shadow-lg hover:bg-gray-300"
                              : "bg-white text-gray-300 hover:bg-gray-50 hover:text-gray-500 border border-gray-200 hover:border-gray-300"
                          }`}
                        >
                          {OUTPUT_FIELD_LABELS[field]}
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="max-w-xs">
                        <p className="text-xs font-medium mb-1 text-gray-100">출력 예시:</p>
                        <p className="text-xs text-gray-200">{FIELD_EXAMPLES[field]}</p>
                      </TooltipContent>
                    </Tooltip>
                  ))}
                </div>
              </TooltipProvider>
            </div>

            {isMultiLine && (
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">결과 표시 방법</label>
                <div className="flex gap-2">
                  {(["combined", "individual"] as const).map((mode) => (
                    <button
                      key={mode}
                      onClick={() => setDisplayMode(mode)}
                      className={`flex-1 inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 h-10 px-4 ${
                        displayMode === mode
                          ? "bg-primary text-primary-foreground"
                          : "border border-input bg-background hover:bg-accent hover:text-accent-foreground"
                      }`}
                    >
                      {mode === "combined" ? "한번에 출력" : "주소별 개별 출력"}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <button
              onClick={handleSearch}
              disabled={isSearching}
              className="inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground hover:bg-primary/90 h-10 px-4 w-full"
            >
              {isSearching ? (
                <>
                  <svg className="h-5 w-5 animate-spin mr-2" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    />
                  </svg>
                  변환 중...
                </>
              ) : (
                <>
                  <SearchIcon />
                  <span className="ml-2">{isMultiLine ? "일괄 검색" : "검색"}</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {resolvedAddress && !resolvedAddress.fallback && (
        <>
          <div className="rounded-lg border bg-card text-card-foreground shadow-sm">
            <div className="flex flex-col space-y-1.5 p-6">
              <h3 className="flex items-center gap-2 text-2xl font-semibold leading-none tracking-tight">
                <MapPinIcon />
                위치 확인
              </h3>
              <p className="text-sm text-muted-foreground">지도에서 위치를 확인하세요</p>
            </div>
            <div className="p-6 pt-0">
              <MapView lat={resolvedAddress.meta.lat} lon={resolvedAddress.meta.lon} address={resolvedAddress.display} />
            </div>
          </div>

          <div
            ref={resultSectionRef}
            className="rounded-lg border-2 border-gray-900 bg-white text-card-foreground shadow-sm"
          >
            <div className="flex flex-col space-y-1.5 p-6">
              <h3 className="text-2xl font-semibold leading-none tracking-tight text-gray-900">표준주소 결과</h3>
              <p className="text-sm text-muted-foreground">클릭하여 클립보드에 복사하세요</p>
            </div>
            <div className="p-6 pt-0 space-y-3">
              {OUTPUT_FIELDS.filter((field) => {
                if (!selectedFields.has(field)) return false
                return !!getFieldDisplayValue(resolvedAddress, field)
              }).map((field) => (
                <ResultFieldButton
                  key={field}
                  label={OUTPUT_FIELD_LABELS[field]}
                  value={getFieldDisplayValue(resolvedAddress, field)}
                  copiedKey={`single-${field}`}
                  currentCopiedKey={copiedKey}
                  onCopy={copyToClipboard}
                />
              ))}
            </div>
          </div>
        </>
      )}

      {batchResults.length > 0 && (
        <>
          <div className="rounded-lg border bg-card text-card-foreground shadow-sm">
            <div className="flex flex-col space-y-1.5 p-6">
              <h3 className="flex items-center gap-2 text-2xl font-semibold leading-none tracking-tight">
                <MapPinIcon />
                위치 확인
              </h3>
              <p className="text-sm text-muted-foreground">
                지도에서 모든 위치를 확인하세요 (마커에 마우스를 올려보세요)
              </p>
            </div>
            <div className="p-6 pt-0">
              <MapView
                lat={batchResults[0].meta.lat}
                lon={batchResults[0].meta.lon}
                address="일괄 변환 결과"
                markers={batchResults
                  .filter((r) => !r.fallback)
                  .map((r) => ({
                    lat: r.meta.lat,
                    lon: r.meta.lon,
                    address: r.display,
                    title: r.facilityName,
                    roadName: r.meta.roadName ? `${r.meta.gu} ${r.meta.roadName}${r.meta.buildingNo}` : undefined,
                    jibunAddress: r.meta.legalDong ? `${r.meta.legalDong} ${r.meta.jibunNo}` : undefined,
                    adminDong: r.meta.adminDong,
                  }))}
              />
            </div>
          </div>

          {displayMode === "combined" && (
            <div
              ref={resultSectionRef}
              className="rounded-lg border-2 border-gray-900 bg-white text-card-foreground shadow-sm"
            >
              <div className="flex flex-col space-y-1.5 p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-2xl font-semibold leading-none tracking-tight text-gray-900">
                      일괄 변환 결과 (한번에)
                    </h3>
                    <p className="text-sm text-gray-600 mt-1">전체 결과를 한번에 복사할 수 있습니다</p>
                  </div>
                  <button
                    onClick={exportToExcel}
                    className="inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 bg-green-600 text-white hover:bg-green-700 h-10 px-4 gap-2"
                  >
                    <DownloadIcon />
                    엑셀 다운로드
                  </button>
                </div>
              </div>
              <div className="p-6 pt-0 space-y-3">
                {OUTPUT_FIELDS.filter((field) => {
                  if (!selectedFields.has(field)) return false
                  if (field === "postalCode") return batchResults.some((r) => !r.fallback && r.meta.postalCode)
                  if (field === "unit") return batchResults.some((r) => !r.fallback && r.meta.unit)
                  return true
                }).map((field) => (
                  <CombinedBatchField
                    key={field}
                    field={field}
                    results={batchResults}
                    copiedKey={`combined-${field}`}
                    currentCopiedKey={copiedKey}
                    onCopy={copyToClipboard}
                  />
                ))}
              </div>
            </div>
          )}

          {displayMode === "individual" && (
            <div ref={resultSectionRef} className="space-y-4">
              <div className="flex justify-end">
                <button
                  onClick={exportToExcel}
                  className="inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 bg-green-600 text-white hover:bg-green-700 h-10 px-4 gap-2"
                >
                  <DownloadIcon />
                  엑셀 다운로드
                </button>
              </div>
              {batchResults.map((result, idx) => (
                <div key={idx} className="rounded-lg border-2 border-gray-900 bg-white text-card-foreground shadow-sm">
                  <div className="flex flex-col space-y-1.5 p-6">
                    <h3 className="text-xl font-semibold leading-none tracking-tight text-gray-900">
                      {idx + 1}.{" "}
                      {result.facilityName && (
                        <span className="inline-flex items-center rounded-md bg-blue-100 px-3 py-1 text-sm font-bold text-blue-800 mr-2 border border-blue-300">
                          {result.facilityName}
                        </span>
                      )}
                      {result.originalInput}
                    </h3>
                    {!result.fallback && <p className="text-sm text-gray-600">클릭하여 클립보드에 복사하세요</p>}
                  </div>
                  <div className="p-6 pt-0 space-y-3">
                    <IndividualResultFields
                      result={result}
                      idx={idx}
                      selectedFields={selectedFields}
                      copiedKey={copiedKey}
                      onCopy={copyToClipboard}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      <UsageGuideModal open={showUsageGuide} onOpenChange={setShowUsageGuide} />
    </div>
  )
}
