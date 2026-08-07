// 상황실 행사 로그 — 폴링 스냅샷을 localStorage에 누적해 행사 시간축 기록을 만든다.
// 순수 함수 (테스트 대상). 상태·저장은 use-ops-log 훅이 담당.
// "행사 끝나고 결과보고" 니즈(과거 되짚기 불가 한계)를 서버 없이 로컬에서 해소한다.

import type { CityId } from "@/lib/crowd/cities"

export interface OpsLogSpotSample {
  /** 등급 숫자 (0=정보 없음 ~ 4=붐빔) — 스파크라인 축 */
  lv: number
  /** 등급 라벨 — CSV에 그대로 실린다 */
  level: string
  /** 실측 인원 (서울 상세 팬아웃이 있을 때만) */
  people?: number
}

export interface OpsLogTick {
  /** 원천 갱신 시각 (updatedAt) — 같은 시각 중복 적재 방지 키 */
  at: string
  spots: Record<string, OpsLogSpotSample>
}

/** 24시간 × 5분 주기 = 288틱 — 지점 12곳 기준 localStorage 수십 KB 수준이라 여유 */
export const LOG_MAX_TICKS = 288

export function logStorageKey(city: CityId): string {
  return `crowdOpsLog.${city}`
}

/** 틱 추가 — 같은 updatedAt은 스킵(폴링 편승이라 재렌더마다 불릴 수 있다), 상한 초과분은 앞에서 버림 */
export function appendTick(log: OpsLogTick[], tick: OpsLogTick, max = LOG_MAX_TICKS): OpsLogTick[] {
  if (Object.keys(tick.spots).length === 0) return log
  if (log.length > 0 && log[log.length - 1].at === tick.at) return log
  const next = [...log, tick]
  return next.length > max ? next.slice(next.length - max) : next
}

/** 로그에 등장한 지점명 — 처음 등장한 순서 유지 (중간 합류 지점은 뒤에 붙는다) */
export function logSpotNames(log: OpsLogTick[]): string[] {
  const seen = new Set<string>()
  for (const tick of log) for (const name of Object.keys(tick.spots)) seen.add(name)
  return [...seen]
}

function csvCell(v: string | number): string {
  const s = String(v)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

function clock(at: string): string {
  const d = new Date(at)
  if (Number.isNaN(d.getTime())) return at
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** 시간축 표 CSV — 행=틱 시각, 열=지점, 값=등급(인원). BOM+CRLF (Excel 한글 호환) */
export function buildLogCsv(log: OpsLogTick[]): string {
  const names = logSpotNames(log)
  const rows: Array<Array<string | number>> = [["시각", ...names]]
  for (const tick of log) {
    rows.push([
      clock(tick.at),
      ...names.map((n) => {
        const s = tick.spots[n]
        if (!s) return ""
        return s.people && s.people > 0 ? `${s.level}(${s.people.toLocaleString("ko-KR")}명)` : s.level
      }),
    ])
  }
  return "﻿" + rows.map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n"
}

export function logFilename(city: CityId, at: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0")
  return `crowd-log-${city}-${at.getFullYear()}${pad(at.getMonth() + 1)}${pad(at.getDate())}-${pad(at.getHours())}${pad(at.getMinutes())}.csv`
}

/** 지점 하나의 등급 추이 — 보고서 스파크라인용. 기록 없는 틱은 직전 값 유지(계단), 시작 전은 건너뜀 */
export function sparkSeries(log: OpsLogTick[], name: string): number[] {
  const out: number[] = []
  let last: number | null = null
  for (const tick of log) {
    const s = tick.spots[name]
    if (s) last = s.lv
    if (last != null) out.push(last)
  }
  return out
}
