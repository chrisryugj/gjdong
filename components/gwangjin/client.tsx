"use client"

import dynamic from "next/dynamic"

// /gwangjin = crowd 관제판의 광진 고정 서피스 — SSR 제외 사유는 dashboard-client.tsx와 동일
const CrowdDashboard = dynamic(() => import("@/components/crowd/crowd-dashboard"), { ssr: false })

export default function GwangjinClient() {
  return <CrowdDashboard fixedCity="gwangjin" />
}
