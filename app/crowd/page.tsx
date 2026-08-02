import type { Metadata, Viewport } from "next"
import CrowdDashboard from "@/components/crowd/crowd-dashboard"

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#f7f6f3",
}

export const metadata: Metadata = {
  manifest: "/crowd-manifest.webmanifest",
  appleWebApp: { capable: true, title: "인파레이더", statusBarStyle: "default" },
  icons: { apple: "/crowd-icon-180.png" },
  title: "서울 인파레이더 — 실시간 인구밀집 상황판 | 표준주소실록",
  description:
    "서울 주요 명소 121곳의 실시간 혼잡도를 한눈에. 12시간 예측에 주차 여유·문화행사·따릉이·사고 통제 경고까지 알려드립니다.",
  openGraph: {
    title: "서울 인파레이더 — 실시간 인구밀집 상황판",
    description: "서울 121곳 실시간 혼잡도 + 주차·문화행사·따릉이·통제 경고까지 한 화면에",
    type: "website",
    locale: "ko_KR",
    url: "https://gjdong.vercel.app/crowd",
    images: [
      {
        url: "/og-crowd.jpg?v=2",
        width: 1200,
        height: 630,
        alt: "서울 인파레이더 — 실시간 혼잡도에 주차·행사·따릉이·통제 경고까지",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "서울 인파레이더 — 실시간 인구밀집 상황판",
    description: "서울 121곳 실시간 혼잡도 + 주차·문화행사·따릉이·CCTV 라이브",
    images: ["/og-crowd.jpg?v=2"],
  },
}

export default function CrowdPage() {
  return <CrowdDashboard />
}
