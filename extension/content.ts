import type { PlasmoCSConfig } from "plasmo"

export const config: PlasmoCSConfig = {
  matches: ["<all_urls>"],
  run_at: "document_start",
  all_frames: true
}

// 한국 주소 패턴
const ADDRESS_PATTERN = /[가-힣]+(?:로|길)\s*\d+|[가-힣]+(?:동|리)\s+\d+|[가-힣]+(?:구|시|군)\s+[가-힣]+(?:로|길|동)|[가-힣]+번지/

let lastSentTime = 0
const COOLDOWN_MS = 3000

// 네이버 지도 등의 UI 잔여물 제거
function cleanCopiedAddress(raw: string): string {
  return raw
    .replace(/복사\s*$/gm, "")
    .replace(/^(?:지번|도로명|우편번호)\s*/gm, "")
    .split("\n")
    .map(l => l.trim())
    .filter(l => l.length >= 4 && ADDRESS_PATTERN.test(l))[0]
    || raw.replace(/복사\s*$/g, "").replace(/^(?:지번|도로명|우편번호)\s*/g, "").trim()
}

function handleCopyAction() {
  if (!chrome.runtime?.id) return

  const rawText = window.getSelection()?.toString()?.trim()
  if (!rawText || rawText.length < 4 || rawText.length > 200) return

  const text = cleanCopiedAddress(rawText)
  if (!text || text.length < 4) return
  if (!ADDRESS_PATTERN.test(text)) return

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
