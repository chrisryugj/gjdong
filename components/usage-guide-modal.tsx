"use client"

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"

const HelpCircleIcon = () => (
  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <circle cx="12" cy="12" r="10" strokeWidth="2" />
    <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" strokeWidth="2" strokeLinecap="round" />
    <path d="M12 17h.01" strokeWidth="2" strokeLinecap="round" />
  </svg>
)

const CheckCircleIcon = () => (
  <svg className="h-4 w-4 text-green-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" strokeWidth="2" strokeLinecap="round" />
    <polyline points="22 4 12 14.01 9 11.01" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

const MapPinIcon = () => (
  <svg className="h-4 w-4 text-blue-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" strokeWidth="2" />
    <circle cx="12" cy="10" r="3" strokeWidth="2" />
  </svg>
)

const FileSpreadsheetIcon = () => (
  <svg className="h-4 w-4 text-purple-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    <polyline points="14 2 14 8 20 8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    <line x1="8" y1="13" x2="16" y2="13" strokeWidth="2" strokeLinecap="round" />
    <line x1="8" y1="17" x2="16" y2="17" strokeWidth="2" strokeLinecap="round" />
  </svg>
)

type UsageGuideModalProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export default function UsageGuideModal({ open, onOpenChange }: UsageGuideModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <HelpCircleIcon />
            표준주소실록 사용 가이드
          </DialogTitle>
          <DialogDescription>
            다양한 형태의 주소를 표준 형식으로 변환하고 지도에서 위치를 확인하세요
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* 업무별 활용 예시 */}
          <section>
            <h3 className="text-sm font-bold text-gray-900 mb-3 border-b pb-2">이런 업무에 활용하세요</h3>
            <div className="grid gap-3">
              <div className="bg-blue-50 rounded-lg p-3 border border-blue-100">
                <p className="text-sm font-semibold text-blue-900 mb-1">복지/주민지원 업무</p>
                <p className="text-xs text-blue-700">
                  "취약계층 100가구 현장방문 해야 하는데, 주소가 뒤죽박죽이에요"<br />
                  → 민원인이 작성한 주소 → <strong>도로명 + 지번 + 행정동</strong> 한번에 정리
                </p>
              </div>
              <div className="bg-green-50 rounded-lg p-3 border border-green-100">
                <p className="text-sm font-semibold text-green-900 mb-1">시설관리 업무</p>
                <p className="text-xs text-green-700">
                  "관내 경로당 200개소 주소를 행정동별로 분류해야 해요"<br />
                  → 시설 목록 엑셀 붙여넣기 → <strong>행정동 자동 추출</strong> → 엑셀 다운로드
                </p>
              </div>
              <div className="bg-orange-50 rounded-lg p-3 border border-orange-100">
                <p className="text-sm font-semibold text-orange-900 mb-1">현장점검/단속 업무</p>
                <p className="text-xs text-orange-700">
                  "불법광고물 신고 30건 위치를 한눈에 보고 싶어요"<br />
                  → 신고 주소 일괄 입력 → <strong>지도에 번호 마커로 표시</strong> → 효율적 동선 계획
                </p>
              </div>
              <div className="bg-purple-50 rounded-lg p-3 border border-purple-100">
                <p className="text-sm font-semibold text-purple-900 mb-1">통계/보고 업무</p>
                <p className="text-xs text-purple-700">
                  "사업 대상지 주소를 보고서 양식에 맞게 통일해야 해요"<br />
                  → 다양한 형식의 주소 → <strong>표준형식으로 일괄 변환</strong> → 복사해서 보고서에 붙여넣기
                </p>
              </div>
            </div>
          </section>

          {/* 주요 기능 */}
          <section>
            <h3 className="text-sm font-bold text-gray-900 mb-3 border-b pb-2">주요 기능</h3>
            <div className="space-y-3">
              <div className="flex gap-2">
                <CheckCircleIcon />
                <div>
                  <p className="text-sm font-medium text-gray-900">주소 변환</p>
                  <p className="text-xs text-gray-600">도로명, 지번, 건물명 등 다양한 형태로 입력해도 표준 형식으로 변환</p>
                </div>
              </div>
              <div className="flex gap-2">
                <FileSpreadsheetIcon />
                <div>
                  <p className="text-sm font-medium text-gray-900">일괄 변환</p>
                  <p className="text-xs text-gray-600">줄바꿈으로 구분하여 여러 주소 한번에 변환, 엑셀 복사/붙여넣기 지원</p>
                </div>
              </div>
              <div className="flex gap-2">
                <MapPinIcon />
                <div>
                  <p className="text-sm font-medium text-gray-900">지도 표시</p>
                  <p className="text-xs text-gray-600">변환된 주소 위치를 지도에서 확인, 일괄 변환 시 번호 마커로 표시</p>
                </div>
              </div>
            </div>
          </section>

          {/* 사용 방법 */}
          <section>
            <h3 className="text-sm font-bold text-gray-900 mb-3 border-b pb-2">사용 방법</h3>
            <div className="space-y-4">
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-sm font-semibold text-gray-900 mb-2">단일 주소 변환</p>
                <ol className="text-xs text-gray-700 space-y-1.5 list-decimal list-inside">
                  <li>주소 입력 (예: <code className="bg-gray-200 px-1 rounded">광진구 아차산로 400</code>)</li>
                  <li><strong>검색</strong> 버튼 클릭</li>
                  <li>변환된 결과 클릭하여 복사</li>
                </ol>
              </div>
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-sm font-semibold text-gray-900 mb-2">일괄 주소 변환</p>
                <ol className="text-xs text-gray-700 space-y-1.5 list-decimal list-inside">
                  <li>여러 주소를 <strong>줄바꿈</strong>으로 구분하여 입력</li>
                  <li>결과 표시 방법 선택 (한번에 출력 / 개별 출력)</li>
                  <li><strong>일괄 검색</strong> 버튼 클릭</li>
                  <li>결과 복사 또는 <strong>엑셀 다운로드</strong></li>
                </ol>
              </div>
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-sm font-semibold text-gray-900 mb-2">엑셀 데이터 붙여넣기</p>
                <p className="text-xs text-gray-700">
                  엑셀에서 2열 (<strong>주소 | 시설명</strong>) 형태로 복사하면 시설명도 함께 처리됩니다.
                </p>
                <div className="mt-2 bg-white border rounded p-2">
                  <table className="text-xs w-full">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-1 text-gray-500">A열 (주소)</th>
                        <th className="text-left py-1 text-gray-500">B열 (시설명)</th>
                      </tr>
                    </thead>
                    <tbody className="text-gray-700">
                      <tr><td className="py-0.5">광진구 아차산로 400</td><td>광진구청</td></tr>
                      <tr><td className="py-0.5">강남구 테헤란로 152</td><td>역삼역</td></tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </section>

          {/* 변환 예시 */}
          <section>
            <h3 className="text-sm font-bold text-gray-900 mb-3 border-b pb-2">변환 예시</h3>
            <div className="bg-gray-50 rounded-lg p-3">
              <table className="text-xs w-full">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-1.5 text-gray-500">입력</th>
                    <th className="text-left py-1.5 text-gray-500">출력 (표준형식)</th>
                  </tr>
                </thead>
                <tbody className="text-gray-700">
                  <tr className="border-b">
                    <td className="py-1.5">광진구 아차산로 400</td>
                    <td>서울특별시 광진구 아차산로 400(자양동 870, 자양2동)</td>
                  </tr>
                  <tr className="border-b">
                    <td className="py-1.5">자양동 870</td>
                    <td>서울특별시 광진구 아차산로 400(자양동 870, 자양2동)</td>
                  </tr>
                  <tr>
                    <td className="py-1.5">경기도 성남시 분당구 판교역로 235</td>
                    <td>경기도 성남시 분당구 판교역로235(삼평동 681, 삼평동)</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>
        </div>

        <DialogFooter>
          <button
            onClick={() => onOpenChange(false)}
            className="inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 bg-primary text-primary-foreground hover:bg-primary/90 h-10 px-6"
          >
            확인
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// 사용법 버튼 컴포넌트 export
export function UsageGuideButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium text-blue-600 hover:text-blue-700 hover:bg-blue-50 border border-blue-200 transition-colors"
      title="사용 방법"
      aria-label="사용 방법 보기"
    >
      <HelpCircleIcon />
      <span>사용법</span>
    </button>
  )
}
