"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import {
  ArrowDownAZ,
  Camera,
  Download,
  Eye,
  EyeOff,
  FileText,
  Filter,
  GripVertical,
  Layers,
  MapPin,
  Maximize,
  Minimize,
  PanelLeft,
  PanelLeftClose,
  Plus,
  Search,
  Tag,
  Trash2,
} from "lucide-react"
import { toast } from "sonner"
import FacilityMap from "@/components/facility/facility-map"
import FacilityAdd from "@/components/facility/facility-add"
import FacilitySetsModal from "@/components/facility/facility-sets-modal"
import type { FacilitySet } from "@/lib/facility-sets"
import { ShapeIcon } from "@/components/facility/marker-style-picker"
import {
  loadFacilities,
  mergeFacilities,
  saveFacilities,
  STORAGE_KEY,
  facilityDisplayName,
  type Facility,
  type NewFacilityInput,
  type ParsedRow,
} from "@/lib/facility-storage"
import {
  loadCategoryOrder,
  loadStyles,
  orderCategories,
  resolveStyle,
  saveCategoryOrder,
  saveStyles,
  type CategoryStyle,
} from "@/lib/facility-markers"
import { buildReportHtml } from "@/lib/facility-report"
import type { ResolvedDisplay } from "@/lib/types"

type BatchItem = ResolvedDisplay & { facilityName?: string }

const RESOLVE_CHUNK = 10
const FILTER_LABEL_PRIORITY = ["시설구분", "분류", "구분", "유형", "종류", "행정동"]

async function resolveRows(
  rows: ParsedRow[],
  onProgress?: (done: number, total: number) => void,
  signal?: AbortSignal,
): Promise<(BatchItem | null)[]> {
  const out: (BatchItem | null)[] = new Array(rows.length).fill(null)
  for (let i = 0; i < rows.length; i += RESOLVE_CHUNK) {
    if (signal?.aborted) break // 사용자가 취소하면 남은 청크 중단
    const slice = rows.slice(i, i + RESOLVE_CHUNK)
    try {
      const res = await fetch("/api/resolve-address-batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          addressOnly: true, // 주소 검색만 — 시설명/이름으로 인한 전국 동명시설 오매칭 방지
          addresses: slice.map((r) => ({ address: r.address, facilityName: r.name || undefined })),
        }),
        signal,
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      ;(data.results as BatchItem[]).forEach((r, j) => {
        out[i + j] = r
      })
    } catch {
      // 취소면 즉시 종료, 아니면 이 청크만 실패(null 유지)하고 계속 — 429 등으로 전체가 날아가지 않게
      if (signal?.aborted) break
    }
    onProgress?.(Math.min(i + RESOLVE_CHUNK, rows.length), rows.length)
  }
  return out
}

// 입력 주소 정규화 — 재import 사전 중복 판정용(공백 차이 무시)
function normInput(s: string): string {
  return s.trim().replace(/\s+/g, " ")
}

// 엑셀/CSV formula injection 방지 — 수식 트리거 문자로 시작하는 셀 앞에 작은따옴표를 붙여 텍스트로 강제
function csvSafe(v: string): string {
  return /^[=+\-@\t\r]/.test(v) ? `'${v}` : v
}

function getFacilityFilterMap(facility: Facility): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [label, value] of Object.entries(facility.filters ?? {})) {
    const cleanLabel = label.trim()
    const cleanValue = String(value ?? "").trim()
    if (cleanLabel && cleanValue) out[cleanLabel] = cleanValue
  }
  if (Object.keys(out).length === 0 && facility.category?.trim()) {
    out["분류"] = facility.category.trim()
  }
  if (facility.adminDong?.trim() && !out["행정동"]) {
    out["행정동"] = facility.adminDong.trim()
  }
  return out
}

function filterLabelRank(label: string): number {
  const idx = FILTER_LABEL_PRIORITY.findIndex((item) => label.includes(item))
  return idx >= 0 ? idx : FILTER_LABEL_PRIORITY.length
}

function normalizeSearchText(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ")
}

function facilityMatchesSearch(facility: Facility, query: string): boolean {
  const terms = normalizeSearchText(query).split(" ").filter(Boolean)
  if (terms.length === 0) return true

  const filters = getFacilityFilterMap(facility)
  const haystack = normalizeSearchText(
    [
      facility.serialNo,
      facility.name,
      facilityDisplayName(facility),
      facility.category,
      facility.originalInput,
      facility.address,
      facility.road,
      facility.jibun,
      facility.adminDong,
      facility.postalCode,
      facility.memo,
      ...Object.entries(filters).flat(),
    ]
      .filter(Boolean)
      .join(" "),
  )

  return terms.every((term) => haystack.includes(term))
}

export default function FacilityDashboard() {
  const [facilities, setFacilities] = useState<Facility[]>([])
  const [styles, setStyles] = useState<Record<string, CategoryStyle>>({})
  const [showLabels, setShowLabels] = useState(true)
  const [focus, setFocus] = useState<{ id: string; tick: number } | null>(null)
  const [mapResizeSignal, setMapResizeSignal] = useState(0)
  const [selectedCats, setSelectedCats] = useState<Set<string>>(new Set())
  const [selectedFilters, setSelectedFilters] = useState<Record<string, string>>({})
  const [searchQuery, setSearchQuery] = useState("")
  // 분류 칩 표시 순서(드래그/가나다순) + 드래그 상태
  const [categoryOrder, setCategoryOrder] = useState<string[]>([])
  const [dragCat, setDragCat] = useState<string | null>(null)
  const [dragOverCat, setDragOverCat] = useState<string | null>(null)
  const skipFirstOrderSaveRef = useRef(true)
  const didDragRef = useRef(false)
  // 좌측 사이드패널 — [시설추가 | 목록] 탭 전환 + 접기(지도 풀폭)
  const [panelTab, setPanelTab] = useState<"add" | "list">("add")
  const [panelCollapsed, setPanelCollapsed] = useState(false)
  const skipFirstSaveRef = useRef(true)
  const skipFirstStyleSaveRef = useRef(true)
  const mapWrapRef = useRef<HTMLDivElement>(null)
  const mapSectionRef = useRef<HTMLDivElement>(null)
  // 최신 facilities를 ref로도 보관 — 언마운트 시 보류 중이던 저장을 flush하기 위함
  const facilitiesRef = useRef(facilities)
  facilitiesRef.current = facilities
  const restoredRef = useRef(false)
  const saveFailedRef = useRef(false)
  const [exporting, setExporting] = useState(false)
  const [isMapFullscreen, setIsMapFullscreen] = useState(false)
  const [setsModalOpen, setSetsModalOpen] = useState(false)

  // 마운트 시 localStorage 복원
  useEffect(() => {
    setFacilities(loadFacilities())
    setStyles(loadStyles())
    setCategoryOrder(loadCategoryOrder())
    restoredRef.current = true
  }, [])

  useEffect(() => {
    const onFullscreenChange = () => {
      setIsMapFullscreen(document.fullscreenElement === mapSectionRef.current)
      setMapResizeSignal((n) => n + 1)
      window.setTimeout(() => setMapResizeSignal((n) => n + 1), 120)
    }
    document.addEventListener("fullscreenchange", onFullscreenChange)
    return () => document.removeEventListener("fullscreenchange", onFullscreenChange)
  }, [])

  // 변경 시 자동 저장 — 마운트 직후의 빈 값 1회 저장은 건너뛰고(복원값 덮어쓰기 방지),
  // 메모 타이핑 등 잦은 변경은 디바운스해 매 키 입력당 동기 직렬화를 피한다.
  // 저장 실패(quota 초과)는 조용히 삼키지 않고 사용자에게 알린다.
  useEffect(() => {
    if (skipFirstSaveRef.current) {
      skipFirstSaveRef.current = false
      return
    }
    const t = setTimeout(() => {
      const ok = saveFacilities(facilities)
      if (!ok && !saveFailedRef.current) {
        saveFailedRef.current = true
        toast.error("브라우저 저장 공간이 부족합니다 — 일부 시설을 삭제하거나 엑셀로 내보낸 뒤 정리하세요")
      } else if (ok) {
        saveFailedRef.current = false
      }
    }, 400)
    return () => clearTimeout(t)
  }, [facilities])

  // 언마운트 시 보류 중이던 마지막 변경을 즉시 저장 (디바운스 trailing edge 유실 방지)
  useEffect(() => {
    return () => {
      if (restoredRef.current) saveFacilities(facilitiesRef.current)
    }
  }, [])

  // 다른 탭이 시설 목록을 갱신하면 감지해 병합 — stale 배열 blind overwrite로 추가분이 유실되는 것 방지.
  // 양쪽 추가분을 모두 보존(union by id)하고, 변화가 없으면 기존 참조를 유지해 저장 핑퐁을 막는다.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== STORAGE_KEY) return
      const incoming = loadFacilities()
      setFacilities((cur) => {
        const byId = new Map(incoming.map((f) => [f.id, f]))
        let changed = incoming.length !== cur.length
        for (const f of cur) {
          if (!byId.has(f.id)) {
            byId.set(f.id, f)
            changed = true
          }
        }
        return changed ? Array.from(byId.values()) : cur
      })
    }
    window.addEventListener("storage", onStorage)
    return () => window.removeEventListener("storage", onStorage)
  }, [])

  useEffect(() => {
    if (skipFirstStyleSaveRef.current) {
      skipFirstStyleSaveRef.current = false
      return
    }
    saveStyles(styles)
  }, [styles])

  useEffect(() => {
    if (skipFirstOrderSaveRef.current) {
      skipFirstOrderSaveRef.current = false
      return
    }
    saveCategoryOrder(categoryOrder)
  }, [categoryOrder])

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

  // 사용자가 정한 순서(드래그/가나다순)를 적용한 분류 목록 — 칩·지도 범례 공용
  const orderedCategories = useMemo(() => {
    const countByCat = new Map(categoryCounts.entries)
    const cats = orderCategories(Array.from(countByCat.keys()), categoryOrder)
    return cats.map((cat) => [cat, countByCat.get(cat) ?? 0] as [string, number])
  }, [categoryCounts, categoryOrder])

  // 분류 다중선택 필터 (빈 Set = 전체 표시). 키: 분류명 또는 "__none__"(미분류)
  const visibleFacilities = useMemo(() => {
    const activeFilters = Object.entries(selectedFilters).filter(([, value]) => value)
    return facilities.filter((f) => {
      if (!facilityMatchesSearch(f, searchQuery)) return false
      if (selectedCats.size > 0 && !selectedCats.has(f.category?.trim() || "__none__")) return false
      if (activeFilters.length === 0) return true

      const filters = getFacilityFilterMap(f)
      return activeFilters.every(([label, value]) => filters[label] === value)
    })
  }, [facilities, searchQuery, selectedCats, selectedFilters])

  const dynamicFilterOptions = useMemo(() => {
    const byLabel = new Map<string, Map<string, number>>()
    for (const facility of facilities) {
      const filters = getFacilityFilterMap(facility)
      for (const [label, value] of Object.entries(filters)) {
        const values = byLabel.get(label) ?? new Map<string, number>()
        values.set(value, (values.get(value) ?? 0) + 1)
        byLabel.set(label, values)
      }
    }

    return Array.from(byLabel.entries())
      .map(([label, values]) => ({
        label,
        values: Array.from(values.entries()).sort(([a], [b]) => a.localeCompare(b, "ko")),
      }))
      .filter((option) => option.values.length >= 2 || selectedFilters[option.label])
      .sort((a, b) => filterLabelRank(a.label) - filterLabelRank(b.label) || a.label.localeCompare(b.label, "ko"))
  }, [facilities, selectedFilters])

  const activeFilterCount = useMemo(
    () => selectedCats.size + Object.values(selectedFilters).filter(Boolean).length + (searchQuery.trim() ? 1 : 0),
    [searchQuery, selectedCats, selectedFilters],
  )
  const hasSearchQuery = searchQuery.trim().length > 0

  const toggleCat = (key: string) =>
    setSelectedCats((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })

  // 드래그로 분류 칩 순서 변경 — 현재 표시 순서를 기준으로 from→to 위치 이동 후 전체 순서를 영속화
  const reorderCategory = (from: string, to: string) => {
    if (from === to) return
    const cats = orderedCategories.map(([c]) => c)
    const fromIdx = cats.indexOf(from)
    const toIdx = cats.indexOf(to)
    if (fromIdx < 0 || toIdx < 0) return
    const next = [...cats]
    next.splice(fromIdx, 1)
    next.splice(toIdx, 0, from)
    setCategoryOrder(next)
  }

  // 가나다순 정렬
  const sortCategoriesAlpha = () =>
    setCategoryOrder(orderedCategories.map(([c]) => c).sort((a, b) => a.localeCompare(b, "ko")))

  const setDynamicFilter = (label: string, value: string) =>
    setSelectedFilters((prev) => {
      const next = { ...prev }
      if (value) next[label] = value
      else delete next[label]
      return next
    })

  const clearAllFilters = () => {
    setSelectedCats(new Set())
    setSelectedFilters({})
    setSearchQuery("")
  }

  // 세트 불러오기 — 교체(현재 통째 대체) 또는 병합(중복 시설명+좌표 제외하고 추가)
  const handleLoadSet = (set: FacilitySet, mode: "merge" | "replace") => {
    if (mode === "replace") {
      setFacilities(set.facilities)
      setStyles(set.styles)
      setCategoryOrder(set.categoryOrder)
      setSelectedCats(new Set())
      toast.success(`'${set.name}' 세트를 불러왔습니다 (${set.facilities.length}개)`)
      return
    }
    const { merged, added, skipped } = mergeFacilities(facilities, set.facilities)
    setFacilities(merged)
    setStyles((prev) => ({ ...set.styles, ...prev })) // 기존 사용자 지정 스타일 우선
    setCategoryOrder((prev) => [...prev, ...set.categoryOrder.filter((c) => !prev.includes(c))])
    toast.success(`'${set.name}' 병합: ${added}개 추가${skipped ? `, ${skipped}개 중복 제외` : ""}`)
  }

  const toggleMapFullscreen = async () => {
    const target = mapSectionRef.current
    if (!target) return

    try {
      if (document.fullscreenElement === target) {
        await document.exitFullscreen()
      } else {
        await target.requestFullscreen()
      }
    } catch {
      toast.error("전체화면 전환을 사용할 수 없습니다")
    }
  }

  // 지도는 위치/이름/분류만 사용 — 메모 편집 등 지도와 무관한 변경 시 마커 재그리기/뷰 리셋을 막기 위해
  // 지도 관련 필드 시그니처가 바뀔 때만 새 배열 참조를 넘긴다.
  const mapSig = useMemo(
    () => visibleFacilities.map((f) => `${f.id}:${f.serialNo ?? ""}:${f.lat}:${f.lon}:${f.name}:${f.category ?? ""}`).join("|"),
    [visibleFacilities],
  )
  const mapFacilities = useMemo(() => visibleFacilities, [mapSig])

  // 입력(직접/엑셀/붙여넣기) → 변환 → 병합 저장. 결과 카운트를 FacilityAdd에 반환.
  const addFacilities = async (
    rows: ParsedRow[],
  ): Promise<{ added: number; skipped: number; failed: number; failedRows: ParsedRow[] }> => {
    // 1) 재import 사전 필터 — 이미 등록된 (입력주소+시설명) 조합은 지오코딩 호출 없이 건너뛴다.
    //    시설명이 있을 때만 사전 스킵(빈 이름은 저장 시 폴백명이 달라져 매칭이 불확실 → mergeFacilities에 위임).
    const existingKeys = new Set(facilities.map((f) => `${normInput(f.originalInput)}__${f.name.trim()}`))
    const fresh: ParsedRow[] = []
    let preSkipped = 0
    for (const row of rows) {
      if (row.name.trim() && existingKeys.has(`${normInput(row.address)}__${row.name.trim()}`)) {
        preSkipped++
        continue
      }
      fresh.push(row)
    }
    if (fresh.length === 0) {
      toast.info(preSkipped ? `이미 등록된 ${preSkipped}개 — 추가할 새 시설이 없습니다` : "추가할 주소가 없습니다")
      return { added: 0, skipped: preSkipped, failed: 0, failedRows: [] }
    }

    // 2) 대량 변환은 청크 단위 진행률 + 취소 액션을 실시간 토스트로 노출(소량은 깜빡임 방지로 생략)
    const showProgress = fresh.length > RESOLVE_CHUNK
    const controller = new AbortController()
    const cancelAction = { label: "취소", onClick: () => controller.abort() }
    const progressId = showProgress
      ? toast.loading(`주소 변환 중… 0/${fresh.length}`, { action: cancelAction })
      : undefined
    try {
      const results = await resolveRows(
        fresh,
        (done, total) => {
          if (showProgress) toast.loading(`주소 변환 중… ${done}/${total}`, { id: progressId, action: cancelAction })
        },
        controller.signal,
      )
      if (progressId !== undefined) toast.dismiss(progressId)

      const newInputs: NewFacilityInput[] = []
      const failedRows: ParsedRow[] = []
      // 연번은 기존 시설·새 항목 통틀어 중복되지 않게 부여한다 — 가져온 표의 연번은
      // 충돌하지 않을 때만 보존하고, 비었거나 겹치면 다음 빈 번호로 자동 채운다.
      const usedSerials = new Set(
        facilities.map((f) => f.serialNo?.trim()).filter((s): s is string => Boolean(s)),
      )
      let serialSeed = facilities.length
      const nextSerial = () => {
        let n = serialSeed + 1
        while (usedSerials.has(String(n))) n += 1
        serialSeed = n
        return String(n)
      }
      results.forEach((r, i) => {
        // fallback이라도 partial(좌표 유효)이면 살린다. 좌표가 깨졌거나 진짜 실패면 입력을 보존해 재시도 가능하게.
        if (!r || (r.fallback && !r.partial) || !Number.isFinite(r.meta.lat) || !Number.isFinite(r.meta.lon)) {
          failedRows.push(fresh[i])
          return
        }
        const m = r.meta
        const rowFilters =
          fresh[i].filters && Object.keys(fresh[i].filters).length > 0
            ? fresh[i].filters
            : fresh[i].category
              ? { 분류: fresh[i].category }
              : undefined
        const importedSerial = fresh[i].serialNo?.trim()
        const serialNo = importedSerial && !usedSerials.has(importedSerial) ? importedSerial : nextSerial()
        usedSerials.add(serialNo)
        newInputs.push({
          // 시설명 미입력 시 긴 표준주소(r.display) 대신 짧은 원입력을 라벨로
          serialNo,
          name: fresh[i].name || m.placeName || fresh[i].address,
          category: fresh[i].category || undefined,
          filters: rowFilters,
          originalInput: fresh[i].address,
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
      if (added) {
        setFacilities(merged)
        setPanelTab("list") // 추가 직후엔 목록·지도로 자연스럽게 전환
      }

      const failed = failedRows.length
      const totalSkipped = skipped + preSkipped
      const parts: string[] = []
      if (controller.signal.aborted) parts.push("취소됨")
      if (added) parts.push(`${added}개 추가`)
      if (totalSkipped) parts.push(`중복 ${totalSkipped}개 제외`)
      if (failed) parts.push(`변환 실패 ${failed}개`)
      const msg = parts.join(" · ") || "추가된 시설이 없습니다"
      if (added) toast.success(msg)
      else if (parts.length) toast.warning(msg)
      else toast.info(msg)
      return { added, skipped: totalSkipped, failed, failedRows }
    } catch {
      if (progressId !== undefined) toast.dismiss(progressId)
      toast.error("시설 변환 중 오류가 발생했습니다. 다시 시도해 주세요.")
      return { added: 0, skipped: 0, failed: rows.length, failedRows: rows }
    }
  }

  const setCategoryStyle = (category: string, style: CategoryStyle) => {
    setStyles((prev) => ({ ...prev, [category]: style }))
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
    setSelectedCats(new Set())
    setSelectedFilters({})
    toast.success("모든 시설을 삭제했습니다")
  }

  const handleScreenshot = async () => {
    if (exporting) return
    if (!mapWrapRef.current || facilities.length === 0) {
      toast.info("지도에 표시할 시설이 없습니다")
      return
    }
    setExporting(true)
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
    } finally {
      setExporting(false)
    }
  }

  const handleExcel = async () => {
    if (exporting) return
    if (facilities.length === 0) {
      toast.info("내보낼 시설이 없습니다")
      return
    }
    setExporting(true)
    try {
      const XLSX = await import("xlsx")
      const filterLabels = dynamicFilterOptions
        .map((option) => option.label)
        .filter((label) => label !== "분류" && label !== "행정동")
      const rows = facilities.map((f, i) => ({
        연번: csvSafe(f.serialNo ?? String(i + 1)),
        시설명: csvSafe(f.name),
        분류: csvSafe(f.category ?? ""),
        ...Object.fromEntries(filterLabels.map((label) => [label, csvSafe(getFacilityFilterMap(f)[label] ?? "")])),
        입력주소: csvSafe(f.originalInput),
        표준주소: csvSafe(f.address),
        도로명주소: csvSafe(f.road ?? ""),
        지번주소: csvSafe(f.jibun ?? ""),
        행정동: csvSafe(f.adminDong ?? ""),
        우편번호: csvSafe(f.postalCode ?? ""),
        위도: f.lat,
        경도: f.lon,
        메모: csvSafe(f.memo ?? ""),
      }))
      const ws = XLSX.utils.json_to_sheet(rows)
      ws["!cols"] = [
        { wch: 6 },
        { wch: 22 },
        { wch: 12 },
        ...filterLabels.map(() => ({ wch: 14 })),
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
    } catch {
      toast.error("엑셀 생성에 실패했습니다. 다시 시도해 주세요")
    } finally {
      setExporting(false)
    }
  }

  // 시설현황 보고서: 지도 캡처 + 집계/표를 독립 HTML로 새 탭 출력 → 인쇄/PDF 저장
  const handleReport = async () => {
    if (exporting) return
    if (facilities.length === 0) {
      toast.info("보고서로 만들 시설이 없습니다")
      return
    }
    setExporting(true)
    try {
      let mapImage: string | null = null
      try {
        if (mapWrapRef.current) {
          const { toPng } = await import("html-to-image")
          await new Promise((r) => setTimeout(r, 350))
          mapImage = await toPng(mapWrapRef.current, {
            pixelRatio: 2,
            filter: (node) => !(node instanceof HTMLElement && node.classList?.contains("leaflet-control-zoom")),
          })
        }
      } catch {
        /* 지도 캡처 실패해도 표는 출력 */
      }
      const html = buildReportHtml({
        facilities,
        styles,
        mapImage,
        generatedAt: new Date().toLocaleString("ko-KR"),
      })
      const w = window.open("", "_blank")
      if (!w) {
        toast.error("팝업이 차단되었습니다. 팝업 허용 후 다시 시도하세요")
        return
      }
      w.document.open()
      w.document.write(html)
      w.document.close()
      toast.success("보고서를 새 탭에서 열었습니다")
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="lg:flex lg:items-start lg:gap-4">
      {/* === 좌측 사이드패널 (접이식) — [시설 추가 | 목록] 탭. 지도와 나란히 둬 목록↔지도 동시 시야 === */}
      {!panelCollapsed && (
        <div className="mb-4 space-y-3 lg:mb-0 lg:w-[360px] lg:shrink-0">
          <div className="flex gap-1 rounded-xl border bg-card p-1 shadow-sm">
            <button
              onClick={() => setPanelTab("add")}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                panelTab === "add" ? "bg-gray-900 text-white" : "text-gray-500 hover:bg-gray-100"
              }`}
            >
              <Plus className="h-4 w-4" /> 시설 추가
            </button>
            <button
              onClick={() => setPanelTab("list")}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                panelTab === "list" ? "bg-gray-900 text-white" : "text-gray-500 hover:bg-gray-100"
              }`}
            >
              <Tag className="h-4 w-4" /> 목록{facilities.length > 0 ? ` ${facilities.length}` : ""}
            </button>
          </div>

          {/* 추가 탭 */}
          {panelTab === "add" && (
            <FacilityAdd
              existingCategories={categoryCounts.entries.map(([c]) => c)}
              styles={styles}
              onSetCategoryStyle={setCategoryStyle}
              onAdd={addFacilities}
            />
          )}

          {/* 목록 탭 */}
          {panelTab === "list" && (
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

              {facilities.length > 0 && (
                <div className="border-b px-4 py-2">
                  <label className="relative block">
                    <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
                    <input
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="시설명, 연번, 주소, 행정동, 분류 검색"
                      className="h-8 w-full rounded-md border border-gray-200 bg-white pl-8 pr-14 text-xs text-gray-700 outline-none transition focus:border-gray-300 focus:ring-2 focus:ring-ring"
                    />
                    {searchQuery && (
                      <button
                        type="button"
                        onClick={() => setSearchQuery("")}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-gray-400 hover:text-gray-700"
                      >
                        지우기
                      </button>
                    )}
                  </label>
                  {activeFilterCount > 0 && (
                    <div className="mt-1 flex items-center justify-between text-[10px] text-gray-400">
                      <span>
                        {hasSearchQuery ? "검색 결과" : "표시"}{" "}
                        <strong className="font-semibold text-gray-600">{visibleFacilities.length}</strong>건 / 전체{" "}
                        {facilities.length}건
                      </span>
                    </div>
                  )}
                </div>
              )}

              {/* 분류 필터 (다중선택 — 지도·목록 동시 적용) */}
              {(dynamicFilterOptions.length > 0 || categoryCounts.entries.length > 0 || categoryCounts.uncategorized > 0) && (
                <div className="space-y-3 border-b px-4 py-3">
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                      <Filter className="h-3 w-3" /> 자동 필터
                      {activeFilterCount > 0 && <span className="normal-case text-gray-500">· {activeFilterCount}개 적용</span>}
                    </span>
                    {activeFilterCount > 0 && (
                      <button onClick={clearAllFilters} className="text-[10px] text-gray-400 hover:text-gray-700">
                        초기화
                      </button>
                    )}
                  </div>
                  {dynamicFilterOptions.length > 0 && (
                    <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                      {dynamicFilterOptions.map((option) => (
                        <label key={option.label} className="space-y-0.5">
                          <span className="text-[10px] font-medium text-gray-400">{option.label}</span>
                          <select
                            value={selectedFilters[option.label] ?? ""}
                            onChange={(e) => setDynamicFilter(option.label, e.target.value)}
                            className="h-8 w-full rounded-md border border-gray-200 bg-white px-2 text-xs text-gray-700 focus:outline-none focus:ring-2 focus:ring-ring"
                          >
                            <option value="">전체</option>
                            {option.values.map(([value, count]) => (
                              <option key={value} value={value}>
                                {value} ({count})
                              </option>
                            ))}
                          </select>
                        </label>
                      ))}
                    </div>
                  )}
                  {(categoryCounts.entries.length > 0 || categoryCounts.uncategorized > 0) && (
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="flex items-center gap-1 text-[10px] font-medium text-gray-400">
                          <Tag className="h-3 w-3" /> 분류
                        </span>
                        {orderedCategories.length > 1 && (
                          <button
                            onClick={sortCategoriesAlpha}
                            title="가나다순 정렬 (드래그로 직접 순서 변경 가능)"
                            className="inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[10px] text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                          >
                            <ArrowDownAZ className="h-3 w-3" /> 가나다순
                          </button>
                        )}
                      </div>
                      <button
                        onClick={() => setSelectedCats(new Set())}
                        className={`flex w-full items-center justify-between rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors ${
                          selectedCats.size === 0
                            ? "border-gray-900 bg-gray-900 text-white"
                            : "border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:bg-gray-50"
                        }`}
                      >
                        <span>분류 전체</span>
                        <span className={selectedCats.size === 0 ? "text-gray-300" : "text-gray-400"}>{facilities.length}</span>
                      </button>
                      <div className="grid grid-cols-2 gap-1.5">
                        {orderedCategories.map(([cat, count]) => (
                          <CategoryChip
                            key={cat}
                            label={cat}
                            count={count}
                            color={resolveStyle(cat, styles).color}
                            active={selectedCats.has(cat)}
                            draggable
                            dragging={dragCat === cat}
                            dragOver={dragOverCat === cat && dragCat !== cat}
                            onToggle={() => {
                              if (!didDragRef.current) toggleCat(cat)
                            }}
                            onDragStart={() => {
                              setDragCat(cat)
                              didDragRef.current = true
                            }}
                            onDragEnter={() => setDragOverCat(cat)}
                            onDragEnd={() => {
                              setDragCat(null)
                              setDragOverCat(null)
                              setTimeout(() => {
                                didDragRef.current = false
                              }, 0)
                            }}
                            onDrop={() => {
                              if (dragCat) reorderCategory(dragCat, cat)
                            }}
                          />
                        ))}
                        {categoryCounts.uncategorized > 0 && (
                          <CategoryChip
                            label="미분류"
                            count={categoryCounts.uncategorized}
                            color={resolveStyle(undefined, styles).color}
                            active={selectedCats.has("__none__")}
                            onToggle={() => toggleCat("__none__")}
                          />
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div className="max-h-[420px] divide-y divide-gray-100 overflow-y-auto lg:max-h-[calc(100vh-340px)]">
                {visibleFacilities.length === 0 ? (
                  <div className="px-4 py-10 text-center text-sm text-muted-foreground">
                    {facilities.length === 0 ? "아직 등록된 시설이 없습니다." : "검색/필터 조건에 맞는 시설이 없습니다."}
                  </div>
                ) : (
                  visibleFacilities.map((f) => (
                    <div key={f.id} className="group px-4 py-2.5 hover:bg-gray-50">
                      <div className="flex items-start gap-2">
                        <span className="mt-0.5 shrink-0">
                          <ShapeIcon {...resolveStyle(f.category, styles)} size={16} />
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <span className="truncate text-sm font-semibold text-gray-900">{facilityDisplayName(f)}</span>
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
          )}
        </div>
      )}

      {/* === 우측 지도 + 툴바 (가로 풀폭·크게) === */}
      <div ref={mapSectionRef} className={`space-y-3 lg:min-w-0 lg:flex-1 ${isMapFullscreen ? "bg-background p-4" : ""}`}>
        <div className="flex flex-wrap items-center gap-2">
          <ToolbarButton onClick={() => setPanelCollapsed((v) => !v)}>
            {panelCollapsed ? <PanelLeft className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
            {panelCollapsed ? "패널 열기" : "패널 접기"}
          </ToolbarButton>
          <ToolbarButton onClick={() => setShowLabels((v) => !v)} active={showLabels}>
            {showLabels ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />} 라벨
          </ToolbarButton>
          <ToolbarButton onClick={toggleMapFullscreen} active={isMapFullscreen}>
            {isMapFullscreen ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}
            {isMapFullscreen ? "전체화면 종료" : "전체화면보기"}
          </ToolbarButton>
          <div className="hidden flex-1 sm:block" />
          <ToolbarButton onClick={() => setSetsModalOpen(true)}>
            <Layers className="h-4 w-4" /> 세트
          </ToolbarButton>
          <ToolbarButton onClick={handleReport} disabled={exporting}>
            <FileText className="h-4 w-4" /> 보고서
          </ToolbarButton>
          <ToolbarButton onClick={handleScreenshot} disabled={exporting}>
            <Camera className="h-4 w-4" /> 스크린샷
          </ToolbarButton>
          <ToolbarButton onClick={handleExcel} disabled={exporting}>
            <Download className="h-4 w-4" /> 엑셀
          </ToolbarButton>
        </div>

        <div
          className={`overflow-hidden rounded-xl border bg-card shadow-sm ${
            isMapFullscreen ? "h-[calc(100vh-72px)]" : "h-[55vh] lg:h-[calc(100vh-150px)]"
          }`}
        >
          <FacilityMap
            ref={mapWrapRef}
            facilities={mapFacilities}
            styles={styles}
            categoryOrder={orderedCategories.map(([c]) => c)}
            showLabels={showLabels}
            focus={focus}
            resizeSignal={mapResizeSignal}
          />
        </div>
      </div>

      <FacilitySetsModal
        open={setsModalOpen}
        onOpenChange={setSetsModalOpen}
        current={{ facilities, styles, categoryOrder }}
        onLoad={handleLoadSet}
      />
    </div>
  )
}

// 분류 필터 칩 — 색점 + 이름 + 개수(우측 정렬). draggable이면 그립 핸들 노출, 드래그로 순서 변경.
function CategoryChip({
  label,
  count,
  color,
  active,
  draggable,
  dragging,
  dragOver,
  onToggle,
  onDragStart,
  onDragEnter,
  onDragEnd,
  onDrop,
}: {
  label: string
  count: number
  color: string
  active: boolean
  draggable?: boolean
  dragging?: boolean
  dragOver?: boolean
  onToggle: () => void
  onDragStart?: () => void
  onDragEnter?: () => void
  onDragEnd?: () => void
  onDrop?: () => void
}) {
  return (
    <div
      draggable={draggable}
      onClick={onToggle}
      onDragStart={onDragStart}
      onDragEnter={onDragEnter}
      onDragOver={(e) => {
        if (draggable) e.preventDefault()
      }}
      onDragEnd={onDragEnd}
      onDrop={(e) => {
        e.preventDefault()
        onDrop?.()
      }}
      className={`group flex cursor-pointer items-center gap-1.5 rounded-lg border px-2 py-1.5 text-xs transition-colors ${
        active
          ? "border-gray-900 bg-gray-900 text-white"
          : "border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:bg-gray-50"
      } ${dragging ? "opacity-40" : ""} ${dragOver ? "ring-2 ring-gray-400" : ""}`}
    >
      {draggable && (
        <GripVertical
          className={`h-3 w-3 shrink-0 cursor-grab ${active ? "text-gray-500" : "text-gray-300"} group-hover:text-gray-400`}
        />
      )}
      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: color }} />
      <span className="flex-1 truncate font-medium">{label}</span>
      <span className={`shrink-0 text-[10px] tabular-nums ${active ? "text-gray-300" : "text-gray-400"}`}>{count}</span>
    </div>
  )
}

function ToolbarButton({
  onClick,
  active,
  disabled,
  children,
}: {
  onClick: () => void
  active?: boolean
  disabled?: boolean
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex h-8 items-center gap-1.5 rounded-lg border px-3 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
        active
          ? "border-gray-900 bg-gray-900 text-white"
          : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
      }`}
    >
      {children}
    </button>
  )
}
