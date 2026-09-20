"use client"

import dynamic from "next/dynamic"

// MapLibre 등 브라우저 전용 의존 때문에 ssr:false
const SnowDashboard = dynamic(() => import("./snow-dashboard"), { ssr: false })

export default function SnowClient() {
  return <SnowDashboard />
}
