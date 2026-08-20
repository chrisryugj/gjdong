import type { PlasmoCSConfig } from "plasmo"
import { extractAddress } from "~lib/address-extract"

export const config: PlasmoCSConfig = {
  matches: ["<all_urls>"],
  run_at: "document_start",
  all_frames: true
}

let lastSentTime = 0
const COOLDOWN_MS = 3000

function handleCopyAction() {
  if (!chrome.runtime?.id) return

  const rawText = window.getSelection()?.toString()?.trim()
  if (!rawText || rawText.length < 4 || rawText.length > 200) return

  // 주소로 판단되는 구간만 뽑는다. 표 한 줄을 통째로 보내지 않기 위한 방어.
  const text = extractAddress(rawText)
  if (!text) return

  const now = Date.now()
  if (now - lastSentTime < COOLDOWN_MS) return
  lastSentTime = now

  chrome.runtime.sendMessage({
    type: "clipboard-address-detected",
    text
  }).catch(() => {})
}

window.addEventListener("copy", () => handleCopyAction(), true)
window.addEventListener("keydown", (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === "c") {
    setTimeout(() => handleCopyAction(), 10)
  }
}, true)
