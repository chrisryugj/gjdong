"use client"

import { useEffect, useRef, useState } from "react"
import { textColor } from "@/lib/crowd/seoul-rtd"
import { useLang } from "@/components/crowd/lang-context"

export const LEVEL_ORDER = ["붐빔", "약간 붐빔", "보통", "여유"] as const

export type SortMode = "busy" | "calm" | "name"

// 목적 프리셋 — 혼잡도·카테고리 필터 조합 (부모/커플 대표 시나리오). 라벨은 i18n 사전 키
export const PRESETS = [
  { key: "kids", tKey: "presetKids", categories: ["공원", "고궁·문화유산"], levels: ["여유", "보통"] },
  { key: "date", tKey: "presetDate", categories: ["발달상권", "관광특구", "고궁·문화유산"], levels: ["여유", "보통"] },
  { key: "hot", tKey: "presetHot", categories: [], levels: ["붐빔", "약간 붐빔"] },
] as const
export type PresetKey = (typeof PRESETS)[number]["key"]

export interface AddressPin {
  label: string
  lat: number
  lng: number
}

export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLng = ((lng2 - lng1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

export function distanceM(lat1: number, lng1: number, lat2: number, lng2: number): number {
  return haversineKm(lat1, lng1, lat2, lng2) * 1000
}

export function formatKm(km: number): string {
  return km < 1 ? `${Math.round(km * 1000)}m` : `${km.toFixed(1)}km`
}

export function formatMeters(meters: number): string {
  return meters >= 1000 ? `${(meters / 1000).toFixed(1)}km` : `${meters}m`
}

export function formatClock(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", hour12: false })
}

/** 넘칠 때만 좌우로 천천히 왕복하는 자동 마퀴 — 푸터 출처처럼 한 줄 고정 영역용.
 * 폭이 충분하면 정적 표시 그대로, 도시·언어 전환에 따른 내용 변화는 ResizeObserver가 재측정 */
export function AutoMarquee({ children, className }: { children: React.ReactNode; className?: string }) {
  const outerRef = useRef<HTMLDivElement>(null)
  const innerRef = useRef<HTMLSpanElement>(null)
  const [shift, setShift] = useState(0)

  useEffect(() => {
    const measure = () => {
      const outer = outerRef.current
      const inner = innerRef.current
      if (!outer || !inner) return
      setShift(Math.min(0, outer.clientWidth - inner.scrollWidth))
    }
    measure()
    const observer = new ResizeObserver(measure)
    if (outerRef.current) observer.observe(outerRef.current)
    if (innerRef.current) observer.observe(innerRef.current)
    return () => observer.disconnect()
  }, [])

  return (
    <div ref={outerRef} className={`min-w-0 overflow-hidden ${className ?? ""}`}>
      <span
        ref={innerRef}
        className="inline-block whitespace-nowrap"
        style={
          shift < 0
            ? ({
                animation: `crowd-marquee ${Math.max(7, Math.round(-shift / 20))}s linear 2s infinite alternate`,
                "--crowd-marquee-shift": `${shift}px`,
              } as React.CSSProperties)
            : undefined
        }
      >
        {children}
      </span>
    </div>
  )
}

/** 혼잡도 알약 뱃지 — 목록·근처·상세 공용 (선택 언어로 표시) */
export function LevelBadge({ level, color, light }: { level: string; color: string; light: boolean }) {
  const { level: trLv } = useLang()
  return (
    <span
      className="shrink-0 rounded-full px-2 py-0.5 text-[12px] font-semibold"
      style={{ color: textColor(color, light), background: `${color}1a` }}
    >
      {trLv(level)}
    </span>
  )
}
