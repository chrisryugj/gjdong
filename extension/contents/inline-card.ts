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
let highlightMarks: HTMLElement[] = []

// 토글 칩 상태 (기본값: 도로명, 지번, 행정동 ON / 우편번호, 좌표 OFF)
type FieldKey = "road" | "jibun" | "admin" | "postal" | "coord"
const FIELD_LABELS: Record<FieldKey, string> = {
  road: "도로명",
  jibun: "지번",
  admin: "행정동",
  postal: "우편",
  coord: "좌표"
}
let fieldToggles: Record<FieldKey, boolean> = {
  road: true, jibun: true, admin: true, postal: false, coord: false
}

// chrome.storage에서 토글 상태 로드
try {
  chrome.storage?.local?.get("inlineCardToggles", (data) => {
    if (data?.inlineCardToggles) {
      fieldToggles = { ...fieldToggles, ...data.inlineCardToggles }
    }
  })
} catch {}

function saveToggles() {
  try { chrome.storage?.local?.set({ inlineCardToggles: fieldToggles }) } catch {}
}

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
  applyHighlight()
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
  hideTimer = setTimeout(() => { removeTrigger(); if (!cardEl) removeHighlight() }, 5000)
}

function removeTrigger() {
  if (hideTimer) { clearTimeout(hideTimer); hideTimer = null }
  triggerEl?.remove()
  triggerEl = null
}
function removeCard() { cardEl?.remove(); cardEl = null }
function removeHighlight() {
  highlightMarks.forEach(mark => {
    const parent = mark.parentNode
    if (!parent) return
    while (mark.firstChild) parent.insertBefore(mark.firstChild, mark)
    parent.removeChild(mark)
    parent.normalize()
  })
  highlightMarks = []
}
function removeAll() { removeTrigger(); removeCard(); removeHighlight() }

let hlStyleEl: HTMLStyleElement | null = null

function ensureHlStyles() {
  if (hlStyleEl) return
  hlStyleEl = document.createElement("style")
  hlStyleEl.textContent = `
    @keyframes gjdong-hl-sweep {
      0% { background-position: 100% 0; }
      100% { background-position: 0 0; }
    }
    @keyframes gjdong-hl-glow {
      0%, 100% { box-shadow: 0 0 0 0 rgba(91,95,199,.0); }
      50% { box-shadow: 0 0 10px 3px rgba(91,95,199,.25); }
    }
    gjdong-hl {
      background: linear-gradient(90deg, rgba(91,95,199,.18) 0%, rgba(91,95,199,.10) 50%, transparent 100%);
      background-size: 200% 100%;
      background-position: 100% 0;
      border-bottom: 2.5px solid rgba(91,95,199,.6);
      border-radius: 2px;
      padding: 1px 2px;
      box-decoration-break: clone;
      -webkit-box-decoration-break: clone;
      animation: gjdong-hl-sweep .4s cubic-bezier(.22,.61,.36,1) forwards,
                 gjdong-hl-glow 1.6s .4s ease-in-out 2;
      transition: background .3s;
    }
  `
  document.head.appendChild(hlStyleEl)
}

function applyHighlight() {
  removeHighlight()
  ensureHlStyles()
  const sel = window.getSelection()
  if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return
  try {
    const range = sel.getRangeAt(0)
    const mark = document.createElement("gjdong-hl")
    range.surroundContents(mark)
    highlightMarks.push(mark)
    sel.removeAllRanges()
  } catch {
    try {
      const range = sel.getRangeAt(0)
      const mark = document.createElement("gjdong-hl")
      const fragment = range.extractContents()
      mark.appendChild(fragment)
      range.insertNode(mark)
      highlightMarks.push(mark)
      sel.removeAllRanges()
    } catch {}
  }
}

function showCard(anchorRect: DOMRect, address: string) {
  removeCard()
  removeTrigger()
  const root = ensureShadowHost()

  cardEl = document.createElement("div")
  cardEl.className = "gjdong-card"
  cardEl.innerHTML = `
    <div class="gjdong-body">
      <div class="gjdong-skeleton-title"></div>
      <div class="gjdong-skeleton-chips"></div>
      <div class="gjdong-skeleton-row"></div>
      <div class="gjdong-skeleton-row short"></div>
    </div>
  `

  const scrollX = window.scrollX
  const scrollY = window.scrollY
  const cardWidth = 320
  const estimatedCardHeight = 180
  const viewportW = window.innerWidth
  const viewportH = window.innerHeight

  let left = anchorRect.left + scrollX
  const spaceBelow = viewportH - anchorRect.bottom
  const spaceAbove = anchorRect.top
  const openAbove = spaceBelow < estimatedCardHeight + 16 && spaceAbove > spaceBelow
  const gap = 10 // 꼬리 높이 + 여유

  let top: number
  if (openAbove) {
    top = anchorRect.top + scrollY - estimatedCardHeight - gap
    cardEl.classList.add("above")
  } else {
    top = anchorRect.bottom + scrollY + gap
  }

  if (left + cardWidth > scrollX + viewportW - 12) left = scrollX + viewportW - cardWidth - 12
  if (left < scrollX + 8) left = scrollX + 8

  // 꼬리 x 위치: 선택 영역 중앙 기준, 카드 left 대비 offset
  const anchorCenterX = anchorRect.left + anchorRect.width / 2 + scrollX
  let arrowX = anchorCenterX - left
  arrowX = Math.max(16, Math.min(arrowX, cardWidth - 16))
  cardEl.style.setProperty("--arrow-x", `${arrowX}px`)

  cardEl.style.left = `${left}px`
  cardEl.style.top = `${top}px`

  cardEl.addEventListener("click", (e) => e.stopPropagation())
  root.appendChild(cardEl)

  const handleResponse = (response: any) => {
    if (!cardEl) return
    if (response?.error) showError(response.error)
    else if (response?.result) {
      renderResult(response.result, address)
      if (cardEl?.classList.contains("above")) {
        const actualHeight = cardEl.offsetHeight
        cardEl.style.top = `${anchorRect.top + scrollY - actualHeight - gap}px`
      }
    }
  }

  const sendResolve = (retry = 0) => {
    if (!chrome.runtime?.id) {
      if (retry < 2) { setTimeout(() => sendResolve(retry + 1), 300); return }
      showError("익스텐션 재연결 필요 — 페이지를 새로고침 해주세요")
      return
    }
    chrome.runtime.sendMessage({
      type: "inline-resolve-address",
      address
    }).then(handleResponse).catch((err) => {
      // 서비스 워커 비활성 → 1회 재시도
      if (retry < 1) { setTimeout(() => sendResolve(retry + 1), 500); return }
      showError("서버 연결 실패")
    })
  }
  sendResolve()
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
  const title = meta.sido ? `${meta.sido} ${result.display}` : result.display

  // 필드 데이터 준비
  const fieldData: Record<FieldKey, string> = {
    road: "",
    jibun: "",
    admin: "",
    postal: "",
    coord: ""
  }

  if (meta.roadName) {
    fieldData.road = meta.buildingNo
      ? (meta.unit ? `${meta.gu} ${meta.roadName} ${meta.buildingNo} ${meta.unit}` : `${meta.gu} ${meta.roadName} ${meta.buildingNo}`)
      : `${meta.gu} ${meta.roadName}`
  }
  if (meta.legalDong) fieldData.jibun = `${meta.gu} ${meta.legalDong} ${meta.jibunNo || ""}`
  if (meta.adminDong) fieldData.admin = meta.adminDong
  if (meta.postalCode) fieldData.postal = meta.postalCode
  if (meta.lat && meta.lon) fieldData.coord = `${meta.lat.toFixed(6)}, ${meta.lon.toFixed(6)}`

  const webAppUrl = `https://gjdong.vercel.app/?q=${encodeURIComponent(originalAddress)}`

  body.innerHTML = `
    <div class="gjdong-header">
      <div class="gjdong-title" data-v="${escAttr(title)}">${esc(title)}</div>
      <div class="gjdong-actions">
        <button class="gjdong-action-btn gjdong-copy-title" title="주소 복사" data-v="${escAttr(title)}">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
        </button>
        <a class="gjdong-action-btn" href="${webAppUrl}" target="_blank" rel="noopener" title="웹앱에서 열기">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
        </a>
        <button class="gjdong-action-btn gjdong-close-btn" title="닫기">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
    </div>
    <div class="gjdong-chips">
      ${(Object.keys(FIELD_LABELS) as FieldKey[]).filter(k => fieldData[k]).map(k => `
        <button class="gjdong-chip ${fieldToggles[k] ? "active" : ""}" data-field="${k}">${FIELD_LABELS[k]}</button>
      `).join("")}
    </div>
    <div class="gjdong-rows">
      ${(Object.keys(FIELD_LABELS) as FieldKey[]).filter(k => fieldData[k]).map(k => `
        <div class="gjdong-row ${fieldToggles[k] ? "" : "hidden"}" data-field="${k}">
          <span class="gjdong-label">${FIELD_LABELS[k]}</span>
          <span class="gjdong-value">${esc(fieldData[k])}</span>
          <button class="gjdong-copy" data-v="${escAttr(fieldData[k])}">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
          </button>
        </div>
      `).join("")}
    </div>
    <div class="gjdong-footer">
      <a class="gjdong-map" href="https://map.naver.com/p/search/${encodeURIComponent(title)}" target="_blank" rel="noopener">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
        지도
      </a>
    </div>
  `

  // 닫기 버튼
  body.querySelector(".gjdong-close-btn")?.addEventListener("click", (e) => {
    e.stopPropagation()
    removeAll()
  })

  // 타이틀 복사
  body.querySelector(".gjdong-copy-title")?.addEventListener("click", (e) => {
    e.stopPropagation()
    const btn = e.currentTarget as HTMLElement
    copyToClipboard(btn.dataset.v || "")
    showCopyFeedback(btn)
  })

  // 칩 토글
  body.querySelectorAll(".gjdong-chip").forEach(chip => {
    chip.addEventListener("click", (e) => {
      e.stopPropagation()
      const el = chip as HTMLElement
      const field = el.dataset.field as FieldKey
      fieldToggles[field] = !fieldToggles[field]
      el.classList.toggle("active")
      saveToggles()
      // 해당 row 토글
      const row = body.querySelector(`.gjdong-row[data-field="${field}"]`) as HTMLElement
      if (row) {
        if (fieldToggles[field]) {
          row.classList.remove("hidden")
        } else {
          row.classList.add("hidden")
        }
      }
    })
  })

  // 개별 복사 버튼
  body.querySelectorAll(".gjdong-copy").forEach(btn => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation()
      const el = btn as HTMLElement
      copyToClipboard(el.dataset.v || "")
      showCopyFeedback(el)
    })
  })
}

async function copyToClipboard(text: string) {
  try { await navigator.clipboard.writeText(text) }
  catch {
    const ta = document.createElement("textarea")
    ta.value = text; ta.style.cssText = "position:fixed;opacity:0"
    document.body.appendChild(ta); ta.select()
    document.execCommand("copy"); document.body.removeChild(ta)
  }
}

function showCopyFeedback(el: HTMLElement) {
  const origHTML = el.innerHTML
  el.classList.add("copied")
  el.innerHTML = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>`
  setTimeout(() => {
    el.classList.remove("copied")
    el.innerHTML = origHTML
  }, 800)
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
    showCard(new DOMRect(window.innerWidth / 2 - 160, window.innerHeight / 3, 0, 0), msg.address)
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
    width: 320px;
    background: #fff;
    border: 1px solid #e6e6e6;
    border-radius: 10px;
    box-shadow: 0 4px 24px rgba(0,0,0,.10), 0 1px 3px rgba(0,0,0,.06);
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
    font-size: 13px;
    color: #222;
    overflow: visible;
    animation: cardIn .18s ease-out;
  }
  @keyframes cardIn {
    0% { opacity:0; transform:translateY(-4px) scale(.98); }
    100% { opacity:1; transform:translateY(0) scale(1); }
  }
  /* 말풍선 꼬리 - 아래로 열릴 때 (위쪽 꼬리) */
  .gjdong-card::before {
    content: "";
    position: absolute;
    top: -6px;
    left: var(--arrow-x, 24px);
    transform: translateX(-50%);
    width: 12px; height: 6px;
    background: #fff;
    clip-path: polygon(50% 0%, 0% 100%, 100% 100%);
    filter: drop-shadow(0 -1px 1px rgba(0,0,0,.06));
  }
  .gjdong-card::after {
    content: "";
    position: absolute;
    top: -7px;
    left: var(--arrow-x, 24px);
    transform: translateX(-50%);
    width: 14px; height: 7px;
    background: #e6e6e6;
    clip-path: polygon(50% 0%, 0% 100%, 100% 100%);
    z-index: -1;
  }

  /* 위로 열릴 때 (아래쪽 꼬리) */
  .gjdong-card.above::before {
    top: auto; bottom: -6px;
    clip-path: polygon(0% 0%, 100% 0%, 50% 100%);
    filter: drop-shadow(0 1px 1px rgba(0,0,0,.06));
  }
  .gjdong-card.above::after {
    top: auto; bottom: -7px;
    clip-path: polygon(0% 0%, 100% 0%, 50% 100%);
  }

  .gjdong-card.above {
    animation: cardInAbove .18s ease-out;
  }
  @keyframes cardInAbove {
    0% { opacity:0; transform:translateY(4px) scale(.98); }
    100% { opacity:1; transform:translateY(0) scale(1); }
  }

  .gjdong-body { padding: 10px 12px 8px; overflow: hidden; border-radius: 10px; }

  /* 스켈레톤 */
  .gjdong-skeleton-title {
    height: 14px; width: 75%; border-radius: 3px;
    background: linear-gradient(90deg, #f0f0f0 25%, #e4e4e4 50%, #f0f0f0 75%);
    background-size: 200% 100%;
    animation: shimmer 1.2s infinite;
    margin-bottom: 8px;
  }
  .gjdong-skeleton-chips {
    height: 10px; width: 60%; border-radius: 3px;
    background: linear-gradient(90deg, #f0f0f0 25%, #e4e4e4 50%, #f0f0f0 75%);
    background-size: 200% 100%;
    animation: shimmer 1.2s infinite;
    margin-bottom: 8px;
  }
  .gjdong-skeleton-row {
    height: 10px; width: 90%; border-radius: 3px;
    background: linear-gradient(90deg, #f0f0f0 25%, #e4e4e4 50%, #f0f0f0 75%);
    background-size: 200% 100%;
    animation: shimmer 1.2s infinite;
    margin-bottom: 6px;
  }
  .gjdong-skeleton-row.short { width: 45%; }
  @keyframes shimmer {
    0% { background-position: 200% 0; }
    100% { background-position: -200% 0; }
  }

  /* 헤더 */
  .gjdong-header {
    display: flex;
    align-items: flex-start;
    gap: 6px;
    padding-bottom: 7px;
    border-bottom: 1px solid #f0f0f0;
    margin-bottom: 6px;
  }
  .gjdong-title {
    flex: 1;
    font-size: 12.5px;
    font-weight: 600;
    color: #111;
    line-height: 1.45;
    word-break: keep-all;
  }
  .gjdong-actions {
    display: flex;
    align-items: center;
    gap: 2px;
    flex-shrink: 0;
    margin-top: 1px;
  }
  .gjdong-action-btn {
    width: 24px; height: 24px;
    display: flex; align-items: center; justify-content: center;
    background: none; border: none;
    cursor: pointer; color: #bbb;
    border-radius: 5px;
    transition: all .12s;
    text-decoration: none;
  }
  .gjdong-action-btn:hover { background: #f2f2f3; color: #5B5FC7; }
  .gjdong-action-btn.copied { color: #22c55e; }

  /* 토글 칩 */
  .gjdong-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    margin-bottom: 6px;
  }
  .gjdong-chip {
    display: inline-flex;
    align-items: center;
    height: 22px;
    padding: 0 8px;
    font-size: 11px;
    font-family: inherit;
    border-radius: 11px;
    cursor: pointer;
    transition: all .15s ease;
    border: 1px solid #e0e0e0;
    background: #fff;
    color: #aaa;
    user-select: none;
    line-height: 1;
  }
  .gjdong-chip:hover {
    border-color: #c8c8d0;
    color: #666;
  }
  .gjdong-chip.active {
    background: #5B5FC7;
    border-color: #5B5FC7;
    color: #fff;
  }
  .gjdong-chip.active:hover {
    background: #4F53B8;
    border-color: #4F53B8;
    color: #fff;
  }

  /* 결과 행 */
  .gjdong-rows { display: flex; flex-direction: column; gap: 0; }
  .gjdong-row {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 4px 4px;
    border-radius: 4px;
    transition: background .1s, max-height .2s ease, opacity .15s ease, padding .2s ease;
    max-height: 36px;
    overflow: hidden;
    opacity: 1;
  }
  .gjdong-row.hidden {
    max-height: 0;
    opacity: 0;
    padding-top: 0;
    padding-bottom: 0;
    pointer-events: none;
  }
  .gjdong-row:hover { background: #f7f7f8; }
  .gjdong-label {
    flex-shrink: 0;
    font-size: 10.5px;
    color: #999;
    width: 36px;
    text-align: right;
  }
  .gjdong-value {
    flex: 1;
    font-size: 12px;
    color: #333;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .gjdong-copy {
    flex-shrink: 0;
    background: none; border: none;
    cursor: pointer; color: #ccc;
    width: 22px; height: 22px;
    display: flex; align-items: center; justify-content: center;
    border-radius: 4px;
    transition: all .12s;
  }
  .gjdong-copy:hover { background: #ededf0; color: #5B5FC7; }
  .gjdong-copy.copied { color: #22c55e; }

  /* 푸터 */
  .gjdong-footer {
    display: flex;
    align-items: center;
    padding: 4px 4px 2px;
    margin-top: 2px;
  }
  .gjdong-map {
    display: inline-flex; align-items: center; gap: 3px;
    font-size: 10.5px; color: #999; text-decoration: none;
    transition: color .12s;
    padding: 2px 4px;
    border-radius: 4px;
  }
  .gjdong-map:hover { color: #5B5FC7; background: #f7f7f8; }

  .gjdong-error {
    font-size: 12px; color: #999;
    padding: 6px 0;
  }
`
