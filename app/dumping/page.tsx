import type { Metadata, Viewport } from "next"
import DumpingClient from "@/components/dumping/client"

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
  return <DumpingClient />
}
