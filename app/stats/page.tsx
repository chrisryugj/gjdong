import Link from "next/link"

export const metadata = {
  title: "방문 통계 · 표준주소실록",
  description: "표준주소실록 방문자 수 기록",
}

const SITE_URL = "https://gjdong.vercel.app/"
const encoded = encodeURIComponent(SITE_URL)

const badges = [
  {
    label: "누적 방문 (Total)",
    src: `https://hitscounter.dev/api/hit?url=${encoded}&label=Total&icon=graph-up&color=%234f46e5&message=&style=for-the-badge&tz=Asia%2FSeoul`,
  },
  {
    label: "오늘 방문 (Today)",
    src: `https://hitscounter.dev/api/hit?url=${encoded}&label=Today&icon=calendar-day&color=%2316a34a&message=&style=for-the-badge&tz=Asia%2FSeoul`,
  },
  {
    label: "AI.Do 카운터",
    src: `https://hitscounter.dev/api/hit?url=${encoded}&label=AI-Do&icon=pin-map-fill&color=%23adb5bd&message=&style=for-the-badge&tz=Asia%2FSeoul`,
  },
]

export default function StatsPage() {
  return (
    <main className="min-h-screen bg-gradient-to-br from-background via-muted/30 to-background">
      <div className="container mx-auto px-4 py-10 md:py-16">
        <div className="mx-auto max-w-2xl">
          <div className="mb-8">
            <Link href="/" className="text-xs text-muted-foreground hover:text-foreground">
              ← 홈으로
            </Link>
          </div>

          <header className="text-center mb-10">
            <h1 className="text-2xl md:text-3xl font-bold text-gray-900">방문 통계</h1>
            <p className="text-sm text-muted-foreground mt-2">
              표준주소실록을 찾아주신 분들의 기록입니다
            </p>
          </header>

          <section className="space-y-6">
            {badges.map((b) => (
              <div
                key={b.label}
                className="rounded-xl border bg-white/60 p-6 flex flex-col items-center gap-3"
              >
                <p className="text-xs font-medium text-gray-500">{b.label}</p>
                <img src={b.src} alt={b.label} className="h-10" />
              </div>
            ))}
          </section>

          <section className="mt-10 rounded-xl border border-indigo-100 bg-indigo-50/40 p-5">
            <h2 className="text-sm font-bold text-indigo-900 mb-2">카운터 정보</h2>
            <ul className="text-xs text-indigo-900/80 space-y-1.5 leading-relaxed">
              <li>• 카운팅은 <strong>hitscounter.dev</strong> 무료 서비스 기반입니다.</li>
              <li>• 기록은 <strong>Asia/Seoul</strong> 시간대 기준으로 집계됩니다.</li>
              <li>• 동일 사용자의 중복 방문은 일정 시간 내에서 1회로 집계됩니다.</li>
              <li>
                •{" "}
                <a
                  href="https://hitscounter.dev/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline hover:text-indigo-700"
                >
                  hitscounter.dev
                </a>{" "}
                에서 더 자세한 통계 형태를 탐색할 수 있습니다.
              </li>
            </ul>
          </section>

          <footer className="mt-12 text-center text-[11px] text-muted-foreground/60">
            류주임 · 광진구청 AI.Do
          </footer>
        </div>
      </div>
    </main>
  )
}
