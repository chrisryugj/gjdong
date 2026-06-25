"use client"

import { useMemo, useRef, useState } from "react"
import { FileDown, FileUp, Loader2, MapPin, Plus, Sparkles, Tag, X } from "lucide-react"
import { toast } from "sonner"
import MarkerStylePicker, { ShapeIcon } from "@/components/facility/marker-style-picker"
import { parseFacilityTable, parseFacilityText, type FacilityColumnMapping } from "@/lib/facility-column-inference"
import { resolveStyle, type CategoryStyle } from "@/lib/facility-markers"
import type { ParsedRow } from "@/lib/facility-storage"

// 자주 쓰는 시설 종류 — 분류 입력 추천(기존 입력 분류와 함께 칩으로 노출).
// 분류로 시설 종류를 구분해 한 지도에서 어린이집·무더위쉼터 등을 분류 필터로 전환해 본다.
const CATEGORY_PRESETS = ["어린이집", "무더위쉼터", "한파쉼터", "경로당", "공원", "주차장", "CCTV", "대피소"]

type Tab = "form" | "excel" | "paste"
// failedRows: 변환 실패한 입력 행 — 호출부가 입력칸에 남겨 사용자가 수정·재시도할 수 있게 한다.
type AddResult = { added: number; skipped: number; failed: number; failedRows: ParsedRow[] }

interface Props {
  existingCategories: string[]
  styles: Record<string, CategoryStyle>
  onSetCategoryStyle: (category: string, style: CategoryStyle) => void
  onAdd: (rows: ParsedRow[]) => Promise<AddResult>
}

function formatMappingSummary(mapping?: FacilityColumnMapping): string {
  if (!mapping) return ""
  const col = (index: number) => (index >= 0 ? mapping.headers[index] || `${index + 1}열` : "미인식")
  const filters = mapping.filterColumns.map((column) => column.label).join(", ") || "없음"
  return `주소: ${col(mapping.addressIndex)} · 시설명: ${col(mapping.nameIndex)} · 분류: ${col(mapping.categoryIndex)} · 필터: ${filters}`
}

export default function FacilityAdd({ existingCategories, styles, onSetCategoryStyle, onAdd }: Props) {
  const [tab, setTab] = useState<Tab>("form")
  const [busy, setBusy] = useState(false)

  // 직접입력 — 다중 행 그리드
  const emptyRow = (): ParsedRow => ({ address: "", name: "", category: "" })
  const [rows, setRows] = useState<ParsedRow[]>(() => [emptyRow(), emptyRow(), emptyRow()])
  const filledRows = rows.filter((r) => r.address.trim())
  const setRow = (i: number, patch: Partial<ParsedRow>) =>
    setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)))
  const addRow = () => setRows((rs) => [...rs, emptyRow()])
  const removeRow = (i: number) =>
    setRows((rs) => (rs.length > 1 ? rs.filter((_, j) => j !== i) : [emptyRow()]))

  // 마커 스타일(분류별) — 접이식 보조 패널
  const [showStyle, setShowStyle] = useState(false)
  const [styleCat, setStyleCat] = useState("")
  const styleTarget = styleCat.trim()
  const curStyle = resolveStyle(styleTarget || undefined, styles)

  // 붙여넣기
  const [paste, setPaste] = useState("")
  const parsedPaste = useMemo(() => parseFacilityText(paste), [paste])
  const parsed = parsedPaste.rows

  // 엑셀
  const [excelRows, setExcelRows] = useState<ParsedRow[]>([])
  const [excelName, setExcelName] = useState("")
  const [excelMapping, setExcelMapping] = useState<FacilityColumnMapping | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  // 전체 분류 일괄 적용 — 분류 미입력 항목에 이 값을 채운다(주소만 대량 입력 시 분류 한 번에 지정)
  const [bulkCategory, setBulkCategory] = useState("")
  // 추천 분류 칩 = 기존 입력 분류 우선 + 프리셋(중복 제거)
  const categoryChips = useMemo(() => {
    const seen = new Set<string>()
    const out: string[] = []
    for (const c of [...existingCategories, ...CATEGORY_PRESETS]) {
      const t = c.trim()
      if (t && !seen.has(t)) {
        seen.add(t)
        out.push(t)
      }
    }
    return out
  }, [existingCategories])
  // 행별 분류가 비어 있으면 전체 분류로 채워 넣는다
  const applyBulk = (rs: ParsedRow[]): ParsedRow[] => {
    const bc = bulkCategory.trim()
    return bc
      ? rs.map((r) => {
          if (r.category.trim()) return r
          return { ...r, category: bc, filters: { ...(r.filters ?? {}), 분류: bc } }
        })
      : rs
  }

  // onDone은 실패행 목록을 받아 입력칸을 정리한다 — 성공분은 비우고 실패행은 남겨 재시도 가능하게.
  const run = async (rows: ParsedRow[], onDone: (failedRows: ParsedRow[]) => void) => {
    if (busy) return
    if (rows.length === 0) {
      toast.info("추가할 주소가 없습니다")
      return
    }
    if (rows.length > 300) {
      toast.error(`한 번에 최대 300건까지 추가할 수 있습니다 (현재 ${rows.length}건)`)
      return
    }
    setBusy(true)
    try {
      const r = await onAdd(rows)
      // 성공·중복이 하나라도 처리됐으면 입력을 정리(실패행만 남김). 전부 실패면 입력 그대로 둔다.
      if (r.added > 0 || r.skipped > 0) onDone(r.failedRows)
    } finally {
      setBusy(false)
    }
  }

  const handleTextareaKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== "Tab" || e.shiftKey) return
    e.preventDefault()
    const ta = e.currentTarget
    const { selectionStart: s, selectionEnd: en } = ta
    setPaste((v) => v.slice(0, s) + "\t" + v.slice(en))
    requestAnimationFrame(() => {
      ta.selectionStart = ta.selectionEnd = s + 1
    })
  }

  const downloadTemplate = async () => {
    const XLSX = await import("xlsx")
    const ws = XLSX.utils.aoa_to_sheet([
      ["주소", "시설명", "분류"],
      ["서울 광진구 아차산로 400", "자양보건지소", "보건소"],
      ["광진구 능동로 209", "세종대학교", "교육시설"],
      ["광진구 광나루로 350", "광나루안전체험관", ""],
    ])
    ws["!cols"] = [{ wch: 40 }, { wch: 24 }, { wch: 16 }]
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, "시설입력")
    XLSX.writeFile(wb, "시설입력양식.xlsx")
    toast.success("엑셀 양식을 내려받았습니다 — 채워서 업로드하세요")
  }

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = "" // 같은 파일 재선택 허용
    if (!file) return
    try {
      const XLSX = await import("xlsx")
      const isCsv = file.name.toLowerCase().endsWith(".csv")
      const buf = isCsv ? await file.text() : await file.arrayBuffer()
      const wb = XLSX.read(buf, { type: isCsv ? "string" : "array" })
      const ws = wb.Sheets[wb.SheetNames[0]]
      const aoa = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, blankrows: false })
      if (aoa.length === 0) {
        toast.error("빈 파일입니다")
        return
      }
      const parsedTable = parseFacilityTable(aoa as unknown[][])
      if (parsedTable.rows.length === 0) {
        toast.error("주소 열을 찾지 못했습니다. 양식의 '주소' 열을 확인하세요")
        return
      }
      setExcelRows(parsedTable.rows)
      setExcelMapping(parsedTable.mapping)
      setExcelName(file.name)
      toast.success(`${file.name} — ${parsedTable.rows.length}건 인식됨. '가져오기'를 누르세요`)
    } catch {
      toast.error("파일을 읽지 못했습니다 (xlsx/csv만 지원)")
    }
  }

  return (
    <div className="rounded-xl border bg-card shadow-sm">
      {/* 탭 */}
      <div className="flex border-b">
        {(
          [
            ["form", "직접 입력"],
            ["excel", "엑셀"],
            ["paste", "붙여넣기"],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={`flex-1 px-3 py-2.5 text-sm font-medium transition-colors ${
              tab === k ? "border-b-2 border-gray-900 text-gray-900" : "text-gray-400 hover:text-gray-600"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="p-4">
        {/* 분류 자동완성 목록 (추천 프리셋 + 기존 분류) — 모든 탭 공용 */}
        <datalist id="facility-cat-list">
          {categoryChips.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>

        {/* 전체 분류 일괄 적용 — 분류 미입력 항목에 채움. 주소만 대량 입력 후 분류 한 번에 지정 */}
        <div className="mb-3 rounded-lg border border-dashed border-gray-200 bg-gray-50/60 p-2.5">
          <div className="mb-1.5 flex items-center gap-1.5">
            <Tag className="h-3 w-3 text-gray-400" />
            <span className="text-[11px] font-semibold text-gray-500">시설 종류(분류)</span>
            <span className="text-[10px] text-gray-400">— 분류 미입력 항목에 일괄 적용</span>
          </div>
          <input
            value={bulkCategory}
            onChange={(e) => setBulkCategory(e.target.value)}
            list="facility-cat-list"
            placeholder="예: 어린이집 (선택)"
            className="h-8 w-full rounded-md border border-gray-200 bg-white px-2.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <div className="mt-1.5 flex flex-wrap gap-1">
            {categoryChips.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setBulkCategory((v) => (v.trim() === c ? "" : c))}
                className={`rounded-full border px-2 py-0.5 text-[11px] transition-colors ${
                  bulkCategory.trim() === c
                    ? "border-gray-900 bg-gray-900 text-white"
                    : "border-gray-200 bg-white text-gray-600 hover:border-gray-400"
                }`}
              >
                {c}
              </button>
            ))}
          </div>
        </div>

        {/* === 직접 입력 (다중 행) === */}
        {tab === "form" && (
          <div className="space-y-2">
            <p className="px-0.5 text-[10px] font-semibold text-gray-400">행마다 주소·시설명·분류 입력 (주소 필수)</p>
            {/* 입력 행들 — 주소는 한 줄, 시설명·분류는 아랫줄(좁은 패널·모바일 대응) */}
            <div className="space-y-2">
              {rows.map((r, i) => (
                <div key={i} className="space-y-1.5 rounded-lg bg-gray-50 p-2">
                  <div className="flex items-center gap-1.5">
                    <span className="w-4 shrink-0 text-center text-[10px] font-medium text-gray-400">{i + 1}</span>
                    <input
                      value={r.address}
                      onChange={(e) => setRow(i, { address: e.target.value })}
                      placeholder="주소 / 건물명 *"
                      className="h-8 min-w-0 flex-1 rounded-md border border-gray-200 bg-white px-2.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    />
                    {rows.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeRow(i)}
                        title="행 삭제"
                        className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-gray-300 hover:bg-gray-200 hover:text-red-500"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                  <div className="flex gap-1.5 pl-5">
                    <input
                      value={r.name}
                      onChange={(e) => setRow(i, { name: e.target.value })}
                      placeholder="시설명"
                      className="h-8 min-w-0 flex-1 rounded-md border border-gray-200 bg-white px-2.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    />
                    <input
                      value={r.category}
                      onChange={(e) => setRow(i, { category: e.target.value })}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && i === rows.length - 1 && r.address.trim()) addRow()
                      }}
                      list="facility-cat-list"
                      placeholder="분류"
                      className="h-8 min-w-0 flex-1 rounded-md border border-gray-200 bg-white px-2.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    />
                  </div>
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={addRow}
              className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700"
            >
              <Plus className="h-3.5 w-3.5" /> 행 추가
            </button>

            {/* 마커 스타일 (접이식) */}
            <div className="rounded-lg bg-gray-50 px-2.5 py-2">
              <button
                type="button"
                onClick={() => setShowStyle((v) => !v)}
                className="flex w-full items-center gap-2 text-xs text-gray-600"
              >
                <Sparkles className="h-3.5 w-3.5" /> 분류별 마커 스타일
                <span className="ml-auto text-gray-400">{showStyle ? "닫기" : "열기"}</span>
              </button>
              {showStyle && (
                <div className="mt-2 space-y-2">
                  <div className="flex items-center gap-2">
                    <ShapeIcon shape={curStyle.shape} color={curStyle.color} size={20} />
                    <input
                      value={styleCat}
                      onChange={(e) => setStyleCat(e.target.value)}
                      list="facility-cat-list"
                      placeholder="스타일을 바꿀 분류명"
                      className="h-8 flex-1 rounded-md border border-input bg-white px-2.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    />
                  </div>
                  {styleTarget ? (
                    <MarkerStylePicker value={curStyle} onChange={(s) => onSetCategoryStyle(styleTarget, s)} />
                  ) : (
                    <p className="text-[11px] text-gray-400">분류명을 입력하면 모양·색을 바꿀 수 있어요.</p>
                  )}
                </div>
              )}
            </div>

            <button
              onClick={() =>
                run(
                  applyBulk(
                    filledRows.map((r) => ({
                      address: r.address.trim(),
                      name: r.name.trim(),
                      category: r.category.trim(),
                      filters: r.category.trim() ? { 분류: r.category.trim() } : undefined,
                    })),
                  ),
                  (failed) => setRows(failed.length ? failed : [emptyRow(), emptyRow(), emptyRow()]),
                )
              }
              disabled={busy || filledRows.length === 0}
              className="flex h-9 w-full items-center justify-center gap-1.5 rounded-lg bg-gray-900 text-sm font-medium text-white transition-colors hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-30"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              {filledRows.length > 0 ? `${filledRows.length}개 ` : ""}시설 추가
            </button>
          </div>
        )}

        {/* === 엑셀 === */}
        {tab === "excel" && (
          <div className="space-y-3">
            <p className="text-xs leading-relaxed text-gray-500">
              ① 양식을 내려받거나 ② 갖고 있는 표를 그대로 업로드하세요. 주소·시설명·시설구분·행정동 컬럼을 자동 인식합니다.
            </p>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={downloadTemplate}
                className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-gray-200 bg-white text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
              >
                <FileDown className="h-4 w-4" /> 양식 다운로드
              </button>
              <button
                onClick={() => fileRef.current?.click()}
                className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-gray-200 bg-white text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
              >
                <FileUp className="h-4 w-4" /> 파일 선택
              </button>
              <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" onChange={handleFile} className="hidden" />
            </div>

            {excelRows.length > 0 && (
              <>
                <div className="rounded-lg border border-gray-200 px-3 py-2 text-xs text-gray-600">
                  <b>{excelName}</b> — {excelRows.length}건 인식 (분류 지정 {excelRows.filter((r) => r.category).length}건
                  {bulkCategory.trim() ? `, 나머지 '${bulkCategory.trim()}' 일괄` : ""})
                  <div className="mt-1 text-[11px] text-gray-400">{formatMappingSummary(excelMapping ?? undefined)}</div>
                </div>
                <button
                  onClick={() =>
                    run(applyBulk(excelRows), (failed) => {
                      if (failed.length) setExcelRows(failed)
                      else {
                        setExcelRows([])
                        setExcelName("")
                        setExcelMapping(null)
                      }
                    })
                  }
                  disabled={busy}
                  className="flex h-9 w-full items-center justify-center gap-1.5 rounded-lg bg-gray-900 text-sm font-medium text-white transition-colors hover:bg-gray-800 disabled:opacity-30"
                >
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileUp className="h-4 w-4" />} {excelRows.length}건 가져오기
                </button>
              </>
            )}
          </div>
        )}

        {/* === 붙여넣기 === */}
        {tab === "paste" && (
          <div className="space-y-2.5">
            <textarea
              value={paste}
              onChange={(e) => setPaste(e.target.value)}
              onKeyDown={handleTextareaKeyDown}
              placeholder={"엑셀에서 복사한 표를 그대로 붙여넣으세요. 컬럼 순서는 자동 인식됩니다.\n연번 [Tab] 시설명 [Tab] 주소 [Tab] 행정동\n\n1\t자양보건지소\t광진구 아차산로 400\t자양2동\n2\t세종대학교\t능동로 209\t군자동"}
              rows={5}
              className="w-full resize-y rounded-lg border border-input bg-background p-2.5 text-sm placeholder:text-muted-foreground/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            <p className="text-[11px] text-muted-foreground">Tab으로 칸 구분 · 칸 탈출은 Shift+Tab · 또는 띄어쓰기 2칸</p>
            {parsed.length > 0 && (
              <p className="text-[11px] text-gray-400">{formatMappingSummary(parsedPaste.mapping)}</p>
            )}
            {parsed.length > 0 && (
              <div className="max-h-32 overflow-y-auto rounded-lg border border-gray-200">
                <table className="w-full text-xs">
                  <tbody>
                    {parsed.map((r, i) => (
                      <tr key={i} className={`border-b border-gray-100 last:border-0 ${r.name ? "" : "bg-amber-50"}`}>
                        <td className="px-2 py-1 text-gray-700">{r.address}</td>
                        <td className="w-20 px-2 py-1 text-gray-700">{r.name || <span className="text-amber-600">미지정</span>}</td>
                        <td className="w-16 px-2 py-1 text-gray-500">
                          {r.category || (bulkCategory.trim() ? <span className="text-gray-400">{bulkCategory.trim()}</span> : "-")}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {parsed.some((r) => !r.name) && (
              <p className="text-[11px] text-amber-600">시설명 미지정 행은 입력 주소가 라벨로 쓰여요.</p>
            )}
            <button
              onClick={() =>
                run(applyBulk(parsed), (failed) =>
                  setPaste(failed.map((r) => [r.address, r.name, r.category].join("\t").replace(/\t+$/, "")).join("\n")),
                )
              }
              disabled={busy || parsed.length === 0}
              className="flex h-9 w-full items-center justify-center gap-1.5 rounded-lg bg-gray-900 text-sm font-medium text-white transition-colors hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-30"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <MapPin className="h-4 w-4" />} {parsed.length > 0 ? `${parsed.length}개 ` : ""}시설 추가
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
