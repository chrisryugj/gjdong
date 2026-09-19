import type { Metadata, Viewport } from "next"
import { Gowun_Batang, IBM_Plex_Sans_KR } from "next/font/google"
import DumpingClient from "@/components/dumping/client"
import { THEME_INIT_SCRIPT } from "@/components/dumping/theme"

// 17라운드(2026-09-19) sunlight-fund 테마: 결론 문장은 고운바탕, 나머지 글과 숫자는 IBM Plex Sans KR.
// next/font가 빌드 때 받아 셀프호스팅하므로 런타임 외부 요청 없음.
// preload: false. next/font가 한글 슬라이스에 subset 주석이 없어 굵은 슬라이스를 전량 preload하고 본문 400 한글은 빠뜨린다(sunlight 실측)
const batang = Gowun_Batang({ subsets: ["latin"], weight: ["400", "700"], variable: "--font-batang", display: "swap", preload: false })
const plex = IBM_Plex_Sans_KR({ subsets: ["latin"], weight: ["400", "600", "700"], variable: "--font-plex", display: "swap", preload: false })

// searchParams를 읽지 않는다. 라우트를 정적으로 유지해 CDN 캐시를 살린다 (crowd/page.tsx 규약)
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#14201c",
}

export const metadata: Metadata = {
  title: "클린광진 상황실 | 광진구 무단투기 분석",
  description:
    "민원·과태료·건축물대장·인구를 100m 격자에 결합한 광진구 무단투기 발생구조 분석. 무엇이든 물어보면 데이터로 답하는 질의응답 중심 상황실.",
  robots: { index: false, follow: false }, // 암호 게이트 내부용. 색인 제외
}

export default function DumpingPage() {
  return (
    <div className={`${batang.variable} ${plex.variable} contents`}>
      {/* 첫 페인트 전에 html[data-theme]를 정한다(깜빡임 방지). 라이트·다크는 localStorage dump-theme */}
      <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      <DumpingClient />
    </div>
  )
}
