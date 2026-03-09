import type { PlasmoCSConfig } from "plasmo"

export const config: PlasmoCSConfig = {
  matches: ["<all_urls>"],
  run_at: "document_start",
  all_frames: true
}

// 한국 주소 패턴: 도로명(로/길+숫자), 지번(동/리+숫자), 구/시/군+도로명/동, 번지
const ADDRESS_PATTERN = /[가-힣]+(?:로|길)\s*\d+|[가-힣]+(?:동|리)\s+\d+|[가-힣]+(?:구|시|군)\s+[가-힣]+(?:로|길|동)|[가-힣]+번지/

let lastSentTime = 0
const COOLDOWN_MS = 3000

function handleCopyAction() {
  // 익스텐션 리로드/업데이트 시 context 무효화 → runtime이 undefined
  if (!chrome.runtime?.id) return

  const text = window.getSelection()?.toString()?.trim()
  if (!text || text.length < 4 || text.length > 200) return
  if (!ADDRESS_PATTERN.test(text)) return

  const now = Date.now()
  if (now - lastSentTime < COOLDOWN_MS) return
  lastSentTime = now

  chrome.runtime.sendMessage({
    type: "clipboard-address-detected",
    text
  }).catch(() => {})
}

// window 캡처 단계에서 이벤트 감지 — document보다 먼저 실행되므로
// 페이지가 stopImmediatePropagation()을 써도 우리 리스너는 이미 실행됨
window.addEventListener("copy", () => handleCopyAction(), true)

// Ctrl+C / Cmd+C 키 감지 (copy 이벤트가 페이지에서 가로채일 때 대비)
window.addEventListener("keydown", (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === "c") {
    setTimeout(() => handleCopyAction(), 10)
  }
}, true)
