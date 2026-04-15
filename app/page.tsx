import Link from "next/link"
import AddressGenerator from "@/components/address-generator"

export default function Home() {
  return (
    <main className="min-h-screen bg-slate-50">
      <div className="container mx-auto px-4 py-4 md:py-6">
        {/* 메인 변환기 */}
        <div className="mx-auto max-w-2xl">
          <AddressGenerator />
        </div>

        {/* 보강 섹션 */}
        <div className="mx-auto max-w-4xl mt-16 md:mt-24 space-y-16 md:space-y-24">
          {/* 활용 예시 */}
          <section>
            <div className="mb-8">
              <p className="text-[11px] font-semibold tracking-[0.15em] text-indigo-600 uppercase">Use cases</p>
              <h2 className="mt-1.5 text-2xl md:text-3xl font-semibold tracking-tight text-slate-900">이런 업무에 씁니다</h2>
              <p className="text-sm text-slate-500 mt-2">
                주소가 들어간 모든 업무를 자동화합니다.
              </p>
            </div>
            <div className="grid gap-px bg-slate-200 rounded-xl overflow-hidden border border-slate-200 sm:grid-cols-2">
              {[
                { title: "복지 · 주민지원", desc: "취약계층 100가구 현장방문 명단 → 도로명·지번·행정동 한번에 정리, 지도 동선까지." },
                { title: "시설 관리", desc: "경로당·어린이집 200개소 주소 붙여넣기 → 행정동 자동 추출 → 엑셀 다운로드." },
                { title: "현장점검 · 단속", desc: "불법광고물 신고 30건 주소 입력 → 지도에 번호 마커 → 효율적 동선 계획." },
                { title: "통계 · 보고", desc: "뒤죽박죽 주소 → 표준형식 일괄 변환 → 보고서·공문에 바로 붙여넣기." },
                { title: "민원 응대", desc: '민원인이 말한 약칭·별칭(예: "광진구청") → 정확한 도로명 주소로 즉시 확인.' },
              ].map((item) => (
                <div key={item.title} className="bg-white p-6">
                  <p className="text-sm font-semibold text-slate-900">{item.title}</p>
                  <p className="text-[13px] text-slate-600 mt-1.5 leading-relaxed">{item.desc}</p>
                </div>
              ))}
              <div className="bg-white p-6">
                <p className="text-sm font-semibold text-slate-900">Tableau · BI 연동</p>
                <p className="text-[13px] text-slate-600 mt-1.5 leading-relaxed">
                  <Link href="/tableau-geocoder" className="text-indigo-600 hover:text-indigo-700 underline underline-offset-2">
                    Tableau Geocoder
                  </Link>
                  에 CSV 업로드 → 위·경도 컬럼 자동 추가 → 지도 시각화 바로 가능.
                </p>
              </div>
            </div>
          </section>

          {/* Chrome 익스텐션 */}
          <section className="rounded-2xl border border-slate-200 bg-white p-6 md:p-10">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center rounded-full border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-indigo-700 uppercase">
                New
              </span>
              <p className="text-[11px] font-semibold tracking-[0.15em] text-slate-500 uppercase">Browser Extension</p>
            </div>
            <h2 className="mt-2 text-2xl md:text-3xl font-semibold tracking-tight text-slate-900">Chrome 익스텐션</h2>
            <p className="mt-3 text-sm md:text-[15px] text-slate-600 leading-relaxed max-w-2xl">
              웹사이트를 열 필요 없이 브라우저 위에서 바로 주소를 변환합니다. 드래그, 우클릭, 단축키, 자동감지까지 지원.
            </p>

            {/* 기능 그리드 */}
            <div className="mt-8 grid gap-3 sm:grid-cols-2">
              {[
                { title: "드래그 → 인라인 카드", desc: "주소 드래그하면 옆에 변환 카드가 바로 뜹니다." },
                { title: "우클릭 변환", desc: '"표준주소 변환" 메뉴로 즉시 처리.' },
                { title: "단축키 Ctrl+Shift+C", desc: "클립보드 주소 변환 후 알림." },
                { title: "클립보드 자동감지", desc: "주소 복사하면 알아서 변환 알림." },
              ].map((f) => (
                <div key={f.title} className="rounded-lg border border-slate-200 p-4">
                  <p className="text-[13px] font-semibold text-slate-900">{f.title}</p>
                  <p className="text-xs text-slate-500 mt-1 leading-relaxed">{f.desc}</p>
                </div>
              ))}
            </div>

            {/* 설치 방법 */}
            <div className="mt-10">
              <h3 className="text-xs font-semibold tracking-[0.15em] text-slate-500 uppercase mb-4">설치 방법 · 약 1분</h3>
              <ol className="space-y-3.5 border-l border-slate-200 pl-6 relative">
                {[
                  <>아래 <strong className="font-semibold text-slate-900">익스텐션 다운로드</strong> 버튼을 눌러 <code className="bg-slate-100 px-1.5 py-0.5 rounded text-[11px] text-slate-700">gjdong-extension.zip</code> 파일을 받습니다.</>,
                  <>다운받은 zip 파일의 <strong className="font-semibold text-slate-900">압축을 해제</strong>합니다.</>,
                  <>Chrome 주소창에 <code className="bg-slate-100 px-1.5 py-0.5 rounded text-[11px] text-slate-700">chrome://extensions</code> 를 입력해 확장 프로그램 페이지로 이동.</>,
                  <>오른쪽 위 <strong className="font-semibold text-slate-900">"개발자 모드"</strong> 스위치를 ON.</>,
                  <><strong className="font-semibold text-slate-900">"압축해제된 확장 프로그램을 로드합니다"</strong> 버튼 클릭 → 방금 압축해제한 폴더 선택.</>,
                ].map((node, i) => (
                  <li key={i} className="relative text-[13px] md:text-sm text-slate-600 leading-relaxed">
                    <span className="absolute -left-[31px] top-0 flex h-5 w-5 items-center justify-center rounded-full border border-slate-300 bg-white text-[10px] font-semibold text-slate-500">
                      {i + 1}
                    </span>
                    {node}
                  </li>
                ))}
                <li className="relative text-[13px] md:text-sm text-slate-900 font-medium leading-relaxed">
                  <span className="absolute -left-[31px] top-0 flex h-5 w-5 items-center justify-center rounded-full bg-slate-900 text-[10px] text-white">
                    ✓
                  </span>
                  끝! Chrome 툴바에 표준주소실록 아이콘이 생깁니다.
                </li>
              </ol>
            </div>

            {/* CTA */}
            <div className="mt-8 flex flex-col sm:flex-row gap-2.5">
              <a
                href="/gjdong-extension.zip"
                download
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white px-5 py-2.5 text-sm font-medium transition-colors"
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
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-white hover:bg-slate-50 text-slate-800 border border-slate-300 px-5 py-2.5 text-sm font-medium transition-colors"
              >
                GitHub에서 보기
              </a>
            </div>
            <p className="text-[11px] text-slate-400 mt-4">
              Chrome 웹스토어 정식 등록은 진행 중입니다. 현재는 개발자 모드로 설치하세요.
            </p>
          </section>

          {/* 변환 예시 */}
          <section>
            <div className="mb-8">
              <p className="text-[11px] font-semibold tracking-[0.15em] text-indigo-600 uppercase">Examples</p>
              <h2 className="mt-1.5 text-2xl md:text-3xl font-semibold tracking-tight text-slate-900">변환 예시</h2>
              <p className="text-sm text-slate-500 mt-2">
                도로명·지번·건물명·약칭 뭘 넣어도 같은 표준 형식으로.
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
              <table className="w-full text-xs md:text-sm">
                <thead>
                  <tr className="border-b border-slate-200">
                    <th className="text-left px-5 py-3 font-medium text-[11px] uppercase tracking-wider text-slate-500 w-1/3">입력</th>
                    <th className="text-left px-5 py-3 font-medium text-[11px] uppercase tracking-wider text-slate-500">출력</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {[
                    ["광진구 아차산로 400", "서울특별시 광진구 아차산로 400(자양동 870, 자양2동)"],
                    ["자양동 870", "서울특별시 광진구 아차산로 400(자양동 870, 자양2동)"],
                    ["광진구청", "서울특별시 광진구 아차산로 400(자양동 870, 자양2동)"],
                    ["판교역로 235", "경기도 성남시 분당구 판교역로 235(삼평동 681, 삼평동)"],
                  ].map(([input, output]) => (
                    <tr key={input}>
                      <td className="px-5 py-3 text-slate-500 font-mono text-[12px]">{input}</td>
                      <td className="px-5 py-3 text-slate-800">{output}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>

        {/* 푸터 */}
        <footer className="mt-20 md:mt-28 pb-6 flex items-center justify-center gap-3 text-[11px] text-slate-400">
          <span>류주임 · 광진구청 AI.Do</span>
          <span className="text-slate-300">·</span>
          <a
            href="https://hitscounter.dev/history?url=https://gjdong.vercel.app/"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="방문 통계 보기"
            className="inline-flex items-center hover:opacity-80"
          >
            <img
              src="https://hitscounter.dev/api/hit?url=https%3A%2F%2Fgjdong.vercel.app%2F&label=visits&icon=pin-map-fill&color=%23adb5bd&message=&style=flat&tz=Asia%2FSeoul"
              alt="visits"
              className="h-4"
            />
          </a>
        </footer>
      </div>
    </main>
  )
}
