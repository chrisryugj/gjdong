"use client"

import Link from "next/link"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

const useCases = [
  { title: "복지 · 주민지원", desc: "취약계층 100가구 현장방문 명단 → 도로명·지번·행정동 정리, 지도 동선까지." },
  { title: "시설 관리", desc: "경로당·어린이집 200개소 주소 붙여넣기 → 행정동 자동 추출 → 엑셀 다운로드." },
  { title: "현장점검 · 단속", desc: "불법광고물 신고 30건 주소 입력 → 지도에 번호 마커 → 동선 계획." },
  { title: "통계 · 보고", desc: "뒤죽박죽 주소 → 표준형식 일괄 변환 → 보고서·공문에 바로 붙여넣기." },
  { title: "민원 응대", desc: '민원인이 말한 약칭·별칭(예: "광진구청") → 정확한 도로명으로 즉시 확인.' },
]

const extFeatures = [
  { title: "드래그 → 인라인 카드", desc: "주소 드래그하면 옆에 변환 카드가 바로 뜸." },
  { title: "우클릭 변환", desc: '"표준주소 변환" 메뉴로 즉시 처리.' },
  { title: "단축키 Ctrl+Shift+C", desc: "클립보드 주소 변환 후 알림." },
  { title: "클립보드 자동감지", desc: "주소 복사하면 알아서 변환 알림." },
]

const installSteps: React.ReactNode[] = [
  <>아래 <strong className="font-semibold text-slate-900">익스텐션 다운로드</strong> 버튼으로 <code className="bg-slate-100 px-1.5 py-0.5 rounded text-[11px] text-slate-700">gjdong-extension.zip</code> 파일 받기.</>,
  <>zip 파일 <strong className="font-semibold text-slate-900">압축 해제</strong>.</>,
  <>Chrome 주소창에 <code className="bg-slate-100 px-1.5 py-0.5 rounded text-[11px] text-slate-700">chrome://extensions</code> 입력.</>,
  <>오른쪽 위 <strong className="font-semibold text-slate-900">"개발자 모드"</strong> ON.</>,
  <><strong className="font-semibold text-slate-900">"압축해제된 확장 프로그램을 로드"</strong> → 해제한 폴더 선택.</>,
]

const examples: [string, string][] = [
  ["광진구 아차산로 400", "서울특별시 광진구 아차산로 400(자양동 870, 자양2동)"],
  ["자양동 870", "서울특별시 광진구 아차산로 400(자양동 870, 자양2동)"],
  ["광진구청", "서울특별시 광진구 아차산로 400(자양동 870, 자양2동)"],
  ["판교역로 235", "경기도 성남시 분당구 판교역로 235(삼평동 681, 삼평동)"],
]

export default function HomeInfoTabs() {
  return (
    <Tabs defaultValue="cases" className="w-full">
      <TabsList className="grid w-full grid-cols-3 bg-slate-100">
        <TabsTrigger value="cases" className="text-xs md:text-sm">활용 사례</TabsTrigger>
        <TabsTrigger value="extension" className="text-xs md:text-sm">
          Chrome 익스텐션
          <span className="ml-1.5 rounded-full border border-indigo-200 bg-indigo-50 px-1.5 py-0 text-[9px] font-semibold text-indigo-700">NEW</span>
        </TabsTrigger>
        <TabsTrigger value="examples" className="text-xs md:text-sm">변환 예시</TabsTrigger>
      </TabsList>

      {/* 활용 사례 */}
      <TabsContent value="cases" className="mt-4">
        <div className="grid gap-px bg-slate-200 rounded-xl overflow-hidden border border-slate-200 sm:grid-cols-2">
          {useCases.map((item) => (
            <div key={item.title} className="bg-white p-4">
              <p className="text-[13px] font-semibold text-slate-900">{item.title}</p>
              <p className="text-xs text-slate-600 mt-1 leading-relaxed">{item.desc}</p>
            </div>
          ))}
          <div className="bg-white p-4">
            <p className="text-[13px] font-semibold text-slate-900">Tableau · BI 연동</p>
            <p className="text-xs text-slate-600 mt-1 leading-relaxed">
              <Link href="/tableau-geocoder" className="text-indigo-600 hover:text-indigo-700 underline underline-offset-2">
                Tableau Geocoder
              </Link>
              에 CSV 업로드 → 위·경도 자동 추가.
            </p>
          </div>
        </div>
      </TabsContent>

      {/* Chrome 익스텐션 */}
      <TabsContent value="extension" className="mt-4">
        <div className="rounded-xl border border-slate-200 bg-white p-5 md:p-6">
          <p className="text-[13px] text-slate-600 leading-relaxed">
            웹사이트를 열 필요 없이 브라우저 위에서 바로 주소를 변환합니다. 드래그·우클릭·단축키·자동감지 지원.
          </p>

          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            {extFeatures.map((f) => (
              <div key={f.title} className="rounded-lg border border-slate-200 p-3">
                <p className="text-[12px] font-semibold text-slate-900">{f.title}</p>
                <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>

          <div className="mt-5">
            <h3 className="text-[10px] font-semibold tracking-[0.15em] text-slate-500 uppercase mb-3">설치 · 약 1분</h3>
            <ol className="space-y-2 border-l border-slate-200 pl-5 relative">
              {installSteps.map((node, i) => (
                <li key={i} className="relative text-[12px] text-slate-600 leading-relaxed">
                  <span className="absolute -left-[26px] top-0 flex h-4 w-4 items-center justify-center rounded-full border border-slate-300 bg-white text-[9px] font-semibold text-slate-500">
                    {i + 1}
                  </span>
                  {node}
                </li>
              ))}
              <li className="relative text-[12px] text-slate-900 font-medium leading-relaxed">
                <span className="absolute -left-[26px] top-0 flex h-4 w-4 items-center justify-center rounded-full bg-slate-900 text-[9px] text-white">
                  ✓
                </span>
                끝! Chrome 툴바에 아이콘 생성.
              </li>
            </ol>
          </div>

          <div className="mt-5 flex flex-col sm:flex-row gap-2">
            <a
              href="/gjdong-extension.zip"
              download
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white px-4 py-2 text-xs font-medium transition-colors"
            >
              <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5 5-5M12 15V3" />
              </svg>
              익스텐션 다운로드 (zip)
            </a>
            <a
              href="https://github.com/chrisryugj/gjdong"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-white hover:bg-slate-50 text-slate-800 border border-slate-300 px-4 py-2 text-xs font-medium transition-colors"
            >
              GitHub에서 보기
            </a>
          </div>
          <p className="text-[10px] text-slate-400 mt-3">
            Chrome 웹스토어 정식 등록은 진행 중입니다. 현재는 개발자 모드로 설치하세요.
          </p>
        </div>
      </TabsContent>

      {/* 변환 예시 */}
      <TabsContent value="examples" className="mt-4">
        <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-slate-200">
                <th className="text-left px-4 py-2.5 font-medium text-[10px] uppercase tracking-wider text-slate-500 w-2/5">입력</th>
                <th className="text-left px-4 py-2.5 font-medium text-[10px] uppercase tracking-wider text-slate-500">출력</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {examples.map(([input, output]) => (
                <tr key={input}>
                  <td className="px-4 py-2.5 text-slate-500 font-mono text-[11px]">{input}</td>
                  <td className="px-4 py-2.5 text-slate-800">{output}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </TabsContent>
    </Tabs>
  )
}
