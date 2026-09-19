import type { Metadata, Viewport } from "next"
import { Manrope, Noto_Serif_KR } from "next/font/google"
import DumpingClient from "@/components/dumping/client"

// 지도 전면 디자인(2026-09-18): 숫자·항목 번호·수치는 Manrope, 결론 머리기사는 Noto Serif KR. 한글 본문은 SUIT 그대로.
// next/font가 빌드 때 받아 셀프호스팅하므로 런타임 외부 요청 없음
const manrope = Manrope({ subsets: ["latin"], weight: ["500", "600", "700", "800"], variable: "--font-manrope", display: "swap" })
const serifKr = Noto_Serif_KR({ subsets: ["latin"], weight: ["500", "600", "700"], variable: "--font-serif-kr", display: "swap" })

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
    <div className={`${manrope.variable} ${serifKr.variable} contents`}>
      <DumpingClient />
    </div>
  )
}
