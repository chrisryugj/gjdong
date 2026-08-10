"use client"

import dynamic from "next/dynamic"

// SSR 제외 — /crowd와 같은 이유 (마운트 후 API 데이터로만 그려져 서버 HTML이 로딩 화면과 같다.
// Fluid Active CPU 절약, dashboard-client.tsx 참조)
const GwangjinDashboard = dynamic(() => import("./gwangjin-dashboard"), { ssr: false })

export default GwangjinDashboard
