import { Storage } from "@plasmohq/storage"
import { type ExtensionSettings, DEFAULT_SETTINGS } from "~lib/types"
import { getFieldValue } from "~lib/format"

export {}

const storage = new Storage()
const DEFAULT_API_URL = "https://gjdong.vercel.app"

// 네이버 지도 등에서 복사 시 "복사", "지번", "도로명" UI 텍스트 제거
function cleanAddress(raw: string): string {
  return raw
    .replace(/복사\s*$/gm, "")
    .replace(/^(?:지번|도로명|우편번호)\s*/gm, "")
    .split("\n")
    .map(l => l.trim())
    .filter(l => l.length >= 4)[0]
    || raw.replace(/복사\s*$/g, "").trim()
}

function validateApiBaseUrl(url: string): string {
  if (!url) return DEFAULT_API_URL
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== "https:") return DEFAULT_API_URL
    return parsed.origin
  } catch {
    return DEFAULT_API_URL
  }
}

// 재사용 중인 팝업 창 id (MV3 서비스 워커가 죽어도 유지되도록 session storage 사용)
async function getPopupWindowId(): Promise<number | null> {
  try {
    const r = await chrome.storage.session.get("popupWindowId")
    return typeof r.popupWindowId === "number" ? r.popupWindowId : null
  } catch {
    return null
  }
}

async function setPopupWindowId(id: number | null) {
  try {
    if (id == null) await chrome.storage.session.remove("popupWindowId")
    else await chrome.storage.session.set({ popupWindowId: id })
  } catch {
    // session storage 접근 실패 - 무시 (다음 호출 시 새 창 생성)
  }
}

// 팝업 창이 닫히면 저장된 id 정리
chrome.windows.onRemoved.addListener(async (windowId) => {
  if ((await getPopupWindowId()) === windowId) await setPopupWindowId(null)
})

// 설정에 따라 기존 팝업 창을 갱신하거나 새 창을 연다
async function openOrReusePopup(address: string) {
  const settings = await storage.get<ExtensionSettings>("settings")
  const reuse = (settings?.popupMode ?? "reuse") === "reuse"
  const cleaned = address.trim().slice(0, 200)
  const url = chrome.runtime.getURL(`popup.html?address=${encodeURIComponent(cleaned)}`)

  if (reuse) {
    const winId = await getPopupWindowId()
    if (winId != null) {
      try {
        const win = await chrome.windows.get(winId)
        // 최소화 상태면 normal로 복원 + 포커스 (최소화된 채 갱신 방지)
        const updateInfo: chrome.windows.UpdateInfo = { focused: true }
        if (win.state === "minimized") updateInfo.state = "normal"
        await chrome.windows.update(winId, updateInfo)
        // 리로드 없이 주소만 갱신 (떠있는 팝업이 메시지를 받아 재조회)
        chrome.runtime.sendMessage({ type: "popup-set-address", address: cleaned }).catch(() => {})
        return
      } catch {
        // 창이 이미 닫힘 - 아래에서 새로 생성
        await setPopupWindowId(null)
      }
    }
  }

  const created = await chrome.windows.create({
    url,
    type: "popup",
    width: 500,
    height: 540,
    focused: true
  })
  if (reuse && created?.id != null) await setPopupWindowId(created.id)
}

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
    // 기본 설정을 storage에 저장 (content script가 읽을 수 있도록)
    storage.get<ExtensionSettings>("settings").then(existing => {
      if (!existing) storage.set("settings", DEFAULT_SETTINGS)
    })
    chrome.runtime.openOptionsPage()
  }
})

// 우클릭 → 인라인 카드 (기본) / 팝업 / 알림
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === "convert-address" && info.selectionText) {
    const address = cleanAddress(info.selectionText.trim())

    const settings = await storage.get<ExtensionSettings>("settings")
    const action = settings?.contextMenuAction || "inline"

    if (action === "inline" && tab?.id) {
      // 현재 탭의 content script에 인라인 카드 표시 요청
      chrome.tabs.sendMessage(tab.id, {
        type: "show-inline-card",
        address
      }).catch(() => {
        // content script 없으면 팝업으로 fallback
        openOrReusePopup(address)
      })
    } else if (action === "popup") {
      await openOrReusePopup(address)
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
    const raw = results?.[0]?.result?.trim()
    if (raw) await convertAndNotify(cleanAddress(raw), tab.id)
  } catch {
    // 단축키 실행 실패 - 무시
  }
})

// 콘텐트 스크립트에서 메시지 수신
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id) return false

  // 인라인 카드용 주소 변환 요청
  if (message.type === "inline-resolve-address" && message.address) {
    if (typeof message.address !== "string" || message.address.length > 200) {
      sendResponse({ error: "잘못된 주소 형식" })
      return false
    }
    inlineResolve(message.address).then(sendResponse).catch(() => {
      sendResponse({ error: "API 서버 연결 실패" })
    })
    return true // async sendResponse
  }

  if (!sender.tab?.id) return false

  if (message.type === "clipboard-address-detected" && message.text) {
    if (typeof message.text !== "string" || message.text.length > 200) return false
    handleClipboardDetect(cleanAddress(message.text), sender.tab.id)
  }
  return false
})

// 클립보드 감지 시 설정에 따라 알림 또는 팝업
async function handleClipboardDetect(address: string, tabId?: number) {
  const settings = await storage.get<ExtensionSettings>("settings")

  // 클립보드 감지 비활성화 시 무시
  if (settings && settings.enableClipboardDetect === false) return

  const action = settings?.clipboardAction || "notification"

  if (action === "popup") {
    await openOrReusePopup(address)
  } else {
    convertAndNotify(address, tabId)
  }
}

// 단축키용 무음 변환
async function convertAndNotify(address: string, tabId?: number) {
  try {
    const settings = await storage.get<ExtensionSettings>("settings")
    const baseUrl = validateApiBaseUrl(settings?.apiBaseUrl || "")
    const defaultFormat = settings?.defaultFormat || "standard1"
    const notificationsEnabled = settings?.enableNotifications ?? true

    const sanitized = address.trim().slice(0, 200)
    const response = await fetch(`${baseUrl}/api/resolve-address`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ address: sanitized })
    })

    if (!response.ok) throw new Error(`API error: ${response.status}`)
    const result = await response.json()

    if (result.fallback) {
      if (notificationsEnabled) {
        showNotification("변환 실패", `"${sanitized}" 주소를 찾을 수 없습니다.`)
      }
      return
    }

    const formatted = getFieldValue(result, defaultFormat)

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
    const settings = await storage.get<ExtensionSettings>("settings")
    if (settings?.enableNotifications ?? true) {
      showNotification("변환 실패", "API 서버 연결을 확인하세요.")
    }
  }
}

// 인라인 카드용 주소 변환
async function inlineResolve(address: string): Promise<{ result?: unknown; error?: string }> {
  try {
    const settings = await storage.get<ExtensionSettings>("settings")
    const baseUrl = validateApiBaseUrl(settings?.apiBaseUrl || "")
    const sanitized = address.trim().slice(0, 200)

    const response = await fetch(`${baseUrl}/api/resolve-address`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ address: sanitized })
    })

    if (!response.ok) return { error: `API 오류: ${response.status}` }
    const result = await response.json()
    return { result }
  } catch {
    return { error: "API 서버 연결 실패" }
  }
}

function showNotification(title: string, message: string) {
  const icons = chrome.runtime.getManifest().icons || {}
  const iconFile = icons["128"] || icons["48"] || ""
  const iconUrl = iconFile ? chrome.runtime.getURL(iconFile) : ""

  chrome.notifications.create(`gjdong-${crypto.randomUUID()}`, {
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
