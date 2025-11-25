import PizZip from "pizzip"
import Docxtemplater from "docxtemplater"
import ImageModule from "docxtemplater-image-module"
import { readFile } from "node:fs/promises"
import path from "node:path"
import type { DocTemplateData, DocTemplateFigureImage } from "./template-data"
import { buildDocTemplateData } from "./template-data"

export { buildDocTemplateData } from "./template-data"

const DOCX_DEBUG = process.env.DOCX_DEBUG === "1"
const logDocxDebug = (...args: unknown[]) => {
  if (DOCX_DEBUG) {
    console.log("[legacy/docx/generator]", ...args)
  }
}

const TEMPLATE_PATH = path.join(process.cwd(), "templates", "chapter_fixed.docx")

export type GenerateReportInput = {
  title: string
  difyOutput: unknown
  figureImages?: DocTemplateFigureImage[]
}

type DocxtemplaterSubError = {
  properties?: {
    explanation?: string
  }
  message?: string
}

type DocxtemplaterError = {
  properties?: {
    errors?: DocxtemplaterSubError[]
  }
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

const isDocxtemplaterError = (value: unknown): value is DocxtemplaterError => {
  if (!value || typeof value !== "object") {
    return false
  }
  const properties = (value as Record<string, unknown>).properties
  if (!properties || typeof properties !== "object") {
    return false
  }
  const errors = (properties as Record<string, unknown>).errors
  return Array.isArray(errors)
}

export async function generateReport({ difyOutput, figureImages }: GenerateReportInput): Promise<Buffer> {
  logDocxDebug("generateReport called", {
    path: __filename,
    difyType: typeof difyOutput,
    hasFigures: Array.isArray(figureImages),
  })
  const templateBuffer = await readFile(TEMPLATE_PATH)

  try {
    const zip = new PizZip(templateBuffer)
    const imageModule = new ImageModule({
      centered: true,
      getImage(tagValue: unknown) {
        if (
          tagValue &&
          typeof tagValue === "object" &&
          "buffer" in tagValue &&
          tagValue.buffer instanceof Buffer
        ) {
          return tagValue.buffer
        }
        return Buffer.alloc(0)
      },
      getSize(_img: unknown, tagValue: unknown) {
        if (
          tagValue &&
          typeof tagValue === "object" &&
          "width" in tagValue &&
          "height" in tagValue
        ) {
          const { width, height } = tagValue as { width?: unknown; height?: unknown }
          if (typeof width === "number" && typeof height === "number") {
            const normalizedWidth = Number.isFinite(width) ? Math.max(1, Math.round(width)) : 320
            const normalizedHeight = Number.isFinite(height) ? Math.max(1, Math.round(height)) : 240
            return [normalizedWidth, normalizedHeight]
          }
        }
        return [320, 240]
      },
    })

    const doc = new Docxtemplater(zip, {
      paragraphLoop: true,
      linebreaks: true,
      modules: [imageModule],
    })

    const data = buildDocTemplateData(difyOutput)
    const dataWithImages = applyFigureImages(data, figureImages)

    // Docxtemplater v3 以降は setData が非推奨のため、render にデータを渡す新APIを使用する
    doc.render(dataWithImages)

    const buffer = doc.getZip().generate({ type: "nodebuffer" })
    return buffer
  } catch (error) {
    if (isDocxtemplaterError(error) && error.properties?.errors) {
      console.error("Docxtemplater MultiError details:")
      for (const err of error.properties.errors) {
        const explanation =
          err?.properties?.explanation ?? err?.message ?? (err ? JSON.stringify(err) : "Unknown error")
        console.error(`- ${explanation}`)
      }
    }
    console.error("Failed to prepare/render docx template:", error)
    if (error instanceof Error) {
      throw error
    }
    throw new Error(String(error))
  }
}
