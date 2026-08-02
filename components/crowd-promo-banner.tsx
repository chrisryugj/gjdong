import { ArrowRight, Radar } from "lucide-react"

/** 메인 카드 위 — '서울 인파레이더' 진입 배너 (다크 관제판 티저) */
export default function CrowdPromoBanner() {
  return (
    <a
      href="/crowd"
      className="mb-4 flex items-center gap-3 overflow-hidden rounded-xl border border-slate-700 bg-[#0b0f14] p-3.5 shadow-sm transition-colors hover:border-slate-500"
    >
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-slate-800 text-emerald-400">
        <Radar className="h-5 w-5" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="rounded-full bg-emerald-500 px-1.5 py-0.5 text-[9px] font-extrabold tracking-wide text-black">LIVE</span>
          <span className="text-sm font-bold text-white">서울 인파레이더</span>
        </div>
        <p className="mt-0.5 truncate text-xs text-slate-400">
          서울 명소 121곳 실시간 혼잡도 — 주소만 치면 근처 인파 상황과 12시간 예측까지
        </p>
      </div>
      <span className="ml-auto hidden shrink-0 items-center gap-1 rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-black transition-colors hover:bg-emerald-400 sm:inline-flex">
        열어보기 <ArrowRight className="h-3.5 w-3.5" />
      </span>
    </a>
  )
}
