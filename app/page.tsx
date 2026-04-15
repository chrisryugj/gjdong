import AddressGenerator from "@/components/address-generator"
import HomeInfoTabs from "@/components/home-info-tabs"

export default function Home() {
  return (
    <main className="min-h-screen bg-slate-50">
      <div className="container mx-auto px-4 py-4 md:py-6">
        <div className="mx-auto max-w-2xl">
          <AddressGenerator />

          <div className="mt-8 md:mt-10">
            <HomeInfoTabs />
          </div>

          <footer className="mt-10 md:mt-12 pb-8 border-t border-slate-200 pt-6">
            <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
              <div className="space-y-1.5">
                <p className="text-[12px] font-semibold text-slate-700">표준주소실록</p>
                <p className="text-[11px] text-slate-500 leading-relaxed">
                  Made by <span className="font-medium text-slate-700">딴짓하는 류주임</span> · 광진구청 AI.Do
                </p>
                <p className="text-[11px] text-slate-400">
                  © {new Date().getFullYear()} 딴짓하는 류주임. All rights reserved.
                </p>
              </div>

              <div className="flex items-center gap-3 text-[11px] text-slate-400">
                <a
                  href="https://github.com/chrisryugj/gjdong"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-slate-600"
                >
                  GitHub
                </a>
                <span className="text-slate-300">·</span>
                <a
                  href="mailto:ryuseungin@gmail.com"
                  className="hover:text-slate-600"
                >
                  문의
                </a>
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
              </div>
            </div>

            <div className="mt-5 pt-4 border-t border-slate-100 space-y-1.5 text-[10px] text-slate-400 leading-relaxed">
              <p>
                본 서비스는 <a href="https://developers.kakao.com/" target="_blank" rel="noopener noreferrer" className="underline hover:text-slate-600">Kakao Local API</a>를 기반으로 주소를 조회·변환합니다. 주소·좌표 데이터의 정확성은 원 제공처의 최신 갱신 상태에 따릅니다.
              </p>
              <p>
                입력한 주소는 변환 목적으로만 처리되며 별도로 저장·수집하지 않습니다. 다만 브라우저 로컬스토리지에 최근 변환 이력이 일시적으로 보관될 수 있습니다.
              </p>
              <p>
                본 사이트는 개인이 공익 목적으로 제작한 비영리 도구이며, 광진구청의 공식 서비스가 아닙니다. 업무 활용에 따른 결과의 최종 책임은 이용자에게 있습니다.
              </p>
            </div>
          </footer>
        </div>
      </div>
    </main>
  )
}
