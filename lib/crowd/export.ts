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

/** 전 지점 스냅샷 표 (헤더 포함) — CSV·XLSX가 같은 행을 쓴다 */
export function buildSnapshotRows({
  city,
  spots,
  updatedAt,
}: {
  city: CityId
  spots: CrowdSpot[]
  updatedAt: string | null
}): Array<Array<string | number>> {
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
  return rows
}

/** 현재 도시 전 지점 스냅샷 CSV — BOM+CRLF (Excel 한글 호환). extra는 부르지 않는다(121콜 방지) */
export function buildCsv(args: { city: CityId; spots: CrowdSpot[]; updatedAt: string | null }): string {
  const rows = buildSnapshotRows(args)
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

// ── 인쇄용 상황보고서 (/crowd/report) — 화면·인쇄가 같은 모델을 그린다. 순수 함수 (테스트 대상).

export interface ReportRow {
  idx: number
  name: string
  district: string
  category: string
  level: string
  levelNum: number
  color: string
  basis: string
  /** 실측 인원 구간 "6,500~7,000명" — 상세 없는 도시·지점은 빈 문자열 */
  people: string
  /** 사고·통제 특이사항 "교통사고·공사 2건" — extra 없는 도시는 빈 문자열 */
  notes: string
}

export interface ReportModel {
  cityName: string
  /** "2026.08.07 15:30" — 작성 기준시각 */
  stamp: string
  /** watch = 감시 지점 보고, all = 전 지점 보고 */
  scope: "watch" | "all"
  totalCount: number
  summary: Array<{ level: string; count: number; color: string }>
  rows: ReportRow[]
  disasters: CrowdDisaster[]
}

/** 보고서 모델 — watch가 비면 전 지점(등급 내림차순). 특이사항·인원은 주어진 맵에 있는 만큼만 */
export function buildReportModel({
  city,
  cityName,
  spots,
  watch,
  details,
  extras,
  disaster,
  at,
}: {
  city: CityId
  cityName: string
  spots: CrowdSpot[]
  watch: string[]
  details: Map<string, CrowdDetail>
  extras: Map<string, CrowdExtra>
  disaster: CrowdDisaster[]
  at: Date
}): ReportModel {
  const pad = (n: number) => String(n).padStart(2, "0")
  const stamp = `${at.getFullYear()}.${pad(at.getMonth() + 1)}.${pad(at.getDate())} ${pad(at.getHours())}:${pad(at.getMinutes())}`

  const byName = new Map(spots.map((s) => [s.name, s]))
  const included =
    watch.length > 0 ? watch.map((n) => byName.get(n)).filter((s): s is CrowdSpot => s != null) : [...spots]
  const sorted = [...included].sort((a, b) => b.levelNum - a.levelNum)

  const counts = new Map<string, { count: number; color: string }>()
  for (const s of sorted) {
    const cur = counts.get(s.level)
    if (cur) cur.count += 1
    else counts.set(s.level, { count: 1, color: s.color })
  }

  const rows: ReportRow[] = sorted.map((s, i) => {
    const d = details.get(s.name)
    const now = d && d.nowIndex >= 0 ? d.series[d.nowIndex] : null
    const alerts = (extras.get(s.name)?.alerts ?? []).filter((a) => a.type || a.info)
    const kinds = Array.from(new Set(alerts.map((a) => a.type).filter(Boolean)))
    return {
      idx: i + 1,
      name: s.name,
      district: districtOf(city, s.name) ?? "",
      category: s.category,
      level: s.level,
      levelNum: s.levelNum,
      color: s.color,
      basis: BASIS_LABEL[s.basis ?? "ppl"],
      people: now && now.people > 0 ? (now.range || `약 ${now.people.toLocaleString("ko-KR")}명`) : "",
      notes: alerts.length > 0 ? `${kinds.join("·")} ${alerts.length}건` : "",
    }
  })

  return {
    cityName,
    stamp,
    scope: watch.length > 0 ? "watch" : "all",
    totalCount: sorted.length,
    summary: Array.from(counts, ([level, v]) => ({ level, count: v.count, color: v.color })),
    rows,
    disasters: disaster,
  }
}
