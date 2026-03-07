import { useState, useEffect, useRef } from "react"
import { useStorage } from "@plasmohq/storage/hook"

import { resolveAddress } from "~lib/api"
import { getFieldValue } from "~lib/format"
import {
  type ResolvedDisplay,
  type OutputField,
  type HistoryItem,
  type ExtensionSettings,
  FIELD_LABELS,
  FIELD_EXAMPLES,
  DEFAULT_SETTINGS
} from "~lib/types"
import { addHistory, getHistory, toggleFavorite, clearHistory } from "~lib/storage"
import * as XLSX from "xlsx"

import "./style.css"

function MiniMap({ lat, lon }: { lat: number; lon: number }) {
  const delta = 0.004
  const bbox = `${lon - delta},${lat - delta},${lon + delta},${lat + delta}`
  const src = `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${lat},${lon}`

  return (
    <iframe
      src={src}
      className="w-full h-[150px] rounded-lg border-0"
      loading="lazy"
      title="위치 미리보기"
      sandbox="allow-scripts allow-same-origin"
      referrerPolicy="no-referrer"
    />
  )
}

function getMapUrl(provider: string, address: string): string {
  const encoded = encodeURIComponent(address)
  if (provider === "naver") {
    return `https://map.naver.com/v5/search/${encoded}`
  }
  return `https://map.kakao.com/link/search/${encoded}`
}

function IndexPopup() {
  const [input, setInput] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [result, setResult] = useState<ResolvedDisplay | null>(null)
  const [error, setError] = useState("")
  const [copiedField, setCopiedField] = useState<string | null>(null)
  const [history, setHistory] = useState<HistoryItem[]>([])
  const [showHistory, setShowHistory] = useState(false)
  const [batchResults, setBatchResults] = useState<ResolvedDisplay[]>([])
  const [batchProgress, setBatchProgress] = useState<{ current: number; total: number } | null>(null)
  const [showGuide, setShowGuide] = useState(false)
  const [batchLines, setBatchLines] = useState<string[]>([])  // 배치 검색 시 고정된 lines

  const [settings] = useStorage<ExtensionSettings>("settings", DEFAULT_SETTINGS)
  const [selectedFields, setSelectedFields] = useStorage<OutputField[]>(
    "selectedFields",
    DEFAULT_SETTINGS.selectedFields
  )

  const inputRef = useRef<HTMLTextAreaElement>(null)

  // 입력이 여러 줄인지 판별
  const lines = input.split("\n").map(l => l.trim()).filter(Boolean)
  const isBatch = lines.length > 1

  const loadHistory = async () => {
    const items = await getHistory()
    setHistory(items)
  }

  const doSearch = async (query: string) => {
    if (!query) return
    setIsLoading(true)
    setError("")
    setResult(null)
    setBatchResults([])
    try {
      const resolved = await resolveAddress(query)
      setResult(resolved)
      if (!resolved.fallback) {
        await addHistory({ input: query, result: resolved })
        await loadHistory()
      }
    } catch {
      setError("주소 변환 실패. API 서버 연결을 확인하세요.")
    } finally {
      setIsLoading(false)
    }
  }

  const handleBatchSearch = async () => {
    if (lines.length === 0 || isLoading) return
    const searchLines = [...lines]  // 검색 시점의 lines 고정
    setBatchLines(searchLines)
    setIsLoading(true)
    setError("")
    setResult(null)
    setBatchResults([])
    setBatchProgress({ current: 0, total: searchLines.length })
    try {
      const CHUNK = 10
      const allResults: ResolvedDisplay[] = []
      for (let i = 0; i < searchLines.length; i += CHUNK) {
        const chunk = searchLines.slice(i, i + CHUNK)
        const res = await fetch(
          `${settings?.apiBaseUrl || "https://gjdong.vercel.app"}/api/resolve-address-batch`,
          { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ addresses: chunk }) }
        )
        if (!res.ok) throw new Error(`API error: ${res.status}`)
        const data = await res.json()
        if (!Array.isArray(data?.results)) throw new Error("Invalid response format")
        allResults.push(...data.results)
        setBatchProgress({ current: Math.min(i + CHUNK, searchLines.length), total: searchLines.length })
      }
      setBatchResults(allResults)
    } catch {
      setError("일괄 변환 실패. API 서버 연결을 확인하세요.")
    } finally {
      setIsLoading(false)
      setBatchProgress(null)
    }
  }

  const handleSearch = () => {
    if (isLoading || !input.trim()) return
    if (isBatch) {
      handleBatchSearch()
    } else {
      doSearch(input.trim())
    }
  }

  // 초기 로드 + URL 파라미터(우클릭 팝업 윈도우)
  useEffect(() => {
    loadHistory()
    const params = new URLSearchParams(window.location.search)
    const raw = params.get("address")
    if (raw) {
      const address = raw.trim().slice(0, 200)
      if (address.length >= 2) {
        setInput(address)
        doSearch(address)
      }
    } else {
      inputRef.current?.focus()
    }
  }, [])

  const pasteFromClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText()
      if (text.trim()) setInput(text.trim())
    } catch {
      setError("클립보드 접근 권한이 필요합니다")
    }
  }

  const copyToClipboard = async (text: string, fieldKey: string) => {
    if (!text) return
    try {
      await navigator.clipboard.writeText(text)
      setCopiedField(fieldKey)
      setTimeout(() => setCopiedField(null), 1500)
    } catch {
      setError("복사 실패")
    }
  }

  const toggleField = (field: OutputField) => {
    const current = selectedFields || DEFAULT_SETTINGS.selectedFields
    if (current.includes(field)) {
      if (current.length > 1) setSelectedFields(current.filter(f => f !== field))
    } else {
      setSelectedFields([...current, field])
    }
  }

  const copyBatchResults = async (field: OutputField) => {
    const values = batchResults.map(r => getFieldValue(r, field)).join("\n")
    await copyToClipboard(values, `batch-${field}`)
  }

  const exportToExcel = () => {
    if (batchResults.length === 0) return
    const excelData = batchResults.map((r, idx) => {
      const row: Record<string, string | number> = { 번호: idx + 1, 입력주소: batchLines[idx] || "" }
      if (r.fallback) {
        fields.forEach(f => { row[FIELD_LABELS[f]] = "변환 실패" })
        return row
      }
      fields.forEach(f => { row[FIELD_LABELS[f]] = getFieldValue(r, f) })
      return row
    })
    const ws = XLSX.utils.json_to_sheet(excelData)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, "주소변환결과")
    const wbout = XLSX.write(wb, { bookType: "xlsx", type: "array" })
    const blob = new Blob([wbout], { type: "application/octet-stream" })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.download = `주소변환결과_${new Date().toISOString().slice(0, 10)}.xlsx`
    link.click()
    URL.revokeObjectURL(url)
  }

  const searchFromHistory = (item: HistoryItem) => {
    setInput(item.input)
    setResult(item.result)
    setBatchResults([])
    setShowHistory(false)
  }

  const handleToggleFavorite = async (inputStr: string) => {
    await toggleFavorite(inputStr)
    await loadHistory()
  }

  const fields = selectedFields || DEFAULT_SETTINGS.selectedFields

  const openWebApp = () => {
    chrome.tabs.create({ url: settings?.apiBaseUrl || "https://gjdong.vercel.app" })
  }

  const openMap = () => {
    if (!result?.meta?.lat || !result?.meta?.lon) return
    const provider = settings?.mapProvider || "kakao"
    const address = getFieldValue(result, "road") || result.display || ""
    chrome.tabs.create({
      url: getMapUrl(provider, address)
    })
  }

  const version = chrome.runtime.getManifest().version
  const mapProviderLabel = (settings?.mapProvider || "kakao") === "naver" ? "네이버맵" : "카카오맵"

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      handleSearch()
    }
  }

  return (
    <div className="flex flex-col bg-gray-50 text-gray-800" style={{ width: 400, minWidth: 400 }}>
      {/* 헤더 */}
      <div className="flex items-baseline justify-center gap-2 pt-3 pb-1 px-4">
        <h1
          className="text-[34px] font-black tracking-tight text-gray-900"
          style={{ fontFamily: "Shilla, sans-serif" }}
        >
          표준주소실록
        </h1>
        <span
          className="text-[14px] text-gray-400"
          style={{ fontFamily: "Shilla, sans-serif" }}
        >
          v{version}
        </span>
      </div>

      {/* 메인 카드 */}
      <div className="mx-3 bg-white rounded-xl border border-gray-200 shadow-sm overflow-visible">
        {/* 카드 헤더 */}
        <div className="px-4 pt-3 pb-1.5">
          <div className="flex items-center justify-between">
            <h2 className="text-[13px] font-bold flex items-center gap-1.5 text-gray-800">
              <svg className="w-3.5 h-3.5 text-gray-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8" />
                <path d="m21 21-4.35-4.35" strokeLinecap="round" />
              </svg>
              무엇을 찾아드리리오?
            </h2>
            <button
              onClick={() => setShowGuide(!showGuide)}
              className="flex items-center gap-1 px-2 py-0.5 rounded-full border border-gray-300 text-[10px] text-gray-500 hover:bg-gray-50 transition-colors"
              title="사용법 안내">
              <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
              사용법
            </button>
          </div>
          <p className="text-[10px] text-gray-400 mt-0.5">주소를 입력하면 표준주소 형식으로 변환하오. 여러 줄 입력 시 일괄 변환.</p>
        </div>

        {/* 사용법 (접기/펼치기) */}
        {showGuide && (
          <div className="mx-4 mb-2 p-2.5 bg-gray-50 rounded-lg text-[10px] text-gray-600 space-y-0.5">
            <p className="font-semibold text-gray-700 mb-1">사용법</p>
            <p>- 주소 입력 후 <strong>Enter</strong> 또는 검색 버튼</p>
            <p>- 여러 주소는 <strong>줄바꿈</strong>으로 구분 (Shift+Enter)</p>
            <p>- 변환 결과 <strong>클릭 시 복사</strong></p>
            <p>- 웹 페이지에서 주소 드래그 → <strong>우클릭 → '표준주소 변환'</strong></p>
          </div>
        )}

        <div className="px-4 pb-3 space-y-2.5">
          {/* 통합 입력 영역 */}
          <div className="relative">
            <textarea
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              onFocus={() => !isBatch && history.length > 0 && setShowHistory(true)}
              onBlur={() => setTimeout(() => setShowHistory(false), 200)}
              placeholder="찾을 주소를 입력하시오 | 2건 이상: Shift+Enter로 구분"
              className="w-full pl-3 pr-9 py-2 bg-gray-50 border border-gray-200 rounded-lg text-[13px] placeholder-gray-400 placeholder:text-[11px] focus:outline-none focus:ring-2 focus:ring-gray-300 focus:border-transparent resize-none"
              rows={isBatch ? Math.min(lines.length + 1, 5) : 1}
              style={{ minHeight: isBatch ? undefined : "38px" }}
            />
            <div className="absolute right-2 top-2 flex flex-col gap-1">
              <button
                onClick={pasteFromClipboard}
                className="p-1 text-gray-400 hover:text-gray-600"
                title="클립보드에서 붙여넣기">
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
                  <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
                </svg>
              </button>
            </div>

            {/* 최근 이력 드롭다운 */}
            {showHistory && !isBatch && history.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-50 max-h-36 overflow-y-auto">
                <div className="flex items-center justify-between px-3 py-1 border-b border-gray-100">
                  <span className="text-[10px] text-gray-400">최근 변환</span>
                  <button
                    onMouseDown={e => { e.preventDefault(); clearHistory().then(loadHistory) }}
                    className="text-[10px] text-gray-400 hover:text-red-500">
                    전체 삭제
                  </button>
                </div>
                {history.slice(0, 6).map((item, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-1.5 px-3 py-1.5 hover:bg-gray-50 cursor-pointer group"
                    onMouseDown={e => { e.preventDefault(); searchFromHistory(item) }}>
                    <button
                      onMouseDown={e => { e.preventDefault(); e.stopPropagation(); handleToggleFavorite(item.input) }}
                      className={`shrink-0 ${item.favorite ? "text-yellow-400" : "text-gray-200 group-hover:text-gray-300"}`}>
                      <svg className="w-3 h-3" fill={item.favorite ? "currentColor" : "none"} stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                      </svg>
                    </button>
                    <span className="text-[11px] truncate flex-1">{item.input}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 줄 수 표시 (일괄 시) */}
          {isBatch && (
            <div className="text-right text-[10px] text-gray-400 -mt-1">
              {lines.length}건 입력됨
            </div>
          )}

          {/* 출력 항목 선택 */}
          <div>
            <span className="text-[12px] font-semibold text-gray-700 block mb-1">출력 항목</span>
            <div className="flex flex-wrap gap-1">
              {(Object.keys(FIELD_LABELS) as OutputField[]).map(field => (
                <button
                  key={field}
                  onClick={() => toggleField(field)}
                  title={`예시: ${FIELD_EXAMPLES[field]}`}
                  className={`px-2.5 py-1 rounded-full text-[11px] font-medium transition-all ${
                    fields.includes(field)
                      ? "bg-gray-800 text-white shadow-sm"
                      : "bg-white text-gray-600 border border-gray-300 hover:bg-gray-100"
                  }`}>
                  {FIELD_LABELS[field]}
                </button>
              ))}
            </div>
          </div>

          {/* 검색 버튼 */}
          <button
            onClick={handleSearch}
            disabled={isLoading || !input.trim()}
            className="w-full py-2 bg-gray-800 text-white rounded-lg font-medium text-[13px] flex items-center justify-center gap-2 hover:bg-gray-900 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            title={isBatch ? `일괄 변환 (${lines.length}건)` : "주소 검색 (Enter)"}>
            {isLoading ? (
              <>
                <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                </svg>
                변환 중...
              </>
            ) : (
              <>
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="11" cy="11" r="8" />
                  <path d="m21 21-4.35-4.35" strokeLinecap="round" />
                </svg>
                {isBatch ? `일괄 검색 (${lines.length}건)` : "검색"}
              </>
            )}
          </button>
        </div>
      </div>

      {/* 에러 */}
      {error && (
        <div className="mx-3 mt-2 px-3 py-2 bg-red-50 text-red-600 text-[11px] rounded-lg border border-red-200">
          {error}
        </div>
      )}

      {/* 일괄 진행률 */}
      {batchProgress && (
        <div className="mx-3 mt-2">
          <div className="flex items-center justify-between text-[10px] text-gray-400 mb-0.5">
            <span>변환 중...</span>
            <span>{batchProgress.current}/{batchProgress.total}</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-1.5">
            <div
              className="bg-gray-800 h-1.5 rounded-full transition-all"
              style={{ width: `${(batchProgress.current / batchProgress.total) * 100}%` }}
            />
          </div>
        </div>
      )}

      {/* 단건 결과 */}
      {!isBatch && result && !result.fallback && (
        <div className="mx-3 mt-2 bg-white rounded-xl border border-gray-200 shadow-sm p-3 space-y-1.5">
          <div className="text-[10px] text-gray-400 font-medium">변환 결과 — 클릭하여 복사</div>
          {fields.map(field => {
            const value = getFieldValue(result, field)
            if (!value) return null
            const key = `single-${field}`
            return (
              <button
                key={field}
                onClick={() => copyToClipboard(value, key)}
                title={`${FIELD_LABELS[field]} 복사: ${value}`}
                className={`w-full flex items-center justify-between px-3 py-1.5 rounded-lg border text-left transition-all ${
                  copiedField === key
                    ? "bg-green-50 border-green-300"
                    : "bg-gray-50 border-gray-100 hover:bg-blue-50 hover:border-blue-200"
                }`}>
                <div className="flex-1 min-w-0">
                  <span className="text-[10px] text-gray-400 font-medium">{FIELD_LABELS[field]}</span>
                  <p className="text-[12px] truncate mt-0.5">{value}</p>
                </div>
                <span className="ml-2 shrink-0">
                  {copiedField === key ? (
                    <svg className="w-3.5 h-3.5 text-green-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="20 6 9 17 4 12" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  ) : (
                    <svg className="w-3.5 h-3.5 text-gray-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
                      <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
                    </svg>
                  )}
                </span>
              </button>
            )
          })}

          {/* 지도 링크 */}
          {settings?.showMapLink !== false && result.meta?.lat && result.meta?.lon && (
            <button
              onClick={openMap}
              className="w-full flex items-center justify-center gap-1.5 py-1.5 text-[11px] text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg border border-gray-100 transition-colors"
              title={`${mapProviderLabel}에서 위치 확인`}>
              <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" />
              </svg>
              {mapProviderLabel}에서 보기
            </button>
          )}

          {/* 미니맵 */}
          {settings?.showMiniMap !== false && result.meta?.lat && result.meta?.lon && (
            <MiniMap lat={result.meta.lat} lon={result.meta.lon} />
          )}
        </div>
      )}

      {/* 단건 실패 */}
      {!isBatch && result?.fallback && (
        <div className="mx-3 mt-2 px-3 py-2 bg-red-50 text-red-600 text-[11px] rounded-lg border border-red-200">
          주소를 찾을 수 없습니다: {result.message}
        </div>
      )}

      {/* 일괄 결과 */}
      {batchResults.length > 0 && (
        <div className="mx-3 mt-2 space-y-1.5">
          {/* 헤더: 전체 복사 + 엑셀 */}
          <div className="flex items-center justify-between px-1">
            <span className="text-[10px] text-gray-400 font-medium">{batchResults.length}건 변환 완료</span>
            <div className="flex items-center gap-1">
              <button
                onClick={exportToExcel}
                className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-green-100 text-green-700 hover:bg-green-200 transition-colors"
                title="엑셀 내보내기">
                Excel
              </button>
              {fields.map(field => {
                const key = `batch-${field}`
                return (
                  <button
                    key={field}
                    onClick={() => copyBatchResults(field)}
                    className={`px-1.5 py-0.5 rounded-full text-[9px] transition-colors ${
                      copiedField === key
                        ? "bg-green-100 text-green-600"
                        : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                    }`}
                    title={`${FIELD_LABELS[field]} 전체 복사`}>
                    {copiedField === key ? "복사됨" : FIELD_LABELS[field]}
                  </button>
                )
              })}
            </div>
          </div>

          {/* 주소별 개별 결과 */}
          {batchResults.map((bResult, idx) => (
            <div key={idx} className="bg-white rounded-xl border border-gray-200 shadow-sm p-2.5 space-y-1">
              <div className="text-[10px] text-gray-400 font-medium truncate">
                {idx + 1}. {batchLines[idx] || ""}
              </div>
              {bResult.fallback ? (
                <div className="px-2.5 py-1 bg-red-50 text-red-500 text-[10px] rounded-md">
                  변환 실패: {bResult.message || "주소를 찾을 수 없습니다"}
                </div>
              ) : (
                fields.map(field => {
                  const value = getFieldValue(bResult, field)
                  if (!value) return null
                  const key = `batch-${idx}-${field}`
                  return (
                    <button
                      key={field}
                      onClick={() => copyToClipboard(value, key)}
                      title={`${FIELD_LABELS[field]} 복사: ${value}`}
                      className={`w-full flex items-center justify-between px-2.5 py-1 rounded-lg border text-left transition-all ${
                        copiedField === key
                          ? "bg-green-50 border-green-300"
                          : "bg-gray-50 border-gray-100 hover:bg-blue-50 hover:border-blue-200"
                      }`}>
                      <div className="flex-1 min-w-0">
                        <span className="text-[9px] text-gray-400">{FIELD_LABELS[field]}</span>
                        <p className="text-[11px] truncate">{value}</p>
                      </div>
                      <span className="ml-1.5 shrink-0">
                        {copiedField === key ? (
                          <svg className="w-3 h-3 text-green-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <polyline points="20 6 9 17 4 12" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        ) : (
                          <svg className="w-3 h-3 text-gray-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
                            <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
                          </svg>
                        )}
                      </span>
                    </button>
                  )
                })
              )}
            </div>
          ))}
        </div>
      )}

      {/* 푸터 */}
      <div className="px-3 py-2 mt-1 text-center space-y-1">
        <div className="flex items-center justify-center gap-3 text-[10px]">
          <button
            onClick={() => {
              chrome.windows.create({
                url: chrome.runtime.getURL("popup.html"),
                type: "popup",
                width: 500,
                height: 540,
                focused: true
              })
              window.close()
            }}
            className="text-gray-400 hover:text-blue-600 transition-colors flex items-center gap-1"
            title="독립 창으로 열기 (닫히지 않음)">
            <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
              <line x1="8" y1="21" x2="16" y2="21" />
              <line x1="12" y1="17" x2="12" y2="21" />
            </svg>
            새 창
          </button>
          <span className="text-gray-200">·</span>
          <button
            onClick={openWebApp}
            className="text-gray-400 hover:text-blue-600 transition-colors flex items-center gap-1"
            title="웹 버전에서 열기">
            <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
              <polyline points="15 3 21 3 21 9" />
              <line x1="10" y1="14" x2="21" y2="3" />
            </svg>
            웹에서 열기
          </button>
          <span className="text-gray-200">·</span>
          <button
            onClick={() => chrome.runtime.openOptionsPage()}
            className="text-gray-400 hover:text-blue-600 transition-colors flex items-center gap-1"
            title="설정 페이지 열기">
            <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="3" />
              <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
            </svg>
            설정
          </button>
        </div>
        <p className="text-[9px] text-gray-400">
          Copyright 2025.10. <span className="text-gray-300">개친절한</span> 류주임. All right reserved.
        </p>
        <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-[8px] font-medium text-gray-400 border border-gray-200">
          광진구청 AI 동호회 - AI.Do
        </span>
      </div>
    </div>
  )
}

export default IndexPopup
