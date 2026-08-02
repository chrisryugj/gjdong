import type { Metadata, Viewport } from "next"
import CrowdDashboard from "@/components/crowd/crowd-dashboard"

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0b0f14",
}

export const metadata: Metadata = {
  title: "서울 인파실록 — 실시간 인구밀집 상황판 | 표준주소실록",
  description:
    "서울 주요 명소 121곳의 실시간 혼잡도를 한눈에. 주소를 검색하면 근처 명소의 인파 상황과 12시간 예측까지 알려드립니다.",
  openGraph: {
    title: "서울 인파실록 — 실시간 인구밀집 상황판",
    description: "서울 121곳 실시간 혼잡도 + 12시간 예측 + 주소 기반 근처 명소 인파 확인",
  },
}

export default function CrowdPage() {
  return <CrowdDashboard />
}
