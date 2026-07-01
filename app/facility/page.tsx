import type { Metadata } from "next"
import FacilityDashboard from "@/components/facility/facility-dashboard"
import { Toaster } from "@/components/ui/sonner"

export const metadata: Metadata = {
  title: "시설관리 대시보드 · 표준주소실록",
  description: "관리 시설의 주소를 지도에 한눈에 — 분류별 색상 마커, 라벨, 스크린샷·엑셀 내보내기. 데이터는 브라우저에 저장됩니다.",
}

export default function FacilityPage() {
  return (
    <main className="min-h-screen bg-slate-50">
      <div className="container mx-auto px-4 py-4 md:py-6">
        <div className="mx-auto max-w-6xl">
          {/* 헤더 — 표준주소실록(상위 브랜드) > 시설관리 대시보드(하위 탭) 위계 */}
          <div className="mb-4 flex items-end justify-between">
            <div>
              <a href="/" className="inline-block transition-opacity hover:opacity-70">
                <h1 className="text-2xl font-black text-gray-900 md:text-3xl" style={{ fontFamily: "Shilla, sans-serif" }}>표준주소실록</h1>
              </a>
              <div className="mt-0.5 flex items-baseline gap-1.5">
                <span className="text-gray-300">└</span>
                <span className="text-sm font-semibold text-gray-500 md:text-base">시설관리 대시보드</span>
                <span className="text-xs font-medium text-muted-foreground/50">beta</span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground md:text-sm">
                관리 시설 주소를 지도에 표시하고 분류·라벨·엑셀로 관리하세요. 모든 데이터는 이 브라우저에만 저장됩니다.
              </p>
            </div>
            <a
              href="/"
              className="shrink-0 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-50"
            >
              ← 주소 변환기
            </a>
          </div>

          <FacilityDashboard />
        </div>
      </div>
      <Toaster position="top-right" />
    </main>
  )
}
