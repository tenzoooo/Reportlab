import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import path from "node:path"
import { tmpdir } from "node:os"
import { spawn } from "node:child_process"
import type {
  DocTemplateData,
  DocTemplateFigure,
  DocTemplateFigureImage,
  DocTemplateExperiment,
  DocTemplateBlock,
} from "./template-data"
import { buildDocTemplateData } from "./template-data"

export { buildDocTemplateData } from "./template-data"

const DOCX_DEBUG = process.env.DOCX_DEBUG === "1"
const logDocxDebug = (...args: unknown[]) => {
  if (DOCX_DEBUG) {
    console.log("[docx/generator]", ...args)
  }
}

const TEMPLATE_PATH = path.join(process.cwd(), "templates", "chapter_fixed.docx")
const PY_RENDERER_PATH = path.join(process.cwd(), "lib", "docx", "render_with_docxtpl.py")
const PYTHON_BIN = process.env.PYTHON_BIN || "python3"

logDocxDebug("module loaded", {
  path: __filename,
  templatePath: TEMPLATE_PATH,
  rendererPath: PY_RENDERER_PATH,
})

const PROTECTION_BYPASS_TOKEN =
  process.env.VERCEL_PROTECTION_BYPASS_TOKEN ||
  process.env.VERCEL_DEPLOYMENT_PROTECTION_BYPASS_TOKEN ||
  process.env.VERCEL_BYPASS_TOKEN

const getBaseUrl = () => {
  if (process.env.NEXT_PUBLIC_BASE_URL) return process.env.NEXT_PUBLIC_BASE_URL.replace(/\/+$/, "")
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`.replace(/\/+$/, "")
  return "http://localhost:3000"
}

const decodeAndStripTags = (value: string): string => {
  const decoded = value.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&")
  return decoded.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
}

const sanitizeDeep = (input: unknown): unknown => {
  if (typeof input === "string") {
    return decodeAndStripTags(input)
  }
  if (Array.isArray(input)) {
    return input.map((item) => sanitizeDeep(item))
  }
  if (input && typeof input === "object") {
    const result: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
      result[k] = sanitizeDeep(v)
    }
    return result
  }
  return input
}

type SerializableFigureImage = Omit<DocTemplateFigureImage, "buffer"> & { buffer: string }
type SerializableFigure = Omit<DocTemplateFigure, "figure_image"> & { figure_image?: SerializableFigureImage }
type SerializableExperiment = Omit<DocTemplateExperiment, "figures"> & { figures: SerializableFigure[] }
type SerializableDocTemplateData = Omit<DocTemplateData, "experiments"> & {
  experiments: SerializableExperiment[]
}

export type GenerateReportInput = {
  title: string
  difyOutput: unknown
  figureImages?: DocTemplateFigureImage[]
}

const applyFigureImages = (
  data: DocTemplateData,
  figureImages: DocTemplateFigureImage[] | undefined
): DocTemplateData => {
  if (!figureImages || figureImages.length === 0) {
    return data
  }

  let cursor = 0
  let hasChanges = false
  const experiments = data.experiments.map((experiment) => {
    if (experiment.figures.length === 0) {
      return experiment
    }

    let figuresChanged = false
    const figures = experiment.figures.map((figure) => {
      const asset = figureImages[cursor]
      if (!asset) {
        return figure
      }
      cursor += 1
      figuresChanged = true
      hasChanges = true
      return asset
        ? {
          figure_image: asset,
          ...figure,
        }
        : figure
    })

    if (!figuresChanged) {
      return experiment
    }

    return {
      ...experiment,
      figures,
    }
  })

  if (!hasChanges) {
    return data
  }

  return {
    ...data,
    experiments,
  }
}

const toBase64Figures = (data: DocTemplateData): SerializableDocTemplateData => {
  const experiments = data.experiments.map<SerializableExperiment>((experiment) => {
    const figures = experiment.figures.map<SerializableFigure>((figure) => {
      if (!figure.figure_image) {
        return {
          ...figure,
          figure_image: undefined,
        }
      }
      const buffer = figure.figure_image.buffer
      return {
        ...figure,
        figure_image: {
          ...figure.figure_image,
          buffer: buffer instanceof Buffer ? buffer.toString("base64") : "",
        },
      }
    })
    return {
      ...experiment,
      figures,
    }
  })

  return {
    ...data,
    experiments,
  }
}

const runPythonRenderer = async (context: SerializableDocTemplateData): Promise<Buffer> => {
  // [DEBUG] Save the context to a file in the project root for inspection
  try {
    await writeFile(path.join(process.cwd(), "debug_template_data.json"), JSON.stringify(context, null, 2), "utf-8")
    console.log("[DEBUG] Saved template data to debug_template_data.json")
  } catch (err) {
    console.error("[DEBUG] Failed to save debug template data:", err)
  }

  // Check if running on Vercel
  if (process.env.VERCEL) {
    console.log("Running on Vercel, invoking Python Serverless Function...")

    // Read template file and convert to base64
    const templateBuffer = await readFile(TEMPLATE_PATH)
    const templateBase64 = templateBuffer.toString("base64")

    const payload = {
      template_base64: templateBase64,
      context,
    }

    // Determine API URL
    // On Vercel, we can usually use a relative URL if calling from the frontend, 
    // but here we are likely server-side. 
    const apiUrl = `${getBaseUrl()}/api/generate_docx`

    console.log(`Sending request to ${apiUrl}`)

    const headers: Record<string, string> = { "Content-Type": "application/json" }
    if (PROTECTION_BYPASS_TOKEN) {
      headers["x-vercel-protection-bypass"] = PROTECTION_BYPASS_TOKEN
    }

    const response = await fetch(apiUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Python renderer API failed: ${response.status} ${response.statusText} - ${errorText}`)
    }

    const arrayBuffer = await response.arrayBuffer()
    return Buffer.from(arrayBuffer)
  }

  // Local execution via child_process
  const workdir = await mkdtemp(path.join(tmpdir(), "docxtpl-"))
  const payload = {
    template_path: TEMPLATE_PATH,
    output_path: path.join(workdir, "output.docx"),
    context,
  }

  await writeFile(path.join(workdir, "payload.json"), JSON.stringify(payload), "utf-8")

  // [DEBUG] Log the payload sent to Python
  console.log("--- [DEBUG] PYTHON PAYLOAD START ---")
  console.log(JSON.stringify(payload, null, 2))
  console.log("--- [DEBUG] PYTHON PAYLOAD END ---")

  await new Promise<void>((resolve, reject) => {
    const child = spawn(PYTHON_BIN, [PY_RENDERER_PATH], {
      cwd: process.cwd(),
      stdio: ["pipe", "inherit", "inherit"],
    })
    child.stdin.write(JSON.stringify(payload))
    child.stdin.end()

    child.on("error", reject)
    child.on("exit", (code) => {
      if (code === 0) {
        resolve()
      } else {
        reject(new Error(`docxtpl renderer exited with code ${code}`))
      }
    })
  })

  try {
    return await readFile(payload.output_path)
  } finally {
    await rm(workdir, { recursive: true, force: true })
  }
}

const buildBlocks = (data: DocTemplateData): DocTemplateData => {
  const experiments = data.experiments.map<DocTemplateExperiment>((experiment) => {
    const blocks: DocTemplateBlock[] = []
    const maxLen = Math.max(experiment.tables.length, experiment.figures.length)
    for (let i = 0; i < maxLen; i += 1) {
      if (experiment.tables[i]) {
        blocks.push({ type: "table", table: experiment.tables[i] })
      }
      if (experiment.figures[i]) {
        blocks.push({ type: "figure", figure: experiment.figures[i] })
      }
    }
    return { ...experiment, blocks }
  })

  return { ...data, experiments }
}

export async function generateReport({ difyOutput, figureImages }: GenerateReportInput): Promise<Buffer> {
  logDocxDebug("generateReport called", {
    path: __filename,
    difyType: typeof difyOutput,
    hasFigures: Array.isArray(figureImages),
  })
  console.log("Loading DOCX template from:", TEMPLATE_PATH)

  try {
    const sanitized = sanitizeDeep(difyOutput)
    logDocxDebug("sanitizeDeep applied", {
      sanitizedType: typeof sanitized,
      hasExperiments: Boolean((sanitized as any)?.experiments),
    })
    const data = buildDocTemplateData(sanitized)
    const dataWithBlocks = buildBlocks(data)
    const dataWithImages = applyFigureImages(dataWithBlocks, figureImages)
    const serialized = toBase64Figures(dataWithImages)

    const buffer = await runPythonRenderer(serialized)
    return buffer
  } catch (error) {
    console.error("Failed to prepare/render docx template:", error)
    if (error instanceof Error) {
      throw error
    }
    throw new Error(String(error))
  }
}
