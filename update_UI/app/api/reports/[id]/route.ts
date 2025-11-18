import { NextResponse, type NextRequest } from "next/server"
import { logRequest } from "@/lib/server/logger"

type ReportStatus = "draft" | "processing" | "completed" | "error"

const toISO = (d = new Date()) => new Date(d.getTime() - d.getMilliseconds()).toISOString()

export async function GET(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  logRequest(req, "reports:detail")
  const { id } = await context.params

  return NextResponse.json({
    report: {
      id,
      title: `サンプルレポート ${id}`,
      status: "completed" as ReportStatus,
      created_at: toISO(),
      updated_at: toISO(),
      file_url: null,
      template_data: null,
    },
    experimentData: [
      { id: "f1", report_id: id, file_name: "analysis.xlsx", file_type: "excel", file_url: "", uploaded_at: toISO() },
      { id: "f2", report_id: id, file_name: "setup.jpg", file_type: "image", file_url: "", uploaded_at: toISO() },
    ],
    analysisResult: null,
  })
}

export async function PUT(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  logRequest(req, "reports:update")
  const { id } = await context.params
  const _body = await req.json().catch(() => ({}))
  return NextResponse.json({
    report: {
      id,
      title: `サンプルレポート ${id}`,
      status: "completed" as ReportStatus,
      created_at: toISO(),
      updated_at: toISO(),
      file_url: null,
      template_data: null,
    },
  })
}

export async function DELETE(req: NextRequest, _context: { params: Promise<{ id: string }> }) {
  logRequest(req, "reports:delete")
  return NextResponse.json({ success: true })
}
