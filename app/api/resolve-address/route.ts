import { type NextRequest, NextResponse } from "next/server"
import { resolveAddress } from "@/lib/utils/kakao-api"

export async function POST(request: NextRequest) {
  try {
    const { address } = await request.json()

    if (!address) {
      return NextResponse.json({ error: "Address is required" }, { status: 400 })
    }

    const result = await resolveAddress(address)

    return NextResponse.json(result)
  } catch (error) {
    console.error("[v0] Resolve address error:", error)
    return NextResponse.json({ error: "Failed to resolve address" }, { status: 500 })
  }
}
