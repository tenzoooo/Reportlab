import type { ExperimentDataRow } from "./types"

const inferChapterFromIntermediate = (intermediate: any, defaultChapter = 4) => {
  const methodChapter =
    typeof intermediate?.pdf?.method_chapter === "number"
      ? intermediate.pdf.method_chapter
      : Number(intermediate?.pdf?.method_chapter)
  if (Number.isFinite(methodChapter) && methodChapter) return Math.max(1, Math.floor(methodChapter) + 1)

  const discussionChapter =
    typeof intermediate?.pdf?.discussion_chapter === "number"
      ? intermediate.pdf.discussion_chapter
      : Number(intermediate?.pdf?.discussion_chapter)
  if (Number.isFinite(discussionChapter) && discussionChapter) return Math.max(1, Math.floor(discussionChapter) - 1)

  return defaultChapter
}

const experimentsHaveBlocks = (experiments: any[]) => {
  for (const exp of experiments) {
    const blocks = Array.isArray(exp?.blocks) ? exp.blocks : []
    if (blocks.length > 0) return true
  }
  return false
}

export const buildFallbackAnalysisFromIntermediate = (params: {
  intermediate: any
  reportId: string
  jobId: string
  assetsImages: Array<{ image_id: string; filename: string; upload_index: number }>
  tableFiles: ExperimentDataRow[]
  run: { status?: string; errors?: unknown; warnings?: unknown }
}) => {
  const { intermediate, reportId, jobId, assetsImages, tableFiles, run } = params

  const chapter = inferChapterFromIntermediate(intermediate, 4)
  const experimentsRaw = Array.isArray(intermediate?.experiments) ? intermediate.experiments : []
  const experiments = experimentsRaw.slice()

  if (experiments.length === 0 || !experimentsHaveBlocks(experiments)) {
    const blocks: any[] = []
    for (let i = 0; i < assetsImages.length; i += 1) {
      blocks.push({ type: "figure", figure: { label: "", caption: "", figure_image_id: "" } })
    }
    const tables = (tableFiles || []).filter((t) => t.file_url)
    for (let i = 0; i < tables.length; i += 1) {
      blocks.push({ type: "table", table: { label: "", caption: "" } })
    }
    experiments.push({
      idx: "1",
      subidx: "",
      name: "実験",
      method_summary: "",
      description_brief: "",
      quant_comment: "",
      blocks,
    })
  }

  const analysis: any = {
    chapter,
    chapter_plus_1: chapter + 1,
    chapter_plus_2: chapter + 2,
    experiments,
    consideration: intermediate?.consideration && typeof intermediate.consideration === "object" ? intermediate.consideration : { units: [] },
    summary: intermediate?.summary && typeof intermediate.summary === "object" ? intermediate.summary : {},
    __assets_images: assetsImages,
    image_order: assetsImages.map((i) => i.filename),
    __hitl: { mode: "prepare", prepared_at: new Date().toISOString(), step: 0 },
    __agent: {
      report_id: reportId,
      job_id: jobId,
      status: typeof run?.status === "string" ? run.status : "",
      errors: (run as any)?.errors || [],
      warnings: (run as any)?.warnings || [],
    },
  }

  relabelBlocksInAnalysis(analysis)
  return analysis
}

const safePreview = (value: unknown, maxLen: number) => {
  const s = typeof value === "string" ? value : ""
  if (!s) return ""
  if (s.length <= maxLen) return s
  return s.slice(0, maxLen) + "…"
}

export const hasReachedLLayer = (intermediate: any): boolean => {
  const markdownText = typeof intermediate?.markdown?.document?.text === "string" ? intermediate.markdown.document.text.trim() : ""
  if (markdownText.length > 0) return true
  const jsonPayload = intermediate?.artifacts?.json_bundle?.payload
  return Boolean(jsonPayload && typeof jsonPayload === "object")
}

export const buildAgentProgressPayload = (intermediate: any, jobId: string) => {
  const status = typeof intermediate?.status === "string" ? intermediate.status : ""
  const snapshots = Array.isArray(intermediate?.snapshots) ? intermediate.snapshots : []
  const lastStep = snapshots.length > 0 ? snapshots[snapshots.length - 1]?.step : ""

  const pdf = intermediate?.pdf || {}
  const experiments = Array.isArray(intermediate?.experiments) ? intermediate.experiments : []
  const methodTree = Array.isArray(intermediate?.method_tree) ? intermediate.method_tree : []
  const assetsImages = Array.isArray(intermediate?.assets_images) ? intermediate.assets_images : []
  const assetsTables = Array.isArray(intermediate?.assets_tables) ? intermediate.assets_tables : []
  const prompts = Array.isArray(pdf?.consideration_prompts) ? pdf.consideration_prompts : []
  const experimentUnits = Array.isArray(intermediate?.b_layer_bundle?.method?.experiment_units)
    ? intermediate.b_layer_bundle.method.experiment_units
    : []
  const experimentNames = experimentUnits
    .map((u: any) => {
      const expKey = typeof u?.exp_key === "string" ? u.exp_key : ""
      const title = typeof u?.title === "string" ? u.title : ""
      return expKey && title ? `${expKey} ${title}` : expKey || title
    })
    .filter((v: string) => Boolean(v))

  return {
    version: 1,
    job_id: jobId,
    status,
    reached_l_layer: hasReachedLLayer(intermediate),
    updated_at: new Date().toISOString(),
    last_step: typeof lastStep === "string" ? lastStep : "",
    snapshots: snapshots
      .map((s: any) => ({
        step: typeof s?.step === "string" ? s.step : "",
        storage_key: typeof s?.storage_key === "string" ? s.storage_key : "",
      }))
      .filter((s: any) => s.step),
    stats: {
      pdf_pages: typeof pdf?.pages === "number" ? pdf.pages : null,
      method_tree_count: methodTree.length,
      experiments_count: experiments.length,
      images_count: assetsImages.length,
      tables_count: assetsTables.length,
      prompts_count: prompts.length,
    },
    previews: {
      method_text: safePreview(pdf?.method_text, 1500),
      discussion_text: safePreview(pdf?.discussion_text, 1500),
      prompts: prompts.slice(0, 5).map((p: any) => safePreview(p, 200)).filter(Boolean),
      method_tree: methodTree
        .slice(0, 5)
        .map((m: any) => {
          const expKey = typeof m?.exp_key === "string" ? m.exp_key : ""
          const title = typeof m?.title === "string" ? m.title : ""
          return expKey && title ? `${expKey} ${title}` : expKey || title
        })
        .filter(Boolean),
      experiment_names: experimentNames.slice(0, 20),
    },
    ui: {
      phase: typeof intermediate?.job_meta?.ui_phase === "string" ? intermediate.job_meta.ui_phase : "",
      detail: typeof intermediate?.job_meta?.ui_detail === "string" ? intermediate.job_meta.ui_detail : "",
      current_experiment:
        typeof intermediate?.job_meta?.ui_current_experiment === "string" ? intermediate.job_meta.ui_current_experiment : "",
    },
  }
}

export const applyEditsToBlocks = (analysis: any) => {
  const experiments = Array.isArray(analysis?.experiments) ? analysis.experiments : []
  for (const exp of experiments) {
    const figures = Array.isArray(exp?.figures) ? exp.figures : []
    const tables = Array.isArray(exp?.tables) ? exp.tables : []
    const blocks = Array.isArray(exp?.blocks) ? exp.blocks : []

    const figCaptionByLabel = new Map<string, string>()
    for (const fig of figures) {
      if (!fig || typeof fig !== "object") continue
      const label = typeof fig.label === "string" ? fig.label : ""
      const caption = typeof fig.caption === "string" ? fig.caption : ""
      if (label) figCaptionByLabel.set(label, caption)
    }

    const tableCaptionByLabel = new Map<string, string>()
    for (const tbl of tables) {
      if (!tbl || typeof tbl !== "object") continue
      const label = typeof tbl.label === "string" ? tbl.label : ""
      const caption = typeof tbl.caption === "string" ? tbl.caption : ""
      if (label) tableCaptionByLabel.set(label, caption)
    }

    for (const block of blocks) {
      if (!block || typeof block !== "object") continue
      if (block.type === "figure" && block.figure && typeof block.figure === "object") {
        const label = typeof block.figure.label === "string" ? block.figure.label : ""
        const caption = figCaptionByLabel.get(label)
        if (typeof caption === "string") block.figure.caption = caption
      }
      if (block.type === "table" && block.table && typeof block.table === "object") {
        const label = typeof block.table.label === "string" ? block.table.label : ""
        const caption = tableCaptionByLabel.get(label)
        if (typeof caption === "string") block.table.caption = caption
      }
    }
  }
}

export const applyImageOrderToBlocks = (analysis: any) => {
  const order = Array.isArray(analysis?.image_order) ? analysis.image_order : []
  const assets = Array.isArray(analysis?.__assets_images) ? analysis.__assets_images : []
  if (order.length === 0 || assets.length === 0) return

  const idsByFilename = new Map<string, string[]>()
  for (const a of assets) {
    if (!a || typeof a !== "object") continue
    const imageId = typeof a.image_id === "string" ? a.image_id : ""
    const filename = typeof a.filename === "string" ? a.filename : ""
    if (!imageId || !filename) continue
    const list = idsByFilename.get(filename) || []
    list.push(imageId)
    idsByFilename.set(filename, list)
  }

  const figureBlocks: any[] = []
  const experiments = Array.isArray(analysis?.experiments) ? analysis.experiments : []
  for (const exp of experiments) {
    const blocks = Array.isArray(exp?.blocks) ? exp.blocks : []
    for (const b of blocks) {
      if (b && typeof b === "object" && b.type === "figure" && b.figure) figureBlocks.push(b)
    }
  }

  const n = Math.min(order.length, figureBlocks.length)
  for (let i = 0; i < n; i += 1) {
    const filename = order[i]
    const list = idsByFilename.get(filename) || []
    const imageId = list.shift()
    idsByFilename.set(filename, list)
    if (!imageId) continue
    const block = figureBlocks[i]
    if (block?.figure && typeof block.figure === "object") {
      block.figure.figure_image_id = imageId
    }
  }
}

export const relabelBlocksInAnalysis = (analysis: any) => {
  const chapter = typeof analysis?.chapter === "number" ? analysis.chapter : Number(analysis?.chapter) || 4
  const experiments = Array.isArray(analysis?.experiments) ? analysis.experiments : []

  for (const exp of experiments) {
    const idx = typeof exp?.idx === "string" ? exp.idx : exp?.idx != null ? String(exp.idx) : ""
    const subidx = typeof exp?.subidx === "string" ? exp.subidx : exp?.subidx != null ? String(exp.subidx) : ""
    const parts = [String(chapter).trim(), idx.trim(), subidx.trim()].filter((p) => p)
    const pathValue = parts.join(".")

    let figSeq = 1
    let tblSeq = 1
    const blocks = Array.isArray(exp?.blocks) ? exp.blocks : []
    for (const block of blocks) {
      if (!block || typeof block !== "object") continue
      if (block.type === "figure" && block.figure && typeof block.figure === "object") {
        block.figure.label = `図 ${pathValue}.${figSeq}`
        figSeq += 1
      } else if (block.type === "table" && block.table && typeof block.table === "object") {
        block.table.label = `表 ${pathValue}.${tblSeq}`
        tblSeq += 1
      }
    }

    exp.figures = blocks.filter((b: any) => b?.type === "figure").map((b: any) => b.figure)
    exp.tables = blocks.filter((b: any) => b?.type === "table").map((b: any) => b.table)
  }
}
