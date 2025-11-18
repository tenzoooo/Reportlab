import { NextResponse, type NextRequest } from "next/server"
import { Buffer } from "node:buffer"
import { z } from "zod"
import { generateReport } from "@/lib/docx/generator"
import type { DocTemplateFigureImage } from "@/lib/docx/template-data"

export const runtime = "nodejs"

const schema = z.object({
  title: z.string().optional(),
  difyOutput: z.unknown().optional(),
  result_json: z.unknown().optional(),
  figureImages: z
    .array(
      z.object({
        name: z.string().optional(),
        width: z.number().optional(),
        height: z.number().optional(),
        data: z.string().min(1),
      })
    )
    .optional(),
})

type FigureImageInput = z.infer<typeof schema>["figureImages"] extends Array<infer T> ? T : never

export async function POST(request: NextRequest) {
  const json = await request.json().catch(() => null)
  if (!json) {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const parsed = schema.safeParse(json)
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 })
  }

  const title = parsed.data.title || "Mock Report"
  const difyOutput =
    parsed.data.difyOutput !== undefined
      ? parsed.data.difyOutput
      : parsed.data.result_json !== undefined
        ? parsed.data.result_json
        : undefined

  if (typeof difyOutput === "undefined") {
    return NextResponse.json({ error: "Provide difyOutput or result_json" }, { status: 400 })
  }

  const toFigureImageBuffer = (entry: FigureImageInput): DocTemplateFigureImage | null => {
    try {
      const buffer = Buffer.from(entry.data, "base64")
      const width = Number.isFinite(entry.width) ? Math.max(1, Math.round(entry.width ?? 0)) : undefined
      const height = Number.isFinite(entry.height) ? Math.max(1, Math.round(entry.height ?? 0)) : undefined
      return {
        buffer,
        width: width ?? 480,
        height: height ?? 320,
      }
    } catch (error) {
      console.error("Failed to decode figure image buffer", { error })
      return null
    }
  }

  const figureImagesRaw = parsed.data.figureImages
  const figureImages = Array.isArray(figureImagesRaw)
    ? figureImagesRaw
        .map((entry) => toFigureImageBuffer(entry))
        .filter((value): value is DocTemplateFigureImage => Boolean(value))
    : undefined

  try {
    const buffer = await generateReport({ title, difyOutput, figureImages })
    return new Response(Buffer.from(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="generated-mock.docx"`,
        "Cache-Control": "no-store",
      },
    })
  } catch (error) {
    console.error("Mock report generation failed", error)
    return NextResponse.json({ error: "Mock generation failed" }, { status: 500 })
  }
}
