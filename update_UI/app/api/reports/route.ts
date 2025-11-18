import { NextResponse, type NextRequest } from "next/server"
import { logRequest } from "@/lib/server/logger"

// Minimal stub to avoid 404s during UI development
// Returns an empty paginated response for /api/reports
export async function GET(request: NextRequest) {
  logRequest(request, "reports:list")
  const url = new URL(request.url)

  const page = Math.max(1, Number(url.searchParams.get("page") ?? "1"))
  const limit = Math.min(50, Math.max(1, Number(url.searchParams.get("limit") ?? "10")))

  // Optional filters (currently unused in the stub)
  // const status = url.searchParams.get("status")
  // const q = url.searchParams.get("q")

  return NextResponse.json({
    reports: [],
    total: 0,
    page,
    limit,
  })
}
