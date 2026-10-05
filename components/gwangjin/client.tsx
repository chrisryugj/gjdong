"use client"

import dynamic from "next/dynamic"
import CrowdShell from "@/components/crowd/crowd-shell"

// /gwangjin = crowd 관제판의 광진 고정 서피스 — SSR 제외 사유는 dashboard-client.tsx와 동일
const CrowdDashboard = dynamic(() => import("@/components/crowd/crowd-dashboard"), { ssr: false, loading: () => <CrowdShell /> })

export default function GwangjinClient() {
  return <CrowdDashboard fixedCity="gwangjin" />
}
