"use client"

import { useEffect, useMemo, useState } from "react"
import { ArrowLeft, LoaderCircle, Printer } from "lucide-react"
import type { CrowdDetail, CrowdDisaster, CrowdExtra, CrowdSpot } from "@/lib/crowd/seoul-rtd"
import { CITIES, CITY_CAPS, type CityId } from "@/lib/crowd/cities"
import { buildReportModel, type ReportModel } from "@/lib/crowd/export"

/**
 * 인쇄용 상황보고서 — A4 결재 첨부물이 목표. window.print() → PDF 저장이 곧 산출물.
 * 산출물 한국어 고정 원칙(CSV·상황보고 문안과 동일) — 행정 문서 성격이라 UI 언어와 무관.
 * 데이터 예의는 상황실과 동일: 상세 팬아웃은 opsDetail="full"(서울)만, extra는 감시 지점만(≤12).
 * 전 지점 보고에서는 extra를 부르지 않는다(121콜 방지) — 특이사항 열이 비는 것으로 명시.
 */
export default function ReportClient({ city, watch }: { city: CityId; watch: string[] }) {
  const [model, setModel] = useState<ReportModel | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    let cancelled = false
    const run = async () => {
      const res = await fetch(`/api/crowd?city=${city}`)
      if (!res.ok) throw new Error("bad status")
      const data = (await res.json()) as { spots: CrowdSpot[]; disaster?: CrowdDisaster[] }
      const byName = new Map(data.spots.map((s) => [s.name, s]))
      const watchSpots = watch.map((n) => byName.get(n)).filter((s): s is CrowdSpot => s != null)

      // 인원 상세 — 서울(full)만, 감시 지점만, 동시성 3 (상황실 팬아웃 예의와 동일)
      const details = new Map<string, CrowdDetail>()
      if (CITY_CAPS[city].opsDetail === "full" && watchSpots.length > 0) {
        const queue = [...watchSpots]
        const worker = async () => {
          while (queue.length > 0 && !cancelled) {
            const s = queue.shift()
            if (!s) return
            try {
              const r = await fetch(`/api/crowd?spot=${encodeURIComponent(s.name)}&city=${city}`)
              if (r.ok) details.set(s.name, (await r.json()) as CrowdDetail)
            } catch {
              // 한 지점 실패 = 그 행만 인원 없이
            }
          }
        }
        await Promise.all([worker(), worker(), worker()])
      }

      // 사고·통제 특이사항 — extra 있는 도시의 감시 지점만
      const extras = new Map<string, CrowdExtra>()
      if (CITY_CAPS[city].extra && watchSpots.length > 0) {
        const settled = await Promise.allSettled(
          watchSpots.map(async (s) => {
            const r = await fetch(`/api/crowd/extra?spot=${encodeURIComponent(s.name)}&city=${city}`)
            if (!r.ok) throw new Error("bad status")
            return [s.name, (await r.json()) as CrowdExtra] as const
          }),
        )
        for (const r of settled) if (r.status === "fulfilled") extras.set(r.value[0], r.value[1])
      }

      if (cancelled) return
      setModel(
        buildReportModel({
          city,
          cityName: CITIES[city].nameKo,
          spots: data.spots,
          watch,
          details,
          extras,
          disaster: data.disaster ?? [],
          at: new Date(),
        }),
      )
    }
    run().catch(() => !cancelled && setError(true))
    return () => {
      cancelled = true
    }
    // watch는 서버 컴포넌트가 URL에서 파싱해 내려준 고정 배열 — join이 내용 동등성을 대신한다
    // (exhaustive-deps는 이 레포 eslint에 미등록 — 대시보드 훅들과 같은 관례)
  }, [city, watch.join("|")])

  const scopeLabel = useMemo(() => {
    if (!model) return ""
    return model.scope === "watch" ? `감시 지점 ${model.totalCount}곳` : `전 지점 ${model.totalCount}곳`
  }, [model])

  if (error) {
    return (
      <div className="flex h-dvh items-center justify-center bg-white text-[14px] text-neutral-500">
        데이터를 불러오지 못했습니다. 잠시 후 다시 시도해주세요.
      </div>
    )
  }
  if (!model) {
    return (
      <div className="flex h-dvh items-center justify-center bg-white">
        <LoaderCircle className="h-6 w-6 animate-spin text-neutral-400" />
      </div>
    )
  }

  return (
    <div className="min-h-dvh bg-neutral-100 text-neutral-900 print:bg-white">
      {/* @page 규격 — A4 세로, 결재 문서 여백 */}
      <style>{`@page { size: A4 portrait; margin: 18mm 16mm; } @media print { .report-sheet { box-shadow: none !important; margin: 0 !important; width: auto !important; min-height: 0 !important; padding: 0 !important; } }`}</style>

      {/* 화면 전용 툴바 */}
      <div className="sticky top-0 z-10 border-b border-neutral-200 bg-white/90 backdrop-blur print:hidden">
        <div className="mx-auto flex max-w-[210mm] items-center gap-3 px-4 py-2.5">
          <button
            onClick={() => window.history.back()}
            className="flex items-center gap-1.5 text-[13px] text-neutral-500 hover:text-neutral-900"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> 돌아가기
          </button>
          <span className="text-[13px] text-neutral-400">
            인쇄 대화상자에서 &ldquo;PDF로 저장&rdquo;을 선택하면 결재 첨부용 PDF가 됩니다
          </span>
          <span className="flex-1" />
          <button
            onClick={() => window.print()}
            className="flex h-8 items-center gap-1.5 rounded-md bg-neutral-900 px-3 text-[13px] font-medium text-white hover:bg-neutral-700"
          >
            <Printer className="h-3.5 w-3.5" /> 인쇄 · PDF 저장
          </button>
        </div>
      </div>

      {/* 문서 본문 — 화면에서는 A4 시트 프리뷰, 인쇄에서는 그대로 문서 */}
      <div className="report-sheet mx-auto my-6 min-h-[297mm] w-[210mm] max-w-full bg-white px-[16mm] py-[18mm] shadow-sm print:my-0">
        {/* 표제부 */}
        <header className="border-b-2 border-neutral-900 pb-4">
          <p className="font-mono text-[11px] tracking-widest text-neutral-400">
            {CITIES[city].nameKo.toUpperCase()} CROWD RADAR — SITUATION REPORT
          </p>
          <h1 className="mt-1 text-[26px] font-bold tracking-tight">{model.cityName} 인파 상황보고서</h1>
        </header>

        {/* 메타 표 */}
        <dl className="mt-4 grid grid-cols-[92px_1fr_92px_1fr] gap-x-3 gap-y-1.5 border-b border-neutral-200 pb-4 text-[12.5px]">
          <dt className="text-neutral-400">작성 기준</dt>
          <dd className="font-mono tabular-nums">{model.stamp}</dd>
          <dt className="text-neutral-400">대상</dt>
          <dd>{scopeLabel}</dd>
          <dt className="text-neutral-400">작성 방식</dt>
          <dd className="col-span-3">인파레이더 자동 생성 — 공공 개방 데이터 실시간 조회 (수기 가공 없음)</dd>
        </dl>

        {/* 등급 분포 */}
        <section className="mt-5">
          <h2 className="text-[13px] font-semibold tracking-wide text-neutral-500">1. 등급 분포</h2>
          <div className="mt-2 flex gap-6 border-y border-neutral-200 py-3">
            {model.summary.map((s) => (
              <div key={s.level} className="flex items-baseline gap-2">
                <span className="inline-block h-2.5 w-2.5 rounded-full border border-neutral-300" style={{ background: s.color }} />
                <span className="text-[13px]">{s.level}</span>
                <span className="font-mono text-[18px] font-bold tabular-nums">{s.count}</span>
              </div>
            ))}
          </div>
        </section>

        {/* 지점별 표 */}
        <section className="mt-5">
          <h2 className="text-[13px] font-semibold tracking-wide text-neutral-500">2. 지점별 현황 (등급 내림차순)</h2>
          <table className="mt-2 w-full border-collapse text-[12px] leading-snug">
            <thead>
              <tr className="border-b border-neutral-900 text-left text-[11px] text-neutral-400">
                <th className="py-1.5 pr-2 font-normal">No.</th>
                <th className="py-1.5 pr-2 font-normal">지점</th>
                <th className="py-1.5 pr-2 font-normal">자치구</th>
                <th className="py-1.5 pr-2 font-normal">등급</th>
                <th className="py-1.5 pr-2 font-normal">산출근거</th>
                <th className="py-1.5 pr-2 font-normal">실측 인원</th>
                <th className="py-1.5 font-normal">특이사항</th>
              </tr>
            </thead>
            <tbody>
              {model.rows.map((r) => (
                <tr key={r.name} className="border-b border-neutral-100">
                  <td className="py-1.5 pr-2 font-mono tabular-nums text-neutral-400">{String(r.idx).padStart(2, "0")}</td>
                  <td className="py-1.5 pr-2 font-medium">{r.name}</td>
                  <td className="py-1.5 pr-2 text-neutral-500">{r.district || "—"}</td>
                  <td className="py-1.5 pr-2">
                    {/* 색 + 텍스트 병기 — 흑백 인쇄에서도 등급이 살아남는다 */}
                    <span className="inline-flex items-center gap-1.5">
                      <span className="inline-block h-2 w-2 rounded-full border border-neutral-300" style={{ background: r.color }} />
                      {r.level}
                    </span>
                  </td>
                  <td className="py-1.5 pr-2 text-neutral-500">{r.basis}</td>
                  <td className="py-1.5 pr-2 font-mono tabular-nums">{r.people || "—"}</td>
                  <td className="py-1.5">{r.notes || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {model.scope === "all" && (
            <p className="mt-1.5 text-[11px] text-neutral-400">
              ※ 실측 인원·특이사항은 감시 지점을 지정한 보고서(상황실 → 보고서 출력)에서만 조회합니다.
            </p>
          )}
        </section>

        {/* 재난문자 */}
        {model.disasters.length > 0 && (
          <section className="mt-5">
            <h2 className="text-[13px] font-semibold tracking-wide text-neutral-500">3. 오늘 재난문자</h2>
            <ul className="mt-2 space-y-1.5 border-y border-neutral-200 py-3 text-[12px] leading-relaxed">
              {model.disasters.slice(0, 5).map((d, i) => (
                <li key={i}>
                  <b>
                    [{d.type} {d.step}]
                  </b>{" "}
                  {d.content}
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* 출처 각주 */}
        <footer className="mt-8 border-t border-neutral-200 pt-3 text-[10.5px] leading-relaxed text-neutral-400">
          <p>
            데이터 출처: {CITIES[city].sourceUrl} 외 공공 개방 데이터 · 등급 산출식 공개 문서:
            github.com/chrisryugj/gjdong/blob/main/docs/crowd-methodology.md
          </p>
          <p>본 보고서는 조회 시점의 실시간 데이터 스냅샷이며, 원천 데이터의 갱신 주기에 따라 최대 수 분의 지연이 있을 수 있습니다.</p>
        </footer>
      </div>
    </div>
  )
}
