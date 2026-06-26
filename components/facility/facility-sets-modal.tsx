"use client"

import { useEffect, useRef, useState } from "react"
import { Download, FolderOpen, Layers, Save, Trash2, Upload } from "lucide-react"
import { toast } from "sonner"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import type { Facility } from "@/lib/facility-storage"
import type { CategoryStyle } from "@/lib/facility-markers"
import {
  addSet,
  deleteSet,
  type FacilitySet,
  loadSets,
  parseSetFile,
  saveSet,
  serializeSet,
} from "@/lib/facility-sets"

type CurrentData = {
  facilities: Facility[]
  styles: Record<string, CategoryStyle>
  categoryOrder: string[]
}

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  current: CurrentData
  onLoad: (set: FacilitySet, mode: "merge" | "replace") => void
}

function downloadJson(filename: string, text: string) {
  const blob = new Blob([text], { type: "application/json" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

function fmtDate(ts: number): string {
  if (!ts) return ""
  try {
    return new Date(ts).toLocaleDateString("ko-KR", { year: "2-digit", month: "2-digit", day: "2-digit" })
  } catch {
    return ""
  }
}

export default function FacilitySetsModal({ open, onOpenChange, current, onLoad }: Props) {
  const [sets, setSets] = useState<FacilitySet[]>([])
  const [name, setName] = useState("")
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) {
      setSets(loadSets())
      setName("")
    }
  }, [open])

  const handleSave = () => {
    const trimmed = name.trim()
    if (!trimmed) {
      toast.info("세트 이름을 입력하세요")
      return
    }
    if (current.facilities.length === 0) {
      toast.info("저장할 시설이 없습니다")
      return
    }
    const existed = sets.some((s) => s.name === trimmed)
    const { ok, sets: next } = saveSet(trimmed, current, Date.now())
    if (!ok) {
      toast.error("저장 공간이 부족합니다 — 기존 세트를 정리하거나 JSON으로 내보낸 뒤 삭제하세요")
      return
    }
    setSets(next)
    setName("")
    toast.success(existed ? `'${trimmed}' 세트를 갱신했습니다` : `'${trimmed}' 세트를 저장했습니다`)
  }

  const handleLoad = (set: FacilitySet, mode: "merge" | "replace") => {
    if (mode === "replace" && current.facilities.length > 0) {
      if (!window.confirm(`현재 ${current.facilities.length}개 시설을 '${set.name}'(으)로 교체할까요? 저장하지 않은 현재 목록은 사라집니다.`)) {
        return
      }
    }
    onLoad(set, mode)
    onOpenChange(false)
  }

  const handleExport = (set: FacilitySet) => {
    downloadJson(`${set.name || "시설세트"}.json`, serializeSet(set))
  }

  const handleDelete = (set: FacilitySet) => {
    if (!window.confirm(`'${set.name}' 세트를 삭제할까요?`)) return
    setSets(deleteSet(set.id))
    toast.success("세트를 삭제했습니다")
  }

  const handleImportFile = async (file: File) => {
    const text = await file.text()
    const set = parseSetFile(text)
    if (!set) {
      toast.error("올바른 시설 세트 JSON 파일이 아닙니다")
      return
    }
    const { ok, sets: next } = addSet(set)
    if (!ok) {
      toast.error("저장 공간이 부족합니다 — 기존 세트를 정리한 뒤 다시 시도하세요")
      return
    }
    setSets(next)
    toast.success(`'${set.name}' 세트를 가져왔습니다 (${set.facilities.length}개)`)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Layers className="h-5 w-5" /> 시설 세트 관리
          </DialogTitle>
          <DialogDescription>
            현재 작업을 이름 붙여 저장하고, 저장된 세트를 불러오거나 JSON 파일로 백업·공유하세요.
          </DialogDescription>
        </DialogHeader>

        {/* 현재 작업 저장 */}
        <div className="rounded-lg border bg-gray-50 p-3">
          <div className="mb-2 text-xs font-semibold text-gray-500">
            현재 작업 저장 <span className="font-normal text-gray-400">· 시설 {current.facilities.length}개</span>
          </div>
          <div className="flex gap-2">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSave()}
              placeholder="세트 이름 (예: 자양동 점검)"
              className="h-9 flex-1 rounded-md border border-gray-200 bg-white px-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <button
              onClick={handleSave}
              className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-md bg-gray-900 px-3 text-sm font-medium text-white hover:bg-gray-800"
            >
              <Save className="h-4 w-4" /> 저장
            </button>
          </div>
        </div>

        {/* 저장된 세트 목록 */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-500">저장된 세트 ({sets.length})</span>
            <button
              onClick={() => fileRef.current?.click()}
              className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-gray-500 hover:bg-gray-100 hover:text-gray-800"
            >
              <Upload className="h-3.5 w-3.5" /> JSON 가져오기
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) void handleImportFile(f)
                e.target.value = ""
              }}
            />
          </div>

          {sets.length === 0 ? (
            <div className="rounded-lg border border-dashed border-gray-200 px-3 py-6 text-center text-sm text-gray-400">
              저장된 세트가 없습니다.
              <br />
              현재 작업을 저장하거나 JSON 파일을 가져오세요.
            </div>
          ) : (
            <ul className="space-y-1.5">
              {sets.map((set) => (
                <li
                  key={set.id}
                  className="flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2"
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-gray-900">{set.name}</div>
                    <div className="text-[11px] text-gray-400">
                      시설 {set.facilities.length}개{fmtDate(set.savedAt) ? ` · ${fmtDate(set.savedAt)}` : ""}
                    </div>
                  </div>
                  <button
                    onClick={() => handleLoad(set, "merge")}
                    title="현재 목록에 추가(병합)"
                    className="rounded-md border border-gray-200 px-2 py-1 text-xs text-gray-600 hover:bg-gray-50"
                  >
                    추가
                  </button>
                  <button
                    onClick={() => handleLoad(set, "replace")}
                    title="현재 목록을 이 세트로 교체"
                    className="inline-flex items-center gap-1 rounded-md border border-gray-200 px-2 py-1 text-xs text-gray-600 hover:bg-gray-50"
                  >
                    <FolderOpen className="h-3.5 w-3.5" /> 불러오기
                  </button>
                  <button
                    onClick={() => handleExport(set)}
                    title="JSON 파일로 내보내기"
                    className="rounded-md p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                  >
                    <Download className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => handleDelete(set)}
                    title="세트 삭제"
                    className="rounded-md p-1.5 text-gray-400 hover:bg-gray-100 hover:text-red-500"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
