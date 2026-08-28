"use client"

import { useEffect, useRef, useState } from "react"

// 온톨로지 기반 LLM 질의응답 — /api/dumping/ask 평문 스트리밍 소비

const SEEDS = [
  "CCTV는 어디에 놓아야 하나?",
  "작년보다 나빠졌나?",
  "빠뜨린 대책은 없나?",
  "무단투기의 최강 예측변수는?",
  "으슥한 골목에 많이 버리지 않나?",
]

interface Msg {
  role: "user" | "model"
  text: string
}

interface QaChatProps {
  onAuthExpired: () => void
}

export default function QaChat({ onAuthExpired }: QaChatProps) {
  const [messages, setMessages] = useState<Msg[]>([])
  const [input, setInput] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
  }, [messages])

  useEffect(() => () => abortRef.current?.abort(), [])

  const ask = async (question: string) => {
    const q = question.trim()
    if (!q || busy) return
    setError(null)
    setInput("")
    setBusy(true)
    const history = messages.slice(-8)
    setMessages((m) => [...m, { role: "user", text: q }, { role: "model", text: "" }])
    const controller = new AbortController()
    abortRef.current = controller
    try {
      const res = await fetch("/api/dumping/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q, history }),
        signal: controller.signal,
      })
      if (res.status === 401) {
        onAuthExpired()
        return
      }
      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => null)
        throw new Error(data?.error ?? "답변 생성에 실패했습니다")
      }
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        const chunk = decoder.decode(value, { stream: true })
        setMessages((m) => {
          const next = [...m]
          const last = next[next.length - 1]
          next[next.length - 1] = { ...last, text: last.text + chunk }
          return next
        })
      }
      setMessages((m) => (m[m.length - 1]?.text ? m : [...m.slice(0, -1), { role: "model", text: "(빈 응답)" }]))
    } catch (e) {
      if (!(e instanceof DOMException && e.name === "AbortError")) {
        setError(e instanceof Error ? e.message : "오류가 발생했습니다")
        setMessages((m) => (m[m.length - 1]?.role === "model" && !m[m.length - 1].text ? m.slice(0, -2) : m))
      }
    } finally {
      setBusy(false)
      abortRef.current = null
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto p-3">
        {messages.length === 0 && (
          <div className="flex flex-col gap-3">
            <p className="rounded-xl border border-[var(--cp-border-faint)] p-3 text-[12px] leading-relaxed text-[var(--cp-text-muted)]">
              온톨로지(59노드·76관계)와 동별 수치만 근거로 답한다. 분석에 없는 내용은 없다고
              답하도록 되어 있고, CCTV 효과 철회·신고 편향 같은 해석 규칙이 걸려 있다.
            </p>
            <div className="flex flex-col gap-1.5">
              {SEEDS.map((s) => (
                <button
                  key={s}
                  onClick={() => void ask(s)}
                  className="rounded-lg border border-[var(--cp-border)] bg-[var(--cp-panel)] px-3 py-2 text-left text-[13px] text-[var(--cp-text)] transition-colors hover:border-[var(--cp-border-active)] hover:bg-[var(--cp-hover)]"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        <div className="flex flex-col gap-2.5">
          {messages.map((m, i) => (
            <div
              key={i}
              className={
                m.role === "user"
                  ? "self-end rounded-2xl rounded-br-sm bg-[#39a189]/20 px-3 py-2 text-[13px] leading-relaxed text-[var(--cp-text-strong)]"
                  : "self-start whitespace-pre-wrap rounded-2xl rounded-bl-sm border border-[var(--cp-border)] bg-[var(--cp-panel)] px-3 py-2 text-[13px] leading-relaxed text-[var(--cp-text)]"
              }
              style={{ maxWidth: "92%" }}
            >
              {m.text || (busy && i === messages.length - 1 ? "생각 중…" : m.text)}
            </div>
          ))}
        </div>
        {error && (
          <p className="mt-2 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-[12px] text-red-300">
            {error}
          </p>
        )}
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          void ask(input)
        }}
        className="flex gap-2 border-t border-[var(--cp-border)] p-2.5"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="온톨로지에 질문…"
          maxLength={500}
          className="min-w-0 flex-1 rounded-lg border border-[var(--cp-border)] bg-[var(--cp-panel)] px-3 py-2 text-[13px] text-[var(--cp-text)] placeholder:text-[var(--cp-text-faint)] focus:border-[var(--cp-border-active)] focus:outline-none"
        />
        {busy ? (
          <button
            type="button"
            onClick={() => abortRef.current?.abort()}
            className="shrink-0 rounded-lg border border-[var(--cp-border)] px-3 py-2 text-[13px] text-[var(--cp-text-muted)] hover:bg-[var(--cp-hover)]"
          >
            중단
          </button>
        ) : (
          <button
            type="submit"
            disabled={!input.trim()}
            className="shrink-0 rounded-lg bg-[#39a189] px-3.5 py-2 text-[13px] font-medium text-[#04110d] disabled:opacity-40"
          >
            질문
          </button>
        )}
      </form>
    </div>
  )
}
