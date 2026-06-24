"use client"

import { useMemo, useRef, useState } from "react"
import { FileDown, FileUp, Loader2, MapPin, Plus, Sparkles } from "lucide-react"
import { toast } from "sonner"
import MarkerStylePicker, { ShapeIcon } from "@/components/facility/marker-style-picker"
import { resolveStyle, type CategoryStyle } from "@/lib/facility-markers"
import type { ParsedRow } from "@/lib/facility-storage"

type Tab = "form" | "excel" | "paste"
type AddResult = { added: number; skipped: number; failed: number }

interface Props {
  existingCategories: string[]
  styles: Record<string, CategoryStyle>
  onSetCategoryStyle: (category: string, style: CategoryStyle) => void
  onAdd: (rows: ParsedRow[]) => Promise<AddResult>
}

// 한 줄 → 주소/시설명/분류 (Tab 우선, 없으면 공백 2칸+)
function parseLines(text: string): ParsedRow[] {
  return text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((line) => {
      const parts = (line.includes("\t") ? line.split("\t") : line.split(/\s{2,}/)).map((p) => p.trim())
      return { address: parts[0] || "", name: parts[1] || "", category: parts[2] || "" }
    })
    .filter((r) => r.address)
}

export default function FacilityAdd({ existingCategories, styles, onSetCategoryStyle, onAdd }: Props) {
  const [tab, setTab] = useState<Tab>("form")
  const [busy, setBusy] = useState(false)

  // 직접입력
  const [addr, setAddr] = useState("")
  const [fname, setFname] = useState("")
  const [cat, setCat] = useState("")
  const [showPicker, setShowPicker] = useState(false)
  const trimmedCat = cat.trim()
  const curStyle = resolveStyle(trimmedCat || undefined, styles)

  // 붙여넣기
  const [paste, setPaste] = useState("")
  const parsed = useMemo(() => parseLines(paste), [paste])

  // 엑셀
  const [excelRows, setExcelRows] = useState<ParsedRow[]>([])
  const [excelName, setExcelName] = useState("")
  const fileRef = useRef<HTMLInputElement>(null)

  const run = async (rows: ParsedRow[], onDone: () => void) => {
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
      if (r.added > 0) onDone()
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
      const headers = (aoa[0] as unknown[]).map((h) => String(h ?? "").trim())
      const findCol = (...keys: string[]) => headers.findIndex((h) => keys.some((k) => h.includes(k)))
      let ai = findCol("주소", "소재지", "address")
      let ni = findCol("시설명", "name")
      let ci = findCol("분류", "유형", "구분", "category", "type")
      let dataRows = aoa.slice(1)
      if (ai === -1) {
        // 인식 가능한 헤더가 없으면 1열=주소,2열=시설명,3열=분류로 가정하고 첫 줄도 데이터로
        ai = 0
        ni = 1
        ci = 2
        dataRows = aoa
      }
      const rows = (dataRows as unknown[][])
        .map((r) => ({
          address: String(r[ai] ?? "").trim(),
          name: ni >= 0 ? String(r[ni] ?? "").trim() : "",
          category: ci >= 0 ? String(r[ci] ?? "").trim() : "",
        }))
        .filter((r) => r.address)
      if (rows.length === 0) {
        toast.error("주소 열을 찾지 못했습니다. 양식의 '주소' 열을 확인하세요")
        return
      }
      setExcelRows(rows)
      setExcelName(file.name)
      toast.success(`${file.name} — ${rows.length}건 인식됨. '가져오기'를 누르세요`)
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
        {/* === 직접 입력 === */}
        {tab === "form" && (
          <div className="space-y-2.5">
            <div>
              <label className="mb-1 block text-[11px] font-semibold text-gray-500">주소 또는 건물명 *</label>
              <input
                value={addr}
                onChange={(e) => setAddr(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && run([{ address: addr, name: fname, category: cat }], () => { setAddr(""); setFname("") })}
                placeholder="예) 광진구 아차산로 400 / 세종대학교"
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="mb-1 block text-[11px] font-semibold text-gray-500">시설명</label>
                <input
                  value={fname}
                  onChange={(e) => setFname(e.target.value)}
                  placeholder="예) 자양보건지소"
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-semibold text-gray-500">분류</label>
                <input
                  value={cat}
                  onChange={(e) => setCat(e.target.value)}
                  list="facility-cat-list"
                  placeholder="예) 보건소"
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
                <datalist id="facility-cat-list">
                  {existingCategories.map((c) => (
                    <option key={c} value={c} />
                  ))}
                </datalist>
              </div>
            </div>

            {/* 마커 스타일 */}
            <div className="flex items-center gap-2 rounded-lg bg-gray-50 px-2.5 py-2">
              <ShapeIcon shape={curStyle.shape} color={curStyle.color} size={22} />
              <span className="text-xs text-gray-500">
                {trimmedCat ? `'${trimmedCat}' 마커` : "분류 입력 시 마커 모양·색 지정 가능"}
              </span>
              <button
                type="button"
                disabled={!trimmedCat}
                onClick={() => setShowPicker((v) => !v)}
                className="ml-auto inline-flex items-center gap-1 rounded-md border border-gray-200 bg-white px-2 py-1 text-[11px] font-medium text-gray-600 transition-colors hover:bg-gray-50 disabled:opacity-40"
              >
                <Sparkles className="h-3 w-3" /> 스타일
              </button>
            </div>
            {showPicker && trimmedCat && (
              <MarkerStylePicker value={curStyle} onChange={(s) => onSetCategoryStyle(trimmedCat, s)} />
            )}

            <button
              onClick={() => run([{ address: addr, name: fname, category: cat }], () => { setAddr(""); setFname("") })}
              disabled={busy || !addr.trim()}
              className="flex h-9 w-full items-center justify-center gap-1.5 rounded-lg bg-gray-900 text-sm font-medium text-white transition-colors hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-30"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} 시설 추가
            </button>
          </div>
        )}

        {/* === 엑셀 === */}
        {tab === "excel" && (
          <div className="space-y-3">
            <p className="text-xs leading-relaxed text-gray-500">
              ① 양식을 내려받아 <b>주소·시설명·분류</b>를 채우고 ② 파일을 업로드하면 일괄 등록됩니다.
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
                  <b>{excelName}</b> — {excelRows.length}건 인식 (분류 지정 {excelRows.filter((r) => r.category).length}건)
                </div>
                <button
                  onClick={() => run(excelRows, () => { setExcelRows([]); setExcelName("") })}
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
              placeholder={"엑셀에서 복사한 표를 그대로 붙여넣거나 직접 입력\n주소 [Tab] 시설명 [Tab] 분류\n\n광진구 아차산로 400\t자양보건지소\t보건소\n능동로 209\t세종대학교\t교육시설"}
              rows={5}
              className="w-full resize-y rounded-lg border border-input bg-background p-2.5 text-sm placeholder:text-muted-foreground/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            <p className="text-[11px] text-muted-foreground">Tab으로 칸 구분 · 칸 탈출은 Shift+Tab · 또는 띄어쓰기 2칸</p>
            {parsed.length > 0 && (
              <div className="max-h-32 overflow-y-auto rounded-lg border border-gray-200">
                <table className="w-full text-xs">
                  <tbody>
                    {parsed.map((r, i) => (
                      <tr key={i} className={`border-b border-gray-100 last:border-0 ${r.name ? "" : "bg-amber-50"}`}>
                        <td className="px-2 py-1 text-gray-700">{r.address}</td>
                        <td className="w-20 px-2 py-1 text-gray-700">{r.name || <span className="text-amber-600">미지정</span>}</td>
                        <td className="w-16 px-2 py-1 text-gray-500">{r.category || "-"}</td>
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
              onClick={() => run(parsed, () => setPaste(""))}
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
