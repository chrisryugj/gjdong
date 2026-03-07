import { useState, useEffect } from "react"
import { useStorage } from "@plasmohq/storage/hook"
import {
  type ExtensionSettings,
  type OutputField,
  type MapProvider,
  type ClipboardAction,
  FIELD_LABELS,
  FIELD_EXAMPLES,
  DEFAULT_SETTINGS
} from "~lib/types"

import "./style.css"

function IndexOptions() {
  const [storedSettings, setStoredSettings] = useStorage<ExtensionSettings>("settings", DEFAULT_SETTINGS)
  const [local, setLocal] = useState<ExtensionSettings>(DEFAULT_SETTINGS)
  const [saved, setSaved] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [currentShortcut, setCurrentShortcut] = useState("Ctrl+Shift+C")

  useEffect(() => {
    if (storedSettings) setLocal(storedSettings)
  }, [storedSettings])

  useEffect(() => {
    chrome.commands.getAll(commands => {
      const cmd = commands.find(c => c.name === "convert-clipboard")
      if (cmd?.shortcut) setCurrentShortcut(cmd.shortcut)
    })
  }, [])

  const update = <K extends keyof ExtensionSettings>(key: K, value: ExtensionSettings[K]) => {
    setLocal(prev => ({ ...prev, [key]: value }))
    setDirty(true)
    setSaved(false)
  }

  const handleSave = () => {
    setStoredSettings(local)
    setSaved(true)
    setDirty(false)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-lg mx-auto p-6 space-y-5">
        {/* 헤더 */}
        <div className="flex items-center gap-3">
          <svg className="w-7 h-7 text-blue-600" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" />
          </svg>
          <div>
            <h1 className="text-lg font-bold text-gray-900">표준주소실록 설정</h1>
            <p className="text-xs text-gray-500">v{chrome.runtime.getManifest().version}</p>
          </div>
        </div>

        {/* API 서버 */}
        <section className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
          <h2 className="font-semibold text-sm text-gray-900">API 서버</h2>
          <div>
            <label className="text-xs text-gray-500 block mb-1">서버 URL</label>
            <input
              type="url"
              value={local.apiBaseUrl || ""}
              onChange={e => update("apiBaseUrl", e.target.value)}
              placeholder="https://gjdong.vercel.app"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <p className="text-[11px] text-gray-400 mt-1">
              비워두면 기본값 https://gjdong.vercel.app 사용
            </p>
          </div>
        </section>

        {/* 기본 출력 포맷 */}
        <section className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
          <h2 className="font-semibold text-sm text-gray-900">기본 출력 포맷</h2>
          <p className="text-[11px] text-gray-500">
            우클릭 변환, 단축키({currentShortcut}) 사용 시 자동 복사되는 형식
          </p>
          <div className="space-y-1.5">
            {(Object.keys(FIELD_LABELS) as OutputField[]).map(field => (
              <button
                key={field}
                onClick={() => update("defaultFormat", field)}
                className={`w-full px-3 py-2.5 rounded-lg text-left transition-all ${
                  local.defaultFormat === field
                    ? "bg-blue-50 border-2 border-blue-500"
                    : "bg-gray-50 border border-gray-200 hover:bg-gray-100"
                }`}>
                <div className="flex items-center justify-between">
                  <span className={`text-sm font-medium ${
                    local.defaultFormat === field ? "text-blue-700" : "text-gray-700"
                  }`}>
                    {FIELD_LABELS[field]}
                  </span>
                  {local.defaultFormat === field && (
                    <svg className="w-4 h-4 text-blue-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="20 6 9 17 4 12" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </div>
                <p className="text-[11px] text-gray-400 mt-0.5">{FIELD_EXAMPLES[field]}</p>
              </button>
            ))}
          </div>
        </section>

        {/* 지도 설정 */}
        <section className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
          <h2 className="font-semibold text-sm text-gray-900">지도 설정</h2>

          <div>
            <span className="text-xs text-gray-500 block mb-1.5">지도 제공자</span>
            <div className="flex gap-2">
              {([
                { value: "kakao", label: "카카오맵" },
                { value: "naver", label: "네이버맵" }
              ] as const).map(opt => (
                <button
                  key={opt.value}
                  onClick={() => update("mapProvider", opt.value as MapProvider)}
                  className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                    (local.mapProvider || "kakao") === opt.value
                      ? "bg-blue-50 border-2 border-blue-500 text-blue-700"
                      : "bg-gray-50 border border-gray-200 text-gray-700 hover:bg-gray-100"
                  }`}>
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <label className="flex items-center justify-between py-1">
            <div>
              <span className="text-sm text-gray-700">지도 링크 표시</span>
              <p className="text-[11px] text-gray-400">변환 결과에 지도 바로가기 표시</p>
            </div>
            <input
              type="checkbox"
              checked={local.showMapLink ?? true}
              onChange={e => update("showMapLink", e.target.checked)}
              className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
            />
          </label>

          <label className="flex items-center justify-between py-1">
            <div>
              <span className="text-sm text-gray-700">미니맵 표시</span>
              <p className="text-[11px] text-gray-400">변환 결과 하단에 지도 미리보기 표시</p>
            </div>
            <input
              type="checkbox"
              checked={local.showMiniMap ?? true}
              onChange={e => update("showMiniMap", e.target.checked)}
              className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
            />
          </label>
        </section>

        {/* 동작 설정 */}
        <section className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
          <h2 className="font-semibold text-sm text-gray-900">동작 설정</h2>

          <label className="flex items-center justify-between py-1">
            <div>
              <span className="text-sm text-gray-700">데스크톱 알림</span>
              <p className="text-[11px] text-gray-400">변환 완료 시 알림 표시</p>
            </div>
            <input
              type="checkbox"
              checked={local.enableNotifications ?? true}
              onChange={e => update("enableNotifications", e.target.checked)}
              className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
            />
          </label>

          <label className="flex items-center justify-between py-1">
            <div>
              <span className="text-sm text-gray-700">클립보드 주소 자동 감지</span>
              <p className="text-[11px] text-gray-400">웹 페이지에서 주소 복사 시 자동 변환</p>
            </div>
            <input
              type="checkbox"
              checked={local.enableClipboardDetect ?? false}
              onChange={e => update("enableClipboardDetect", e.target.checked)}
              className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
            />
          </label>

          {local.enableClipboardDetect && (
            <div className="ml-1 pl-3 border-l-2 border-blue-200 space-y-1.5">
              <span className="text-xs text-gray-500 block">감지 후 동작</span>
              <div className="flex gap-2">
                {([
                  { value: "notification", label: "알림으로 표시", desc: "변환 결과를 클립보드에 복사 + 데스크톱 알림" },
                  { value: "popup", label: "팝업으로 열기", desc: "변환 팝업 창을 열어 결과 확인" }
                ] as const).map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => update("clipboardAction", opt.value as ClipboardAction)}
                    className={`flex-1 px-3 py-2 rounded-lg text-left transition-all ${
                      (local.clipboardAction || "popup") === opt.value
                        ? "bg-blue-50 border-2 border-blue-500"
                        : "bg-gray-50 border border-gray-200 hover:bg-gray-100"
                    }`}>
                    <span className={`text-sm font-medium block ${
                      (local.clipboardAction || "popup") === opt.value ? "text-blue-700" : "text-gray-700"
                    }`}>
                      {opt.label}
                    </span>
                    <p className="text-[10px] text-gray-400 mt-0.5">{opt.desc}</p>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="pt-1 border-t border-gray-100">
            <span className="text-xs text-gray-500 block mb-1.5">우클릭 '표준주소 변환' 동작</span>
            <div className="flex gap-2">
              {([
                { value: "popup", label: "팝업으로 열기" },
                { value: "notification", label: "자동 복사 + 알림" }
              ] as const).map(opt => (
                <button
                  key={opt.value}
                  onClick={() => update("contextMenuAction", opt.value as ClipboardAction)}
                  className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                    (local.contextMenuAction || "popup") === opt.value
                      ? "bg-blue-50 border-2 border-blue-500 text-blue-700"
                      : "bg-gray-50 border border-gray-200 text-gray-700 hover:bg-gray-100"
                  }`}>
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </section>

        {/* 키보드 단축키 */}
        <section className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
          <h2 className="font-semibold text-sm text-gray-900">키보드 단축키</h2>
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-700">클립보드 주소 즉시 변환</span>
            <div className="flex items-center gap-1">
              {currentShortcut.split("+").map((key, i) => (
                <span key={i} className="flex items-center gap-1">
                  {i > 0 && <span className="text-gray-300 text-xs">+</span>}
                  <kbd className="px-1.5 py-0.5 bg-gray-100 border border-gray-300 rounded text-xs font-mono">
                    {key.trim()}
                  </kbd>
                </span>
              ))}
            </div>
          </div>
          <p className="text-[11px] text-gray-400">
            단축키가 작동하지 않으면 아래 버튼에서 직접 설정하세요.
          </p>
          <button
            onClick={() => {
              chrome.tabs.create({ url: "chrome://extensions/shortcuts" }).catch(() => {
                alert("Chrome 주소창에 chrome://extensions/shortcuts 를 직접 입력해주세요.")
              })
            }}
            className="w-full py-2 text-sm text-blue-600 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors">
            단축키 변경 설정 열기
          </button>
        </section>

        {/* 저장 버튼 */}
        <div className="sticky bottom-4">
          <button
            onClick={handleSave}
            disabled={!dirty}
            className={`w-full py-3 rounded-xl text-sm font-semibold transition-all shadow-sm ${
              saved
                ? "bg-green-500 text-white"
                : dirty
                  ? "bg-blue-600 text-white hover:bg-blue-700 shadow-lg"
                  : "bg-gray-200 text-gray-400 cursor-not-allowed"
            }`}>
            {saved ? "저장 완료" : "설정 저장"}
          </button>
        </div>

        <p className="text-[11px] text-gray-400 text-center pb-4">
          Copyright 2025.10. 개친절한 류주임. All rights reserved.
        </p>
      </div>
    </div>
  )
}

export default IndexOptions
