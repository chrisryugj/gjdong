import type { Metadata, Viewport } from "next"
import { Gowun_Batang, IBM_Plex_Sans_KR } from "next/font/google"
import SnowClient from "@/components/snow/client"
import { THEME_INIT_SCRIPT } from "@/components/dumping/theme"

// /dumping과 같은 서체(결론 문장 고운바탕, 본문·숫자 IBM Plex Sans KR)와 테마 초기화
const batang = Gowun_Batang({ subsets: ["latin"], weight: ["400", "700"], variable: "--font-batang", display: "swap", preload: false })
const plex = IBM_Plex_Sans_KR({ subsets: ["latin"], weight: ["400", "600", "700"], variable: "--font-plex", display: "swap", preload: false })

export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover", themeColor: "#e9e3d3" }

export const metadata: Metadata = {
  title: "광진 제설 온톨로지 | 겨울철 제설대책 상황판",
  description: "도로열선·제설함·염화칼슘보관함·모래주머니 공공데이터 4종과 자연재해대책법·광진구 조례·서울시 대응 단계를 하나의 지식그래프로 묶은 광진구 제설대책 상황판. 적설 예보로 단계를 판정하고 동원 자원을 지도에 보인다.",
}

export default function SnowPage() {
  return (
    <div className={`${batang.variable} ${plex.variable} contents`}>
      <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      <SnowClient />
    </div>
  )
}
