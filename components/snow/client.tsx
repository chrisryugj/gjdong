"use client"

import dynamic from "next/dynamic"
import SnowLoadingScreen from "./loading"
import { startSnowData } from "./data-early"

// MapLibre 등 브라우저 전용 의존 때문에 ssr:false. 청크가 오는 동안(사파리에서 수 초) 빈 화면 대신 로딩 카드, 데이터는 청크와 같이 받기 시작(5라운드)
const SnowDashboard = dynamic(() => import("./snow-dashboard"), { ssr: false, loading: () => <SnowLoadingScreen /> })

export default function SnowClient() {
  if (typeof window !== "undefined") startSnowData()
  return <SnowDashboard />
}
