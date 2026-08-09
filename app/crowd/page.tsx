import CrowdDashboard from "@/components/crowd/dashboard-client"
import { buildCrowdMetadata, crowdViewport } from "@/lib/crowd/crowd-metadata"

// 정적 메타데이터 — searchParams를 읽는 순간 라우트 전체가 동적이 되어 조회당 함수 1회가
// 강제된다(CDN 캐시 불가, Fluid Active CPU 소진의 원인). 언어·도시 변형은 [...slug] 경로가 맡는다.
export const viewport = crowdViewport
export const metadata = buildCrowdMetadata("ko", "seoul")

export default function CrowdPage() {
  return <CrowdDashboard />
}
