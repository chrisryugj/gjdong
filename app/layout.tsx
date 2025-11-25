import type React from "react"
import type { Metadata } from "next"
import { Geist, Geist_Mono } from "next/font/google"
import "./globals.css"

const geistSans = Geist({ subsets: ["latin"] })
const geistMono = Geist_Mono({ subsets: ["latin"] })

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
        url: "/og-image.jpg",
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
    images: ["/og-image.jpg"],
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="ko">
      <body className={`${geistSans.variable} ${geistMono.variable} font-sans antialiased`}>{children}</body>
    </html>
  )
}
