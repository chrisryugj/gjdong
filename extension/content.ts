import type { PlasmoCSConfig } from "plasmo"

export const config: PlasmoCSConfig = {
  matches: ["<all_urls>"],
  run_at: "document_idle"
}

// 한국 주소 패턴: 한글 포함 + 주소 키워드
const ADDRESS_PATTERN = /[가-힣].{2,}(?:동|로|길|번지|구|시|군|읍|면|리)\s*\d*/

let enabled = false

// 설정에서 클립보드 감지 활성화 여부 확인
async function checkEnabled() {
  try {
    const data = await chrome.storage.sync.get("settings")
    const settings = data?.settings ? JSON.parse(data.settings) : null
    enabled = settings?.enableClipboardDetect ?? false
  } catch {
    enabled = false
  }
}

checkEnabled()

// 설정 변경 시 실시간 반영
chrome.storage.onChanged.addListener((changes) => {
  if (changes.settings) {
    try {
      const newSettings = JSON.parse(changes.settings.newValue)
      enabled = newSettings?.enableClipboardDetect ?? false
    } catch {
      enabled = false
    }
  }
})

// 복사 이벤트 감지
document.addEventListener("copy", () => {
  if (!enabled) return

  setTimeout(() => {
    const text = window.getSelection()?.toString()?.trim()
    if (!text || text.length < 4 || text.length > 200) return
    if (!ADDRESS_PATTERN.test(text)) return

    chrome.runtime.sendMessage({
      type: "clipboard-address-detected",
      text
    })
  }, 100)
})
