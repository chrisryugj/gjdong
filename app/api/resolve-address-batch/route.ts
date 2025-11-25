import { type NextRequest, NextResponse } from "next/server"
import { resolveAddress } from "@/lib/utils/kakao-api"

let currentBatchSize = 7
let currentDelay = 80

export async function POST(request: NextRequest) {
  try {
    const { addresses } = await request.json()

    if (!addresses || !Array.isArray(addresses)) {
      return NextResponse.json({ error: "Addresses array is required" }, { status: 400 })
    }

    console.log("[v0] Batch resolving addresses:", addresses.length)

    const totalAddresses = addresses.length
    let batchSize: number
    let batchDelay: number

    if (totalAddresses <= 50) {
      batchSize = 7
      batchDelay = 80
      console.log("[v0] Using fast settings for ≤50 addresses")
    } else {
      batchSize = 5
      batchDelay = 100
      console.log("[v0] Using conservative settings for >50 addresses")
    }

    const results = []
    let errorCount = 0
    let retryAttempts = 0
    const maxRetries = 2

    for (let i = 0; i < addresses.length; i += batchSize) {
      const batch = addresses.slice(i, i + batchSize)

      try {
        const batchResults = await Promise.allSettled(
          batch.map(async (item) => {
            const address = typeof item === "string" ? item : item.address
            const facilityName = typeof item === "object" ? item.facilityName : undefined

            try {
              const resolved = await resolveAddress(address)
              return {
                ...resolved,
                facilityName,
              }
            } catch (error) {
              console.error("[v0] Failed to resolve address:", address, error)
              errorCount++
              return {
                display: address,
                meta: {
                  gu: "",
                  lon: 127.0845,
                  lat: 37.5384,
                  source: "FALLBACK",
                },
                fallback: true,
                message: "주소 변환 중 오류가 발생했습니다.",
                originalInput: address,
                facilityName,
              }
            }
          }),
        )

        for (const result of batchResults) {
          if (result.status === "fulfilled") {
            results.push(result.value)
          } else {
            console.error("[v0] Promise rejected:", result.reason)
            errorCount++
            results.push({
              display: "변환 실패",
              meta: {
                gu: "",
                lon: 127.0845,
                lat: 37.5384,
                source: "FALLBACK",
              },
              fallback: true,
              message: "주소 변환 중 오류가 발생했습니다.",
            })
          }
        }

        if (errorCount > batch.length * 0.3 && retryAttempts < maxRetries) {
          console.log("[v0] High error rate detected, adjusting parameters...")
          batchSize = Math.max(3, Math.floor(batchSize * 0.7))
          batchDelay = Math.min(400, batchDelay * 2)
          retryAttempts++
        }

        errorCount = 0

        if (i + batchSize < addresses.length) {
          await new Promise((resolve) => setTimeout(resolve, batchDelay))
        }
      } catch (batchError) {
        console.error("[v0] Batch processing error:", batchError)
        batchSize = Math.max(3, Math.floor(batchSize * 0.7))
        batchDelay = Math.min(400, batchDelay * 2)
      }
    }

    console.log("[v0] Batch resolution complete:", results.length)

    currentBatchSize = 7
    currentDelay = 80

    return NextResponse.json({
      results,
      metadata: {
        totalProcessed: results.length,
        successCount: results.filter((r) => !r.fallback).length,
        failureCount: results.filter((r) => r.fallback).length,
        adjustedParameters: retryAttempts > 0,
      },
    })
  } catch (error) {
    console.error("[v0] Batch resolve error:", error)
    return NextResponse.json({ error: "Failed to resolve addresses" }, { status: 500 })
  }
}
