"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import type { CrowdSpot } from "@/lib/crowd/seoul-rtd"
import { detectTransitions, initAlertState } from "@/lib/crowd/alerts"
import { useLang } from "@/components/crowd/lang-context"

export type AlertPermission = "default" | "granted" | "denied" | "unsupported"

/**
 * 붐빔 전환 브라우저 알림 — 푸시 서버 없이 기존 폴링에 편승 (페이지가 열려 있는 동안만).
 * 권한 요청은 토글 클릭 시에만(자동 프롬프트 금지). 발화 시 인앱 토스트도 병행 —
 * iOS Safari(미설치 PWA)처럼 Notification이 없는 환경은 토스트만으로 동작한다.
 */
export function useCrowdAlerts({
  spots,
  watch,
  onOpen,
}: {
  spots: CrowdSpot[]
  watch: string[]
  onOpen: (name: string) => void
}) {
  const { spot: trSpotName, level: trLv } = useLang()
  const [enabled, setEnabled] = useState(false)
  const [permission, setPermission] = useState<AlertPermission>("default")
  const [toast, setToast] = useState<string | null>(null)
  const stateRef = useRef(initAlertState())
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const supported = typeof Notification !== "undefined"
    setPermission(supported ? Notification.permission : "unsupported")
    // 저장된 켜짐 상태는 권한이 살아있을 때만 복원 (미지원 환경은 토스트 전용으로 복원 허용)
    const saved = localStorage.getItem("crowdAlerts") === "1"
    setEnabled(saved && (!supported || Notification.permission === "granted"))
  }, [])

  // 폴링 스냅샷마다 전환 감지 — 감시 지점만
  useEffect(() => {
    if (!enabled || watch.length === 0 || spots.length === 0) return
    const fired = detectTransitions(stateRef.current, spots, new Set(watch), Date.now())
    if (fired.length === 0) return
    for (const name of fired) {
      const s = spots.find((x) => x.name === name)
      const title = `⚠ ${trSpotName(name)} — ${trLv(s?.level ?? "붐빔")}`
      if (typeof Notification !== "undefined" && Notification.permission === "granted") {
        try {
          // tag = OS 수준 중복 접기, 클릭 = 해당 지점 상세
          const n = new Notification(title, { tag: `crowd-${name}` })
          n.onclick = () => {
            window.focus()
            onOpen(name)
          }
        } catch {
          // 일부 브라우저는 페이지 컨텍스트 Notification 생성이 막혀 있다 — 토스트로 충분
        }
      }
    }
    const last = fired[fired.length - 1]
    const s = spots.find((x) => x.name === last)
    setToast(`⚠ ${trSpotName(last)} — ${trLv(s?.level ?? "붐빔")}`)
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
    toastTimerRef.current = setTimeout(() => setToast(null), 8000)
    // trSpotName/trLv는 lang 전환 시 참조가 바뀌지만 감지 로직과 무관 — spots 갱신에만 반응한다
    // eslint 미등록 규칙이라 주석으로만 명시
  }, [spots, enabled, watch, onOpen, trSpotName, trLv])

  const toggle = useCallback(async () => {
    if (enabled) {
      setEnabled(false)
      localStorage.setItem("crowdAlerts", "0")
      return
    }
    if (typeof Notification !== "undefined" && Notification.permission !== "granted") {
      const perm = await Notification.requestPermission()
      setPermission(perm)
      if (perm !== "granted") return
    }
    stateRef.current = initAlertState() // 켤 때마다 새로 씨딩 — 이미 붐빔인 곳은 조용히 시작
    setEnabled(true)
    localStorage.setItem("crowdAlerts", "1")
  }, [enabled])

  return { enabled, permission, toggle, toast }
}
