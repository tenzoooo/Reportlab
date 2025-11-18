import { NextResponse, type NextRequest } from "next/server"
import { logRequest } from "@/lib/server/logger"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// Simple stub that returns a tiny text file as a docx download
export async function GET(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  logRequest(req, "reports:download")
  const { id } = await context.params
  const content = `Report ${id}\nThis is a stubbed .docx download.\n`
  const buffer = Buffer.from(content, "utf-8")

  return new NextResponse(buffer, {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="report-${encodeURIComponent(id)}.docx"`,
      "Content-Length": String(buffer.byteLength),
      "Cache-Control": "no-store",
    },
  })
}
