import type { Metadata, Viewport } from "next"
import { Fraunces } from "next/font/google"
import DumpingClient from "@/components/dumping/client"

// 프리미엄 에디토리얼(2026-09-17): 숫자·항목 번호·헤더 수치는 Fraunces 세리프(가변, 광학 크기·SOFT 축). 한글 본문은 SUIT 그대로.
// next/font가 빌드 때 받아 셀프호스팅하므로 런타임 외부 요청 없음
const fraunces = Fraunces({ subsets: ["latin"], axes: ["opsz", "SOFT"], style: ["normal", "italic"], variable: "--font-fraunces", display: "swap" })

// searchParams를 읽지 않는다. 라우트를 정적으로 유지해 CDN 캐시를 살린다 (crowd/page.tsx 규약)
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0b0f14",
}

export const metadata: Metadata = {
  title: "클린광진 상황실 | 광진구 무단투기 분석",
  description:
    "민원·과태료·건축물대장·인구를 100m 격자에 결합한 광진구 무단투기 발생구조 분석. 무엇이든 물어보면 데이터로 답하는 질의응답 중심 상황실.",
  robots: { index: false, follow: false }, // 암호 게이트 내부용. 색인 제외
}

export default function DumpingPage() {
  return (
    <div className={`${fraunces.variable} contents`}>
      <DumpingClient />
    </div>
  )
}
