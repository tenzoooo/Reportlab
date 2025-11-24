
const isRecord = (value) =>
    typeof value === "object" && value !== null && !Array.isArray(value)

const toStringSafe = (value) => {
    if (typeof value === "string") return value
    if (typeof value === "number" || typeof value === "boolean") return String(value)
    return ""
}

const removeLonelyNumberLines = (value) => {
    const lines = value.split(/\r?\n/)
    const filtered = lines.filter((line) => !/^\s*\d+(?:\.\d+)?\s*$/.test(line.trim()))
    return filtered.join("\n")
}

const toNumber = (value, fallback = 0) => {
    if (typeof value === "number" && Number.isFinite(value)) return value
    if (typeof value === "string") {
        const parsed = Number(value)
        if (Number.isFinite(parsed)) return parsed
    }
    return fallback
}

const toNullableString = (value) => {
    const result = toStringSafe(value)
    return result ? result : undefined
}

const normalizeExperiments = (value) => {
    let chapter = 1
    let list = []
    if (isRecord(value)) {
        chapter = toNumber(value.chapter, 1)
        list = Array.isArray(value.experiments) ? value.experiments : []
    } else if (Array.isArray(value)) {
        chapter = 1
        list = value
    } else {
        return { chapter: 1, experiments: [] }
    }

    return {
        chapter,
        experiments: list
            .map((item) => {
                if (!isRecord(item)) return null
                const idx = toNumber(item.idx, undefined)
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
                                            .filter(Boolean))
                                        : undefined,
                                }
                                : null
                        )
                        .filter(Boolean))
                    : []

                const figures = Array.isArray(item.figures)
                    ? (item.figures
                        .map((entry) =>
                            isRecord(entry)
                                ? { label: toStringSafe(entry.label), caption: toStringSafe(entry.caption) }
                                : null
                        )
                        .filter(Boolean))
                    : []

                return {
                    idx,
                    subidx,
                    name: removeLonelyNumberLines(toStringSafe(item.name)),
                    description_brief: removeLonelyNumberLines(toStringSafe(item.description_brief)),
                    tables,
                    figures,
                    quant_comment: "",
                }
            })
            .filter(Boolean),
    }
}

const normalizeConsideration = (value) => {
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
                index: removeLonelyNumberLines(index),
                discussion_active: removeLonelyNumberLines(discussionActive),
                answer: toNullableString(unit.answer) ? removeLonelyNumberLines(toNullableString(unit.answer)) : undefined,
            }
        })
        .filter(Boolean)

    const referenceListFormatted = Array.isArray(value.reference_list_formatted)
        ? value.reference_list_formatted.map(toStringSafe).filter(Boolean)
        : []

    const referencesRaw = Array.isArray(value.references) ? value.references : []
    const references = referencesRaw
        .map((ref) => {
            if (!isRecord(ref)) return null
            const id = toStringSafe(ref.id)
            const title = toStringSafe(ref.title)
            const referenceRecord = ref
            const year = toStringSafe(referenceRecord["year"]) || toStringSafe(referenceRecord["date"])
            if (!id && !title) return null
            return { id, title, year }
        })
        .filter(Boolean)

    return { units, reference_list_formatted: referenceListFormatted, references }
}

const normalizeReferences = (value) => {
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
            const referenceRecord = ref
            const yearOrDate = toStringSafe(referenceRecord["year"]) || toStringSafe(referenceRecord["date"])
            return `[${id}] ${title}${yearOrDate ? ` ${yearOrDate}` : ""}`
        })
        .filter(Boolean)
}

const normalizeSummary = (value) => {
    const summary = removeLonelyNumberLines(toStringSafe(value))
    return summary || "AIによるサマリーは現在準備中です。"
}

const buildDocTemplateData = (difyOutput) => {
    const raw = isRecord(difyOutput) ? difyOutput : {}

    const experimentValue = raw["experiment"]
    let experimentsValue = Array.isArray(raw["experiments"]) ? raw["experiments"] : undefined

    // Fallback: check if experiments are nested inside consideration
    if (!experimentsValue && !experimentValue && isRecord(raw["consideration"])) {
        const nestedExperiments = raw["consideration"]["experiments"]
        if (Array.isArray(nestedExperiments)) {
            experimentsValue = nestedExperiments
        }
    }

    const experimentSource = isRecord(experimentValue)
        ? experimentValue
        : experimentsValue
            ? { chapter: raw["chapter"], experiments: experimentsValue }
            : {}

    let considerationSource = raw["consideration"]

    // Fallback: check if consideration fields are at the root
    if (!considerationSource && Array.isArray(raw["units"])) {
        considerationSource = raw
    }

    if (!isRecord(considerationSource) && experimentsValue) {
        const candidate = experimentsValue.find(
            (item) => isRecord(item) && Array.isArray(item["units"])
        )
        if (candidate) considerationSource = candidate
    }

    let summarySource = raw["summary"]
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

// TEST CASE
const sampleJson = {
    "units": [
        {
            "index": 1,
            "discussion_active": "Test Discussion 1",
            "answer": "Test Answer 1"
        },
        {
            "index": 2,
            "discussion_active": "Test Discussion 2"
        }
    ],
    "chapter": 5,
    "summary": "Test Summary",
    "experiments": [
        {
            "idx": 1,
            "name": "Test Experiment",
            "tables": [],
            "figures": []
        }
    ]
}

const result = buildDocTemplateData(sampleJson)

console.log("Experiments count:", result.experiments.length)
console.log("Consideration units count:", result.consideration.units.length)
console.log("Considerations array count:", result.considerations.length)
console.log("First unit discussion:", result.considerations[0]?.discussion_active)

if (result.experiments.length === 0) {
    console.log("FAIL: Experiments are empty!")
    process.exit(1)
} else {
    console.log("SUCCESS: Experiments found.")
}
