import type { Metadata, Viewport } from "next"
import { Gowun_Batang } from "next/font/google"
import "./plex-kr.css"
import DumpingClient from "@/components/dumping/client"
import { FONT_SCALE_INIT_SCRIPT, THEME_INIT_SCRIPT } from "@/lib/dumping/init-scripts"

// 17라운드(2026-09-19) sunlight-fund 테마: 결론 문장은 고운바탕, 나머지 글과 숫자는 IBM Plex Sans KR.
// 고운바탕은 next/font가 빌드 때 받아 셀프호스팅. preload: false. next/font가 한글 슬라이스에 subset 주석이 없어
// 굵은 슬라이스를 전량 preload하고 본문 400 한글은 빠뜨린다(sunlight 실측)
// Plex는 next/font를 쓰지 않는다(2026-09-22). 구글 슬라이스의 gasp 표가 9~16px 안티에일리어싱을 꺼 윈도에서 글자가 깨져,
// scripts/patch-plex-kr-gasp.py로 gasp를 고친 파일을 public/fonts/plex-kr에 두고 ./plex-kr.css(.plex-kr가 --font-plex)로 싣는다
const batang = Gowun_Batang({ subsets: ["latin"], weight: ["400", "700"], variable: "--font-batang", display: "swap", preload: false })

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
    <div className={`${batang.variable} plex-kr contents`}>
      {/* 첫 페인트 전에 html[data-theme]·[data-fontscale]를 정한다(깜빡임 방지). localStorage dump-theme·dump-font-scale */}
      <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT + FONT_SCALE_INIT_SCRIPT }} />
      <DumpingClient />
    </div>
  )
}
