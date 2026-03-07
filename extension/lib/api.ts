import { Storage } from "@plasmohq/storage"
import type { ResolvedDisplay, ExtensionSettings } from "./types"

const storage = new Storage()

async function getApiBaseUrl(): Promise<string> {
  const settings = await storage.get<ExtensionSettings>("settings")
  return settings?.apiBaseUrl || "https://gjdong.vercel.app"
}

export async function resolveAddress(address: string): Promise<ResolvedDisplay> {
  const baseUrl = await getApiBaseUrl()

  const response = await fetch(`${baseUrl}/api/resolve-address`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ address })
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

  const response = await fetch(`${baseUrl}/api/resolve-address-batch`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ addresses })
  })

  if (!response.ok) {
    throw new Error(`API error: ${response.status}`)
  }

  return response.json()
}
