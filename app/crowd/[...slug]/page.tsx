import { notFound } from "next/navigation"
import CrowdDashboard from "@/components/crowd/dashboard-client"
import { buildCrowdMetadata, crowdViewport } from "@/lib/crowd/crowd-metadata"
import { crowdStaticSlugs, parseCrowdSlug } from "@/lib/crowd/crowd-url"

// 언어·도시 변형(19개)을 빌드 시점에 전부 프리렌더한다. dynamicParams=false라 그 밖의
// 경로는 정적 404 — 어떤 요청도 함수를 깨우지 않는다.
// /crowd/report는 정적 세그먼트가 캐치올보다 우선하므로 이 라우트에 걸리지 않는다.
export const dynamicParams = false
export const viewport = crowdViewport

export function generateStaticParams() {
  return crowdStaticSlugs()
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string[] }> }) {
  const variant = parseCrowdSlug((await params).slug)
  if (!variant) notFound()
  return buildCrowdMetadata(variant.lang, variant.city)
}

export default async function CrowdVariantPage({ params }: { params: Promise<{ slug: string[] }> }) {
  if (!parseCrowdSlug((await params).slug)) notFound()
  // 초기 언어·도시는 클라이언트가 경로에서 읽는다 (쿼리 우선, 그다음 경로)
  return <CrowdDashboard />
}
