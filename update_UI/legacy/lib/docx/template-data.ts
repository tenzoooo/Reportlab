import type { Buffer } from "node:buffer"

export type DocTemplateTable = {
  label: string
  caption: string
  rows?: string[][]
}

export type DocTemplateFigureImage = {
  buffer: Buffer
  width: number
  height: number
}

export type DocTemplateFigure = {
  label: string
  caption: string
  figure_image?: DocTemplateFigureImage
}

export type DocTemplateExperiment = {
  idx: number
  subidx?: string
  name: string
  description_brief: string
  tables: DocTemplateTable[]
  figures: DocTemplateFigure[]
  blocks?: DocTemplateBlock[]
  quant_comment: string
}

export type DocTemplateBlock =
  | { type: "table"; table: DocTemplateTable }
  | { type: "figure"; figure: DocTemplateFigure }

export type DocTemplateConsiderationUnit = {
  index: string
  discussion_active: string
  answer?: string
}

export type DocTemplateConsideration = {
  units: DocTemplateConsiderationUnit[]
  reference_list_formatted: string[]
  references: Array<{ id?: string; title?: string; year?: string }>
}

export type DocTemplateData = {
  chapter: number
  chapter_plus_1: number
  chapter_plus_2: number
  experiments: DocTemplateExperiment[]
  consideration: DocTemplateConsideration
  considerations: DocTemplateConsiderationUnit[]
  summary: string
  references: string[]
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

const toStringSafe = (value: unknown): string => {
  if (typeof value === "string") return value
  if (typeof value === "number" || typeof value === "boolean") return String(value)
  return ""
}

const toNumber = (value: unknown, fallback = 0): number => {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value === "string") {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return fallback
}

const toNullableString = (value: unknown): string | undefined => {
  const result = toStringSafe(value)
  return result ? result : undefined
}

const normalizeExperiments = (value: unknown) => {
  let chapter = 1
  let list: unknown[] = []
  if (isRecord(value)) {
    chapter = toNumber(value.chapter, 1)
    list = Array.isArray(value.experiments) ? value.experiments : []
  } else if (Array.isArray(value)) {
    chapter = 1
    list = value
  } else {
    return { chapter: 1, experiments: [] as DocTemplateExperiment[] }
  }

  return {
    chapter,
    experiments: list
      .map((item) => {
        if (!isRecord(item)) return null
        const idx = toNumber(item.idx, undefined as unknown as number)
        if (!Number.isFinite(idx)) return null

        const subidxValue = toStringSafe(item.subidx)
        const subidx = subidxValue ? subidxValue : undefined

        const tables = Array.isArray(item.tables)
          ? (item.tables
              .map((entry) =>
                isRecord(entry)
                  ? {
                      label: toStringSafe(entry.label),
                      caption: toStringSafe(entry.caption),
                      rows: Array.isArray(entry.rows)
                        ? (entry.rows
                            .map((r) => (Array.isArray(r) ? r.map((cell) => toStringSafe(cell)) : null))
                            .filter(Boolean) as string[][])
                        : undefined,
                    }
                  : null
              )
              .filter(Boolean) as DocTemplateTable[])
          : []

        const figures = Array.isArray(item.figures)
          ? (item.figures
              .map((entry) =>
                isRecord(entry)
                  ? { label: toStringSafe(entry.label), caption: toStringSafe(entry.caption) }
                  : null
              )
              .filter(Boolean) as DocTemplateFigure[])
          : []

        return {
          idx,
          subidx,
          name: toStringSafe(item.name),
          description_brief: toStringSafe(item.description_brief),
          tables,
          figures,
          quant_comment: "",
        }
      })
      .filter(Boolean) as DocTemplateExperiment[],
  }
}

const normalizeConsideration = (value: unknown): DocTemplateConsideration => {
  if (!isRecord(value)) {
    return {
      units: [],
      reference_list_formatted: [],
      references: [],
    }
  }

  const unitsRaw = Array.isArray(value.units) ? value.units : []
  const units = unitsRaw
    .map((unit) => {
      if (!isRecord(unit)) return null
      const index = toStringSafe(unit.index)
      const discussionActive = toStringSafe(unit.discussion_active)
      if (!index && !discussionActive) return null
      return {
        index,
        discussion_active: discussionActive,
        answer: toNullableString(unit.answer),
      }
    })
    .filter(Boolean) as DocTemplateConsiderationUnit[]

  const referenceListFormatted = Array.isArray(value.reference_list_formatted)
    ? value.reference_list_formatted.map(toStringSafe).filter(Boolean)
    : []

  const referencesRaw = Array.isArray(value.references) ? value.references : []
  const references = referencesRaw
    .map((ref) => {
      if (!isRecord(ref)) return null
      const id = toStringSafe(ref.id)
      const title = toStringSafe(ref.title)
      const referenceRecord = ref as Record<string, unknown>
      const year = toStringSafe(referenceRecord["year"]) || toStringSafe(referenceRecord["date"])
      if (!id && !title) return null
      return { id, title, year }
    })
    .filter(Boolean) as Array<{ id?: string; title?: string; year?: string }>

  return { units, reference_list_formatted: referenceListFormatted, references }
}

const normalizeReferences = (value: unknown): string[] => {
  if (!isRecord(value)) return []

  const formatted = Array.isArray(value.reference_list_formatted)
    ? value.reference_list_formatted.map(toStringSafe).filter(Boolean)
    : []

  if (formatted.length > 0) {
    return formatted
  }

  const references = Array.isArray(value.references) ? value.references : []
  return references
    .map((ref) => {
      if (!isRecord(ref)) return null
      const id = toStringSafe(ref.id)
      const title = toStringSafe(ref.title)
      if (!id && !title) return null
      const referenceRecord = ref as Record<string, unknown>
      const yearOrDate = toStringSafe(referenceRecord["year"]) || toStringSafe(referenceRecord["date"])
      return `[${id}] ${title}${yearOrDate ? ` ${yearOrDate}` : ""}`
    })
    .filter(Boolean) as string[]
}

const normalizeSummary = (value: unknown): string => {
  const summary = toStringSafe(value)
  return summary || "AIによるサマリーは現在準備中です。"
}

export const buildDocTemplateData = (difyOutput: unknown): DocTemplateData => {
  const raw = isRecord(difyOutput) ? difyOutput : {}

  const experimentValue = raw["experiment"]
  const experimentsValue = Array.isArray(raw["experiments"]) ? (raw["experiments"] as unknown[]) : undefined
  const experimentSource = isRecord(experimentValue)
    ? experimentValue
    : experimentsValue
      ? { chapter: raw["chapter"], experiments: experimentsValue }
      : {}

  let considerationSource: unknown = raw["consideration"]
  if (!isRecord(considerationSource) && experimentsValue) {
    const candidate = experimentsValue.find(
      (item) => isRecord(item) && Array.isArray((item as Record<string, unknown>)["units"])
    )
    if (candidate) considerationSource = candidate
  }

  let summarySource: unknown = raw["summary"]
  if (!summarySource && experimentsValue) {
    const candidate = experimentsValue.find(
      (item) => isRecord(item) && Object.prototype.hasOwnProperty.call(item, "summary")
    )
    if (candidate && isRecord(candidate)) {
      summarySource = candidate["summary"]
    }
  }

  const experiment = normalizeExperiments(experimentSource)
  const considerationNormalized = normalizeConsideration(considerationSource)
  const references = normalizeReferences(considerationSource)

  return {
    chapter: experiment.chapter,
    chapter_plus_1: experiment.chapter + 1,
    chapter_plus_2: experiment.chapter + 2,
    experiments: experiment.experiments,
    consideration: {
      units: considerationNormalized.units,
      reference_list_formatted:
        considerationNormalized.reference_list_formatted.length > 0
          ? considerationNormalized.reference_list_formatted
          : references,
      references: considerationNormalized.references,
    },
    considerations: considerationNormalized.units,
    summary: normalizeSummary(summarySource),
    references: references.length > 0 ? references : ["（参考文献の記載なし）"],
  }
}
