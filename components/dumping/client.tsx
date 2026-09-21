"use client"

import dynamic from "next/dynamic"
import DumpingLoadingScreen from "./loading-screen"
import { startDumpingData } from "./data-early"

// MapLibre·Three 등 브라우저 전용 의존 때문에 ssr:false. 청크가 오는 동안(사파리에서 수 초) 빈 화면 대신 로딩 카드,
// 인증 확인과 데이터는 청크와 같이 받기 시작(/snow 5라운드 data-early 이식)
const DumpingDashboard = dynamic(() => import("./dumping-dashboard"), { ssr: false, loading: () => <DumpingLoadingScreen /> })

export default function DumpingClient() {
  if (typeof window !== "undefined") startDumpingData()
  return <DumpingDashboard />
}
