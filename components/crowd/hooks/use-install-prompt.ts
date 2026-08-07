"use client"

import { useCallback, useEffect, useState } from "react"

/** PWA: 서비스워커 등록 + 홈 화면 설치 배너 (모바일, 미설치, 미해제 시) */
export function useInstallPrompt() {
  const [installPrompt, setInstallPrompt] = useState<(Event & { prompt: () => Promise<void> }) | null>(null)
  const [showInstall, setShowInstall] = useState<false | "android" | "ios">(false)

  useEffect(() => {
    if ("serviceWorker" in navigator) void navigator.serviceWorker.register("/crowd-sw.js").catch(() => {})
    const nav = navigator as Navigator & { standalone?: boolean }
    const standalone = window.matchMedia("(display-mode: standalone)").matches || nav.standalone
    if (standalone || localStorage.getItem("crowdPwaDismissed")) return
    const onPrompt = (e: Event) => {
      e.preventDefault()
      setInstallPrompt(e as Event & { prompt: () => Promise<void> })
      setShowInstall("android")
    }
    window.addEventListener("beforeinstallprompt", onPrompt)
    if (/iphone|ipad|ipod/i.test(navigator.userAgent)) setShowInstall("ios")
    return () => window.removeEventListener("beforeinstallprompt", onPrompt)
  }, [])

  const dismissInstall = useCallback(() => {
    setShowInstall(false)
    localStorage.setItem("crowdPwaDismissed", "1")
  }, [])

  return { installPrompt, showInstall, dismissInstall }
}
