import type { Metadata } from "next"
import ReportClient from "@/components/crowd/report/report-client"
import { isCityId, type CityId } from "@/lib/crowd/cities"
import { parseSpotsParam } from "@/lib/crowd/watchlist"

// 업무 산출물 페이지 — 검색 노출 불필요
export const metadata: Metadata = {
  title: "인파 상황보고서 — 인파레이더",
  robots: { index: false },
}

export default async function CrowdReportPage({
  searchParams,
}: {
  searchParams: Promise<{ city?: string; spots?: string }>
}) {
  const { city: cityRaw, spots: spotsRaw } = await searchParams
  const city: CityId = isCityId(cityRaw) ? cityRaw : "seoul"
  // ?spots= 는 감시 지점 보고, 없으면 전 지점 보고 (파싱 규칙은 상황실 딥링크와 동일)
  const watch = parseSpotsParam(spotsRaw ?? null)
  return <ReportClient city={city} watch={watch} />
}
