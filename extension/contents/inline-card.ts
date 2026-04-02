import type { PlasmoCSConfig } from "plasmo"

export const config: PlasmoCSConfig = {
  matches: ["<all_urls>"],
  run_at: "document_idle",
  all_frames: true
}

const ADDRESS_PATTERN = /[가-힣]+(?:로|길)\s*\d+|[가-힣]+(?:동|리)\s+\d+|[가-힣]+(?:구|시|군)\s+[가-힣]+(?:로|길|동)|[가-힣]+번지/

let triggerEl: HTMLElement | null = null
let cardEl: HTMLElement | null = null
let shadowHost: HTMLElement | null = null
let shadowRoot: ShadowRoot | null = null
let hideTimer: ReturnType<typeof setTimeout> | null = null
let currentAddress = ""

function ensureShadowHost(): ShadowRoot {
  if (shadowRoot) return shadowRoot
  shadowHost = document.createElement("div")
  shadowHost.id = "gjdong-inline-host"
  shadowHost.style.cssText = "position:absolute;top:0;left:0;z-index:2147483647;pointer-events:none;"
  document.body.appendChild(shadowHost)
  shadowRoot = shadowHost.attachShadow({ mode: "closed" })
  const style = document.createElement("style")
  style.textContent = CARD_STYLES
  shadowRoot.appendChild(style)
  return shadowRoot
}

function showTrigger(rect: DOMRect, text: string) {
  removeTrigger()
  removeCard()
  currentAddress = text
  const root = ensureShadowHost()

  triggerEl = document.createElement("div")
  triggerEl.className = "gjdong-trigger"
  triggerEl.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>`

  const scrollX = window.scrollX
  const scrollY = window.scrollY
  triggerEl.style.left = `${rect.right + scrollX + 4}px`
  triggerEl.style.top = `${rect.top + scrollY + (rect.height - 24) / 2}px`

  triggerEl.addEventListener("click", (e) => {
    e.stopPropagation()
    e.preventDefault()
    showCard(rect, currentAddress)
  })
  triggerEl.addEventListener("mouseenter", () => {
    if (hideTimer) { clearTimeout(hideTimer); hideTimer = null }
  })

  root.appendChild(triggerEl)
  hideTimer = setTimeout(() => removeTrigger(), 5000)
}

function removeTrigger() {
  if (hideTimer) { clearTimeout(hideTimer); hideTimer = null }
  triggerEl?.remove()
  triggerEl = null
}
function removeCard() { cardEl?.remove(); cardEl = null }
function removeAll() { removeTrigger(); removeCard() }

function showCard(anchorRect: DOMRect, address: string) {
  removeCard()
  removeTrigger()
  const root = ensureShadowHost()

  cardEl = document.createElement("div")
  cardEl.className = "gjdong-card"
  // 스켈레톤 로딩으로 체감 속도 개선
  cardEl.innerHTML = `
    <div class="gjdong-body">
      <div class="gjdong-title-skeleton"></div>
      <div class="gjdong-row-skeleton"></div>
      <div class="gjdong-row-skeleton short"></div>
    </div>
  `

  const scrollX = window.scrollX
  const scrollY = window.scrollY
  const cardWidth = 300
  const viewportW = window.innerWidth

  let left = anchorRect.left + scrollX
  let top = anchorRect.bottom + scrollY + 6

  if (left + cardWidth > scrollX + viewportW - 12) left = scrollX + viewportW - cardWidth - 12
  if (left < scrollX + 8) left = scrollX + 8

  cardEl.style.left = `${left}px`
  cardEl.style.top = `${top}px`

  cardEl.addEventListener("click", (e) => e.stopPropagation())
  root.appendChild(cardEl)

  if (!chrome.runtime?.id) { showError("연결 끊김"); return }

  chrome.runtime.sendMessage({
    type: "inline-resolve-address",
    address
  }).then((response) => {
    if (!cardEl) return
    if (response?.error) showError(response.error)
    else if (response?.result) renderResult(response.result, address)
  }).catch(() => showError("서버 연결 실패"))
}

function showError(msg: string) {
  const body = cardEl?.querySelector(".gjdong-body")
  if (!body) return
  body.innerHTML = `<div class="gjdong-error">${msg}</div>`
}

type ResultMeta = {
  sido?: string; gu: string; roadName?: string; buildingNo?: string
  unit?: string; legalDong?: string; jibunNo?: string; adminDong?: string
  postalCode?: string; lon: number; lat: number
}
type Result = { display: string; meta: ResultMeta; fallback?: boolean }

function renderResult(result: Result, originalAddress: string) {
  const body = cardEl?.querySelector(".gjdong-body")
  if (!body) return

  if (result.fallback) {
    showError(`"${originalAddress}" 결과 없음`)
    return
  }

  const { meta } = result
  const rows: Array<{ label: string; value: string }> = []

  if (meta.roadName) {
    const full = meta.buildingNo
      ? (meta.unit ? `${meta.gu} ${meta.roadName}${meta.buildingNo} ${meta.unit}` : `${meta.gu} ${meta.roadName}${meta.buildingNo}`)
      : `${meta.gu} ${meta.roadName}`
    rows.push({ label: "도로명", value: full })
  }
  if (meta.legalDong) rows.push({ label: "지번", value: `${meta.gu} ${meta.legalDong} ${meta.jibunNo || ""}` })
  if (meta.adminDong) rows.push({ label: "행정동", value: meta.adminDong })
  if (meta.postalCode) rows.push({ label: "우편번호", value: meta.postalCode })

  const title = meta.sido ? `${meta.sido} ${result.display}` : result.display

  body.innerHTML = `
    <div class="gjdong-title">${esc(title)}</div>
    <div class="gjdong-rows">
      ${rows.map(r => `
        <div class="gjdong-row">
          <span class="gjdong-label">${r.label}</span>
          <span class="gjdong-value">${esc(r.value)}</span>
          <button class="gjdong-copy" data-v="${escAttr(r.value)}">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
          </button>
        </div>
      `).join("")}
    </div>
    <div class="gjdong-footer">
      <a class="gjdong-map" href="https://map.naver.com/p/search/${encodeURIComponent(title)}" target="_blank" rel="noopener">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
        지도
      </a>
      <button class="gjdong-close">닫기</button>
    </div>
  `

  body.querySelector(".gjdong-close")?.addEventListener("click", (e) => {
    e.stopPropagation()
    removeAll()
  })

  body.querySelectorAll(".gjdong-copy").forEach(btn => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation()
      const value = (btn as HTMLElement).dataset.v || ""
      try { await navigator.clipboard.writeText(value) }
      catch {
        const ta = document.createElement("textarea")
        ta.value = value; ta.style.cssText = "position:fixed;opacity:0"
        document.body.appendChild(ta); ta.select()
        document.execCommand("copy"); document.body.removeChild(ta)
      }
      const el = btn as HTMLElement
      el.classList.add("copied")
      el.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>`
      setTimeout(() => {
        el.classList.remove("copied")
        el.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`
      }, 1000)
    })
  })
}

function esc(s: string) { return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;") }
function escAttr(s: string) { return esc(s).replace(/'/g, "&#39;") }

// 이벤트 등록
document.addEventListener("mouseup", (e) => {
  if ((e.target as HTMLElement)?.closest?.("#gjdong-inline-host")) return
  setTimeout(() => {
    const sel = window.getSelection()
    const text = sel?.toString()?.trim()
    if (!text || text.length < 4 || text.length > 200 || !ADDRESS_PATTERN.test(text)) {
      removeTrigger(); return
    }
    const range = sel?.getRangeAt(0)
    if (!range) return
    const rect = range.getBoundingClientRect()
    if (rect.width === 0 && rect.height === 0) return
    showTrigger(rect, text)
  }, 10)
}, true)

document.addEventListener("mousedown", (e) => {
  if (!cardEl && !triggerEl) return
  const t = e.target as HTMLElement
  if (t === shadowHost || shadowHost?.contains(t)) return
  removeAll()
}, true)

document.addEventListener("keydown", (e) => { if (e.key === "Escape") removeAll() }, true)

chrome.runtime?.onMessage?.addListener((msg) => {
  if (msg.type === "show-inline-card" && msg.address) {
    const sel = window.getSelection()
    if (sel && sel.rangeCount > 0) {
      const rect = sel.getRangeAt(0).getBoundingClientRect()
      if (rect.width > 0 || rect.height > 0) { showCard(rect, msg.address); return }
    }
    showCard(new DOMRect(window.innerWidth / 2 - 150, window.innerHeight / 3, 0, 0), msg.address)
  }
})

const CARD_STYLES = `
  * { box-sizing: border-box; margin: 0; padding: 0; }

  .gjdong-trigger {
    position: absolute;
    pointer-events: auto;
    width: 24px; height: 24px;
    display: flex; align-items: center; justify-content: center;
    background: #fff;
    border: 1px solid #e0e0e0;
    border-radius: 50%;
    cursor: pointer;
    color: #5B5FC7;
    box-shadow: 0 1px 4px rgba(0,0,0,.12);
    transition: all .15s ease;
    animation: pop .2s cubic-bezier(.34,1.56,.64,1);
  }
  .gjdong-trigger:hover {
    background: #5B5FC7; color: #fff; border-color: #5B5FC7;
    box-shadow: 0 2px 8px rgba(91,95,199,.35);
    transform: scale(1.08);
  }
  @keyframes pop {
    0% { opacity:0; transform:scale(.4); }
    100% { opacity:1; transform:scale(1); }
  }

  .gjdong-card {
    position: absolute;
    pointer-events: auto;
    width: 300px;
    background: #fff;
    border: 1px solid #e8e8e8;
    border-radius: 10px;
    box-shadow: 0 4px 20px rgba(0,0,0,.1), 0 1px 3px rgba(0,0,0,.06);
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
    font-size: 13px;
    color: #222;
    overflow: hidden;
    animation: cardIn .18s ease-out;
  }
  @keyframes cardIn {
    0% { opacity:0; transform:translateY(-4px); }
    100% { opacity:1; transform:translateY(0); }
  }

  .gjdong-body { padding: 14px 16px 10px; }

  /* 스켈레톤 로딩 */
  .gjdong-title-skeleton {
    height: 16px; width: 80%; border-radius: 4px;
    background: linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%);
    background-size: 200% 100%;
    animation: shimmer 1.2s infinite;
    margin-bottom: 12px;
  }
  .gjdong-row-skeleton {
    height: 12px; width: 100%; border-radius: 3px;
    background: linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%);
    background-size: 200% 100%;
    animation: shimmer 1.2s infinite;
    margin-bottom: 8px;
  }
  .gjdong-row-skeleton.short { width: 50%; }
  @keyframes shimmer {
    0% { background-position: 200% 0; }
    100% { background-position: -200% 0; }
  }

  .gjdong-title {
    font-size: 13px;
    font-weight: 600;
    color: #111;
    line-height: 1.4;
    margin-bottom: 10px;
    padding-bottom: 8px;
    border-bottom: 1px solid #f0f0f0;
  }

  .gjdong-rows { display: flex; flex-direction: column; gap: 2px; }
  .gjdong-row {
    display: flex; align-items: center; gap: 6px;
    padding: 5px 6px;
    border-radius: 5px;
    transition: background .1s;
  }
  .gjdong-row:hover { background: #f7f7f8; }
  .gjdong-label {
    flex-shrink: 0;
    font-size: 11px;
    color: #888;
    width: 46px;
    text-align: right;
  }
  .gjdong-value {
    flex: 1;
    font-size: 12.5px;
    color: #333;
  }
  .gjdong-copy {
    flex-shrink: 0;
    background: none; border: none;
    cursor: pointer; color: #bbb;
    width: 26px; height: 26px;
    display: flex; align-items: center; justify-content: center;
    border-radius: 5px;
    transition: all .12s;
  }
  .gjdong-copy:hover { background: #f0f0f0; color: #5B5FC7; }
  .gjdong-copy.copied { color: #22c55e; }

  .gjdong-footer {
    display: flex; align-items: center; justify-content: space-between;
    padding: 6px 16px 10px;
  }
  .gjdong-map {
    display: inline-flex; align-items: center; gap: 3px;
    font-size: 11px; color: #888; text-decoration: none;
    transition: color .12s;
  }
  .gjdong-map:hover { color: #5B5FC7; }
  .gjdong-close {
    background: none; border: none;
    font-size: 11px; color: #bbb; cursor: pointer;
    transition: color .12s;
  }
  .gjdong-close:hover { color: #666; }

  .gjdong-error {
    font-size: 12px; color: #999;
    padding: 8px 0;
  }
`
