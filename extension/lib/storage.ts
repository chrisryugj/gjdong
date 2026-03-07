import { Storage } from "@plasmohq/storage"
import type { HistoryItem, ExtensionSettings, DEFAULT_SETTINGS } from "./types"

const storage = new Storage()
const MAX_HISTORY = 20

export async function getHistory(): Promise<HistoryItem[]> {
  return (await storage.get<HistoryItem[]>("history")) || []
}

export async function addHistory(item: Omit<HistoryItem, "timestamp">): Promise<void> {
  const history = await getHistory()

  // 중복 제거 (같은 input)
  const filtered = history.filter((h) => h.input !== item.input)

  // 최신 항목을 맨 앞에 추가
  filtered.unshift({ ...item, timestamp: Date.now() })

  // 즐겨찾기가 아닌 항목만 MAX_HISTORY 제한 적용
  const favorites = filtered.filter((h) => h.favorite)
  const nonFavorites = filtered.filter((h) => !h.favorite).slice(0, MAX_HISTORY)

  await storage.set("history", [...favorites, ...nonFavorites])
}

export async function toggleFavorite(input: string): Promise<void> {
  const history = await getHistory()
  const updated = history.map((h) =>
    h.input === input ? { ...h, favorite: !h.favorite } : h
  )
  await storage.set("history", updated)
}

export async function clearHistory(): Promise<void> {
  const history = await getHistory()
  // 즐겨찾기만 유지
  const favorites = history.filter((h) => h.favorite)
  await storage.set("history", favorites)
}

export async function getSettings(): Promise<ExtensionSettings> {
  const settings = await storage.get<ExtensionSettings>("settings")
  if (!settings) {
    const { DEFAULT_SETTINGS } = await import("./types")
    return DEFAULT_SETTINGS
  }
  return settings
}

export async function updateSettings(
  partial: Partial<ExtensionSettings>
): Promise<void> {
  const current = await getSettings()
  await storage.set("settings", { ...current, ...partial })
}
