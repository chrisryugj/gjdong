import type { Metadata, Viewport } from "next"
import { Gowun_Batang, IBM_Plex_Sans_KR } from "next/font/google"
import SnowClient from "@/components/snow/client"
// /dumping과 같은 서체(결론 문장 고운바탕, 본문·숫자 IBM Plex Sans KR). 테마는 /snow만 다크 기본(겨울 밤 상황실): 저장된 선택이 없으면 dark, 스위치를 누르면 공용 키(dump-theme)에 저장
const SNOW_THEME_INIT = `(function(){try{var t=localStorage.getItem("dump-theme");document.documentElement.setAttribute("data-theme",t==="light"?"light":"dark")}catch(e){document.documentElement.setAttribute("data-theme","dark")}})();`
const batang = Gowun_Batang({ subsets: ["latin"], weight: ["400", "700"], variable: "--font-batang", display: "swap", preload: false })
const plex = IBM_Plex_Sans_KR({ subsets: ["latin"], weight: ["400", "600", "700"], variable: "--font-plex", display: "swap", preload: false })

export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover", themeColor: "#0b1622" }

export const metadata: Metadata = {
  title: "광진 제설 상황판 | 눈 오기 전에 어디가 비었는지",
  description: "행안부 적설취약구간·상습결빙구간과 광진구 도로열선·제설함·염화칼슘보관함·모래주머니 공공데이터를 한 지도에 올려 열선도 자재도 없는 구간을 보입니다. 기상청 예보·특보로 서울시 대응 단계를 판정하고 근거는 그래프로 연결합니다.",
}

export default function SnowPage() {
  return (
    <div className={`${batang.variable} ${plex.variable} contents`}>
      <script dangerouslySetInnerHTML={{ __html: SNOW_THEME_INIT }} />
      <SnowClient />
    </div>
  )
}
