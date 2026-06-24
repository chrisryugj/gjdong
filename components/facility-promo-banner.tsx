"use client"

import { useEffect, useState } from "react"
import { ArrowRight, X } from "lucide-react"

const DISMISS_KEY = "facilityPromoDismissed_v1"

const BuildingIcon = () => (
  <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 21h18" />
    <path d="M5 21V7l8-4v18" />
    <path d="M19 21V11l-6-4" />
    <path d="M9 9v.01" />
    <path d="M9 12v.01" />
    <path d="M9 15v.01" />
  </svg>
)

/** 메인 카드 위 — 신규 '시설관리 대시보드' 하이라이트 배너 (닫기 기억) */
export default function FacilityPromoBanner() {
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    if (localStorage.getItem(DISMISS_KEY) === "1") setDismissed(true)
  }, [])

  if (dismissed) return null

  return (
    <div className="relative mb-4 overflow-hidden rounded-xl border border-indigo-200 bg-gradient-to-r from-indigo-50 via-white to-violet-50 shadow-sm">
      <a href="/facility" className="flex items-center gap-3 p-3.5 pr-10">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-md">
          <BuildingIcon />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="rounded-full bg-indigo-600 px-1.5 py-0.5 text-[9px] font-extrabold tracking-wide text-white">NEW</span>
            <span className="text-sm font-bold text-gray-900">시설관리 대시보드</span>
          </div>
          <p className="mt-0.5 truncate text-xs text-gray-600">
            관리 시설 주소를 지도에 한눈에 — 분류별 마커·라벨, 엑셀·스크린샷·현황 보고서까지
          </p>
        </div>
        <span className="ml-auto hidden shrink-0 items-center gap-1 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-indigo-700 sm:inline-flex">
          열어보기 <ArrowRight className="h-3.5 w-3.5" />
        </span>
      </a>
      <button
        onClick={() => {
          localStorage.setItem(DISMISS_KEY, "1")
          setDismissed(true)
        }}
        title="닫기"
        aria-label="배너 닫기"
        className="absolute right-2 top-2 rounded-md p-1 text-gray-400 transition-colors hover:bg-white/70 hover:text-gray-700"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  )
}
