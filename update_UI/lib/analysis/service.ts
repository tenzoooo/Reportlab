import OpenAI from "openai"
import fs from "node:fs"
import path from "node:path"
import { pathToFileURL } from "node:url"
import {
  METHOD_EXTRACTION_PROMPT,
  METHOD_SCHEMA,
  DISCUSSION_EXTRACTION_PROMPT,
  DISCUSSION_SCHEMA,
  EXPERIMENT_STRUCTURE_PROMPT,
  EXPERIMENT_STRUCTURE_SCHEMA,
  EXPERIMENT_DETAILS_PROMPT,
  EXPERIMENT_DETAILS_SCHEMA,
  DESCRIPTION_SYSTEM_PROMPT,
  DESCRIPTION_SCHEMA,
  SUMMARY_SYSTEM_PROMPT,
  SUMMARY_SCHEMA,
  DISCUSSION_UNIT_SYSTEM_PROMPT,
} from "./prompts"
import type { AnalysisResult } from "./types"
import { logInfo, logError } from "@/lib/server/logger"

type JsonRecord = Record<string, any>
type ChatMessage = OpenAI.Chat.Completions.ChatCompletionMessageParam

const MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini"

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

logInfo("analysis:model", { model: MODEL })

const resolvePdfWorkerSrc = (): string | null => {
  // Try to locate pdfjs-dist worker within pnpm store
  const pnpmDir = path.join(process.cwd(), "node_modules", ".pnpm")
  if (!fs.existsSync(pnpmDir)) return null

  const entries = fs.readdirSync(pnpmDir)
  const pdfjsDir = entries.find((e) => e.startsWith("pdfjs-dist@"))
  if (!pdfjsDir) return null

  const base = path.join(pnpmDir, pdfjsDir, "node_modules", "pdfjs-dist")
  const candidates = [
    path.join(base, "build", "pdf.worker.min.mjs"),
    path.join(base, "build", "pdf.worker.mjs"),
    path.join(base, "legacy", "build", "pdf.worker.min.mjs"),
    path.join(base, "legacy", "build", "pdf.worker.mjs"),
  ]

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return pathToFileURL(candidate).toString()
    }
  }

  return null
}

const parsePdfText = async (buffer: Buffer): Promise<string> => {
  // pdf-parse は ESM で default を持たないことがあるので動的 import で両対応する
  const pdfParseModule = await import("pdf-parse")
  const candidate = pdfParseModule as unknown as { default?: unknown; PDFParse?: unknown }

  // Custom page render function to filter out artifacts
  const renderPage = (pageData: any) => {
    // check documents https://mozilla.github.io/pdf.js/
    // pageData is a PDFPageProxy
    return pageData.getTextContent({
      normalizeWhitespace: true,
      disableCombineTextItems: false,
    }).then((textContent: any) => {
      let lastY, text = '';
      // Log that custom render is running (once per page)
      // console.log(`[DEBUG] renderPage called for a page with ${textContent.items.length} items`)

      for (let item of textContent.items) {
        let str = item.str;

        // Skip empty strings
        if (!str || !str.trim()) continue;

        // Aggressively strip XML-like tags from WITHIN the string
        // This handles cases where the tag is attached to other text (e.g. "Text<w:r>")
        str = str.replace(/<[/]?[a-zA-Z0-9:]+[^>]*>/g, "");

        // If string became empty after stripping, skip it
        if (!str.trim()) continue;

        if (lastY == item.transform[5] || !lastY) {
          text += str;
        } else {
          text += '\n' + str;
        }
        lastY = item.transform[5];
      }
      return text;
    });
  }

  const options = {
    pagerender: renderPage
  }

  if (typeof candidate.default === "function") {
    const res = await (candidate.default as (input: Buffer, options?: any) => Promise<{ text: string }>)(buffer, options)
    return res?.text ?? ""
  }
  if (typeof (pdfParseModule as unknown as any) === "function") {
    const res = await (pdfParseModule as unknown as (input: Buffer, options?: any) => Promise<{ text: string }>)(buffer, options)
    return res?.text ?? ""
  }

  const ParserClass = candidate.PDFParse
  if (typeof ParserClass === "function") {
    // Note: The class-based usage of pdf-parse might not support the options object in the constructor 
    // the same way the function export does, or it might need a different approach.
    // However, usually the function export is what's used.
    // If we fall back to class, we might miss the custom render if not supported, 
    // but the regex cleaning downstream will still catch it.
    const parser = new (ParserClass as any)({ data: buffer })
    // worker の import 失敗を避けるため、サーバー環境ではローカルの workerSrc を解決して設定する
    if (typeof ParserClass.setWorker === "function") {
      try {
        const workerSrc = resolvePdfWorkerSrc() || ""
        ParserClass.setWorker(workerSrc)
      } catch {
        // ignore
      }
    }
    try {
      const textResult = await parser.getText?.()
      const text = textResult?.text ?? ""
      return text
    } finally {
      if (typeof parser.destroy === "function") {
        await parser.destroy()
      }
    }
  }

  throw new Error("pdf-parse module did not expose a usable parser")
}

const decodeAndStripTags = (value: string): string => {
  const decoded = value.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&")
  // Remove any XML/HTML/OpenXML-looking tags (e.g., <w:r>...</w:t>) aggressively
  return decoded.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
}

const sanitizeDeep = (input: any): any => {
  if (typeof input === "string") {
    return decodeAndStripTags(input)
  }
  if (Array.isArray(input)) {
    return input.map((item) => sanitizeDeep(item))
  }
  if (input && typeof input === "object") {
    const result: JsonRecord = {}
    for (const [k, v] of Object.entries(input)) {
      result[k] = sanitizeDeep(v)
    }
    return result
  }
  return input
}

const cleanExtractedText = (raw: string): string => {
  if (!raw) return ""
  // Decode common HTML entities then strip XML/HTML-like tags and collapse whitespace
  const decoded = raw.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&")
  return decoded.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
}

const toPreviewString = (value: string, limit = 2000): string => {
  if (!value) return ""
  if (value.length <= limit) return value
  return `${value.slice(0, limit)}…(truncated)`
}

const safeJSONParse = <T>(value: string | null | undefined, fallback: T): T => {
  if (!value) return fallback
  try {
    return JSON.parse(value) as T
  } catch (error) {
    logError("analysis:parse-error", error)
    return fallback
  }
}

const ensureDict = (value: unknown): JsonRecord => {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as JsonRecord
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value)
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed as JsonRecord
    } catch {
      return {}
    }
  }
  return {}
}

const unwrapCommonWrappers = (value: JsonRecord): JsonRecord => {
  const keysOfInterest = new Set(["summary", "units", "experiments", "chapter", "total_count"])
  if (Object.keys(value).some((key) => keysOfInterest.has(key))) {
    return value
  }

  for (const wrapper of ["result", "output", "data"]) {
    const inner = value?.[wrapper]
    if (inner && typeof inner === "object" && !Array.isArray(inner)) {
      const innerKeys = Object.keys(inner)
      if (innerKeys.some((key) => keysOfInterest.has(key))) {
        return inner as JsonRecord
      }
    }
  }

  return value
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

const assignFiguresAndTables = (details: JsonRecord): JsonRecord => {
  const chapter = 5
  const experiments = Array.isArray(details?.experiments) ? details.experiments : []
  let tableCounter = 1
  let figCounter = 1

  const result = experiments.map((exp: JsonRecord) => {
    const base = {
      section: exp?.section ?? "",
      idx: exp?.idx ?? 0,
      subidx: exp?.subidx ?? null,
      name: exp?.name ?? "",
      measurement_conditions: exp?.measurement_conditions ?? "",
      experiment_type: exp?.experiment_type ?? "",
      tool: exp?.tool ?? null,
      reference: exp?.reference ?? null,
      tables: [] as JsonRecord[],
      figures: [] as JsonRecord[],
    }

    if (base.experiment_type === "測定") {
      base.tables.push({
        number: tableCounter,
        label: `表${chapter}.${tableCounter}`,
        type: "data",
      })
      tableCounter += 1
      base.figures.push({
        number: figCounter,
        label: `図${chapter}.${figCounter}`,
        type: "graph",
      })
      figCounter += 1
    } else if (base.experiment_type === "計算") {
      base.figures.push({
        number: figCounter,
        label: `図${chapter}.${figCounter}`,
        type: "graph",
      })
      figCounter += 1
    } else if (base.experiment_type === "分析") {
      base.tables.push({
        number: tableCounter,
        label: `表${chapter}.${tableCounter}`,
        type: "result",
      })
      tableCounter += 1
      base.figures.push({
        number: figCounter,
        label: `図${chapter}.${figCounter}`,
        type: "graph",
      })
      figCounter += 1
    }

    return base
  })

  return { experiments: result }
}

const buildFinalJson = (descriptions: JsonRecord) => {
  const experiments = Array.isArray(descriptions?.experiments) ? descriptions.experiments : []
  const chapter = 5

  const finalExperiments = experiments.map((exp: JsonRecord) => {
    const tables = Array.isArray(exp?.tables)
      ? exp.tables.map((table: JsonRecord) => {
        const tableType = table?.type ?? ""
        const expName = exp?.name ?? ""
        let caption = expName
        if (tableType === "data") {
          caption = `${expName}測定データ`
        } else if (tableType === "result") {
          caption = expName.replace("の測定", "").replace("特性", "").trim() || expName
        }
        return {
          label: table?.label ?? "",
          caption,
        }
      })
      : []

    const figures = Array.isArray(exp?.figures)
      ? exp.figures.map((figure: JsonRecord) => {
        const expType = exp?.experiment_type ?? ""
        const expTool = exp?.tool
        const expName = exp?.name ?? ""
        const caption = expType === "計算" && expTool ? `計算上の${expName}` : expName
        return {
          label: figure?.label ?? "",
          caption,
        }
      })
      : []

    return {
      idx: exp?.idx ?? 0,
      subidx: exp?.subidx ?? null,
      name: exp?.name ?? "",
      description_brief: exp?.description_brief ?? "",
      tables,
      figures,
    }
  })

  return {
    final_json: {
      chapter,
      experiments: finalExperiments,
    },
    validation_status: "success",
    validation_message: "JSONの検証に成功しました",
  }
}

const mergeOutputs = (input_json1: JsonRecord, input_json2: JsonRecord, input_json3: JsonRecord) => {
  const jsList = [input_json1, input_json2, input_json3].map((raw) => unwrapCommonWrappers(ensureDict(raw)))

  const merged: JsonRecord = {
    chapter: null,
    experiments: [] as JsonRecord[],
    summary: null,
    units: [] as JsonRecord[],
    total_count: null,
    references: [] as JsonRecord[],
    reference_list_formatted: [] as string[],
  }

  for (const js of jsList) {
    if (!js || typeof js !== "object" || Array.isArray(js)) continue

    if (merged.chapter === null && Object.prototype.hasOwnProperty.call(js, "chapter")) {
      merged.chapter = js.chapter
    }

    const exps = js.experiments
    if (Array.isArray(exps)) {
      merged.experiments.push(...exps)
    }

    if (merged.summary === null && Object.prototype.hasOwnProperty.call(js, "summary")) {
      merged.summary = js.summary
    }

    if (!merged.units.length && Array.isArray(js.units)) {
      merged.units = js.units
      if (Object.prototype.hasOwnProperty.call(js, "total_count")) {
        merged.total_count = js.total_count
      }
    }

    if (!merged.references.length && Object.prototype.hasOwnProperty.call(js, "references")) {
      merged.references = js.references || []
    }

    if (
      !merged.reference_list_formatted.length &&
      Object.prototype.hasOwnProperty.call(js, "reference_list_formatted")
    ) {
      merged.reference_list_formatted = js.reference_list_formatted || []
    }
  }

  return { merged_json: merged }
}

export async function analyzeDocument(fileBuffer: Buffer): Promise<AnalysisResult> {
  try {
    logInfo("analysis:start", { size: fileBuffer.length })

    const rawText: string = await parsePdfText(fileBuffer)
    logInfo("analysis:text-raw-preview", { preview: toPreviewString(rawText) })
    logInfo("analysis:text-contains-tags", { hasTags: /<[^>]+>/.test(rawText) })

    const text: string = cleanExtractedText(rawText)
    logInfo("analysis:text-extracted", { length: text.length })
    // User requested to log the full text used in prompts
    console.log("--- [DEBUG] FULL EXTRACTED PDF TEXT START ---")
    console.log(text)
    console.log("--- [DEBUG] FULL EXTRACTED PDF TEXT END ---")
    logInfo("analysis:text-preview", { preview: toPreviewString(text) })

    // Step 1: 抜粋（実験方法・考察）を並列取得
    const [methodContentRaw, discussionContentRaw] = await Promise.all([
      callJSONCompletion(
        [
          { role: "system", content: METHOD_EXTRACTION_PROMPT },
          {
            role: "user",
            content:
              "次の入力を与える。仕様に厳密に従い、**JSONのみ**返すこと（解説・コードフェンス禁止）。\n\n【入力】\ntext:\n" +
              text +
              "\n\n【タスク】\n- textから「実験方法」セクションだけを原文どおり抽出し、見出し番号・見出し名・本文を返す（配下小節・箇条書きも本文に含める）。\n\n【ルール】\n- 要約・言い換え・追記・削除・順序入替は禁止。\n- 許可整形はヘッダ/フッタ/ページ番号の除去、改行分断語の結合、行頭末空白除去のみ。\n- 見つからない場合は空文字列で埋める。\n\n【出力（JSON）}\n{\n  \"method\": {\n    \"section_number\": \"\",\n    \"heading\": \"\",\n    \"text\": \"\"\n  }\n}",
          },
        ],
        METHOD_SCHEMA as any
      ),
      callJSONCompletion(
        [
          { role: "system", content: DISCUSSION_EXTRACTION_PROMPT },
          {
            role: "user",
            content:
              "次の入力を与える。仕様に厳密に従い、**JSONのみ**返すこと（解説・コードフェンス禁止）。\n\n【入力】\ntext:\n" +
              text +
              "\n\n【タスク】\n- textから「考察/検討/報告事項/Discussion」に該当するセクションだけを原文どおり抽出し、見出し番号・見出し名・本文を返す（箇条書きも本文に含める）。\n\n【ルール】\n- 要約・言い換え・追記・削除・順序入替は禁止。\n- 許可整形はヘッダ/フッタ/ページ番号の除去、改行分断語の結合、行頭末空白除去のみ。\n- 見つからない場合は空文字列で埋める。\n\n【出力（JSON）}\n{\n  \"discussion\": {\n    \"section_number\": \"\",\n    \"heading\": \"\",\n    \"text\": \"\"\n  }\n}",
          },
        ],
        DISCUSSION_SCHEMA as any
      ),
    ])

    const methodJSON = safeJSONParse<JsonRecord>(methodContentRaw, { method: { text: "" } })
    const discussionJSON = safeJSONParse<JsonRecord>(discussionContentRaw, { discussion: { text: "" } })

    const methodText: string = methodJSON?.method?.text || text
    const discussionText: string = discussionJSON?.discussion?.text || ""

    // Step 2: 実験構造の抽出
    const structureRaw = await callJSONCompletion(
      [
        { role: "system", content: EXPERIMENT_STRUCTURE_PROMPT.replace("{{experiment_methods_text}}", methodText) },
        {
          role: "user",
          content: `実験方法テキスト:\n\n${methodText}`,
        },
      ],
      EXPERIMENT_STRUCTURE_SCHEMA as any
    )

    console.log("--- [DEBUG] LLM OUTPUT (STRUCTURE) START ---")
    console.log(structureRaw)
    console.log("--- [DEBUG] LLM OUTPUT (STRUCTURE) END ---")
    const structureJSON = safeJSONParse<JsonRecord>(structureRaw, { experiments: [], chapter: 5 })

    // Step 3: 実験詳細抽出
    const detailsRaw = await callJSONCompletion(
      [
        {
          role: "system",
          content: EXPERIMENT_DETAILS_PROMPT.replace("{{experiment_methods_text}}", methodText).replace(
            "{{experiment_structure}}",
            JSON.stringify(structureJSON)
          ),
        },
        {
          role: "user",
          content: `実験方法テキスト:\n\n''''\n\n${methodText}\n\n''''\n\n\n実験構造:\n\n''''\n\n${JSON.stringify(structureJSON)}\n\n''''`,
        },
      ],
      EXPERIMENT_DETAILS_SCHEMA as any
    )
    const detailsJSON = safeJSONParse<JsonRecord>(detailsRaw, { experiments: [] })

    // Step 4: 図表割当
    const experimentsWithFigures = assignFiguresAndTables(detailsJSON)

    // Step 5: 説明文生成
    const experimentsWithFiguresText = JSON.stringify(experimentsWithFigures)

    const descriptionsRaw = await callJSONCompletion(
      [
        { role: "system", content: DESCRIPTION_SYSTEM_PROMPT.replace("{{experiment_with_figures}}", experimentsWithFiguresText) },
        {
          role: "user",
          content: `実験データ:\n\n''''\n\n${experimentsWithFiguresText}\n\n''''`,
        },
      ],
      DESCRIPTION_SCHEMA as any
    )
    const descriptionsJSON = safeJSONParse<JsonRecord>(descriptionsRaw, { experiments: [] })

    // Step 6: JSON組み立て・検証
    const finalJsonResult = buildFinalJson(descriptionsJSON)

    // Step 7: まとめ生成
    const summaryRaw = await callJSONCompletion(
      [{ role: "system", content: SUMMARY_SYSTEM_PROMPT.replace("{{lab_text}}", text) }],
      SUMMARY_SCHEMA as any
    )
    let summaryJSON = safeJSONParse<JsonRecord>(summaryRaw, { summary: "" })

    // Fallback: if summary is empty, try a plain JSON object generation once more
    if (!summaryJSON.summary) {
      const summaryRetry = await callJSONCompletion(
        [
          {
            role: "system",
            content:
              "260〜340字・だ・である調で1段落のまとめをJSONで返してください。フォーマット: {\"summary\": \"...\"}。本文のみ、句点で終える。入力テキスト以外の情報は禁止。",
          },
          { role: "user", content: text },
        ],
        { type: "json_object" }
      )
      summaryJSON = safeJSONParse<JsonRecord>(summaryRetry, summaryJSON)
    }

    // Step 8: 考察ユニット生成
    const discussionUnitsRaw = await callJSONCompletion(
      [
        { role: "system", content: DISCUSSION_UNIT_SYSTEM_PROMPT },
        {
          role: "user",
          content:
            "# 入力\n\n考察テキスト:\n\n" +
            discussionText +
            "\n\n\n# 出力条件\n\nSystemに従い、JSONのみを返す（考察ユニット配列と総数を含む）。",
        },
      ],
      { type: "json_object" }
    )
    const discussionUnitsJSON = safeJSONParse<JsonRecord>(discussionUnitsRaw, { units: [] })

    // Step 9: 結合
    const mergedResult = mergeOutputs(finalJsonResult.final_json, discussionUnitsJSON, summaryJSON)

    const merged_json = {
      ...mergedResult.merged_json,
      consideration: {
        units: mergedResult.merged_json.units ?? [],
        reference_list_formatted: mergedResult.merged_json.reference_list_formatted ?? [],
        references: mergedResult.merged_json.references ?? [],
      },
    }

    const sanitizedMerged = sanitizeDeep(merged_json)

    const wrappedOutput: JsonRecord = {
      ...sanitizedMerged,
      output: { result_json: sanitizedMerged },
      outputs: { result_json: sanitizedMerged },
      result_json: sanitizedMerged,
    }

    logInfo("analysis:success", { experiments: sanitizedMerged.experiments?.length ?? 0 })
    return wrappedOutput as AnalysisResult
  } catch (error) {
    logError("analysis:error", error)
    throw error
  }
}
