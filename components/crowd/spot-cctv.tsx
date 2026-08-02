"use client"

import { useMemo, useState } from "react"
import { Cctv, ChevronDown } from "lucide-react"
import { cctvPlayerUrl, cctvStreamUrl, supportsNativeHls, type CrowdCctv } from "@/lib/crowd/seoul-rtd"
import { distanceM, formatMeters } from "@/components/crowd/shared"

/** 주변 CCTV 목록 + 인라인 플레이어 — 차트에서 본 붐빔을 바로 눈으로 확인하는 흐름 */
export default function SpotCctv({ cctv, origin }: { cctv: CrowdCctv[]; origin?: { lat: number; lng: number } }) {
  const [openCctv, setOpenCctv] = useState<string | null>(null)
  const nativeHls = useMemo(() => supportsNativeHls(), [])

  const cctvList = useMemo(() => {
    const list = cctv.map((c) => ({
      ...c,
      meters: origin ? Math.round(distanceM(origin.lat, origin.lng, c.lat, c.lng)) : null,
    }))
    return list.sort((a, b) => (a.meters ?? 0) - (b.meters ?? 0))
  }, [cctv, origin])

  if (cctvList.length === 0) return null

  return (
    <div id="crowd-sec-cctv" className="scroll-mt-2">
      <h3 className="mb-2 text-[12px] font-medium uppercase tracking-wider text-[var(--cp-text-dim)]">
        주변 CCTV <span className="font-mono tabular-nums">({cctvList.length})</span>
      </h3>
      <ul className="overflow-hidden rounded-md border border-[var(--cp-border)]">
        {cctvList.map((c) => {
          const isOpen = openCctv === c.streamId
          const playable = c.src.length > 0
          return (
            <li key={c.streamId || c.name} className="border-b border-[var(--cp-border-faint)] last:border-b-0">
              <button
                onClick={() => playable && setOpenCctv(isOpen ? null : c.streamId)}
                disabled={!playable}
                className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left transition-colors enabled:hover:bg-[var(--cp-hover)] disabled:cursor-default"
              >
                <Cctv className="h-3.5 w-3.5 shrink-0 text-[var(--cp-text-dim)]" />
                <span className="min-w-0 flex-1 truncate text-[14px] text-[var(--cp-text)]">{c.name}</span>
                {c.meters != null && (
                  <span className="shrink-0 font-mono text-[12px] tabular-nums text-[var(--cp-text-dim)]">
                    {formatMeters(c.meters)}
                  </span>
                )}
                {playable ? (
                  <ChevronDown
                    className={`h-3.5 w-3.5 shrink-0 text-[var(--cp-text-dim)] transition-transform ${isOpen ? "rotate-180" : ""}`}
                  />
                ) : (
                  <span className="shrink-0 text-[11px] text-[var(--cp-text-faint)]">영상 없음</span>
                )}
              </button>
              {isOpen && (
                <div className="aspect-video w-full bg-black">
                  {nativeHls ? (
                    <video
                      src={cctvStreamUrl(c)}
                      className="h-full w-full object-contain"
                      autoPlay
                      muted
                      playsInline
                    />
                  ) : (
                    <iframe
                      src={cctvPlayerUrl(c)}
                      title={`CCTV ${c.name}`}
                      className="h-full w-full border-0"
                      allow="autoplay"
                    />
                  )}
                </div>
              )}
            </li>
          )
        })}
      </ul>
      <p className="mt-1 text-[11px] text-[var(--cp-text-faint)]">탭하면 실시간 영상 (서울시 교통 CCTV) · 명소에 따라 없을 수 있어요</p>
    </div>
  )
}
