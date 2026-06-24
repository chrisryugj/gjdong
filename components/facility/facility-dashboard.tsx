"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import {
  Camera,
  Download,
  Eye,
  EyeOff,
  Loader2,
  MapPin,
  Maximize,
  Plus,
  Tag,
  Trash2,
} from "lucide-react"
import { toast } from "sonner"
import FacilityMap from "@/components/facility/facility-map"
import {
  getCategoryColor,
  loadFacilities,
  mergeFacilities,
  saveFacilities,
  UNCATEGORIZED_COLOR,
  type Facility,
  type NewFacilityInput,
} from "@/lib/facility-storage"
import type { ResolvedDisplay } from "@/lib/types"

type ParsedRow = { address: string; name: string; category: string }
type BatchItem = ResolvedDisplay & { facilityName?: string }

const RESOLVE_CHUNK = 10

async function resolveRows(rows: ParsedRow[]): Promise<(BatchItem | null)[]> {
  const out: (BatchItem | null)[] = new Array(rows.length).fill(null)
  for (let i = 0; i < rows.length; i += RESOLVE_CHUNK) {
    const slice = rows.slice(i, i + RESOLVE_CHUNK)
    try {
      const res = await fetch("/api/resolve-address-batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          addresses: slice.map((r) => ({ address: r.address, facilityName: r.name || undefined })),
        }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      ;(data.results as BatchItem[]).forEach((r, j) => {
        out[i + j] = r
      })
    } catch {
      // 이 청크만 실패(null 유지) 처리하고 나머지는 계속 — 429 등으로 전체가 날아가지 않게
    }
  }
  return out
}

export default function FacilityDashboard() {
  const [facilities, setFacilities] = useState<Facility[]>([])
  const [inputValue, setInputValue] = useState("")
  const [isAdding, setIsAdding] = useState(false)
  const [showLabels, setShowLabels] = useState(true)
  const [focus, setFocus] = useState<{ id: string; tick: number } | null>(null)
  const [fitSignal, setFitSignal] = useState(0)
  const [activeCategory, setActiveCategory] = useState<string | null>(null)
  const skipFirstSaveRef = useRef(true)
  const mapWrapRef = useRef<HTMLDivElement>(null)

  // 마운트 시 localStorage 복원
  useEffect(() => {
    setFacilities(loadFacilities())
  }, [])

  // 변경 시 자동 저장 — 마운트 직후의 빈 배열 1회 저장은 건너뛰고(복원값 덮어쓰기 방지),
  // 메모 타이핑 등 잦은 변경은 디바운스해 매 키 입력당 동기 직렬화를 피한다.
  useEffect(() => {
    if (skipFirstSaveRef.current) {
      skipFirstSaveRef.current = false
      return
    }
    const t = setTimeout(() => saveFacilities(facilities), 400)
    return () => clearTimeout(t)
  }, [facilities])

  const parsedRows = useMemo<ParsedRow[]>(() => {
    return inputValue
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .map((line) => {
        // Tab이 있으면 Tab으로만 분리(엑셀 붙여넣기 안전) — 없을 때만 공백 2칸+ 규칙 적용
        const parts = (line.includes("\t") ? line.split("\t") : line.split(/\s{2,}/)).map((p) => p.trim())
        return { address: parts[0] || "", name: parts[1] || "", category: parts[2] || "" }
      })
      .filter((r) => r.address)
  }, [inputValue])

  // 분류별 집계 (필터 칩)
  const categoryCounts = useMemo(() => {
    const counts = new Map<string, number>()
    let uncategorized = 0
    for (const f of facilities) {
      const c = f.category?.trim()
      if (c) counts.set(c, (counts.get(c) ?? 0) + 1)
      else uncategorized++
    }
    return { entries: Array.from(counts.entries()), uncategorized }
  }, [facilities])

  const visibleFacilities = useMemo(() => {
    if (activeCategory === null) return facilities
    if (activeCategory === "__none__") return facilities.filter((f) => !f.category?.trim())
    return facilities.filter((f) => f.category?.trim() === activeCategory)
  }, [facilities, activeCategory])

  // 지도는 위치/이름/분류만 사용 — 메모 편집 등 지도와 무관한 변경 시 마커 재그리기/뷰 리셋을 막기 위해
  // 지도 관련 필드 시그니처가 바뀔 때만 새 배열 참조를 넘긴다.
  const mapSig = useMemo(
    () => visibleFacilities.map((f) => `${f.id}:${f.lat}:${f.lon}:${f.name}:${f.category ?? ""}`).join("|"),
    [visibleFacilities],
  )
  const mapFacilities = useMemo(() => visibleFacilities, [mapSig])

  const handleAdd = async () => {
    if (parsedRows.length === 0 || isAdding) return
    if (parsedRows.length > 300) {
      toast.error(`한 번에 최대 300건까지 추가할 수 있습니다 (현재 ${parsedRows.length}건)`)
      return
    }
    setIsAdding(true)
    try {
      const results = await resolveRows(parsedRows)
      const newInputs: NewFacilityInput[] = []
      let failed = 0
      results.forEach((r, i) => {
        if (!r || r.fallback) {
          failed++
          return
        }
        const m = r.meta
        newInputs.push({
          // 시설명 미입력 시 긴 표준주소(r.display) 대신 짧은 원입력을 라벨로 — 라벨·목록 가독성/중복 방지
          name: parsedRows[i].name || m.placeName || parsedRows[i].address,
          category: parsedRows[i].category || undefined,
          originalInput: parsedRows[i].address,
          address: r.display,
          road: m.roadName ? `${m.gu} ${m.roadName} ${m.buildingNo ?? ""}`.trim() : undefined,
          jibun: m.legalDong ? `${m.legalDong} ${m.jibunNo ?? ""}`.trim() : undefined,
          adminDong: m.adminDong,
          postalCode: m.postalCode,
          lat: m.lat,
          lon: m.lon,
        })
      })

      const { merged, added, skipped } = mergeFacilities(facilities, newInputs)
      setFacilities(merged)
      setInputValue("")

      const parts: string[] = []
      if (added) parts.push(`${added}개 추가`)
      if (skipped) parts.push(`중복 ${skipped}개 제외`)
      if (failed) parts.push(`변환 실패 ${failed}개`)
      if (added) toast.success(parts.join(" · "))
      else if (parts.length) toast.warning(parts.join(" · "))
      else toast.info("추가된 시설이 없습니다")
    } catch {
      toast.error("시설 변환 중 오류가 발생했습니다. 다시 시도해 주세요.")
    } finally {
      setIsAdding(false)
    }
  }

  const handleRemove = (id: string) => {
    setFacilities((prev) => prev.filter((f) => f.id !== id))
  }

  const handleMemoChange = (id: string, memo: string) => {
    setFacilities((prev) => prev.map((f) => (f.id === id ? { ...f, memo } : f)))
  }

  const handleClearAll = () => {
    if (facilities.length === 0) return
    if (!window.confirm(`저장된 시설 ${facilities.length}개를 모두 삭제할까요? 되돌릴 수 없습니다.`)) return
    setFacilities([])
    setActiveCategory(null)
    toast.success("모든 시설을 삭제했습니다")
  }

  const handleScreenshot = async () => {
    if (!mapWrapRef.current || facilities.length === 0) {
      toast.info("지도에 표시할 시설이 없습니다")
      return
    }
    try {
      const { toPng } = await import("html-to-image")
      // 이동 애니메이션·타일 로딩이 끝나도록 잠깐 대기 후 캡처 (회색 미완료 타일 방지)
      await new Promise((r) => setTimeout(r, 350))
      const dataUrl = await toPng(mapWrapRef.current, {
        pixelRatio: 2,
        filter: (node) =>
          !(node instanceof HTMLElement && node.classList?.contains("leaflet-control-zoom")),
      })
      const link = document.createElement("a")
      link.download = `시설지도_${new Date().toISOString().slice(0, 10)}.png`
      link.href = dataUrl
      link.click()
      toast.success("지도 스크린샷이 저장되었습니다")
    } catch {
      toast.error("스크린샷 생성 실패 — 브라우저 화면 캡처(⌘⇧4 / Win+Shift+S)를 이용해 주세요")
    }
  }

  const handleExcel = async () => {
    if (facilities.length === 0) {
      toast.info("내보낼 시설이 없습니다")
      return
    }
    const XLSX = await import("xlsx")
    const rows = facilities.map((f, i) => ({
      번호: i + 1,
      시설명: f.name,
      분류: f.category ?? "",
      입력주소: f.originalInput,
      표준주소: f.address,
      도로명주소: f.road ?? "",
      지번주소: f.jibun ?? "",
      행정동: f.adminDong ?? "",
      우편번호: f.postalCode ?? "",
      위도: f.lat,
      경도: f.lon,
      메모: f.memo ?? "",
    }))
    const ws = XLSX.utils.json_to_sheet(rows)
    ws["!cols"] = [
      { wch: 6 },
      { wch: 22 },
      { wch: 12 },
      { wch: 30 },
      { wch: 42 },
      { wch: 32 },
      { wch: 24 },
      { wch: 12 },
      { wch: 10 },
      { wch: 12 },
      { wch: 12 },
      { wch: 24 },
    ]
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, "시설목록")
    XLSX.writeFile(wb, `시설목록_${new Date().toISOString().slice(0, 10)}.xlsx`)
    toast.success("엑셀 파일이 저장되었습니다")
  }

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[380px_1fr] lg:items-start">
      {/* === 시설 추가 (모바일 1번째 / 데스크탑 좌상) === */}
      <div className="lg:col-start-1 lg:row-start-1">
        {/* 시설 추가 */}
        <div className="rounded-xl border bg-card shadow-sm">
          <div className="border-b px-4 py-2.5">
            <h2 className="flex items-center gap-1.5 text-sm font-semibold text-gray-900">
              <Plus className="h-4 w-4" /> 시설 추가
            </h2>
          </div>
          <div className="space-y-2.5 p-4">
            <textarea
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder={"주소 [Tab 또는 띄어쓰기 2칸] 시설명 [Tab] 분류\n\n예) 광진구 아차산로 400  자양보건지소  보건소\n예) 능동로 209  세종대학교  교육시설"}
              rows={4}
              className="w-full resize-y rounded-lg border border-input bg-background p-2.5 text-sm placeholder:text-muted-foreground/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            {parsedRows.length > 0 && (
              <div className="max-h-40 overflow-y-auto rounded-lg border border-gray-200">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-gray-50 text-gray-500">
                    <tr>
                      <th className="px-2 py-1 text-left font-semibold">주소</th>
                      <th className="w-20 px-2 py-1 text-left font-semibold">시설명</th>
                      <th className="w-16 px-2 py-1 text-left font-semibold">분류</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parsedRows.map((r, i) => (
                      <tr key={i} className={`border-t border-gray-100 ${r.name ? "" : "bg-amber-50"}`}>
                        <td className="px-2 py-1 text-gray-700">{r.address}</td>
                        <td className="px-2 py-1 text-gray-700">
                          {r.name || <span className="text-amber-600">미지정</span>}
                        </td>
                        <td className="px-2 py-1">
                          {r.category ? (
                            <span
                              className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium text-white"
                              style={{ backgroundColor: getCategoryColor(r.category) }}
                            >
                              {r.category}
                            </span>
                          ) : (
                            <span className="text-gray-300">-</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {parsedRows.some((r) => !r.name) && (
              <p className="text-[11px] text-amber-600">
                시설명 미지정 행은 입력 주소가 라벨로 쓰여요. 주소 뒤에 <b>Tab</b>(또는 띄어쓰기 2칸)으로 시설명을 붙이세요.
              </p>
            )}
            <button
              onClick={handleAdd}
              disabled={isAdding || parsedRows.length === 0}
              className="flex h-9 w-full items-center justify-center gap-1.5 rounded-lg bg-gray-900 text-sm font-medium text-white transition-colors hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-30"
            >
              {isAdding ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> 변환 중...
                </>
              ) : (
                <>
                  <Plus className="h-4 w-4" /> {parsedRows.length > 0 ? `${parsedRows.length}개 ` : ""}시설 추가
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* === 지도 + 툴바 (모바일 2번째 / 데스크탑 우측 전체높이) === */}
      <div className="space-y-3 lg:col-start-2 lg:row-start-1 lg:row-span-2">
        <div className="flex flex-wrap items-center gap-2">
          <ToolbarButton onClick={() => setShowLabels((v) => !v)} active={showLabels}>
            {showLabels ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />} 라벨
          </ToolbarButton>
          <ToolbarButton onClick={() => setFitSignal((n) => n + 1)}>
            <Maximize className="h-4 w-4" /> 전체보기
          </ToolbarButton>
          <div className="flex-1" />
          <ToolbarButton onClick={handleScreenshot}>
            <Camera className="h-4 w-4" /> 스크린샷
          </ToolbarButton>
          <ToolbarButton onClick={handleExcel}>
            <Download className="h-4 w-4" /> 엑셀
          </ToolbarButton>
        </div>

        <div className="h-[560px] overflow-hidden rounded-xl border bg-card shadow-sm">
          <FacilityMap
            ref={mapWrapRef}
            facilities={mapFacilities}
            showLabels={showLabels}
            focus={focus}
            fitSignal={fitSignal}
          />
        </div>
      </div>

      {/* === 시설 목록 (모바일 3번째 / 데스크탑 좌하) === */}
      <div className="lg:col-start-1 lg:row-start-2">
        {/* 시설 목록 */}
        <div className="rounded-xl border bg-card shadow-sm">
          <div className="flex items-center justify-between border-b px-4 py-2.5">
            <h2 className="flex items-center gap-1.5 text-sm font-semibold text-gray-900">
              <Tag className="h-4 w-4" /> 시설 목록
              <span className="text-xs font-normal text-muted-foreground">({facilities.length})</span>
            </h2>
            {facilities.length > 0 && (
              <button onClick={handleClearAll} className="text-[11px] text-gray-400 hover:text-red-500">
                전체삭제
              </button>
            )}
          </div>

          {/* 분류 필터 */}
          {(categoryCounts.entries.length > 0 || categoryCounts.uncategorized > 0) && (
            <div className="flex flex-wrap gap-1.5 border-b px-4 py-2">
              <FilterChip active={activeCategory === null} onClick={() => setActiveCategory(null)} label={`전체 ${facilities.length}`} />
              {categoryCounts.entries.map(([cat, count]) => (
                <FilterChip
                  key={cat}
                  active={activeCategory === cat}
                  onClick={() => setActiveCategory(cat)}
                  label={`${cat} ${count}`}
                  color={getCategoryColor(cat)}
                />
              ))}
              {categoryCounts.uncategorized > 0 && (
                <FilterChip
                  active={activeCategory === "__none__"}
                  onClick={() => setActiveCategory("__none__")}
                  label={`미분류 ${categoryCounts.uncategorized}`}
                  color={UNCATEGORIZED_COLOR}
                />
              )}
            </div>
          )}

          <div className="max-h-[460px] divide-y divide-gray-100 overflow-y-auto">
            {visibleFacilities.length === 0 ? (
              <div className="px-4 py-10 text-center text-sm text-muted-foreground">
                {facilities.length === 0 ? "아직 등록된 시설이 없습니다." : "해당 분류의 시설이 없습니다."}
              </div>
            ) : (
              visibleFacilities.map((f) => (
                <div key={f.id} className="group px-4 py-2.5 hover:bg-gray-50">
                  <div className="flex items-start gap-2">
                    <span
                      className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: getCategoryColor(f.category) }}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="truncate text-sm font-semibold text-gray-900">{f.name}</span>
                        {f.category && (
                          <span className="shrink-0 rounded bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-500">{f.category}</span>
                        )}
                      </div>
                      <p className="truncate text-xs text-gray-500">{f.address || f.originalInput}</p>
                      <input
                        value={f.memo ?? ""}
                        onChange={(e) => handleMemoChange(f.id, e.target.value)}
                        placeholder="메모 (담당자·점검일 등)"
                        className="mt-1 w-full border-0 border-b border-transparent bg-transparent px-0 py-0.5 text-[11px] text-gray-600 placeholder:text-gray-300 focus:border-gray-300 focus:outline-none"
                      />
                    </div>
                    <div className="flex shrink-0 items-center gap-0.5">
                      <button
                        onClick={() => setFocus({ id: f.id, tick: Date.now() })}
                        title="지도에서 보기"
                        className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-blue-600"
                      >
                        <MapPin className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => handleRemove(f.id)}
                        title="삭제"
                        className="rounded p-1 text-gray-400 opacity-0 transition-opacity hover:bg-gray-100 hover:text-red-500 group-hover:opacity-100"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function FilterChip({
  active,
  onClick,
  label,
  color,
}: {
  active: boolean
  onClick: () => void
  label: string
  color?: string
}) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-medium transition-colors ${
        active ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-500 hover:bg-gray-200"
      }`}
    >
      {color && <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />}
      {label}
    </button>
  )
}

function ToolbarButton({
  onClick,
  active,
  children,
}: {
  onClick: () => void
  active?: boolean
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex h-8 items-center gap-1.5 rounded-lg border px-3 text-xs font-medium transition-colors ${
        active
          ? "border-gray-900 bg-gray-900 text-white"
          : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
      }`}
    >
      {children}
    </button>
  )
}
