import type React from "react"
import type { Metadata } from "next"
import { Geist, Geist_Mono } from "next/font/google"
import localFont from "next/font/local"
import { Analytics } from "@vercel/analytics/next"
import "leaflet/dist/leaflet.css"
import "./globals.css"

const geistSans = Geist({ subsets: ["latin"], variable: "--font-geist-sans" })
const geistMono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono" })
// SUIT 가변 폰트(100~900) 셀프호스팅 — 인파레이더 본문 서체 (globals.css .crowd-page에서 사용)
const suit = localFont({
  src: "./fonts/SUIT-Variable.woff2",
  variable: "--font-suit",
  weight: "100 900",
  display: "swap",
})

export const metadata: Metadata = {
  title: "표준주소실록",
  description: "주소를 표준 형식으로 변환하는 도구 - 도로명, 지번, 행정동 주소를 한번에 변환",
  generator: "v0.app",
  metadataBase: new URL("https://gjdong.vercel.app"),
  openGraph: {
    title: "표준주소실록",
    description: "주소를 표준 형식으로 변환하는 도구 - 도로명, 지번, 행정동 주소를 한번에 변환",
    type: "website",
    locale: "ko_KR",
    url: "https://gjdong.vercel.app/",
    images: [
      {
        url: "/og-image.jpg?v=3.1",
        width: 1200,
        height: 630,
        alt: "표준주소실록 - 주소 변환 도구",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "표준주소실록",
    description: "주소를 표준 형식으로 변환하는 도구 - 도로명, 지번, 행정동 주소를 한번에 변환",
    images: ["/og-image.jpg?v=3.1"],
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="ko">
      <body className={`${geistSans.variable} ${geistMono.variable} ${suit.variable} font-sans antialiased`}>
        {children}
        <Analytics />
      </body>
    </html>
  )
}
