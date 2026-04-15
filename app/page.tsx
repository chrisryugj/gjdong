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

          <footer className="mt-10 md:mt-12 pb-6 flex items-center justify-center gap-3 text-[11px] text-slate-400">
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
      </div>
    </main>
  )
}
