import type { PlasmoCSConfig } from "plasmo"
import { Storage } from "@plasmohq/storage"

export const config: PlasmoCSConfig = {
  matches: ["<all_urls>"],
  run_at: "document_idle",
  all_frames: false
}

// 한국 주소 패턴: 도로명(로/길+숫자), 지번(동/리+숫자), 구/시/군+도로명/동, 번지
const ADDRESS_PATTERN = /[가-힣]+(?:로|길)\s*\d+|[가-힣]+(?:동|리)\s+\d+|[가-힣]+(?:구|시|군)\s+[가-힣]+(?:로|길|동)|[가-힣]+번지/

const storage = new Storage()
let enabled = false
let lastSentTime = 0
const COOLDOWN_MS = 3000

// 설정에서 클립보드 감지 활성화 여부 확인
async function checkEnabled() {
  try {
    const settings = await storage.get<Record<string, unknown>>("settings")
    enabled = (settings?.enableClipboardDetect as boolean) ?? false
  } catch {
    enabled = false
  }
}

checkEnabled()

// 설정 변경 시 실시간 반영
storage.watch({
  settings: (c) => {
    try {
      const settings = c.newValue
      enabled = settings?.enableClipboardDetect ?? false
    } catch {
      enabled = false
    }
  }
})

function trySendAddress(text: string | undefined) {
  if (!enabled) return
  if (!text || text.length < 4 || text.length > 200) return
  if (!ADDRESS_PATTERN.test(text)) return

  const now = Date.now()
  if (now - lastSentTime < COOLDOWN_MS) return
  lastSentTime = now

  chrome.runtime.sendMessage({
    type: "clipboard-address-detected",
    text
  }).catch(() => { /* 서비스 워커 비활성 시 무시 */ })
}

// 복사 이벤트 감지 (capture 단계)
document.addEventListener("copy", () => {
  trySendAddress(window.getSelection()?.toString()?.trim())
}, true)
