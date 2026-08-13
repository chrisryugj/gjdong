import type { Metadata, Viewport } from "next"
import GwangjinDashboard from "@/components/gwangjin/client"

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0b0f14",
}

export const metadata: Metadata = {
  title: "광진 라이프 — 광진구 실시간 생활상황판",
  description:
    "광진구 주민을 위한 실시간 생활정보 — 지하철 도착, 응급실 가용병상, 문여는 약국, 명소 혼잡도, 도로 교통, 강우·하천 수위, 따릉이, 전기차 충전, 문화행사, 동별 생활인구 패턴.",
  alternates: { canonical: "https://gjdong.vercel.app/gwangjin" },
  manifest: "/gwangjin-manifest.webmanifest",
  appleWebApp: { capable: true, title: "광진 라이프", statusBarStyle: "default" },
  icons: {
    icon: [
      { url: "/gj-icon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/gj-icon-16.png", sizes: "16x16", type: "image/png" },
      { url: "/gj-icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: "/gj-icon-180.png",
  },
  openGraph: {
    title: "광진 라이프 — 광진구 실시간 생활상황판",
    description: "지하철 도착 · 응급실 병상 · 문여는 약국 · 혼잡도 · 도로 교통 · 따릉이 · EV충전 · 행사",
    type: "website",
    locale: "ko_KR",
    url: "https://gjdong.vercel.app/gwangjin",
    images: [{ url: "/og-gwangjin.png", width: 1200, height: 630, alt: "광진 라이프 — 광진구 실시간 생활상황판" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "광진 라이프 — 광진구 실시간 생활상황판",
    description: "지하철 도착 · 응급실 병상 · 문연 약국 · 명소 혼잡 · 도로 교통",
    images: ["/og-gwangjin.png"],
  },
}

export default function GwangjinPage() {
  return <GwangjinDashboard />
}
