"use client"

import dynamic from "next/dynamic"

// SSR 제외 래퍼 — 대시보드는 마운트 후 /api/crowd 데이터로만 그려져 서버 HTML이 로딩 화면과
// 사실상 같은데, generateMetadata의 searchParams 때문에 페이지가 매 조회 동적 렌더라
// 4,300줄 트리 SSR이 Fluid Active CPU를 태운다(Hobby 4h 한도의 주범). 렌더는 브라우저로 넘긴다.
const CrowdDashboard = dynamic(() => import("./crowd-dashboard"), { ssr: false })

export default CrowdDashboard
