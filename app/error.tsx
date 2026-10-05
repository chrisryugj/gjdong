"use client"

import { useEffect } from "react"

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error("Application error:", error)
  }, [error])

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-4">
      <h2 className="text-xl font-semibold">문제가 발생했습니다</h2>
      <p className="text-muted-foreground text-center max-w-md">
        일시적인 오류가 발생했습니다. 아래 버튼을 눌러 다시 시도해주세요.
      </p>
      {/* shadcn Button 대신 평범한 버튼 — 루트 에러 경계는 모든 라우트 첫 번들에 실려
          tailwind-merge 청크(7.7KB br, 사용률 4.9%)를 매번 끌고 왔다(2026-10-05 실측) */}
      <button
        onClick={reset}
        className="rounded-md border px-4 py-2 text-sm font-medium shadow-xs transition-colors hover:bg-gray-50"
      >
        다시 시도
      </button>
    </div>
  )
}
