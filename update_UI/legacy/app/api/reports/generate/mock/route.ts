import { NextResponse, type NextRequest } from "next/server"
import { Buffer } from "buffer"
import { z } from "zod"
import { generateReport } from "@/lib/docx/generator"
import { debugError, debugLog } from "@/lib/utils/debug"

export const runtime = "nodejs"

const schema = z.object({
  title: z.string().optional(),
  difyOutput: z.unknown().optional(),
  result_json: z.unknown().optional(),
})

export async function POST(request: NextRequest) {
  const json = await request.json().catch(() => null)
  if (!json) return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })

  const parsed = schema.safeParse(json)
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 })
  }

  const title = parsed.data.title || "Mock Report"
  const difyOutput =
    typeof parsed.data.difyOutput !== "undefined"
      ? parsed.data.difyOutput
      : typeof parsed.data.result_json !== "undefined"
        ? parsed.data.result_json
        : undefined

  if (typeof difyOutput === "undefined") {
    return NextResponse.json({ error: "Provide difyOutput or result_json" }, { status: 400 })
  }

  debugLog("Mock generate invoked", { hasTitle: Boolean(title) })

  try {
    const buffer = await generateReport({ title, difyOutput })

    return new Response(Buffer.from(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="generated-mock.docx"`,
        "Cache-Control": "no-store",
      },
    })
  } catch (error) {
    debugError("Mock report generation failed", error)
    return NextResponse.json({ error: "Mock generation failed" }, { status: 500 })
  }
}

