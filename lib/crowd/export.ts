// 상황실 내보내기 — CSV(전 지점 스냅샷)·상황보고 문안(감시 지점). 순수 함수 (테스트 대상).
// 산출물은 한국 행정 문서 성격이라 한국어 고정 — UI 버튼 라벨만 다국어.

import type { CrowdDetail, CrowdDisaster, CrowdExtra, CrowdSpot } from "@/lib/crowd/seoul-rtd"
import type { CityId } from "@/lib/crowd/cities"
import { districtOf } from "@/lib/crowd/districts"

const BASIS_LABEL: Record<string, string> = {
  ppl: "인파",
  access: "주차·도로",
  wait: "대기시간",
  none: "정보 없음",
}

function csvCell(v: string | number): string {
  const s = String(v)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/** 현재 도시 전 지점 스냅샷 CSV — BOM+CRLF (Excel 한글 호환). extra는 부르지 않는다(121콜 방지) */
export function buildCsv({
  city,
  spots,
  updatedAt,
}: {
  city: CityId
  spots: CrowdSpot[]
  updatedAt: string | null
}): string {
  const rows: Array<Array<string | number>> = [
    ["순번", "지점", "자치구", "카테고리", "등급", "등급숫자", "산출근거", "위도", "경도", "기준시각"],
  ]
  spots.forEach((s, i) => {
    rows.push([
      i + 1,
      s.name,
      districtOf(city, s.name) ?? "",
      s.category,
      s.level,
      s.levelNum,
      BASIS_LABEL[s.basis ?? "ppl"],
      s.lat,
      s.lng,
      updatedAt ?? "",
    ])
  })
  return "﻿" + rows.map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n"
}

export function csvFilename(city: CityId, at: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0")
  return `crowd-${city}-${at.getFullYear()}${pad(at.getMonth() + 1)}${pad(at.getDate())}-${pad(at.getHours())}${pad(at.getMinutes())}.csv`
}

/** 감시 지점 상황보고 문안 — 붐빔 우선, 인원(있으면)·사고통제·재난문자 특이사항 포함 */
export function buildReport({
  cityName,
  watchSpots,
  details,
  extras,
  disaster,
  at,
}: {
  cityName: string
  watchSpots: CrowdSpot[]
  details: Map<string, CrowdDetail>
  extras: Map<string, CrowdExtra>
  disaster: CrowdDisaster[]
  at: Date
}): string {
  const pad = (n: number) => String(n).padStart(2, "0")
  const stamp = `${at.getFullYear()}.${pad(at.getMonth() + 1)}.${pad(at.getDate())} ${pad(at.getHours())}:${pad(at.getMinutes())}`

  const counts: Record<string, number> = {}
  for (const s of watchSpots) counts[s.level] = (counts[s.level] ?? 0) + 1
  const summary = ["붐빔", "약간 붐빔", "보통", "여유", "정보 없음"]
    .filter((lv) => counts[lv])
    .map((lv) => `${lv} ${counts[lv]}`)
    .join(" · ")

  const lines: string[] = [`[${cityName} 인파 상황보고] ${stamp}`, `감시 ${watchSpots.length}곳 — ${summary}`, ""]

  for (const s of [...watchSpots].sort((a, b) => b.levelNum - a.levelNum)) {
    const d = details.get(s.name)
    const now = d && d.nowIndex >= 0 ? d.series[d.nowIndex] : null
    const alerts = (extras.get(s.name)?.alerts ?? []).filter((a) => a.type || a.info)
    let line = `· ${s.name} — ${s.level}`
    if (now && now.people > 0) line += ` (약 ${now.people.toLocaleString("ko-KR")}명)`
    if (alerts.length > 0) {
      const kinds = Array.from(new Set(alerts.map((a) => a.type).filter(Boolean)))
      line += ` — 특이: ${kinds.join("·")} ${alerts.length}건`
    }
    lines.push(line)
  }

  if (disaster.length > 0) {
    lines.push("", "※ 오늘 재난문자")
    for (const d of disaster.slice(0, 5)) lines.push(`- [${d.type} ${d.step}] ${d.content}`)
  }

  lines.push("", "— 인파레이더 자동 생성 (서울시 실시간 도시데이터 등 공공 개방 데이터 기반)")
  return lines.join("\n")
}
