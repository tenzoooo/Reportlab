import { Buffer } from "node:buffer"
import { encoding_for_model as encodingForModel, get_encoding as getEncoding } from "@dqbd/tiktoken"

type SupportedModel = Parameters<typeof encodingForModel>[0]

const DEFAULT_MODEL: SupportedModel = "gpt-4o-mini"

export type PdfTextResult = {
  text: string
  pages: number | null
}

export type TokenCountResult = {
  model: string
  tokens: number
  characters: number
  pages: number | null
}

/**
 * Extracts plain text from a PDF buffer on the server.
 */
export const extractPdfText = async (buffer: Buffer): Promise<PdfTextResult> => {
  const { default: parsePdf } = await import("pdf-parse/node")
  const { text, numpages } = await parsePdf(buffer)
  return {
    text: text ?? "",
    pages: typeof numpages === "number" ? numpages : null,
  }
}

/**
 * Counts tokens using tiktoken. Falls back to cl100k_base when the model name is unknown.
 */
export const countTokens = (text: string, model?: string): { model: string; tokens: number } => {
  const targetModel = (model?.trim() as SupportedModel | undefined) || DEFAULT_MODEL
  let encoding
  try {
    encoding = encodingForModel(targetModel)
  } catch {
    encoding = getEncoding("cl100k_base")
  }

  try {
    const tokens = encoding.encode(text || "").length
    return { model: targetModel, tokens }
  } finally {
    encoding.free()
  }
}

/**
 * Converts a PDF buffer into a token count summary.
 */
export const pdfBufferToTokenCount = async (buffer: Buffer, model?: string): Promise<TokenCountResult> => {
  const { text, pages } = await extractPdfText(buffer)
  const { model: tokenizerModel, tokens } = countTokens(text, model)
  return {
    model: tokenizerModel,
    tokens,
    characters: text.length,
    pages,
  }
}
