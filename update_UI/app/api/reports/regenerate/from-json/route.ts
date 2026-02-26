import { NextRequest } from "next/server"

import { runReportActionRoute } from "@/app/api/reports/_shared/report-action"
import { renderReportFromSupabaseAnalysis } from "@/lib/server/report-agent"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(request: NextRequest) {
  return runReportActionRoute({
    request,
    actionLabel: "reports:regenerate:from-json",
    run: ({ reportId, userId }) => renderReportFromSupabaseAnalysis({ reportId, userId }),
    buildSuccessBody: (result) => ({ fileUrl: result.artifactKey }),
  })
}
