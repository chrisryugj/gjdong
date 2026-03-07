import { Storage } from "@plasmohq/storage"

export {}

const storage = new Storage()

// 컨텍스트 메뉴 등록 + 최초 설치 시 설정 페이지 열기
chrome.runtime.onInstalled.addListener((details) => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: "convert-address",
      title: "표준주소 변환",
      contexts: ["selection"]
    })
  })

  if (details.reason === "install") {
    chrome.runtime.openOptionsPage()
  }
})

// 우클릭 → 설정에 따라 팝업 또는 알림
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === "convert-address" && info.selectionText) {
    const address = info.selectionText.trim()

    const settings = await storage.get<Record<string, any>>("settings")
    const action = settings?.contextMenuAction || "popup"

    if (action === "popup") {
      chrome.windows.create({
        url: chrome.runtime.getURL(`popup.html?address=${encodeURIComponent(address)}`),
        type: "popup",
        width: 500,
        height: 540,
        focused: true
      })
    } else {
      convertAndNotify(address, tab?.id)
    }
  }
})

// 키보드 단축키 → 무음 변환 + 클립보드 복사
chrome.commands.onCommand.addListener(async (command) => {
  if (command !== "convert-clipboard") return

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  if (!tab?.id) return

  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: async () => {
        try { return await navigator.clipboard.readText() }
        catch { return null }
      }
    })
    const text = results?.[0]?.result?.trim()
    if (text) await convertAndNotify(text, tab.id)
  } catch (err) {
    console.error("[gjdong] Shortcut failed:", err instanceof Error ? err.message : err)
  }
})

// 콘텐트 스크립트에서 클립보드 주소 감지 메시지 수신
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // 자체 익스텐션에서 온 메시지만 처리
  if (sender.id !== chrome.runtime.id) return false
  if (!sender.tab?.id) return false

  if (message.type === "clipboard-address-detected" && message.text) {
    if (typeof message.text !== "string" || message.text.length > 200) return false
    handleClipboardDetect(message.text, sender.tab.id)
  }
  return false
})

// 클립보드 감지 시 설정에 따라 알림 또는 팝업
async function handleClipboardDetect(address: string, tabId?: number) {
  const settings = await storage.get<Record<string, any>>("settings")
  const action = settings?.clipboardAction || "notification"

  if (action === "popup") {
    const encoded = encodeURIComponent(address.trim())
    chrome.windows.create({
      url: chrome.runtime.getURL(`popup.html?address=${encoded}`),
      type: "popup",
      width: 500,
      height: 540,
      focused: true
    })
  } else {
    convertAndNotify(address, tabId)
  }
}

// 단축키/감지용 무음 변환
async function convertAndNotify(address: string, tabId?: number) {
  try {
    const settings = await storage.get<Record<string, any>>("settings")
    const baseUrl = settings?.apiBaseUrl || "https://gjdong.vercel.app"
    const defaultFormat = settings?.defaultFormat || "standard1"
    const notificationsEnabled = settings?.enableNotifications ?? true

    const response = await fetch(`${baseUrl}/api/resolve-address`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ address })
    })

    if (!response.ok) throw new Error(`API error: ${response.status}`)
    const result = await response.json()

    if (result.fallback) {
      if (notificationsEnabled) {
        showNotification("변환 실패", `"${address}" 주소를 찾을 수 없습니다.`)
      }
      return
    }

    const formatted = formatResult(result, defaultFormat)

    let copied = false
    if (tabId) {
      try {
        await chrome.scripting.executeScript({
          target: { tabId },
          func: async (text: string) => {
            try {
              await navigator.clipboard.writeText(text)
              return true
            } catch {
              // fallback
              const el = document.createElement("textarea")
              el.value = text
              el.style.position = "fixed"
              el.style.opacity = "0"
              document.body.appendChild(el)
              el.select()
              const success = document.execCommand("copy")
              document.body.removeChild(el)
              return success
            }
          },
          args: [formatted]
        })
        copied = true
      } catch {
        // 복사 실패 - 알림에서 결과만 표시
      }
    }

    if (notificationsEnabled) {
      showNotification(
        "주소 변환 완료",
        copied ? `${formatted} (복사됨)` : formatted
      )
    }
  } catch {
    const settings = await storage.get<Record<string, any>>("settings")
    if (settings?.enableNotifications ?? true) {
      showNotification("변환 실패", "API 서버 연결을 확인하세요.")
    }
  }
}

function showNotification(title: string, message: string) {
  const icons = chrome.runtime.getManifest().icons || {}
  const iconFile = icons["128"] || icons["48"] || ""
  const iconUrl = iconFile ? chrome.runtime.getURL(iconFile) : ""

  chrome.notifications.create(`gjdong-${Date.now()}`, {
    type: "basic",
    iconUrl,
    title,
    message,
    priority: 2
  }, () => {
    if (chrome.runtime.lastError) {
      // 알림 실패 무시
    }
  })
}

function formatResult(result: any, field: string): string {
  if (result.fallback) return "변환 실패"
  const m = result.meta
  const bldg = m.buildingNo
    ? (m.unit ? `${m.buildingNo} ${m.unit}` : m.buildingNo)
    : (m.unit || "")

  switch (field) {
    case "standard1": return m.sido ? `${m.sido} ${result.display}` : result.display
    case "standard2": return result.display
    case "road": return m.roadName ? `${m.gu} ${m.roadName}${bldg}` : ""
    case "jibun": return m.legalDong ? `${m.gu} ${m.legalDong} ${m.jibunNo || ""}` : ""
    case "adminDong": return m.adminDong || ""
    case "postalCode": return m.postalCode || ""
    case "unit": return m.unit || ""
    default: return ""
  }
}
