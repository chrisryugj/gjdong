"use client"

import dynamic from "next/dynamic"

// Leaflet 등 브라우저 전용 의존 때문에 ssr:false. 클라이언트 래퍼에서만 허용되는 옵션
const DumpingDashboard = dynamic(() => import("./dumping-dashboard"), { ssr: false })

export default function DumpingClient() {
  return <DumpingDashboard />
}
