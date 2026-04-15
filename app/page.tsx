import Link from "next/link"
import AddressGenerator from "@/components/address-generator"

export default function Home() {
  return (
    <main className="min-h-screen bg-gradient-to-br from-background via-muted/30 to-background">
      <div className="container mx-auto px-4 py-4 md:py-6">
        {/* 메인 변환기 */}
        <div className="mx-auto max-w-2xl">
          <AddressGenerator />
        </div>

        {/* 보강 섹션 — 변환기 아래로 */}
        <div className="mx-auto max-w-4xl mt-12 md:mt-16 space-y-12 md:space-y-16">
          {/* 활용 예시 */}
          <section>
            <div className="text-center mb-6">
              <h2 className="text-xl md:text-2xl font-bold text-gray-900">이런 업무에 씁니다</h2>
              <p className="text-xs md:text-sm text-muted-foreground mt-1">
                주소가 들어간 모든 업무를 자동화합니다
              </p>
            </div>
            <div className="grid gap-3 md:gap-4 sm:grid-cols-2 lg:grid-cols-2">
              <div className="rounded-xl border border-blue-100 bg-blue-50/50 p-4 md:p-5">
                <p className="text-sm font-semibold text-blue-900">복지 · 주민지원</p>
                <p className="text-xs text-blue-800/80 mt-1 leading-relaxed">
                  취약계층 100가구 현장방문 명단 → 도로명·지번·행정동 한번에 정리, 지도 동선까지
                </p>
              </div>
              <div className="rounded-xl border border-green-100 bg-green-50/50 p-4 md:p-5">
                <p className="text-sm font-semibold text-green-900">시설 관리</p>
                <p className="text-xs text-green-800/80 mt-1 leading-relaxed">
                  경로당·어린이집 200개소 주소 붙여넣기 → 행정동 자동 추출 → 엑셀 다운로드
                </p>
              </div>
              <div className="rounded-xl border border-orange-100 bg-orange-50/50 p-4 md:p-5">
                <p className="text-sm font-semibold text-orange-900">현장점검 · 단속</p>
                <p className="text-xs text-orange-800/80 mt-1 leading-relaxed">
                  불법광고물 신고 30건 주소 입력 → 지도에 번호 마커 → 효율적 동선 계획
                </p>
              </div>
              <div className="rounded-xl border border-purple-100 bg-purple-50/50 p-4 md:p-5">
                <p className="text-sm font-semibold text-purple-900">통계 · 보고</p>
                <p className="text-xs text-purple-800/80 mt-1 leading-relaxed">
                  뒤죽박죽 주소 → 표준형식 일괄 변환 → 보고서·공문에 바로 붙여넣기
                </p>
              </div>
              <div className="rounded-xl border border-rose-100 bg-rose-50/50 p-4 md:p-5">
                <p className="text-sm font-semibold text-rose-900">민원 응대</p>
                <p className="text-xs text-rose-800/80 mt-1 leading-relaxed">
                  민원인이 말한 약칭·별칭(예: "광진구청") → 정확한 도로명 주소로 즉시 확인
                </p>
              </div>
              <div className="rounded-xl border border-cyan-100 bg-cyan-50/50 p-4 md:p-5">
                <p className="text-sm font-semibold text-cyan-900">Tableau · BI 연동</p>
                <p className="text-xs text-cyan-800/80 mt-1 leading-relaxed">
                  <Link href="/tableau-geocoder" className="underline hover:text-cyan-700">
                    Tableau Geocoder
                  </Link>
                  에 CSV 업로드 → 위도·경도 컬럼 자동 추가 → 지도 시각화 바로 가능
                </p>
              </div>
            </div>
          </section>

          {/* Chrome 익스텐션 섹션 */}
          <section className="rounded-2xl border border-indigo-100 bg-gradient-to-br from-indigo-50/70 to-purple-50/40 p-5 md:p-8">
            <div className="flex items-center gap-2 mb-2">
              <span className="inline-flex items-center gap-1 rounded-full bg-indigo-600 px-2.5 py-0.5 text-[10px] font-bold text-white">
                NEW
              </span>
              <h2 className="text-xl md:text-2xl font-bold text-gray-900">Chrome 익스텐션</h2>
            </div>
            <p className="text-sm text-gray-700 leading-relaxed">
              <strong>웹사이트 열 필요 없이</strong> 브라우저 위에서 바로 주소를 변환합니다. 드래그, 우클릭, 단축키, 자동감지까지.
            </p>

            {/* 사용법 요약 */}
            <div className="mt-5 grid gap-2 sm:grid-cols-2">
              <div className="rounded-lg bg-white/70 border border-indigo-100 p-3">
                <p className="text-xs font-semibold text-indigo-900">드래그 → 인라인 카드</p>
                <p className="text-[11px] text-gray-600 mt-1">주소 드래그하면 옆에 변환 카드가 바로 뜸</p>
              </div>
              <div className="rounded-lg bg-white/70 border border-indigo-100 p-3">
                <p className="text-xs font-semibold text-indigo-900">우클릭 변환</p>
                <p className="text-[11px] text-gray-600 mt-1">"표준주소 변환" 메뉴로 즉시 처리</p>
              </div>
              <div className="rounded-lg bg-white/70 border border-indigo-100 p-3">
                <p className="text-xs font-semibold text-indigo-900">단축키 Ctrl+Shift+C</p>
                <p className="text-[11px] text-gray-600 mt-1">클립보드 주소 변환 후 알림</p>
              </div>
              <div className="rounded-lg bg-white/70 border border-indigo-100 p-3">
                <p className="text-xs font-semibold text-indigo-900">클립보드 자동감지</p>
                <p className="text-[11px] text-gray-600 mt-1">주소 복사하면 알아서 변환 알림</p>
              </div>
            </div>

            {/* 설치 방법 */}
            <div className="mt-6">
              <h3 className="text-sm font-bold text-gray-900 mb-3">설치 방법 (1분)</h3>
              <ol className="space-y-2.5">
                <li className="flex gap-3">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-indigo-600 text-white text-xs font-bold flex items-center justify-center">1</span>
                  <div className="text-xs md:text-sm text-gray-700 leading-relaxed pt-0.5">
                    아래 <strong>익스텐션 다운로드</strong> 버튼을 눌러 <code className="bg-gray-100 px-1 rounded text-[11px]">gjdong-extension.zip</code> 파일을 받습니다.
                  </div>
                </li>
                <li className="flex gap-3">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-indigo-600 text-white text-xs font-bold flex items-center justify-center">2</span>
                  <div className="text-xs md:text-sm text-gray-700 leading-relaxed pt-0.5">
                    다운받은 zip 파일의 <strong>압축을 해제</strong>합니다.
                  </div>
                </li>
                <li className="flex gap-3">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-indigo-600 text-white text-xs font-bold flex items-center justify-center">3</span>
                  <div className="text-xs md:text-sm text-gray-700 leading-relaxed pt-0.5">
                    Chrome 주소창에 <code className="bg-gray-100 px-1 rounded text-[11px]">chrome://extensions</code> 를 입력해 확장 프로그램 페이지로 이동.
                  </div>
                </li>
                <li className="flex gap-3">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-indigo-600 text-white text-xs font-bold flex items-center justify-center">4</span>
                  <div className="text-xs md:text-sm text-gray-700 leading-relaxed pt-0.5">
                    오른쪽 위 <strong>"개발자 모드"</strong> 스위치를 ON.
                  </div>
                </li>
                <li className="flex gap-3">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-indigo-600 text-white text-xs font-bold flex items-center justify-center">5</span>
                  <div className="text-xs md:text-sm text-gray-700 leading-relaxed pt-0.5">
                    <strong>"압축해제된 확장 프로그램을 로드합니다"</strong> 버튼 클릭 → 방금 압축해제한 폴더 선택.
                  </div>
                </li>
                <li className="flex gap-3">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-green-600 text-white text-xs font-bold flex items-center justify-center">✓</span>
                  <div className="text-xs md:text-sm text-gray-800 font-medium leading-relaxed pt-0.5">
                    끝! Chrome 툴바에 표준주소실록 아이콘이 생깁니다.
                  </div>
                </li>
              </ol>
            </div>

            {/* 다운로드 버튼 */}
            <div className="mt-6 flex flex-col sm:flex-row gap-2.5">
              <a
                href="/gjdong-extension.zip"
                download
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 text-sm font-semibold shadow-sm transition-colors"
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5 5-5M12 15V3" />
                </svg>
                익스텐션 다운로드 (zip)
              </a>
              <a
                href="https://github.com/chrisryugj/gjdong"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-white hover:bg-gray-50 text-gray-800 border border-gray-300 px-5 py-2.5 text-sm font-semibold transition-colors"
              >
                GitHub에서 보기
              </a>
            </div>
            <p className="text-[11px] text-gray-500 mt-3">
              ※ Chrome 웹스토어 정식 등록은 진행 중입니다. 현재는 개발자 모드로 설치하세요.
            </p>
          </section>

          {/* 변환 예시 */}
          <section>
            <div className="text-center mb-5">
              <h2 className="text-xl md:text-2xl font-bold text-gray-900">변환 예시</h2>
              <p className="text-xs md:text-sm text-muted-foreground mt-1">
                도로명·지번·건물명·약칭 뭘 넣어도 같은 표준 형식으로
              </p>
            </div>
            <div className="rounded-xl border bg-white/60 overflow-hidden">
              <table className="w-full text-xs md:text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="text-left px-4 py-2.5 font-semibold text-gray-600">입력</th>
                    <th className="text-left px-4 py-2.5 font-semibold text-gray-600">출력</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  <tr>
                    <td className="px-4 py-2.5 text-gray-800">광진구 아차산로 400</td>
                    <td className="px-4 py-2.5 text-gray-700">서울특별시 광진구 아차산로 400(자양동 870, 자양2동)</td>
                  </tr>
                  <tr>
                    <td className="px-4 py-2.5 text-gray-800">자양동 870</td>
                    <td className="px-4 py-2.5 text-gray-700">서울특별시 광진구 아차산로 400(자양동 870, 자양2동)</td>
                  </tr>
                  <tr>
                    <td className="px-4 py-2.5 text-gray-800">광진구청</td>
                    <td className="px-4 py-2.5 text-gray-700">서울특별시 광진구 아차산로 400(자양동 870, 자양2동)</td>
                  </tr>
                  <tr>
                    <td className="px-4 py-2.5 text-gray-800">판교역로 235</td>
                    <td className="px-4 py-2.5 text-gray-700">경기도 성남시 분당구 판교역로 235(삼평동 681, 삼평동)</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>
        </div>

        {/* 푸터 */}
        <footer className="mt-12 md:mt-16 pb-4 flex items-center justify-center gap-3 text-[11px] text-muted-foreground/50">
          <span>류주임 · 광진구청 AI.Do</span>
          <span className="text-muted-foreground/30">·</span>
          <Link href="/stats" aria-label="방문 통계 보기" className="inline-flex items-center hover:opacity-80">
            <img
              src="https://hitscounter.dev/api/hit?url=https%3A%2F%2Fgjdong.vercel.app%2F&label=AI-Do&icon=pin-map-fill&color=%23adb5bd&message=&style=flat&tz=Asia%2FSeoul"
              alt="hits"
              className="h-4"
            />
          </Link>
        </footer>
      </div>
    </main>
  )
}
