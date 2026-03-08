import { Storage } from "@plasmohq/storage"
import type { ResolvedDisplay, ExtensionSettings } from "./types"

const storage = new Storage()
const DEFAULT_API_URL = "https://gjdong.vercel.app"

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

function sanitizeAddress(input: string): string {
  return input.trim().slice(0, 200)
}

async function getApiBaseUrl(): Promise<string> {
  const settings = await storage.get<ExtensionSettings>("settings")
  return validateApiBaseUrl(settings?.apiBaseUrl || "")
}

export async function resolveAddress(address: string): Promise<ResolvedDisplay> {
  const baseUrl = await getApiBaseUrl()

  const response = await fetch(`${baseUrl}/api/resolve-address`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ address: sanitizeAddress(address) })
  })

  if (!response.ok) {
    throw new Error(`API error: ${response.status}`)
  }

  return response.json()
}

export async function resolveAddressBatch(
  addresses: Array<string | { address: string; facilityName?: string }>
): Promise<{
  results: ResolvedDisplay[]
  metadata: {
    totalProcessed: number
    successCount: number
    failureCount: number
  }
}> {
  const baseUrl = await getApiBaseUrl()

  const sanitized = addresses.map((item) => {
    if (typeof item === "string") return sanitizeAddress(item)
    return { address: sanitizeAddress(item.address), facilityName: item.facilityName }
  })

  const response = await fetch(`${baseUrl}/api/resolve-address-batch`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ addresses: sanitized })
  })

  if (!response.ok) {
    throw new Error(`API error: ${response.status}`)
  }

  return response.json()
}
