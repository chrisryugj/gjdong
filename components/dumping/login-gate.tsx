"use client"

import { useState } from "react"
import DumpMark from "./dump-mark"

// 암호 게이트. 세션 쿠키 발급까지만 담당하고, 열리면 부모가 대시보드를 그린다
export default function LoginGate({ checking, onOpen }: { checking: boolean; onOpen: () => void }) {
  const [pw, setPw] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch("/api/dumping/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: pw }),
      })
      const data = await res.json().catch(() => null)
      if (res.ok && data?.ok) {
        setPw("")
        onOpen()
      } else {
        setError(data?.error ?? "인증에 실패했습니다")
      }
    } catch {
      setError("네트워크 오류")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="crowd-page crowd-light dump-page flex h-dvh items-center justify-center bg-[var(--cp-bg)] px-4 text-[var(--cp-text)]">
      {checking ? (
        <p className="text-base text-[var(--cp-text-dim)]">확인 중…</p>
      ) : (
        <form
          onSubmit={submit}
          className="dump-rise w-full max-w-xs rounded-xl border border-[var(--cp-border-strong)] bg-[var(--cp-panel)] p-6"
        >
          <DumpMark size={44} />
          <h1 className="mt-4 text-[22px] font-extrabold leading-none tracking-[-0.012em] text-[var(--cp-text-strong)]">클린광진 상황실</h1>
          <p className="dump-kicker mt-2 text-[10.5px] text-[#0c6155]">광진구 · 무단투기 100m 격자 분석</p>
          <p className="mt-3 text-[14px] leading-relaxed text-[var(--cp-text-dim)]">내부 검토용입니다. 비밀번호를 입력해 주세요.</p>
          <input
            type="password"
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            autoFocus
            autoComplete="current-password"
            placeholder="비밀번호"
            aria-label="비밀번호"
            className="mt-4 w-full rounded-lg border border-[var(--cp-border-strong)] bg-[var(--cp-bg)] px-3 py-2.5 font-mono text-[17px] tracking-[0.12em] text-[var(--cp-text)] placeholder:font-sans placeholder:tracking-normal placeholder:text-[var(--cp-text-faint)] focus:border-[#0c6155] focus:outline-none"
          />
          {error && (
            <p role="alert" className="mt-2 text-[14px] text-red-600">
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={busy || !pw}
            className="mt-3 w-full rounded-lg bg-[#0c6155] py-2.5 text-[15px] font-semibold text-white transition-colors hover:bg-[#0a4a41] disabled:opacity-40"
          >
            {busy ? "확인 중…" : "들어가기"}
          </button>
        </form>
      )}
    </div>
  )
}
