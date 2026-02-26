import { NextRequest } from "next/server"

import { runReportActionRoute } from "@/app/api/reports/_shared/report-action"
import { runReportAgentFromSupabaseReport } from "@/lib/server/report-agent"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(request: NextRequest) {
  return runReportActionRoute({
    request,
    actionLabel: "reports:regenerate:from-cache",
    run: ({ reportId, userId }) => runReportAgentFromSupabaseReport({ reportId, userId }),
    buildSuccessBody: (result) => ({ jobId: result.jobId, fileUrl: result.artifactKey }),
  })
}
