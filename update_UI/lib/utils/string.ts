/**
 * Shared string sanitization utilities.
 *
 * Previously duplicated in:
 *   - lib/analysis/service.ts
 *   - lib/docx/generator.ts
 */

export const decodeAndStripTags = (value: string): string => {
  const decoded = value.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&")
  return decoded.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
}

export const sanitizeDeep = (input: unknown): unknown => {
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
