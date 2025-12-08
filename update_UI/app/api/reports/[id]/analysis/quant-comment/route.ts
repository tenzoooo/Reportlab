import { NextRequest, NextResponse } from "next/server"
import OpenAI from "openai"
import { QUANTITATIVE_COMMENT_PROMPT, QUANTITATIVE_COMMENT_SCHEMA } from "@/lib/analysis/prompts"
import { createClient } from "@/lib/supabase/server"
import { logError, logRequest } from "@/lib/server/logger"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type JsonRecord = Record<string, any>
type ChatMessage = OpenAI.Chat.Completions.ChatCompletionMessageParam

const MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini"
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

const unwrapResultJson = (payload: JsonRecord | null | undefined): JsonRecord => {
  if (!payload || typeof payload !== "object") return {}
  if (payload.output?.result_json) return payload.output.result_json as JsonRecord
  if (payload.outputs?.result_json) return payload.outputs.result_json as JsonRecord
  if (payload.result_json) return payload.result_json as JsonRecord
  return payload as JsonRecord
}

const rewrapResultJson = (base: JsonRecord | null | undefined, resultJson: JsonRecord): JsonRecord => {
  // Always keep root-level result_json for backward compatibility
  if (!base || typeof base !== "object") return { result_json: resultJson }
  const cloned = structuredClone(base) as JsonRecord

  // Ensure primary slot
  cloned.result_json = resultJson

  // Mirror into common wrappers so既存の抽出処理でも拾える
  if (cloned.output && typeof cloned.output === "object") {
    (cloned.output as JsonRecord).result_json = resultJson
  }
  if (cloned.outputs && typeof cloned.outputs === "object") {
    (cloned.outputs as JsonRecord).result_json = resultJson
  }

  return cloned
}

const callJSONCompletion = async (
  messages: ChatMessage[],
  responseFormat?: OpenAI.Chat.Completions.ChatCompletionCreateParams["response_format"]
): Promise<string> => {
  const completion = await openai.chat.completions.create({
    model: MODEL,
    messages,
    response_format: responseFormat ?? { type: "json_object" },
  })
  return completion.choices[0]?.message?.content || ""
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: reportId } = await params
  logRequest(req, "reports/analysis/quant-comment:post")

  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json({ error: "OPENAI_API_KEY is not set" }, { status: 500 })
  }

  try {
    const body = await req.json().catch(() => ({}))
    const expIndex = Number(body?.experiment_index)
    if (!Number.isInteger(expIndex) || expIndex < 0) {
      return NextResponse.json({ error: "experiment_index must be a non-negative integer" }, { status: 400 })
    }

    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Verify ownership
    const { data: report, error: reportError } = await supabase
      .from("reports")
      .select("id")
      .eq("id", reportId)
      .eq("user_id", user.id)
      .maybeSingle()

    if (reportError || !report) {
      return NextResponse.json({ error: "Report not found" }, { status: 404 })
    }

    // Fetch latest analysis result
    const { data: analysis, error: analysisError } = await supabase
      .from("analysis_results")
      .select("id, dify_response")
      .eq("report_id", reportId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()

    if (analysisError || !analysis) {
      return NextResponse.json({ error: "Analysis data not found" }, { status: 404 })
    }

    const resultJson = unwrapResultJson(analysis.dify_response)
    const experiments = Array.isArray(resultJson?.experiments) ? resultJson.experiments : []
    if (!experiments[expIndex]) {
      return NextResponse.json({ error: "Experiment not found" }, { status: 404 })
    }

    const targetExp = experiments[expIndex] as JsonRecord
    const expName = targetExp.name || `実験${expIndex + 1}`
    const tablesText = JSON.stringify(targetExp.tables ?? [], null, 2)
    const experimentTextParts = [
      targetExp.description_brief,
      targetExp.summary,
      resultJson?.summary,
    ].filter(Boolean)
    const experimentText = experimentTextParts.join("\n") || "関連テキストなし"

    const prompt = QUANTITATIVE_COMMENT_PROMPT
      .replace("{{experiment_name}}", expName)
      .replace("{{experiment_tables}}", tablesText)
      .replace("{{experiment_text}}", experimentText)

    const commentRaw = await callJSONCompletion(
      [{ role: "user", content: prompt }],
      QUANTITATIVE_COMMENT_SCHEMA as any
    )

    let parsed: JsonRecord = {}
    try {
      parsed = JSON.parse(commentRaw)
    } catch (err) {
      logError("reports/analysis/quant-comment:parse-error", err, { commentRaw })
      return NextResponse.json({ error: "Failed to parse model response" }, { status: 500 })
    }

    const blocks = Array.isArray(parsed.comment_blocks) ? parsed.comment_blocks : []
    const updatedExperiments = [...experiments]
    updatedExperiments[expIndex] = { ...targetExp, quant_comment: blocks }

    const updatedResultJson = { ...resultJson, experiments: updatedExperiments }
    const updatedDifyResponse = rewrapResultJson(analysis.dify_response, updatedResultJson)

    const { error: updateError } = await supabase
      .from("analysis_results")
      .update({ dify_response: updatedDifyResponse })
      .eq("id", analysis.id)

    if (updateError) {
      throw updateError
    }

    return NextResponse.json({ result_json: updatedResultJson })
  } catch (error) {
    logError("reports/analysis/quant-comment:error", error)
    return NextResponse.json({ error: "Failed to generate quantitative comment" }, { status: 500 })
  }
}
