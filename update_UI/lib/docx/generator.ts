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

const TEMPLATE_PATH = path.join(process.cwd(), "templates", "chapter_fixed.docx")
const PY_RENDERER_PATH = path.join(process.cwd(), "lib", "docx", "render_with_docxtpl.py")

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
      if (!figure.figure_image) return figure
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
  const workdir = await mkdtemp(path.join(tmpdir(), "docxtpl-"))
  const payload = {
    template_path: TEMPLATE_PATH,
    output_path: path.join(workdir, "output.docx"),
    context,
  }

  await writeFile(path.join(workdir, "payload.json"), JSON.stringify(payload), "utf-8")

  await new Promise<void>((resolve, reject) => {
    const child = spawn("python3", [PY_RENDERER_PATH], {
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
  console.log("Loading DOCX template from:", TEMPLATE_PATH)

  try {
    const data = buildDocTemplateData(difyOutput)
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
