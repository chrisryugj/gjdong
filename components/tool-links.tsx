import { ArrowRight, Radar } from "lucide-react"

const BuildingIcon = () => (
  <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 21h18" />
    <path d="M5 21V7l8-4v18" />
    <path d="M19 21V11l-6-4" />
    <path d="M9 9v.01" />
    <path d="M9 12v.01" />
    <path d="M9 15v.01" />
  </svg>
)

const TOOLS = [
  {
    href: "/crowd",
    name: "서울 인파레이더",
    desc: "서울 명소 121곳 실시간 혼잡도 — 주소만 치면 근처 인파 상황과 12시간 예측까지",
    icon: <Radar className="h-5 w-5" />,
    iconClass: "bg-emerald-600",
    hoverClass: "hover:border-emerald-300",
    badge: "LIVE",
    badgeClass: "bg-emerald-100 text-emerald-700",
  },
  {
    href: "/facility",
    name: "시설관리 대시보드",
    desc: "관리 시설 주소를 지도에 한눈에 — 분류별 마커·라벨, 엑셀·스크린샷·현황 보고서까지",
    icon: <BuildingIcon />,
    iconClass: "bg-indigo-600",
    hoverClass: "hover:border-indigo-300",
    badge: null,
    badgeClass: "",
  },
]

/** 변환기 아래 — 함께 쓰는 도구 진입 카드 (구 프로모 배너 2종 통합) */
export default function ToolLinks() {
  return (
    <section className="mt-6 md:mt-8">
      <h2 className="mb-2.5 text-[13px] font-semibold text-slate-500">함께 쓰는 도구</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        {TOOLS.map((tool) => (
          <a
            key={tool.href}
            href={tool.href}
            className={`group flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-3.5 shadow-sm transition-colors ${tool.hoverClass}`}
          >
            <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-white ${tool.iconClass}`}>
              {tool.icon}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-bold text-slate-900">{tool.name}</span>
                {tool.badge && (
                  <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-extrabold tracking-wide ${tool.badgeClass}`}>
                    {tool.badge}
                  </span>
                )}
              </div>
              <p className="mt-0.5 text-xs leading-relaxed text-slate-500">{tool.desc}</p>
            </div>
            <ArrowRight className="ml-auto mt-1 h-4 w-4 shrink-0 text-slate-300 transition-colors group-hover:text-slate-500" />
          </a>
        ))}
      </div>
    </section>
  )
}
