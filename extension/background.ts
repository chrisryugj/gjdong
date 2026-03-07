export {}

console.log("[gjdong] === Service Worker 로드됨 ===")

// 컨텍스트 메뉴 등록
chrome.runtime.onInstalled.addListener(() => {
  console.log("[gjdong] onInstalled")
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: "convert-address",
      title: "표준주소 변환",
      contexts: ["selection"]
    })
    console.log("[gjdong] 컨텍스트 메뉴 등록 완료")
  })
})

// 우클릭 → 팝업 윈도우로 열기
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === "convert-address" && info.selectionText) {
    const address = encodeURIComponent(info.selectionText.trim())
    console.log("[gjdong] 우클릭 변환:", info.selectionText.trim())
    chrome.windows.create({
      url: chrome.runtime.getURL(`popup.html?address=${address}`),
      type: "popup",
      width: 420,
      height: 580,
      focused: true
    })
  }
})

// 키보드 단축키 (Ctrl+Shift+A) → 무음 변환 + 클립보드 복사
chrome.commands.onCommand.addListener(async (command) => {
  if (command !== "convert-clipboard") return
  console.log("[gjdong] 단축키 실행")

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
    console.log("[gjdong] 클립보드:", text)
    if (text) await convertAndNotify(text, tab.id)
  } catch (err) {
    console.error("[gjdong] Shortcut failed:", err)
  }
})

// 콘텐트 스크립트에서 클립보드 주소 감지 메시지 수신
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "clipboard-address-detected" && message.text) {
    console.log("[gjdong] 클립보드 주소 감지:", message.text)
    const tabId = sender.tab?.id
    convertAndNotify(message.text, tabId)
  }
  return false
})

// 단축키/감지용 무음 변환
async function convertAndNotify(address: string, tabId?: number) {
  console.log("[gjdong] convertAndNotify:", address)
  try {
    const settingsData = await chrome.storage.sync.get("settings")
    const settings = settingsData?.settings
      ? JSON.parse(settingsData.settings)
      : null
    const baseUrl = settings?.apiBaseUrl || "https://gjdong.vercel.app"
    const defaultFormat = settings?.defaultFormat || "standard1"

    const response = await fetch(`${baseUrl}/api/resolve-address`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ address })
    })

    if (!response.ok) throw new Error(`API error: ${response.status}`)
    const result = await response.json()

    if (result.fallback) {
      showNotification("변환 실패", `"${address}" 주소를 찾을 수 없습니다.`)
      return
    }

    const formatted = formatResult(result, defaultFormat)
    console.log("[gjdong] 변환 결과:", formatted)

    let copied = false
    if (tabId) {
      try {
        await chrome.scripting.executeScript({
          target: { tabId },
          func: (text: string) => {
            const el = document.createElement("textarea")
            el.value = text
            el.style.position = "fixed"
            el.style.opacity = "0"
            document.body.appendChild(el)
            el.select()
            document.execCommand("copy")
            document.body.removeChild(el)
          },
          args: [formatted]
        })
        copied = true
        console.log("[gjdong] 클립보드 복사 성공")
      } catch (err) {
        console.error("[gjdong] Copy failed:", err)
      }
    }

    showNotification(
      "주소 변환 완료",
      copied ? `${formatted} (복사됨)` : formatted
    )
  } catch (err) {
    console.error("[gjdong] Conversion failed:", err)
    showNotification("변환 실패", "API 서버 연결을 확인하세요.")
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
  }, (notificationId) => {
    if (chrome.runtime.lastError) {
      console.error("[gjdong] 알림 실패:", chrome.runtime.lastError.message)
    }
  })
}

function formatResult(result: any, field: string): string {
  if (result.fallback) return "변환 실패"
  const m = result.meta
  const bldg = m.unit ? `${m.buildingNo} ${m.unit}` : m.buildingNo

  switch (field) {
    case "standard1": return `${m.sido} ${result.display}`
    case "standard2": return result.display
    case "road": return m.roadName ? `${m.gu} ${m.roadName}${bldg}` : ""
    case "jibun": return m.legalDong ? `${m.gu} ${m.legalDong} ${m.jibunNo}` : ""
    case "adminDong": return m.adminDong || ""
    case "postalCode": return m.postalCode || ""
    case "unit": return m.unit || ""
    default: return ""
  }
}
