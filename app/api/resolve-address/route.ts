import { type NextRequest, NextResponse } from "next/server"
import { resolveAddress } from "@/lib/utils/kakao-api"

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { address } = body

    if (!address || typeof address !== "string") {
      return NextResponse.json({ error: "Address is required" }, { status: 400 })
    }

    if (address.length > 500) {
      return NextResponse.json({ error: "Address too long" }, { status: 400 })
    }

    const result = await resolveAddress(address)

    return NextResponse.json(result)
  } catch (error) {
    console.error("[v0] Resolve address error:", error instanceof Error ? error.message : "Unknown error")
    return NextResponse.json({ error: "Failed to resolve address" }, { status: 500 })
  }
}
