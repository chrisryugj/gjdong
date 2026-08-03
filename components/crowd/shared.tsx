"use client"

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
