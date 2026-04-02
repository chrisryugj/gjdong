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

        <div className="space-y-5 py-4">
          {/* 사용 방법 — 가장 먼저 */}
          <section>
            <h3 className="text-sm font-bold text-gray-900 mb-3 border-b pb-2">사용 방법</h3>
            <div className="space-y-3">
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-sm font-semibold text-gray-900 mb-2">주소 변환</p>
                <ol className="text-xs text-gray-700 space-y-1.5 list-decimal list-inside">
                  <li>입력창에 주소 입력 (예: <code className="bg-gray-200 px-1 rounded">광진구 아차산로 400</code>)</li>
                  <li><strong>Enter</strong> 또는 오른쪽 검색 아이콘 클릭</li>
                  <li>변환 결과를 <strong>클릭하면 바로 복사</strong></li>
                </ol>
              </div>
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-sm font-semibold text-gray-900 mb-2">일괄 변환 (여러 주소)</p>
                <ol className="text-xs text-gray-700 space-y-1.5 list-decimal list-inside">
                  <li><strong>Shift+Enter</strong>로 줄바꿈하며 여러 주소 입력</li>
                  <li><strong>Enter</strong>로 일괄 검색 시작</li>
                  <li>결과 클릭하여 복사하거나 <strong>Excel</strong> 버튼으로 다운로드</li>
                </ol>
                <p className="text-xs text-gray-500 mt-2">
                  상단 칩으로 <strong>한번에/개별</strong> 표시 전환 가능
                </p>
              </div>
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-sm font-semibold text-gray-900 mb-2">엑셀 붙여넣기</p>
                <p className="text-xs text-gray-700">
                  엑셀에서 <strong>주소 | 시설명</strong> 2열로 복사해서 입력창에 붙여넣으면 시설명도 함께 처리
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

          {/* 출력 포맷 칩 설명 */}
          <section>
            <h3 className="text-sm font-bold text-gray-900 mb-3 border-b pb-2">출력 포맷 선택</h3>
            <p className="text-xs text-gray-600 mb-2">입력창 아래 <strong>칩 버튼</strong>을 눌러 원하는 포맷만 골라서 표시할 수 있습니다.</p>
            <div className="flex flex-wrap gap-1.5">
              {["표준형식1", "표준형식2", "도로명", "지번", "행정동", "우편번호", "세부주소"].map((label) => (
                <span key={label} className="px-2.5 py-1 rounded-full text-[11px] font-medium bg-gray-800 text-white">{label}</span>
              ))}
            </div>
            <p className="text-[11px] text-gray-400 mt-2">선택한 포맷은 자동 저장되어 다음에도 유지됩니다.</p>
          </section>

          {/* 업무 활용 — 접혀있는 형태 */}
          <section>
            <h3 className="text-sm font-bold text-gray-900 mb-3 border-b pb-2">이런 업무에 활용하세요</h3>
            <div className="grid gap-2">
              <div className="bg-blue-50 rounded-lg px-3 py-2.5 border border-blue-100">
                <p className="text-xs font-semibold text-blue-900">복지/주민지원</p>
                <p className="text-[11px] text-blue-700 mt-0.5">현장방문 주소 정리 → 도로명+지번+행정동 한번에</p>
              </div>
              <div className="bg-green-50 rounded-lg px-3 py-2.5 border border-green-100">
                <p className="text-xs font-semibold text-green-900">시설관리</p>
                <p className="text-[11px] text-green-700 mt-0.5">시설 목록 엑셀 붙여넣기 → 행정동 자동 추출</p>
              </div>
              <div className="bg-orange-50 rounded-lg px-3 py-2.5 border border-orange-100">
                <p className="text-xs font-semibold text-orange-900">현장점검/단속</p>
                <p className="text-[11px] text-orange-700 mt-0.5">신고 주소 일괄 입력 → 지도에 번호 마커 표시</p>
              </div>
              <div className="bg-purple-50 rounded-lg px-3 py-2.5 border border-purple-100">
                <p className="text-xs font-semibold text-purple-900">통계/보고</p>
                <p className="text-[11px] text-purple-700 mt-0.5">다양한 주소 → 표준형식 일괄 변환 → 보고서 붙여넣기</p>
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
                    <td className="py-1.5">판교역로 235</td>
                    <td>경기도 성남시 분당구 판교역로 235(삼평동 681, 삼평동)</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          {/* 단축키 */}
          <section>
            <h3 className="text-sm font-bold text-gray-900 mb-3 border-b pb-2">단축키</h3>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="bg-gray-50 rounded px-3 py-2">
                <kbd className="bg-gray-200 px-1.5 py-0.5 rounded text-[11px] font-mono">Enter</kbd>
                <span className="text-gray-600 ml-2">검색</span>
              </div>
              <div className="bg-gray-50 rounded px-3 py-2">
                <kbd className="bg-gray-200 px-1.5 py-0.5 rounded text-[11px] font-mono">Shift+Enter</kbd>
                <span className="text-gray-600 ml-2">줄바꿈</span>
              </div>
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
